/**
 * Context menu: right-click popup for element operations.
 *
 * The menu appears at the cursor position when the user right-clicks on an element. It offers
 * operations that apply to the inspected element, independent of whether it is selected. The
 * menu closes on any click outside it, on Escape, or after an action is performed.
 */

import { useCallback, useEffect, useRef } from "react";

import { useDocumentStore } from "@/stores/use-document-store";
import { useInteractionStore } from "@/stores/use-interaction-store";

interface ContextMenuProps {
  x: number;
  y: number;
  elementId: string;
  onClose: () => void;
}

export function ContextMenu({ x, y, elementId, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const removeElement = useDocumentStore((state) => state.removeElement);
  const reorderElement = useDocumentStore((state) => state.reorderElement);
  const select = useInteractionStore((state) => state.select);

  // Close on click outside. The mousedown listener is added on mount and removed on unmount.
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  // Close on Escape. This allows keyboard users to dismiss the menu without clicking.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleDelete = useCallback(() => {
    removeElement(elementId);
    // If the deleted element was selected, clear the selection.
    select(null);
    onClose();
  }, [elementId, removeElement, select, onClose]);

  const handleBringToFront = useCallback(() => {
    reorderElement(elementId, "front");
    onClose();
  }, [elementId, reorderElement, onClose]);

  const handleSendToBack = useCallback(() => {
    reorderElement(elementId, "back");
    onClose();
  }, [elementId, reorderElement, onClose]);

  return (
    <div
      ref={menuRef}
      data-testid="context-menu"
      className="absolute z-50 min-w-[140px] rounded-md border border-slate-200 bg-white py-1 shadow-lg"
      style={{ left: x, top: y }}
    >
      <button
        data-testid="context-menu-bring-to-front"
        className="flex w-full items-center px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100"
        onClick={handleBringToFront}
      >
        Bring to Front
      </button>
      <button
        data-testid="context-menu-send-to-back"
        className="flex w-full items-center px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100"
        onClick={handleSendToBack}
      >
        Send to Back
      </button>
      <div className="my-1 border-t border-slate-200" />
      <button
        data-testid="context-menu-delete"
        className="flex w-full items-center px-3 py-1.5 text-left text-sm text-red-600 hover:bg-slate-100"
        onClick={handleDelete}
      >
        Delete
      </button>
    </div>
  );
}
