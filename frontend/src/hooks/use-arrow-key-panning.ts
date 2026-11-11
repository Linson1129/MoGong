/**
 * Arrow key panning hook.
 *
 * Listens for arrow key presses and pans the canvas by a fixed step. Holding Shift accelerates
 * the pan by 3x. The hook is active only when no input or textarea is focused and no note is
 * being edited.
 */

import { useEffect } from "react";

import { useInteractionStore } from "@/stores/use-interaction-store";
import { useViewStore } from "@/stores/use-view-store";

export function useArrowKeyPanning() {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore when typing in an input.
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

      // Ignore when editing a note.
      const { noteEditingId } = useInteractionStore.getState();
      if (noteEditingId !== null) return;

      // Only handle arrow keys.
      if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;

      event.preventDefault();

      const coarse = event.shiftKey;
      const { panByStep } = useViewStore.getState();

      switch (event.key) {
        case "ArrowUp":
          panByStep(0, -1, coarse);
          break;
        case "ArrowDown":
          panByStep(0, 1, coarse);
          break;
        case "ArrowLeft":
          panByStep(-1, 0, coarse);
          break;
        case "ArrowRight":
          panByStep(1, 0, coarse);
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
