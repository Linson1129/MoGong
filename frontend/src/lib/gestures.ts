/**
 * Gesture arbitration for the canvas.
 *
 * The canvas shares one physical input -- the left mouse button -- between several gestures that
 * start identically: a press could become a click-to-select, a drag-to-move, a drag-to-resize,
 * or a long-press-to-draw. The arbitration is time-and-motion-based:
 * - Press on a resize handle → start resizing immediately.
 * - Hold longer than `GESTURE.longPressMs` without moving → commit to draw.
 * - Move before the threshold while over a selected element → start moving.
 * - Move before the threshold while over empty space → cancel to click.
 * - Release before any threshold → click (select or deselect).
 *
 * This module is pure logic with no React dependency, so it can be tested without a DOM.
 */

import { GESTURE } from "./constants";
import type { Rect } from "./geometry";
import { rectFromCorners } from "./geometry";
import type { ResizeHandle } from "./handles";

/** Result of classifying a pointer press that has not yet been released. */
export type PendingClassification =
  | { kind: "still-pending" }
  | { kind: "commit-to-draw" }
  | { kind: "start-moving" }
  | { kind: "start-resizing"; handle: ResizeHandle }
  | { kind: "cancel-to-click" };

/**
 * Classify a pending gesture based on elapsed time, distance moved, and what is under the cursor.
 *
 * The five outcomes map to distinct product states:
 * - `still-pending`: the user has not held long enough nor moved far enough to decide.
 * - `commit-to-draw`: the long-press threshold was crossed; the canvas should show a preview.
 * - `start-moving`: motion before the threshold, but over a selected element; begin a move.
 * - `start-resizing`: press on a resize handle; begin a resize immediately.
 * - `cancel-to-click`: motion before the threshold over empty space; treat as a click.
 */
export function classifyPendingGesture(
  startedAt: number,
  now: number,
  distancePx: number,
  isOverSelection: boolean,
  handleUnderCursor: ResizeHandle | null,
): PendingClassification {
  // A press on a resize handle commits to resizing immediately, regardless of time or motion.
  // This is the one gesture that does not need arbitration: the handle is an unambiguous target.
  if (handleUnderCursor !== null) {
    return { kind: "start-resizing", handle: handleUnderCursor };
  }

  const elapsed = now - startedAt;
  if (distancePx > GESTURE.moveThresholdPx) {
    // Motion before the threshold: either a move (if over a selected element) or a cancelled
    // gesture (if over empty space). The distinction matters because a move commits the element
    // to following the cursor, while a cancel leaves selection unchanged.
    if (isOverSelection) {
      return { kind: "start-moving" };
    }
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
 * the pointer. It uses the same `rectFromCorners` helper as the final element, so the committed
 * rectangle cannot land in a different place than the preview showed.
 */
export function drawPreview(originX: number, originY: number, currentX: number, currentY: number): Rect {
  return rectFromCorners(originX, originY, currentX, currentY);
}
