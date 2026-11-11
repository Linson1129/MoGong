/**
 * Typed client for the MoGong backend.
 *
 * All calls go through Next's rewrite of `/api` to localhost, so the browser never talks to two
 * origins and there is no CORS configuration to get wrong.
 */

import { API_BASE } from "./constants";
import type {
  LayoutListResponse,
  MoGongDocument,
  ValidationResponse,
} from "@/types/document";
import type { LayoutDocument } from "@/types/layout";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Passes the server's structured detail through so the UI can name the milestone or field. */
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Not every caller can show a toast from inside a library function, so errors are thrown as a
 * typed value with the server's own message rather than swallowed into an empty result.
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch (cause) {
    // A rejected fetch means the backend is not running, which is the single most common failure
    // during development and deserves a message a reader can act on.
    throw new ApiError(0, "Cannot reach the MoGong backend. Is it running on port 8100?", cause);
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const payload = text.length > 0 ? safeParse(text) : null;

  if (!response.ok) {
    throw new ApiError(
      response.status,
      extractDetail(payload) ?? `Request failed with status ${response.status}`,
      payload ?? undefined,
    );
  }

  if (payload === null) {
    throw new ApiError(response.status, `Server returned a body that is not JSON: ${path}`);
  }
  return payload as T;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** FastAPI puts its message under `detail`; that is the part worth showing a user. */
function extractDetail(payload: unknown): string | null {
  if (payload === null || typeof payload !== "object") return null;
  const { detail } = payload as { detail?: unknown };
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object" && "message" in detail) {
    const { message } = detail as { message: unknown };
    if (typeof message === "string") return message;
  }
  return null;
}

export const api = {
  health: () => request<{ status: string; service: string; version: string }>("/health"),

  listLayouts: () => request<LayoutListResponse>("/layouts"),

  getLayout: (id: string) => request<MoGongDocument>(`/layouts/${encodeURIComponent(id)}`),

  createLayout: (document: MoGongDocument) =>
    request<MoGongDocument>("/layouts", { method: "POST", body: JSON.stringify(document) }),

  saveLayout: (document: MoGongDocument) =>
    request<MoGongDocument>(
      `/layouts/${encodeURIComponent(document.meta.id)}`,
      { method: "PUT", body: JSON.stringify(document) },
    ),

  deleteLayout: (id: string) =>
    request<void>(`/layouts/${encodeURIComponent(id)}`, { method: "DELETE" }),

  validate: (document: MoGongDocument) =>
    request<ValidationResponse>("/compile/validate", {
      method: "POST",
      body: JSON.stringify(document),
    }),

  compile: (document: MoGongDocument) =>
    request<{ layout: LayoutDocument; writtenTo: string | null }>("/compile", {
      method: "POST",
      body: JSON.stringify(document),
    }),
};
