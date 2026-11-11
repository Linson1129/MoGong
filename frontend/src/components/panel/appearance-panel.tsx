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
  const updateElement = useDocumentStore((state) => state.updateElement);
  const layers = useDocumentStore((state) => state.layers);

  if (!selectedId || !element) {
    return (
      <div className="px-4 pb-4">
        <p className="text-xs text-slate-500">Select a region to edit its appearance.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 px-4 pb-4">
      {/* Name section */}
      <div>
        <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-slate-400">
          Name
        </label>
        <input
          type="text"
          value={element.name}
          onChange={(e) => updateElement(selectedId, { name: e.target.value })}
          placeholder="Region name..."
          className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200 outline-none focus:border-blue-500"
        />
      </div>

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

      {/* Border section: style only. Color, width, and radius are removed per Captain's feedback.
          Style conveys semantic meaning: dashed = collapsible, solid = permanent. */}
      <div>
        <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-slate-400">
          Border
        </label>
        <select
          value={element.border.style}
          onChange={(e) => updateBorder(selectedId, { style: e.target.value as "solid" | "dashed" | "dotted" | "none" })}
          className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200"
        >
          <option value="solid">Solid (permanent)</option>
          <option value="dashed">Dashed (collapsible)</option>
          <option value="dotted">Dotted</option>
          <option value="none">None</option>
        </select>
      </div>

      {/* Layer assignment */}
      {layers.length > 0 && (
        <div>
          <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-slate-400">
            Layer
          </label>
          <select
            value={element.layerId ?? ""}
            onChange={(e) => updateElement(selectedId, { layerId: e.target.value || null })}
            className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200"
          >
            <option value="">Unassigned</option>
            {layers.map((layer) => (
              <option key={layer.id} value={layer.id}>
                {layer.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Lock/Hide toggles */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => updateElement(selectedId, { locked: !element.locked })}
          className={`flex-1 rounded border px-2 py-1.5 text-[11px] transition-colors ${
            element.locked
              ? "border-red-500/50 bg-red-500/10 text-red-300 hover:bg-red-500/20"
              : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
          }`}
        >
          {element.locked ? "Locked" : "Lock"}
        </button>
        <button
          type="button"
          onClick={() => updateElement(selectedId, { visible: !element.visible })}
          className={`flex-1 rounded border px-2 py-1.5 text-[11px] transition-colors ${
            !element.visible
              ? "border-slate-600 bg-slate-700 text-slate-400 hover:bg-slate-600"
              : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
          }`}
        >
          {element.visible ? "Visible" : "Hidden"}
        </button>
      </div>
    </div>
  );
}
