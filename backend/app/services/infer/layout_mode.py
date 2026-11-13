"""Layout mode inference: determines how children of a container are arranged.

The layout mode (row / column / stack / free) is the highest-value inference the compiler makes.
It is the structural decision that the user could previously only wish for in the prompt they handed
to an agent. By reading it from the geometry, MoGong removes that guesswork.

See docs/json-schema.md section 4.2 for the rule table this module implements.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.schemas.layout import LayoutMode

if TYPE_CHECKING:
    from app.services.nesting import TreeNode


def _horizontal_overlap(a: TreeNode, b: TreeNode) -> bool:
    """True when two nodes overlap on the x-axis."""
    return a.rect.x < b.rect.right and b.rect.x < a.rect.right


def _vertical_overlap(a: TreeNode, b: TreeNode) -> bool:
    """True when two nodes overlap on the y-axis."""
    return a.rect.y < b.rect.bottom and b.rect.y < a.rect.bottom


def _no_horizontal_overlap(children: list[TreeNode]) -> bool:
    """True when no two children overlap horizontally (they are side by side)."""
    for i, a in enumerate(children):
        for b in children[i + 1 :]:
            if _horizontal_overlap(a, b):
                return False
    return True


def _no_vertical_overlap(children: list[TreeNode]) -> bool:
    """True when no two children overlap vertically (they are stacked top to bottom)."""
    for i, a in enumerate(children):
        for b in children[i + 1 :]:
            if _vertical_overlap(a, b):
                return False
    return True


def _any_overlap_both_axes(children: list[TreeNode]) -> bool:
    """True when any pair of children overlaps in BOTH axes simultaneously.

    This is the stack condition: children sitting on top of each other, like tabs or overlays.
    """
    for i, a in enumerate(children):
        for b in children[i + 1 :]:
            if _horizontal_overlap(a, b) and _vertical_overlap(a, b):
                return True
    return False


def infer_layout_mode(children: list[TreeNode]) -> tuple[LayoutMode, str | None]:
    """Determine layout mode from children arrangement.

    Returns:
        (mode, warning): The inferred mode, and an optional warning message if the
                        arrangement is ambiguous (free mode).

    Rules (from docs/json-schema.md 4.2):
    - No children -> none
    - Single child -> column (wrapper carries no ordering info)
    - No horizontal overlap AND children ordered left-to-right -> row
    - No vertical overlap AND children ordered top-to-bottom -> column
    - Children overlap each other in both axes -> stack
    - None of the above holds cleanly -> free (with warning)
    """
    if not children:
        return LayoutMode.NONE, None

    # Single child: a one-child wrapper has no ordering to preserve.
    if len(children) == 1:
        return LayoutMode.COLUMN, None

    # Check for row: side by side with no horizontal overlap.
    if _no_horizontal_overlap(children):
        # Verify they are actually ordered left to right (not random).
        # Since we sorted children by position in nesting.py, the order is already correct.
        return LayoutMode.ROW, None

    # Check for column: stacked vertically with no vertical overlap.
    if _no_vertical_overlap(children):
        return LayoutMode.COLUMN, None

    # Check for stack: significant overlap in both axes.
    if _any_overlap_both_axes(children):
        return LayoutMode.STACK, None

    # None of the clean cases: this is a free/ambiguous layout.
    # Warn the user because their drawing didn't read the way they intended.
    ids = [c.element_id for c in children]
    warning = (
        f"Children {', '.join(ids)} have an ambiguous arrangement. "
        f"Compiled as free-positioned; consider adjusting the drawing."
    )
    return LayoutMode.FREE, warning


def infer_layout_modes_recursive(node: TreeNode) -> list[dict]:
    """Walk the tree and assign layout_mode to each node.

    Returns list of warnings for ambiguous (free) layouts.
    """
    warnings: list[dict] = []

    if node.is_root:
        # Root node: infer from its direct children (top-level regions).
        mode, warning = infer_layout_mode(node.children)
        node.layout_mode = mode.value
        if warning:
            warnings.append(
                {
                    "code": "AMBIGUOUS_LAYOUT",
                    "elements": [c.element_id for c in node.children],
                    "message": warning,
                }
            )
    elif node.children:
        mode, warning = infer_layout_mode(node.children)
        node.layout_mode = mode.value
        if warning:
            warnings.append(
                {
                    "code": "AMBIGUOUS_LAYOUT",
                    "elements": [c.element_id for c in node.children],
                    "message": warning,
                }
            )
    else:
        # Leaf node: no children, layout is none.
        node.layout_mode = LayoutMode.NONE.value

    for child in node.children:
        warnings.extend(infer_layout_modes_recursive(child))

    return warnings
