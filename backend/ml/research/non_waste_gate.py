"""
Temporary safeguard for research demos: abstain when the scene is unlikely to depict waste/litter.

Uses **explainable cues** — not randomness:
  * ViT-derived ImageNet labels (pets, landscapes, coral reef…)
  * YOLOv8 COCO detections (prominent animals / persons with low ViT litter confidence)
  * Low max probability across the six provisional waste buckets + moderate label entropy.

After TrashNet/TACO/Meghalaya fine-tuning, tighten thresholds or train a lightweight binary ``waste vs not`` head.
"""

from __future__ import annotations

import math
from typing import Any, Iterable, Mapping, Sequence

# Strings matched as substrings inside ImageNet class names (lowercase comparison).
_NON_WASTE_IMNET_TRIGGERS: tuple[str, ...] = (
    "golden retriever",
    "labrador",
    "siberian husky",
    "tabby cat",
    "persian cat",
    "lion",
    "tiger cat",
    "tiger shark",
    "elephant",
    "african elephant",
    "american black bear",
    "brown bear",
    "polecat",
    "red fox",
    "alp",
    "geyser",
    "promontory",
    "sandbar",
    "seashore",
    "volcano",
    "valley",
    "lakeside",
    "coral reef",
    "spider monkey",
    "squirrel monkey",
    "goose",
    "flamingo",
    "american egret",
    "ostrich",
    "paddle",
)

# YOLO COCO class indices for common “probably not litter focus” cues (pets / farm / safari).
_NON_WASTE_COCO_IDS: frozenset[int] = frozenset(
    {0, 15, 16, 17, 18, 19, 20, 21, 22, 23}
)  # person, bird, cat, dog, horse, sheep, cow, elephant, bear, zebra

_WASTE_COCO_IDS: frozenset[int] = frozenset({39, 40, 41, 45, 46, 73})  # bottle, cup, knife, broccoli, donut, refrigerator

# If any of these appear in top ImageNet labels with enough mass, do **not** abstain as “non-waste”.
_WASTE_HINT_IMNET_SUBSTR: tuple[str, ...] = (
    "bottle",
    "plastic",
    "carton",
    "packet",
    "crate",
    "ashcan",
    "bucket",
    "can",
    "beer",
    "wine bottle",
    "cup",
    "paper towel",
    "toilet tissue",
    "carton",
)


def _waste_imagenet_hint(resolved_pairs: Sequence[tuple[str, float]], min_p: float = 0.055) -> bool:
    for lab, p in resolved_pairs[:6]:
        if float(p) < min_p:
            continue
        lt = lab.lower()
        if any(h in lt for h in _WASTE_HINT_IMNET_SUBSTR):
            return True
    return False


def _entropy(six_probs_pct: Mapping[str, float]) -> float:
    total = sum(max(0.0, float(six_probs_pct.get(k, 0))) / 100.0 for k in six_probs_pct)
    if total <= 1e-9:
        return 0.0
    h = 0.0
    for k in six_probs_pct:
        p = max(1e-12, float(six_probs_pct.get(k, 0)) / 100.0)
        h -= p * math.log(p + 1e-12)
    return h


def assess_non_waste(
    *,
    vit_waste_bins_max: float,
    six_probs_pct: Mapping[str, float],
    imagenet_top_k: Sequence[tuple[str, float]],
    yolo_boxes: Iterable[dict[str, Any]],
) -> dict[str, Any]:
    """
    Returns dict with is_non_waste, message, and signals[] for debugging the dashboard.

    Args:
      vit_waste_bins_max: max aggregated mass in provisional waste buckets (0–1).
      six_probs_pct: six keys → percent (sums may be ~100).
      imagenet_top_k: (label, prob) tuples from pretrained ViT (ImageNet).
      yolo_boxes: each {class_name, coco_id?, confidence}.
    """
    signals: list[str] = []

    triggered_imnet = ""
    trig_p = 0.0
    top_lab = imagenet_top_k[0][0] if imagenet_top_k else ""
    top_p_img = imagenet_top_k[0][1] if imagenet_top_k else 0.0
    lt = top_lab.lower()
    for trig in _NON_WASTE_IMNET_TRIGGERS:
        if trig in lt and float(top_p_img) >= 0.08:
            triggered_imnet = trig
            trig_p = float(top_p_img)
            signals.append(f"imagenet:{trig}:{top_p_img:.3f}")
            break

    yolo_sorted = sorted(
        yolo_boxes,
        key=lambda b: float(b.get("confidence", 0)),
        reverse=True,
    )
    dominant_coco: int | None = None
    dom_conf = 0.0
    if yolo_sorted:
        dom = yolo_sorted[0]
        raw_id = dom.get("coco_id")
        if raw_id is not None:
            try:
                dominant_coco = int(raw_id)
            except (TypeError, ValueError):
                dominant_coco = None
        if dominant_coco is not None:
            dom_conf = float(dom.get("confidence", 0))

    entropy_h = _entropy(six_probs_pct)

    animal_hit = dominant_coco in _NON_WASTE_COCO_IDS and dom_conf >= 0.42
    if animal_hit:
        signals.append(f"yolo_coco:{dominant_coco}:{dom_conf:.2f}")

    waste_hit_low = dominant_coco in _WASTE_COCO_IDS and dom_conf >= 0.35
    if waste_hit_low:
        signals.append("yolo:waste_related_object_boost")

    flat_bins = entropy_h >= 1.65 and vit_waste_bins_max < 0.24
    if flat_bins:
        signals.append(f"entropy:{entropy_h:.2f}")

    im_trigger = triggered_imnet and vit_waste_bins_max < 0.28 and trig_p >= 0.09
    yolo_anim = animal_hit and vit_waste_bins_max < 0.29 and not waste_hit_low
    uncertain = vit_waste_bins_max < 0.17 and entropy_h >= 1.55

    waste_imnet = _waste_imagenet_hint(imagenet_top_k)

    # Final decision: conservative — avoids spurious litter labels on clearly off-domain photos.
    is_non_waste = bool(im_trigger or yolo_anim or uncertain)
    if waste_imnet or waste_hit_low:
        is_non_waste = False

    banner = ""
    if is_non_waste:
        if im_trigger:
            banner = (
                "Non-waste image detected — top ImageNet cues suggest a neutral subject (animal, landscape…), "
                "not litter. Waste scores are exploratory only."
            )
        elif yolo_anim:
            banner = (
                "Non-waste image detected — YOLOv8 highlights dominant non-litter objects; "
                "refine with TrashNet/TACO fine-tuning for production."
            )
        else:
            banner = (
                "Non-waste / uncertain litter — provisional waste probabilities are diffuse. "
                "Upload a tighter crop of discarded material or capture more context."
            )

    return {
        "is_non_waste": is_non_waste,
        "message": banner,
        "signals": signals,
        "top_class_label": top_lab,
        "top_class_score": round(float(top_p_img), 4),
    }
