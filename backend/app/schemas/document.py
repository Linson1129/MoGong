"""Document format schema: the editable source of truth for a MoGong layout.

Mirrors docs/json-schema.md section 1. This module is the contract: the frontend, the compiler
and the consuming agent all derive their expectations from these models, so a field change here
is a breaking change everywhere.

Documents store absolute pixels in a flat element list. The nesting tree exists only in the
compiled output -- see the rationale on ElementList below.
"""

from __future__ import annotations

import re
from datetime import datetime
from enum import Enum
from typing import Self

from pydantic import ConfigDict, Field, field_validator, model_validator

from app.schemas.base import CamelModel

HEX_COLOR_PATTERN = re.compile(r"^#[0-9A-F]{6}$")

# Geometry epsilon. Repeated here rather than imported from the geometry module so that schema
# validation stays dependency-free and usable from tests without pulling in compiler internals.
AREA_EPSILON = 1e-9


def _normalize_hex_color(value: str) -> str:
    """Uppercase and expand shorthand hex so every stored color has exactly one spelling."""
    raw = value.strip()
    if len(raw) == 4 and raw.startswith("#"):
        # Expand before validating: "#abc" is unambiguous input but an ambiguous storage format.
        raw = "#" + "".join(char * 2 for char in raw[1:])
    upper = raw.upper()
    if not HEX_COLOR_PATTERN.match(upper):
        raise ValueError(f"color must be a 6-digit hex value like #1E293B, got {value!r}")
    return upper


class BorderStyle(str, Enum):
    """Border style: solid marks a fixed region, dashed marks a collapsible one."""

    SOLID = "solid"
    DASHED = "dashed"


class Fill(CamelModel):
    """Rectangle paint. Separated from border because they are edited independently in the panel."""

    model_config = ConfigDict(extra="forbid")

    color: str = "#FFFFFF"
    opacity: float = Field(default=1.0, ge=0.0, le=1.0)

    @field_validator("color")
    @classmethod
    def _validate_color(cls, value: str) -> str:
        return _normalize_hex_color(value)


class Border(CamelModel):
    """Rectangle stroke.

    One authority each: ``width`` decides whether a border exists, ``style`` decides how it looks.
    The validator reconciles the two so that ``{width: 0, style: none}`` is the only spelling of
    "no border". Without that, the editor could store either of two representations for the same
    drawing and the compiler would have to guess which one the user meant -- guessing about a
    visible property is exactly the error this product is built to prevent.
    """

    model_config = ConfigDict(extra="forbid")

    width: float = Field(default=0.0, ge=0.0)
    # Solid is the default because a border with a positive width and no style is a user who asked
    # for a stroke and did not care which kind. "none" stays reachable as an explicit choice.
    style: BorderStyle = BorderStyle.SOLID
    color: str = "#000000"
    radius: float = Field(default=0.0, ge=0.0)

    @field_validator("color")
    @classmethod
    def _validate_color(cls, value: str) -> str:
        return _normalize_hex_color(value)

    @model_validator(mode="after")
    def _reconcile_width_and_style(self) -> Self:
        # A zero width means "no border", so the style carries no information; pinning it to
        # solid keeps one canonical spelling of the invisible state for the compiler to read.
        if self.width <= 0:
            self.style = BorderStyle.SOLID
        return self

    def is_visible(self) -> bool:
        return self.width > 0


class Element(CamelModel):
    """One drawn rectangle or icon stamp.

    Position is the top-left corner in canvas pixels. ``width`` and ``height`` are always
    non-negative: a reverse drag is normalized on write so no downstream consumer has to reason
    about inverted rectangles. See docs/dev-guide.md section 4, Geometry Rules.

    When ``stamp`` is true, the element represents an icon rather than a rectangular region.
    It is rendered as a circle and the note is displayed as a label.
    """

    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    name: str = ""
    x: float
    y: float
    width: float
    height: float
    fill: Fill = Field(default_factory=Fill)
    border: Border = Field(default_factory=Border)
    note: str | None = None
    locked: bool = False
    visible: bool = True
    stamp: bool = False

    @model_validator(mode="before")
    @classmethod
    def _normalize_inverted_rect(cls, data: object) -> object:
        """Fold a negative extent into an equivalent positive one by moving the origin.

        Handled in ``before`` because the values arrive together as a drag result; by the time
        field validators run, a negative width would already have been rejected.
        """
        if isinstance(data, dict):
            width = data.get("width")
            height = data.get("height")
            if isinstance(width, int | float) and width < 0:
                data["x"] = data.get("x", 0) + width
                data["width"] = -width
            if isinstance(height, int | float) and height < 0:
                data["y"] = data.get("y", 0) + height
                data["height"] = -height
        return data

    @model_validator(mode="after")
    def _reject_degenerate_rect(self) -> Self:
        # A zero-area rectangle carries no layout information and produces a divide-by-zero in
        # the percentage conversion, so it is refused at the boundary rather than guarded against
        # at every call site.
        if self.width <= AREA_EPSILON or self.height <= AREA_EPSILON:
            raise ValueError(
                f"element {self.id!r} must have positive width and height, "
                f"got {self.width} x {self.height}"
            )
        return self

    @property
    def right(self) -> float:
        return self.x + self.width

    @property
    def bottom(self) -> float:
        return self.y + self.height

    @property
    def area(self) -> float:
        return self.width * self.height


class CanvasConfig(CamelModel):
    """Fixed design frame. Web desktop only by product decision, see docs/spec.md section 3."""

    model_config = ConfigDict(extra="forbid")

    width: float = Field(default=1440.0, gt=0.0)
    height: float = Field(default=900.0, gt=0.0)
    background: str = "#FFFFFF"
    grid_size: float = Field(default=8.0, gt=0.0)
    snap_to_grid: bool = True

    @field_validator("background")
    @classmethod
    def _validate_background(cls, value: str) -> str:
        return _normalize_hex_color(value)


class Viewport(CamelModel):
    """Editor camera state. Persisted so reopening a layout restores the user's view.

    Deliberately excluded from compilation: the agent must not learn how far the user had zoomed in.
    """

    model_config = ConfigDict(extra="forbid")

    zoom: float = Field(default=1.0, gt=0.0, le=8.0)
    pan_x: float = 0.0
    pan_y: float = 0.0


class DocumentMeta(CamelModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    name: str = "untitled"
    created_at: datetime | None = None
    updated_at: datetime | None = None


class MoGongDocument(CamelModel):
    """Top-level document format, the on-disk shape of ``*.mogong.json``."""

    model_config = ConfigDict(extra="forbid")

    format: str = "mogong.document"
    version: str = "1.0"
    meta: DocumentMeta
    canvas: CanvasConfig = Field(default_factory=CanvasConfig)
    elements: list[Element] = Field(default_factory=list)
    viewport: Viewport = Field(default_factory=Viewport)

    @model_validator(mode="after")
    def _validate_unique_ids(self) -> Self:
        seen: set[str] = set()
        duplicates: list[str] = []
        for element in self.elements:
            if element.id in seen:
                duplicates.append(element.id)
            seen.add(element.id)
        if duplicates:
            raise ValueError(f"duplicate element ids: {', '.join(sorted(set(duplicates)))}")
        return self

    def get_element(self, element_id: str) -> Element | None:
        return next((element for element in self.elements if element.id == element_id), None)
