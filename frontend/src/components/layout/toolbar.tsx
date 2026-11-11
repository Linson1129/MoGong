/**
 * 顶部工具栏：标识、画布尺寸、缩放、导出、连接状态。
 *
 * 缩放控制以按钮形式提供，而非仅依赖滚轮手势，便于无鼠标操作。
 *
 * 缩放百分比按钮支持：
 * - 单击：重置为 100% 缩放
 * - 双击：打开自定义缩放输入框（50-150%）
 *
 * 导出按钮：编译当前画布为 layout JSON 并下载。
 */

import { useCallback, useRef, useState } from "react";

import { exportLayout, copyLayoutToClipboard, clearAll, importFromJson, type ExportResult } from "@/lib/export";
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

  // 导入/清除状态
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  // 导出状态
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [showCopyButton, setShowCopyButton] = useState(false);

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

  // 导出处理
  const handleExport = useCallback(async () => {
    if (elementCount === 0) {
      setExportResult({ success: false, error: "画布为空，无法导出" });
      return;
    }
    setExporting(true);
    setExportResult(null);
    setShowCopyButton(false);

    const result = await exportLayout();
    setExportResult(result);
    setExporting(false);

    if (result.success) {
      setShowCopyButton(true);
      // 3 秒后隐藏复制按钮
      setTimeout(() => setShowCopyButton(false), 5000);
    }
  }, [elementCount]);

  // 复制到剪贴板
  const handleCopy = useCallback(async () => {
    if (exportResult?.layout) {
      const ok = await copyLayoutToClipboard(exportResult.layout);
      if (ok) {
        setExportResult({ ...exportResult, writtenTo: "已复制到剪贴板" });
      }
    }
  }, [exportResult]);

  // 清除全部
  const handleClear = useCallback(() => {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
      return;
    }
    clearAll();
    setConfirmClear(false);
    setExportResult(null);
    setShowCopyButton(false);
  }, [confirmClear]);

  // 导入 JSON
  const handleImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const result = importFromJson(text);
      if (result.success) {
        setExportResult({ success: true, writtenTo: `已导入 ${result.elementCount} 个区域` });
        setTimeout(() => setExportResult(null), 4000);
      } else {
        setExportResult({ success: false, error: result.error });
        setTimeout(() => setExportResult(null), 4000);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }, []);

  return (
    <header className="flex h-12 shrink-0 items-center gap-4 border-b border-slate-200 bg-white px-4">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-semibold tracking-tight">墨工</span>
        {/* 教程占位符：未来将打开帮助面板 */}
        <button
          type="button"
          className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-[10px] text-slate-500 hover:border-slate-400 hover:text-slate-700"
          title="墨工使用教程（即将推出）"
          aria-label="帮助"
        >
          ?
        </button>
      </div>

      <div className="h-5 w-px bg-slate-200" />

      <span className="font-mono text-xs text-slate-600">
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
            className="w-14 rounded border border-blue-400 bg-white px-1 py-0.5 text-center font-mono text-xs text-slate-800 outline-none"
            autoFocus
          />
        ) : (
          <button
            type="button"
            onClick={handleZoomClick}
            onDoubleClick={handleZoomDoubleClick}
            className="min-w-14 rounded px-2 py-1 font-mono text-xs text-slate-600 hover:bg-slate-100"
            title="单击重置为 100%，双击输入自定义缩放"
          >
            {Math.round(zoom * 100)}%
          </button>
        )}

        <ToolbarButton label="放大" onClick={() => step(1)}>
          +
        </ToolbarButton>

        {/* 导出按钮 */}
        <div className="mx-2 h-5 w-px bg-slate-200" />

        <button
          type="button"
          onClick={handleExport}
          disabled={exporting || elementCount === 0}
          className={`rounded px-3 py-1 text-xs transition-colors ${
            exporting || elementCount === 0
              ? "cursor-not-allowed text-slate-400"
              : "text-emerald-600 hover:bg-emerald-50"
          }`}
          title={elementCount === 0 ? "请先绘制区域" : "编译并导出 layout.json"}
        >
          {exporting ? "编译中..." : "导出"}
        </button>

        {/* 导入按钮 */}
        <button
          type="button"
          onClick={handleImport}
          className="rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"
          title="从 JSON 文件加载布局"
        >
          导入
        </button>

        {/* 清除按钮 */}
        <button
          type="button"
          onClick={handleClear}
          className={`rounded px-2 py-1 text-xs transition-colors ${
            confirmClear
              ? "bg-red-50 text-red-600 font-medium"
              : "text-slate-500 hover:bg-red-50 hover:text-red-500"
          }`}
          title={confirmClear ? "再次点击确认清除" : "清除所有内容"}
        >
          {confirmClear ? "确认清除?" : "清除"}
        </button>

        {/* 导出成功后显示复制按钮 */}
        {showCopyButton && (
          <button
            type="button"
            onClick={handleCopy}
            className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
            title="复制 JSON 到剪贴板"
          >
            复制
          </button>
        )}
      </div>

      {/* 导出状态提示 */}
      {exportResult && (
        <span
          className={`text-xs ${
            exportResult.success ? "text-emerald-600" : "text-red-500"
          }`}
        >
          {exportResult.success
            ? `✓ ${exportResult.writtenTo || "已导出"}`
            : exportResult.error}
        </span>
      )}
      {/* 隐藏的 file input，供导入使用 */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileChange}
        className="hidden"
        aria-hidden
      />
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
      className="h-7 w-7 rounded text-sm text-slate-600 hover:bg-slate-100"
    >
      {children}
    </button>
  );
}
