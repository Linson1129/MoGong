"""Tests for role inference.

Role is a semantic hint that tells the consuming agent what an element likely is.
These tests verify the rule table from docs/json-schema.md section 4.1.
"""

from __future__ import annotations

from app.models.geometry import Rect
from app.schemas.document import Border, CanvasConfig, Element, Fill
from app.schemas.layout import ElementRole
from app.services.infer.roles import infer_role
from app.services.nesting import TreeNode


CANVAS = CanvasConfig(width=1440, height=900)


def make_node(
    elem_id: str,
    x: float,
    y: float,
    w: float,
    h: float,
    fill_color: str = "#E2E8F0",
    border_width: float = 1.0,
    children: list[TreeNode] | None = None,
    parent: TreeNode | None = None,
) -> TreeNode:
    element = Element(
        id=elem_id,
        x=x,
        y=y,
        width=w,
        height=h,
        fill=Fill(color=fill_color),
        border=Border(width=border_width),
    )
    node = TreeNode(
        element=element,
        rect=Rect(x, y, w, h),
        parent=parent,
        children=children or [],
    )
    # Set parent back-references on children.
    for child in node.children:
        child.parent = node
    return node


def make_root(canvas: CanvasConfig = CANVAS) -> TreeNode:
    """Create a synthetic root node."""
    root = TreeNode.__new__(TreeNode)
    root.element = None
    root.rect = Rect(0, 0, canvas.width, canvas.height)
    root.parent = None
    root.children = []
    root.depth = 0
    root.layout_mode = None
    root.role = None
    return root


class TestNavigationRole:
    def test_top_full_width_thin_element_is_navigation(self) -> None:
        root = make_root()
        node = make_node("header", 0, 0, 1440, 72, parent=root)
        root.children = [node]

        role = infer_role(node, CANVAS)
        assert role == ElementRole.NAVIGATION

    def test_height_at_15_percent_boundary_not_navigation(self) -> None:
        """Exactly 15% (135px of 900) is not < 15%."""
        root = make_root()
        node = make_node("tall_header", 0, 0, 1440, 135, parent=root)
        root.children = [node]

        role = infer_role(node, CANVAS)
        assert role != ElementRole.NAVIGATION


class TestContentinfoRole:
    def test_bottom_full_width_thin_element_is_contentinfo(self) -> None:
        root = make_root()
        # Position at bottom of canvas.
        node = make_node("footer", 0, 828, 1440, 72, parent=root)
        root.children = [node]

        role = infer_role(node, CANVAS)
        assert role == ElementRole.CONTENTINFO


class TestMainRole:
    def test_full_width_tall_with_children_is_main(self) -> None:
        child = make_node("inner", 50, 50, 200, 200)
        root = make_root()
        node = make_node("content", 0, 72, 1440, 756, children=[child], parent=root)
        root.children = [node]

        role = infer_role(node, CANVAS)
        assert role == ElementRole.MAIN


class TestContainerRole:
    def test_has_children_is_container(self) -> None:
        child = make_node("inner", 10, 10, 50, 50)
        parent = make_node("wrapper", 0, 0, 300, 300, children=[child])

        role = infer_role(parent, CANVAS)
        assert role == ElementRole.CONTAINER


class TestButtonRole:
    def test_small_with_fill_and_border_is_button(self) -> None:
        parent = make_node("container", 0, 0, 1440, 900, fill_color="#FFFFFF")
        child = make_node(
            "btn", 100, 100, 120, 40, fill_color="#3B82F6", border_width=2.0, parent=parent
        )

        role = infer_role(child, CANVAS)
        assert role == ElementRole.BUTTON

    def test_white_fill_no_border_not_button(self) -> None:
        parent = make_node("container", 0, 0, 1440, 900, fill_color="#FFFFFF")
        child = make_node(
            "not_btn", 100, 100, 100, 40, fill_color="#FFFFFF", border_width=0, parent=parent
        )

        role = infer_role(child, CANVAS)
        assert role != ElementRole.BUTTON


class TestTextRole:
    def test_wide_short_no_style_is_text(self) -> None:
        parent = make_node("container", 0, 0, 1440, 900, fill_color="#FFFFFF")
        child = make_node(
            "line", 100, 100, 600, 20, fill_color="#FFFFFF", border_width=0, parent=parent
        )

        role = infer_role(child, CANVAS)
        assert role == ElementRole.TEXT


class TestBlockRole:
    def test_default_leaf_is_block(self) -> None:
        parent = make_node("container", 0, 0, 1440, 900, fill_color="#FFFFFF")
        # Wide enough (>= 25% of parent) to avoid button classification.
        child = make_node(
            "generic", 200, 200, 600, 400,
            fill_color="#FFFFFF", border_width=0, parent=parent
        )

        role = infer_role(child, CANVAS)
        assert role == ElementRole.BLOCK
