"""Stage the browser-side CPython runtime that the Qoder Sites build ships with.

    backend/.venv/bin/python scripts/stage_wasm.py

The published site has no Python host: Sites serves static files and Deno functions, so the
compiler would otherwise have to exist twice. Instead the real CPython, the real pydantic and the
unmodified ``backend/app`` sources are copied into ``frontend/public`` and run in the visitor's
browser. This script is the only thing that decides what that directory contains, which keeps the
artifact reviewable: everything below is a copy plus one zip, no translation step, no port.

Run it before ``NEXT_PUBLIC_MOGONG_TARGET=sites npm run build`` (``make sites`` does both), because
Next copies ``public/`` into ``out/`` as it finds it.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
import zipfile
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
PYODIDE_SRC = REPO_ROOT / "frontend" / "node_modules" / "pyodide"
BACKEND_APP = REPO_ROOT / "backend" / "app"
OUTPUT_DIR = REPO_ROOT / "frontend" / "public" / "wasm"
PYODIDE_DEST = OUTPUT_DIR / "pyodide"
APP_ZIP_DEST = OUTPUT_DIR / "mogong-app.zip"

# The interpreter and its glue. `pyodide.js` is the classic-script build, so the browser can be
# handed one <script> tag; it then dynamically imports `pyodide.asm.mjs`, which instantiates the
# 9 MB `pyodide.asm.wasm` and reads the frozen standard library from `python_stdlib.zip`. All four
# are resolved relative to `indexURL`, which is why they have to sit next to each other.
RUNTIME_FILES = (
    "pyodide.js",
    "pyodide.asm.mjs",
    "pyodide.asm.wasm",
    "python_stdlib.zip",
    "pyodide-lock.json",
)

# The wheel closure the compiler needs. `app.schemas` is pydantic-based and pydantic is the only
# third-party import in the backend that runs at compile time, so this one name is the whole
# dependency story: micropip and the network are not.
WHEEL_ROOTS = ("pydantic",)

# Sites' packager caps a Worker artifact at 50 MiB; the staged tree lands under that today with
# room to spare, and the check exists so a future dependency cannot silently blow the budget.
SIZE_BUDGET_BYTES = 50 * 1024 * 1024


def _normalize(name: str) -> str:
    """Match pyodide's lockfile keys, which spell some packages with hyphens and reference them
    with underscores (``pydantic_core`` is stored as ``pydantic-core``)."""
    return name.lower().replace("_", "-")


def wheel_closure(lock: dict[str, Any], roots: tuple[str, ...]) -> list[str]:
    """Transitive `file_name`s for the roots and everything they depend on.

    Reads the lock instead of globbing ``node_modules``: a stray wheel from an experiment would
    otherwise ride along to the public internet, and a missing dependency would surface as a
    confusing load failure on a visitor's machine rather than here.
    """
    packages = lock["packages"]
    pending = [_normalize(name) for name in roots]
    seen: set[str] = set()
    files: list[str] = []
    while pending:
        name = pending.pop()
        if name in seen:
            continue
        seen.add(name)
        package = packages.get(name)
        if package is None:
            raise SystemExit(f"{name} is not in pyodide-lock.json; cannot stage it offline.")
        files.append(package["file_name"])
        pending.extend(_normalize(dep) for dep in package.get("depends", []))
    return sorted(files)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def copy_runtime(files: list[str]) -> list[Path]:
    """Copy the runtime and the wheels, checking each against the lockfile's recorded hash."""
    lock = json.loads((PYODIDE_SRC / "pyodide-lock.json").read_text(encoding="utf-8"))
    expected = {
        package["file_name"]: package.get("sha256")
        for package in lock["packages"].values()
        if package.get("sha256")
    }
    PYODIDE_DEST.mkdir(parents=True, exist_ok=True)
    staged: list[Path] = []
    for name in files:
        source = PYODIDE_SRC / name
        if not source.is_file():
            raise SystemExit(
                f"{source.name} is missing from {PYODIDE_SRC}. "
                "Run `npm install` in frontend/ (pyodide is a devDependency)."
            )
        digest = expected.get(name)
        if digest is not None and _sha256(source) != digest:
            raise SystemExit(
                f"{name} does not match the hash in pyodide-lock.json. "
                "The installed pyodide package and its lockfile disagree; staging a runtime that "
                "the interpreter cannot verify would only move the failure to the browser."
            )
        destination = PYODIDE_DEST / name
        shutil.copyfile(source, destination)
        staged.append(destination)
    return staged


def build_app_zip() -> tuple[Path, int]:
    """Zip `backend/app` so the site runs the same sources the server runs.

    One request for 24 modules instead of 24 requests, and the browser unpacks it with stdlib
    `zipfile` -- there is no bundler between these files and the interpreter that executes them, so
    what ships is what pytest guards.
    """
    sources = sorted(
        path
        for path in BACKEND_APP.rglob("*.py")
        if "__pycache__" not in path.parts and path.suffix == ".py"
    )
    if not sources:
        raise SystemExit(f"no Python sources found under {BACKEND_APP}")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    # A fixed timestamp keeps the zip byte-stable: the compiler's identity should be checkable with
    # a diff, not tangled up with the minute the build happened to run.
    stamp = (1980, 1, 1, 0, 0, 0)
    with zipfile.ZipFile(APP_ZIP_DEST, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in sources:
            info = zipfile.ZipInfo(str(path.relative_to(BACKEND_APP.parent)), date_time=stamp)
            info.external_attr = 0o644 << 16
            with path.open("rb") as handle:
                archive.writestr(info, handle.read())
    return APP_ZIP_DEST, len(sources)


def prune(expected: set[Path]) -> list[Path]:
    """Delete staged files that this run did not ask for.

    A pyodide upgrade renames its wheels. Without this the previous versions stay in ``public/``,
    keep getting copied into ``out/``, and leave the site carrying two copies of a runtime.
    """
    removed = []
    for path in sorted(OUTPUT_DIR.rglob("*")):
        if path.is_file() and path not in expected:
            path.unlink()
            removed.append(path)
    return removed


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--check",
        action="store_true",
        help="report what would change and exit non-zero if the staged tree is stale",
    )
    args = parser.parse_args()

    lock = json.loads((PYODIDE_SRC / "pyodide-lock.json").read_text(encoding="utf-8"))
    wheels = wheel_closure(lock, WHEEL_ROOTS)
    wanted = {PYODIDE_DEST / name for name in (*RUNTIME_FILES, *wheels)} | {APP_ZIP_DEST}

    if args.check:
        missing = sorted(path for path in wanted if not path.is_file())
        stale = sorted(
            path for path in OUTPUT_DIR.rglob("*") if path.is_file() and path not in wanted
        )
        for path in (*missing, *stale):
            print(f"{'missing' if path in missing else 'stale'}: {path.relative_to(REPO_ROOT)}")
        if missing or stale:
            raise SystemExit(1)
        print(f"{OUTPUT_DIR.relative_to(REPO_ROOT)} is up to date.")
        return

    staged = copy_runtime([*RUNTIME_FILES, *wheels])
    app_zip, module_count = build_app_zip()
    staged.append(app_zip)
    for path in prune(wanted):
        print(f"removed stale {path.relative_to(REPO_ROOT)}")

    total = sum(path.stat().st_size for path in staged)
    print(f"staged {len(wheels)} wheel(s) and the {lock['info']['python']} interpreter")
    print(f"zipped {module_count} backend modules into {app_zip.relative_to(REPO_ROOT)}")
    print(f"total {total / 1024 / 1024:.1f} MiB (budget {SIZE_BUDGET_BYTES // 1024 // 1024} MiB)")
    if total > SIZE_BUDGET_BYTES:
        raise SystemExit("staged runtime exceeds the Sites artifact budget")


if __name__ == "__main__":
    sys.exit(main())
