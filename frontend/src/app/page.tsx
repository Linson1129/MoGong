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

import { useEffect } from "react";

import { EditorShell } from "@/components/layout/editor-shell";
import { useArrowKeyPanning } from "@/hooks/use-arrow-key-panning";
import { useClipboard } from "@/hooks/use-clipboard";
import { useDeleteKey } from "@/hooks/use-delete-key";
import { useHistory } from "@/hooks/use-history";
import { hydrateFromStorage } from "@/stores/use-document-store";
import { hydrateTheme } from "@/stores/use-theme-store";

export default function EditorPage() {
  // 客户端挂载后从 localStorage 恢复文档，避免 SSR Hydration 不匹配。
  useEffect(() => {
    hydrateTheme();
    hydrateFromStorage();
  }, []);

  useHistory();
  useClipboard();
  useArrowKeyPanning();
  useDeleteKey();
  return <EditorShell />;
}
