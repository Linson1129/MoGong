"""Contract tests for the document schema.

These assert the behaviour the rest of the system silently relies on: normalization, the camelCase
wire format, and rejection of input the compiler could not handle. A change here is a change to
the file format, so each case is written as a statement about the contract, not about the code.
"""

from __future__ import annotations

import json

import pytest
from pydantic import ValidationError

from app.schemas.document import (
    Border,
    BorderStyle,
    CanvasConfig,
    DocumentMeta,
    Element,
    Fill,
    MoGongDocument,
)
from tests.helpers import make_document, make_element


def _meta(layout_id: str = "demo") -> DocumentMeta:
    return DocumentMeta(id=layout_id, name="Test")


class TestRectNormalization:
    def test_reverse_drag_is_folded_into_a_positive_rect(self) -> None:
        # Drawing right-to-left or bottom-to-top arrives as a negative extent from the pointer
        # gesture. It must land as the same rectangle, never as an inverted one.
        element = Element.model_validate(
            {"id": "e", "x": 100, "y": 80, "width": -40, "height": -20}
        )
        assert (element.x, element.y) == (60, 60)
        assert (element.width, element.height) == (40, 20)

    def test_zero_area_is_rejected(self) -> None:
        # A flat rectangle would divide by zero in the percent conversion, so it cannot be stored.
        with pytest.raises(ValidationError, match="positive width and height"):
            make_element("flat", 10, 10, 0, 50)

    def test_right_and_bottom_are_derived(self) -> None:
        element = make_element("e", 10, 20, 100, 50)
        assert element.right == 110
        assert element.bottom == 70


class TestColorNormalization:
    @pytest.mark.parametrize(
        ("raw", "expected"),
        [
            ("#abc", "#AABBCC"),
            ("#fff", "#FFFFFF"),
            ("#1e293b", "#1E293B"),
            ("  #FF0000  ", "#FF0000"),
        ],
    )
    def test_colors_have_exactly_one_stored_spelling(self, raw: str, expected: str) -> None:
        assert Fill(color=raw).color == expected

    @pytest.mark.parametrize("raw", ["red", "#GGGGGG", "#12345", "123456"])
    def test_unparseable_colors_are_rejected(self, raw: str) -> None:
        with pytest.raises(ValidationError):
            Fill(color=raw)


class TestBorderReconciliation:
    def test_zero_width_means_style_defaults_to_solid(self) -> None:
        # Width is the authority on existence. BorderStyle only has solid/dashed now,
        # so a zero-width border defaults to solid and is_visible() returns False.
        border = Border(width=0, style=BorderStyle.DASHED, color="#000000")
        assert border.style is BorderStyle.SOLID
        assert not border.is_visible()

    def test_positive_width_with_unset_style_becomes_visible(self) -> None:
        border = Border(width=2, color="#0F172A")
        assert border.style is BorderStyle.SOLID
        assert border.is_visible()

    def test_positive_width_with_dashed_stays_dashed(self) -> None:
        border = Border(width=3, style=BorderStyle.DASHED, color="#000000")
        assert border.style is BorderStyle.DASHED
        assert border.is_visible()

    def test_no_border_has_exactly_one_serialized_spelling(self) -> None:
        default = Border()
        assert default.model_dump(mode="json")["style"] == "solid"


class TestWireFormat:
    def test_serialization_uses_camel_case(self) -> None:
        document = make_document([make_element("e", 0, 0, 10, 10)])
        payload = json.loads(document.model_dump_json())
        assert "snapToGrid" in payload["canvas"]
        assert "createdAt" in payload["meta"]
        # snake_case must never appear on the wire, or the frontend reads undefined silently.
        assert "snap_to_grid" not in payload["canvas"]

    def test_document_survives_a_round_trip(self) -> None:
        document = make_document(
            [
                make_element(
                    "e_01",
                    0,
                    0,
                    1440,
                    72,
                    note="Sticky top bar",
                    fill={"color": "#1E293B", "opacity": 0.9},
                    border={"width": 1, "style": "solid", "color": "#0F172A"},
                )
            ]
        )
        payload = json.loads(document.model_dump_json())
        assert MoGongDocument.model_validate(payload) == document

    def test_unknown_fields_are_rejected(self) -> None:
        # Accepting an unknown key quietly is how a renamed field becomes invisible data loss.
        with pytest.raises(ValidationError, match="Extra inputs"):
            Element.model_validate(
                {"id": "e", "x": 0, "y": 0, "width": 10, "height": 10, "colour": "#FFF"}
            )


class TestDocumentInvariants:
    def test_duplicate_element_ids_are_rejected(self) -> None:
        with pytest.raises(ValidationError, match="duplicate element ids"):
            MoGongDocument(
                meta=_meta(),
                canvas=CanvasConfig(),
                elements=[make_element("same", 0, 0, 10, 10), make_element("same", 20, 20, 10, 10)],
            )

    def test_viewport_is_persisted_but_separate_from_elements(self) -> None:
        # The camera is editor state. It is stored so a layout reopens as it was left, and it must
        # stay separable from elements so the compiler can exclude it.
        document = make_document([make_element("e", 0, 0, 10, 10)])
        assert document.viewport.zoom == 1.0
        assert document.viewport.model_dump(exclude_none=True) == {
            "zoom": 1.0,
            "panX": 0.0,
            "panY": 0.0,
        }
