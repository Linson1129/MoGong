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
    <div className="flex h-dvh flex-col bg-surface-sunken text-ink">
      <Toolbar />
      <div className="flex min-h-0 flex-1">
        {/* overflow-hidden clips the sheet's shadow ring to the drawing area, the way the SVG used to
            clip it when the elevation was a filter inside the canvas. Fixed-position overlays escape
            this box, so the context menu and the note editor are unaffected. */}
        <main className="relative min-w-0 flex-1 overflow-hidden">
          <SvgCanvas />
        </main>
        <Sidebar />
      </div>
      <StatusBar />
    </div>
  );
}
