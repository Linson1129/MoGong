/**
 * Resize handles.
 *
 * The invariant worth testing is not the arithmetic but the *fixity*: dragging one edge must never
 * move the opposite one. A violation of that is felt immediately as "the box jumped away from my
 * cursor", it is invisible in a static screenshot, and it would only surface during manual use -- so
 * it is checked here against every handle and a sweep of pointer positions instead.
 */

import { describe, expect, it } from "vitest";

import type { Rect } from "@/lib/geometry";
import {
  ALL_HANDLES,
  CORNER_HANDLES,
  EDGE_HANDLES,
  HANDLE_CURSORS,
  MIN_SIZE,
  applyResize,
  handleAxes,
  handlePosition,
  isCorner,
  type ResizeHandle,
} from "@/lib/handles";

const BOX: Rect = { x: 100, y: 200, width: 300, height: 150 };

/** Pointer positions to try: inside out, outside in, and past the far edge. */
const POINTERS: Array<[number, number]> = [
  [120, 210],
  [250, 275],
  [420, 360],
  [500, 400],
  [80, 180],
  [-200, -200],
  [900, 900],
];

describe("handle inventory", () => {
  it("covers four corners and four edges, which is the whole set", () => {
    expect(CORNER_HANDLES).toHaveLength(4);
    expect(EDGE_HANDLES).toHaveLength(4);
    expect([...ALL_HANDLES]).toEqual([...CORNER_HANDLES, ...EDGE_HANDLES]);
    expect(new Set(ALL_HANDLES).size).toBe(8);
  });

  it("names each handle after where it sits", () => {
    // These positions are what the renderer draws; if the naming and the geometry drift apart, the
    // cursor for a handle will not match the edge it controls.
    const right = BOX.x + BOX.width;
    const bottom = BOX.y + BOX.height;
    const midX = BOX.x + BOX.width / 2;
    const midY = BOX.y + BOX.height / 2;

    const expected: Record<ResizeHandle, [number, number]> = {
      nw: [BOX.x, BOX.y],
      n: [midX, BOX.y],
      ne: [right, BOX.y],
      e: [right, midY],
      se: [right, bottom],
      s: [midX, bottom],
      sw: [BOX.x, bottom],
      w: [BOX.x, midY],
    };

    for (const handle of ALL_HANDLES) {
      expect(handlePosition(BOX, handle), handle).toEqual({
        x: expected[handle][0],
        y: expected[handle][1],
      });
    }
  });

  it("gives every handle a cursor", () => {
    for (const handle of ALL_HANDLES) {
      expect(HANDLE_CURSORS[handle], handle).toBeTruthy();
    }
    // Horizontal edges resize vertically and vice versa, which is the part a reader swaps.
    expect(HANDLE_CURSORS.n).toBe("ns-resize");
    expect(HANDLE_CURSORS.e).toBe("ew-resize");
    expect(HANDLE_CURSORS.nw).toBe("nwse-resize");
    expect(HANDLE_CURSORS.ne).toBe("nesw-resize");
  });

  it("moves both axes for a corner and one for an edge", () => {
    for (const handle of CORNER_HANDLES) {
      expect(handleAxes(handle), handle).toEqual({ x: true, y: true });
      expect(isCorner(handle)).toBe(true);
    }
    for (const handle of EDGE_HANDLES) {
      expect(isCorner(handle)).toBe(false);
      const axes = handleAxes(handle);
      expect(axes.x !== axes.y, `${handle} should move exactly one axis`).toBe(true);
    }
    expect(handleAxes("e")).toEqual({ x: true, y: false });
    expect(handleAxes("n")).toEqual({ x: false, y: true });
  });
});

describe("applyResize", () => {
  it("keeps the opposite edge fixed for every handle and pointer", () => {
    for (const handle of ALL_HANDLES) {
      for (const [pointerX, pointerY] of POINTERS) {
        const next = applyResize(BOX, handle, pointerX, pointerY);
        const boxRight = BOX.x + BOX.width;
        const boxBottom = BOX.y + BOX.height;

        // A west handle drags the left edge, so the right edge is the one that must not move; the
        // converse for east; the same pair of reasoning north and south.
        if (handle.includes("w")) {
          expect(next.x + next.width, `${handle} at ${pointerX}`).toBe(boxRight);
        } else if (handle.includes("e")) {
          expect(next.x, handle).toBe(BOX.x);
        } else {
          expect(next.x, `${handle} must not move horizontally`).toBe(BOX.x);
          expect(next.width, `${handle} must not change width`).toBe(BOX.width);
        }

        if (handle.includes("n")) {
          expect(next.y + next.height, `${handle} at ${pointerY}`).toBe(boxBottom);
        } else if (handle.includes("s")) {
          expect(next.y, handle).toBe(BOX.y);
        } else {
          expect(next.y, `${handle} must not move vertically`).toBe(BOX.y);
          expect(next.height, `${handle} must not change height`).toBe(BOX.height);
        }
      }
    }
  });

  it("never produces a box narrower or shorter than the minimum", () => {
    // Pulling the west handle past the east edge would invert the rectangle, and an element with a
    // negative width cannot be selected, dragged, or compiled.
    for (const handle of ALL_HANDLES) {
      const collapsed = applyResize(BOX, handle, 4000, 4000);
      expect(collapsed.width, handle).toBeGreaterThanOrEqual(MIN_SIZE);
      expect(collapsed.height, handle).toBeGreaterThanOrEqual(MIN_SIZE);

      const overpulled = applyResize(BOX, handle, -4000, -4000);
      expect(overpulled.width, handle).toBeGreaterThanOrEqual(MIN_SIZE);
      expect(overpulled.height, handle).toBeGreaterThanOrEqual(MIN_SIZE);
    }
  });

  it("follows the pointer exactly when there is room", () => {
    expect(applyResize(BOX, "e", 460, 0)).toMatchObject({ width: 360, x: 100 });
    expect(applyResize(BOX, "s", 0, 420)).toMatchObject({ height: 220, y: 200 });
    expect(applyResize(BOX, "w", 40, 0)).toMatchObject({ x: 40, width: 360 });
    expect(applyResize(BOX, "n", 0, 140)).toMatchObject({ y: 140, height: 210 });
    expect(applyResize(BOX, "se", 500, 500)).toMatchObject({ x: 100, y: 200, width: 400, height: 300 });
  });

  it("leaves the untouched axis alone on a corner drag", () => {
    // Dragging southeast with the pointer at the same y must not change the height, which is what
    // makes a corner feel like two independent edges rather than a scaling of the whole box.
    expect(applyResize(BOX, "se", 500, BOX.y + BOX.height)).toMatchObject({
      width: 400,
      height: 150,
    });
  });

  it("is idempotent when the pointer returns to the handle it started on", () => {
    for (const handle of ALL_HANDLES) {
      const anchor = handlePosition(BOX, handle);
      expect(applyResize(BOX, handle, anchor.x, anchor.y), handle).toEqual(BOX);
    }
  });
});
