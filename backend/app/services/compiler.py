"""Document to layout compilation: the step that turns a drawing into agent-readable JSON.

Milestone: M4. This module is scaffolded in M1 so the API surface, the schema pair and the
frontend wiring all exist and can be tested for shape before the inference rules are written.

Until M4 lands, ``compile_document`` raises :class:`CompileNotImplemented` and the router maps
that to HTTP 501. The alternative -- shipping a partial compiler and calling it done -- would put
guessed layout data in front of Cursor, which is the failure mode this product exists to remove.

Planned pipeline, per docs/json-schema.md section 4:

    nesting.build_tree(elements, canvas)   -> containment tree, overlap warnings
    infer.layout_modes(tree)               -> row / column / stack / free per node
    infer.roles(tree)                      -> navigation / main / button / text ...
    infer.spacing_and_alignment(tree)      -> measured gaps, shared edges
    relative.to_percent(tree)              -> absolute px -> percent of parent
    validate.no_element_dropped(...)       -> the tree-versus-document invariant
"""

from __future__ import annotations

from app.schemas.document import MoGongDocument
from app.schemas.layout import LayoutDocument


class CompileNotImplemented(RuntimeError):
    """Raised by the compile pipeline until M4 delivers the inference rules."""


def compile_document(document: MoGongDocument) -> LayoutDocument:
    """Compile an editable document into the agent-facing layout.

    Pure function: no filesystem, no clock reads beyond the caller supplying a timestamp. That
    constraint is what makes the compiler the one part of MoGong with genuinely cheap, genuinely
    useful tests -- every case is data in, data out, reproducible without a server.
    """
    raise CompileNotImplemented("compile engine lands in milestone M4; see docs/architecture.md")
