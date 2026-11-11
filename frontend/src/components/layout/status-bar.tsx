/**
 * Bottom bar: cursor position, selection, milestone state.
 *
 * The cursor readout is in canvas units, not screen pixels. That is what the user is drawing in and
 * what ends up in the JSON, so a disagreement between the two is visible here rather than only after
 * a compile.
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
          {selected.name || selected.id}: {Math.round(selected.width)} x{" "}
          {Math.round(selected.height)} at ({Math.round(selected.x)}, {Math.round(selected.y)})
        </span>
      )}

      <span className="ml-auto text-slate-500">
        M1 scaffold - drawing and compiling arrive in M2 and M4
      </span>
    </footer>
  );
}
