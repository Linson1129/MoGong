/**
 * Gesture arbitration for the canvas.
 *
 * The canvas shares one physical input -- the left mouse button -- between gestures that start
 * identically: a press could become a click-to-select, a drag-to-draw, or a drag-to-pan. The
 * arbitration used to be time-and-motion, because dragging over a selected element had to resolve to
 * "move" while dragging over the sheet had to resolve to "draw". Moving is now exclusively
 * Alt+drag, and drawing is impossible off the sheet, so a plain press has exactly one meaning per
 * surface and the time term is gone:
 * - Press on a resize handle → start resizing immediately.
 * - Move past `GESTURE.moveThresholdPx` on the sheet → draw. Anywhere off it → pan the view.
 * - Release before the threshold → click (select, or deselect off the sheet).
 *
 * Removing the clock is not a convenience, it is the fix for the complaint that drawing lagged: with
 * the time term gone, the preview tracks the cursor from the first qualifying move instead of from
 * the first move after 180ms.
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
  | { kind: "start-panning" }
  | { kind: "start-resizing"; handle: ResizeHandle };

/**
 * Whether a press point lies on the sheet rather than on the desk around it.
 *
 * The sheet is the document's own frame (`canvas.width` x `canvas.height`), which is the region the
 * compiler will emit, so "draw only on the sheet" is what keeps a stray drag outside the paper from
 * becoming a region that ships. Half-open bounds are not the concern here: the edges are one canvas
 * unit wide and drawing there would produce a zero-size rect that the commit step rejects anyway.
 */
export function isInsideSheet(x: number, y: number, sheetWidth: number, sheetHeight: number): boolean {
  return x >= 0 && y >= 0 && x <= sheetWidth && y <= sheetHeight;
}

/**
 * Classify a pending gesture from how far the pointer has travelled and what it started on.
 *
 * `distancePx` is travel in SCREEN pixels, not canvas units. The distinction is the whole reason a
 * drag used to fail at low zoom: a canvas-unit threshold of 3 is 0.675 pixels on screen at 22.5%,
 * which is smaller than a hand's tremor, so every real drag looked like a click.
 *
 * The four outcomes map to distinct product states:
 * - `start-resizing`: the press is on a handle; the handle is an unambiguous target.
 * - `commit-to-draw`: travel past the threshold starting on the sheet; show the preview rect.
 * - `start-panning`: travel past the threshold starting off the sheet; move the viewport instead.
 * - `still-pending`: under the threshold, which is a click if the button comes up here.
 */
export function classifyPendingGesture(
  distancePx: number,
  overSheet: boolean,
  handleUnderCursor: ResizeHandle | null,
): PendingClassification {
  if (handleUnderCursor !== null) {
    return { kind: "start-resizing", handle: handleUnderCursor };
  }
  if (distancePx > GESTURE.moveThresholdPx) {
    return overSheet ? { kind: "commit-to-draw" } : { kind: "start-panning" };
  }
  return { kind: "still-pending" };
}

/**
 * Build a preview rectangle from origin to current cursor position.
 *
 * The preview is what the user sees while still holding the button: a dashed outline that tracks the
 * pointer. It uses the same `rectFromCorners` helper as the final element, so the committed rectangle
 * cannot land in a different place than the preview showed.
 */
export function drawPreview(originX: number, originY: number, currentX: number, currentY: number): Rect {
  return rectFromCorners(originX, originY, currentX, currentY);
}
