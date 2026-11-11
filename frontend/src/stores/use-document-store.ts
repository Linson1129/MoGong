/**
 * 文档存储：可编辑的真实来源，保存在客户端内存中。
 *
 * 每次修改都通过 `applyEdit`。这个单一漏斗存在的原因是 M2 可以在其上附加撤销栈——
 * 历史记录变成“保留通过此函数的上一个状态”而不是在每个动作上打补丁。
 *
 * 实时拖拽几何信息不存储在这里。拖拽时工作矩形属于交互存储，只在指针抬起时写入此存储。
 * 如果没有这个分离，拖拽的每一帧都会推送一个历史记录条目，一个矩形需要六十次撤销才能移除。
 *
 * 文档自动保存到 localStorage，刷新页面时自动恢复。
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

/** localStorage 存储键名 */
const STORAGE_KEY = "mogong-document";

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
    stamp: false,
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

const initialState = (): DocumentState => {
  // 尝试从 localStorage 加载已保存的文档
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.elements && parsed.canvas && parsed.meta) {
          return {
            meta: parsed.meta,
            canvas: parsed.canvas,
            elements: parsed.elements,
            revision: 0,
          };
        }
      }
    } catch {
      // 忽略解析错误，使用初始状态
    }
  }
  return {
    meta: newMeta(`layout-${Date.now().toString(36)}`),
    canvas: { ...DEFAULT_CANVAS },
    elements: [],
    revision: 0,
  };
};

/** 将当前文档保存到 localStorage */
function saveToStorage(state: DocumentState): void {
  if (typeof window === "undefined") return;
  try {
    const toSave = {
      meta: state.meta,
      canvas: state.canvas,
      elements: state.elements,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch {
    // 忽略存储错误
  }
}

export const useDocumentStore = create<DocumentStore>((set, get) => ({
  ...initialState(),

  applyEdit: (edit) => {
    set((state) => {
      const patch = edit(state);
      // 无操作的编辑不应增加 revision：撤销栈基于 revision 变化快照，
      // 空编辑会填充撤销栈。
      if (Object.keys(patch).length === 0) return state;
      const newState = { ...patch, revision: state.revision + 1 };
      // 自动保存到 localStorage
      saveToStorage({ ...state, ...newState });
      return newState;
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
        // 宽度为 0 时，样式默认为实线
        if (border.width <= 0) border.style = "solid";
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

  loadDocument: (document) => {
    const newState = {
      meta: document.meta,
      canvas: document.canvas,
      elements: document.elements,
      revision: 0,
    };
    set(newState);
    saveToStorage(newState);
  },

  resetDocument: (meta) => {
    const fresh = initialState();
    const newState = { ...fresh, meta: { ...fresh.meta, ...meta } };
    set(newState);
    saveToStorage(newState);
  },

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
