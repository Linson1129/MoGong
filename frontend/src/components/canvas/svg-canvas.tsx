/**
 * The drawing surface.
 *
 * Zoom and pan are applied as a single transform on a wrapper group rather than as a viewBox
 * recomputation. That keeps canvas coordinates independent of the container's measured size, so
 * no ResizeObserver is needed and the numbers the compiler reads are the numbers the user drew.
 *
 * The cost is that everything inside the group scales, including strokes. That is handled where it
 * is visible -- Rectangle divides its chrome widths by the zoom -- rather than by transforming each
 * element back, which would fight the nesting grouping.
 */

import { useCallback, useRef } from "react";

import { Rectangle } from "./rectangle";
import { screenToCanvas } from "@/lib/canvas-coords";
import { MOUSE_BUTTON } from "@/lib/constants";
import { classifyPendingGesture, drawPreview } from "@/lib/gestures";
import { hitTest } from "@/lib/hit-test";
import { useDocumentStore } from "@/stores/use-document-store";
import { useInteractionStore } from "@/stores/use-interaction-store";
import { useViewStore } from "@/stores/use-view-store";

export function SvgCanvas() {
  const svgRef = useRef<SVGSVGElement>(null);

  const elements = useDocumentStore((state) => state.elements);
  const canvas = useDocumentStore((state) => state.canvas);
  const addElement = useDocumentStore((state) => state.addElement);

  const selectedId = useInteractionStore((state) => state.selectedId);
  const hoveredId = useInteractionStore((state) => state.hoveredId);
  const gesture = useInteractionStore((state) => state.gesture);
  const setCursor = useInteractionStore((state) => state.setCursor);
  const setGesture = useInteractionStore((state) => state.setGesture);
  const select = useInteractionStore((state) => state.select);

  const zoom = useViewStore((state) => state.zoom);
  const panX = useViewStore((state) => state.panX);
  const panY = useViewStore((state) => state.panY);
  const isPanning = useViewStore((state) => state.isPanning);

  /**
   * Screen coordinates to canvas coordinates, through the one shared implementation.
   *
   * Every M2 gesture will convert through this same call, so a rectangle cannot land somewhere
   * other than under the cursor on one path and not another.
   */
  const toCanvasPoint = useCallback(
    (clientX: number, clientY: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return screenToCanvas({ clientX, clientY }, { left: rect.left, top: rect.top }, { zoom, panX, panY });
    },
    [zoom, panX, panY],
  );

  const gridSize = canvas.gridSize;

  /**
   * Left button down: start a pending gesture that may become a click or a draw.
   *
   * The gesture is "pending" because we do not yet know whether the user means to select an
   * existing element or to draw a new one. The decision is deferred until either the long-press
   * threshold elapses (commit to draw) or the button is released (commit to click).
   */
  const handleMouseDown = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      if (event.button !== MOUSE_BUTTON.left) return;
      const { x, y } = toCanvasPoint(event.clientX, event.clientY);
      setGesture({ kind: "pending", originX: x, originY: y, startedAt: Date.now() });
    },
    [toCanvasPoint, setGesture],
  );

  /**
   * Mouse move: classify pending gesture and update drawing preview.
   *
   * While the gesture is pending, every move checks whether the long-press threshold has been
   * crossed. Once it has, the gesture commits to drawing and the preview rect tracks the cursor.
   * If the pointer moves too far before the threshold, the pending state is cancelled.
   */
  const handleMouseMove = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      const { x, y } = toCanvasPoint(event.clientX, event.clientY);
      setCursor({ x, y });

      if (gesture.kind === "pending") {
        const distance = Math.hypot(x - gesture.originX, y - gesture.originY);
        const classification = classifyPendingGesture(gesture.startedAt, Date.now(), distance);
        if (classification.kind === "commit-to-draw") {
          const preview = drawPreview(gesture.originX, gesture.originY, x, y);
          setGesture({ kind: "drawing", originX: gesture.originX, originY: gesture.originY, current: preview });
        } else if (classification.kind === "cancel-to-click") {
          setGesture({ kind: "idle" });
        }
      } else if (gesture.kind === "drawing") {
        const preview = drawPreview(gesture.originX, gesture.originY, x, y);
        setGesture({ kind: "drawing", originX: gesture.originX, originY: gesture.originY, current: preview });
      }
    },
    [toCanvasPoint, setCursor, gesture, setGesture],
  );

  /**
   * Left button up: commit the gesture to either a click or a new element.
   *
   * If the gesture was still pending (quick release without motion), this is a click. Hit testing
   * determines which element (if any) was under the cursor and selects it. If the gesture was
   * drawing, the preview rectangle becomes a new element. If the gesture was cancelled (too much
   * motion before threshold), it is treated as a click with no selection change.
   */
  const handleMouseUp = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      if (event.button !== MOUSE_BUTTON.left) return;

      if (gesture.kind === "pending") {
        // Quick release without motion or long-press: a click. Hit test to find what was clicked.
        const { x, y } = toCanvasPoint(event.clientX, event.clientY);
        const hitId = hitTest(elements, x, y);
        select(hitId);
      } else if (gesture.kind === "drawing") {
        const { current } = gesture;
        // Only commit if the rectangle has non-zero area; a click without motion produces a
        // zero-size rect that would be rejected by the backend anyway.
        if (current.width > 0 && current.height > 0) {
          const id = `el-${Date.now().toString(36)}`;
          addElement({
            id,
            name: "",
            x: current.x,
            y: current.y,
            width: current.width,
            height: current.height,
            fill: { color: "#E2E8F0", opacity: 1 },
            border: { width: 1, style: "solid", color: "#64748B", radius: 0 },
            note: null,
            locked: false,
            visible: true,
          });
          // Select the newly created element so the user can immediately edit it.
          select(id);
        }
      }
      // For cancelled gestures (motion before threshold), do nothing: the click is consumed by
      // the gesture arbitration and the selection state is unchanged.

      setGesture({ kind: "idle" });
    },
    [gesture, toCanvasPoint, elements, select, addElement, setGesture],
  );

  return (
    <svg
      ref={svgRef}
      data-testid="mogong-canvas"
      className="h-full w-full touch-none select-none"
      style={{
        background: "#0B1220",
        cursor: isPanning ? "grabbing" : "default",
      }}
      // Blocking the browser default stops Ctrl-wheel page zoom, which would otherwise fire during
      // a zoom gesture and take the user's place in the tab.
      onWheel={(event) => event.preventDefault()}
      onContextMenu={(event) => event.preventDefault()}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => {
        setCursor(null);
        if (gesture.kind !== "idle") setGesture({ kind: "idle" });
      }}
    >
      <defs>
        <pattern
          id="mogong-grid"
          width={gridSize}
          height={gridSize}
          patternUnits="userSpaceOnUse"
        >
          <path
            d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`}
            fill="none"
            stroke="#1E293B"
            strokeWidth={1 / zoom}
          />
        </pattern>
      </defs>

      {/* Untransformed so it always fills the viewport. Putting the backdrop inside the pan group
          would leave a dark gap at the edges once zoomed out, because its extent is written in
          canvas units while the visible area is not. */}
      <rect x={0} y={0} width="100%" height="100%" fill="#0F172A" />

      <g transform={`translate(${panX} ${panY}) scale(${zoom})`}>
        <rect
          data-testid="canvas-frame"
          x={0}
          y={0}
          width={canvas.width}
          height={canvas.height}
          fill={canvas.background}
        />

        {canvas.snapToGrid && (
          <rect
            x={0}
            y={0}
            width={canvas.width}
            height={canvas.height}
            fill="url(#mogong-grid)"
            pointerEvents="none"
          />
        )}

        <rect
          x={0}
          y={0}
          width={canvas.width}
          height={canvas.height}
          fill="none"
          stroke="#334155"
          strokeWidth={1 / zoom}
          pointerEvents="none"
        />

        {elements.map((element) => (
          <Rectangle
            key={element.id}
            element={element}
            selected={element.id === selectedId}
            hovered={element.id === hoveredId}
            zoom={zoom}
          />
        ))}

        {/* Drawing preview: dashed outline that tracks the cursor during a long-press draw. */}
        {gesture.kind === "drawing" && (
          <rect
            data-testid="drawing-preview"
            x={gesture.current.x}
            y={gesture.current.y}
            width={gesture.current.width}
            height={gesture.current.height}
            fill="none"
            stroke="#3B82F6"
            strokeWidth={2 / zoom}
            strokeDasharray={`${4 / zoom} ${4 / zoom}`}
            pointerEvents="none"
          />
        )}

        {elements.length === 0 && gesture.kind !== "drawing" && (
          <text
            x={canvas.width / 2}
            y={canvas.height / 2}
            textAnchor="middle"
            fill="#94A3B8"
            fontSize={16 / zoom}
            pointerEvents="none"
          >
            Press and hold the left button, then drag, to draw a region.
          </text>
        )}
      </g>
    </svg>
  );
}
