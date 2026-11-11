/**
 * Editor chrome: the fixed frame around the drawing surface.
 *
 * Deliberately quiet. The canvas is the product, and a busy chrome around it makes it harder to
 * judge what the user drew -- which is the whole thing they came here to decide.
 */

import { SvgCanvas } from "@/components/canvas/svg-canvas";
import { Sidebar } from "@/components/panel/sidebar";
import { StatusBar } from "@/components/layout/status-bar";
import { Toolbar } from "@/components/layout/toolbar";

export function EditorShell() {
  return (
    <div className="flex h-dvh flex-col bg-slate-100 text-slate-900">
      <Toolbar />
      <div className="flex min-h-0 flex-1">
        <main className="relative min-w-0 flex-1">
          <SvgCanvas />
        </main>
        <Sidebar />
      </div>
      <StatusBar />
    </div>
  );
}
