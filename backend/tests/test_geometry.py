"""Geometry semantics for the nesting rule.

The containment boundary cases are the point of this file. A rectangle snapped flush against its
parent is the ordinary case in real drawings, and getting the inclusive-versus-strict comparison
wrong would silently un-nest it -- producing a flat sibling list that compiles to the wrong page
while looking correct on screen.
"""

from __future__ import annotations

import pytest

from app.models.geometry import Rect


class TestContainment:
    def test_strict_interior_is_contained(self) -> None:
        parent = Rect(0, 0, 100, 100)
        assert parent.contains(Rect(10, 10, 20, 20))

    @pytest.mark.parametrize(
        "child",
        [
            Rect(0, 0, 100, 100),  # identical rect contains itself
            Rect(0, 0, 50, 50),  # flush to top-left
            Rect(50, 50, 50, 50),  # flush to bottom-right
            Rect(0, 10, 100, 20),  # full-width band
            Rect(10, 0, 20, 100),  # full-height column
        ],
    )
    def test_flush_edges_count_as_contained(self, child: Rect) -> None:
        # Inclusive boundaries, per docs/spec.md section 5. Snapping a child against a parent edge
        # is the most common way a child is drawn at all.
        assert Rect(0, 0, 100, 100).contains(child)

    def test_one_pixel_outside_is_not_contained(self) -> None:
        assert not Rect(0, 0, 100, 100).contains(Rect(-1, 0, 50, 50))
        assert not Rect(0, 0, 100, 100).contains(Rect(0, 0, 101, 50))


class TestOverlap:
    def test_touching_edges_do_not_overlap(self) -> None:
        # Two stacked sections sharing a border line are a normal layout. Counting that as overlap
        # would raise a false warning on almost every well-formed drawing.
        left = Rect(0, 0, 100, 100)
        right = Rect(100, 0, 100, 100)
        assert not left.overlaps(right)

    def test_containment_is_also_overlap(self) -> None:
        assert Rect(0, 0, 100, 100).overlaps(Rect(10, 10, 20, 20))

    def test_disjoint_rects_do_not_overlap(self) -> None:
        assert not Rect(0, 0, 10, 10).overlaps(Rect(50, 50, 10, 10))


class TestPartialOverlap:
    def test_crossing_one_edge_is_partial(self) -> None:
        # The invalid state: neither inside nor outside. This must be reported, never resolved.
        outer = Rect(0, 0, 100, 100)
        assert outer.partially_overlaps(Rect(50, 50, 100, 100))
        assert Rect(50, 50, 100, 100).partially_overlaps(outer)

    def test_containment_is_not_partial(self) -> None:
        outer = Rect(0, 0, 100, 100)
        assert not outer.partially_overlaps(Rect(10, 10, 20, 20))
        assert not Rect(10, 10, 20, 20).partially_overlaps(outer)

    def test_disjoint_is_not_partial(self) -> None:
        assert not Rect(0, 0, 10, 10).partially_overlaps(Rect(90, 90, 10, 10))

    def test_symmetry(self) -> None:
        a, b = Rect(0, 0, 60, 60), Rect(30, 30, 60, 60)
        assert a.partially_overlaps(b) is b.partially_overlaps(a)


class TestOverlapArea:
    def test_area_of_a_quarter_intersection(self) -> None:
        assert Rect(0, 0, 100, 100).overlap_area(Rect(50, 50, 100, 100)) == 2500

    def test_no_overlap_has_zero_area(self) -> None:
        assert Rect(0, 0, 10, 10).overlap_area(Rect(20, 20, 10, 10)) == 0


class TestRelativeConversion:
    def test_child_becomes_a_percentage_of_parent(self) -> None:
        parent = Rect(100, 100, 200, 100)
        child = Rect(150, 125, 50, 50)
        relative = child.to_relative(parent)
        assert relative.x == 25  # 50 of 200
        assert relative.y == 25  # 25 of 100
        assert relative.width == 25  # 50 of 200
        assert relative.height == 50  # 50 of 100

    def test_a_child_filling_the_parent_reads_as_one_hundred_percent(self) -> None:
        parent = Rect(0, 0, 1440, 900)
        relative = Rect(0, 0, 1440, 900).to_relative(parent)
        assert (relative.x, relative.y) == (0, 0)
        assert relative.width == pytest.approx(100)
        assert relative.height == pytest.approx(100)

    def test_negative_offset_survives_when_the_child_escapes_its_parent(self) -> None:
        # Off-canvas drawings are a warning, not a rejection, so conversion must not clamp them:
        # hiding the overflow would make the JSON disagree with what the user can see.
        relative = Rect(-20, 0, 40, 10).to_relative(Rect(0, 0, 100, 100))
        assert relative.x == -20
