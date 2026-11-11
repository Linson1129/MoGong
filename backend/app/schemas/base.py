"""Shared Pydantic base that speaks camelCase on the wire and snake_case in Python.

The JSON contract uses camelCase because that is the natural style of the TypeScript frontend and
of the agent that reads the compiled output. Python code stays idiomatic. Without one base class
enforcing this, every model would need its own alias set and the two sides would drift -- which
shows up as a field silently missing from the compiled JSON, the hardest kind of contract bug to
notice because nothing errors.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    """Base model: populate by field name, serialize by camelCase alias.

    Every model that crosses the HTTP boundary extends this, response wrappers included. The
    convention has to be universal to be useful: one snake_case response field is enough for the
    frontend to read ``undefined`` and render an empty panel with no error raised anywhere.

    ``extra="forbid"`` is set per subclass rather than here so that it stays a visible, deliberate
    choice at each boundary. An accepted-but-unknown key means the frontend and backend disagree
    about the contract, which is how a renamed field becomes silent data loss.
    """

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        # Serialization goes through aliases so model_dump produces the wire shape directly,
        # without every call site remembering to pass by_alias=True.
        serialize_by_alias=True,
    )
