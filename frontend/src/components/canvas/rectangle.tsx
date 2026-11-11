/**
 * One drawn rectangle or icon stamp.
 *
 * Rendering an element as a real SVG node rather than painting it into a bitmap is the reason the
 * SVG choice in docs/architecture.md section 2 pays off: pointer events, hover and focus come from
 * the browser, and the nesting relation can be expressed as grouping instead of being tracked
 * beside the pixels.
 *
 * When `element.stamp` is true, the element is rendered as a circle with the note displayed as a
 * label. The circle diameter is the smaller of width and height, centered in the bounding box.
 */

import { memo } from "react";

import { GESTURE, STAMP_THRESHOLD } from "@/lib/constants";
import type { LayoutElement } from "@/types/document";

interface RectangleProps {
  element: LayoutElement;
  selected: boolean;
  hovered: boolean;
  /**
   * Current viewport scale.
   *
   * Stroke widths for selection and hover are divided by this so they keep a constant *screen*
   * thickness. A 1 px outline that scales with zoom becomes invisible at 20 percent and a loud box
   * at 400 percent, and either way it stops being UI and starts being artwork.
   */
  zoom: number;
  /** Called when the element is double-clicked. Used to start note editing. */
  onDoubleClick?: () => void;
}

/** Selection outline colour. Deliberately outside the user's palette so it always reads as chrome. */
const SELECTION_COLOR = "#2563EB";
const HOVER_COLOR = "#93C5FD";

function dashPattern(style: LayoutElement["border"]["style"], width: number): string | undefined {
  if (width <= 0) return undefined;
  if (style === "dashed") return `${width * 3} ${width * 2}`;
  return undefined;
}

export const Rectangle = memo(function Rectangle({
  element,
  selected,
  hovered,
  zoom,
  onDoubleClick,
}: RectangleProps) {
  if (!element.visible) return null;

  const { border } = element;
  const outlineWidth = 1 / zoom;

  // Stamp rendering: fixed-size circle with note label.
  // The diameter is fixed regardless of the element's actual width/height, so small draws
  // produce a consistent icon size.
  if (element.stamp) {
    const diameter = STAMP_THRESHOLD.width; // Use the threshold as the fixed stamp size.
    const cx = element.x + element.width / 2;
    const cy = element.y + element.height / 2;
    const r = diameter / 2;

    return (
      <g
        data-element-id={element.id}
        style={{
          opacity: element.fill.opacity,
          cursor: element.locked ? "not-allowed" : "move",
        }}
        onDoubleClick={onDoubleClick}
      >
        {/* Tooltip: show name or note on hover. */}
        <title>{element.name || element.note || `Element ${element.id}`}</title>
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill={element.fill.color}
          stroke={border.width > 0 ? border.color : undefined}
          strokeWidth={border.width > 0 ? border.width : undefined}
          strokeDasharray={dashPattern(border.style, border.width)}
        />

        {/* Note label: rendered below the circle if present. */}
        {element.note && (
          <foreignObject
            x={cx - 60 / zoom}
            y={cy + r + 4 / zoom}
            width={120 / zoom}
            height={60 / zoom}
            style={{ pointerEvents: "none", overflow: "visible" }}
          >
            <div
              style={{
                fontSize: `${11 / zoom}px`,
                lineHeight: 1.35,
                color: "var(--note-color)",
                textAlign: "center",
                wordBreak: "break-word",
                overflowWrap: "anywhere",
                whiteSpace: "normal",
              }}
            >
              {element.note}
            </div>
          </foreignObject>
        )}

        {hovered && !selected && (
          <circle
            cx={cx}
            cy={cy}
            r={r + outlineWidth}
            fill="none"
            stroke={HOVER_COLOR}
            strokeWidth={outlineWidth}
            pointerEvents="none"
          />
        )}

        {selected && (
          <>
            <circle
              cx={cx}
              cy={cy}
              r={r + outlineWidth * 1.5}
              fill="none"
              stroke={SELECTION_COLOR}
              strokeWidth={outlineWidth * 1.5}
              pointerEvents="none"
            />
            {/* Corner markers for stamps: same as rectangles, based on bounding box. */}
            {CORNER_OFFSETS.map((offset) => (
              <rect
                key={offset.key}
                data-handle={offset.key}
                x={element.x + element.width * offset.fx - GESTURE.handleSizePx / zoom / 2}
                y={element.y + element.height * offset.fy - GESTURE.handleSizePx / zoom / 2}
                width={GESTURE.handleSizePx / zoom}
                height={GESTURE.handleSizePx / zoom}
                fill="#FFFFFF"
                stroke={SELECTION_COLOR}
                strokeWidth={outlineWidth}
              />
            ))}
          </>
        )}
      </g>
    );
  }

  // Regular rectangle rendering.
  return (
    <g
      data-element-id={element.id}
      style={{
        opacity: element.fill.opacity,
        cursor: element.locked ? "not-allowed" : "move",
      }}
      onDoubleClick={onDoubleClick}
    >
      {/* Tooltip: show name or note on hover. */}
      <title>{element.name || element.note || `Element ${element.id}`}</title>
      <rect
        x={element.x}
        y={element.y}
        width={element.width}
        height={element.height}
        fill={element.fill.color}
        // 宽度为 0 时不渲染边框
        stroke={border.width > 0 ? border.color : undefined}
        strokeWidth={border.width > 0 ? border.width : undefined}
        strokeDasharray={dashPattern(border.style, border.width)}
        rx={border.radius > 0 ? border.radius : undefined}
        ry={border.radius > 0 ? border.radius : undefined}
      />

      {/* Note label for rectangles: wrapped HTML inside the box via foreignObject. */}
      {element.note && (
        <foreignObject
          x={element.x + 4 / zoom}
          y={element.y + 4 / zoom}
          width={Math.max(element.width - 8 / zoom, 20 / zoom)}
          height={Math.max(element.height - 8 / zoom, 16 / zoom)}
          style={{ pointerEvents: "none", overflow: "hidden" }}
        >
          <div
            style={{
              fontSize: `${11 / zoom}px`,
              lineHeight: 1.35,
              color: "var(--note-color)",
              wordBreak: "break-word",
              overflowWrap: "anywhere",
              whiteSpace: "pre-wrap",
            }}
          >
            {element.note}
          </div>
        </foreignObject>
      )}

      {/* Hover dimensions: show width×height when hovering (but not selected). */}
      {hovered && !selected && !element.note && (
        <text
          x={element.x + 6 / zoom}
          y={element.y + 14 / zoom}
          fill="var(--hover-dim-color)"
          fontSize={10 / zoom}
          pointerEvents="none"
        >
          {Math.round(element.width)}×{Math.round(element.height)}
        </text>
      )}

      {hovered && !selected && (
        <rect
          x={element.x}
          y={element.y}
          width={element.width}
          height={element.height}
          fill="none"
          stroke={HOVER_COLOR}
          strokeWidth={outlineWidth}
          pointerEvents="none"
        />
      )}

      {selected && (
        <>
          <rect
            x={element.x}
            y={element.y}
            width={element.width}
            height={element.height}
            fill="none"
            stroke={SELECTION_COLOR}
            strokeWidth={outlineWidth * 1.5}
            pointerEvents="none"
          />
          {/*
            Corner markers, sized in screen pixels. They are the grab targets for resize from M2
            on, so they are rendered at the same size now to keep the visual and the hit area equal
            rather than discovering a mismatch later.
          */}
          {CORNER_OFFSETS.map((offset) => (
            <rect
              key={offset.key}
              data-handle={offset.key}
              x={element.x + element.width * offset.fx - GESTURE.handleSizePx / zoom / 2}
              y={element.y + element.height * offset.fy - GESTURE.handleSizePx / zoom / 2}
              width={GESTURE.handleSizePx / zoom}
              height={GESTURE.handleSizePx / zoom}
              fill="#FFFFFF"
              stroke={SELECTION_COLOR}
              strokeWidth={outlineWidth}
            />
          ))}
        </>
      )}
    </g>
  );
});

/** Fractional corner positions, so the same table drives render and, later, hit testing. */
const CORNER_OFFSETS = [
  { key: "nw", fx: 0, fy: 0 },
  { key: "ne", fx: 1, fy: 0 },
  { key: "se", fx: 1, fy: 1 },
  { key: "sw", fx: 0, fy: 1 },
] as const;
