/**
 * 外观面板：选中元素的填充和边框编辑器。
 *
 * 仅在选中元素时显示。修改通过 updateFill 和 updateBorder 直接写入文档存储。
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

  if (!selectedId || !element) {
    return (
      <div className="px-4 pb-4">
        <p className="text-xs text-slate-400">选中一个区域以编辑其外观。</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 px-4 pb-4">
      {/* 名称 */}
      <div>
        <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-slate-500">
          名称
        </label>
        <input
          type="text"
          value={element.name}
          onChange={(e) => updateElement(selectedId, { name: e.target.value })}
          placeholder="区域名称..."
          className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 outline-none focus:border-blue-500"
        />
      </div>

      {/* 填充 */}
      <div>
        <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-slate-500">
          填充
        </label>
        <ColorPicker
          value={element.fill.color}
          onSelect={(color) => updateFill(selectedId, { color })}
          swatches={PALETTE.fills}
        />
      </div>

      {/* 边框：仅实线和虚线两种 */}
      <div>
        <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-slate-500">
          边框
        </label>
        <select
          value={element.border.style === "dashed" ? "dashed" : "solid"}
          onChange={(e) => updateBorder(selectedId, { style: e.target.value as "solid" | "dashed" })}
          className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800"
        >
          <option value="solid">实线（固定）</option>
          <option value="dashed">虚线（可折叠）</option>
        </select>
      </div>

      {/* 锁定/隐藏切换 */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => updateElement(selectedId, { locked: !element.locked })}
          className={`flex-1 rounded border px-2 py-1.5 text-[11px] transition-colors ${
            element.locked
              ? "border-red-300 bg-red-50 text-red-600 hover:bg-red-100"
              : "border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
          }`}
        >
          {element.locked ? "已锁定" : "锁定"}
        </button>
        <button
          type="button"
          onClick={() => updateElement(selectedId, { visible: !element.visible })}
          className={`flex-1 rounded border px-2 py-1.5 text-[11px] transition-colors ${
            !element.visible
              ? "border-slate-300 bg-slate-100 text-slate-400 hover:bg-slate-200"
              : "border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
          }`}
        >
          {element.visible ? "可见" : "隐藏"}
        </button>
      </div>
    </div>
  );
}
