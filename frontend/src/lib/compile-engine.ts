/**
 * The compiler's transport, and the browser-side CPython that makes a static site possible.
 *
 * The compiler exists once, in Python (`backend/app`). A Qoder Sites deployment serves static files
 * and Deno functions -- there is no Python host, and porting the inference pipeline to TypeScript
 * would leave two implementations of the same geometry that nothing keeps honest: the shared truth
 * table guards Python against TypeScript, not the browser against the server.
 *
 * So the site ships CPython itself. `scripts/stage_wasm.py` copies pyodide's interpreter, pydantic's
 * wheel closure and the zipped `backend/app` sources into `public/wasm/`, and this module runs them
 * in the visitor's browser. Nothing is transpiled. Locally the same call goes over HTTP to the same
 * code, which is the only difference between the two modes -- plus that a static build has no server
 * filesystem to write `*.layout.json` into, so `writtenTo` stays null.
 */

import { api } from "@/lib/api";
import type { MoGongDocument } from "@/types/document";
import type { LayoutDocument } from "@/types/layout";

/** `sites` is the published static build; `local` is `npm run dev` with a backend on 8100. */
const TARGET = process.env.NEXT_PUBLIC_MOGONG_TARGET === "sites" ? "sites" : "local";

/** Whether this build compiles in the visitor's browser instead of over HTTP. */
export const COMPILES_IN_BROWSER = TARGET === "sites";

/** Everything is resolved against these paths, which is where `stage_wasm.py` put it. */
export const PYODIDE_INDEX_URL = "/wasm/pyodide/";
export const PYODIDE_SCRIPT_URL = `${PYODIDE_INDEX_URL}pyodide.js`;
export const APP_ZIP_URL = "/wasm/mogong-app.zip";
export const MOGONG_SYS_PATH = "/mogong";
export const INPUT_PATH = "/mogong-input.json";

export interface CompiledLayout {
  layout: LayoutDocument;
  /** A filename from the server's compiled directory; always null in a static build. */
  writtenTo: string | null;
}

export type CompileFailureKind =
  /** The drawing broke a schema rule. */
  | "invalid"
  /** The compiler ran and declined to guess (`CompileError`). */
  | "compile"
  /** The interpreter, the download, or an unexpected exception: the build is at fault. */
  | "runtime";

export class CompileFailure extends Error {
  constructor(
    readonly kind: CompileFailureKind,
    message: string,
  ) {
    super(message);
    this.name = "CompileFailure";
  }
}

/**
 * The slice of pyodide this module uses, declared rather than imported.
 *
 * The runtime arrives through a script tag, so it is outside the module graph and its own `.d.ts` is
 * unreachable without adding pyodide to the production dependencies -- which would invite the bundler
 * to resolve a 15 MiB interpreter. A narrow structural type is the honest version of the same fact.
 */
interface PyodideRuntime {
  loadPackage(names: string[]): Promise<unknown>;
  runPython(source: string): unknown;
  FS: { writeFile(path: string, data: Uint8Array | string): void };
}

type LoadPyodide = (options: { indexURL: string }) => Promise<PyodideRuntime>;

declare global {
  interface Window {
    loadPyodide?: LoadPyodide;
  }
}

/**
 * Unpack the zipped backend into the in-memory filesystem and put it on the import path.
 *
 * `zipfile` is stdlib, so the archive is opened by the same interpreter that runs the code inside it.
 * One request for the whole compiler instead of one per module, and no second extraction library.
 */
export const UNPACK_SOURCE = `
import sys, zipfile

with zipfile.ZipFile("/mogong-app.zip") as archive:
    archive.extractall("${MOGONG_SYS_PATH}")
if "${MOGONG_SYS_PATH}" not in sys.path:
    sys.path.insert(0, "${MOGONG_SYS_PATH}")
`;

/**
 * One compile per call, answered as a JSON envelope.
 *
 * The three failure kinds are separated on purpose. A schema rejection is a problem with the drawing,
 * and the sentence comes from `app.services.errors` -- the very function the HTTP handler calls, so a
 * bad margin reads identically in both builds. A `CompileError` is the compiler declining to guess.
 * Anything else, including the backend modules failing to import, is a broken build and must not be
 * dressed up as a problem with the user's drawing.
 */
export const COMPILE_SOURCE = `
import json
from pydantic import ValidationError


def _compile(path):
    from app.schemas.document import MoGongDocument
    from app.services.compiler import CompileError, compile_document
    from app.services.errors import format_validation_error

    with open(path) as handle:
        payload = json.load(handle)
    try:
        document = MoGongDocument.model_validate(payload)
    except ValidationError as exc:
        return {"ok": False, "kind": "invalid", "error": format_validation_error(exc.errors())}
    try:
        layout = compile_document(document)
    except CompileError as exc:
        return {"ok": False, "kind": "compile", "error": f"Compilation failed: {exc}"}
    return {"ok": True, "layout": layout.model_dump(mode="json")}


json.dumps(_compile("${INPUT_PATH}"), ensure_ascii=False)
`;

const KNOWN_KINDS = new Set<string>(["invalid", "compile", "runtime"]);

/**
 * Read the envelope from `COMPILE_SOURCE`, keeping whatever the interpreter managed to say.
 *
 * Separate from the interpreter call so the boring failure surface -- a body that is not JSON, an
 * `ok` that lies, a missing `layout` -- can be tested without an interpreter. A payload that parses
 * but disagrees with the contract is reported as `runtime`: it is our wire format that broke, and a
 * message about the drawing would send the user to fix something that is already correct.
 */
export function readEnvelope(text: string): CompiledLayout {
  let envelope: unknown;
  try {
    envelope = JSON.parse(text);
  } catch {
    throw new CompileFailure("runtime", "浏览器里的编译器返回了读不懂的答复，请刷新页面重试。");
  }
  if (envelope === null || typeof envelope !== "object" || Array.isArray(envelope)) {
    throw new CompileFailure("runtime", "浏览器里的编译器的答复不符合约定。");
  }
  const { ok, kind, error, layout } = envelope as Record<string, unknown>;
  if (ok === true) {
    if (layout === null || typeof layout !== "object" || Array.isArray(layout)) {
      throw new CompileFailure("runtime", "编译器说成功了，但没有给出产物。");
    }
    return { layout: layout as LayoutDocument, writtenTo: null };
  }
  const message = typeof error === "string" && error.length > 0 ? error : "编译失败。";
  const known = typeof kind === "string" && KNOWN_KINDS.has(kind);
  throw new CompileFailure(known ? (kind as CompileFailureKind) : "runtime", message);
}

let scriptPromise: Promise<void> | null = null;
let runtimePromise: Promise<PyodideRuntime> | null = null;

/**
 * Pull in pyodide's classic-script build.
 *
 * A script tag rather than `import()`: the interpreter is 15 MiB of binary plus glue that lives
 * outside the module graph, and asking a bundler to resolve it would either fail or inline a copy of
 * an index it has no business touching. `pyodide.js` declares a global `var loadPyodide`.
 */
function loadPyodideScript(): Promise<void> {
  if (!scriptPromise) {
    scriptPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = PYODIDE_SCRIPT_URL;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        scriptPromise = null;
        reject(new CompileFailure("runtime", `无法加载 Python 运行时（${PYODIDE_SCRIPT_URL}）。`));
      };
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

async function unpackApplication(pyodide: PyodideRuntime): Promise<void> {
  const response = await fetch(APP_ZIP_URL).catch(() => null);
  if (!response) {
    throw new CompileFailure("runtime", `无法下载编译器源码（${APP_ZIP_URL}）。`);
  }
  if (!response.ok) {
    throw new CompileFailure("runtime", `编译器源码不完整（HTTP ${response.status}），请重新构建。`);
  }
  pyodide.FS.writeFile("/mogong-app.zip", new Uint8Array(await response.arrayBuffer()));
  pyodide.runPython(UNPACK_SOURCE);
}

async function bootRuntime(): Promise<PyodideRuntime> {
  await loadPyodideScript();
  const load = window.loadPyodide;
  if (!load) {
    scriptPromise = null;
    throw new CompileFailure("runtime", "Python 运行时加载了，但没有提供入口。");
  }
  const pyodide = await load({ indexURL: PYODIDE_INDEX_URL });
  // Resolved from the wheels next to pyodide-lock.json, so nothing reaches for a CDN at runtime: the
  // site is self-contained, and a build that depended on someone else's host would stop working the
  // day that network disagrees.
  await pyodide.loadPackage(["pydantic"]);
  await unpackApplication(pyodide);
  return pyodide;
}

/**
 * Start the interpreter once per page, and let a failed start be retried.
 *
 * The rejection is dropped rather than cached: a visitor whose connection blinks for a second should
 * be able to press 导出 again instead of being locked out of the compiler for the session.
 */
function ensureRuntime(): Promise<PyodideRuntime> {
  if (!runtimePromise) {
    runtimePromise = bootRuntime().catch((error: unknown) => {
      runtimePromise = null;
      throw error;
    });
  }
  return runtimePromise;
}

/** Compile a document with the CPython that this page downloaded. */
export async function compileInBrowser(document: MoGongDocument): Promise<CompiledLayout> {
  const pyodide = await ensureRuntime();
  pyodide.FS.writeFile(INPUT_PATH, JSON.stringify(document));
  return readEnvelope(String(pyodide.runPython(COMPILE_SOURCE)));
}

/**
 * Compile, whichever way this build can reach a compiler.
 *
 * Both branches run the same Python. The caller should not have to know that one of them paid 15 MiB
 * for the privilege of not needing a server.
 */
export async function compileDocument(document: MoGongDocument): Promise<CompiledLayout> {
  if (!COMPILES_IN_BROWSER) return api.compile(document);
  return compileInBrowser(document);
}
