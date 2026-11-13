/**
 * Hook to initialize the history subscription and keyboard shortcuts.
 *
 * Called once at the top of the app. The subscription watches the document store's revision
 * and pushes snapshots onto the history stack. The keyboard shortcuts handle Ctrl+Z (undo) and
 * Ctrl+Shift+Z / Ctrl+Y (redo).
 */

import { useEffect } from "react";

import { useHistoryStore, initHistorySubscription } from "@/stores/use-history-store";
import { useInteractionStore } from "@/stores/use-interaction-store";

export function useHistory() {
  useEffect(() => {
    const unsubscribe = initHistorySubscription();
    return unsubscribe;
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore when typing in an input or textarea.
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      // Ignore when editing a note.
      const { noteEditingId } = useInteractionStore.getState();
      if (noteEditingId !== null) return;

      const isCtrl = event.ctrlKey || event.metaKey;
      if (!isCtrl) return;

      if (event.key === "z" && !event.shiftKey) {
        // Ctrl+Z: undo.
        event.preventDefault();
        useHistoryStore.getState().undo();
      } else if (event.key === "z" && event.shiftKey) {
        // Ctrl+Shift+Z: redo.
        event.preventDefault();
        useHistoryStore.getState().redo();
      } else if (event.key === "y") {
        // Ctrl+Y: redo (alternative).
        event.preventDefault();
        useHistoryStore.getState().redo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
