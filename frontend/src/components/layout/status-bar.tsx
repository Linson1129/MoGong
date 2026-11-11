/**
 * 底部状态栏：光标位置、选中元素信息、操作提示。
 *
 * 光标读数使用画布单位，而非屏幕像素。这是用户绘制和最终进入 JSON 的单位，
 * 因此两者的差异会在这里显示，而不是只在编译后才被发现。
 */

import { useDocumentStore } from "@/stores/use-document-store";
import { useInteractionStore } from "@/stores/use-interaction-store";

export function StatusBar() {
  const cursor = useInteractionStore((state) => state.cursor);
  const selectedId = useInteractionStore((state) => state.selectedId);
  const elements = useDocumentStore((state) => state.elements);

  const selected = elements.find((element) => element.id === selectedId);

  return (
    <footer className="flex h-8 shrink-0 items-center gap-4 border-t border-slate-800 bg-slate-900 px-4 text-xs text-slate-400">
      <span className="font-mono" data-testid="cursor-readout">
        {cursor ? `x ${Math.round(cursor.x)}  y ${Math.round(cursor.y)}` : "x --  y --"}
      </span>

      {selected && (
        <span className="font-mono text-slate-300">
          {selected.name || selected.id}: {Math.round(selected.width)} ×{" "}
          {Math.round(selected.height)} at ({Math.round(selected.x)}, {Math.round(selected.y)})
        </span>
      )}

      <span className="ml-auto text-slate-500">
        {selected
          ? "拖拽角点调整大小 · 按住 Alt 拖拽从中心缩放"
          : "长按左键绘制区域 · 双击编辑备注 · Delete 删除"}
      </span>
    </footer>
  );
}
