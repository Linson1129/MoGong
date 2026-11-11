/**
 * Top bar: identity, canvas size, zoom, connection state.
 *
 * Zoom controls are buttons here rather than only the wheel gesture, so the viewport can be driven
 * without a mouse and so view state is exercisable from M1 onward. The wheel handler arrives with
 * the gesture layer in M2.
 *
 * The zoom percentage button supports:
 * - Single click: reset to 100% zoom
 * - Double click: open input for custom zoom (50-150%)
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

  // Custom zoom input state.
  const [showZoomInput, setShowZoomInput] = useState(false);
  const [zoomInputValue, setZoomInputValue] = useState("");

  const step = (direction: 1 | -1) =>
    setZoom(clamp(direction > 0 ? zoom * ZOOM.stepFactor : zoom / ZOOM.stepFactor));

  // Single click resets to 100%.
  const handleZoomClick = useCallback(() => {
    resetView();
  }, [resetView]);

  // Double click opens custom zoom input.
  const handleZoomDoubleClick = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    setShowZoomInput(true);
    setZoomInputValue(Math.round(zoom * 100).toString());
  }, [zoom]);

  // Submit custom zoom value.
  const handleZoomSubmit = useCallback(() => {
    const value = parseInt(zoomInputValue, 10);
    if (!isNaN(value) && value >= 50 && value <= 150) {
      setZoom(clamp(value / 100));
    }
    setShowZoomInput(false);
  }, [zoomInputValue, setZoom]);

  // Cancel custom zoom input.
  const handleZoomCancel = useCallback(() => {
    setShowZoomInput(false);
  }, []);

  return (
    <header className="flex h-12 shrink-0 items-center gap-4 border-b border-slate-800 bg-slate-900 px-4">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-semibold tracking-tight">MoGong</span>
        {/* Tutorial placeholder: will open a help panel in the future. */}
        <button
          type="button"
          className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-600 text-[10px] text-slate-400 hover:border-slate-400 hover:text-slate-200"
          title="How to use MoGong (coming soon)"
          aria-label="Help"
        >
          ?
        </button>
      </div>

      <div className="h-5 w-px bg-slate-800" />

      <span className="font-mono text-xs text-slate-400">
        {Math.round(canvas.width)} x {Math.round(canvas.height)}
      </span>
      <span className="text-xs text-slate-500">
        {elementCount} {elementCount === 1 ? "region" : "regions"}
      </span>

      <div className="ml-auto flex items-center gap-1">
        <ToolbarButton label="Zoom out" onClick={() => step(-1)}>
          -
        </ToolbarButton>

        {/* Zoom percentage: single click resets, double click opens custom input. */}
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
            title="Click to reset 100%, double-click for custom zoom"
          >
            {Math.round(zoom * 100)}%
          </button>
        )}

        <ToolbarButton label="Zoom in" onClick={() => step(1)}>
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
