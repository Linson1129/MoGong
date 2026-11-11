"""Tests for the nesting tree builder.

The nesting module is the foundation of the compiler: everything downstream assumes
a correct tree. These tests verify the containment rules, partial overlap detection,
and the tree structure invariant (every element appears exactly once).
"""

from __future__ import annotations

import pytest

from app.schemas.document import Border, CanvasConfig, Element, Fill
from app.services.nesting import TreeNode, build_tree


def make_element(
    id: str,
    x: float,
    y: float,
    width: float,
    height: float,
    name: str = "",
) -> Element:
    return Element(
        id=id,
        name=name,
        x=x,
        y=y,
        width=width,
        height=height,
        fill=Fill(color="#E2E8F0"),
        border=Border(width=1),
    )


CANVAS = CanvasConfig(width=1440, height=900)


class TestBuildTreeBasic:
    """Basic tree construction scenarios."""

    def test_empty_document_returns_root_only(self) -> None:
        root, warnings = build_tree([], CANVAS)
        assert root.is_root
        assert root.children == []
        assert warnings == []

    def test_single_element_becomes_direct_child_of_root(self) -> None:
        elements = [make_element("e1", 100, 100, 200, 150)]
        root, warnings = build_tree(elements, CANVAS)

        assert len(root.children) == 1
        assert root.children[0].element.id == "e1"
        assert warnings == []

    def test_two_disjoint_elements_are_siblings(self) -> None:
        elements = [
            make_element("e1", 0, 0, 100, 100),
            make_element("e2", 200, 200, 100, 100),
        ]
        root, _ = build_tree(elements, CANVAS)

        assert len(root.children) == 2
        ids = {c.element.id for c in root.children}
        assert ids == {"e1", "e2"}

    def test_contained_element_becomes_child_of_container(self) -> None:
        elements = [
            make_element("parent", 0, 0, 400, 300),
            make_element("child", 50, 50, 100, 100),
        ]
        root, _ = build_tree(elements, CANVAS)

        assert len(root.children) == 1
        parent_node = root.children[0]
        assert parent_node.element.id == "parent"
        assert len(parent_node.children) == 1
        assert parent_node.children[0].element.id == "child"


class TestBuildTreeNesting:
    """Complex nesting scenarios."""

    def test_three_level_nesting(self) -> None:
        elements = [
            make_element("outer", 0, 0, 1000, 800),
            make_element("middle", 100, 100, 500, 400),
            make_element("inner", 150, 150, 100, 100),
        ]
        root, _ = build_tree(elements, CANVAS)

        assert len(root.children) == 1
        outer = root.children[0]
        assert outer.element.id == "outer"
        assert len(outer.children) == 1
        middle = outer.children[0]
        assert middle.element.id == "middle"
        assert len(middle.children) == 1
        inner = middle.children[0]
        assert inner.element.id == "inner"

    def test_smallest_container_wins(self) -> None:
        """When multiple elements contain the target, the smallest becomes parent."""
        elements = [
            make_element("large", 0, 0, 1400, 880),
            make_element("medium", 100, 100, 500, 400),
            make_element("small", 150, 150, 200, 100),
            make_element("target", 160, 160, 50, 50),
        ]
        root, _ = build_tree(elements, CANVAS)

        # Target should be inside small, not medium or large.
        large = root.children[0]
        medium = large.children[0]
        small = medium.children[0]
        target = small.children[0]

        assert target.element.id == "target"
        assert small.element.id == "small"

    def test_sibling_containers_with_different_children(self) -> None:
        elements = [
            make_element("left_panel", 0, 0, 300, 800),
            make_element("right_panel", 400, 0, 300, 800),
            make_element("left_item", 50, 50, 100, 100),
            make_element("right_item", 450, 50, 100, 100),
        ]
        root, _ = build_tree(elements, CANVAS)

        # left_panel and right_panel are siblings under root.
        assert len(root.children) == 2
        panels = {c.element.id for c in root.children}
        assert panels == {"left_panel", "right_panel"}

        # Each panel has one child.
        for panel in root.children:
            assert len(panel.children) == 1


class TestPartialOverlap:
    """Partial overlap detection."""

    def test_partial_overlap_produces_warning(self) -> None:
        elements = [
            make_element("a", 0, 0, 200, 200),
            make_element("b", 100, 100, 200, 200),  # Partially overlaps a.
        ]
        _, warnings = build_tree(elements, CANVAS)

        assert len(warnings) == 1
        assert warnings[0]["code"] == "PARTIAL_OVERLAP"
        assert set(warnings[0]["elements"]) == {"a", "b"}

    def test_partial_overlap_elements_are_siblings(self) -> None:
        """Partial overlap means neither contains the other: both go under root."""
        elements = [
            make_element("a", 0, 0, 200, 200),
            make_element("b", 100, 100, 200, 200),
        ]
        root, _ = build_tree(elements, CANVAS)

        # Both should be direct children of root (siblings).
        assert len(root.children) == 2

    def test_no_overlap_no_warning(self) -> None:
        elements = [
            make_element("a", 0, 0, 100, 100),
            make_element("b", 200, 200, 100, 100),
        ]
        _, warnings = build_tree(elements, CANVAS)
        assert warnings == []


class TestTreeInvariants:
    """Structural invariants that must always hold."""

    def test_every_element_appears_exactly_once(self) -> None:
        elements = [
            make_element("a", 0, 0, 1400, 900),
            make_element("b", 100, 100, 200, 200),
            make_element("c", 150, 150, 50, 50),
            make_element("d", 500, 500, 100, 100),
        ]
        root, _ = build_tree(elements, CANVAS)

        # Collect all element IDs from the tree.
        tree_ids = set()
        for node in root.walk():
            if not node.is_root:
                tree_ids.add(node.element_id)

        document_ids = {e.id for e in elements}
        assert tree_ids == document_ids

    def test_depth_matches_nesting_level(self) -> None:
        elements = [
            make_element("level1", 0, 0, 1000, 800),
            make_element("level2", 100, 100, 500, 400),
            make_element("level3", 150, 150, 200, 100),
        ]
        root, _ = build_tree(elements, CANVAS)

        assert root.children[0].depth == 1  # level1
        assert root.children[0].children[0].depth == 2  # level2
        assert root.children[0].children[0].children[0].depth == 3  # level3

    def test_children_sorted_by_position(self) -> None:
        elements = [
            make_element("top", 0, 0, 100, 50),
            make_element("bottom", 0, 200, 100, 50),
            make_element("middle", 0, 100, 100, 50),
        ]
        root, _ = build_tree(elements, CANVAS)

        y_positions = [c.rect.y for c in root.children]
        assert y_positions == sorted(y_positions)
