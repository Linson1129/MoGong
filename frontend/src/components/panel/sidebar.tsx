/**
 * Right sidebar: the region list and, from M3, the attribute editors.
 *
 * The list is live in M1 because it is the cheapest proof that the document and interaction stores
 * are wired to rendering: add an element, see it named here, click it, see the canvas outline move.
 *
 * Color, border and note controls are placeholders until M3. They are laid out now so the panel
 * height and grouping can be judged before the styling pass, rather than discovered at the end.
 *
 * UI copy uses American spelling to match the schema field names the user sees in exported JSON.
 */

import { AppearancePanel } from "./appearance-panel";
import { useDocumentStore } from "@/stores/use-document-store";
import { useInteractionStore } from "@/stores/use-interaction-store";

export function Sidebar() {
  const elements = useDocumentStore((state) => state.elements);
  const select = useInteractionStore((state) => state.select);
  const selectedId = useInteractionStore((state) => state.selectedId);

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
              <li key={element.id}>
                <button
                  type="button"
                  onClick={() => select(element.id)}
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
                  <span className="ml-auto shrink-0 font-mono text-[10px] text-slate-500">
                    {Math.round(element.width)}x{Math.round(element.height)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-slate-800">
        <SectionTitle>Appearance</SectionTitle>
        <AppearancePanel />
      </div>
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
