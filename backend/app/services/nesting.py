"""Nesting tree construction: resolves geometric containment into a parent-child hierarchy.

The document stores a flat array of elements. The compiled layout needs a tree. This module is
the single place where that transformation happens, so the inference rules downstream can assume
every node knows its children and its parent.

Key invariant: every element from the document appears exactly once in the tree. If an element
somehow cannot be placed (a bug, not a valid drawing), it surfaces in the warnings rather than
being silently dropped. The compiler's own validate.py enforces this against the built tree.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from app.models.geometry import Rect

if TYPE_CHECKING:
    from app.schemas.document import CanvasConfig, Element


@dataclass
class TreeNode:
    """Internal working structure during compilation.

    Holds the element data plus the tree relationships that the inference rules need. This is
    deliberately separate from LayoutNode (the output schema) because:
    - TreeNode is mutable during inference; LayoutNode is immutable output.
    - TreeNode carries parent back-references that would create serialization cycles.
    - TreeNode may hold intermediate fields (raw rect, depth) that don't belong in the output.
    """

    element: Element
    rect: Rect
    parent: TreeNode | None = None
    children: list[TreeNode] = field(default_factory=list)
    depth: int = 0

    # Fields filled by inference passes
    layout_mode: str | None = None
    role: str | None = None

    @property
    def element_id(self) -> str:
        return self.element.id

    @property
    def is_root(self) -> bool:
        return self.element is None  # Synthetic root node has no element

    def walk(self) -> list[TreeNode]:
        """Depth-first traversal including self."""
        result = [self]
        for child in self.children:
            result.extend(child.walk())
        return result

    def leaf_count(self) -> int:
        """Count of nodes with no children."""
        if not self.children:
            return 1
        return sum(child.leaf_count() for child in self.children)


def _rect_of(element: Element) -> Rect:
    return Rect(element.x, element.y, element.width, element.height)


def _canvas_rect(canvas: CanvasConfig) -> Rect:
    return Rect(0, 0, canvas.width, canvas.height)


def _find_smallest_container(target: Rect, candidates: list[TreeNode]) -> TreeNode | None:
    """Find the smallest rect that fully contains target, from the candidate list.

    "Smallest" means minimum area among containers. This is the direct parent: a child should
    nest inside its tightest container, not the outermost one. A grandparent contains the child
    too, but the parent is closer, so the parent wins.

    Returns None when no candidate contains the target.
    """
    containers = [c for c in candidates if c.rect.contains(target)]
    if not containers:
        return None
    return min(containers, key=lambda c: c.rect.area)


def _detect_partial_overlaps(elements: list[Element]) -> list[tuple[str, str]]:
    """Find pairs of elements that partially overlap (neither contains the other).

    Per docs/json-schema.md section 4 and docs/spec.md section 5, this is an ambiguous drawing
    state: the elements are siblings, not parent-child, and the user gets a warning telling them
    the drawing didn't read cleanly.
    """
    pairs: list[tuple[str, str]] = []
    for i, left in enumerate(elements):
        left_rect = _rect_of(left)
        for right in elements[i + 1 :]:
            if left_rect.partially_overlaps(_rect_of(right)):
                pairs.append((left.id, right.id))
    return pairs


def build_tree(elements: list[Element], canvas: CanvasConfig) -> tuple[TreeNode, list[dict]]:
    """Build the containment tree from flat element list.

    Returns:
        TreeNode: Synthetic root node with canvas dimensions as its rect. Its children are
                  the elements that have no parent container (the outermost regions).
        list[dict]: Nesting warnings (currently PARTIAL_OVERLAP). Each dict has:
                    - code: warning code string
                    - elements: list of element IDs involved
                    - message: human-readable explanation

    Algorithm:
    1. Sort elements by area descending (larger elements processed first = outer containers).
    2. Process in that order. For each element, find the smallest already-placed container.
    3. If found, attach as child; otherwise attach to root.
    4. Detect and warn about partial overlaps (ambiguous sibling relationships).
    """
    warnings: list[dict] = []

    # Detect partial overlaps before building the tree, so the warning can name the pairs.
    partial_overlaps = _detect_partial_overlaps(elements)
    for elem_id_a, elem_id_b in partial_overlaps:
        warnings.append(
            {
                "code": "PARTIAL_OVERLAP",
                "elements": [elem_id_a, elem_id_b],
                "message": (
                    f"{elem_id_a} and {elem_id_b} partially overlap. "
                    f"Treated as siblings, neither contains the other."
                ),
            }
        )

    # Create synthetic root node representing the canvas.
    canvas_rect = _canvas_rect(canvas)
    root = TreeNode(
        element=None,  # type: ignore - synthetic root has no element
        rect=canvas_rect,
        parent=None,
        children=[],
        depth=0,
    )

    if not elements:
        return root, warnings

    # Sort by area descending: larger elements become containers for smaller ones.
    # Python's sort is stable, so elements with equal area preserve document order.
    sorted_elements = sorted(elements, key=lambda e: _rect_of(e).area, reverse=True)

    # Process each element: find its smallest container among already-placed nodes.
    placed: list[TreeNode] = [root]  # Start with root as the initial container

    for element in sorted_elements:
        rect = _rect_of(element)
        node = TreeNode(element=element, rect=rect, parent=None, children=[], depth=0)

        # Find the smallest container (excluding self, though not yet in placed).
        parent = _find_smallest_container(rect, placed)

        if parent is not None:
            node.parent = parent
            node.depth = parent.depth + 1
            parent.children.append(node)
        else:
            # No container found: attach to root (should be rare; root contains all canvas elements).
            node.parent = root
            node.depth = 1
            root.children.append(node)

        # Add this node so subsequent elements can nest inside it.
        placed.append(node)

    # Sort children in each subtree by geometric order (top-to-bottom, left-to-right).
    _sort_children_by_position(root)

    return root, warnings


def _sort_children_by_position(node: TreeNode) -> None:
    """Recursively sort children in reading order (top-to-bottom, then left-to-right).

    This matches the compiled spec's expectation that sibling order reflects visual order,
    which is the assumption the layout mode inference makes when detecting rows and columns.
    """
    if not node.children:
        return

    # Sort by y primarily (top edge), then by x (left edge) for same-y elements.
    # We use top edge, not center, because layout cares about the flow order.
    node.children.sort(key=lambda child: (child.rect.y, child.rect.x))

    for child in node.children:
        _sort_children_by_position(child)
