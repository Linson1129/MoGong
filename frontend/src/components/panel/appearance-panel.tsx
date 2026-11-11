/**
 * Appearance panel: fill and border editors for the selected element.
 *
 * Shown only when an element is selected. Changes are written directly to the document store via
 * updateFill and updateBorder. The panel is intentionally narrow: width, style, color, radius.
 */

import { ColorPicker } from "./color-picker";
import { PALETTE } from "@/lib/constants";
import { selectElementById, useDocumentStore } from "@/stores/use-document-store";
import { useInteractionStore } from "@/stores/use-interaction-store";

export function AppearancePanel() {
  const selectedId = useInteractionStore((state) => state.selectedId);
  const element = useDocumentStore(selectElementById(selectedId));
  const updateFill = useDocumentStore((state) => state.updateFill);
  const updateBorder = useDocumentStore((state) => state.updateBorder);

  if (!selectedId || !element) {
    return (
      <div className="px-4 pb-4">
        <p className="text-xs text-slate-500">Select a region to edit its appearance.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 px-4 pb-4">
      {/* Fill section */}
      <div>
        <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-slate-400">
          Fill
        </label>
        <ColorPicker
          value={element.fill.color}
          onSelect={(color) => updateFill(selectedId, { color })}
          swatches={PALETTE.fills}
        />
        <div className="mt-2">
          <label className="mb-1 block text-[10px] text-slate-500">Opacity</label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={element.fill.opacity}
            onChange={(e) => updateFill(selectedId, { opacity: parseFloat(e.target.value) })}
            className="w-full accent-blue-500"
          />
          <span className="text-[10px] text-slate-500">{Math.round(element.fill.opacity * 100)}%</span>
        </div>
      </div>

      {/* Border section */}
      <div>
        <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-slate-400">
          Border
        </label>
        <ColorPicker
          value={element.border.color}
          onSelect={(color) => updateBorder(selectedId, { color })}
          swatches={PALETTE.borders}
        />
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-[10px] text-slate-500">Width</label>
            <input
              type="number"
              min={0}
              max={20}
              value={element.border.width}
              onChange={(e) => updateBorder(selectedId, { width: parseInt(e.target.value, 10) || 0 })}
              className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] text-slate-500">Radius</label>
            <input
              type="number"
              min={0}
              max={100}
              value={element.border.radius}
              onChange={(e) => updateBorder(selectedId, { radius: parseInt(e.target.value, 10) || 0 })}
              className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200"
            />
          </div>
        </div>
        <div className="mt-2">
          <label className="mb-1 block text-[10px] text-slate-500">Style</label>
          <select
            value={element.border.style}
            onChange={(e) => updateBorder(selectedId, { style: e.target.value as "solid" | "dashed" | "dotted" | "none" })}
            className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200"
          >
            <option value="solid">Solid</option>
            <option value="dashed">Dashed</option>
            <option value="dotted">Dotted</option>
            <option value="none">None</option>
          </select>
        </div>
      </div>
    </div>
  );
}
