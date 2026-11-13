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

/**
 * 色块：正方形，无缩放。
 *
 * 色块是数据而不是装饰——fill 会进入编译产物，是区分同族区域的信号。选中状态用同一个强调色描边，
 * 悬停时只加一条细环，不弹跳：弹跳会把一个读数变成玩具。
 */
function Swatch({
  color,
  selected,
  onClick,
  label,
}: {
  color: string;
  selected: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-5 w-5 border ${
        selected
          ? "border-accent ring-1 ring-accent"
          : "border-hairline-strong hover:ring-1 hover:ring-hairline-strong"
      }`}
      style={{ background: color }}
      aria-label={label}
      aria-pressed={selected}
      title={color}
    />
  );
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
          <Swatch
            key={color}
            color={color}
            selected={value === color}
            onClick={() => handleSwatchClick(color)}
            label={`选择颜色 ${color}`}
          />
        ))}
      </div>

      {/* 展开/折叠按钮 */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="text-[10px] text-ink-muted hover:text-ink-secondary"
      >
        {expanded ? "收起" : "更多颜色..."}
      </button>

      {/* 最近使用的颜色 */}
      {recentColors.length > 0 && (
        <div>
          <label className="mb-1 block text-[10px] text-ink-muted">最近使用</label>
          <div className="grid grid-cols-8 gap-1">
            {recentColors.map((color) => (
              <Swatch
                key={color}
                color={color}
                selected={value === color}
                onClick={() => handleSwatchClick(color)}
                label={`选择最近使用颜色 ${color}`}
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
          className="tabular flex-1 rounded-control border border-hairline-strong bg-surface-raised px-2 py-1 font-mono text-[10px] text-ink-secondary outline-none focus:border-accent"
          maxLength={7}
        />
        <button
          type="button"
          onClick={handleCustomSubmit}
          className="rounded-control border border-hairline-strong bg-surface-raised px-2 py-1 text-[10px] text-ink hover:bg-ink/10"
        >
          添加
        </button>
      </div>
    </div>
  );
}
