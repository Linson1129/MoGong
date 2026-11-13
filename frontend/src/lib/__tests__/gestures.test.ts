import { describe, expect, it } from "vitest";

import { GESTURE } from "@/lib/constants";
import { classifyPendingGesture, drawPreview, isInsideSheet } from "@/lib/gestures";

describe("classifyPendingGesture", () => {
  it("stays pending while the pointer has not travelled past the threshold", () => {
    const distance = GESTURE.moveThresholdPx / 2;
    expect(classifyPendingGesture(distance, true, null).kind).toBe("still-pending");
  });

  it("commits to draw on the sheet the moment travel crosses the threshold, with no waiting", () => {
    // The clause that used to gate this was `elapsed >= GESTURE.longPressMs`. Its removal is the whole
    // point: a drag that began 5ms ago must already be drawing.
    const distance = GESTURE.moveThresholdPx + 1;
    expect(classifyPendingGesture(distance, true, null).kind).toBe("commit-to-draw");
  });

  it("never starts a draw from holding still, however long the hold", () => {
    // A press held for a minute without travelling is still a click candidate, not an armed draw.
    expect(classifyPendingGesture(0, true, null).kind).toBe("still-pending");
  });

  it("pans the view instead of drawing when the press started off the sheet", () => {
    const distance = GESTURE.moveThresholdPx + 1;
    expect(classifyPendingGesture(distance, false, null).kind).toBe("start-panning");
  });

  it("stays pending off the sheet under the threshold, so a desk click can still deselect", () => {
    expect(classifyPendingGesture(GESTURE.moveThresholdPx / 2, false, null).kind).toBe("still-pending");
  });

  it("treats the threshold as exclusive: exactly three pixels is not yet motion", () => {
    expect(classifyPendingGesture(GESTURE.moveThresholdPx, true, null).kind).toBe("still-pending");
    expect(classifyPendingGesture(GESTURE.moveThresholdPx + 0.001, true, null).kind).toBe("commit-to-draw");
  });

  it("answers a handle before it answers motion", () => {
    const onHandleFar = classifyPendingGesture(GESTURE.moveThresholdPx + 10, true, "se");
    expect(onHandleFar.kind).toBe("start-resizing");
    if (onHandleFar.kind === "start-resizing") expect(onHandleFar.handle).toBe("se");

    const onHandleStill = classifyPendingGesture(0, false, "nw");
    expect(onHandleStill.kind).toBe("start-resizing");
    if (onHandleStill.kind === "start-resizing") expect(onHandleStill.handle).toBe("nw");
  });

  it("reads its distance as screen pixels, so the same drag decides the same way at any zoom", () => {
    // The canvas-unit travel is converted to screen pixels by the caller. What the classifier sees is
    // already physical: 22.5% zoom turns 3 canvas units into 0.675 pixels, and 400% turns one canvas
    // unit into four. A hand that moves one canvas unit at 22.5% has barely twitched and must not draw;
    // a hand that moves two canvas units at 400% has travelled eight pixels and must.
    const twitchAtLowZoom = 3 * 0.225;
    const dragAtHighZoom = 2 * 4;
    expect(classifyPendingGesture(twitchAtLowZoom, true, null).kind).toBe("still-pending");
    expect(classifyPendingGesture(dragAtHighZoom, true, null).kind).toBe("commit-to-draw");
  });

  it("keeps a draw started on the sheet a draw even if the pointer has travelled far", () => {
    // Long travel used to be re-classified as a cancelled click once the clock ran out; there is no
    // clock, so the only thing that can stop a draw is where the press began.
    expect(classifyPendingGesture(4000, true, null).kind).toBe("commit-to-draw");
  });
});

describe("isInsideSheet", () => {
  const sheet = { width: 1440, height: 900 };

  it("accepts the origin corner and interior points", () => {
    expect(isInsideSheet(0, 0, sheet.width, sheet.height)).toBe(true);
    expect(isInsideSheet(720, 450, sheet.width, sheet.height)).toBe(true);
  });

  it("accepts the far edge itself, which is still the compiler's frame", () => {
    expect(isInsideSheet(1440, 900, sheet.width, sheet.height)).toBe(true);
  });

  it("rejects off-canvas coordinates", () => {
    expect(isInsideSheet(-1, 400, sheet.width, sheet.height)).toBe(false);
    expect(isInsideSheet(400, -1, sheet.width, sheet.height)).toBe(false);
    expect(isInsideSheet(1441, 400, sheet.width, sheet.height)).toBe(false);
    expect(isInsideSheet(400, 901, sheet.width, sheet.height)).toBe(false);
  });

  it("rejects a point that is on screen but outside the paper at low zoom", () => {
    // At 22.5% a viewport 1200 px wide shows 5333 canvas units, so most of what the user sees is desk.
    const x = 1200 / 0.225;
    expect(isInsideSheet(x, 100, sheet.width, sheet.height)).toBe(false);
  });
});

describe("drawPreview", () => {
  it("builds a rect from origin to current position", () => {
    const preview = drawPreview(100, 100, 200, 180);
    expect(preview).toEqual({ x: 100, y: 100, width: 100, height: 80 });
  });

  it("normalizes a reverse drag into positive dimensions", () => {
    const preview = drawPreview(200, 180, 100, 100);
    expect(preview).toEqual({ x: 100, y: 100, width: 100, height: 80 });
  });

  it("handles drag in any direction", () => {
    expect(drawPreview(100, 200, 150, 100)).toEqual({ x: 100, y: 100, width: 50, height: 100 });
    expect(drawPreview(200, 100, 100, 200)).toEqual({ x: 100, y: 100, width: 100, height: 100 });
  });

  it("returns zero-size rect when origin equals current", () => {
    const preview = drawPreview(100, 100, 100, 100);
    expect(preview).toEqual({ x: 100, y: 100, width: 0, height: 0 });
  });
});
