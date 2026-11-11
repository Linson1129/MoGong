"""Compile and validation endpoints.

``/api/compile`` is the product's reason to exist: a drawing goes in, agent-readable layout
description comes out. Implemented in M4 with the full inference pipeline.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import ConfigDict

from app.core.deps import get_compiled_dir, get_repository
from app.schemas.base import CamelModel
from app.schemas.document import MoGongDocument
from app.schemas.layout import LayoutDocument
from app.services.compiler import CompileError, compile_document
from app.services.storage import LayoutRepository
from app.services.validate import Problem, ProblemLevel, check_document

router = APIRouter(prefix="/api/compile", tags=["compile"])


class ProblemView(CamelModel):
    """Wire shape for a validation finding. An enum is flattened to its string value."""

    model_config = ConfigDict(extra="forbid")

    code: str
    level: str
    elements: list[str]
    message: str


class ValidationResponse(CamelModel):
    model_config = ConfigDict(extra="forbid")

    valid: bool
    element_count: int
    problems: list[ProblemView]


class CompileResponse(CamelModel):
    model_config = ConfigDict(extra="forbid")

    layout: LayoutDocument
    written_to: str | None = None


def _to_view(problem: Problem) -> ProblemView:
    return ProblemView(
        code=problem.code.value,
        level=problem.level.value,
        elements=list(problem.elements),
        message=problem.message,
    )


@router.post("/validate", response_model=ValidationResponse)
def validate_document(document: MoGongDocument) -> ValidationResponse:
    """Pre-flight check on a drawing. Writes nothing.

    The editor calls this live so an ambiguous drawing is surfaced while the user can still fix
    it, rather than after the agent has already built the wrong page.
    """
    problems = check_document(document)
    # Only findings at WARNING or above make a drawing unsafe to hand to an agent; INFO is
    # guidance the caller can acknowledge or ignore.
    blocking = [p for p in problems if p.level is not ProblemLevel.INFO]
    return ValidationResponse(
        valid=not blocking,
        element_count=len(document.elements),
        problems=[_to_view(problem) for problem in problems],
    )


@router.post("", response_model=CompileResponse)
def compile_layout(
    document: MoGongDocument,
    repository: LayoutRepository = Depends(get_repository),
    compiled_dir: Path = Depends(get_compiled_dir),
) -> CompileResponse:
    """Compile a document into the agent-facing layout JSON.

    Runs the full inference pipeline: nesting tree, layout modes, roles, spacing,
    relative coordinates. Returns warnings for ambiguous drawings rather than
    guessing silently.
    """
    try:
        layout = compile_document(document)
    except CompileError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"message": f"Compilation failed: {exc}"},
        ) from exc

    path = repository.save_compiled(document.meta.id, layout.model_dump(mode="json"), compiled_dir)
    return CompileResponse(layout=layout, written_to=str(path))
