import { describe, expect, it } from "vitest";

import { GESTURE } from "@/lib/constants";
import { classifyPendingGesture, drawPreview } from "@/lib/gestures";

describe("classifyPendingGesture", () => {
  it("returns still-pending when neither threshold has been crossed", () => {
    const startedAt = 1000;
    const now = startedAt + GESTURE.longPressMs / 2;
    const distance = GESTURE.moveThresholdPx / 2;
    expect(classifyPendingGesture(startedAt, now, distance, false).kind).toBe("still-pending");
  });

  it("commits to draw when elapsed time exceeds long-press threshold", () => {
    const startedAt = 1000;
    const now = startedAt + GESTURE.longPressMs + 10;
    const distance = 0;
    expect(classifyPendingGesture(startedAt, now, distance, false).kind).toBe("commit-to-draw");
  });

  it("cancels to click when distance exceeds threshold over empty space", () => {
    const startedAt = 1000;
    const now = startedAt + GESTURE.longPressMs / 2;
    const distance = GESTURE.moveThresholdPx + 1;
    expect(classifyPendingGesture(startedAt, now, distance, false).kind).toBe("cancel-to-click");
  });

  it("starts moving when distance exceeds threshold over a selected element", () => {
    const startedAt = 1000;
    const now = startedAt + GESTURE.longPressMs / 2;
    const distance = GESTURE.moveThresholdPx + 1;
    expect(classifyPendingGesture(startedAt, now, distance, true).kind).toBe("start-moving");
  });

  it("commits to draw at exact threshold with no motion", () => {
    const startedAt = 1000;
    const now = startedAt + GESTURE.longPressMs;
    const distance = 0;
    expect(classifyPendingGesture(startedAt, now, distance, false).kind).toBe("commit-to-draw");
  });

  it("cancels at exact motion threshold over empty space even if time has passed", () => {
    const startedAt = 1000;
    const now = startedAt + GESTURE.longPressMs * 2;
    const distance = GESTURE.moveThresholdPx + 0.1;
    expect(classifyPendingGesture(startedAt, now, distance, false).kind).toBe("cancel-to-click");
  });

  it("starts moving at exact motion threshold over selection even if time has passed", () => {
    const startedAt = 1000;
    const now = startedAt + GESTURE.longPressMs * 2;
    const distance = GESTURE.moveThresholdPx + 0.1;
    expect(classifyPendingGesture(startedAt, now, distance, true).kind).toBe("start-moving");
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
