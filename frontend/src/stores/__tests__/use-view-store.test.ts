/**
 * Viewport store.
 *
 * Two properties are worth locking down, and both were found by reading rather than by looking at
 * the screen. First, `zoomAt` must keep the point under the cursor still -- and it can only do that
 * if the position it is handed is measured in the same frame as the pan it writes, which is the
 * canvas element's own space rather than the viewport's. Second, the arrow-key pan must move the
 * same distance a middle-button drag of the same length does, because they are two ways of doing one
 * thing and the user switches between them without thinking.
 *
 * The zoom clamp is not tested here as a number; it is tested as the absence of a divide-by-zero,
 * since `screenToCanvas` throws on zoom 0 and a clamped-out zero would be a crash in the wheel
 * handler.
 */

import { beforeEach, describe, expect, it } from "vitest";

import {
  canvasToScreen,
  screenToCanvas,
  type CanvasOrigin,
} from "@/lib/canvas-coords";
import { GESTURE, ZOOM } from "@/lib/constants";
import { useViewStore } from "@/stores/use-view-store";

const origin: CanvasOrigin = { left: 240, top: 48 };

const view = () => {
  const { zoom, panX, panY } = useViewStore.getState();
  return { zoom, panX, panY };
};

/** Where a canvas point appears on screen, in the frame `zoomAt` is documented to use. */
function localOf(canvasX: number, canvasY: number) {
  const screen = canvasToScreen({ x: canvasX, y: canvasY }, origin, view());
  return { x: screen.x - origin.left, y: screen.y - origin.top };
}

beforeEach(() => {
  useViewStore.getState().resetView();
});

describe("setZoom", () => {
  it("clamps to the documented range", () => {
    useViewStore.getState().setZoom(999);
    expect(view().zoom).toBe(ZOOM.max);
    useViewStore.getState().setZoom(0.0001);
    expect(view().zoom).toBe(ZOOM.min);
  });

  it("never reaches zero, which would make every conversion Infinity", () => {
    useViewStore.getState().setZoom(0);
    expect(view().zoom).toBeGreaterThan(0);
  });
});

describe("zoomAt", () => {
  it("scrolling away from the user zooms out", () => {
    useViewStore.getState().zoomAt(100, 100, 100);
    expect(view().zoom).toBeCloseTo(1 / ZOOM.stepFactor, 6);
    useViewStore.getState().zoomAt(100, 100, -100);
    expect(view().zoom).toBeCloseTo(1, 6);
  });

  it("holds the canvas point under the cursor fixed", () => {
    // The property the whole wheel gesture rests on. Written as a round trip through
    // `screenToCanvas` so that a change to either the store's frame or the conversion's has to
    // break it -- the two halves disagreeing is precisely the failure mode that makes a drawing
    // slide out from under the pointer while zooming.
    for (const target of [
      { x: 300, y: 200 },
      { x: 0, y: 0 },
      { x: 1440, y: 900 },
    ]) {
      useViewStore.getState().resetView();
      useViewStore.getState().panBy(-70, 35);

      const anchor = localOf(target.x, target.y);
      const client = { clientX: anchor.x + origin.left, clientY: anchor.y + origin.top };
      const before = screenToCanvas(client, origin, view());

      for (let notch = 0; notch < 5; notch += 1) {
        useViewStore.getState().zoomAt(anchor.x, anchor.y, -100);
      }

      const after = screenToCanvas(client, origin, view());
      expect(after.x).toBeCloseTo(before.x, 4);
      expect(after.y).toBeCloseTo(before.y, 4);
      expect(view().zoom).toBeGreaterThan(1);
    }
  });

  it("stops adjusting the pan once the zoom is clamped", () => {
    useViewStore.getState().setZoom(ZOOM.max);
    const before = view();
    useViewStore.getState().zoomAt(400, 300, -100);
    expect(view()).toEqual(before);
  });

  it("keeps the anchored point still across a zoom out at low zoom", () => {
    useViewStore.getState().setZoom(0.5);
    const anchor = { x: 640, y: 360 };
    const client = { clientX: anchor.x + origin.left, clientY: anchor.y + origin.top };
    const before = screenToCanvas(client, origin, view());

    useViewStore.getState().zoomAt(anchor.x, anchor.y, 100);
    const after = screenToCanvas(client, origin, view());

    expect(after.x).toBeCloseTo(before.x, 4);
    expect(after.y).toBeCloseTo(before.y, 4);
  });
});

describe("panByStep", () => {
  it("moves a fixed distance on screen whatever the zoom", () => {
    // panX and panY are screen-space translations, the same numbers a middle-button drag writes.
    // Scaling this by zoom would make the arrow keys and the drag disagree about how far the
    // drawing moves for the same intention.
    const stepAtZoom = (zoomLevel: number) => {
      useViewStore.getState().resetView();
      useViewStore.getState().setZoom(zoomLevel);
      const before = useViewStore.getState().panX;
      useViewStore.getState().panByStep(1, 0, false);
      return useViewStore.getState().panX - before;
    };

    expect(stepAtZoom(0.25)).toBe(GESTURE.panStepPx);
    expect(stepAtZoom(1)).toBe(GESTURE.panStepPx);
    expect(stepAtZoom(4)).toBe(GESTURE.panStepPx);
  });

  it("multiplies by four when coarse", () => {
    useViewStore.getState().panByStep(0, -1, true);
    expect(view().panY).toBe(-GESTURE.panStepPx * 4);
  });

  it("moves both axes independently", () => {
    useViewStore.getState().panByStep(-1, 1, false);
    expect(view().panX).toBe(-GESTURE.panStepPx);
    expect(view().panY).toBe(GESTURE.panStepPx);
  });
});

describe("panBy", () => {
  it("accumulates", () => {
    useViewStore.getState().panBy(10, -5);
    useViewStore.getState().panBy(10, -5);
    expect(view()).toEqual({ zoom: 1, panX: 20, panY: -10 });
  });
});

describe("isPanning", () => {
  it("toggles without touching the camera", () => {
    useViewStore.getState().panBy(30, 40);
    useViewStore.getState().setPanning(true);
    expect(useViewStore.getState().isPanning).toBe(true);
    expect(view()).toEqual({ zoom: 1, panX: 30, panY: 40 });
  });
});

describe("resetView", () => {
  it("returns to an unzoomed, unpanned camera", () => {
    useViewStore.getState().setZoom(3);
    useViewStore.getState().panBy(500, 500);
    useViewStore.getState().resetView();
    expect(view()).toEqual({ zoom: 1, panX: 0, panY: 0 });
  });
});
