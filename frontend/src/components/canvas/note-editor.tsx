/**
 * Note editor: a floating sticky-note panel for editing element notes.
 *
 * Unlike the previous overlaid input, this is a standalone panel that does not auto-save on blur
 * or Enter. The user must explicitly click Save or Cancel, or press Escape to cancel. This avoids
 * the IME issue where pressing Enter to confirm input would accidentally save and close the editor.
 *
 * The panel is positioned near the element but does not overlap it, so the user can see both the
 * note and the element.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import type { LayoutElement } from "@/types/document";

interface NoteEditorProps {
  element: LayoutElement;
  zoom: number;
  panX: number;
  panY: number;
  canvasRect: DOMRect | null;
  onSave: (note: string | null) => void;
  onCancel: () => void;
}

export function NoteEditor({ element, zoom, panX, panY, canvasRect, onSave, onCancel }: NoteEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState(element.note ?? "");

  // Focus the textarea on mount.
  useEffect(() => {
    textareaRef.current?.focus();
    textareaRef.current?.select();
  }, []);

  // Cancel on Escape. Enter is deliberately ignored to allow multi-line input and IME confirmation.
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
      // Ctrl+Enter or Cmd+Enter saves explicitly.
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        onSave(value.trim() || null);
      }
    },
    [value, onSave, onCancel],
  );

  // Close on click outside the panel.
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        // Do not auto-save; treat as cancel.
        onCancel();
      }
    };
    // Delay adding the listener to avoid catching the double-click that opened the editor.
    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 100);
    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onCancel]);

  const handleSave = useCallback(() => {
    onSave(value.trim() || null);
  }, [value, onSave]);

  // Position the panel to the right of the element, or below if not enough space.
  const screenX = canvasRect ? canvasRect.left + panX + element.x * zoom + element.width * zoom + 8 : 0;
  const screenY = canvasRect ? canvasRect.top + panY + element.y * zoom : 0;

  return (
    <div
      ref={panelRef}
      className="absolute z-50 w-64 rounded-lg border border-blue-400 bg-slate-800 p-3 shadow-lg"
      style={{ left: screenX, top: screenY }}
      onKeyDown={handleKeyDown}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-full resize-none rounded border border-slate-600 bg-slate-700 px-2 py-1 text-sm text-slate-100 outline-none focus:border-blue-400"
        rows={3}
        placeholder="Add a note..."
      />
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          className="flex-1 rounded bg-blue-500 px-2 py-1 text-xs font-medium text-white hover:bg-blue-600"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded bg-slate-600 px-2 py-1 text-xs font-medium text-slate-200 hover:bg-slate-500"
        >
          Cancel
        </button>
      </div>
      <p className="mt-1 text-[10px] text-slate-500">Ctrl+Enter to save, Esc to cancel</p>
    </div>
  );
}
