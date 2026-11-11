/**
 * Interaction store: everything transient about what the user is doing right now.
 *
 * Held apart from the document store on purpose. Selection changes and per-frame drag geometry fire
 * on every pointer move, and none of them are committed edits. Routing them through the document
 * store would re-render the sidebar each frame and would give milestone M2's undo stack sixty
 * entries for a single rectangle.
 */

import { create } from "zustand";

import type { Rect } from "@/lib/geometry";
import type { ResizeHandle } from "@/lib/handles";

/**
 * The gesture the canvas is currently arbitrating.
 *
 * One explicit union rather than a pile of booleans, because these states are mutually exclusive
 * and a `isDragging && isPanning` combination is a bug the type system should refuse to express.
 * The arbitration itself lives in lib/gestures.ts; this is only its result.
 */
export type ActiveGesture =
  | { kind: "idle" }
  /** Button is down, threshold not yet crossed. Still undecided between click and draw. */
  | { kind: "pending"; originX: number; originY: number; startedAt: number }
  | { kind: "drawing"; originX: number; originY: number; current: Rect }
  | { kind: "moving"; id: string; startX: number; startY: number; offset: { dx: number; dy: number } }
  | { kind: "resizing"; id: string; handle: ResizeHandle; original: Rect; current: Rect }
  | { kind: "panning"; lastX: number; lastY: number };

interface InteractionState {
  selectedId: string | null;
  hoveredId: string | null;
  /** Element whose property panel the right-click menu opened. Independent of selection. */
  inspectedId: string | null;
  gesture: ActiveGesture;
  /** Element being edited through double-click. Non-null suspends canvas gestures for typing. */
  noteEditingId: string | null;
  /**
   * Pointer position in canvas units, or null when the pointer is off the canvas.
   *
   * Lives here rather than as local component state because the status readout, the future alignment
   * guides and the gesture layer all need the same number. Three copies of a cursor position is how
   * a guide ends up drawn a few pixels from the pointer.
   */
  cursor: { x: number; y: number } | null;
}

interface InteractionActions {
  select: (id: string | null) => void;
  setHovered: (id: string | null) => void;
  inspect: (id: string | null) => void;
  setGesture: (gesture: ActiveGesture) => void;
  beginNoteEditing: (id: string) => void;
  endNoteEditing: () => void;
  setCursor: (position: { x: number; y: number } | null) => void;
  /** Called on pointer up and on Escape. Restores the canvas to a neutral state. */
  clearTransient: () => void;
}

export type InteractionStore = InteractionState & InteractionActions;

export const useInteractionStore = create<InteractionStore>((set) => ({
  selectedId: null,
  hoveredId: null,
  inspectedId: null,
  gesture: { kind: "idle" },
  noteEditingId: null,
  cursor: null,

  select: (id) => set(() => ({ selectedId: id })),
  setHovered: (id) => set(() => ({ hoveredId: id })),
  inspect: (id) => set(() => ({ inspectedId: id })),
  setGesture: (gesture) => set(() => ({ gesture })),
  beginNoteEditing: (id) => set(() => ({ noteEditingId: id, selectedId: id })),
  endNoteEditing: () => set(() => ({ noteEditingId: null })),
  setCursor: (position) => set(() => ({ cursor: position })),
  clearTransient: () =>
    set(() => ({ gesture: { kind: "idle" }, inspectedId: null, noteEditingId: null })),
}));

/** True when a pointer event should reach an element rather than the canvas background. */
export const selectIsGesturing = (state: InteractionStore): boolean =>
  state.gesture.kind !== "idle";

/** Typing in a note must not be interrupted by canvas keyboard shortcuts. */
export const selectIsEditingNote = (state: InteractionStore): boolean =>
  state.noteEditingId !== null;
