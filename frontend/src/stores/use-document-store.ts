/**
 * Document store: the editable source of truth, held in client memory.
 *
 * Every mutation goes through `applyEdit`. That single funnel exists so milestone M2 can attach an
 * undo stack here without touching a single call site -- history becomes "keep the previous state
 * that passed through this function" rather than a patch on every action.
 *
 * Live drag geometry does NOT live here. During a pointer move the working rectangle belongs to
 * the interaction store, and this store is written once, on pointer up. Without that split, every
 * frame of a drag would push an entry onto the history stack and one rectangle would take sixty
 * undos to remove. See docs/architecture.md section 3.
 */

import { create } from "zustand";

import { DEFAULT_CANVAS } from "@/lib/constants";
import type {
  Border,
  CanvasConfig,
  DocumentMeta,
  Fill,
  LayoutElement,
  MoGongDocument,
} from "@/types/document";

/** A change to the document, expressed as a function rather than a patch. */
export type Edit = (state: DocumentState) => Partial<DocumentState>;

/** Snapshot shape captured for undo. Deliberately excludes transient and view state. */
export interface HistorySnapshot {
  elements: LayoutElement[];
  canvas: CanvasConfig;
  meta: DocumentMeta;
}

interface DocumentState {
  meta: DocumentMeta;
  canvas: CanvasConfig;
  elements: LayoutElement[];
  /** Bumped on every committed edit so subscribers can react without diffing arrays. */
  revision: number;
}

interface DocumentActions {
  applyEdit: (edit: Edit) => void;
  addElement: (element: LayoutElement) => void;
  updateElement: (id: string, patch: Partial<Omit<LayoutElement, "id">>) => void;
  updateFill: (id: string, patch: Partial<Fill>) => void;
  updateBorder: (id: string, patch: Partial<Border>) => void;
  setNote: (id: string, note: string | null) => void;
  removeElement: (id: string) => void;
  reorderElement: (id: string, direction: "front" | "back") => void;
  setCanvas: (patch: Partial<CanvasConfig>) => void;
  loadDocument: (document: MoGongDocument) => void;
  resetDocument: (meta?: Partial<DocumentMeta>) => void;
  toDocument: (viewport: { zoom: number; panX: number; panY: number }) => MoGongDocument;
  getSnapshot: () => HistorySnapshot;
  restoreSnapshot: (snapshot: HistorySnapshot) => void;
}

export type DocumentStore = DocumentState & DocumentActions;

/**
 * Insertion order is z-order. The compiler does not rely on it -- it resolves nesting from
 * geometry -- but the renderer does, and keeping the two concerns separate means reordering for
 * display never changes what a drawing means.
 */
export function createElementDefaults(
  id: string,
  rect: { x: number; y: number; width: number; height: number },
): LayoutElement {
  return {
    id,
    name: "",
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    fill: { color: "#E2E8F0", opacity: 1 },
    border: { width: 1, style: "solid", color: "#64748B", radius: 0 },
    note: null,
    locked: false,
    visible: true,
  };
}

function newMeta(id: string): DocumentMeta {
  const now = new Date().toISOString();
  return { id, name: "untitled", createdAt: now, updatedAt: now };
}

/**
 * An edit over one element, which is a no-op when that element is not in the document.
 *
 * The check matters more than the map. Returning `{ elements: map(...) }` for an id that does not
 * exist produces a new array and therefore a fresh revision, so every stray Escape, every delete on
 * an empty canvas, and every panel action aimed at an element another gesture already removed would
 * occupy a slot in the undo stack that undoes nothing.
 */
function editElement(id: string, change: (element: LayoutElement) => LayoutElement): Edit {
  return (state) => {
    if (!state.elements.some((existing) => existing.id === id)) return {};
    return {
      elements: state.elements.map((existing) =>
        existing.id === id ? change(existing) : existing,
      ),
    };
  };
}

const initialState = (): DocumentState => ({
  meta: newMeta(`layout-${Date.now().toString(36)}`),
  canvas: { ...DEFAULT_CANVAS },
  elements: [],
  revision: 0,
});

export const useDocumentStore = create<DocumentStore>((set, get) => ({
  ...initialState(),

  applyEdit: (edit) => {
    set((state) => {
      const patch = edit(state);
      // A no-op edit must not bump the revision: M2 layers undo on top of this function by
      // snapshotting on each revision change, and empty edits would fill the stack.
      if (Object.keys(patch).length === 0) return state;
      return { ...patch, revision: state.revision + 1 };
    });
  },

  addElement: (element) =>
    get().applyEdit((state) => {
      if (state.elements.some((existing) => existing.id === element.id)) {
        // Duplicated ids would survive into the document and be rejected by the backend at save
        // time, when the user has already moved on. Refusing here keeps the failure local.
        return {};
      }
      return { elements: [...state.elements, element] };
    }),

  updateElement: (id, patch) =>
    get().applyEdit(
      editElement(id, (element) => ({ ...element, ...patch })),
    ),

  updateFill: (id, patch) =>
    get().applyEdit(
      editElement(id, (element) => ({ ...element, fill: { ...element.fill, ...patch } })),
    ),

  updateBorder: (id, patch) =>
    get().applyEdit(
      editElement(id, (element) => {
        const border = { ...element.border, ...patch };
        // Mirrors the backend reconciliation: width is the authority on whether a border exists,
        // so a zero width always reads as "none" and the two sides never disagree about a drawing.
        if (border.width <= 0) border.style = "none";
        else if (border.style === "none") border.style = "solid";
        return { ...element, border };
      }),
    ),

  setNote: (id, note) => get().applyEdit(editElement(id, (element) => ({ ...element, note }))),

  removeElement: (id) =>
    get().applyEdit((state) =>
      state.elements.some((element) => element.id === id)
        ? { elements: state.elements.filter((element) => element.id !== id) }
        : {},
    ),

  reorderElement: (id, direction) =>
    get().applyEdit((state) => {
      const index = state.elements.findIndex((element) => element.id === id);
      if (index < 0) return {};
      const element = state.elements[index];
      const rest = state.elements.filter((_, position) => position !== index);
      return { elements: direction === "front" ? [...rest, element] : [element, ...rest] };
    }),

  setCanvas: (patch) =>
    get().applyEdit((state) => ({ canvas: { ...state.canvas, ...patch } })),

  loadDocument: (document) =>
    set(() => ({
      meta: document.meta,
      canvas: document.canvas,
      elements: document.elements,
      revision: 0,
    })),

  resetDocument: (meta) =>
    set(() => {
      const fresh = initialState();
      return { ...fresh, meta: { ...fresh.meta, ...meta } };
    }),

  toDocument: (viewport) => {
    const { meta, canvas, elements } = get();
    return {
      format: "mogong.document" as const,
      version: "1.0",
      meta: { ...meta, updatedAt: new Date().toISOString() },
      canvas,
      elements,
      viewport,
    };
  },

  getSnapshot: () => {
    const { elements, canvas, meta } = get();
    // Structured copy, because a snapshot that shares element objects with the live store would
    // undo into a state that has since been mutated.
    return structuredClone({ elements, canvas, meta });
  },

  restoreSnapshot: (snapshot) =>
    set((state) => ({
      elements: structuredClone(snapshot.elements),
      canvas: structuredClone(snapshot.canvas),
      meta: structuredClone(snapshot.meta),
      revision: state.revision + 1,
    })),
}));

/** Selectors kept here so components do not each write their own equality check. */
export const selectElements = (state: DocumentStore): LayoutElement[] => state.elements;
export const selectElementById =
  (id: string | null) =>
  (state: DocumentStore): LayoutElement | undefined =>
    id === null ? undefined : state.elements.find((element) => element.id === id);
