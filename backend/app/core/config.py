"""Runtime configuration.

Values come from environment variables with local-development defaults, because MoGong is a
single-user tool that should start with zero setup. There is no settings file: two knobs would
make one another config source, and the risk of them disagreeing outweighs the convenience.
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

# Resolved relative to this file rather than the process working directory, so the backend finds
# its data whether it is started from the repo root, from backend/, or by a test runner.
# config.py sits at <repo>/backend/app/core/, so the project root is three levels up.
REPO_ROOT = Path(__file__).resolve().parents[3]

DEFAULT_HOST = "127.0.0.1"
# 8100 instead of the conventional 8000: that port is claimed by a lot of local tooling, and a
# collision at startup is a confusing first experience for someone who just cloned the repo.
DEFAULT_PORT = 8100


class Settings:
    """Immutable snapshot of process configuration."""

    def __init__(self) -> None:
        self.host: str = os.getenv("MOGONG_HOST", DEFAULT_HOST)
        self.port: int = int(os.getenv("MOGONG_PORT", str(DEFAULT_PORT)))

        default_layouts = REPO_ROOT / "data" / "layouts"
        default_compiled = REPO_ROOT / "data" / "compiled"
        self.layouts_dir: Path = Path(os.getenv("MOGONG_LAYOUTS_DIR", str(default_layouts)))
        self.compiled_dir: Path = Path(os.getenv("MOGONG_COMPILED_DIR", str(default_compiled)))

        # Binds to localhost only by default. A layout tool has no authentication and no reason to
        # be reachable from a network.
        self.allow_remote_bind: bool = os.getenv("MOGONG_ALLOW_REMOTE_BIND", "0") == "1"
        if self.allow_remote_bind:
            self.host = "0.0.0.0"

    def ensure_directories(self) -> None:
        """Create the data directories on startup.

        Idempotent and cheap. Doing it here rather than in the storage layer keeps file I/O out of
        the code that is supposed to stay pure, and means a missing directory is a startup concern
        instead of a failure that surfaces mid-request on the first save.
        """
        self.layouts_dir.mkdir(parents=True, exist_ok=True)
        self.compiled_dir.mkdir(parents=True, exist_ok=True)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Process-wide settings singleton.

    Cached, but tests should not rely on clearing the cache: they pass an explicit directory into
    the storage constructor instead, which keeps a test run from writing into the real data folder.
    """
    return Settings()
