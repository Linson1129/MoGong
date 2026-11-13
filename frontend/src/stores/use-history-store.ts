/**
 * History store: undo/redo stack for document mutations.
 *
 * The store watches the document store's revision counter. Each time the revision changes, the
 * PREVIOUS state (before the edit) is pushed onto the past stack. This way, undo can restore
 * the state before the last edit.
 *
 * Live drag geometry does NOT create history entries. The interaction store holds the working
 * position during a move or resize, and the document store is written once on pointer up. That
 * single write bumps the revision exactly once, so one drag is one undo step.
 *
 * Replacing the document is not an edit either. Importing a file or clearing the canvas goes
 * through the same revision counter, so the guard in processRevisionChange uses the document store's
 * `generation` to tell the two apart: no undo step may reach across a document boundary, in either
 * direction.
 */

import { create } from "zustand";

import { HISTORY_LIMIT } from "@/lib/constants";
import type { HistorySnapshot } from "@/stores/use-document-store";
import { useDocumentStore } from "@/stores/use-document-store";

interface HistoryState {
  /** Stack of past states we can undo TO. The most recent is at the end. */
  past: HistorySnapshot[];
  /** Stack of future states we can redo TO. The most recent is at the end. */
  future: HistorySnapshot[];
  /** The revision number we last processed. Used to detect new edits. */
  lastProcessedRevision: number;
  /** The document generation we last processed. A different one means the document was replaced. */
  lastProcessedGeneration: number;
  /** The snapshot at the last processed revision. Used to push to past when revision changes. */
  lastSnapshot: HistorySnapshot | null;
}

interface HistoryActions {
  /** Process a revision change. Pushes the previous state onto past. */
  processRevisionChange: () => void;
  /** Undo the last edit by restoring the previous snapshot. */
  undo: () => void;
  /** Redo the last undone edit by restoring the next snapshot. */
  redo: () => void;
  /** Clear the stacks and re-baseline. Used by tests; a document swap is handled by the guard. */
  clear: () => void;
  /** Initialize with the current state. Called once at startup. */
  init: () => void;
}

export type HistoryStore = HistoryState & HistoryActions;

export const useHistoryStore = create<HistoryStore>((set, get) => ({
  past: [],
  future: [],
  lastProcessedRevision: 0,
  lastProcessedGeneration: 0,
  lastSnapshot: null,

  init: () => {
    const { revision, generation, getSnapshot } = useDocumentStore.getState();
    set({
      lastProcessedRevision: revision,
      lastProcessedGeneration: generation,
      lastSnapshot: getSnapshot(),
    });
  },

  processRevisionChange: () => {
    const { past, lastProcessedRevision, lastProcessedGeneration, lastSnapshot } = get();
    const { revision, generation, getSnapshot } = useDocumentStore.getState();

    // A replaced document is not an edit, and the difference is not cosmetic. Importing resets the
    // revision to 0, which otherwise looks exactly like a new edit, so the outgoing drawing would be
    // pushed onto `past` and one Cmd+Z would pull last week's layout into the canvas the user has
    // already switched to. Re-baseline instead: an empty stack whose snapshot is the new document.
    if (generation !== lastProcessedGeneration) {
      set({
        past: [],
        future: [],
        lastProcessedRevision: revision,
        lastProcessedGeneration: generation,
        lastSnapshot: getSnapshot(),
      });
      return;
    }

    // Only process if the revision has changed since the last processing.
    if (revision === lastProcessedRevision) return;
    if (lastSnapshot === null) return;

    // Push the PREVIOUS state (before the edit) onto past.
    // This is the state we can undo TO.
    const trimmedPast = past.length >= HISTORY_LIMIT ? past.slice(1) : past;
    const newPast = [...trimmedPast, lastSnapshot];

    // Any new edit clears the redo stack. The user has taken a different branch.
    set({
      past: newPast,
      future: [],
      lastProcessedRevision: revision,
      lastSnapshot: getSnapshot(),
    });
  },

  undo: () => {
    const { past, future, lastSnapshot } = get();
    if (past.length === 0 || lastSnapshot === null) return;

    // Pop the last past state and restore it.
    const previousSnapshot = past[past.length - 1];
    const newPast = past.slice(0, -1);

    // Push the CURRENT state (before undo) onto future so redo can restore it.
    const newFuture = [...future, lastSnapshot];

    // Restore the previous state.
    useDocumentStore.getState().restoreSnapshot(previousSnapshot);

    set({
      past: newPast,
      future: newFuture,
      lastProcessedRevision: useDocumentStore.getState().revision,
      lastSnapshot: previousSnapshot,
    });
  },

  redo: () => {
    const { past, future, lastSnapshot } = get();
    if (future.length === 0 || lastSnapshot === null) return;

    // Pop the last future state and restore it.
    const nextSnapshot = future[future.length - 1];
    const newFuture = future.slice(0, -1);

    // Push the CURRENT state (before redo) onto past so undo can restore it.
    const newPast = [...past, lastSnapshot];

    // Restore the next state.
    useDocumentStore.getState().restoreSnapshot(nextSnapshot);

    set({
      past: newPast,
      future: newFuture,
      lastProcessedRevision: useDocumentStore.getState().revision,
      lastSnapshot: nextSnapshot,
    });
  },

  clear: () => {
    const { revision, generation, getSnapshot } = useDocumentStore.getState();
    set({
      past: [],
      future: [],
      lastProcessedRevision: revision,
      lastProcessedGeneration: generation,
      lastSnapshot: getSnapshot(),
    });
  },
}));

/**
 * Subscribe to document store changes and process history.
 *
 * Called once at app startup. The subscription watches the revision counter and calls
 * processRevisionChange() whenever it changes, which pushes the previous state onto the past stack.
 */
export function initHistorySubscription(): () => void {
  // Initialize with the current state.
  useHistoryStore.getState().init();

  // Subscribe to the document store. The selector returns the revision, which changes on every
  // committed edit. The equality function is the default (Object.is), so this fires on every
  // revision change.
  return useDocumentStore.subscribe((state, prevState) => {
    if (state.revision !== prevState.revision) {
      useHistoryStore.getState().processRevisionChange();
    }
  });
}
