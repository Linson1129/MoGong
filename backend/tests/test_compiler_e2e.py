"""End-to-end compilation tests: verify the full pipeline from document to layout.

These are the most important tests in the compiler suite. They verify that the pipeline
stages compose correctly and produce valid output that a consuming agent can read.

The completeness invariant (no element dropped) is tested here as well, because it can
only be verified against a full compilation.
"""

from __future__ import annotations

from app.schemas.document import Border, CanvasConfig, DocumentMeta, Element, Fill, MoGongDocument
from app.schemas.layout import LayoutDocument, LayoutWarningCode
from app.services.compiler import compile_document


def make_document(elements: list[Element], width: float = 1440, height: float = 900) -> MoGongDocument:
    return MoGongDocument(
        meta=DocumentMeta(id="test-layout", name="Test Page"),
        canvas=CanvasConfig(width=width, height=height),
        elements=elements,
    )


def make_element(
    id: str,
    x: float,
    y: float,
    w: float,
    h: float,
    name: str = "",
    fill_color: str = "#E2E8F0",
    border_width: float = 1.0,
    note: str | None = None,
) -> Element:
    return Element(
        id=id,
        name=name,
        x=x,
        y=y,
        width=w,
        height=h,
        fill=Fill(color=fill_color),
        border=Border(width=border_width),
        note=note,
    )


class TestCompileEmptyDocument:
    def test_empty_document_produces_valid_layout(self) -> None:
        doc = make_document([])
        result = compile_document(doc)

        assert isinstance(result, LayoutDocument)
        assert result.root.id == "root"
        assert result.root.children == []
        assert result.format == "mogong.layout"
        assert result.version == "1.0"


class TestCompileSimpleLayout:
    def test_single_element_compiles_correctly(self) -> None:
        doc = make_document([make_element("e1", 100, 100, 400, 300, name="Box")])
        result = compile_document(doc)

        assert len(result.root.children) == 1
        node = result.root.children[0]
        assert node.id == "e1"
        assert node.name == "Box"
        assert node.box.width > 0
        assert node.box.height > 0

    def test_percentage_calculation_is_correct(self) -> None:
        """An element at (0,0,720,450) on a 1440x900 canvas should be 50% x 50%."""
        doc = make_document([make_element("half", 0, 0, 720, 450)])
        result = compile_document(doc)

        node = result.root.children[0]
        assert node.box.width == 50.0
        assert node.box.height == 50.0
        assert node.box.x == 0.0
        assert node.box.y == 0.0

    def test_nested_element_percentages_are_relative_to_parent(self) -> None:
        """A child at (200,100,200,150) inside parent (100,50,400,300) should be
        relative: x=(200-100)/400*100=25%, y=(100-50)/300*100=16.67%."""
        doc = make_document([
            make_element("parent", 100, 50, 400, 300),
            make_element("child", 200, 100, 200, 150),
        ])
        result = compile_document(doc)

        parent_node = result.root.children[0]
        assert parent_node.id == "parent"
        child_node = parent_node.children[0]
        assert child_node.id == "child"
        assert child_node.box.x == 25.0
        assert child_node.box.y == 16.67
        assert child_node.box.width == 50.0
        assert child_node.box.height == 50.0


class TestCompileHeaderFooter:
    def test_header_footer_produces_navigation_and_contentinfo(self) -> None:
        doc = make_document([
            make_element("header", 0, 0, 1440, 60, name="Header"),
            make_element("main", 0, 60, 1440, 780, name="Main"),
            make_element("footer", 0, 840, 1440, 60, name="Footer"),
        ])
        result = compile_document(doc)

        assert len(result.root.children) == 3
        roles = [c.role.value for c in result.root.children]
        assert "navigation" in roles
        assert "contentinfo" in roles


class TestCompileWarnings:
    def test_partial_overlap_produces_warning(self) -> None:
        doc = make_document([
            make_element("a", 0, 0, 200, 200),
            make_element("b", 100, 100, 200, 200),  # Partially overlaps a.
        ])
        result = compile_document(doc)

        assert len(result.warnings) > 0
        overlap_warnings = [w for w in result.warnings if w.code == LayoutWarningCode.PARTIAL_OVERLAP]
        assert len(overlap_warnings) == 1

    def test_notes_preserved_verbatim(self) -> None:
        doc = make_document([
            make_element("e1", 0, 0, 100, 100, note="This is sticky on scroll"),
        ])
        result = compile_document(doc)

        node = result.root.children[0]
        assert node.note == "This is sticky on scroll"


class TestCompletenessInvariant:
    """The critical invariant: no drawn element vanishes from the output."""

    def test_all_elements_appear_in_tree(self) -> None:
        elements = [
            make_element("a", 0, 0, 1440, 900),
            make_element("b", 10, 10, 200, 200),
            make_element("c", 50, 50, 100, 100),
            make_element("d", 300, 300, 150, 150),
            make_element("e", 600, 600, 200, 200),
        ]
        doc = make_document(elements)
        result = compile_document(doc)

        # Every element ID must appear in the tree.
        tree_ids = result.element_ids()
        document_ids = {e.id for e in elements}
        assert document_ids <= tree_ids

    def test_no_dropped_warnings_for_valid_document(self) -> None:
        elements = [
            make_element("a", 0, 0, 800, 600),
            make_element("b", 100, 100, 200, 200),
            make_element("c", 400, 400, 200, 200),
        ]
        doc = make_document(elements)
        result = compile_document(doc)

        dropped_warnings = [w for w in result.warnings if w.code == LayoutWarningCode.ELEMENT_DROPPED]
        assert dropped_warnings == []


class TestStylePropagation:
    def test_fill_and_border_copied_to_output(self) -> None:
        doc = make_document([
            make_element("styled", 0, 0, 400, 300, fill_color="#FF0000", border_width=3.0),
        ])
        result = compile_document(doc)

        node = result.root.children[0]
        assert node.style.fill == "#FF0000"
        assert node.style.border is not None
        assert node.style.border.width == 3.0

    def test_no_border_becomes_none(self) -> None:
        doc = make_document([
            make_element("noborder", 0, 0, 400, 300, border_width=0.0),
        ])
        result = compile_document(doc)

        node = result.root.children[0]
        assert node.style.border is None


class TestLayoutMeta:
    def test_meta_carries_document_name(self) -> None:
        doc = make_document([make_element("e1", 0, 0, 100, 100)])
        doc.meta.name = "homepage-hero"
        result = compile_document(doc)

        assert result.meta.name == "homepage-hero"
        assert result.meta.source == "MoGong"
        assert result.meta.generated_at is not None

    def test_canvas_summary_present(self) -> None:
        doc = make_document([make_element("e1", 0, 0, 100, 100)])
        result = compile_document(doc)

        assert result.canvas.width == 1440
        assert result.canvas.height == 900
        assert result.canvas.platform == "web-desktop"
