/**
 * Color picker: a grid of swatches from the palette.
 *
 * The palette is defined in constants.ts. Clicking a swatch calls onSelect with the color value.
 * The currently selected color is highlighted with a ring.
 */

import { PALETTE } from "@/lib/constants";

interface ColorPickerProps {
  value: string;
  onSelect: (color: string) => void;
  swatches?: readonly string[];
}

export function ColorPicker({ value, onSelect, swatches = PALETTE.fills }: ColorPickerProps) {
  return (
    <div className="grid grid-cols-8 gap-1">
      {swatches.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => onSelect(color)}
          className={`h-5 w-5 rounded-sm border transition-transform hover:scale-110 ${
            value === color ? "border-blue-400 ring-1 ring-blue-400" : "border-slate-600"
          }`}
          style={{ background: color }}
          aria-label={`Select color ${color}`}
          title={color}
        />
      ))}
    </div>
  );
}
