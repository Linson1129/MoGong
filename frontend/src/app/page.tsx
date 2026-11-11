/**
 * The editor.
 *
 * "use client" is set at the page rather than on each interactive component. The canvas is
 * pointer-driven and reads from Zustand stores, so there is no meaningful server render to be had
 * here, and one marker at the boundary is easier to audit than six scattered ones.
 *
 * No SSR of stored layouts either: the document lives in the backend's data directory, and loading
 * it before hydration would produce a canvas whose content changes the moment it becomes
 * interactive -- a flash that reads as the tool being unreliable.
 */

"use client";

import { EditorShell } from "@/components/layout/editor-shell";
import { useHistory } from "@/hooks/use-history";

export default function EditorPage() {
  useHistory();
  return <EditorShell />;
}
