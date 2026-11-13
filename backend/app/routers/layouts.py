"""Layout persistence endpoints.

Create, read, update, delete, and list. No auth and no multi-tenancy: MoGong is a single-user
local tool, and inventing an account system for one would be cost with no benefit.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Response, status
from pydantic import ConfigDict

from app.core.deps import get_repository
from app.schemas.base import CamelModel
from app.schemas.document import MoGongDocument
from app.services.storage import (
    InvalidLayoutIdError,
    LayoutNotFoundError,
    LayoutRepository,
    StorageError,
)

router = APIRouter(prefix="/api/layouts", tags=["layouts"])

LOGGER = logging.getLogger(__name__)


class LayoutSummary(CamelModel):
    """List projection. Returning whole documents for a file picker wastes the payload."""

    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    element_count: int
    canvas_width: float
    canvas_height: float


class LayoutListResponse(CamelModel):
    model_config = ConfigDict(extra="forbid")

    items: list[LayoutSummary]
    total: int


def _summarize(document: MoGongDocument) -> LayoutSummary:
    return LayoutSummary(
        id=document.meta.id,
        name=document.meta.name,
        element_count=len(document.elements),
        canvas_width=document.canvas.width,
        canvas_height=document.canvas.height,
    )


@router.get("", response_model=LayoutListResponse)
def list_layouts(repository: LayoutRepository = Depends(get_repository)) -> LayoutListResponse:
    items: list[LayoutSummary] = []
    for layout_id in repository.list_ids():
        # A single unreadable file should not blank the whole list: skipping it keeps every other
        # layout reachable, and the user can find the broken one by its absence.
        try:
            items.append(_summarize(repository.load(layout_id)))
        except (LayoutNotFoundError, InvalidLayoutIdError, StorageError) as exc:
            # Named on purpose rather than bare. `except Exception` was swallowing TypeError and
            # AttributeError here too, so a bug in this handler looked exactly like a corrupt file:
            # a list that is quietly shorter than the directory, with nothing written down.
            LOGGER.warning("skipping unreadable layout %s: %s", layout_id, exc)
            continue
    return LayoutListResponse(items=items, total=len(items))


@router.post("", response_model=MoGongDocument, status_code=status.HTTP_201_CREATED)
def create_layout(
    document: MoGongDocument,
    repository: LayoutRepository = Depends(get_repository),
) -> MoGongDocument:
    """Store a new document. 409 if the id is taken, so a save never silently overwrites work."""
    if repository.exists(document.meta.id):
        raise StorageError(f"layout {document.meta.id!r} already exists; use PUT to overwrite it")
    repository.save(document)
    return document


@router.get("/{layout_id}", response_model=MoGongDocument)
def get_layout(
    layout_id: str,
    repository: LayoutRepository = Depends(get_repository),
) -> MoGongDocument:
    return repository.load(layout_id)


@router.put("/{layout_id}", response_model=MoGongDocument)
def put_layout(
    layout_id: str,
    document: MoGongDocument,
    repository: LayoutRepository = Depends(get_repository),
) -> MoGongDocument:
    """Overwrite a document. Creating via PUT is allowed: the editor autosaves and should not
    have to know whether this particular id has been written before."""
    if document.meta.id != layout_id:
        raise InvalidLayoutIdError(
            f"path id {layout_id!r} does not match body id {document.meta.id!r}"
        )
    repository.save(document)
    return document


@router.delete("/{layout_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_layout(
    layout_id: str,
    repository: LayoutRepository = Depends(get_repository),
) -> Response:
    repository.delete(layout_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
