/**
 * Resize handles: which points on a rectangle can be dragged, and what dragging one does.
 *
 * Pure geometry, so the whole of it is testable without a pointer or a DOM -- which matters,
 * because a resize bug is felt as "the box jumped away from my cursor" and is very hard to see in
 * a screenshot review.
 */

import type { Rect } from "./geometry";
import { GESTURE } from "./constants";

/** Named by the corner or edge each one sits on, reading like a compass. */
export type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export const CORNER_HANDLES: readonly ResizeHandle[] = ["nw", "ne", "se", "sw"] as const;
export const EDGE_HANDLES: readonly ResizeHandle[] = ["n", "e", "s", "w"] as const;
export const ALL_HANDLES: readonly ResizeHandle[] = [...CORNER_HANDLES, ...EDGE_HANDLES] as const;

/** CSS cursor per handle. Wrong cursors here read as a broken tool faster than wrong geometry. */
export const HANDLE_CURSORS: Record<ResizeHandle, string> = {
  nw: "nwse-resize",
  n: "ns-resize",
  ne: "nesw-resize",
  e: "ew-resize",
  se: "nwse-resize",
  s: "ns-resize",
  sw: "nesw-resize",
  w: "ew-resize",
};

/** Which axes a handle moves. Corners move both, edges move one. */
export function handleAxes(handle: ResizeHandle): { x: boolean; y: boolean } {
  const movesX = handle === "w" || handle === "e" || handle.length === 2;
  const movesY = handle === "n" || handle === "s" || handle.length === 2;
  return { x: movesX, y: movesY };
}

export function isCorner(handle: ResizeHandle): boolean {
  return handle.length === 2;
}

/** Handle centre, in canvas coordinates. */
export function handlePosition(rect: Rect, handle: ResizeHandle): { x: number; y: number } {
  const midX = rect.x + rect.width / 2;
  const midY = rect.y + rect.height / 2;
  const left = rect.x;
  const right = rect.x + rect.width;
  const top = rect.y;
  const bottom = rect.y + rect.height;

  switch (handle) {
    case "nw":
      return { x: left, y: top };
    case "n":
      return { x: midX, y: top };
    case "ne":
      return { x: right, y: top };
    case "e":
      return { x: right, y: midY };
    case "se":
      return { x: right, y: bottom };
    case "s":
      return { x: midX, y: bottom };
    case "sw":
      return { x: left, y: bottom };
    case "w":
      return { x: left, y: midY };
  }
}

/**
 * Minimum size a rectangle may be resized down to, in canvas pixels.
 *
 * Not zero: an element with no area cannot be selected or dragged back, so a zero minimum would
 * make a rectangle permanently unreachable after one careless pull. Two pixels also matches the
 * backend's too-small warning threshold.
 */
export const MIN_SIZE = 2;

/**
 * Move the edge(s) a handle controls, leaving the opposite edge fixed.
 *
 * The fixed-edge behaviour is the entire point. Dragging the right edge must not move the left,
 * which means the rectangle's origin can change while its left side stays put only when dragging
 * the west handle. Getting this backwards makes every resize feel like the box is running away.
 */
export function applyResize(
  original: Rect,
  handle: ResizeHandle,
  pointerX: number,
  pointerY: number,
): Rect {
  let { x, y, width, height } = original;
  const axes = handleAxes(handle);

  if (axes.x) {
    if (handle.includes("w")) {
      const right = original.x + original.width;
      x = Math.min(pointerX, right - MIN_SIZE);
      width = right - x;
    } else {
      width = Math.max(pointerX - original.x, MIN_SIZE);
    }
  }

  if (axes.y) {
    if (handle.includes("n")) {
      const bottom = original.y + original.height;
      y = Math.min(pointerY, bottom - MIN_SIZE);
      height = bottom - y;
    } else {
      height = Math.max(pointerY - original.y, MIN_SIZE);
    }
  }

  return { x, y, width, height };
}

/**
 * Hit test a resize handle.
 *
 * Handles are rendered as squares of `GESTURE.handleSizePx` screen pixels, so the hit region
 * matches what the user sees. The handle position is its centre; we expand by half the size on
 * each side to build the hit box.
 */
export function hitTestHandle(
  rect: Rect,
  handle: ResizeHandle,
  pointerX: number,
  pointerY: number,
  zoom: number,
): boolean {
  const pos = handlePosition(rect, handle);
  const halfSize = GESTURE.handleSizePx / zoom / 2;
  return (
    pointerX >= pos.x - halfSize &&
    pointerX <= pos.x + halfSize &&
    pointerY >= pos.y - halfSize &&
    pointerY <= pos.y + halfSize
  );
}

/**
 * Find which resize handle (if any) is under the cursor.
 *
 * Returns null when no handle is hit. Corner handles are tested before edge handles so that the
 * overlap region at a corner belongs to the corner, not the edge.
 */
export function findHandleAt(
  rect: Rect,
  pointerX: number,
  pointerY: number,
  zoom: number,
): ResizeHandle | null {
  // Test corners first: they are the most commonly grabbed and the overlap with edges would
  // otherwise give the edge priority when the cursor sits exactly on the corner.
  for (const handle of CORNER_HANDLES) {
    if (hitTestHandle(rect, handle, pointerX, pointerY, zoom)) return handle;
  }
  for (const handle of EDGE_HANDLES) {
    if (hitTestHandle(rect, handle, pointerX, pointerY, zoom)) return handle;
  }
  return null;
}
