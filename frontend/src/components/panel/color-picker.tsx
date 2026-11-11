/**
 * Color picker: a grid of swatches from the palette with expand/collapse and custom colors.
 *
 * Shows 8 soft colors by default. Clicking the expand button reveals the full palette.
 * A custom color section allows hex input and remembers up to 8 recently used colors (LRU).
 */

import { useCallback, useState } from "react";

import { LRU_COLOR_LIMIT, PALETTE } from "@/lib/constants";

interface ColorPickerProps {
  value: string;
  onSelect: (color: string) => void;
  swatches?: readonly string[];
  extendedSwatches?: readonly string[];
}

/** Simple LRU cache for recently used custom colors, stored in state. */
function useLruColors() {
  const [recentColors, setRecentColors] = useState<string[]>([]);

  const addColor = useCallback((color: string) => {
    setRecentColors((prev) => {
      const filtered = prev.filter((c) => c !== color);
      const next = [color, ...filtered];
      return next.slice(0, LRU_COLOR_LIMIT);
    });
  }, []);

  return { recentColors, addColor };
}

export function ColorPicker({
  value,
  onSelect,
  swatches = PALETTE.fills,
  extendedSwatches = PALETTE.fillsExtended,
}: ColorPickerProps) {
  const [expanded, setExpanded] = useState(false);
  const [customColor, setCustomColor] = useState("");
  const { recentColors, addColor } = useLruColors();

  const displaySwatches = expanded ? extendedSwatches : swatches;

  const handleSwatchClick = (color: string) => {
    onSelect(color);
    addColor(color);
  };

  const handleCustomSubmit = () => {
    const hex = customColor.trim();
    if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
      onSelect(hex.toUpperCase());
      addColor(hex.toUpperCase());
      setCustomColor("");
    }
  };

  return (
    <div className="space-y-2">
      {/* Swatch grid */}
      <div className="grid grid-cols-8 gap-1">
        {displaySwatches.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => handleSwatchClick(color)}
            className={`h-5 w-5 rounded-sm border transition-transform hover:scale-110 ${
              value === color ? "border-blue-400 ring-1 ring-blue-400" : "border-slate-600"
            }`}
            style={{ background: color }}
            aria-label={`Select color ${color}`}
            title={color}
          />
        ))}
      </div>

      {/* Expand/collapse button */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="text-[10px] text-slate-400 hover:text-slate-200"
      >
        {expanded ? "Show less" : "More colors..."}
      </button>

      {/* Recently used colors */}
      {recentColors.length > 0 && (
        <div>
          <label className="mb-1 block text-[10px] text-slate-500">Recent</label>
          <div className="grid grid-cols-8 gap-1">
            {recentColors.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => handleSwatchClick(color)}
                className={`h-5 w-5 rounded-sm border transition-transform hover:scale-110 ${
                  value === color ? "border-blue-400 ring-1 ring-blue-400" : "border-slate-600"
                }`}
                style={{ background: color }}
                aria-label={`Select recent color ${color}`}
                title={color}
              />
            ))}
          </div>
        </div>
      )}

      {/* Custom hex input */}
      <div className="flex gap-1">
        <input
          type="text"
          value={customColor}
          onChange={(e) => setCustomColor(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCustomSubmit()}
          placeholder="#RRGGBB"
          className="flex-1 rounded border border-slate-700 bg-slate-800 px-2 py-1 font-mono text-[10px] text-slate-200 outline-none focus:border-blue-500"
          maxLength={7}
        />
        <button
          type="button"
          onClick={handleCustomSubmit}
          className="rounded bg-slate-700 px-2 py-1 text-[10px] text-slate-200 hover:bg-slate-600"
        >
          Add
        </button>
      </div>
    </div>
  );
}
