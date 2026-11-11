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
import { useDocumentStore } from "@/stores/use-document-store";
import { useInteractionStore } from "@/stores/use-interaction-store";
import { useViewStore } from "@/stores/use-view-store";

export function SvgCanvas() {
  const svgRef = useRef<SVGSVGElement>(null);

  const elements = useDocumentStore((state) => state.elements);
  const canvas = useDocumentStore((state) => state.canvas);

  const selectedId = useInteractionStore((state) => state.selectedId);
  const hoveredId = useInteractionStore((state) => state.hoveredId);
  const setCursor = useInteractionStore((state) => state.setCursor);

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
      onMouseMove={(event) => setCursor(toCanvasPoint(event.clientX, event.clientY))}
      onMouseLeave={() => setCursor(null)}
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

        {elements.length === 0 && (
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
