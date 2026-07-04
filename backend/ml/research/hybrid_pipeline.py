"""
Orchestrate the research stack: ViT primary, YOLOv8 cues, safeguard pass.

Designed for Flask ``ml_server.py`` — keep each backend import-heavy section isolated so
students can benchmark or unplug models via environment flags.
"""

from __future__ import annotations

from typing import Any

from ml.research.non_waste_gate import assess_non_waste
from ml.research.yolo_baseline import summarize_for_api, yolo_infer
from ml.waste_pipeline.config import PipelineConfig
from ml.waste_pipeline.hf_classifier import classify_pil_hf, get_hf_pipeline
from ml.waste_pipeline.organic_visual_cue import apply_organic_visual_to_core
from ml.waste_pipeline.plastic_yolo_prior import apply_yolo_plastic_heap_prior
from ml.waste_pipeline.scene_analyzer import analyze_scene_and_decide
from ml.waste_pipeline.vit_inference import classify_pil_vit, get_vit_bundle, use_explicit_vit_runtime


def run_research_pipeline(
    pil_rgb,
    cfg: PipelineConfig,
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], Any]:
    """
    Returns (vit_core_without_meta, safeguard_dict, comparison_dict, num_labels_int_or_none).

    ``vit_core`` still contains ``canonical_top``, ``six_way_probs``, ``prob_rows`` for builders.
    """
    if use_explicit_vit_runtime(cfg):
        model, processor = get_vit_bundle(cfg)
        core = classify_pil_vit(model, processor, pil_rgb, top_k=50)
    else:
        pipe = get_hf_pipeline(cfg)
        core = classify_pil_hf(pipe, pil_rgb, top_k=36)

    imagenet_top_k = [(str(a), float(b)) for a, b in (core.pop("imagenet_top_k", []) or [])]
    num_labels = core.pop("num_labels", None)
    core.pop("hf_pretrained_probe", None)

    comparison: dict[str, Any] = {}
    det: list[dict[str, Any]] = []
    try:
        det = yolo_infer(pil_rgb)
        comparison["yolov8"] = summarize_for_api(det)
    except Exception as exc:
        comparison["yolov8"] = {"error": str(exc)[:260]}
        det = []

    apply_yolo_plastic_heap_prior(core, det, pil_rgb=pil_rgb)
    apply_organic_visual_to_core(core, pil_rgb, yolo_boxes=det)

    # Final knowledge layer: explicit single-item / pile decision (see scene_analyzer.py).
    analyze_scene_and_decide(core, pil_rgb, det, imagenet_top_k)

    safeguard = assess_non_waste(
        vit_waste_bins_max=float(core["top_score"]),
        six_probs_pct=dict(core["six_way_probs"]),
        imagenet_top_k=(
            imagenet_top_k[:12]
            if imagenet_top_k
            else [(str(core.get("raw_top_label", "")), max(1e-6, float(core.get("top_score", 0.0))))]
        ),
        yolo_boxes=det,
    )
    core["raw_top_label"] = imagenet_top_k[0][0] if imagenet_top_k else core.get("raw_top_label", "")
    return core, safeguard, comparison, num_labels
