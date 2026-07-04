"""Six supported waste categories + display strings for API JSON."""

from typing import Final

WASTE_KEYS: Final[tuple[str, ...]] = (
    "plastic",
    "paper",
    "organic",
    "metal",
    "glass",
    "mixed",
)

DISPLAY_LABEL: Final[dict[str, str]] = {
    "plastic": "Plastic Waste",
    "paper": "Paper Waste",
    "organic": "Organic/Food Waste",
    "metal": "Metal Waste",
    "glass": "Glass Waste",
    "mixed": "Mixed Waste",
}

# Legacy / TrashNet-style label mapping inputs
TRASHNET_STYLE_MATERIAL_CAVEAT = (
    "Pretrained material-class models often confuse unpackaged food with paper or plastic. "
    "Confirm labels via the training queue; fine-tune on organic / Meghalaya imagery for production."
)
