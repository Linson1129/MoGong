/**
 * One drawn rectangle.
 *
 * Rendering an element as a real SVG node rather than painting it into a bitmap is the reason the
 * SVG choice in docs/architecture.md section 2 pays off: pointer events, hover and focus come from
 * the browser, and the nesting relation can be expressed as grouping instead of being tracked
 * beside the pixels.
 */

import { memo } from "react";

import { GESTURE } from "@/lib/constants";
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
  if (style === "dotted") return `${width} ${width * 2}`;
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

  return (
    <g
      data-element-id={element.id}
      style={{
        opacity: element.fill.opacity,
        cursor: element.locked ? "not-allowed" : "move",
      }}
      onDoubleClick={onDoubleClick}
    >
      <rect
        x={element.x}
        y={element.y}
        width={element.width}
        height={element.height}
        fill={element.fill.color}
        // A zero-width border still paints a hairline in some renderers if the stroke is set, so
        // the stroke is omitted entirely rather than relied on to be invisible.
        stroke={border.width > 0 && border.style !== "none" ? border.color : undefined}
        strokeWidth={border.width > 0 ? border.width : undefined}
        strokeDasharray={dashPattern(border.style, border.width)}
        rx={border.radius > 0 ? border.radius : undefined}
        ry={border.radius > 0 ? border.radius : undefined}
      />

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
