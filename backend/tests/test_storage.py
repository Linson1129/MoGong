"""Persistence behaviour of the layout repository.

The atomic write and the id guard are the two cases worth defending. Both fail quietly: a
half-written file is only noticed when a layout refuses to open days later, and an unguarded id is
only noticed when something outside the data directory gets overwritten.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.schemas.document import MoGongDocument
from app.services.storage import (
    InvalidLayoutIdError,
    LayoutNotFoundError,
    LayoutRepository,
    StorageError,
)
from tests.helpers import make_document, make_element


@pytest.fixture
def repo(tmp_path: Path) -> LayoutRepository:
    return LayoutRepository(tmp_path / "layouts")


@pytest.fixture
def document() -> MoGongDocument:
    return make_document(
        [
            make_element("e_01", 0, 0, 1440, 72, name="Header", note="Sticky top bar"),
            make_element("e_02", 0, 72, 1440, 828, name="Body"),
        ]
    )


class TestRoundTrip:
    def test_saved_document_loads_back_identical(self, repo: LayoutRepository, document) -> None:
        repo.save(document)
        assert repo.load(document.meta.id) == document

    def test_overwrite_replaces_rather_than_merges(self, repo: LayoutRepository, document) -> None:
        repo.save(document)
        modified = document.model_copy(
            update={"elements": [make_element("e_01", 0, 0, 1440, 72, name="Header")]}
        )
        repo.save(modified)
        assert len(repo.load(modified.meta.id).elements) == 1

    def test_file_carries_the_document_suffix(self, repo: LayoutRepository, document) -> None:
        path = repo.save(document)
        assert path.name == "test-layout.mogong.json"
        # Stored as readable JSON, because a user should be able to open their own work in an
        # editor and understand what they drew.
        assert json.loads(path.read_text(encoding="utf-8"))["format"] == "mogong.document"

    def test_chinese_notes_survive_a_round_trip(self, repo: LayoutRepository, document) -> None:
        # Notes are where the user writes intent, and they will write it in Chinese. This is test
        # data, not an identifier or a comment, so it is written literally: if a note were escaped
        # to \uXXXX or mangled by an encoding guess, the field carrying the most meaning is the one
        # that would break.
        note_text = "导航栏需要吸顶，滚动时不要消失"
        with_note = document.model_copy(
            update={
                "elements": [make_element("e_01", 0, 0, 100, 50, name="Header", note=note_text)]
            }
        )
        path = repo.save(with_note)
        assert note_text in path.read_text(encoding="utf-8")
        assert repo.load(with_note.meta.id).elements[0].note == note_text


class TestListing:
    def test_empty_repository_lists_nothing(self, repo: LayoutRepository) -> None:
        assert repo.list_ids() == []

    def test_ids_are_sorted_and_stripped_of_the_suffix(
        self, repo: LayoutRepository, document
    ) -> None:
        repo.save(document)
        renamed = document.meta.model_copy(update={"id": "alpha"})
        repo.save(document.model_copy(update={"meta": renamed}))
        assert repo.list_ids() == ["alpha", "test-layout"]

    def test_foreign_files_in_the_directory_are_ignored(self, repo: LayoutRepository) -> None:
        (repo.root / "notes.txt").write_text("unrelated", encoding="utf-8")
        (repo.root / "other.json").write_text("{}", encoding="utf-8")
        assert repo.list_ids() == []


class TestIdGuard:
    @pytest.mark.parametrize(
        "bad_id",
        ["", "../escape", "..", "a/b", "with space", ".hidden", "-lead", "x" * 70, "a\\b"],
    )
    def test_ids_that_could_escape_the_directory_are_refused(
        self, repo: LayoutRepository, bad_id: str
    ) -> None:
        # The repository is reachable from an HTTP path parameter. Rejecting before any filesystem
        # access means the guard does not depend on the caller having validated.
        with pytest.raises(InvalidLayoutIdError):
            repo.path_for(bad_id)

    def test_ordinary_ids_are_accepted(self, repo: LayoutRepository) -> None:
        for good in ("home", "home-page", "home_page", "v2.1", "ABC123"):
            assert repo.path_for(good).name.endswith(".mogong.json")


class TestFailureModes:
    def test_loading_a_missing_layout_raises_not_found(self, repo: LayoutRepository) -> None:
        with pytest.raises(LayoutNotFoundError):
            repo.load("nope")

    def test_deleting_a_missing_layout_raises_not_found(self, repo: LayoutRepository) -> None:
        with pytest.raises(LayoutNotFoundError):
            repo.delete("nope")

    def test_corrupt_json_is_reported_as_a_storage_error(self, repo: LayoutRepository) -> None:
        repo.root.joinpath("broken.mogong.json").write_text("{not json", encoding="utf-8")
        with pytest.raises(StorageError, match=r"malformed|could not read"):
            repo.load("broken")

    def test_schema_violation_is_reported_as_a_storage_error(self, repo: LayoutRepository) -> None:
        # A well-formed file that does not match the contract is the user's data, not a server bug,
        # so it must surface as a recoverable conflict rather than a crash.
        repo.root.joinpath("bad.mogong.json").write_text(
            json.dumps({"format": "mogong.document", "version": "1.0", "meta": {}}),
            encoding="utf-8",
        )
        with pytest.raises(StorageError, match="malformed"):
            repo.load("bad")

    def test_no_temp_file_is_left_behind_after_save(self, repo: LayoutRepository, document) -> None:
        repo.save(document)
        assert list(repo.root.glob("*.tmp")) == []

    def test_failed_save_does_not_destroy_the_previous_version(
        self, repo: LayoutRepository, document, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # The write-then-rename in save() exists for this. Truncating in place would leave an empty
        # file behind if serialization failed, so the guard is worth a test of its own.
        repo.save(document)
        original = repo.path_for(document.meta.id).read_text(encoding="utf-8")

        def explode(*_args: object, **_kwargs: object) -> str:
            raise RuntimeError("serialization failed")

        monkeypatch.setattr(MoGongDocument, "model_dump_json", explode)
        with pytest.raises(RuntimeError):
            repo.save(document)

        assert repo.path_for(document.meta.id).read_text(encoding="utf-8") == original


class TestCompiledOutput:
    def test_compiled_files_are_written_where_documents_are_not(
        self, repo: LayoutRepository, tmp_path: Path, document
    ) -> None:
        target_dir = tmp_path / "compiled"
        repo.save_compiled(document.meta.id, {"format": "mogong.layout"}, target_dir)
        written = target_dir / f"{document.meta.id}.layout.json"
        assert written.is_file()
        assert document.meta.id not in repo.list_ids()

    def test_parent_directory_is_created_on_demand(
        self, repo: LayoutRepository, tmp_path: Path
    ) -> None:
        target_dir = tmp_path / "deep" / "nested"
        repo.save_compiled("home", {}, target_dir)
        written = target_dir / "home.layout.json"
        assert written.is_file()
