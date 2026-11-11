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
  /** Multiplier applied per wheel notch, so zooming feels even in both directions. */
  stepFactor: 1.1,
} as const;

/** Middle-button pan steps, per docs/spec.md section 4. */
export const MOUSE_BUTTON = {
  left: 0,
  middle: 1,
  right: 2,
} as const;

export const HISTORY_LIMIT = 100;

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

/** Swatches offered in the sidebar. A curated short list beats an unpickable color field. */
export const PALETTE = {
  fills: [
    "#FFFFFF",
    "#F8FAFC",
    "#E2E8F0",
    "#94A3B8",
    "#475569",
    "#1E293B",
    "#0F172A",
    "#DBEAFE",
    "#BFDBFE",
    "#93C5FD",
    "#3B82F6",
    "#1D4ED8",
    "#DCFCE7",
    "#86EFAC",
    "#22C55E",
    "#15803D",
    "#FEF3C7",
    "#FCD34D",
    "#F59E0B",
    "#B45309",
    "#FEE2E2",
    "#FCA5A5",
    "#EF4444",
    "#B91C1C",
  ],
  borders: ["#000000", "#0F172A", "#334155", "#64748B", "#94A3B8", "#CBD5E1", "#E2E8F0", "#FFFFFF"],
} as const;

/** Backend base URL. Only ever localhost: see docs/architecture.md section 8. */
export const API_BASE = "/api";
