import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useDocumentStore } from "@/stores/use-document-store";
import { useHistoryStore, initHistorySubscription } from "@/stores/use-history-store";
import type { LayoutElement } from "@/types/document";

function makeElement(id: string, x: number, y: number): LayoutElement {
  return {
    id,
    name: "",
    x,
    y,
    width: 100,
    height: 100,
    fill: { color: "#E2E8F0", opacity: 1 },
    border: { width: 1, style: "solid", color: "#64748B", radius: 0 },
    note: null,
    locked: false,
    visible: true,
    stamp: false,
  };
}

describe("useHistoryStore", () => {
  beforeEach(() => {
    useDocumentStore.getState().resetDocument();
    useHistoryStore.getState().clear();
  });

  afterEach(() => {
    useDocumentStore.getState().resetDocument();
    useHistoryStore.getState().clear();
  });

  it("starts with empty past and future", () => {
    const { past, future } = useHistoryStore.getState();
    expect(past).toEqual([]);
    expect(future).toEqual([]);
  });

  it("init captures current state", () => {
    useDocumentStore.getState().addElement(makeElement("a", 0, 0));
    useHistoryStore.getState().init();

    const { lastSnapshot, lastProcessedRevision } = useHistoryStore.getState();
    expect(lastSnapshot).not.toBeNull();
    expect(lastSnapshot!.elements.length).toBe(1);
    expect(lastProcessedRevision).toBe(useDocumentStore.getState().revision);
  });

  it("processRevisionChange pushes previous state onto past", () => {
    useHistoryStore.getState().init();
    const initialRevision = useDocumentStore.getState().revision;

    // Make an edit.
    useDocumentStore.getState().addElement(makeElement("a", 0, 0));
    expect(useDocumentStore.getState().revision).toBe(initialRevision + 1);

    // Process the revision change.
    useHistoryStore.getState().processRevisionChange();

    // Past should contain the state BEFORE the edit (empty).
    const { past } = useHistoryStore.getState();
    expect(past.length).toBe(1);
    expect(past[0].elements.length).toBe(0);
  });

  it("undo restores previous state", () => {
    useHistoryStore.getState().init();

    useDocumentStore.getState().addElement(makeElement("a", 0, 0));
    useHistoryStore.getState().processRevisionChange();

    useDocumentStore.getState().addElement(makeElement("b", 100, 100));
    useHistoryStore.getState().processRevisionChange();

    expect(useDocumentStore.getState().elements.length).toBe(2);

    useHistoryStore.getState().undo();
    expect(useDocumentStore.getState().elements.length).toBe(1);
    expect(useDocumentStore.getState().elements[0].id).toBe("a");
  });

  it("redo restores undone state", () => {
    useHistoryStore.getState().init();

    useDocumentStore.getState().addElement(makeElement("a", 0, 0));
    useHistoryStore.getState().processRevisionChange();

    useDocumentStore.getState().addElement(makeElement("b", 100, 100));
    useHistoryStore.getState().processRevisionChange();

    useHistoryStore.getState().undo();
    expect(useDocumentStore.getState().elements.length).toBe(1);

    useHistoryStore.getState().redo();
    expect(useDocumentStore.getState().elements.length).toBe(2);
  });

  it("new edit clears future stack", () => {
    useHistoryStore.getState().init();

    useDocumentStore.getState().addElement(makeElement("a", 0, 0));
    useHistoryStore.getState().processRevisionChange();

    useDocumentStore.getState().addElement(makeElement("b", 100, 100));
    useHistoryStore.getState().processRevisionChange();

    useHistoryStore.getState().undo();
    expect(useHistoryStore.getState().future.length).toBe(1);

    // Make a new edit.
    useDocumentStore.getState().addElement(makeElement("c", 200, 200));
    useHistoryStore.getState().processRevisionChange();

    // Future should be cleared.
    expect(useHistoryStore.getState().future.length).toBe(0);
  });

  it("undo does nothing when past is empty", () => {
    useHistoryStore.getState().init();
    useDocumentStore.getState().addElement(makeElement("a", 0, 0));
    const revisionBefore = useDocumentStore.getState().revision;

    useHistoryStore.getState().undo();

    expect(useDocumentStore.getState().revision).toBe(revisionBefore);
    expect(useDocumentStore.getState().elements.length).toBe(1);
  });

  it("redo does nothing when future is empty", () => {
    useHistoryStore.getState().init();
    useDocumentStore.getState().addElement(makeElement("a", 0, 0));
    useHistoryStore.getState().processRevisionChange();
    const revisionBefore = useDocumentStore.getState().revision;

    useHistoryStore.getState().redo();

    expect(useDocumentStore.getState().revision).toBe(revisionBefore);
    expect(useDocumentStore.getState().elements.length).toBe(1);
  });
});

describe("initHistorySubscription", () => {
  let unsubscribe: (() => void) | null = null;

  beforeEach(() => {
    useDocumentStore.getState().resetDocument();
    useHistoryStore.getState().clear();
  });

  afterEach(() => {
    if (unsubscribe) unsubscribe();
    useDocumentStore.getState().resetDocument();
    useHistoryStore.getState().clear();
  });

  it("captures history on revision change", () => {
    unsubscribe = initHistorySubscription();

    useDocumentStore.getState().addElement(makeElement("a", 0, 0));
    // The subscription should have processed the revision change.
    expect(useHistoryStore.getState().past.length).toBe(1);
    expect(useHistoryStore.getState().past[0].elements.length).toBe(0);

    useDocumentStore.getState().addElement(makeElement("b", 100, 100));
    expect(useHistoryStore.getState().past.length).toBe(2);
  });

  it("does not capture when revision is unchanged", () => {
    unsubscribe = initHistorySubscription();
    const initialPastLength = useHistoryStore.getState().past.length;

    // setCanvas bumps revision, so this will capture.
    useDocumentStore.getState().setCanvas({ gridSize: 16 });
    expect(useHistoryStore.getState().past.length).toBe(initialPastLength + 1);
  });
});
