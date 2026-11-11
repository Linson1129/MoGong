/**
 * Gesture arbitration for the canvas.
 *
 * The canvas shares one physical input -- the left mouse button -- between two gestures that
 * start identically: a press could become a click-to-select or a long-press-to-draw. The
 * arbitration is time-based: hold longer than `GESTURE.longPressMs` without moving more than
 * `GESTURE.moveThresholdPx` and the press commits to drawing; release sooner and it was a click.
 *
 * This module is pure logic with no React dependency, so it can be tested without a DOM.
 */

import { GESTURE } from "./constants";
import type { Rect } from "./geometry";
import { rectFromCorners } from "./geometry";

/** Result of classifying a pointer press that has not yet been released. */
export type PendingClassification =
  | { kind: "still-pending" }
  | { kind: "commit-to-draw" }
  | { kind: "cancel-to-click" };

/**
 * Classify a pending gesture based on elapsed time and distance moved.
 *
 * The three outcomes map to distinct product states:
 * - `still-pending`: the user has not held long enough nor moved far enough to decide.
 * - `commit-to-draw`: the long-press threshold was crossed; the canvas should show a preview.
 * - `cancel-to-click`: the pointer moved before the threshold, so this was a click, not a draw.
 */
export function classifyPendingGesture(
  startedAt: number,
  now: number,
  distancePx: number,
): PendingClassification {
  const elapsed = now - startedAt;
  if (distancePx > GESTURE.moveThresholdPx) {
    // Motion before the threshold means the user was dragging, not pressing. But for drawing we
    // require a long press first, so this cancels the pending state. The move will be picked up
    // by the drag handler on the selected element instead.
    return { kind: "cancel-to-click" };
  }
  if (elapsed >= GESTURE.longPressMs) {
    return { kind: "commit-to-draw" };
  }
  return { kind: "still-pending" };
}

/**
 * Build a preview rectangle from origin to current cursor position.
 *
 * The preview is what the user sees while still holding the button: a dashed outline that tracks
 * the pointer. It uses the same `rectFromPoints` helper as the final element, so the committed
 * rectangle cannot land in a different place than the preview showed.
 */
export function drawPreview(originX: number, originY: number, currentX: number, currentY: number): Rect {
  return rectFromCorners(originX, originY, currentX, currentY);
}
