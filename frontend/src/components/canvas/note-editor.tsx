/**
 * 备注编辑器：用于编辑元素备注的浮动便签面板。
 *
 * 与之前覆盖式输入框不同，这是一个独立面板，不会在失焦或回车时自动保存。
 * 用户必须显式点击保存或取消，或按 Escape 取消。这样可以避免 IME 问题——
 * 按回车确认输入法时会意外保存并关闭编辑器。
 *
 * 面板定位在元素旁边，不会遮挡元素，方便用户同时查看备注和元素。
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

  // 挂载时聚焦到文本框
  useEffect(() => {
    textareaRef.current?.focus();
    textareaRef.current?.select();
  }, []);

  // 按 Escape 取消。故意忽略回车键以支持多行输入和 IME 确认。
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
      // Ctrl+Enter 或 Cmd+Enter 显式保存
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        onSave(value.trim() || null);
      }
    },
    [value, onSave, onCancel],
  );

  // 点击面板外部关闭
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        // 不自动保存，视为取消
        onCancel();
      }
    };
    // 延迟添加监听器，避免捕获打开编辑器的双击事件
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

  // 面板定位在元素右侧，空间不足时显示在下方
  const screenX = canvasRect ? canvasRect.left + panX + element.x * zoom + element.width * zoom + 8 : 0;
  const screenY = canvasRect ? canvasRect.top + panY + element.y * zoom : 0;

  return (
    <div
      ref={panelRef}
      className="absolute z-50 w-64 rounded-lg border border-blue-300 bg-white p-3 shadow-lg"
      style={{ left: screenX, top: screenY }}
      onKeyDown={handleKeyDown}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-full resize-none rounded border border-slate-300 bg-slate-50 px-2 py-1 text-sm text-slate-800 outline-none focus:border-blue-400"
        rows={3}
        placeholder="添加备注..."
      />
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          className="flex-1 rounded bg-blue-500 px-2 py-1 text-xs font-medium text-white hover:bg-blue-600"
        >
          保存
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded bg-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-300"
        >
          取消
        </button>
      </div>
      <p className="mt-1 text-[10px] text-slate-400">Ctrl+Enter 保存，Esc 取消</p>
    </div>
  );
}
