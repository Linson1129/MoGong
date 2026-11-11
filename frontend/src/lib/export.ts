/**
 * 导出功能：将画布文档编译为 Agent 可读的 layout JSON。
 *
 * 核心流程：
 * 1. 从 document store 获取当前文档状态
 * 2. 调用后端 /api/compile 编译
 * 3. 提供下载或复制到剪贴板
 */

import { api, ApiError } from "@/lib/api";
import { useDocumentStore } from "@/stores/use-document-store";
import { useViewStore } from "@/stores/use-view-store";
import type { LayoutDocument } from "@/types/layout";

export interface ExportResult {
  success: boolean;
  layout?: LayoutDocument;
  writtenTo?: string;
  error?: string;
}

/**
 * 编译当前文档并返回结果。
 */
export async function compileDocument(): Promise<ExportResult> {
  const docStore = useDocumentStore.getState();
  const viewStore = useViewStore.getState();

  const document = docStore.toDocument({
    zoom: viewStore.zoom,
    panX: viewStore.panX,
    panY: viewStore.panY,
  });

  try {
    const result = await api.compile(document);
    return {
      success: true,
      layout: result.layout,
      writtenTo: result.writtenTo ?? undefined,
    };
  } catch (err) {
    if (err instanceof ApiError) {
      return {
        success: false,
        error: err.message,
      };
    }
    return {
      success: false,
      error: "编译失败，请确保后端服务正在运行。",
    };
  }
}

/**
 * 下载编译后的 layout JSON 文件。
 */
export function downloadLayout(layout: LayoutDocument, fileName: string): void {
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
  const result = await compileDocument();

  if (result.success && result.layout) {
    const docStore = useDocumentStore.getState();
    const fileName = `${docStore.meta.id}.layout.json`;
    downloadLayout(result.layout, fileName);
  }

  return result;
}
