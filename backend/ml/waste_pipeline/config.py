"""
Environment-driven config for the waste pipeline (**ViT** via Hugging Face).

Training/fine-tune (TrashNet, TACO, Meghalaya): see ``ml/DATASETS.md``. Load checkpoints via ``WASTE_MODEL_ID``.

``WASTE_BACKBONE`` — when ``WASTE_MODEL_ID`` is unset, picks a default checkpoint per architecture:
  ``vit``, ``mobilenet_v2``, ``efficientnet_b0``

For **fine-tuned** six-class heads, set ``WASTE_MODEL_ID`` to your Hugging Face repo or local path.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Literal, Optional

BackboneId = Literal["vit", "mobilenet_v2", "efficientnet_b0"]

# Hugging Face checkpoints that load as `pipeline("image-classification", model=...)`.
# Pretrained on ImageNet unless you replace with a fine-tuned waste model.
DEFAULT_BACKBONE_MODELS: dict[str, str] = {
    "vit": "google/vit-base-patch16-224",
    "mobilenet_v2": "google/mobilenet_v2_1.0_224",
    "efficientnet_b0": "google/efficientnet-b0",
}


@dataclass(frozen=True)
class PipelineConfig:
    pipeline_mode: str  # always "hf" for API contract
    backbone: BackboneId
    model_id: str
    device: int  # -1 CPU


def _normalize_backbone(raw: str) -> BackboneId:
    s = (raw or "vit").strip().lower().replace("-", "_")
    aliases = {
        "vit": "vit",
        "vit_base": "vit",
        "mobilenet": "mobilenet_v2",
        "mobilenet_v2": "mobilenet_v2",
        "mobilenetv2": "mobilenet_v2",
        "efficientnet": "efficientnet_b0",
        "efficientnet_b0": "efficientnet_b0",
        "efficientnetb0": "efficientnet_b0",
    }
    key = aliases.get(s, s)
    if key not in DEFAULT_BACKBONE_MODELS:
        return "vit"
    return key  # type: ignore[return-value]


def load_pipeline_config() -> PipelineConfig:
    backbone = _normalize_backbone(os.environ.get("WASTE_BACKBONE", "vit"))
    explicit_id = (os.environ.get("WASTE_MODEL_ID") or "").strip()
    # Default ViT: google/vit-base-patch16-224 (ImageNet); replace with your fine-tuned checkpoint path.
    model_id = explicit_id or DEFAULT_BACKBONE_MODELS[backbone]

    device_s = os.environ.get("WASTE_DEVICE", "-1")
    try:
        device = int(device_s)
    except ValueError:
        device = -1

    return PipelineConfig(
        pipeline_mode="hf",
        backbone=backbone,
        model_id=model_id,
        device=device,
    )


def describe_pretrained_limitation(model_id: str) -> Optional[str]:
    """Remind operators when using ImageNet weights (not fine-tuned on waste)."""
    mids = {v.lower() for v in DEFAULT_BACKBONE_MODELS.values()}
    if model_id.lower() in mids:
        return (
            "Pretrained ImageNet backbone — not waste-specific until you fine-tune on TrashNet / TACO / "
            "Meghalaya folders (see backend/scripts/train_waste_vit.py), then set WASTE_MODEL_ID to your saved model."
        )
    return None
