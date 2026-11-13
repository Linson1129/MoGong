/**
 * Top toolbar: identity, canvas readout, status, and the file/zoom/theme controls.
 *
 * The bar is furniture, not content. It is flat (a hairline and nothing else), its two readouts are
 * monospaced and tabular so they never twitch while the drawing changes, and it holds exactly one
 * filled surface: the compile action. Everything else that asks to be clicked — here, the skill
 * package download — wears the accent as an outline and a word label, never as a fill.
 *
 * Zoom is offered as buttons rather than only as a wheel gesture, so the tool stays operable without
 * a mouse. The percentage button does double duty:
 * - click: reset to 100%
 * - double click: open a custom zoom field (50-150%)
 *
 * Icons are drawn as hairline paths, never as emoji. A pictograph stuck onto a measuring instrument
 * reads as decoration, and the point of this product is that it measures.
 */

import { useCallback, useRef, useState } from "react";

import { HelpDialog } from "./help-dialog";
import { exportLayout, copyLayoutToClipboard, clearAll, importFromJson, type ExportResult } from "@/lib/export";
import { SKILL_PACKAGE_URL, ZOOM } from "@/lib/constants";
import { useDocumentStore } from "@/stores/use-document-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { useViewStore } from "@/stores/use-view-store";

/**
 * A mark on the same 20-unit grid, stroked at the weight the rest of the chrome uses.
 * `aria-hidden` because every icon sits inside a button that already carries a label.
 */
function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

const IconMinus = () => (
  <Icon>
    <path d="M4.5 10h11" />
  </Icon>
);

const IconPlus = () => (
  <Icon>
    <path d="M10 4.5v11M4.5 10h11" />
  </Icon>
);

const IconSun = () => (
  <Icon>
    <circle cx="10" cy="10" r="3.2" />
    <path d="M10 2.6v1.8M10 15.6v1.8M2.6 10h1.8M15.6 10h1.8M4.8 4.8l1.3 1.3M13.9 13.9l1.3 1.3M15.2 4.8l-1.3 1.3M6.1 13.9l-1.3 1.3" />
  </Icon>
);

const IconMoon = () => (
  <Icon>
    <path d="M15.2 12.2A5.8 5.8 0 0 1 7.8 4.8 5.8 5.8 0 1 0 15.2 12.2Z" />
  </Icon>
);

const IconExport = () => (
  <Icon>
    <path d="M10 3.5v8M6.8 8.7 10 11.9l3.2-3.2M4 14v2h12v-2" />
  </Icon>
);

const IconPackage = () => (
  <Icon>
    <path d="M3.5 6.4 10 3.2l6.5 3.2v7.2L10 16.8l-6.5-3.2z" />
    <path d="M3.5 6.4 10 9.6l6.5-3.2M10 9.6v7.2" />
  </Icon>
);

const IconImport = () => (
  <Icon>
    <path d="M10 12.5v-8M6.8 7.3 10 4.1l3.2 3.2M4 14v2h12v-2" />
  </Icon>
);

const IconClear = () => (
  <Icon>
    <path d="M4.5 6.5h11M8 6.5V4.8h4v1.7M6.3 6.5l.7 9h6l.7-9" />
  </Icon>
);

const IconCopy = () => (
  <Icon>
    <rect x="7.5" y="7.5" width="8" height="8" rx="1.2" />
    <path d="M4.5 12.5V5a.5.5 0 0 1 .5-.5h7.5" />
  </Icon>
);

const IconCheck = () => (
  <Icon>
    <path d="M4.5 10.5 8 14l7.5-8" />
  </Icon>
);

export function Toolbar() {
  const canvas = useDocumentStore((state) => state.canvas);
  const elementCount = useDocumentStore((state) => state.elements.length);
  const theme = useThemeStore((state) => state.theme);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);

  const zoom = useViewStore((state) => state.zoom);
  const setZoom = useViewStore((state) => state.setZoom);
  const resetView = useViewStore((state) => state.resetView);

  // Help dialog visibility.
  const [showHelp, setShowHelp] = useState(false);

  // Custom zoom field.
  const [showZoomInput, setShowZoomInput] = useState(false);
  const [zoomInputValue, setZoomInputValue] = useState("");

  // Import/clear.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  // Export.
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [showCopyButton, setShowCopyButton] = useState(false);

  // setZoom clamps to ZOOM.min/max itself, so the callers pass the raw factor.
  const step = (direction: 1 | -1) =>
    setZoom(direction > 0 ? zoom * ZOOM.stepFactor : zoom / ZOOM.stepFactor);

  // Single click resets to 100%.
  const handleZoomClick = useCallback(() => {
    resetView();
  }, [resetView]);

  // Double click opens the custom zoom field.
  const handleZoomDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      setShowZoomInput(true);
      setZoomInputValue(Math.round(zoom * 100).toString());
    },
    [zoom],
  );

  const handleZoomSubmit = useCallback(() => {
    const value = parseInt(zoomInputValue, 10);
    if (!isNaN(value) && value >= 50 && value <= 150) {
      setZoom(value / 100);
    }
    setShowZoomInput(false);
  }, [zoomInputValue, setZoom]);

  const handleZoomCancel = useCallback(() => {
    setShowZoomInput(false);
  }, []);

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
      setTimeout(() => setShowCopyButton(false), 5000);
    }
  }, [elementCount]);

  const handleCopy = useCallback(async () => {
    if (exportResult?.layout) {
      const ok = await copyLayoutToClipboard(exportResult.layout);
      if (ok) {
        setExportResult({ ...exportResult, writtenTo: "已复制到剪贴板" });
      }
    }
  }, [exportResult]);

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
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-hairline bg-surface px-4">
      <div className="flex items-center gap-1.5">
        {/* The one serif on screen, in the one place a serif belongs: the maker's mark. */}
        <span
          className="text-sm font-semibold tracking-[0.12em] text-seal"
          style={{ fontFamily: "var(--font-mark)" }}
        >
          墨工
        </span>
        <ToolbarButton label="墨工使用教程" onClick={() => setShowHelp(true)}>
          <span className="font-mono text-[11px] leading-none">?</span>
        </ToolbarButton>
      </div>

      <Separator />

      {/* Readouts. Tabular so the digits do not shift width as they change. */}
      <span className="tabular font-mono text-xs text-ink-secondary">
        {Math.round(canvas.width)} × {Math.round(canvas.height)}
      </span>
      <span className="tabular text-xs text-ink-muted">
        {elementCount} 个区域
      </span>

      {/*
        Status slot: always rendered, so a result message never nudges the controls sideways. The
        controls moving under the cursor mid-click is the classic way a toolbar becomes annoying.
      */}
      <span aria-live="polite" className="flex min-w-0 flex-1 items-center justify-center gap-1">
        {exportResult && (
          <span
            className={`tabular flex min-w-0 items-center gap-1 truncate text-xs ${
              exportResult.success
                ? "text-accent"
                : "text-danger"
            }`}
          >
            {exportResult.success && <IconCheck />}
            {exportResult.success
              ? exportResult.writtenTo || "已导出"
              : exportResult.error}
          </span>
        )}
      </span>

      <div className="flex items-center gap-1">
        <ToolbarButton label="缩小" onClick={() => step(-1)} disabled={zoom <= ZOOM.min}>
          <IconMinus />
        </ToolbarButton>

        {/* Zoom percentage: single click resets, double click opens the custom field. */}
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
            className="tabular w-14 rounded-control border border-accent bg-surface-raised px-1 py-0.5 text-center font-mono text-xs text-ink outline-none"
            autoFocus
          />
        ) : (
          <button
            type="button"
            onClick={handleZoomClick}
            onDoubleClick={handleZoomDoubleClick}
            className="tabular min-w-14 rounded-control px-2 py-1 text-center font-mono text-xs text-ink-secondary hover:bg-surface-sunken"
            title="单击重置为 100%，双击输入自定义缩放"
          >
            {Math.round(zoom * 100)}%
          </button>
        )}

        <ToolbarButton label="放大" onClick={() => step(1)} disabled={zoom >= ZOOM.max}>
          <IconPlus />
        </ToolbarButton>

        <Separator className="mx-1.5" />

        {/* The single primary action: compile and download. */}
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting || elementCount === 0}
          className={`flex items-center gap-1.5 rounded-control px-2.5 py-1 text-xs transition-opacity ${
            exporting || elementCount === 0
              ? "cursor-not-allowed bg-surface-sunken text-ink-faint"
              : "bg-accent text-accent-ink hover:opacity-90"
          }`}
          title={elementCount === 0 ? "请先绘制区域" : "编译并导出 layout.json"}
        >
          <IconExport />
          {exporting ? "编译中…" : "导出"}
        </button>

        {/* The one secondary action worth pointing at: the full skill package, as a plain download
            link. Accent outline and a word label keep it obvious without a second filled surface. */}
        <a
          href={SKILL_PACKAGE_URL}
          download
          className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-control border border-accent bg-accent-wash px-2.5 py-1 text-xs text-accent transition-opacity hover:opacity-80"
          title="下载墨工排版 Skill 完整包（zip）"
        >
          <IconPackage />
          下载 Skill 包
        </a>

        {showCopyButton && (
          <ToolbarButton label="复制 JSON 到剪贴板" onClick={handleCopy}>
            <IconCopy />
          </ToolbarButton>
        )}

        <ToolbarButton label="从 JSON 文件加载布局" onClick={handleImport}>
          <IconImport />
        </ToolbarButton>

        <ToolbarButton
          label={confirmClear ? "再次点击确认清除" : "清除所有内容"}
          onClick={handleClear}
          danger={confirmClear}
          wide={confirmClear}
        >
          <IconClear />
          {/* The armed state still needs words: a red icon is a hint, "确认" is a question the user
              has to answer. */}
          {confirmClear && <span>确认</span>}
        </ToolbarButton>

        <Separator className="mx-1.5" />

        <ToolbarButton
          label={theme === "dark" ? "切换为浅色模式" : "切换为深色模式"}
          onClick={toggleTheme}
        >
          {theme === "dark" ? <IconSun /> : <IconMoon />}
        </ToolbarButton>
      </div>

      {/* Hidden file input backing the import button. */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileChange}
        className="hidden"
        aria-hidden
      />

      {showHelp && <HelpDialog onClose={() => setShowHelp(false)} />}
    </header>
  );
}

function Separator({ className = "" }: { className?: string }) {
  return <span className={`h-5 w-px shrink-0 bg-hairline ${className}`} />;
}

function ToolbarButton({
  label,
  onClick,
  disabled,
  danger,
  wide,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** The armed state of a destructive action, marked in the one red the interface is allowed. */
  danger?: boolean;
  /** Opens the button out to fit a label beside the mark. */
  wide?: boolean;
  children: React.ReactNode;
}) {
  const state = disabled
    ? "cursor-not-allowed text-ink-faint"
    : danger
      ? "bg-danger-wash text-danger"
      : "text-ink-secondary hover:bg-surface-sunken";

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`flex h-7 items-center justify-center gap-1.5 rounded-control px-1.5 text-xs transition-colors ${
        wide ? "min-w-14" : "w-7"
      } ${state}`}
    >
      {children}
    </button>
  );
}
