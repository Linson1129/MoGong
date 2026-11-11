"""Filesystem persistence for layouts.

The repository seam. Everything above this layer talks to this class, so replacing files with
SQLite later -- the sensible step if a real requirement for querying or concurrent writers ever
appears -- touches this one module and leaves the routers alone. See docs/architecture.md
section 4 for why this is not Redis.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from pydantic import ValidationError

from app.schemas.document import MoGongDocument

# Layout ids end up in filenames. Restricting them to this set means a crafted id cannot escape
# the data directory, which matters less for a localhost tool and more for staying boring to audit.
SAFE_ID_PATTERN = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$")


class LayoutNotFoundError(KeyError):
    """Raised when a layout id does not correspond to a stored document."""


class InvalidLayoutIdError(ValueError):
    """Raised for an id that could not name a file, before any filesystem access happens."""


class StorageError(RuntimeError):
    """Raised when a stored document cannot be read or parsed."""


def validate_layout_id(layout_id: str) -> str:
    if not SAFE_ID_PATTERN.match(layout_id):
        raise InvalidLayoutIdError(f"layout id {layout_id!r} must match {SAFE_ID_PATTERN.pattern}")
    return layout_id


class LayoutRepository:
    """One ``*.mogong.json`` file per layout inside a single directory."""

    def __init__(self, root: Path) -> None:
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    def path_for(self, layout_id: str) -> Path:
        return self.root / f"{validate_layout_id(layout_id)}.mogong.json"

    def list_ids(self) -> list[str]:
        """All stored layout ids, sorted. Reads filenames only, so it stays cheap on big folders."""
        return sorted(path.stem.removesuffix(".mogong") for path in self.root.glob("*.mogong.json"))

    def exists(self, layout_id: str) -> bool:
        return self.path_for(layout_id).is_file()

    def load(self, layout_id: str) -> MoGongDocument:
        path = self.path_for(layout_id)
        if not path.is_file():
            raise LayoutNotFoundError(layout_id)
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise StorageError(f"could not read layout {layout_id!r}: {exc}") from exc
        try:
            return MoGongDocument.model_validate(payload)
        except ValidationError as exc:
            # A document that fails schema validation is reported as a storage problem rather than
            # a 500: the file exists and is the user's work, so the message has to tell them the
            # file is malformed instead of implying the request was nonsense.
            raise StorageError(f"layout {layout_id!r} is malformed: {exc}") from exc

    def save(self, document: MoGongDocument) -> Path:
        """Write a document, creating it or overwriting wholesale.

        A full rewrite rather than a patch: documents are a few kilobytes, and an atomic replace
        cannot leave a half-applied edit behind if the process is killed mid-write.
        """
        path = self.path_for(document.meta.id)
        serialized = document.model_dump_json(indent=2, by_alias=True)

        # Write-then-rename, because open(path, "w") truncates first and a crash in between would
        # destroy the previous version of the user's work.
        temp_path = path.with_suffix(path.suffix + ".tmp")
        temp_path.write_text(serialized, encoding="utf-8")
        temp_path.replace(path)
        return path

    def delete(self, layout_id: str) -> None:
        path = self.path_for(layout_id)
        if not path.is_file():
            raise LayoutNotFoundError(layout_id)
        path.unlink()

    def save_compiled(self, layout_id: str, payload: dict, target: Path) -> Path:
        """Write compiled output to ``target``, keeping it apart from editable documents.

        Compiled files are derived data. Storing them beside documents would make it possible to
        load stale output as if it were an editable layout.
        """
        validate_layout_id(layout_id)
        target = Path(target)
        target.mkdir(parents=True, exist_ok=True)
        file_path = target / f"{layout_id}.layout.json"
        file_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
        return file_path
