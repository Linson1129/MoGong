"""Compiled format schema: the agent-facing artifact, ``*.layout.json``.

Mirrors docs/json-schema.md section 2. This is what the consuming agent reads, paired with
the mogong-layout Skill: the artifact carries the measurements, the Skill carries what to
build from them.

Two structural differences from the document format, both deliberate:

* Geometry is relative to the parent, in percent. A pixel width becomes a liability the moment
  the agent chooses a different container size; a percentage survives the translation to CSS.
* Elements form a tree. The document keeps nesting implicit in geometry so it cannot go stale
  during editing; the compiler resolves it once, here, where the agent needs it explicit.
"""

from __future__ import annotations

from enum import Enum

from pydantic import ConfigDict, Field

from app.schemas.base import CamelModel
from app.schemas.document import Border

PERCENT_TOTAL = 100.0
# Percentages are rounded to 2 decimals before being stored here. Sub-pixel precision in a
# hand-drawn rectangle is jitter, not intent, and exposing it invites false exactness downstream.
PERCENT_PRECISION = 2


class LayoutMode(str, Enum):
    """How a container's children are arranged. Inferred, never drawn.

    See docs/json-schema.md 4.2.

    This is the highest-value field in the output: it is the structural decision the user could
    previously only wish for.
    """

    NONE = "none"
    ROW = "row"
    COLUMN = "column"
    STACK = "stack"
    FREE = "free"


class ElementRole(str, Enum):
    """Semantic guess for an element. A hint the consuming agent may override at no cost."""

    NAVIGATION = "navigation"
    CONTENTINFO = "contentinfo"
    MAIN = "main"
    REGION = "region"
    CONTAINER = "container"
    BUTTON = "button"
    TEXT = "text"
    IMAGE = "image"
    BLOCK = "block"


class BoxUnit(str, Enum):
    PERCENT = "%"


class Box(CamelModel):
    """Relative geometry as a percentage of the parent element."""

    model_config = ConfigDict(extra="forbid")

    x: float
    y: float
    width: float
    height: float
    unit: BoxUnit = BoxUnit.PERCENT

    def rounded(self) -> Box:
        return Box(
            x=round(self.x, PERCENT_PRECISION),
            y=round(self.y, PERCENT_PRECISION),
            width=round(self.width, PERCENT_PRECISION),
            height=round(self.height, PERCENT_PRECISION),
        )


class SpacingInfo(CamelModel):
    """Measured gap between adjacent siblings, so spacing is data instead of a guess."""

    model_config = ConfigDict(extra="forbid")

    axis: LayoutMode
    gap: float = Field(ge=0.0)
    unit: BoxUnit = BoxUnit.PERCENT
    consistent: bool = True


class AlignInfo(CamelModel):
    """Edge or center alignment shared by all children of a node, within a pixel tolerance."""

    model_config = ConfigDict(extra="forbid")

    horizontal: str | None = None
    vertical: str | None = None
    tolerance_px: float = 2.0


class StyleInfo(CamelModel):
    """Visual style. ``border`` is ``None`` when absent rather than a zero-width border, so the
    agent reads a real absence instead of having to interpret a sentinel value."""

    model_config = ConfigDict(extra="forbid")

    fill: str | None = None
    fill_opacity: float = 1.0
    border: Border | None = None


class LayoutWarningCode(str, Enum):
    PARTIAL_OVERLAP = "PARTIAL_OVERLAP"
    AMBIGUOUS_LAYOUT = "AMBIGUOUS_LAYOUT"
    INCONSISTENT_GAP = "INCONSISTENT_GAP"
    OFF_CANVAS = "OFF_CANVAS"
    EMPTY_DOCUMENT = "EMPTY_DOCUMENT"
    ELEMENT_DROPPED = "ELEMENT_DROPPED"


class LayoutWarning(CamelModel):
    """An inference the compiler could not resolve cleanly.

    Warnings are the mechanism that keeps MoGong honest. When a drawing is ambiguous the compiler
    says so instead of guessing silently -- a confident wrong answer is the exact failure mode the
    product exists to eliminate, so it must never be reintroduced by the compiler itself.
    """

    model_config = ConfigDict(extra="forbid")

    code: LayoutWarningCode
    elements: list[str] = Field(default_factory=list)
    message: str


class LayoutNode(CamelModel):
    """One node of the compiled tree."""

    model_config = ConfigDict(extra="forbid")

    id: str
    name: str = ""
    role: ElementRole = ElementRole.BLOCK
    box: Box
    layout: LayoutMode = LayoutMode.NONE
    style: StyleInfo = Field(default_factory=StyleInfo)
    note: str | None = None
    spacing: SpacingInfo | None = None
    align: AlignInfo | None = None
    children: list[LayoutNode] = Field(default_factory=list)

    def iter_ids(self) -> list[str]:
        """Depth-first list of every element id in this subtree, including this node."""
        collected = [self.id]
        for child in self.children:
            collected.extend(child.iter_ids())
        return collected


class CanvasSummary(CamelModel):
    model_config = ConfigDict(extra="forbid")

    width: float
    height: float
    background: str = "#FFFFFF"
    platform: str = "web-desktop"


class LayoutMeta(CamelModel):
    model_config = ConfigDict(extra="forbid")

    name: str = "untitled"
    source: str = "MoGong"
    generated_at: str | None = None


class LayoutDocument(CamelModel):
    """Top-level compiled format, the on-disk shape of ``*.layout.json``.

    The "no element was silently dropped" invariant is *not* enforced here: checking it requires
    the source document, and giving this model that reference would make the compiled format
    depend on the editing format. It lives in app.services.validate instead, where both sides are
    in scope and the check can fail with a message naming the elements.
    """

    model_config = ConfigDict(extra="forbid")

    format: str = "mogong.layout"
    version: str = "1.0"
    meta: LayoutMeta = Field(default_factory=LayoutMeta)
    canvas: CanvasSummary
    root: LayoutNode
    warnings: list[LayoutWarning] = Field(default_factory=list)

    def element_ids(self) -> set[str]:
        """Every id in the tree. ``root`` is the synthetic page frame, not a drawn element."""
        return set(self.root.iter_ids()) - {self.root.id}


LayoutNode.model_rebuild()
