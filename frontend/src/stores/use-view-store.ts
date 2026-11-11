/**
 * Viewport store: the editor camera.
 *
 * Separate from the document store for two reasons. It changes on every wheel tick and every pan
 * frame, so co-locating it with elements would re-render the sidebar during navigation. And it is
 * not design content: zooming in should not mark a layout as having unsaved changes, and the
 * compiler must never see it.
 */

import { create } from "zustand";

import { GESTURE, ZOOM } from "@/lib/constants";

interface ViewState {
  zoom: number;
  panX: number;
  panY: number;
  /** True while the middle button is held, so the cursor can show a grab and drawing can suspend. */
  isPanning: boolean;
}

interface ViewActions {
  /**
   * Zoom about a point. `localX` and `localY` are measured from the top-left corner of the canvas
   * element, not from the viewport, because that is the frame the transform is applied in. The
   * caller subtracts the element's bounding rect, exactly as `screenToCanvas` does.
   */
  zoomAt: (localX: number, localY: number, deltaY: number) => void;
  setZoom: (zoom: number) => void;
  panBy: (dx: number, dy: number) => void;
  /** Arrow-key pan, a fixed distance on screen, so it matches a middle-button drag of the same length. */
  panByStep: (dx: number, dy: number, coarse: boolean) => void;
  setPanning: (active: boolean) => void;
  resetView: () => void;
  /**
   * Fit the canvas within the container, centering it and choosing a zoom that shows the whole
   * canvas. Called once on mount so the user sees the layout immediately rather than an empty
   * corner at 100% zoom.
   */
  fitToView: (containerWidth: number, containerHeight: number, canvasWidth: number, canvasHeight: number) => void;
}

export type ViewStore = ViewState & ViewActions;

const clampZoom = (value: number): number => Math.min(ZOOM.max, Math.max(ZOOM.min, value));

/**
 * Convert a factor change into a pan adjustment that keeps the point under the cursor fixed.
 *
 * Scaling the viewport alone would drift the content away from the pointer, because the transform
 * scales about the canvas element's own top-left corner. Adjusting the pan by the remainder is what
 * pins the point the user was aiming at, and it is the reason `zoomAt` takes a position at all.
 *
 * Both the extraction and the re-application have to happen in the same frame -- element-local
 * screen coordinates. Subtracting the pan before dividing matches `screenToCanvas`; feeding it
 * viewport coordinates instead leaves the element's own offset out of the calculation, and the
 * anchored point then slides by `offset * (newZoom / oldZoom - 1)`, which at a 240 pixel sidebar
 * width is a visible drift that compounds with every wheel notch.
 */
function anchoredPan(
  pan: number,
  localScreenOffset: number,
  previousZoom: number,
  nextZoom: number,
): number {
  const canvasOffset = (localScreenOffset - pan) / previousZoom;
  return localScreenOffset - canvasOffset * nextZoom;
}

export const useViewStore = create<ViewStore>((set) => ({
  zoom: 1,
  panX: 0,
  panY: 0,
  isPanning: false,

  zoomAt: (localX, localY, deltaY) =>
    set((state) => {
      // Positive deltaY means scroll away from the user, which reads as zoom out.
      const factor = deltaY > 0 ? 1 / ZOOM.stepFactor : ZOOM.stepFactor;
      const zoom = clampZoom(state.zoom * factor);
      if (zoom === state.zoom) return state;
      return {
        zoom,
        panX: anchoredPan(state.panX, localX, state.zoom, zoom),
        panY: anchoredPan(state.panY, localY, state.zoom, zoom),
      };
    }),

  setZoom: (zoom) => set(() => ({ zoom: clampZoom(zoom) })),

  panBy: (dx, dy) => set((state) => ({ panX: state.panX + dx, panY: state.panY + dy })),

  // Deliberately not scaled by zoom. panX and panY are screen-space translations, the same values a
  // middle-button drag writes, so scaling one path and not the other would make the two gestures
  // move the drawing different amounts. A canvas-unit step would also mean the arrow keys crawl at
  // 10% zoom and lurch at 400%.
  panByStep: (dx, dy, coarse) =>
    set((state) => {
      const step = coarse ? GESTURE.panStepPx * 4 : GESTURE.panStepPx;
      return { panX: state.panX + dx * step, panY: state.panY + dy * step };
    }),

  setPanning: (active) => set(() => ({ isPanning: active })),

  resetView: () => set(() => ({ zoom: 1, panX: 0, panY: 0 })),

  fitToView: (containerWidth, containerHeight, canvasWidth, canvasHeight) =>
    set(() => {
      // Choose a zoom that fits the entire canvas within the container, with a small margin.
      const margin = 40;
      const availableWidth = containerWidth - margin * 2;
      const availableHeight = containerHeight - margin * 2;
      const zoom = clampZoom(Math.min(availableWidth / canvasWidth, availableHeight / canvasHeight));
      // Center the canvas within the container.
      const panX = (containerWidth - canvasWidth * zoom) / 2;
      const panY = (containerHeight - canvasHeight * zoom) / 2;
      return { zoom, panX, panY };
    }),
}));
