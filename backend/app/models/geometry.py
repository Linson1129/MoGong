"""Immutable geometry primitives used inside the compiler.

Deliberately separate from the Pydantic schemas: schemas guard the wire format and validate
hostile input, while these are the internal working values the compiler passes around. Keeping
them apart means the compiler never mutates a validated model, which would silently invalidate
the checks that produced it.
"""

from __future__ import annotations

from dataclasses import dataclass

# Boundary comparisons are inclusive: a child touching the parent edge counts as contained.
# See docs/spec.md section 5. Using strict inequality here would drop zero-margin nested layouts,
# which is the common case when a user snaps a child flush against a parent.
EPSILON = 1e-9


@dataclass(frozen=True, slots=True)
class Rect:
    """Axis-aligned rectangle. Top-left origin, non-negative extents."""

    x: float
    y: float
    width: float
    height: float

    @property
    def right(self) -> float:
        return self.x + self.width

    @property
    def bottom(self) -> float:
        return self.y + self.height

    @property
    def area(self) -> float:
        return self.width * self.height

    @property
    def center_x(self) -> float:
        return self.x + self.width / 2

    @property
    def center_y(self) -> float:
        return self.y + self.height / 2

    def contains(self, other: Rect) -> bool:
        """True when ``other`` lies entirely within this rect, boundaries included."""
        return (
            other.x >= self.x - EPSILON
            and other.y >= self.y - EPSILON
            and other.right <= self.right + EPSILON
            and other.bottom <= self.bottom + EPSILON
        )

    def overlaps(self, other: Rect) -> bool:
        """True when the two rects share any interior area. Touching edges do not count."""
        return not (
            other.x >= self.right - EPSILON
            or other.right <= self.x + EPSILON
            or other.y >= self.bottom - EPSILON
            or other.bottom <= self.y + EPSILON
        )

    def overlap_area(self, other: Rect) -> float:
        width = min(self.right, other.right) - max(self.x, other.x)
        height = min(self.bottom, other.bottom) - max(self.y, other.y)
        if width <= 0 or height <= 0:
            return 0.0
        return width * height

    def partially_overlaps(self, other: Rect) -> bool:
        """Overlap that is neither containment nor containment reversed.

        This is the invalid state from docs/spec.md section 5: it is not a nesting relation, and
        it must be reported rather than resolved, because the user's intent is genuinely ambiguous.
        """
        if not self.overlaps(other):
            return False
        return not self.contains(other) and not other.contains(self)

    def to_relative(self, parent: Rect) -> Rect:
        """Convert to percentages of ``parent``. Parent edges must be non-zero by schema."""
        return Rect(
            x=(self.x - parent.x) / parent.width * 100,
            y=(self.y - parent.y) / parent.height * 100,
            width=self.width / parent.width * 100,
            height=self.height / parent.height * 100,
        )
