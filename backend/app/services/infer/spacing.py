"""Spacing and alignment inference: measures gaps between siblings.

When adjacent siblings in a row or column do not touch, the compiler emits the measured gap
so spacing becomes data rather than another guess the agent has to make.

See docs/json-schema.md section 4.3 and 4.4.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from app.schemas.layout import AlignInfo, LayoutMode, SpacingInfo

if TYPE_CHECKING:
    from app.services.nesting import TreeNode

# Tolerance for alignment detection, in pixels. A shared edge within this margin counts.
ALIGNMENT_TOLERANCE_PX = 2.0


@dataclass
class GapMeasurement:
    """Internal measurement of gaps between siblings."""

    gaps: list[float]  # Individual gaps in pixels
    axis: LayoutMode
    consistent: bool
    average_gap: float


def _measure_row_gaps(children: list[TreeNode], parent_width: float) -> GapMeasurement:
    """Measure horizontal gaps between children in a row layout.

    Children should be sorted left-to-right by nesting.py.
    """
    if len(children) < 2:
        return GapMeasurement([], LayoutMode.ROW, True, 0.0)

    gaps: list[float] = []
    for i in range(len(children) - 1):
        current = children[i]
        next_child = children[i + 1]
        gap = next_child.rect.x - current.rect.right
        # Negative gap means overlap, clamp to 0.
        gaps.append(max(0.0, gap))

    if not gaps:
        return GapMeasurement([], LayoutMode.ROW, True, 0.0)

    # Convert to percentages of parent width.
    gaps_pct = [g / parent_width * 100 for g in gaps]

    # Check consistency: all gaps within 1% of each other.
    if len(gaps_pct) > 1:
        min_gap = min(gaps_pct)
        max_gap = max(gaps_pct)
        consistent = (max_gap - min_gap) < 1.0
    else:
        consistent = True

    avg = sum(gaps_pct) / len(gaps_pct)
    return GapMeasurement(gaps_pct, LayoutMode.ROW, consistent, avg)


def _measure_column_gaps(children: list[TreeNode], parent_height: float) -> GapMeasurement:
    """Measure vertical gaps between children in a column layout."""
    if len(children) < 2:
        return GapMeasurement([], LayoutMode.COLUMN, True, 0.0)

    gaps: list[float] = []
    for i in range(len(children) - 1):
        current = children[i]
        next_child = children[i + 1]
        gap = next_child.rect.y - current.rect.bottom
        gaps.append(max(0.0, gap))

    if not gaps:
        return GapMeasurement([], LayoutMode.COLUMN, True, 0.0)

    gaps_pct = [g / parent_height * 100 for g in gaps]

    if len(gaps_pct) > 1:
        min_gap = min(gaps_pct)
        max_gap = max(gaps_pct)
        consistent = (max_gap - min_gap) < 1.0
    else:
        consistent = True

    avg = sum(gaps_pct) / len(gaps_pct)
    return GapMeasurement(gaps_pct, LayoutMode.COLUMN, consistent, avg)


def measure_spacing(
    children: list[TreeNode],
    layout_mode: LayoutMode,
    parent_rect: TreeNode.rect,
) -> tuple[SpacingInfo | None, str | None]:
    """Measure gap between adjacent siblings.

    Returns:
        (spacing_info, warning_message): The spacing data, and an optional warning if
                                          gaps are inconsistent.
    """
    if len(children) < 2:
        return None, None

    if layout_mode == LayoutMode.ROW:
        measurement = _measure_row_gaps(children, parent_rect.width)
    elif layout_mode == LayoutMode.COLUMN:
        measurement = _measure_column_gaps(children, parent_rect.height)
    else:
        # Stack and free don't have meaningful sequential gaps.
        return None, None

    if not measurement.gaps:
        return None, None

    # Skip if all gaps are zero (touching siblings).
    if all(g < 0.1 for g in measurement.gaps):
        return None, None

    spacing = SpacingInfo(
        axis=measurement.axis,
        gap=round(measurement.average_gap, 2),
        consistent=measurement.consistent,
    )

    warning = None
    if not measurement.consistent:
        ids = [c.element_id for c in children]
        warning = (
            f"Gaps between siblings {', '.join(ids)} are inconsistent. "
            f"Average {measurement.average_gap:.1f}% reported; consider adjusting the drawing."
        )

    return spacing, warning


def detect_alignment(children: list[TreeNode]) -> AlignInfo | None:
    """Detect if all children share an edge or center line within tolerance.

    Returns alignment info only when it holds for ALL children, because a partial
    alignment is jitter, not intent.
    """
    if len(children) < 2:
        return None

    # Check horizontal alignment (left edge, right edge, or center).
    horizontal = _detect_horizontal_alignment(children)

    # Check vertical alignment (top edge, bottom edge, or center).
    vertical = _detect_vertical_alignment(children)

    if horizontal is None and vertical is None:
        return None

    return AlignInfo(
        horizontal=horizontal,
        vertical=vertical,
        tolerance_px=ALIGNMENT_TOLERANCE_PX,
    )


def _detect_horizontal_alignment(children: list[TreeNode]) -> str | None:
    """Check if all children share left, right, or center x-alignment."""
    lefts = [c.rect.x for c in children]
    rights = [c.rect.right for c in children]
    centers = [c.rect.center_x for c in children]

    if _all_close(lefts, ALIGNMENT_TOLERANCE_PX):
        return "left"
    if _all_close(rights, ALIGNMENT_TOLERANCE_PX):
        return "right"
    if _all_close(centers, ALIGNMENT_TOLERANCE_PX):
        return "center"

    return None


def _detect_vertical_alignment(children: list[TreeNode]) -> str | None:
    """Check if all children share top, bottom, or center y-alignment."""
    tops = [c.rect.y for c in children]
    bottoms = [c.rect.bottom for c in children]
    centers = [c.rect.center_y for c in children]

    if _all_close(tops, ALIGNMENT_TOLERANCE_PX):
        return "top"
    if _all_close(bottoms, ALIGNMENT_TOLERANCE_PX):
        return "bottom"
    if _all_close(centers, ALIGNMENT_TOLERANCE_PX):
        return "middle"

    return None


def _all_close(values: list[float], tolerance: float) -> bool:
    """Check if all values are within tolerance of each other."""
    if len(values) < 2:
        return False
    min_val = min(values)
    max_val = max(values)
    return (max_val - min_val) <= tolerance


def infer_spacing_and_alignment(node: TreeNode) -> list[dict]:
    """Walk the tree and measure spacing/alignment for each container.

    Returns list of warnings for inconsistent gaps.
    """
    warnings: list[dict] = []

    # Attach spacing/alignment info to nodes with children.
    if not node.is_root and node.children:
        mode_str = node.layout_mode
        if mode_str in ("row", "column"):
            layout_mode = LayoutMode(mode_str)
            spacing, warning = measure_spacing(node.children, layout_mode, node.rect)
            alignment = detect_alignment(node.children)

            # Store for later assembly.
            # We use duck-typing here: TreeNode will get these fields dynamically.
            node.spacing_info = spacing  # type: ignore[attr-defined]
            node.align_info = alignment  # type: ignore[attr-defined]

            if warning:
                warnings.append(
                    {
                        "code": "INCONSISTENT_GAP",
                        "elements": [c.element_id for c in node.children],
                        "message": warning,
                    }
                )

    for child in node.children:
        warnings.extend(infer_spacing_and_alignment(child))

    return warnings
