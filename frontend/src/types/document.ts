/**
 * Document format types: the editable source of truth for a layout.
 *
 * Mirrors docs/json-schema.md section 1 and backend/app/schemas/document.py. The two must not
 * drift, because a field the frontend sends that the backend forbids fails the whole save, and a
 * field the backend emits that the frontend does not read disappears silently.
 *
 * Every type here describes data at rest. Runtime working state lives in the stores and is allowed
 * to be shaped differently -- for example a rectangle mid-drag, which has no stable bounds yet.
 */

export type BorderStyle = "solid" | "dashed";

export interface Fill {
  /** Uppercase 6-digit hex, `#RRGGBB`. The schema rejects anything else. */
  color: string;
  /** 0 to 1. */
  opacity: number;
}

export interface Border {
  /** Pixels. Zero means no border, and is the single spelling of that state. */
  width: number;
  style: BorderStyle;
  color: string;
  radius: number;
}

/**
 * One drawn rectangle, in absolute canvas pixels.
 *
 * `width` and `height` are always non-negative. A reverse drag is normalized before it is stored,
 * so nothing reading an element has to consider an inverted box.
 *
 * When `stamp` is true, the element represents an icon rather than a region. It is rendered as a
 * circle and the note is displayed as a label. Stamps are created automatically when a drawn
 * rectangle is smaller than the threshold defined in constants.ts.
 */
export interface LayoutElement {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fill: Fill;
  border: Border;
  note: string | null;
  locked: boolean;
  visible: boolean;
  /** True when this element represents an icon stamp rather than a rectangular region. */
  stamp: boolean;
}

export interface CanvasConfig {
  width: number;
  height: number;
  background: string;
  gridSize: number;
  snapToGrid: boolean;
}

/** Editor camera. Persisted so a layout reopens as it was left, and excluded from compilation. */
export interface Viewport {
  zoom: number;
  panX: number;
  panY: number;
}

export interface DocumentMeta {
  id: string;
  name: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface MoGongDocument {
  format: "mogong.document";
  version: string;
  meta: DocumentMeta;
  canvas: CanvasConfig;
  /**
   * Flat, with no parent reference. The nesting tree is derived at compile time from geometry,
   * which means an edit can never leave a stale parentId behind.
   */
  elements: LayoutElement[];
  viewport: Viewport;
}

export type ProblemLevel = "info" | "warning" | "error";

export type ProblemCode =
  | "ELEMENT_OFF_CANVAS"
  | "ELEMENT_TOO_SMALL"
  | "DUPLICATE_GEOMETRY"
  | "EMPTY_DOCUMENT"
  | "PARTIAL_OVERLAP";

export interface ValidationProblem {
  code: ProblemCode;
  level: ProblemLevel;
  elements: string[];
  message: string;
}

export interface ValidationResponse {
  valid: boolean;
  elementCount: number;
  problems: ValidationProblem[];
}

export interface LayoutSummary {
  id: string;
  name: string;
  elementCount: number;
  canvasWidth: number;
  canvasHeight: number;
}

export interface LayoutListResponse {
  items: LayoutSummary[];
  total: number;
}
