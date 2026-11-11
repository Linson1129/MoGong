"""Relative coordinate conversion: absolute pixels to parent percentages.

A pixel width becomes a liability the moment the consuming agent picks a different container
size; a percentage survives the translation to CSS. The document stores absolute pixels because
that is what the user draws; the compiler converts because that is what the agent needs.

See docs/json-schema.md section 3.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.models.geometry import Rect
from app.schemas.layout import PERCENT_PRECISION, Box

if TYPE_CHECKING:
    from app.services.nesting import TreeNode


def to_percent_box(node_rect: Rect, parent_rect: Rect) -> Box:
    """Convert absolute pixel rect to a percentage Box relative to parent.

    The returned Box values are percentages of parent dimensions:
    - x: percent from parent's left edge
    - y: percent from parent's top edge
    - width: percent of parent's width
    - height: percent of parent's height

    Values are rounded to PERCENT_PRECISION decimal places (2). Sub-pixel precision
    in a hand-drawn rectangle is jitter, not intent.
    """
    if parent_rect.width <= 0 or parent_rect.height <= 0:
        # Defensive: parent with zero dimension would cause division by zero.
        # This should never happen because the schema requires positive dimensions.
        return Box(x=0, y=0, width=0, height=0)

    x_pct = (node_rect.x - parent_rect.x) / parent_rect.width * 100
    y_pct = (node_rect.y - parent_rect.y) / parent_rect.height * 100
    w_pct = node_rect.width / parent_rect.width * 100
    h_pct = node_rect.height / parent_rect.height * 100

    return Box(
        x=round(x_pct, PERCENT_PRECISION),
        y=round(y_pct, PERCENT_PRECISION),
        width=round(w_pct, PERCENT_PRECISION),
        height=round(h_pct, PERCENT_PRECISION),
    )


def convert_to_relative(node: TreeNode) -> None:
    """Walk the tree and compute relative Box for each node.

    Each node gets a `relative_box` attribute containing its Box in parent percentages.
    The root node gets a full-canvas Box (0,0,100,100).

    This is done after nesting is resolved, because a node's parent determines
    the coordinate frame for the conversion.
    """
    if node.is_root:
        # Root spans the full canvas.
        node.relative_box = Box(x=0, y=0, width=100, height=100)  # type: ignore[attr-defined]
    elif node.parent is not None:
        node.relative_box = to_percent_box(node.rect, node.parent.rect)  # type: ignore[attr-defined]
    else:
        # Orphan (should not happen after proper tree build).
        node.relative_box = Box(x=0, y=0, width=0, height=0)  # type: ignore[attr-defined]

    for child in node.children:
        convert_to_relative(child)
