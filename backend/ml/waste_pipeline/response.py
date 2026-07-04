"""Build unified `/classify_waste` JSON from ViT/core logits + aggregators."""

from __future__ import annotations

from typing import Any, Optional

from ml.waste_pipeline.canonical import is_pretrained_waste_head
from ml.waste_pipeline.categories import DISPLAY_LABEL, TRASHNET_STYLE_MATERIAL_CAVEAT, WASTE_KEYS
from ml.waste_pipeline.config import PipelineConfig, describe_pretrained_limitation
from ml.waste_pipeline.details import detail_strings, predicted_display_name, recyclable_for

# Stable key order for headline snapshot JSON (dashboard / export).
_SLIM_SIX_WAY_ORDER = ("glass", "metal", "mixed", "organic", "paper", "plastic")


def slim_waste_classifier_snapshot(snapshot: Optional[dict[str, Any]]) -> dict[str, Any]:
    """Compact, stable copy of the ViT headline state for ``waste_classifier_snapshot``."""
    if not snapshot:
        return {}
    if not isinstance(snapshot, dict):
        return {}
    if "error" in snapshot:
        return {"error": str(snapshot.get("error", ""))[:260]}
    slim: dict[str, Any] = {}
    for key in ("canonical_top", "model_id", "top_class_label", "top_class_score"):
        if key in snapshot:
            slim[key] = snapshot[key]
    raw_sw = snapshot.get("six_way_probs_pct")
    if isinstance(raw_sw, dict):
        slim["six_way_probs_pct"] = {
            k: round(float(raw_sw.get(k, 0.0)), 2) for k in _SLIM_SIX_WAY_ORDER
        }
    return slim


def build_waste_classifier_snapshot_from_core(
    core: dict[str, Any],
    config: PipelineConfig,
    *,
    top_class_label: str,
    top_class_score: float,
) -> dict[str, Any]:
    """Headline-aligned snapshot (ViT path) for API field ``waste_classifier_snapshot``."""
    six_pct = core.get("six_way_probs") or {}
    six_way_probs_pct = {k: round(float(six_pct.get(k, 0.0)), 2) for k in _SLIM_SIX_WAY_ORDER}
    return {
        "canonical_top": str(core.get("canonical_top") or ""),
        "model_id": config.model_id,
        "top_class_label": top_class_label,
        "top_class_score": float(top_class_score),
        "six_way_probs_pct": six_way_probs_pct,
    }


def finalize_research_payload(
    base_payload: dict[str, Any],
    *,
    safeguard: Optional[dict[str, Any]],
    waste_classifier_snapshot: Optional[dict[str, Any]],
) -> dict[str, Any]:
    """Attach safeguard + optional headline snapshot. No legacy comparison-model keys."""
    out = dict(base_payload)
    out["waste_classifier_snapshot"] = slim_waste_classifier_snapshot(waste_classifier_snapshot)

    if safeguard:
        out["safeguard"] = {
            "is_non_waste": safeguard["is_non_waste"],
            "signals": safeguard.get("signals", []),
            "top_class_label": safeguard.get("top_class_label"),
            "top_class_score": safeguard.get("top_class_score"),
        }

    if safeguard and safeguard.get("is_non_waste"):
        banner = safeguard.get("message") or (
            "Heuristic abstention — image cues do not resemble focused litter imagery; exploratory scores archived below."
        )
        out["research_waste_hypothesis"] = {
            "headline_was": base_payload["predicted_class"],
            "confidence_was_pct": base_payload["confidence"],
            "canonical_key": base_payload.get("canonical"),
            "provisional_probability_bars": base_payload.get("probs"),
            "provisional_category_probs_pct": base_payload.get("category_probabilities"),
        }
        out["predicted_class"] = "Non-waste image detected"
        out["confidence"] = 0.0
        out["category"] = "Not classified as litter"
        out["recyclable"] = False
        out["recyclable_label"] = "N/A"
        out["non_waste_detected"] = True
        out["safeguard_message"] = banner
        out["waste_type"] = "Not classified"
        out["material"] = "Not applicable"
        out["decomposition"] = "—"
        out["impact"] = "—"
        out["impact_tone"] = "med"
        out["disposal"] = "—"
        out["probs"] = []
        out["organic_review_recommended"] = False
        base_c = (base_payload.get("caveat") or "").strip()
        suf = (
            " Safeguard engaged: provisional waste probabilities are archived in `research_waste_hypothesis` for analysis."
        )
        out["caveat"] = (base_c + suf).strip()
    else:
        out["non_waste_detected"] = False
        if safeguard and safeguard.get("message"):
            out["safeguard_message"] = safeguard["message"]

    return out


def build_classify_response(
    core: dict[str, Any],
    config: PipelineConfig,
    *,
    num_labels: Optional[int] = None,
) -> dict[str, Any]:
    """
    core must contain: canonical_top, top_score (0–1), six_way_probs, prob_rows
    optional: raw_top_label (hf)
    """
    key = core["canonical_top"]
    top_score = float(core["top_score"])
    if top_score > 1.01:
        top_score = top_score / 100.0

    recyclable = recyclable_for(key)
    hint_label = str(core.get("raw_top_label") or "")
    material, decomposition, impact, impact_tone, disposal, category, waste_type = detail_strings(
        key, recyclable, hint=hint_label
    )
    display = predicted_display_name(key)

    headline_src = str(core.get("headline_source") or "vit")
    caveat_parts = []

    scene_type = str(core.get("scene_type") or "")
    scene_conf = float(core.get("scene_confidence") or 0.0)
    secondary_key = str(core.get("secondary_material") or "").strip().lower()
    secondary_label = DISPLAY_LABEL.get(secondary_key, secondary_key.title()) if secondary_key else ""

    if key == "mixed" and secondary_key and secondary_key in DISPLAY_LABEL and secondary_key != "mixed":
        caveat_parts.append(
            f"MIXED waste — strongest secondary material is {secondary_label}. "
            "Heterogeneous dumps cannot be assigned to a single recycling stream; sort at source "
            f"and route the {secondary_label.lower()} fraction separately."
        )

    if scene_type in ("single_item", "pile") and scene_conf >= 0.55:
        if scene_type == "single_item":
            caveat_parts.append(
                f"Scene analyzer: SINGLE ITEM → {DISPLAY_LABEL.get(key, key.title())} "
                f"({scene_conf * 100:.0f}% confident from object knowledge + visual cues)."
            )
        else:
            caveat_parts.append(
                f"Scene analyzer: PILE / DUMP of {DISPLAY_LABEL.get(key, key.title())} "
                f"({scene_conf * 100:.0f}% confident from pixel-level material cues)."
            )
        reasons = core.get("scene_reasons") or []
        if reasons:
            caveat_parts.append("Why: " + " • ".join(str(r) for r in reasons[:4]))
    elif core.get("fragment_cohesion_reason"):
        caveat_parts.append(str(core.get("fragment_cohesion_reason")))
    elif num_labels is not None and not is_pretrained_waste_head(num_labels):
        caveat_parts.append(
            "ImageNet-pretrained ViT maps global features into six provisional waste bins — "
            "fine-tune on TrashNet, TACO, or Meghalaya folders for production accuracy."
        )
    else:
        caveat_parts.append(TRASHNET_STYLE_MATERIAL_CAVEAT)

    lim_model = config.model_id
    lim = describe_pretrained_limitation(lim_model)
    if lim:
        caveat_parts.append(lim)

    scene_decisive = scene_type in ("single_item", "pile") and scene_conf >= 0.55
    if not scene_decisive and top_score < 0.52 and key in ("paper", "plastic", "metal", "glass"):
        caveat_parts.append(
            "Low confidence: unpackaged food may look like paper or plastic — confirm organic if appropriate."
        )

    if core.get("trashnet_organic_split_applied"):
        caveat_parts.append(
            "TrashNet-style model: there is no separate food/organic output class — part of the 'trash' logit is shown under Organic "
            f"({float(core.get('trashnet_organic_share') or 0) * 100:.0f}% of trash mass) as a display hint only. "
            "Saving images to dataset/ does not update weights until you run backend/scripts/train_waste_vit.py and set WASTE_MODEL_ID to your checkpoint "
            "(with an explicit organic/ folder for real organic logits)."
        )

    if core.get("plastic_yolo_prior_applied"):
        st = core.get("plastic_yolo_strength")
        nc = core.get("plastic_yolo_count")
        caveat_parts.append(
            "YOLOv8 detected bottle/cup-like objects (COCO) — plastic heap prior shifted the six-way bins toward **Plastic** "
            f"(strength {st if st is not None else '–'}, {nc if nc is not None else '?'} hits). "
            "For research-grade accuracy on your heaps, fine-tune ViT on `dataset/plastic/` (and other classes) then set `WASTE_MODEL_ID` to that checkpoint."
        )

    if core.get("organic_visual_override"):
        cue = core.get("organic_visual_cue")
        mix = core.get("organic_visual_mixed_scene")
        mix_note = f" Mixed-scene score {mix} was low (single-object / peel-like); cluttered piles suppress this boost." if mix is not None else ""
        caveat_parts.append(
            "Organic bins were boosted using peel/fruit chroma cues (yellow–green–brown masks) "
            f"because the base classifier leaned toward paper/plastic on bio-scrap imagery (visual cue {cue if cue is not None else '–'}).{mix_note} "
            "For official benchmarking, cite fine-tuned weights on dataset/organic/ with WASTE_MODEL_ID pointing to that checkpoint "
            "| set WASTE_ORGANIC_VISUAL=0 to disable this heuristic."
        )

    organic_review_recommended = (
        not scene_decisive
        and top_score < 0.52
        and key in ("paper", "plastic", "metal", "glass")
    )

    architecture = {
        "vit": "Vision Transformer (ViT)",
        "mobilenet_v2": "CNN — MobileNetV2",
        "efficientnet_b0": "CNN — EfficientNet-B0",
    }.get(config.backbone, "Vision Transformer (ViT)")

    model_display = f"{architecture} · {config.model_id}"

    probs_api = core.get("prob_rows") or [
        {"label": DISPLAY_LABEL[k], "pct": core["six_way_probs"].get(k, 0.0)} for k in WASTE_KEYS
    ]

    conf_pct = round(top_score * 100.0, 2)

    out_payload = {
        "predicted_class": display,
        "confidence": conf_pct,
        "category": category,
        "recyclable": recyclable,
        "waste_type": waste_type,
        "material": material,
        "recyclable_label": "Yes" if recyclable else "No",
        "decomposition": decomposition,
        "impact": impact,
        "impact_tone": impact_tone,
        "disposal": disposal,
        "model": model_display,
        "probs": sorted(probs_api, key=lambda x: -x["pct"]),
        "canonical": key,
        "caveat": " ".join(caveat_parts),
        "organic_review_recommended": organic_review_recommended,
        "pipeline_mode": "vit_only",
        "backbone": config.backbone,
        "architecture_label": architecture,
        "model_id": config.model_id,
        "category_probabilities": core.get("six_way_probs"),
        "datasets_supported": ["TrashNet", "TACO", "custom (Meghalaya)"],
        "headline_source": headline_src,
    }
    if core.get("fragment_cohesion_applied"):
        out_payload["fragment_cohesion_applied"] = True
        out_payload["fragment_cohesion"] = {
            "from_canonical": "mixed",
            "to_canonical": key,
            "detail": str(core.get("fragment_cohesion_reason") or ""),
        }
    if core.get("organic_visual_override"):
        out_payload["organic_visual_override"] = True
        if core.get("organic_visual_cue") is not None:
            out_payload["organic_visual_cue"] = core.get("organic_visual_cue")
    if core.get("plastic_yolo_prior_applied"):
        out_payload["plastic_yolo_prior_applied"] = True
        if core.get("plastic_yolo_strength") is not None:
            out_payload["plastic_yolo_strength"] = core.get("plastic_yolo_strength")
        if core.get("plastic_yolo_count") is not None:
            out_payload["plastic_yolo_count"] = core.get("plastic_yolo_count")
    if core.get("plastic_yolo_prior_skipped_glass"):
        out_payload["plastic_yolo_prior_skipped"] = "glass_cue_dominant"
    elif core.get("plastic_yolo_prior_skipped_metal"):
        out_payload["plastic_yolo_prior_skipped"] = "metal_cue_dominant"

    if core.get("scene_type"):
        out_payload["scene_type"] = core.get("scene_type")
        out_payload["scene_material"] = core.get("scene_material")
        if core.get("scene_confidence") is not None:
            out_payload["scene_confidence"] = core.get("scene_confidence")
        if core.get("scene_reasons"):
            out_payload["scene_reasons"] = list(core.get("scene_reasons") or [])

    # Secondary material — surfaced by scene_analyzer / fragment_cohesion when the
    # headline is mixed (or otherwise low-confidence) and a clear runner-up material
    # cue exists. The frontend can show "Mixed waste (Metal secondary)".
    sec = core.get("secondary_material")
    if sec and sec in WASTE_KEYS and sec != key:
        out_payload["secondary_material"] = sec
        out_payload["secondary_material_label"] = DISPLAY_LABEL[sec]
        if core.get("secondary_material_cue") is not None:
            out_payload["secondary_material_cue"] = core.get("secondary_material_cue")

    # Fragment-cohesion reasoning (when headline was "mixed").
    if core.get("fragment_cohesion_reason"):
        out_payload["fragment_cohesion_reason"] = core.get("fragment_cohesion_reason")
    if core.get("fragment_cohesion_applied"):
        out_payload["fragment_cohesion_applied"] = True
    if core.get("material_cues_raw"):
        out_payload["material_cues_raw"] = core.get("material_cues_raw")
    if core.get("scrap_signal") is not None:
        out_payload["scrap_signal"] = core.get("scrap_signal")
    if core.get("wrapper_score") is not None:
        out_payload["wrapper_score"] = core.get("wrapper_score")
    if core.get("natural_frac") is not None:
        out_payload["natural_frac"] = core.get("natural_frac")
    return out_payload
