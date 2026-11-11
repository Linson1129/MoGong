/**
 * 顶部工具栏：标识、画布尺寸、缩放、连接状态。
 *
 * 缩放控制以按钮形式提供，而非仅依赖滚轮手势，便于无鼠标操作。
 *
 * 缩放百分比按钮支持：
 * - 单击：重置为 100% 缩放
 * - 双击：打开自定义缩放输入框（50-150%）
 */

import { useCallback, useState } from "react";

import { ZOOM } from "@/lib/constants";
import { useDocumentStore } from "@/stores/use-document-store";
import { useViewStore } from "@/stores/use-view-store";

function clamp(zoom: number): number {
  return Math.min(ZOOM.max, Math.max(ZOOM.min, zoom));
}

export function Toolbar() {
  const canvas = useDocumentStore((state) => state.canvas);
  const elementCount = useDocumentStore((state) => state.elements.length);

  const zoom = useViewStore((state) => state.zoom);
  const setZoom = useViewStore((state) => state.setZoom);
  const resetView = useViewStore((state) => state.resetView);

  // 自定义缩放输入框状态
  const [showZoomInput, setShowZoomInput] = useState(false);
  const [zoomInputValue, setZoomInputValue] = useState("");

  const step = (direction: 1 | -1) =>
    setZoom(clamp(direction > 0 ? zoom * ZOOM.stepFactor : zoom / ZOOM.stepFactor));

  // 单击重置为 100%
  const handleZoomClick = useCallback(() => {
    resetView();
  }, [resetView]);

  // 双击打开自定义缩放输入框
  const handleZoomDoubleClick = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    setShowZoomInput(true);
    setZoomInputValue(Math.round(zoom * 100).toString());
  }, [zoom]);

  // 提交自定义缩放值
  const handleZoomSubmit = useCallback(() => {
    const value = parseInt(zoomInputValue, 10);
    if (!isNaN(value) && value >= 50 && value <= 150) {
      setZoom(clamp(value / 100));
    }
    setShowZoomInput(false);
  }, [zoomInputValue, setZoom]);

  // 取消自定义缩放输入
  const handleZoomCancel = useCallback(() => {
    setShowZoomInput(false);
  }, []);

  return (
    <header className="flex h-12 shrink-0 items-center gap-4 border-b border-slate-800 bg-slate-900 px-4">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-semibold tracking-tight">墨工</span>
        {/* 教程占位符：未来将打开帮助面板 */}
        <button
          type="button"
          className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-600 text-[10px] text-slate-400 hover:border-slate-400 hover:text-slate-200"
          title="墨工使用教程（即将推出）"
          aria-label="帮助"
        >
          ?
        </button>
      </div>

      <div className="h-5 w-px bg-slate-800" />

      <span className="font-mono text-xs text-slate-400">
        {Math.round(canvas.width)} × {Math.round(canvas.height)}
      </span>
      <span className="text-xs text-slate-500">
        {elementCount} 个区域
      </span>

      <div className="ml-auto flex items-center gap-1">
        <ToolbarButton label="缩小" onClick={() => step(-1)}>
          -
        </ToolbarButton>

        {/* 缩放百分比：单击重置，双击打开自定义输入 */}
        {showZoomInput ? (
          <input
            type="number"
            min={50}
            max={150}
            value={zoomInputValue}
            onChange={(e) => setZoomInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleZoomSubmit();
              if (e.key === "Escape") handleZoomCancel();
            }}
            onBlur={handleZoomSubmit}
            className="w-14 rounded border border-blue-500 bg-slate-800 px-1 py-0.5 text-center font-mono text-xs text-slate-200 outline-none"
            autoFocus
          />
        ) : (
          <button
            type="button"
            onClick={handleZoomClick}
            onDoubleClick={handleZoomDoubleClick}
            className="min-w-14 rounded px-2 py-1 font-mono text-xs text-slate-300 hover:bg-slate-800"
            title="单击重置为 100%，双击输入自定义缩放"
          >
            {Math.round(zoom * 100)}%
          </button>
        )}

        <ToolbarButton label="放大" onClick={() => step(1)}>
          +
        </ToolbarButton>
      </div>
    </header>
  );
}

function ToolbarButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="h-7 w-7 rounded text-sm text-slate-300 hover:bg-slate-800"
    >
      {children}
    </button>
  );
}
