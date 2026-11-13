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
    # Filename under the server's configured compiled directory, not a path. See compile_layout.
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

    Nothing in the shipped editor calls this: the drawing lives in localStorage and is compiled on
    export, so the problems a drawing carries reach the user inside the artifact's warnings rather
    than as a live readout. The route is kept because the smoke test and any scripted check need a
    way to ask the question without taking the write, and because a live readout is a frontend
    feature waiting for a decision, not a decision already made. Saying "the editor calls this
    live" here would have been a docstring describing an unbuilt feature, which is how a missing
    screen survives every review that reads it.
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
    # The name, never `str(path)`. A full path leaks where the application lives on its host, and
    # the toolbar echoes this value straight back to whoever is watching. On a shared deployment
    # that is a disclosure with no reader benefit, because the contract already fixes the location:
    # `{id}.layout.json` inside the compiled directory the docs name.
    return CompileResponse(layout=layout, written_to=path.name)
