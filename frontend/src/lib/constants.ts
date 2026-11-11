/**
 * Tunable constants, gathered in one place so they can be retuned without hunting through code.
 *
 * Each value here encodes a product decision, not an implementation detail. The gesture numbers
 * in particular are expected to change after Captain uses the tool for a few minutes; keeping them
 * named and together is what makes that a one-line edit rather than a refactor.
 */

/** Default design frame. Web desktop, per docs/spec.md section 3. */
export const DEFAULT_CANVAS = {
  width: 1440,
  height: 900,
  background: "#FFFFFF",
  gridSize: 8,
  snapToGrid: true,
} as const;

export const GESTURE = {
  /**
   * Milliseconds the left button must be held before a drag becomes a draw rather than a click.
   *
   * This is the most important number in the product. Click-to-select and hold-to-draw share one
   * physical input, so this threshold is the only thing separating them. Too low and selecting an
   * element starts an accidental drag; too high and drawing feels sluggish. Tuned by hand, not
   * by argument.
   */
  longPressMs: 180,

  /**
   * Pixels the pointer must travel before a press counts as motion at all.
   *
   * Without this, a hand tremor of one pixel during a click would register as a drag and select
   * the wrong thing.
   */
  moveThresholdPx: 3,

  /** Double-click window, left over from the platform convention. */
  doubleClickMs: 300,

  /** Size of a resize handle, in screen pixels. Kept constant under zoom so it stays grabbable. */
  handleSizePx: 8,

  /** Arrow-key pan distance in canvas pixels; multiplied by Shift for a coarse pan. */
  panStepPx: 40,
} as const;

export const ZOOM = {
  min: 0.1,
  max: 8,
  /** Multiplier applied per wheel notch. Reduced from 1.1 to 1.05 for finer control. */
  stepFactor: 1.05,
} as const;

/** Middle-button pan steps, per docs/spec.md section 4. */
export const MOUSE_BUTTON = {
  left: 0,
  middle: 1,
  right: 2,
} as const;

export const HISTORY_LIMIT = 100;

/**
 * Threshold for converting a drawn rectangle into an icon stamp.
 *
 * When both width and height are below these values, the element is treated as an icon rather than
 * a region. The stamp is rendered as a circle with the note as a label.
 */
export const STAMP_THRESHOLD = {
  width: 32,
  height: 32,
} as const;

/**
 * Percent values are rounded to this many decimals in compiled output.
 *
 * Sub-pixel precision in a hand-drawn rectangle is jitter rather than intent, and exposing it
 * invites the agent into false exactness. Must match PERCENT_PRECISION in the Python schema.
 */
export const PERCENT_PRECISION = 2;

/** Floating point comparison tolerance. Mirrors EPSILON in backend/app/models/geometry.py. */
export const GEOMETRY_EPSILON = 1e-9;

/** Element ids are also filenames, so they carry the same restriction the backend enforces. */
export const LAYOUT_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;

/** 侧边栏提供的色板。精选 8 种高对比度颜色，避免相似色混淆。 */
export const PALETTE = {
  /** 默认 8 种高对比度颜色。 */
  fills: [
    "#FFFFFF", // 白色
    "#E2E8F0", // 浅灰
    "#93C5FD", // 蓝色
    "#86EFAC", // 绿色
    "#FCD34D", // 黄色
    "#FCA5A5", // 红色
    "#C4B5FD", // 紫色
    "#5EEAD4", // 青色
  ],
  /** 点击展开后显示的扩展色板。 */
  fillsExtended: [
    "#FFFFFF", // 白色
    "#F1F5F9", //  slate-100
    "#E2E8F0", // 浅灰
    "#CBD5E1", // 深灰
    "#94A3B8", // 灰色
    "#64748B", // 暗灰
    "#DBEAFE", // 浅蓝
    "#93C5FD", // 蓝色
    "#60A5FA", // 深蓝
    "#3B82F6", // 蓝色 500
    "#DCFCE7", // 浅绿
    "#86EFAC", // 绿色
    "#4ADE80", // 深绿
    "#22C55E", // 绿色 500
    "#FEF3C7", // 浅黄
    "#FCD34D", // 黄色
    "#FBBF24", // 深黄
    "#F59E0B", // 黄色 500
    "#FEE2E2", // 浅红
    "#FCA5A5", // 红色
    "#F87171", // 深红
    "#EF4444", // 红色 500
    "#EDE9FE", // 浅紫
    "#C4B5FD", // 紫色
    "#A78BFA", // 深紫
    "#8B5CF6", // 紫色 500
    "#CCFBF1", // 浅青
    "#5EEAD4", // 青色
    "#2DD4BF", // 深青
    "#14B8A6", // 青色 500
  ],
  borders: ["#000000", "#0F172A", "#334155", "#64748B", "#94A3B8", "#CBD5E1", "#E2E8F0", "#FFFFFF"],
} as const;

/** Maximum number of recently used custom colors to remember. */
export const LRU_COLOR_LIMIT = 8;

/** Backend base URL. Only ever localhost: see docs/architecture.md section 8. */
export const API_BASE = "/api";
