/**
 * 颜色选择器：带展开/折叠功能和最近使用颜色的色板网格。
 *
 * 默认显示 8 种高对比度颜色。点击展开按钮显示完整色板。
 * 自定义颜色输入框支持 hex 格式，最近使用的 8 种颜色保存在 localStorage 中。
 */

import { useCallback, useEffect, useState } from "react";

import { LRU_COLOR_LIMIT, PALETTE } from "@/lib/constants";

interface ColorPickerProps {
  value: string;
  onSelect: (color: string) => void;
  swatches?: readonly string[];
  extendedSwatches?: readonly string[];
}

/** 最近使用颜色的 LRU 缓存，持久化到 localStorage。 */
const LRU_STORAGE_KEY = "mogong-recent-colors";

function useLruColors() {
  const [recentColors, setRecentColors] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = localStorage.getItem(LRU_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // 当 recentColors 变化时，同步到 localStorage
  useEffect(() => {
    try {
      localStorage.setItem(LRU_STORAGE_KEY, JSON.stringify(recentColors));
    } catch {
      // 忽略存储错误
    }
  }, [recentColors]);

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
      {/* 色板网格 */}
      <div className="grid grid-cols-8 gap-1">
        {displaySwatches.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => handleSwatchClick(color)}
            className={`h-5 w-5 rounded-sm border transition-transform hover:scale-110 ${
              value === color ? "border-blue-400 ring-1 ring-blue-400" : "border-slate-300 dark:border-slate-600"
            }`}
            style={{ background: color }}
            aria-label={`选择颜色 ${color}`}
            title={color}
          />
        ))}
      </div>

      {/* 展开/折叠按钮 */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="text-[10px] text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
      >
        {expanded ? "收起" : "更多颜色..."}
      </button>

      {/* 最近使用的颜色 */}
      {recentColors.length > 0 && (
        <div>
          <label className="mb-1 block text-[10px] text-slate-500 dark:text-slate-400">最近使用</label>
          <div className="grid grid-cols-8 gap-1">
            {recentColors.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => handleSwatchClick(color)}
                className={`h-5 w-5 rounded-sm border transition-transform hover:scale-110 ${
                  value === color ? "border-blue-400 ring-1 ring-blue-400" : "border-slate-300 dark:border-slate-600"
                }`}
                style={{ background: color }}
                aria-label={`选择最近使用颜色 ${color}`}
                title={color}
              />
            ))}
          </div>
        </div>
      )}

      {/* 自定义 hex 输入 */}
      <div className="flex gap-1">
        <input
          type="text"
          value={customColor}
          onChange={(e) => setCustomColor(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCustomSubmit()}
          placeholder="#RRGGBB"
          className="flex-1 rounded border border-slate-300 bg-white px-2 py-1 font-mono text-[10px] text-slate-700 outline-none focus:border-blue-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          maxLength={7}
        />
        <button
          type="button"
          onClick={handleCustomSubmit}
          className="rounded bg-slate-100 px-2 py-1 text-[10px] text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
        >
          添加
        </button>
      </div>
    </div>
  );
}
