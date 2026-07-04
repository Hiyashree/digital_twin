"""
ViT/CNN inference only — no YOLO, scene rules, organic cues, or fragment-cohesion overrides.

Used by ``ml_server.classify_waste`` so dashboard probabilities stay the softmax-derived
six-way aggregation from the Hugging Face model (natural variation across bins).
"""

from __future__ import annotations

from typing import Any, Optional, Tuple

from ml.waste_pipeline.config import PipelineConfig
from ml.waste_pipeline.hf_classifier import classify_pil_hf, get_hf_pipeline
from ml.waste_pipeline.vit_inference import classify_pil_vit, get_vit_bundle, use_explicit_vit_runtime


def run_simple_waste_pipeline(
    pil_rgb,
    cfg: PipelineConfig,
) -> Tuple[dict[str, Any], Optional[int]]:
    """
    Run a single forward pass + ``six_way_from_resolved`` mapping.

    Returns ``(core, num_labels)`` where ``core`` matches what
    :func:`ml.waste_pipeline.response.build_classify_response` expects.
    """
    if use_explicit_vit_runtime(cfg):
        model, processor = get_vit_bundle(cfg)
        core = classify_pil_vit(model, processor, pil_rgb, top_k=50)
    else:
        pipe = get_hf_pipeline(cfg)
        core = classify_pil_hf(pipe, pil_rgb, top_k=36)

    num_labels = core.get("num_labels")
    if isinstance(num_labels, int):
        pass
    else:
        num_labels = None

    return core, num_labels
