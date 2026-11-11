/**
 * Document store.
 *
 * The store is the single source of truth for what a layout is, and milestone M2 layers undo on top
 * of `applyEdit`. Both of those claims are what this file tests: that every write passes through the
 * one funnel, that a write which changed nothing is recorded as having changed nothing, and that the
 * style reconciliation matches the backend so the canvas and the exported JSON describe the same box.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_CANVAS, PALETTE } from "@/lib/constants";
import {
  createElementDefaults,
  selectElementById,
  selectElements,
  useDocumentStore,
} from "@/stores/use-document-store";
import type { LayoutElement, MoGongDocument } from "@/types/document";

const element = (id: string, x = 0, y = 0): LayoutElement =>
  createElementDefaults(id, { x, y, width: 100, height: 50 });

const store = () => useDocumentStore.getState();

function documentWith(elements: LayoutElement[]): MoGongDocument {
  return {
    format: "mogong.document",
    version: "1.0",
    meta: { id: "layout-test", name: "test", createdAt: null, updatedAt: null },
    canvas: { ...DEFAULT_CANVAS },
    elements,
    viewport: { zoom: 1, panX: 0, panY: 0 },
  };
}

beforeEach(() => {
  // The store is a module singleton, so each test has to empty it rather than assume it started
  // empty -- otherwise the suites silently depend on the order Vitest happens to run them in.
  store().resetDocument();
});

function defaultColors(): { fill: string; border: string } {
  const created = createElementDefaults("e1", { x: 0, y: 0, width: 10, height: 10 });
  return { fill: created.fill.color, border: created.border.color };
}

describe("createElementDefaults", () => {
  it("gives a new rectangle geometry and nothing else", () => {
    const created = createElementDefaults("e1", { x: 40, y: 60, width: 200, height: 120 });
    expect(created).toMatchObject({ id: "e1", x: 40, y: 60, width: 200, height: 120 });
    expect(created.note).toBeNull();
    expect(created.name).toBe("");
    expect(created.locked).toBe(false);
    expect(created.visible).toBe(true);
  });

  it("seeds colours the sidebar actually offers", () => {
    // A default that is not in the palette would show up in the element list as a colour nobody can
    // pick, and the swatch grid would render with nothing selected.
    const colors = defaultColors();
    expect(PALETTE.fills).toContain(colors.fill);
    expect(PALETTE.borders).toContain(colors.border);
  });

  it("draws a border by default, so a new rectangle is visible on a white canvas", () => {
    const created = createElementDefaults("e1", { x: 0, y: 0, width: 10, height: 10 });
    expect(created.border.width).toBeGreaterThan(0);
    expect(created.border.style).toBe("solid");
  });
});

describe("applyEdit", () => {
  it("bumps the revision for a real change", () => {
    const before = store().revision;
    store().addElement(element("e1"));
    expect(store().revision).toBe(before + 1);
  });

  it("does not bump the revision for a no-op", () => {
    // M2 decides what counts as an undoable step by watching this counter. An empty edit that still
    // incremented it would put sixty entries on the stack for one click.
    const before = store().revision;
    store().applyEdit(() => ({}));
    expect(store().revision).toBe(before);
  });

  it("keeps the state object identical when the edit is empty", () => {
    const beforeState = useDocumentStore.getState();
    store().applyEdit(() => ({}));
    expect(useDocumentStore.getState()).toBe(beforeState);
  });
});

describe("addElement", () => {
  it("appends in draw order, which is the render order", () => {
    store().addElement(element("a"));
    store().addElement(element("b"));
    expect(selectElements(store()).map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("refuses a duplicate id without touching the revision", () => {
    // The backend also rejects this, but only at save time -- by then the user has drawn three more
    // rectangles and no longer knows which one collided.
    store().addElement(element("dup"));
    const revision = store().revision;
    store().addElement(element("dup", 500, 500));
    expect(store().elements).toHaveLength(1);
    expect(store().revision).toBe(revision);
    expect(store().elements[0].x).toBe(0);
  });
});

describe("updateBorder", () => {
  beforeEach(() => {
    store().addElement(element("e1"));
  });

  it("treats width as the only authority on whether a border exists", () => {
    store().updateBorder("e1", { style: "dashed" });
    store().updateBorder("e1", { width: 0 });
    expect(store().elements[0].border.style).toBe("none");
  });

  it("repairs a style-only request that would otherwise be contradictory", () => {
    // Asking for "none" while keeping a positive width has no meaning; reading it as solid is what
    // backend/app/schemas/document.py does, and the two must not disagree about the same drawing.
    store().updateBorder("e1", { width: 3, style: "none" });
    expect(store().elements[0].border).toMatchObject({ width: 3, style: "solid" });
  });

  it("leaves a coherent request alone", () => {
    store().updateBorder("e1", { width: 2, style: "dotted" });
    expect(store().elements[0].border).toMatchObject({ width: 2, style: "dotted" });
  });

  it("keeps the untouched border fields", () => {
    store().updateBorder("e1", { color: "#EF4444" });
    expect(store().elements[0].border).toMatchObject({
      color: "#EF4444",
      width: 1,
      style: "solid",
      radius: 0,
    });
  });
});

describe("updateFill", () => {
  it("merges rather than replaces, so setting a colour keeps the opacity", () => {
    store().addElement(element("e1"));
    store().updateFill("e1", { opacity: 0.5 });
    store().updateFill("e1", { color: "#22C55E" });
    expect(store().elements[0].fill).toEqual({ color: "#22C55E", opacity: 0.5 });
  });

  it("ignores an id that is not in the document", () => {
    store().addElement(element("e1"));
    const before = store().elements[0];
    const revision = store().revision;
    store().updateFill("missing", { color: "#000000" });
    store().updateElement("missing", { width: 999 });
    store().updateBorder("missing", { width: 4 });
    store().setNote("missing", "orphan");
    expect(store().elements[0]).toBe(before);
    expect(store().revision).toBe(revision);
  });
});

describe("setNote", () => {
  it("keeps Chinese text exactly as typed", () => {
    // The note is the only free-form channel in the product, and it is written in Chinese. A note
    // that arrived corrupted would still save and still validate -- the damage would only surface
    // when the agent read the JSON and found a wall of question marks.
    const note = "导航栏需要吸顶，滚动时不要消失";
    store().addElement(element("e1"));
    store().setNote("e1", note);
    expect(store().elements[0].note).toBe(note);
  });

  it("accepts null as the spelling of no note", () => {
    store().addElement(element("e1"));
    store().setNote("e1", "draft");
    store().setNote("e1", null);
    expect(store().elements[0].note).toBeNull();
  });
});

describe("removeElement", () => {
  it("removes exactly one", () => {
    store().addElement(element("a"));
    store().addElement(element("b"));
    store().removeElement("a");
    expect(selectElements(store()).map((item) => item.id)).toEqual(["b"]);
  });

  it("is a no-op for an unknown id", () => {
    store().addElement(element("a"));
    const revision = store().revision;
    store().removeElement("nope");
    // Deleting nothing must not be an undoable step either, or Escape on an empty canvas would eat
    // a real entry from the history stack.
    expect(store().revision).toBe(revision);
    expect(store().elements).toHaveLength(1);
  });
});

describe("reorderElement", () => {
  beforeEach(() => {
    store().addElement(element("a"));
    store().addElement(element("b"));
    store().addElement(element("c"));
  });

  it("moves to front without changing the relative order of the rest", () => {
    store().reorderElement("a", "front");
    expect(selectElements(store()).map((item) => item.id)).toEqual(["b", "c", "a"]);
  });

  it("moves to back", () => {
    store().reorderElement("c", "back");
    expect(selectElements(store()).map((item) => item.id)).toEqual(["c", "a", "b"]);
  });

  it("does not duplicate the element", () => {
    store().reorderElement("b", "front");
    expect(store().elements).toHaveLength(3);
  });

  it("ignores an unknown id", () => {
    store().reorderElement("nope", "front");
    expect(selectElements(store()).map((item) => item.id)).toEqual(["a", "b", "c"]);
  });
});

describe("history snapshots", () => {
  it("captures a deep copy", () => {
    store().addElement(element("e1"));
    const snapshot = store().getSnapshot();
    store().setNote("e1", "added after the snapshot");
    expect(snapshot.elements[0].note).toBeNull();
  });

  it("restores content and bumps the revision once", () => {
    store().addElement(element("keep"));
    const snapshot = store().getSnapshot();
    store().addElement(element("extra"));
    const revision = store().revision;

    store().restoreSnapshot(snapshot);
    expect(selectElements(store()).map((item) => item.id)).toEqual(["keep"]);
    expect(store().revision).toBe(revision + 1);
  });

  it("does not let a restored element be mutated through the live store", () => {
    store().addElement(element("e1"));
    const snapshot = store().getSnapshot();
    store().restoreSnapshot(snapshot);
    store().updateElement("e1", { width: 999 });
    expect(snapshot.elements[0].width).toBe(100);
  });
});

describe("loadDocument", () => {
  it("replaces everything and resets the revision", () => {
    store().addElement(element("mine"));
    store().addElement(element("also-mine"));

    store().loadDocument(documentWith([element("from-disk")]));
    expect(store().revision).toBe(0);
    expect(selectElements(store()).map((item) => item.id)).toEqual(["from-disk"]);
    expect(store().meta.id).toBe("layout-test");
  });
});

describe("toDocument", () => {
  it("serialises the whole editable state, including the viewport it is handed", () => {
    store().addElement(element("e1"));
    const serialized = store().toDocument({ zoom: 2, panX: -10, panY: 20 });

    expect(serialized.format).toBe("mogong.document");
    expect(serialized.version).toBe("1.0");
    expect(serialized.viewport).toEqual({ zoom: 2, panX: -10, panY: 20 });
    expect(serialized.canvas).toEqual({ ...DEFAULT_CANVAS });
    expect(serialized.elements.map((item) => item.id)).toEqual(["e1"]);
    expect(serialized.meta.updatedAt).not.toBeNull();
  });

  it("carries the nesting in geometry only", () => {
    // There is deliberately no parentId to keep in sync after a drag, which is the reason moving a
    // rectangle cannot leave a stale parent behind.
    store().addElement(element("parent", 0, 0));
    store().addElement(element("child", 10, 10));
    const serialized = store().toDocument({ zoom: 1, panX: 0, panY: 0 });
    expect(Object.keys(serialized.elements[0]).sort()).toEqual([
      "border",
      "fill",
      "height",
      "id",
      "locked",
      "name",
      "note",
      "stamp",
      "visible",
      "width",
      "x",
      "y",
    ]);
  });
});

describe("selectors", () => {
  it("returns undefined rather than throwing for no selection", () => {
    store().addElement(element("e1"));
    expect(selectElementById(null)(store())).toBeUndefined();
    expect(selectElementById("e1")(store())?.id).toBe("e1");
    expect(selectElementById("nope")(store())).toBeUndefined();
  });
});
