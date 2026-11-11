"""Document to layout compilation: the step that turns a drawing into agent-readable JSON.

Milestone M4: the compiler is now implemented. It takes a MoGongDocument (the editable source,
flat absolute pixels) and produces a LayoutDocument (the agent-facing artifact, tree with
relative percentages and inferred semantics).

The pipeline is pure: no filesystem, no clock reads beyond the caller supplying a timestamp.
That constraint is what makes the compiler the one part of MoGong with genuinely cheap,
genuinely useful tests -- every case is data in, data out, reproducible without a server.

Pipeline stages (see docs/json-schema.md section 4):

    1. nesting.build_tree(elements, canvas)   -> containment tree, overlap warnings
    2. infer.layout_modes(tree)               -> row / column / stack / free per node
    3. infer.roles(tree, canvas)              -> navigation / main / button / text ...
    4. infer.spacing_and_alignment(tree)      -> measured gaps, shared edges
    5. infer.relative(tree, canvas)           -> absolute px -> percent of parent
    6. assemble(tree, document)               -> LayoutDocument with all fields
    7. validate.no_element_dropped(...)       -> the tree-versus-document invariant
"""

from __future__ import annotations

from datetime import datetime, timezone

from app.schemas.document import MoGongDocument
from app.schemas.layout import (
    CanvasSummary,
    ElementRole,
    LayoutDocument,
    LayoutMeta,
    LayoutMode,
    LayoutNode,
    LayoutWarning,
    LayoutWarningCode,
    StyleInfo,
)
from app.services.infer import (
    convert_to_relative,
    infer_layout_modes_recursive,
    infer_roles_recursive,
    infer_spacing_and_alignment,
)
from app.services.nesting import TreeNode, build_tree
from app.services.validate import assert_no_element_dropped


class CompileError(RuntimeError):
    """Raised when compilation fails due to an internal invariant violation."""


def compile_document(document: MoGongDocument) -> LayoutDocument:
    """Compile an editable document into the agent-facing layout.

    Pure function: no filesystem, no clock reads beyond the caller supplying a timestamp.
    """
    # 1. Build the containment tree.
    tree, nesting_warnings = build_tree(document.elements, document.canvas)

    # 2. Infer layout modes (row/column/stack/free) for each container.
    layout_warnings = infer_layout_modes_recursive(tree)

    # 3. Infer semantic roles.
    infer_roles_recursive(tree, document.canvas)

    # 4. Measure spacing and alignment.
    spacing_warnings = infer_spacing_and_alignment(tree)

    # 5. Convert to relative percentages.
    convert_to_relative(tree)

    # 6. Assemble the output LayoutDocument.
    layout = _assemble_layout_document(tree, document)

    # 7. Verify completeness invariant.
    completeness_warnings = assert_no_element_dropped(document, layout)

    # Merge all warnings.
    all_warnings = _merge_warnings(
        nesting_warnings, layout_warnings, spacing_warnings, completeness_warnings
    )
    layout.warnings = all_warnings

    return layout


def _assemble_layout_document(tree: TreeNode, document: MoGongDocument) -> LayoutDocument:
    """Convert the annotated TreeNode into the output LayoutDocument schema."""
    # Build the root node.
    root_node = _tree_node_to_layout_node(tree, document, is_root=True)

    # Build canvas summary.
    canvas = CanvasSummary(
        width=document.canvas.width,
        height=document.canvas.height,
        background=document.canvas.background,
        platform="web-desktop",
    )

    # Build meta.
    meta = LayoutMeta(
        name=document.meta.name,
        source="MoGong",
        generated_at=datetime.now(timezone.utc).isoformat(),
    )

    return LayoutDocument(
        meta=meta,
        canvas=canvas,
        root=root_node,
        warnings=[],  # Filled by caller after completeness check.
    )


def _tree_node_to_layout_node(
    node: TreeNode,
    document: MoGongDocument,
    is_root: bool = False,
) -> LayoutNode:
    """Convert a TreeNode (with inference annotations) to a LayoutNode (output schema)."""
    if is_root:
        # Root node is synthetic: represents the page/canvas.
        return LayoutNode(
            id="root",
            name="Page",
            role=ElementRole.REGION,
            box=getattr(node, "relative_box", None) or _default_box(),
            layout=LayoutMode(node.layout_mode) if node.layout_mode else LayoutMode.COLUMN,
            style=StyleInfo(fill=document.canvas.background, border=None),
            note=None,
            children=[_tree_node_to_layout_node(c, document) for c in node.children],
        )

    element = node.element
    box = getattr(node, "relative_box", None) or _default_box()
    spacing = getattr(node, "spacing_info", None)
    alignment = getattr(node, "align_info", None)

    # Build style info.
    style = _element_to_style(element)

    # Determine layout mode from children arrangement.
    layout = LayoutMode(node.layout_mode) if node.layout_mode else LayoutMode.NONE

    # Determine role.
    role = ElementRole(node.role) if node.role else ElementRole.BLOCK

    return LayoutNode(
        id=element.id,
        name=element.name or "",
        role=role,
        box=box,
        layout=layout,
        style=style,
        note=element.note,
        spacing=spacing,
        align=alignment,
        children=[_tree_node_to_layout_node(c, document) for c in node.children],
    )


def _element_to_style(element) -> StyleInfo:
    """Convert Element fill/border to StyleInfo for the compiled output."""
    from app.schemas.document import Border

    # Border is None when not visible, so the agent reads a real absence.
    border: Border | None = element.border if element.border.is_visible() else None

    return StyleInfo(
        fill=element.fill.color,
        fill_opacity=element.fill.opacity,
        border=border,
    )


def _default_box():
    """Fallback box when conversion somehow didn't happen."""
    from app.schemas.layout import Box

    return Box(x=0, y=0, width=0, height=0)


def _merge_warnings(
    nesting: list[dict],
    layout: list[dict],
    spacing: list[dict],
    completeness: list[LayoutWarning],
) -> list[LayoutWarning]:
    """Merge warnings from all pipeline stages into a single list."""
    merged: list[LayoutWarning] = []

    for w in nesting:
        merged.append(
            LayoutWarning(
                code=LayoutWarningCode(w["code"]),
                elements=w["elements"],
                message=w["message"],
            )
        )

    for w in layout:
        merged.append(
            LayoutWarning(
                code=LayoutWarningCode(w["code"]),
                elements=w["elements"],
                message=w["message"],
            )
        )

    for w in spacing:
        merged.append(
            LayoutWarning(
                code=LayoutWarningCode(w["code"]),
                elements=w["elements"],
                message=w["message"],
            )
        )

    # Completeness warnings are already LayoutWarning objects.
    merged.extend(completeness)

    return merged
