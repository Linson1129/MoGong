"""FastAPI application entrypoint.

The backend is intentionally thin: file persistence and the compile engine. Roughly 90 percent of
MoGong's difficulty is frontend gesture work, and moving logic server-side for architectural
tidiness would only add a network round trip to per-frame interactions. See docs/architecture.md
section 5.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.core.config import get_settings
from app.routers import compile as compile_router
from app.routers import layouts as layouts_router
from app.services.storage import (
    InvalidLayoutIdError,
    LayoutNotFoundError,
    StorageError,
)

API_VERSION = "0.1.0"


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Create the data directories before serving, so the first save finds them ready."""
    settings = get_settings()
    settings.ensure_directories()
    app.state.settings = settings
    yield


app = FastAPI(
    title="MoGong API",
    description="Visual intent compiler: turns drawn layouts into agent-readable JSON.",
    version=API_VERSION,
    lifespan=lifespan,
)


# Exception mapping lives at the app level rather than inside each router handler. Routers raise
# domain errors and stay free of response-shaping, which keeps the compiler and storage layer
# usable from a CLI or a test without an HTTP context.
@app.exception_handler(LayoutNotFoundError)
async def _handle_not_found(request: Request, exc: LayoutNotFoundError) -> JSONResponse:
    return JSONResponse(status_code=404, content={"detail": f"layout {exc.args[0]!r} not found"})


@app.exception_handler(InvalidLayoutIdError)
async def _handle_bad_id(request: Request, exc: InvalidLayoutIdError) -> JSONResponse:
    return JSONResponse(status_code=400, content={"detail": str(exc)})


@app.exception_handler(StorageError)
async def _handle_storage(request: Request, exc: StorageError) -> JSONResponse:
    # 409 rather than 500: the request was well formed, the stored file is the problem, and the
    # user needs to hear that their saved layout is corrupt and not that the API broke.
    return JSONResponse(status_code=409, content={"detail": str(exc)})


app.include_router(layouts_router.router)
app.include_router(compile_router.router)


@app.get("/api/health")
def health() -> dict[str, str]:
    """Liveness probe. Checked first by the smoke test."""
    return {"status": "ok", "service": "mogong-backend", "version": API_VERSION}


def run() -> None:
    """Console entrypoint: ``python -m app.main`` or ``mogong-backend`` after install."""
    import uvicorn

    settings = get_settings()
    uvicorn.run("app.main:app", host=settings.host, port=settings.port, reload=True)


if __name__ == "__main__":
    run()
