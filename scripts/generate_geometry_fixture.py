"""Regenerate the shared geometry truth table.

    python scripts/generate_geometry_fixture.py

Writes fixtures/cases/geometry-truth-table.json, which BOTH test suites are checked against:
pytest recomputes it from the Python geometry module, Vitest from the TypeScript one. Each side
asserting equality with the same committed file is what turns a divergence between the two
implementations into a failing test instead of an editor preview that quietly disagrees with the
exported JSON.

Run this deliberately, after reading the diff. Regenerating to make a test pass would replace a
real disagreement between the two sides with a record of whichever one changed.
"""

from __future__ import annotations

import json
import sys
from itertools import product
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.models.geometry import Rect

REPO_ROOT = Path(__file__).resolve().parents[1]
OUTPUT = REPO_ROOT / "fixtures" / "cases" / "geometry-truth-table.json"

# Hand-picked coordinates that hit every interesting relation: flush edges, corner contact,
# one-pixel escapes, identical boxes, full-width bands, and empty separation. These are the cases
# where an epsilon or an operator precedence error changes the answer.
ANCHORS = [(0.0, 0.0), (50.0, 50.0), (100.0, 0.0), (0.0, 100.0), (100.0, 100.0)]
SIZES = [(1.0, 1.0), (50.0, 50.0), (100.0, 50.0), (50.0, 100.0), (100.0, 100.0)]

# Offsets of the second box relative to the first. For each size in SIZES the set carries the exact
# flush contact and the contact plus one pixel of escape -- 50 and 51, 100 and 101, 150 and 151 --
# plus 1, which is simultaneously a deep overlap for a wide box and a total escape for the 1x1 one.
OFFSETS = [
    -151.0,
    -150.0,
    -101.0,
    -100.0,
    -51.0,
    -50.0,
    -1.0,
    0.0,
    1.0,
    50.0,
    51.0,
    100.0,
    101.0,
    150.0,
    151.0,
]

# How many input pairs to keep per relation signature crossed with size pair. See `dedupe` for why
# the file is sampled at all rather than written out in full.
EXAMPLES_PER_CLASS = 2


def base_boxes() -> list[tuple[Rect, int]]:
    """The reference rectangles, each tagged with the index of its size in SIZES."""
    return [
        (Rect(x, y, width, height), size_index)
        for (x, y) in ANCHORS
        for size_index, (width, height) in enumerate(SIZES)
    ]


def enumerate_pairs() -> list[tuple[Rect, Rect, tuple[int, int]]]:
    """Every pair the sweep can produce, with the size indices that made it, in a fixed order.

    Systematic rather than curated, because the interesting bugs live in combinations nobody
    thought to write down -- a one-pixel overflow on the bottom edge only, say.

    Offset and size vary together on purpose. Sweeping them separately would never produce a small
    box sitting just inside a large one, which is the ordinary nested layout, and would therefore
    miss the case that matters most: a child that escapes its parent by exactly one pixel on the
    bottom-right corner and nothing else.
    """
    pairs: list[tuple[Rect, Rect, tuple[int, int]]] = []
    for base, base_index in base_boxes():
        for dx, dy in product(OFFSETS, OFFSETS):
            for other_index, (width, height) in enumerate(SIZES):
                shifted = Rect(base.x + dx, base.y + dy, width, height)
                pairs.append((base, shifted, (base_index, other_index)))
    return pairs


def signature(left: Rect, right: Rect) -> tuple[bool, ...]:
    """The qualitative answer set a pair produces, used to group equivalent cases.

    The group key is computed by this Python implementation, so a divergence in the TypeScript one
    cannot hide inside a dropped row: the tests iterate over whatever pairs are committed, and each
    side recomputes their answers from scratch. The grouping only decides how many examples of each
    distinct outcome land in the file.
    """
    return (
        left.overlaps(right),
        left.contains(right),
        right.contains(left),
        left.partially_overlaps(right),
        # Separating "shares a sliver" from "shares a whole region" keeps thin contacts, where a
        # sign or precedence error shows up, from collapsing into the same bucket as a deep overlap.
        left.overlap_area(right) > 1.0,
    )


def dedupe(pairs: list[tuple[Rect, Rect, tuple[int, int]]]) -> list[tuple[Rect, Rect]]:
    """Keep a bounded but diverse set of examples, grouped by relation signature and size pair.

    The full sweep is twenty-eight thousand pairs and the overwhelming majority of them repeat the
    same five answers. Writing all of them out would produce a megabyte of JSON nobody reads in a
    diff, which would make the file less trustworthy rather than more: an unreviewable golden file
    is a golden file that gets regenerated instead of investigated.

    The size pair is part of the group key rather than the group cap being larger, because a plain
    per-signature quota fills from whichever anchors come first in this order and would record only
    one-pixel boxes. Dividing by extents is what relative-coordinate arithmetic is most likely to
    get wrong between the two implementations, so it has to be represented.
    """
    seen: dict[tuple[tuple[bool, ...], tuple[int, int]], int] = {}
    kept: list[tuple[Rect, Rect]] = []
    for left, right, size_pair in pairs:
        # Identical boxes are dropped: they carry no information about the comparisons, and the
        # ambiguity they would expose (two elements each containing the other, so no unique parent)
        # is a compiler concern with its own test in M4, not a geometry one.
        if left == right:
            continue
        key = (signature(left, right), size_pair)
        if seen.get(key, 0) >= EXAMPLES_PER_CLASS:
            continue
        seen[key] = seen.get(key, 0) + 1
        kept.append((left, right))
    return kept


def describe(rect: Rect) -> dict[str, float]:
    return {"x": rect.x, "y": rect.y, "width": rect.width, "height": rect.height}


def main() -> int:
    rows = []
    for left, right in dedupe(enumerate_pairs()):
        rows.append(
            {
                "a": describe(left),
                "b": describe(right),
                "containsAB": left.contains(right),
                "containsBA": right.contains(left),
                "overlaps": left.overlaps(right),
                "partiallyOverlaps": left.partially_overlaps(right),
                "overlapArea": round(left.overlap_area(right), 6),
                # Only meaningful against a box with positive extents, which the schema guarantees
                # for a parent but the sweep does not: a 1x1 anchor can be the smaller box here.
                "relativeBInA": (
                    {
                        key: round(value, 6)
                        for key, value in describe(right.to_relative(left)).items()
                    }
                    if left.width > 0 and left.height > 0
                    else None
                ),
            }
        )

    payload = {
        "_generated_by": "scripts/generate_geometry_fixture.py",
        "_warning": (
            "Committed golden file. Both the Python and the TypeScript geometry modules are "
            "checked against it. Regenerate deliberately, never to make a test pass."
        ),
        "_note": (
            "Values are rounded to six decimals. Both test sides compare with a tolerance instead "
            "of exact equality, because Python rounds halves to even and JavaScript rounds halves "
            "away from zero, which would make the file's own last digit a false divergence."
        ),
        "caseCount": len(rows),
        "cases": rows,
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {len(rows)} cases to {OUTPUT.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
