/**
 * Delete/Backspace key hook for removing the selected element.
 *
 * Listens for Delete or Backspace key presses and removes the selected element from the document.
 * The hook is active only when no input or textarea is focused and no note is being edited.
 */

import { useCallback, useEffect } from "react";

import { useDocumentStore } from "@/stores/use-document-store";
import { useInteractionStore } from "@/stores/use-interaction-store";

export function useDeleteKey() {
  const removeElement = useDocumentStore((state) => state.removeElement);
  const select = useInteractionStore((state) => state.select);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Ignore when typing in an input.
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

      // Ignore when editing a note.
      const { noteEditingId } = useInteractionStore.getState();
      if (noteEditingId !== null) return;

      // Only handle Delete and Backspace.
      if (event.key !== "Delete" && event.key !== "Backspace") return;

      // Only act if an element is selected.
      const currentSelectedId = useInteractionStore.getState().selectedId;
      if (currentSelectedId === null) return;

      event.preventDefault();
      removeElement(currentSelectedId);
      select(null);
    },
    [removeElement, select],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
