"""Structural validation of a document, independent of compilation.

Two distinct jobs share this module's name and should not be confused:

* :func:`check_document` validates what the user drew. It runs live in the editor as a pre-flight
  check and is available in M1.
* The tree-versus-document invariant -- every drawn element must surface in the compiled output,
  either in the tree or in a warning -- arrives in M4 as :func:`assert_no_element_dropped`.

Keeping them apart matters because the first is advisory feedback and the second is a hard
correctness gate that must fail a build, not a drawing.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import TYPE_CHECKING

from app.models.geometry import EPSILON, Rect
from app.schemas.document import Element, MoGongDocument

if TYPE_CHECKING:
    from app.schemas.layout import LayoutDocument, LayoutWarning


class ProblemLevel(Enum):
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"


class ProblemCode(Enum):
    ELEMENT_OFF_CANVAS = "ELEMENT_OFF_CANVAS"
    ELEMENT_TOO_SMALL = "ELEMENT_TOO_SMALL"
    DUPLICATE_GEOMETRY = "DUPLICATE_GEOMETRY"
    EMPTY_DOCUMENT = "EMPTY_DOCUMENT"
    PARTIAL_OVERLAP = "PARTIAL_OVERLAP"


@dataclass(frozen=True, slots=True)
class Problem:
    """One validation finding, shaped like a layout warning so the editor renders both alike."""

    code: ProblemCode
    level: ProblemLevel
    elements: tuple[str, ...]
    message: str


def _rect_of(element: Element) -> Rect:
    return Rect(element.x, element.y, element.width, element.height)


def check_document(document: MoGongDocument) -> list[Problem]:
    """Report structural problems in a drawing.

    Deliberately non-destructive and non-blocking: MoGong's users are drawing, not authoring
    markup, and refusing to accept a rectangle mid-gesture would make the tool hostile. Findings
    are returned for display; the drawing is never altered on the user's behalf.
    """
    problems: list[Problem] = []
    canvas = Rect(0, 0, document.canvas.width, document.canvas.height)

    if not document.elements:
        problems.append(
            Problem(
                code=ProblemCode.EMPTY_DOCUMENT,
                level=ProblemLevel.INFO,
                elements=(),
                message="The canvas is empty, so compiling would produce a page with no regions.",
            )
        )
        return problems

    for element in document.elements:
        rect = _rect_of(element)

        # Off-canvas elements still compile and still occupy space in the model, so this is a
        # warning rather than an error. Silent inclusion would be worse: the user would not
        # understand where the unexpected region came from.
        if not canvas.contains(rect):
            problems.append(
                Problem(
                    code=ProblemCode.ELEMENT_OFF_CANVAS,
                    level=ProblemLevel.WARNING,
                    elements=(element.id,),
                    message=(
                        f"{element.name or element.id} extends outside the "
                        f"{int(canvas.width)} x {int(canvas.height)} canvas."
                    ),
                )
            )

        # Anything under 2 pixels is almost always an accidental click-drag rather than a region,
        # and it survives compilation as a percentage so small the agent will round it away.
        if element.width < 2 or element.height < 2:
            problems.append(
                Problem(
                    code=ProblemCode.ELEMENT_TOO_SMALL,
                    level=ProblemLevel.WARNING,
                    elements=(element.id,),
                    message=(
                        f"{element.name or element.id} is "
                        f"{int(element.width)} x {int(element.height)} px and may be accidental."
                    ),
                )
            )

    problems.extend(_check_duplicate_geometry(document))
    return problems


def _check_duplicate_geometry(document: MoGongDocument) -> list[Problem]:
    """Flag two elements drawn at exactly the same place.

    Perfect duplicates are a drawing accident, not a design: they produce a node and an identical
    sibling, which the compiler would then have to arbitrate as nesting at equal area.
    """
    problems: list[Problem] = []
    by_geometry: dict[tuple[float, float, float, float], list[str]] = {}
    for element in document.elements:
        key = (
            round(element.x, 6),
            round(element.y, 6),
            round(element.width, 6),
            round(element.height, 6),
        )
        by_geometry.setdefault(key, []).append(element.id)

    for ids in by_geometry.values():
        if len(ids) > 1:
            problems.append(
                Problem(
                    code=ProblemCode.DUPLICATE_GEOMETRY,
                    level=ProblemLevel.WARNING,
                    elements=tuple(ids),
                    message=(
                        f"{len(ids)} elements occupy exactly the same rectangle "
                        f"({', '.join(ids)}); one is probably redundant."
                    ),
                )
            )
    return problems


def overlaps_partially(document: MoGongDocument) -> list[tuple[str, str]]:
    """Pairs of elements in the invalid partial-overlap state from docs/spec.md section 5.

    Exposed as its own function because the editor needs it on every drag for the soft warning,
    while the compiler needs the same result to decide sibling relationships. One definition keeps
    the preview and the export from disagreeing about what a drawing means.
    """
    elements = document.elements
    pairs: list[tuple[str, str]] = []
    for index, left in enumerate(elements):
        left_rect = _rect_of(left)
        for right in elements[index + 1 :]:
            if left_rect.partially_overlaps(_rect_of(right)):
                pairs.append((left.id, right.id))
    return pairs


def is_degenerate(width: float, height: float) -> bool:
    """True when an extent carries no area. Mirrors the Element schema check, for live previews."""
    return width <= EPSILON or height <= EPSILON


def assert_no_element_dropped(
    document: MoGongDocument,
    layout: "LayoutDocument",
) -> list["LayoutWarning"]:
    """Core invariant: every document element must appear in the compiled tree.

    This is the check that turns a whole class of compiler bug into a test failure instead of
    a user discovering that a rectangle they drew vanished from the JSON. It is cheap to assert
    and it is the first test written for the compiler, not the last.

    Args:
        document: The source document with all drawn elements.
        layout: The compiled layout output.

    Returns:
        List of ELEMENT_DROPPED warnings for any elements that vanished.
        Empty list means the compilation preserved all elements.
    """
    from app.schemas.layout import LayoutWarning, LayoutWarningCode

    document_ids = {element.id for element in document.elements}
    layout_ids = layout.element_ids()  # Excludes the synthetic root

    dropped = document_ids - layout_ids

    warnings: list[LayoutWarning] = []
    for element_id in sorted(dropped):
        element = document.get_element(element_id)
        name = element.name if element and element.name else element_id
        warnings.append(
            LayoutWarning(
                code=LayoutWarningCode.ELEMENT_DROPPED,
                elements=[element_id],
                message=(
                    f"Element '{name}' ({element_id}) was in the document but did not "
                    f"surface in the compiled tree. This indicates a compiler bug."
                ),
            )
        )

    return warnings
