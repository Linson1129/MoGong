/**
 * 备注编辑器：用于编辑元素备注的浮动便签面板。
 *
 * 与之前覆盖式输入框不同，这是一个独立面板，不会在失焦或回车时自动保存。
 * 用户必须显式点击保存或取消，或按 Escape 取消。这样可以避免 IME 问题——
 * 按回车确认输入法时会意外保存并关闭编辑器。
 *
 * 面板定位在元素旁边，不会遮挡元素，方便用户同时查看备注和元素。
 *
 * 定位用 fixed：屏幕坐标来自 getBoundingClientRect（视口空间），而画布所在的 main 是 relative
 * 且从工具栏下方开始，用 absolute 会整体偏移一个工具栏高度。
 *
 * 面板用浮层玻璃：备注是唯一会离开画布、单独书写的需求，它不需要保持区域颜色诚实。
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
      className="fixed z-50 w-64 rounded-overlay border border-accent/45 bg-glass-tint p-3 shadow-overlay backdrop-blur-glass backdrop-saturate-(--glass-saturate)"
      style={{ left: screenX, top: screenY }}
      onKeyDown={handleKeyDown}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-full resize-none rounded-field border border-hairline-strong bg-surface-raised/70 px-2 py-1 text-sm text-ink outline-none focus:border-accent"
        rows={3}
        placeholder="添加备注..."
      />
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          className="flex-1 rounded-control bg-accent px-2 py-1 text-xs font-medium text-accent-ink transition-opacity hover:opacity-90"
        >
          保存
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-control px-2 py-1 text-xs font-medium text-ink-secondary hover:bg-ink/10"
        >
          取消
        </button>
      </div>
      <p className="mt-1.5 text-[10px] text-ink-muted">Ctrl+Enter 保存，Esc 取消</p>
    </div>
  );
}
