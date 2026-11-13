"""Stage the download package that carries the mogong-layout Skill to an agent.

    backend/.venv/bin/python scripts/stage_skill.py

The editor's 导出 button hands over one compiled `*.layout.json`. That artifact is deliberately
inert on its own: docs/spec.md's ninth criterion pairs the JSON with the Skill, because the JSON
constrains relationships and the Skill is what tells an agent to treat it as a mould rather than a
finished page. A visitor who downloads only the JSON gets half the contract.

So the site offers the other half as a file. The archive is assembled here, at build time, rather
than in the browser: Python's `zipfile` is already a dependency of this repository, and a static
`<a download>` needs no client library, no fetch fan-out and no waiting.

The tree inside the archive keeps the directory name `mogong-layout/`, which is the Skill's
identifier -- unzipping into a skills directory therefore installs it correctly instead of dropping
five loose files the user has to reassemble by hand.
"""

from __future__ import annotations

import argparse
import io
import sys
import zipfile
from pathlib import Path
from typing import Final

REPO_ROOT = Path(__file__).resolve().parents[1]
SKILL_SRC = REPO_ROOT / ".qoder" / "skills" / "mogong-layout"
OUTPUT_DIR = REPO_ROOT / "frontend" / "public" / "skill"
ZIP_DEST = OUTPUT_DIR / "mogong-layout-skill.zip"

# The Skill is not the whole directory listing: `.DS_Store` and friends would travel into every
# visitor's download and then into whatever agent they paste it at.
SKILL_FILES: Final = ("SKILL.md", "reference.md", "react.md", "vue.md", "vanilla.md")

# Pinned so two builds of unchanged sources produce identical bytes, which is what makes --check a
# comparison rather than a guess.
STAMP: Final = (2000, 1, 1, 0, 0, 0)

README = """# 墨工布局模具包（mogong-layout）

这个压缩包里是**让 Agent 正确消费墨工产物的那一半**。

墨工导出的是单个 `*.layout.json`：它只有区域、比例和用户手写的口语批注。这份 JSON 是防止 Agent
随意创作前端布局的**模具**，不是成品规格。把 JSON 直接丢给 Agent，它会当成静态稿照着填格子；
配上本目录里的 Skill，它才会按 `role` / `name` / `note` 把每个区域识别成真实组件，并实现 note
里描述的功能。

## 怎么用

1. 在墨工里点「导出」，拿到 `<文档 id>.layout.json`。
2. 把本目录（`mogong-layout/`）和那份 JSON 一起交给 Agent：
   - **支持 Skill 的客户端**（如 Qoder）：把 `mogong-layout/` 放进其 skills 目录，对话附上 JSON。
   - **只吃 prompt 的客户端**：把 `SKILL.md` 全文和 JSON 一起粘进同一条消息，`SKILL.md` 里已写明
     `reference.md` 与栈适配文件（`react.md` / `vue.md` / `vanilla.md`）在同目录，按项目现状取用。
3. 补一句你自己的 prompt（要什么文字、什么交互、什么配色）——这些 JSON 里没有，本来就该由你指定。

## 里面有什么

| 文件 | 作用 |
|------|------|
| `SKILL.md` | 主规则：角色、契约、模具约束什么、沉默什么、验收清单 |
| `reference.md` | layout JSON 的字段语义与推断规则细节 |
| `react.md` | React + Next.js 栈的落地写法 |
| `vue.md` | Vue 3 + Vite 栈的落地写法 |
| `vanilla.md` | 原生 HTML/CSS/JS 栈的落地写法 |

内容随墨工仓库更新；本包不含任何画布数据，可重复下载。
"""


def build_zip() -> bytes:
    """Assemble the archive in memory so --check can compare it against what is on disk."""
    missing = [name for name in SKILL_FILES if not (SKILL_SRC / name).is_file()]
    if missing:
        names = ", ".join(missing)
        path = SKILL_SRC.relative_to(REPO_ROOT)
        raise SystemExit(f"skill source incomplete, missing {names} under {path}")

    sink = io.BytesIO()
    with zipfile.ZipFile(sink, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        # The README goes first so it is what a reader meets when the archive is listed; the Skill
        # entries carry the bytes as they are right now -- a Skill edited after staging would
        # otherwise be published under its previous content.
        for arcname, data in (("mogong-layout-skill/README.md", README.encode()),):
            info = zipfile.ZipInfo(arcname, date_time=STAMP)
            info.external_attr = 0o644 << 16
            archive.writestr(info, data, zipfile.ZIP_DEFLATED)
        for name in SKILL_FILES:
            info = zipfile.ZipInfo(f"mogong-layout/{name}", date_time=STAMP)
            info.external_attr = 0o644 << 16
            archive.writestr(info, (SKILL_SRC / name).read_bytes(), zipfile.ZIP_DEFLATED)
    return sink.getvalue()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--check",
        action="store_true",
        help="report whether the staged archive differs from what the sources would produce",
    )
    args = parser.parse_args()

    payload = build_zip()

    if args.check:
        if ZIP_DEST.is_file() and ZIP_DEST.read_bytes() == payload:
            print(f"{ZIP_DEST.relative_to(REPO_ROOT)} is up to date.")
            return 0
        reason = "absent" if not ZIP_DEST.is_file() else "stale"
        print(f"{reason}: {ZIP_DEST.relative_to(REPO_ROOT)}")
        return 1

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    ZIP_DEST.write_bytes(payload)
    raw = sum(len((SKILL_SRC / name).read_bytes()) for name in SKILL_FILES) + len(README.encode())
    print(f"staged {len(SKILL_FILES)} skill files + README into {ZIP_DEST.relative_to(REPO_ROOT)}")
    print(f"{raw / 1024:.0f} KiB of markdown -> {ZIP_DEST.stat().st_size / 1024:.0f} KiB archive")
    return 0


if __name__ == "__main__":
    sys.exit(main())
