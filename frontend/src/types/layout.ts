/**
 * Compiled format types: the agent-facing artifact, `*.layout.json`.
 *
 * Mirrors docs/json-schema.md section 2 and backend/app/schemas/layout.py.
 *
 * Geometry here is relative to the parent, in percent. That is the whole point of compiling: a
 * pixel width stops being true the moment the agent picks a different container size, while
 * "takes 40 percent of the header" survives the translation into CSS.
 */

import type { Border } from "./document";

export type LayoutMode = "none" | "row" | "column" | "stack" | "free";

export type ElementRole =
  | "navigation"
  | "contentinfo"
  | "main"
  | "region"
  | "container"
  | "button"
  | "text"
  | "image"
  | "block";

export interface Box {
  /** Percent of parent width, measured from the parent's left edge. */
  x: number;
  /** Percent of parent height, measured from the parent's top edge. */
  y: number;
  width: number;
  height: number;
  unit: "%";
}

export interface SpacingInfo {
  axis: LayoutMode;
  gap: number;
  unit: "%";
  /** False when the gaps differ, in which case `gap` is an average and a warning lists outliers. */
  consistent: boolean;
}

export interface AlignInfo {
  horizontal: string | null;
  vertical: string | null;
  tolerancePx: number;
}

export interface StyleInfo {
  fill: string | null;
  fillOpacity: number;
  /** Null when there is no border, so the agent reads a real absence, not a zero-width stroke. */
  border: Border | null;
}

export type LayoutWarningCode =
  | "PARTIAL_OVERLAP"
  | "AMBIGUOUS_LAYOUT"
  | "INCONSISTENT_GAP"
  | "OFF_CANVAS"
  | "EMPTY_DOCUMENT"
  | "ELEMENT_DROPPED";

export interface LayoutWarning {
  code: LayoutWarningCode;
  elements: string[];
  message: string;
}

export interface LayoutNode {
  id: string;
  name: string;
  role: ElementRole;
  box: Box;
  layout: LayoutMode;
  style: StyleInfo;
  /** Verbatim user text. The compiler never rewrites or summarizes it. */
  note: string | null;
  spacing: SpacingInfo | null;
  align: AlignInfo | null;
  children: LayoutNode[];
}

export interface CanvasSummary {
  width: number;
  height: number;
  background: string;
  platform: string;
}

export interface LayoutMeta {
  name: string;
  source: string;
  generatedAt: string | null;
}

export interface LayoutDocument {
  format: "mogong.layout";
  version: string;
  meta: LayoutMeta;
  canvas: CanvasSummary;
  root: LayoutNode;
  /** Present even when empty, so a consumer never has to distinguish "clean" from "not checked". */
  warnings: LayoutWarning[];
}

export interface CompileResponse {
  layout: LayoutDocument;
  writtenTo: string | null;
}
