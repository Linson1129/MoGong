"""Role inference: assigns semantic meaning to geometric shapes.

A role is a hint, not a constraint. It tells the consuming agent "this probably is a navigation
bar" without forcing that interpretation. A wrong guess costs the agent a rename; no inference
at all costs it a prompt where it must guess from prose.

See docs/json-schema.md section 4.1 for the rule table this module implements.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.schemas.layout import ElementRole

if TYPE_CHECKING:
    from app.schemas.document import CanvasConfig
    from app.services.nesting import TreeNode

# Threshold for "full width": 95% or more of parent/canvas width.
FULL_WIDTH_THRESHOLD = 0.95

# Threshold for "full height" in a column context.
FULL_HEIGHT_THRESHOLD = 0.95


def _is_full_width(node: TreeNode, parent_width: float) -> bool:
    """True when node spans nearly the full width of its parent."""
    return node.rect.width / parent_width >= FULL_WIDTH_THRESHOLD


def _is_full_height(node: TreeNode, parent_height: float) -> bool:
    """True when node spans nearly the full height of its parent."""
    return node.rect.height / parent_height >= FULL_HEIGHT_THRESHOLD


def _height_percent_of_canvas(node: TreeNode, canvas: CanvasConfig) -> float:
    return node.rect.height / canvas.height * 100


def _is_near_top(node: TreeNode, canvas: CanvasConfig) -> bool:
    """True when element is in the top portion of canvas."""
    return node.rect.y < canvas.height * 0.15


def _is_near_bottom(node: TreeNode, canvas: CanvasConfig) -> bool:
    """True when element is in the bottom portion of canvas."""
    return node.rect.bottom > canvas.height * 0.85


def _has_fill_and_border(node: TreeNode) -> bool:
    """True when element has visible fill and border, typical of buttons."""
    el = node.element
    has_fill = el.fill.color != "#FFFFFF" or el.fill.opacity < 1.0
    has_border = el.border.is_visible()
    return has_fill and has_border


def _is_wide_and_short(node: TreeNode) -> bool:
    """True when aspect ratio is over 3:1, typical of text lines."""
    return node.rect.width / node.rect.height > 3.0


def infer_role(node: TreeNode, canvas: CanvasConfig) -> ElementRole:
    """Assign a semantic role based on geometry and tree position.

    Rules are evaluated top to bottom; first match wins.

    Args:
        node: The TreeNode to assign a role to.
        canvas: Canvas dimensions for computing percentages.

    Returns:
        ElementRole: The inferred role.
    """
    element = node.element  # noqa: F841 - kept for readability when extending rules
    parent = node.parent
    has_children = bool(node.children)

    # Determine if parent is root and get parent dimensions.
    parent_is_root = parent is not None and parent.is_root
    parent_width = (
        canvas.width if parent_is_root else (parent.rect.width if parent else canvas.width)
    )

    full_width = _is_full_width(node, parent_width)
    height_pct = _height_percent_of_canvas(node, canvas)

    # Rule 1: Navigation - topmost direct child of root, full width, height < 15%.
    if parent_is_root and full_width and height_pct < 15 and _is_near_top(node, canvas):
        return ElementRole.NAVIGATION

    # Rule 2: Contentinfo (footer) - bottommost direct child of root, full width, height < 15%.
    if parent_is_root and full_width and height_pct < 15 and _is_near_bottom(node, canvas):
        return ElementRole.CONTENTINFO

    # Rule 3: Main - full width, height > 40%, has children.
    if full_width and height_pct > 40 and has_children:
        return ElementRole.MAIN

    # Rule 4: Region - direct child of root, full width, no children.
    if parent_is_root and full_width and not has_children:
        return ElementRole.REGION

    # Rule 5: Container - has children.
    if has_children:
        return ElementRole.CONTAINER

    # Rule 6: Button - fill + border, no children, width < 25% of parent.
    width_pct_of_parent = node.rect.width / parent_width * 100
    if _has_fill_and_border(node) and width_pct_of_parent < 25:
        return ElementRole.BUTTON

    # Rule 7: Text - no fill, no border, no children, aspect ratio > 3:1.
    no_fill = node.element.fill.color == "#FFFFFF" and node.element.fill.opacity >= 1.0
    no_border = not node.element.border.is_visible()
    if no_fill and no_border and not has_children and _is_wide_and_short(node):
        return ElementRole.TEXT

    # Rule 8: Block - fallback for leaf elements.
    return ElementRole.BLOCK


def infer_roles_recursive(node: TreeNode, canvas: CanvasConfig) -> None:
    """Walk the tree and assign role to each element node.

    Skips the root node, which gets "region" by definition.
    """
    if not node.is_root:
        node.role = infer_role(node, canvas).value

    for child in node.children:
        infer_roles_recursive(child, canvas)
