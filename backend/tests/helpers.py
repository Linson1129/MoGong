"""Test helpers for building schema objects concisely.

Kept out of conftest so that importing a builder is an ordinary, visible dependency in the test
module rather than something pytest injects implicitly. Fixtures are for lifecycle; these are for
readability.
"""

from __future__ import annotations

from app.schemas.document import CanvasConfig, DocumentMeta, Element, MoGongDocument


def make_element(
    element_id: str,
    x: float,
    y: float,
    width: float,
    height: float,
    **overrides: object,
) -> Element:
    """Build an element from positional geometry plus keyword overrides.

    Goes through ``model_validate`` rather than the constructor so that overrides may use the
    nested-object shorthand (``fill={"color": "#FF0000"}``) and so the tests exercise the same
    validation path the API does.
    """
    payload: dict[str, object] = {
        "id": element_id,
        "x": x,
        "y": y,
        "width": width,
        "height": height,
    }
    payload.update(overrides)
    return Element.model_validate(payload)


def make_document(
    elements: list[Element],
    canvas_width: float = 1440,
    canvas_height: float = 900,
    layout_id: str = "test-layout",
) -> MoGongDocument:
    return MoGongDocument(
        meta=DocumentMeta(id=layout_id, name="Test Layout"),
        canvas=CanvasConfig(width=canvas_width, height=canvas_height),
        elements=elements,
    )


def doc_to_payload(document: MoGongDocument) -> dict:
    """Serialized form for posting to the API through the real wire contract."""
    return document.model_dump(mode="json")
