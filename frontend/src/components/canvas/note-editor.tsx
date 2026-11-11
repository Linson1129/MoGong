/**
 * Note editor: an HTML input overlaid on the SVG for editing element notes.
 *
 * Positioned at the element's canvas coordinates, transformed to screen space. The input is
 * focused on mount and blurs on Enter or Escape. On blur, the note is saved; on Escape, it is
 * cancelled.
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
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(element.note ?? "");

  // Focus the input on mount.
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  // Save on Enter, cancel on Escape.
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        onSave(value.trim() || null);
      } else if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    },
    [value, onSave, onCancel],
  );

  // Save on blur (click outside).
  const handleBlur = useCallback(() => {
    onSave(value.trim() || null);
  }, [value, onSave]);

  // Position the input at the element's canvas coordinates, transformed to screen space.
  // The canvasRect is the bounding rect of the SVG element.
  const screenX = canvasRect ? canvasRect.left + panX + element.x * zoom : 0;
  const screenY = canvasRect ? canvasRect.top + panY + element.y * zoom : 0;
  const screenWidth = element.width * zoom;
  const screenHeight = element.height * zoom;

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      className="absolute z-50 border border-blue-400 bg-slate-800 px-2 text-xs text-slate-100 outline-none"
      style={{
        left: screenX,
        top: screenY,
        width: screenWidth,
        height: Math.min(screenHeight, 24),
        fontSize: Math.max(12, 12 * zoom),
      }}
      placeholder="Add a note..."
    />
  );
}
