/**
 * Conversion between screen pixels and canvas units.
 *
 * Split out from the canvas component because it is the one piece of view math that every gesture
 * must agree on. If a draw handler and a move handler each wrote their own version, a mismatch
 * would show up as rectangles landing under the cursor on one path and beside it on another -- and
 * the cause would be impossible to find in a component that also does rendering.
 *
 * Keeping it pure means it is testable without a DOM and without a browser to point at.
 */

import type { Rect } from "./geometry";

/** A point in client (viewport) coordinates, as a pointer event reports it. */
export interface ScreenPoint {
  clientX: number;
  clientY: number;
}

/** The bounding rect of the SVG element, reduced to what the conversion needs. */
export interface CanvasOrigin {
  left: number;
  top: number;
}

export interface ViewTransform {
  zoom: number;
  panX: number;
  panY: number;
}

/**
 * Client coordinates to canvas coordinates.
 *
 * The inverse of the `translate(pan) scale(zoom)` transform the renderer applies. Order matters:
 * the translation happens in screen space *after* scaling, so it must be subtracted before the
 * division, not after. Applying them the other way round yields a point that drifts with zoom,
 * which is the classic "the rectangle is offset when I am zoomed in" bug.
 */
export function screenToCanvas(
  point: ScreenPoint,
  origin: CanvasOrigin,
  view: ViewTransform,
): { x: number; y: number } {
  if (view.zoom === 0) {
    // Unreachable while the zoom is clamped, but a zero divisor here would produce Infinity in
    // geometry that then serialises into the document as null. Failing loudly is cheaper.
    throw new Error("screenToCanvas called with zoom 0");
  }
  return {
    x: (point.clientX - origin.left - view.panX) / view.zoom,
    y: (point.clientY - origin.top - view.panY) / view.zoom,
  };
}

/** Canvas coordinates to client coordinates. Used to place overlays on top of the drawing. */
export function canvasToScreen(
  position: { x: number; y: number },
  origin: CanvasOrigin,
  view: ViewTransform,
): { x: number; y: number } {
  return {
    x: position.x * view.zoom + origin.left + view.panX,
    y: position.y * view.zoom + origin.top + view.panY,
  };
}

/** A rect expressed in screen pixels, for overlay positioning. */
export function rectToScreen(
  rect: Rect,
  origin: CanvasOrigin,
  view: ViewTransform,
): { x: number; y: number; width: number; height: number } {
  const topLeft = canvasToScreen({ x: rect.x, y: rect.y }, origin, view);
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: rect.width * view.zoom,
    height: rect.height * view.zoom,
  };
}
