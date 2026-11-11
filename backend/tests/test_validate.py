"""Document-level validation: the pre-flight warnings the editor shows while drawing.

Validation is advisory by contract. It reports and never repairs -- a tool that quietly moved the
user's rectangles would reintroduce exactly the gap between intent and result that MoGong was
built to close.
"""

from __future__ import annotations

from app.services.validate import ProblemCode, ProblemLevel, check_document, overlaps_partially
from tests.helpers import make_document, make_element


class TestEmptyCanvas:
    def test_no_elements_is_information(self) -> None:
        problems = check_document(make_document([]))
        assert [p.code for p in problems] == [ProblemCode.EMPTY_DOCUMENT]
        # Info level, so it does not block saving a brand-new layout.
        assert problems[0].level is ProblemLevel.INFO

    def test_empty_report_names_no_elements(self) -> None:
        assert check_document(make_document([]))[0].elements == ()


class TestOffCanvas:
    def test_element_fully_inside_is_clean(self) -> None:
        document = make_document([make_element("e_01", 10, 10, 100, 50)])
        assert check_document(document) == []

    def test_element_crossing_the_right_edge_warns(self) -> None:
        document = make_document([make_element("e_01", 1400, 0, 100, 50)], canvas_width=1440)
        codes = [(p.code, p.level) for p in check_document(document)]
        assert codes == [(ProblemCode.ELEMENT_OFF_CANVAS, ProblemLevel.WARNING)]

    def test_element_flush_with_the_canvas_edge_is_not_off_canvas(self) -> None:
        # A full-width header is the most common element in a web layout. Flagging it would make
        # the tool warn on correct drawings.
        document = make_document([make_element("e_01", 0, 0, 1440, 72)])
        assert check_document(document) == []

    def test_negative_origin_warns(self) -> None:
        document = make_document([make_element("e_01", -5, 0, 100, 50)])
        assert check_document(document)[0].code is ProblemCode.ELEMENT_OFF_CANVAS

    def test_warning_names_the_element_by_its_user_visible_label(self) -> None:
        document = make_document([make_element("e_01", 1500, 0, 100, 50, name="Sidebar")])
        message = check_document(document)[0].message
        assert "Sidebar" in message
        assert "1440" in message and "900" in message

    def test_an_unnamed_element_is_reported_by_id(self) -> None:
        document = make_document([make_element("e_99", 1500, 0, 100, 50)])
        assert "e_99" in check_document(document)[0].message


class TestTinyElements:
    def test_sub_two_pixel_element_warns_as_probable_accident(self) -> None:
        # Almost always an accidental click-drag, and it compiles to a percentage so small the
        # agent would round it away.
        document = make_document([make_element("e_01", 10, 10, 1, 40)])
        codes = [p.code for p in check_document(document)]
        assert ProblemCode.ELEMENT_TOO_SMALL in codes

    def test_two_pixels_is_allowed(self) -> None:
        document = make_document([make_element("e_01", 10, 10, 2, 2)])
        codes = [p.code for p in check_document(document)]
        assert ProblemCode.ELEMENT_TOO_SMALL not in codes


class TestDuplicateGeometry:
    def test_two_identical_rectangles_are_flagged_together(self) -> None:
        document = make_document(
            [make_element("e_01", 10, 10, 100, 50), make_element("e_02", 10, 10, 100, 50)]
        )
        problems = [p for p in check_document(document) if p.code is ProblemCode.DUPLICATE_GEOMETRY]
        assert len(problems) == 1
        assert set(problems[0].elements) == {"e_01", "e_02"}

    def test_similar_but_distinct_rectangles_are_not_flagged(self) -> None:
        document = make_document(
            [make_element("e_01", 10, 10, 100, 50), make_element("e_02", 12, 10, 100, 50)]
        )
        codes = [p.code for p in check_document(document)]
        assert ProblemCode.DUPLICATE_GEOMETRY not in codes


class TestPartialOverlapDetection:
    def test_nested_elements_do_not_report_partial_overlap(self) -> None:
        document = make_document(
            [make_element("outer", 0, 0, 200, 200), make_element("inner", 50, 50, 40, 40)]
        )
        assert overlaps_partially(document) == []

    def test_crossing_elements_report_the_pair_once(self) -> None:
        document = make_document(
            [make_element("a", 0, 0, 100, 100), make_element("b", 50, 50, 100, 100)]
        )
        assert overlaps_partially(document) == [("a", "b")]

    def test_touching_edges_are_not_an_overlap(self) -> None:
        document = make_document(
            [make_element("a", 0, 0, 100, 100), make_element("b", 100, 0, 100, 100)]
        )
        assert overlaps_partially(document) == []

    def test_the_reported_order_follows_the_drawing_order(self) -> None:
        # Stable ordering matters because the pair identity is shown to the user and compared by
        # the editor to decide whether the warning is still on screen.
        document = make_document(
            [make_element("b", 50, 50, 100, 100), make_element("a", 0, 0, 100, 100)]
        )
        assert overlaps_partially(document) == [("b", "a")]

    def test_three_way_overlap_yields_every_crossing_pair(self) -> None:
        document = make_document(
            [
                make_element("a", 0, 0, 100, 100),
                make_element("b", 50, 50, 100, 100),
                make_element("c", 25, 75, 100, 100),
            ]
        )
        assert len(overlaps_partially(document)) == 3


class TestProblemShape:
    def test_every_problem_carries_a_level_code_and_message(self) -> None:
        document = make_document([make_element("e_01", 1400, 0, 100, 50)])
        for problem in check_document(document):
            assert isinstance(problem.level, ProblemLevel)
            assert isinstance(problem.code, ProblemCode)
            assert problem.message.strip()

    def test_validation_never_mutates_the_document(self) -> None:
        document = make_document(
            [make_element("e_01", 1400, 0, 100, 50), make_element("e_02", 10, 10, 1, 1)]
        )
        before = document.model_dump()
        check_document(document)
        # Reporting a problem and fixing it are separate decisions that belong to the user.
        assert document.model_dump() == before
