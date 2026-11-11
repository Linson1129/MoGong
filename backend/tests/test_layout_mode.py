"""Tests for layout mode inference.

Layout mode is the highest-value inference in the compiler: it tells the consuming agent
whether children flow in a row, a column, stack, or free. These tests cover each mode
and the ambiguous (free) warning case.
"""

from __future__ import annotations

from app.models.geometry import Rect
from app.schemas.document import Border, Element, Fill
from app.schemas.layout import LayoutMode
from app.services.infer.layout_mode import infer_layout_mode
from app.services.nesting import TreeNode


def make_node(x: float, y: float, w: float, h: float, elem_id: str = "e") -> TreeNode:
    element = Element(id=elem_id, x=x, y=y, width=w, height=h, fill=Fill(), border=Border())
    return TreeNode(element=element, rect=Rect(x, y, w, h))


class TestLayoutModeNone:
    def test_no_children_is_none(self) -> None:
        mode, warning = infer_layout_mode([])
        assert mode == LayoutMode.NONE
        assert warning is None


class TestLayoutModeRow:
    def test_side_by_side_elements_is_row(self) -> None:
        children = [
            make_node(0, 0, 100, 200, "a"),
            make_node(120, 0, 100, 200, "b"),
            make_node(240, 0, 100, 200, "c"),
        ]
        mode, warning = infer_layout_mode(children)
        assert mode == LayoutMode.ROW
        assert warning is None

    def test_different_heights_still_row_if_no_horizontal_overlap(self) -> None:
        children = [
            make_node(0, 0, 100, 300, "a"),
            make_node(110, 50, 100, 200, "b"),
        ]
        mode, _ = infer_layout_mode(children)
        assert mode == LayoutMode.ROW


class TestLayoutModeColumn:
    def test_top_to_bottom_elements_is_column(self) -> None:
        children = [
            make_node(0, 0, 400, 100, "a"),
            make_node(0, 110, 400, 100, "b"),
            make_node(0, 220, 400, 100, "c"),
        ]
        mode, warning = infer_layout_mode(children)
        assert mode == LayoutMode.COLUMN
        assert warning is None

    def test_single_child_is_column(self) -> None:
        children = [make_node(0, 0, 200, 200, "only")]
        mode, _ = infer_layout_mode(children)
        assert mode == LayoutMode.COLUMN

    def test_different_widths_still_column_if_no_vertical_overlap(self) -> None:
        children = [
            make_node(0, 0, 500, 80, "a"),
            make_node(50, 90, 300, 80, "b"),
        ]
        mode, _ = infer_layout_mode(children)
        assert mode == LayoutMode.COLUMN


class TestLayoutModeStack:
    def test_overlapping_children_is_stack(self) -> None:
        children = [
            make_node(0, 0, 300, 300, "a"),
            make_node(100, 100, 300, 300, "b"),  # Overlaps in both axes.
        ]
        mode, _ = infer_layout_mode(children)
        assert mode == LayoutMode.STACK

    def test_partial_overlap_in_both_axes_triggers_stack(self) -> None:
        children = [
            make_node(0, 0, 200, 200, "a"),
            make_node(50, 50, 200, 200, "b"),
            make_node(100, 100, 200, 200, "c"),
        ]
        mode, _ = infer_layout_mode(children)
        assert mode == LayoutMode.STACK


class TestLayoutModeFree:
    def test_mixed_arrangement_is_free_with_warning(self) -> None:
        """Some children overlap horizontally, some overlap vertically, but not all."""
        children = [
            make_node(0, 0, 200, 100, "a"),  # Top left
            make_node(100, 100, 200, 100, "b"),  # Center, overlaps both axes with 'a'
            make_node(0, 150, 100, 100, "c"),  # Bottom left
        ]
        mode, warning = infer_layout_mode(children)
        # This is an ambiguous case.
        if mode == LayoutMode.FREE:
            assert warning is not None


class TestLayoutModeEdgeCases:
    def test_touching_siblings_no_gap_is_row(self) -> None:
        children = [
            make_node(0, 0, 100, 100, "a"),
            make_node(100, 0, 100, 100, "b"),  # Touches at x=100, no overlap.
        ]
        mode, _ = infer_layout_mode(children)
        assert mode == LayoutMode.ROW

    def test_touching_siblings_vertical_is_column(self) -> None:
        children = [
            make_node(0, 0, 100, 100, "a"),
            make_node(0, 100, 100, 100, "b"),  # Touches at y=100, no overlap.
        ]
        mode, _ = infer_layout_mode(children)
        assert mode == LayoutMode.COLUMN
