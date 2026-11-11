/**
 * Right sidebar: the region list and, from M3, the attribute editors.
 *
 * The list is live in M1 because it is the cheapest proof that the document and interaction stores
 * are wired to rendering: add an element, see it named here, click it, see the canvas outline move.
 *
 * UI copy uses American spelling to match the schema field names the user sees in exported JSON.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { AppearancePanel } from "./appearance-panel";
import { LayerPanel } from "./layer-panel";
import { useDocumentStore } from "@/stores/use-document-store";
import { useInteractionStore } from "@/stores/use-interaction-store";

/** Context menu state for the region list. */
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

  // Ref for auto-scrolling to the selected item.
  const selectedRef = useRef<HTMLLIElement>(null);

  // Context menu state for region list items.
  const [contextMenu, setContextMenu] = useState<RegionContextMenu | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Scroll to the selected item when selection changes.
  useEffect(() => {
    if (selectedId && selectedRef.current) {
      selectedRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [selectedId]);

  // Close context menu on click outside or Escape.
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
    <aside className="flex w-72 shrink-0 flex-col border-l border-slate-800 bg-slate-900">
      <SectionTitle>Regions</SectionTitle>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {elements.length === 0 ? (
          <p className="px-2 py-3 text-xs leading-relaxed text-slate-500">
            No regions yet. Each rectangle you draw becomes one element in the compiled JSON that
            Cursor reads.
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
                      ? "bg-blue-600/20 text-blue-100"
                      : "text-slate-300 hover:bg-slate-800"
                  }`}
                >
                  <span
                    className="h-3 w-3 shrink-0 rounded-sm border border-slate-600"
                    style={{ background: element.fill.color }}
                    aria-hidden
                  />
                  <span className="truncate">{element.name || `Region ${index + 1}`}</span>
                  {element.stamp && (
                    <span className="shrink-0 rounded bg-slate-700 px-1 text-[9px] text-slate-400">
                      icon
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-slate-800">
        <LayerPanel />
      </div>

      <div className="border-t border-slate-800">
        <SectionTitle>Appearance</SectionTitle>
        <AppearancePanel />
      </div>

      {/* Context menu for region list items */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 min-w-[140px] rounded-md border border-slate-700 bg-slate-800 py-1 shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            type="button"
            className="flex w-full items-center px-3 py-1.5 text-left text-sm text-slate-200 hover:bg-slate-700"
            onClick={handleBringToFront}
          >
            Bring to Front
          </button>
          <button
            type="button"
            className="flex w-full items-center px-3 py-1.5 text-left text-sm text-slate-200 hover:bg-slate-700"
            onClick={handleSendToBack}
          >
            Send to Back
          </button>
          <div className="my-1 border-t border-slate-700" />
          <button
            type="button"
            className="flex w-full items-center px-3 py-1.5 text-left text-sm text-red-400 hover:bg-slate-700"
            onClick={handleDelete}
          >
            Delete
          </button>
        </div>
      )}
    </aside>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="px-4 pb-2 pt-3 text-[11px] font-medium uppercase tracking-wider text-slate-500">
      {children}
    </h2>
  );
}
