/**
 * Rectangle geometry: the client-side mirror of backend/app/models/geometry.py.
 *
 * Both implementations answer the same questions about the same drawing, and they must agree. The
 * editor shows a live nesting preview while the compiler produces the file the agent reads; if the
 * two disagree, the preview lies and the user only finds out from the JSON. Agreement is enforced
 * by running both against the shared cases in fixtures/cases.
 *
 * Conventions, restated from docs/dev-guide.md section 4:
 *   - a rect is { x, y, width, height } with (x, y) the top-left corner
 *   - width and height are never negative; a reverse drag is normalized where it is captured
 *   - containment is inclusive of boundaries, overlap is not
 */

import { GEOMETRY_EPSILON } from "./constants";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const rectRight = (r: Rect): number => r.x + r.width;
export const rectBottom = (r: Rect): number => r.y + r.height;
export const rectArea = (r: Rect): number => r.width * r.height;

/**
 * True when `child` lies entirely within `parent`, boundaries included.
 *
 * Inclusive per docs/spec.md section 5. A strict comparison would un-nest every child snapped
 * flush against a parent edge, which is the most common way a child gets drawn.
 */
export function contains(parent: Rect, child: Rect): boolean {
  return (
    child.x >= parent.x - GEOMETRY_EPSILON &&
    child.y >= parent.y - GEOMETRY_EPSILON &&
    rectRight(child) <= rectRight(parent) + GEOMETRY_EPSILON &&
    rectBottom(child) <= rectBottom(parent) + GEOMETRY_EPSILON
  );
}

/**
 * True when two rects share interior area. Touching edges do not count.
 *
 * Excluding contact matters: two stacked full-width sections share a border line in almost every
 * real layout, and treating that as overlap would raise a warning on correct drawings.
 */
export function overlaps(a: Rect, b: Rect): boolean {
  return !(
    b.x >= rectRight(a) - GEOMETRY_EPSILON ||
    rectRight(b) <= a.x + GEOMETRY_EPSILON ||
    b.y >= rectBottom(a) - GEOMETRY_EPSILON ||
    rectBottom(b) <= a.y + GEOMETRY_EPSILON
  );
}

export function overlapArea(a: Rect, b: Rect): number {
  const width = Math.min(rectRight(a), rectRight(b)) - Math.max(a.x, b.x);
  const height = Math.min(rectBottom(a), rectBottom(b)) - Math.max(a.y, b.y);
  if (width <= 0 || height <= 0) return 0;
  return width * height;
}

/**
 * Overlap that is neither containment nor containment reversed: the invalid state of the nesting
 * rule. Reported to the user, never auto-resolved, because the intent really is ambiguous.
 */
export function partiallyOverlaps(a: Rect, b: Rect): boolean {
  if (!overlaps(a, b)) return false;
  return !contains(a, b) && !contains(b, a);
}

/** Fold a reverse drag into the equivalent forward one by moving the origin. */
export function normalizeRect(rect: Rect): Rect {
  if (rect.width >= 0 && rect.height >= 0) return rect;
  return {
    x: rect.width < 0 ? rect.x + rect.width : rect.x,
    y: rect.height < 0 ? rect.y + rect.height : rect.y,
    width: Math.abs(rect.width),
    height: Math.abs(rect.height),
  };
}

/** Build a rect from two dragged corners, in any direction. */
export function rectFromCorners(ax: number, ay: number, bx: number, by: number): Rect {
  return {
    x: Math.min(ax, bx),
    y: Math.min(ay, by),
    width: Math.abs(bx - ax),
    height: Math.abs(by - ay),
  };
}

/**
 * Express `child` as a percentage of `parent`.
 *
 * Not clamped: a child that escapes its parent yields a value over 100 or below zero, and that is
 * the honest reading of the drawing. Clamping here would hide an off-canvas problem from the
 * compile preview, so the JSON would disagree with what the user can see.
 */
export function toRelativeBox(child: Rect, parent: Rect): Rect {
  if (parent.width <= 0 || parent.height <= 0) {
    throw new Error("toRelativeBox requires a parent with positive extents");
  }
  return {
    x: ((child.x - parent.x) / parent.width) * 100,
    y: ((child.y - parent.y) / parent.height) * 100,
    width: (child.width / parent.width) * 100,
    height: (child.height / parent.height) * 100,
  };
}

/** Snap a value to the grid. Returns it untouched when snapping is off. */
export function snap(value: number, gridSize: number, enabled: boolean): number {
  if (!enabled || gridSize <= 0) return value;
  return Math.round(value / gridSize) * gridSize;
}

/**
 * Smallest rect in `candidates` that fully contains `target`, excluding `target` itself.
 *
 * "Smallest" rather than "first": when a card sits in a section that sits in a page, the section
 * is the parent. Picking by area is order-independent, so reordering the element list can never
 * silently change what a drawing means.
 */
export function findParent(target: Rect, candidates: Rect[]): Rect | null {
  let best: Rect | null = null;
  for (const candidate of candidates) {
    if (candidate === target) continue;
    if (!contains(candidate, target)) continue;
    if (best === null || rectArea(candidate) < rectArea(best)) {
      best = candidate;
    }
  }
  return best;
}
