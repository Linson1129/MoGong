/**
 * 剪贴板 Hook：Ctrl+C 复制选中元素，Ctrl+V 在鼠标位置粘贴。
 *
 * 粘贴时以鼠标当前位置为矩形中心，生成新 id 并选中。
 * 剪贴板内容保存在模块级变量中，不进入任何 store——它不影响渲染，
 * 也没有撤销语义（复制不是编辑操作）。
 */

import { useCallback, useEffect } from "react";

import { useDocumentStore } from "@/stores/use-document-store";
import { useInteractionStore } from "@/stores/use-interaction-store";
import type { LayoutElement } from "@/types/document";

/** 内部剪贴板，只保存最后一次复制的元素快照。 */
let clipboard: LayoutElement | null = null;

export function useClipboard() {
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // 聚焦输入时不拦截。
    const target = event.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

    // 备注编辑中不拦截。
    const { noteEditingId } = useInteractionStore.getState();
    if (noteEditingId !== null) return;

    const isMod = event.metaKey || event.ctrlKey;
    if (!isMod) return;

    if (event.key === "c" || event.key === "C") {
      // Ctrl+C / Cmd+C：复制选中元素
      handleCopy(event);
    } else if (event.key === "v" || event.key === "V") {
      // Ctrl+V / Cmd+V：在鼠标位置粘贴
      handlePaste(event);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}

function handleCopy(event: KeyboardEvent) {
  const { selectedId } = useInteractionStore.getState();
  if (selectedId === null) return;

  const elements = useDocumentStore.getState().elements;
  const element = elements.find((el) => el.id === selectedId);
  if (!element) return;

  event.preventDefault();
  // 深拷贝，防止后续编辑影响剪贴板内容
  clipboard = structuredClone(element);
}

function handlePaste(event: KeyboardEvent) {
  if (clipboard === null) return;

  event.preventDefault();

  const { cursor, select } = useInteractionStore.getState();
  if (cursor === null) return;

  const addElement = useDocumentStore.getState().addElement;

  // 以鼠标位置为中心放置新矩形
  const newId = `el-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const pasted: LayoutElement = {
    ...structuredClone(clipboard),
    id: newId,
    x: cursor.x - clipboard.width / 2,
    y: cursor.y - clipboard.height / 2,
  };

  addElement(pasted);
  select(newId);
}
