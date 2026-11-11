/**
 * Client-side geometry helpers that have no counterpart in the shared truth table.
 *
 * The containment and overlap predicates are covered by `tests/geometry-truth-table.test.ts`, which
 * checks them against the Python implementation. What is tested here is the drag arithmetic: the
 * conversions that turn two pointer positions into a rectangle, which exist only in the browser and
 * therefore have no second implementation to disagree with.
 */

import { describe, expect, it } from "vitest";

import {
  findParent,
  normalizeRect,
  rectArea,
  rectFromCorners,
  snap,
  toRelativeBox,
  type Rect,
} from "@/lib/geometry";

const rect = (x: number, y: number, width: number, height: number): Rect => ({
  x,
  y,
  width,
  height,
});

describe("normalizeRect", () => {
  it("leaves a forward box untouched", () => {
    const box = rect(10, 20, 30, 40);
    expect(normalizeRect(box)).toEqual(box);
  });

  it("folds a drag up and to the left into the equivalent box", () => {
    expect(normalizeRect(rect(100, 100, -40, -25))).toEqual(rect(60, 75, 40, 25));
  });

  it("folds each axis independently", () => {
    // A drag can go left while still going down, and a single-axis fix would leave half inverted.
    expect(normalizeRect(rect(100, 50, -40, 25))).toEqual(rect(60, 50, 40, 25));
    expect(normalizeRect(rect(100, 50, 40, -25))).toEqual(rect(100, 25, 40, 25));
  });

  it("treats a zero extent as already normalized", () => {
    expect(normalizeRect(rect(5, 5, 0, 10))).toEqual(rect(5, 5, 0, 10));
  });
});

describe("rectFromCorners", () => {
  it("produces the same box from either drag direction", () => {
    expect(rectFromCorners(10, 10, 70, 50)).toEqual(rectFromCorners(70, 50, 10, 10));
    expect(rectFromCorners(10, 10, 70, 50)).toEqual(rect(10, 10, 60, 40));
  });

  it("never returns a negative extent, so no consumer has to ask", () => {
    for (const [ax, ay, bx, by] of [
      [0, 0, -10, -10],
      [-10, 5, 20, -3],
      [100, 0, 0, 100],
    ]) {
      const box = rectFromCorners(ax, ay, bx, by);
      expect(box.width).toBeGreaterThanOrEqual(0);
      expect(box.height).toBeGreaterThanOrEqual(0);
      expect(box.x).toBe(Math.min(ax, bx));
      expect(box.y).toBe(Math.min(ay, by));
    }
  });
});

describe("toRelativeBox", () => {
  it("expresses a centred child as percentages of its parent", () => {
    const parent = rect(0, 0, 200, 100);
    expect(toRelativeBox(rect(50, 25, 100, 50), parent)).toEqual({
      x: 25,
      y: 25,
      width: 50,
      height: 50,
    });
  });

  it("offsets by the parent origin rather than the page", () => {
    // A child at canvas x=150 inside a parent starting at x=100 sits at 50 units into the parent,
    // and reporting 150 would place it outside the compiled section.
    expect(toRelativeBox(rect(150, 0, 50, 10), rect(100, 0, 100, 100)).x).toBe(50);
  });

  it("does not clamp a child that escapes its parent", () => {
    // An honest reading of an off-by-a-few-pixels drawing matters more than a tidy number: clamping
    // here would hide from the compile preview exactly the problem the user can see on canvas.
    const relative = toRelativeBox(rect(0, 0, 150, 50), rect(0, 0, 100, 100));
    expect(relative.width).toBe(150);
    expect(toRelativeBox(rect(-10, 0, 20, 20), rect(0, 0, 100, 100)).x).toBe(-10);
  });

  it("refuses a parent with no extents instead of producing Infinity", () => {
    // JSON has no Infinity, so an unguarded division would serialise the geometry as null.
    expect(() => toRelativeBox(rect(0, 0, 10, 10), rect(0, 0, 0, 0))).toThrow(
      /positive extents/,
    );
  });
});

describe("snap", () => {
  it("rounds to the grid when enabled", () => {
    expect(snap(23, 8, true)).toBe(24);
    expect(snap(19, 8, true)).toBe(16);
    expect(snap(-9, 8, true)).toBe(-8);
  });

  it("returns the value untouched when disabled", () => {
    // Hand placement must survive with snapping off, otherwise the tool would be unable to draw a
    // rectangle exactly where the pointer says.
    expect(snap(23, 8, false)).toBe(23);
  });

  it("ignores a zero grid rather than dividing by it", () => {
    expect(snap(23, 0, true)).toBe(23);
  });
});

describe("findParent", () => {
  const page = rect(0, 0, 1440, 900);
  const section = rect(100, 100, 800, 400);
  const card = rect(120, 120, 200, 100);

  it("picks the smallest containing box, not the first", () => {
    // A card inside a section inside a page has the section as its parent. Choosing by first match
    // would make the compiled tree depend on the order the rectangles happened to be drawn in.
    expect(findParent(card, [page, section, card])).toBe(section);
    expect(findParent(card, [card, section, page])).toBe(section);
  });

  it("never returns the target itself", () => {
    expect(findParent(section, [section])).toBeNull();
  });

  it("returns null for a top-level box", () => {
    expect(findParent(page, [page, section, card])).toBeNull();
  });

  it("treats a flush edge as containment, so a snapped child keeps its parent", () => {
    const flushChild = rect(100, 100, 400, 200);
    expect(findParent(flushChild, [section, flushChild])).toBe(section);
  });

  it("still returns a parent when two candidates tie on area", () => {
    // Two boxes with identical geometry both containing the target is a malformed drawing, and the
    // tie is broken by iteration order rather than by anything principled. That is acceptable only
    // because the two candidates are indistinguishable -- services/validate.py raises DUPLICATE_GEOMETRY
    // for exactly this drawing, so the ambiguity is reported instead of silently resolved.
    const first = rect(0, 0, 100, 100);
    const second = rect(0, 0, 100, 100);
    const target = rect(10, 10, 20, 20);
    expect(findParent(target, [first, second, target])).toEqual(first);
    expect(findParent(target, [second, first, target])).toEqual(second);
  });

  it("compares by area so a wide shallow band loses to a tight box", () => {
    const band = rect(0, 0, 1000, 50);
    const tight = rect(10, 5, 100, 40);
    const target = rect(20, 10, 50, 20);
    expect(rectArea(tight)).toBeLessThan(rectArea(band));
    expect(findParent(target, [band, tight, target])).toBe(tight);
  });
});
