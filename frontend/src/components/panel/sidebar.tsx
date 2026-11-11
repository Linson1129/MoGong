/**
 * 右侧边栏：区域列表和属性编辑器。
 *
 * 列表从 M1 开始就是实时的，因为这是证明文档存储和交互存储正确连接到渲染的最简单方式：
 * 添加一个元素，在这里看到它的名称，点击它，看到画布上的轮廓移动。
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { AppearancePanel } from "./appearance-panel";
import { useDocumentStore } from "@/stores/use-document-store";
import { useInteractionStore } from "@/stores/use-interaction-store";

/** 区域列表的右键菜单状态。 */
interface RegionContextMenu {
  x: number;
  y: number;
  elementId: string;
}

export function Sidebar() {
  const elements = useDocumentStore((state) => state.elements);
  const select = useInteractionStore((state) => state.select);
  const selectedId = useInteractionStore((state) => state.selectedId);
  const removeElement = useDocumentStore((state) => state.removeElement);
  const reorderElement = useDocumentStore((state) => state.reorderElement);

  // 自动滚动到选中项的 ref
  const selectedRef = useRef<HTMLLIElement>(null);

  // 区域列表右键菜单状态
  const [contextMenu, setContextMenu] = useState<RegionContextMenu | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // 选中项变化时自动滚动到该项
  useEffect(() => {
    if (selectedId && selectedRef.current) {
      selectedRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [selectedId]);

  // 点击外部或按 Escape 关闭右键菜单
  useEffect(() => {
    if (!contextMenu) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setContextMenu(null);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setContextMenu(null);
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [contextMenu]);

  const handleContextMenu = useCallback(
    (event: React.MouseEvent, elementId: string) => {
      event.preventDefault();
      select(elementId);
      setContextMenu({ x: event.clientX, y: event.clientY, elementId });
    },
    [select],
  );

  const handleDelete = useCallback(() => {
    if (contextMenu) {
      removeElement(contextMenu.elementId);
      if (selectedId === contextMenu.elementId) select(null);
      setContextMenu(null);
    }
  }, [contextMenu, removeElement, selectedId, select]);

  const handleBringToFront = useCallback(() => {
    if (contextMenu) {
      reorderElement(contextMenu.elementId, "front");
      setContextMenu(null);
    }
  }, [contextMenu, reorderElement]);

  const handleSendToBack = useCallback(() => {
    if (contextMenu) {
      reorderElement(contextMenu.elementId, "back");
      setContextMenu(null);
    }
  }, [contextMenu, reorderElement]);

  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <SectionTitle>区域</SectionTitle>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {elements.length === 0 ? (
          <p className="px-2 py-3 text-xs leading-relaxed text-slate-400 dark:text-slate-500">
            还没有区域。你绘制的每个矩形都会成为编译后 JSON 中的一个元素。
          </p>
        ) : (
          <ul className="space-y-0.5">
            {elements.map((element, index) => (
              <li key={element.id} ref={element.id === selectedId ? selectedRef : undefined}>
                <button
                  type="button"
                  onClick={() => select(element.id)}
                  onContextMenu={(e) => handleContextMenu(e, element.id)}
                  aria-current={element.id === selectedId}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs ${
                    element.id === selectedId
                      ? "bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-200"
                      : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`}
                >
                  <span
                    className="h-3 w-3 shrink-0 rounded-sm border border-slate-300 dark:border-slate-600"
                    style={{ background: element.fill.color }}
                    aria-hidden
                  />
                  <span className="truncate">{element.name || `区域 ${index + 1}`}</span>
                  {element.stamp && (
                    <span className="shrink-0 rounded bg-slate-200 px-1 text-[9px] text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                      图标
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-slate-200 dark:border-slate-700">
        <SectionTitle>外观</SectionTitle>
        <AppearancePanel />
      </div>

      {/* 区域列表的右键菜单 */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 min-w-[140px] rounded-md border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            type="button"
            className="flex w-full items-center px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
            onClick={handleBringToFront}
          >
            置于顶层
          </button>
          <button
            type="button"
            className="flex w-full items-center px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
            onClick={handleSendToBack}
          >
            置于底层
          </button>
          <div className="my-1 border-t border-slate-200 dark:border-slate-700" />
          <button
            type="button"
            className="flex w-full items-center px-3 py-1.5 text-left text-sm text-red-500 hover:bg-slate-100 dark:text-red-400 dark:hover:bg-slate-700"
            onClick={handleDelete}
          >
            删除
          </button>
        </div>
      )}
    </aside>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="px-4 pb-2 pt-3 text-[11px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
      {children}
    </h2>
  );
}
