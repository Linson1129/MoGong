"""Dependency wiring for FastAPI routes.

Held in one small module so tests can override the repository to point at a temp directory
without touching the real ``data/`` folder. That isolation is the whole reason the repository
takes its root as a constructor argument instead of reading settings itself.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from app.core.config import get_settings
from app.services.storage import LayoutRepository


@lru_cache(maxsize=1)
def _default_repository() -> LayoutRepository:
    return LayoutRepository(get_settings().layouts_dir)


def get_repository() -> LayoutRepository:
    """Provide the layout repository. Override with ``app.dependency_overrides`` in tests."""
    return _default_repository()


def get_compiled_dir() -> Path:
    """Provide the directory compiled artifacts are written to.

    A separate dependency from the repository because output is derived data: a test that only
    checks compilation can redirect it without involving persistence at all.
    """
    return get_settings().compiled_dir
