"""
Lightweight waste hints for cloud hosts (Render free/starter ~512MB).

Uses PIL + NumPy colour cues only — no PyTorch / Hugging Face. Good enough for demos on
GitHub Pages + Render; use local ``ml_server.py`` with ViT for research-grade inference.
"""

from __future__ import annotations

from typing import Any, Optional, Tuple

import numpy as np

from ml.waste_pipeline.categories import DISPLAY_LABEL, WASTE_KEYS
from ml.waste_pipeline.six_way import six_way_from_resolved


def _rgb_scores(img) -> dict[str, float]:
    arr = np.asarray(img.convert("RGB"), dtype=np.float32) / 255.0
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    maxc = np.maximum(np.maximum(r, g), b)
    minc = np.minimum(np.minimum(r, g), b)
    delta = maxc - minc
    sat = np.where(maxc > 0.02, delta / (maxc + 1e-6), 0.0)
    val = maxc

    green = (g > r + 0.04) & (g > b + 0.04) & (sat > 0.12)
    yellow = (r > 0.42) & (g > 0.32) & (b < 0.38) & (sat > 0.18)
    brown = (r > 0.22) & (g > 0.12) & (b < 0.22) & (r >= g) & (sat > 0.12)
    white = (sat < 0.14) & (val > 0.62)
    gray = (sat < 0.18) & (val > 0.22) & (val < 0.62)
    metal = (sat < 0.22) & (val > 0.35) & (np.abs(r - g) < 0.07) & (np.abs(g - b) < 0.09)
    glass = (b > r + 0.06) & (b > g) & (sat > 0.08) & (val > 0.18)
    plastic = (sat > 0.32) & (val > 0.3) & ~green & ~yellow

    return {
        "organic": float(green.mean() + yellow.mean() * 1.25 + brown.mean() * 1.1) + 0.04,
        "paper": float(white.mean() * 1.35 + gray.mean() * 0.45) + 0.03,
        "metal": float(metal.mean() * 1.5) + 0.02,
        "glass": float(glass.mean() * 1.35) + 0.02,
        "plastic": float(plastic.mean() * 1.15) + 0.03,
        "mixed": 0.06,
    }


def classify_pil_lite(img) -> Tuple[dict[str, Any], Optional[int]]:
    """Return ``(core, num_labels)`` compatible with ``build_classify_response``."""
    scores = _rgb_scores(img)
    total = sum(scores.values()) or 1.0
    ranked = sorted(
        ((DISPLAY_LABEL[k], scores[k] / total) for k in WASTE_KEYS),
        key=lambda x: -x[1],
    )
    core = six_way_from_resolved(ranked, num_labels=6)
    core["headline_source"] = "cloud_lite"
    core["cloud_lite"] = True
    core["raw_top_label"] = f"colour_cue:{core['canonical_top']}"
    return core, 6
