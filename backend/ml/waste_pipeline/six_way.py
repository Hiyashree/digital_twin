"""
Aggregate raw (label, probability) pairs into the six waste API bins.

**Fine-tuning (TrashNet, TACO, custom Meghalaya folders):**
When you train a model with exactly six outputs (plastic/paper/organic/metal/glass/mixed),
`id2label` will match those classes — this mapping still works. For a six-class head you can
alternatively replace aggregation with a single softmax over six logits (see vit_inference.py).
"""

from __future__ import annotations

from typing import Any, Optional

from ml.waste_pipeline.canonical import aggregate_scores_to_six, is_pretrained_waste_head
from ml.waste_pipeline.categories import DISPLAY_LABEL, WASTE_KEYS


def six_way_from_resolved(
    resolved: list[tuple[str, float]],
    *,
    num_labels: Optional[int] = None,
    trashnet_trash_organic_share: float = 0.0,
) -> dict[str, Any]:
    """
    resolved: (human-readable class name, score) ordered by descending score.

    For TrashNet-style 6-class checkpoints (with a ``trash`` logit but no ``organic``),
    pass ``trashnet_trash_organic_share`` in (0,1] so part of the residual mass appears
    under Organic in the dashboard (heuristic only — real food/organic signal needs a fine-tuned head).
    """
    six_raw = aggregate_scores_to_six(
        resolved,
        trashnet_trash_organic_share=trashnet_trash_organic_share,
    )
    total = sum(six_raw.values()) or 1.0
    six_norm = {k: (six_raw[k] / total) for k in WASTE_KEYS}
    can = max(WASTE_KEYS, key=lambda k: six_norm[k])
    top_p = float(six_norm[can])

    prob_rows = [
        {"label": DISPLAY_LABEL[k], "pct": round(six_norm[k] * 100.0, 2)}
        for k in sorted(WASTE_KEYS, key=lambda x: -six_norm[x])
    ]

    out: dict[str, Any] = {
        "canonical_top": can,
        "top_score": top_p,
        "six_way_probs": {k: round(six_norm[k] * 100.0, 3) for k in WASTE_KEYS},
        "prob_rows": prob_rows,
        "raw_top_label": resolved[0][0] if resolved else "",
        "num_labels": num_labels,
        "hf_pretrained_probe": num_labels is not None and not is_pretrained_waste_head(num_labels),
    }
    if trashnet_trash_organic_share > 0:
        out["trashnet_organic_split_applied"] = True
        out["trashnet_organic_share"] = round(trashnet_trash_organic_share, 4)
    return out
