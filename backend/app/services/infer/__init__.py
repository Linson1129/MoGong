"""Inference modules for the compiler pipeline.

Each module handles one aspect of deriving layout information from the geometric tree:
- layout_mode: row / column / stack / free arrangement
- roles: semantic meaning (navigation, button, text, etc.)
- spacing: gaps and alignment between siblings
- relative: pixel-to-percentage conversion
"""

from app.services.infer.layout_mode import infer_layout_modes_recursive
from app.services.infer.relative import convert_to_relative
from app.services.infer.roles import infer_roles_recursive
from app.services.infer.spacing import infer_spacing_and_alignment

__all__ = [
    "infer_layout_modes_recursive",
    "infer_roles_recursive",
    "infer_spacing_and_alignment",
    "convert_to_relative",
]
