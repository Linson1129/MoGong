/**
 * The TypeScript half of the geometry drift guard.
 *
 * `fixtures/cases/geometry-truth-table.json` is a golden file committed once from
 * `backend/app/models/geometry.py`. This suite recomputes every case with the module the editor
 * actually uses, `src/lib/geometry.ts`, and compares.
 *
 * The failure this prevents is specific and expensive: the canvas deciding a rectangle is nested
 * while the compiler decides it is not, so the user draws something, exports it, and gets a page
 * that does not match what they saw. Both sides are checked against one artifact rather than against
 * each other because they run in different languages and cannot share anything at runtime.
 *
 * When this fails, fix `src/lib/geometry.ts`. Regenerating the fixture records whichever side moved
 * last as correct, which is the opposite of what the file is for.
 *
 * Lives under `tests/` rather than beside the module it imports because it reaches outside the
 * frontend package into repository territory, and reading it requires knowing the backend exists.
 */

import { existsSync, readFileSync } from "node:fs";
import nodePath from "node:path";

import { describe, expect, it } from "vitest";

import {
  contains,
  overlapArea,
  overlaps,
  partiallyOverlaps,
  toRelativeBox,
  type Rect,
} from "@/lib/geometry";

interface GoldenRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface GoldenCase {
  a: GoldenRect;
  b: GoldenRect;
  containsAB: boolean;
  containsBA: boolean;
  overlaps: boolean;
  partiallyOverlaps: boolean;
  overlapArea: number;
  relativeBInA: GoldenRect | null;
}

interface GoldenFile {
  caseCount: number;
  cases: GoldenCase[];
}

const FIXTURE_RELATIVE = nodePath.join("fixtures", "cases", "geometry-truth-table.json");

// The golden file sits at the repository root, one level above this package, and reaching it by
// walking up from the working directory rather than from this file's URL is deliberate: Vite
// rewrites `import.meta.url` into a `/@fs/` server route, which names the right place but is not a
// filesystem path that `readFileSync` can open.
function findFixture(): string {
  const tried: string[] = [];
  let directory = process.cwd();
  for (let depth = 0; depth < 4; depth += 1) {
    const candidate = nodePath.resolve(directory, FIXTURE_RELATIVE);
    tried.push(candidate);
    if (existsSync(candidate)) return candidate;
    directory = nodePath.dirname(directory);
  }
  throw new Error(
    `geometry-truth-table.json not found. Tried:\n${tried.join("\n")}\n` +
      "Run `python scripts/generate_geometry_fixture.py` from the repository root and commit " +
      "the result.",
  );
}

// The file stores values rounded to six decimals while this side has the full figure, so the last
// place may differ without either implementation being wrong. Anything larger is a real divergence.
const TOLERANCE = 1e-6;

function loadFile(): GoldenFile {
  return JSON.parse(readFileSync(findFixture(), "utf8")) as GoldenFile;
}

function closeTo(golden: number, computed: number): boolean {
  return Math.abs(golden - computed) <= TOLERANCE;
}

const file = loadFile();

describe("geometry truth table", () => {
  it("has enough cases to be a sweep", () => {
    // An empty table would make the comparison below pass while checking nothing at all.
    expect(file.cases.length).toBeGreaterThanOrEqual(50);
    expect(file.caseCount).toBe(file.cases.length);
  });

  it("covers every relation the editor can show", () => {
    const seen = new Set(
      file.cases.map((testCase) =>
        testCase.overlaps
          ? [testCase.containsAB, testCase.containsBA, testCase.partiallyOverlaps].join(",")
          : "disjoint",
      ),
    );

    expect(seen.has("false,false,true")).toBe(true); // partial overlap, the invalid state
    expect(seen.has("true,false,false")).toBe(true); // b nested in a
    expect(seen.has("false,true,false")).toBe(true); // a nested in b
    expect(seen.has("disjoint")).toBe(true);
  });

  it("agrees with the Python implementation on every case", () => {
    const mismatches: string[] = [];

    for (const [index, testCase] of file.cases.entries()) {
      const a: Rect = testCase.a;
      const b: Rect = testCase.b;
      const failures: string[] = [];

      const booleans: Array<[string, boolean, boolean]> = [
        ["containsAB", testCase.containsAB, contains(a, b)],
        ["containsBA", testCase.containsBA, contains(b, a)],
        ["overlaps", testCase.overlaps, overlaps(a, b)],
        ["partiallyOverlaps", testCase.partiallyOverlaps, partiallyOverlaps(a, b)],
      ];
      for (const [label, golden, computed] of booleans) {
        if (golden !== computed) failures.push(`${label}: golden ${golden}, computed ${computed}`);
      }

      const goldenArea = testCase.overlapArea;
      const computedArea = overlapArea(a, b);
      if (!closeTo(goldenArea, computedArea)) {
        failures.push(`overlapArea: golden ${goldenArea}, computed ${computedArea}`);
      }

      if (testCase.relativeBInA === null) {
        if (a.width > 0 && a.height > 0) {
          failures.push("relativeBInA: golden is null but the parent has extents");
        }
      } else {
        const relative = toRelativeBox(b, a);
        for (const key of ["x", "y", "width", "height"] as const) {
          if (!closeTo(testCase.relativeBInA[key], relative[key])) {
            failures.push(
              `relativeBInA.${key}: golden ${testCase.relativeBInA[key]}, computed ${relative[key]}`,
            );
          }
        }
      }

      if (failures.length > 0) {
        mismatches.push(`case ${index} a=${JSON.stringify(a)} b=${JSON.stringify(b)}\n    ${failures.join("\n    ")}`);
      }
    }

    expect(
      mismatches,
      `${mismatches.length} of ${file.cases.length} cases disagree with the golden file. ` +
        "src/lib/geometry.ts and backend/app/models/geometry.py must change in the same commit, " +
        "with the fixture regenerated.\n\n" +
        mismatches.join("\n"),
    ).toEqual([]);
  });
});
