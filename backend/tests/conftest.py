"""Shared pytest fixtures.

Every fixture that touches disk points at ``tmp_path``, so no test can write into the real
``data/layouts`` directory. That isolation is not a nicety: a test leaking a fixture layout
would show up in the developer's own file picker and read as a bug in the app.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.deps import get_compiled_dir, get_repository
from app.main import app
from app.services.storage import LayoutRepository


@pytest.fixture
def repository(tmp_path: Path) -> LayoutRepository:
    return LayoutRepository(tmp_path / "layouts")


@pytest.fixture
def compiled_dir(tmp_path: Path) -> Path:
    return tmp_path / "compiled"


@pytest.fixture
def client(repository: LayoutRepository, compiled_dir: Path) -> Iterator[TestClient]:
    """Test client with both filesystem dependencies redirected to a temp directory."""
    app.dependency_overrides[get_repository] = lambda: repository
    app.dependency_overrides[get_compiled_dir] = lambda: compiled_dir
    # Entered as a context manager so the lifespan hook runs and the app reaches the same state
    # it would in development.
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
