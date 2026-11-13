"""Human-readable rendering of pydantic validation failures.

One place on purpose. Two transports reject a bad document: the HTTP API (``app/main.py``) and the
browser-side CPython build (the bootstrap assembled by ``scripts/stage_wasm.py``, which imports this
module out of ``mogong-app.zip``). Both run the same schema, so both must say the same sentence --
otherwise "the compiler has one source of truth" is true of the geometry and false of the errors,
and the difference is something the user has to be told about.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any


def format_validation_error(errors: Iterable[Mapping[str, Any]]) -> str:
    """Flatten pydantic's per-field error list into one sentence a client can show as-is.

    FastAPI hands the browser a list of objects, which reads as nothing to a UI that expects a
    string; the first finding is the one worth naming, and the count of the rest keeps the message
    honest about how much it is hiding.

    ``loc`` is joined with dots and the ``body`` prefix is dropped so the text names a document path
    (``elements.0.margin``) rather than an HTTP detail. The browser-side call has no prefix to drop,
    which is exactly why the same function serves both.
    """
    items = list(errors)
    first = items[0] if items else {}
    field = ".".join(str(part) for part in first.get("loc", ()) if part != "body")
    message = str(first.get("msg", "invalid request"))
    detail = f"{field}: {message}" if field else message
    if len(items) > 1:
        detail += f" (and {len(items) - 1} more)"
    return detail
