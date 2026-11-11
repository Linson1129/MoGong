"""The Python half of the geometry drift guard.

``fixtures/cases/geometry-truth-table.json`` is a golden file computed once from
``app.models.geometry`` and committed. The TypeScript module in ``frontend/src/lib/geometry.ts``
answers the same questions for the live editor preview, and is checked against the same file by
``frontend/tests/geometry-truth-table.test.ts``.

That the two sides are compared through a committed artifact rather than against each other is the
point. A shared runtime would be impossible across a language boundary, and a hand-written table of
cases would only ever contain the cases someone remembered. When this test fails, the editor is
showing one nesting structure while the compiler writes another, and the user finds out from the
JSON -- so fix the implementation, never the file. Regenerate only as part of a deliberate change to
the nesting semantics, which is a docs/spec.md section 5 revision.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.models.geometry import Rect

FIXTURE_PATH = (
    Path(__file__).resolve().parents[2] / "fixtures" / "cases" / "geometry-truth-table.json"
)

# The golden file stores values rounded to six decimals, so the recomputed figure may differ in the
# last place it kept. Anything larger than this is a real disagreement, not a representation error.
TOLERANCE = 1e-6


def load_cases() -> list[dict[str, Any]]:
    if not FIXTURE_PATH.exists():
        raise AssertionError(
            f"{FIXTURE_PATH.name} is missing. Run `python scripts/generate_geometry_fixture.py` "
            "from the repository root and commit the result."
        )
    payload = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    return payload["cases"]


def rect_of(case: dict[str, Any], key: str) -> Rect:
    box = case[key]
    return Rect(box["x"], box["y"], box["width"], box["height"])


def float_close(expected: float, actual: float) -> bool:
    return abs(expected - actual) <= TOLERANCE


def check_bool(label: str, golden: bool, computed: bool, failures: list[str]) -> None:
    if golden is not computed:
        failures.append(f"{label}: golden {golden}, computed {computed}")


def check_number(label: str, golden: float, computed: float, failures: list[str]) -> None:
    if not float_close(golden, computed):
        failures.append(f"{label}: golden {golden}, computed {computed}")


class TestFixtureShape:
    """Guards against this file passing by checking nothing.

    An empty or degenerate truth table would make every comparison below trivially true, which is
    worse than having no test at all because it looks like coverage.
    """

    def test_has_enough_cases_to_be_a_sweep(self) -> None:
        cases = load_cases()
        assert len(cases) >= 50, f"only {len(cases)} cases; the sweep has been narrowed by mistake"

    def test_declared_count_matches_the_body(self) -> None:
        payload = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
        assert payload["caseCount"] == len(payload["cases"])

    def test_covers_every_relation_the_editor_can_show(self) -> None:
        # A user can produce each of these by dragging, so each must be checked. Losing a row type
        # to a generator edit would leave that relation unguarded on exactly one side.
        seen: set[tuple[str, ...]] = set()
        for case in load_cases():
            nesting_flags = tuple(
                key for key in ("containsAB", "containsBA", "partiallyOverlaps") if case[key]
            )
            seen.add(("disjoint",) if not case["overlaps"] else nesting_flags or ("mutual",))

        assert seen >= {("disjoint",), ("containsAB",), ("containsBA",), ("partiallyOverlaps",)}, (
            f"truth table no longer covers every nesting relation, found: {sorted(seen)}"
        )


class TestGeometryAgainstFixture:
    def test_every_case_recomputes_identically(self) -> None:
        mismatches: list[str] = []

        for index, case in enumerate(load_cases()):
            left, right = rect_of(case, "a"), rect_of(case, "b")
            failures: list[str] = []

            check_bool("containsAB", case["containsAB"], left.contains(right), failures)
            check_bool("containsBA", case["containsBA"], right.contains(left), failures)
            check_bool("overlaps", case["overlaps"], left.overlaps(right), failures)
            partial = left.partially_overlaps(right)
            check_bool("partiallyOverlaps", case["partiallyOverlaps"], partial, failures)
            check_number("overlapArea", case["overlapArea"], left.overlap_area(right), failures)

            relative = case["relativeBInA"]
            if relative is None:
                if left.width > 0 and left.height > 0:
                    failures.append("relativeBInA: golden is null but the parent has extents")
            else:
                computed = right.to_relative(left)
                check_number("relativeBInA.x", relative["x"], computed.x, failures)
                check_number("relativeBInA.y", relative["y"], computed.y, failures)
                check_number("relativeBInA.width", relative["width"], computed.width, failures)
                check_number("relativeBInA.height", relative["height"], computed.height, failures)

            if failures:
                detail = "\n    ".join(failures)
                mismatches.append(f"case {index} a={left} b={right}\n    {detail}")

        assert not mismatches, (
            f"{len(mismatches)} of {len(load_cases())} cases disagree with the golden file. "
            "If app/models/geometry.py changed on purpose, the TypeScript module must change with "
            "it and the fixture regenerated in the same commit.\n\n" + "\n".join(mismatches)
        )
