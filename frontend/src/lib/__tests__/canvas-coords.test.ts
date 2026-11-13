/**
 * Screen/canvas coordinate conversion.
 *
 * These tests are written against the renderer's own transform, `translate(pan) scale(zoom)`, by
 * composing it forward and then checking that the inverse recovers the original canvas point. That
 * is a stronger check than asserting a formula, because it pins the relationship between this module
 * and the SVG group in `components/canvas/svg-canvas.tsx`: if either changes the other has to, and
 * a mismatch here is what makes a drawn rectangle land somewhere other than under the cursor.
 */

import { describe, expect, it } from "vitest";

import {
  canvasToScreen,
  rectToScreen,
  screenToCanvas,
  type CanvasOrigin,
  type ViewTransform,
} from "@/lib/canvas-coords";

// A realistic frame: the canvas sits to the right of a 240 pixel sidebar and below a 48 pixel
// toolbar. Using 0,0 here would let a missing origin subtraction pass every assertion.
const origin: CanvasOrigin = { left: 240, top: 48 };

/** The transform the renderer applies, written forward so the two directions can be compared. */
function forward(canvasX: number, canvasY: number, view: ViewTransform) {
  return {
    clientX: canvasX * view.zoom + view.panX + origin.left,
    clientY: canvasY * view.zoom + view.panY + origin.top,
  };
}

const VIEWS: ViewTransform[] = [
  { zoom: 1, panX: 0, panY: 0 },
  { zoom: 2.5, panX: 0, panY: 0 },
  { zoom: 1, panX: -320, panY: 140 },
  { zoom: 0.4, panX: 610, panY: -95 },
];

const label = (view: ViewTransform): string =>
  `zoom ${view.zoom}, pan ${view.panX},${view.panY}`;

describe("screenToCanvas", () => {
  for (const view of VIEWS) {
    it(`inverts the renderer transform at ${label(view)}`, () => {
      for (const [canvasX, canvasY] of [
        [0, 0],
        [300, 200],
        [1440, 900],
        [-50, 1725],
      ]) {
        const point = forward(canvasX, canvasY, view);
        const recovered = screenToCanvas(point, origin, view);
        expect(recovered.x).toBeCloseTo(canvasX, 6);
        expect(recovered.y).toBeCloseTo(canvasY, 6);
      }
    });
  }

  it("subtracts the pan before dividing by zoom, not after", () => {
    // The translation is applied in screen space after the scale, so it has to come off first.
    // Applying the two in the other order yields a point that drifts as the user zooms, which is
    // the classic "my rectangle is offset when I am zoomed in" bug, and this is where it is caught.
    const view = { zoom: 1.5, panX: -100, panY: 30 };
    const canvasPoint = { x: 300, y: 200 };
    const client = forward(canvasPoint.x, canvasPoint.y, view);

    const wrongOrder = {
      x: (client.clientX - origin.left) / view.zoom - view.panX,
      y: (client.clientY - origin.top) / view.zoom - view.panY,
    };
    expect(wrongOrder.x).not.toBeCloseTo(canvasPoint.x, 6);
    expect(screenToCanvas(client, origin, view)).toEqual(canvasPoint);
  });

  it("is independent of the canvas size", () => {
    // Two points one screen pixel apart must stay one pixel apart at zoom 1, or selection handles
    // drawn in canvas units would not line up with what they mark.
    const view = { zoom: 1, panX: 0, panY: 0 };
    const a = screenToCanvas({ clientX: 400, clientY: 300 }, origin, view);
    const b = screenToCanvas({ clientX: 401, clientY: 300 }, origin, view);
    expect(b.x - a.x).toBeCloseTo(1, 10);
  });

  it("refuses a zero zoom instead of returning Infinity", () => {
    // Infinity has no JSON representation, so a silent divide-by-zero would surface later as a
    // document whose rectangles have vanished.
    expect(() =>
      screenToCanvas({ clientX: 10, clientY: 10 }, origin, { zoom: 0, panX: 0, panY: 0 }),
    ).toThrow(/zoom 0/);
  });
});

describe("canvasToScreen", () => {
  for (const view of VIEWS) {
    it(`matches the forward transform at ${label(view)}`, () => {
      expect(canvasToScreen({ x: 512, y: 256 }, origin, view)).toEqual({
        x: 512 * view.zoom + origin.left + view.panX,
        y: 256 * view.zoom + origin.top + view.panY,
      });
    });
  }
});

describe("rectToScreen", () => {
  it("scales the extents but not only the corners", () => {
    const view = { zoom: 1.75, panX: -40, panY: 20 };
    const rect = { x: 100, y: 80, width: 240, height: 120 };
    const screen = rectToScreen(rect, origin, view);

    expect(screen.width).toBeCloseTo(rect.width * view.zoom, 6);
    expect(screen.height).toBeCloseTo(rect.height * view.zoom, 6);
    // The bottom-right of the screen rect must equal the projected bottom-right corner, otherwise
    // an overlay placed from this value would not cover the rectangle it is framing.
    expect(screen.x + screen.width).toBeCloseTo(
      canvasToScreen({ x: rect.x + rect.width, y: rect.y }, origin, view).x,
      6,
    );
    expect(screen.y + screen.height).toBeCloseTo(
      canvasToScreen({ x: rect.x, y: rect.y + rect.height }, origin, view).y,
      6,
    );
  });
});
