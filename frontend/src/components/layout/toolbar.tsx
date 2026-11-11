/**
 * Top bar: identity, canvas size, zoom, connection state.
 *
 * Zoom controls are buttons here rather than only the wheel gesture, so the viewport can be driven
 * without a mouse and so view state is exercisable from M1 onward. The wheel handler arrives with
 * the gesture layer in M2.
 */

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

  const step = (direction: 1 | -1) =>
    setZoom(clamp(direction > 0 ? zoom * ZOOM.stepFactor : zoom / ZOOM.stepFactor));

  return (
    <header className="flex h-12 shrink-0 items-center gap-4 border-b border-slate-800 bg-slate-900 px-4">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-semibold tracking-tight">MoGong</span>
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
        {/* Clicking the percentage is the fastest way back to 1:1, and it is where the number
            already is, so it earns the affordance. */}
        <button
          type="button"
          onClick={resetView}
          className="min-w-14 rounded px-2 py-1 font-mono text-xs text-slate-300 hover:bg-slate-800"
          title="Reset zoom and pan"
        >
          {Math.round(zoom * 100)}%
        </button>
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
