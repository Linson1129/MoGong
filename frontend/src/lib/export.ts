/**
 * 导出功能：将画布文档编译为 Agent 可读的 layout JSON。
 *
 * 核心流程：
 * 1. 从 document store 获取当前文档状态
 * 2. 编译（本地走后端 HTTP，静态站点走浏览器里的 CPython，见 lib/compile-engine.ts）
 * 3. 提供下载或复制到剪贴板
 */

import { ApiError } from "@/lib/api";
import { COMPILES_IN_BROWSER, CompileFailure, compileDocument as runCompiler } from "@/lib/compile-engine";
import { DEFAULT_CANVAS } from "@/lib/constants";
import { useDocumentStore } from "@/stores/use-document-store";
import { useViewStore } from "@/stores/use-view-store";
import type { LayoutDocument, LayoutNode } from "@/types/layout";
import type { LayoutElement, MoGongDocument } from "@/types/document";

export interface ExportResult {
  success: boolean;
  layout?: LayoutDocument;
  writtenTo?: string;
  error?: string;
}

/**
 * 编译当前文档并返回结果。
 */
async function compileCurrentDocument(): Promise<ExportResult> {
  const docStore = useDocumentStore.getState();
  const viewStore = useViewStore.getState();

  const document = docStore.toDocument({
    zoom: viewStore.zoom,
    panX: viewStore.panX,
    panY: viewStore.panY,
  });

  try {
    const result = await runCompiler(document);
    return {
      success: true,
      layout: result.layout,
      writtenTo: result.writtenTo ?? undefined,
    };
  } catch (err) {
    // Both transports put a readable sentence on the error: the server's flattened 422 detail, or the
    // same wording produced in the browser by the same helper. Neither needs a translation here.
    if (err instanceof ApiError || err instanceof CompileFailure) {
      return {
        success: false,
        error: err.message,
      };
    }
    console.error("[mogong] unexpected compile failure", err);
    return {
      success: false,
      // Which way to blame depends on which way the compiler is reached: a static build has no
      // backend for the user to go and start, and telling them to look for one is a dead end.
      // The error itself is logged because on a static build this branch means the shipped
      // interpreter or its sources broke, and a visitor cannot tell us anything we do not have to
      // reproduce ourselves. A PythonError reaches here unlabelled, and unlabelled is undebuggable.
      error: COMPILES_IN_BROWSER
        ? "编译失败：浏览器里的编译器没有响应，请刷新页面重试。"
        : "编译失败，请确保后端服务正在运行。",
    };
  }
}

/**
 * 下载编译后的 layout JSON 文件。
 */
function downloadLayout(layout: LayoutDocument, fileName: string): void {
  const json = JSON.stringify(layout, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/**
 * 将 layout JSON 复制到剪贴板。
 */
export async function copyLayoutToClipboard(layout: LayoutDocument): Promise<boolean> {
  try {
    const json = JSON.stringify(layout, null, 2);
    await navigator.clipboard.writeText(json);
    return true;
  } catch {
    return false;
  }
}

/**
 * 完整导出流程：编译 + 下载。
 */
export async function exportLayout(): Promise<ExportResult> {
  const result = await compileCurrentDocument();

  if (result.success && result.layout) {
    const docStore = useDocumentStore.getState();
    const fileName = `${docStore.meta.id}.layout.json`;
    downloadLayout(result.layout, fileName);
  }

  return result;
}

// ---------------------------------------------------------------------------
// 导入 & 清除
// ---------------------------------------------------------------------------

interface ImportResult {
  success: boolean;
  elementCount?: number;
  error?: string;
}

/**
 * 一键清除：重置画布 + 清空 localStorage。
 */
export function clearAll(): ImportResult {
  const docStore = useDocumentStore.getState();
  docStore.resetDocument();
  return { success: true, elementCount: 0 };
}

/**
 * 从 JSON 文本导入文档。
 * 支持两种格式：
 * - mogong.document（编辑器导出的完整文档）
 * - mogong.layout（编译产物，会自动展开为绝对像素坐标）
 */
export function importFromJson(jsonStr: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return { success: false, error: "JSON 格式无效" };
  }

  if (!parsed || typeof parsed !== "object") {
    return { success: false, error: "JSON 必须是对象" };
  }

  const obj = parsed as Record<string, unknown>;
  const format = obj.format as string | undefined;

  if (format === "mogong.document") {
    return loadDocumentFormat(obj as unknown as MoGongDocument);
  }

  if (format === "mogong.layout") {
    const document = layoutToDocument(obj as unknown as LayoutDocument);
    return loadDocumentFormat(document);
  }

  return { success: false, error: "未知格式，需要 mogong.document 或 mogong.layout" };
}

function loadDocumentFormat(document: MoGongDocument): ImportResult {
  const docStore = useDocumentStore.getState();
  docStore.loadDocument(document);
  return { success: true, elementCount: document.elements.length };
}

/**
 * 将编译产物 (LayoutDocument) 转换回可编辑的 MoGongDocument。
 * 通过递归展开百分比坐标为绝对像素值来还原扁平元素列表。
 */
function layoutToDocument(layout: LayoutDocument): MoGongDocument {
  const { width: cw, height: ch } = layout.canvas;
  const elements: LayoutElement[] = [];

  function walk(node: LayoutNode, parentX: number, parentY: number, parentW: number, parentH: number) {
    // Skip the synthetic root (id="root")
    if (node.id !== "root") {
      const absX = parentX + (node.box.x / 100) * parentW;
      const absY = parentY + (node.box.y / 100) * parentH;
      const absW = (node.box.width / 100) * parentW;
      const absH = (node.box.height / 100) * parentH;

      const element: LayoutElement = {
        id: node.id,
        name: node.name || "",
        x: Math.round(absX * 100) / 100,
        y: Math.round(absY * 100) / 100,
        width: Math.max(Math.round(absW * 100) / 100, 1),
        height: Math.max(Math.round(absH * 100) / 100, 1),
        fill: {
          color: node.style.fill || "#E2E8F0",
          opacity: node.style.fillOpacity ?? 1,
        },
        border: node.style.border
          ? { ...node.style.border }
          : { width: 0, style: "solid", color: "#64748B", radius: 0 },
        note: node.note,
        locked: false,
        visible: true,
        stamp: false,
      };
      elements.push(element);
    }

    // Children's parent rect is this node's absolute rect
    const childParentX = node.id === "root" ? 0 : parentX + (node.box.x / 100) * parentW;
    const childParentY = node.id === "root" ? 0 : parentY + (node.box.y / 100) * parentH;
    const childParentW = node.id === "root" ? cw : (node.box.width / 100) * parentW;
    const childParentH = node.id === "root" ? ch : (node.box.height / 100) * parentH;

    for (const child of node.children) {
      walk(child, childParentX, childParentY, childParentW, childParentH);
    }
  }

  walk(layout.root, 0, 0, cw, ch);

  const now = new Date().toISOString();
  return {
    format: "mogong.document",
    version: "1.0",
    meta: {
      id: layout.meta.name || `imported-${Date.now().toString(36)}`,
      name: layout.meta.name || "imported",
      createdAt: now,
      updatedAt: now,
    },
    canvas: {
      width: cw,
      height: ch,
      background: layout.canvas.background || DEFAULT_CANVAS.background,
      gridSize: DEFAULT_CANVAS.gridSize,
      snapToGrid: DEFAULT_CANVAS.snapToGrid,
    },
    elements,
    viewport: { zoom: 1, panX: 0, panY: 0 },
  };
}
