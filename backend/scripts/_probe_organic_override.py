"""Probe: run the full /classify_waste pipeline on the food-waste smoketest
image and print every intermediate cue + threshold so we can see why
``apply_organic_visual_override_post_headline`` is not firing on the
banana-peel / watermelon / vegetable pile.

Usage (repo root):
    python backend/scripts/_probe_organic_override.py [optional image path]

Defaults to data/_smoketest_food_waste_crop.png which is the same kind of
food-waste pile the user reported as misclassified Metal 94%.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

# Resolve `ml` as backend/ml when run from repo root.
_BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

import numpy as np
from PIL import Image

from ml.research.hybrid_pipeline import run_research_pipeline
from ml.waste_pipeline.config import load_pipeline_config
from ml.waste_pipeline.fragment_cohesion import (
    apply_fragment_cohesion_if_mixed_dominant,
    apply_visual_evidence_override,
)
from ml.waste_pipeline.headline_policy import apply_headline_policy
from ml.waste_pipeline.material_cues import (
    glass_cue_score,
    metal_cue_score,
    paper_cue_score,
    plastic_cue_score,
    plastic_wrapper_score,
)
from ml.waste_pipeline.organic_visual_cue import (
    apply_organic_visual_override_post_headline,
    hue_chaos_score,
    mixed_landfill_scene_score,
    organic_cue_score_from_pixels,
    produce_cover_and_masks,
)


def _short(d):
    return json.dumps(d, indent=2, sort_keys=True, default=lambda x: float(x) if isinstance(x, np.floating) else str(x))


def probe(img_path: Path) -> None:
    print(f"\n=== Probing {img_path} ===")
    img = Image.open(img_path).convert("RGB")
    img.thumbnail((512, 512))

    cover, white_frac, py, gv, ro, _white_doc = produce_cover_and_masks(img)
    py_f = float(py.mean()) if py.size else 0.0
    gv_f = float(gv.mean()) if gv.size else 0.0
    ro_f = float(ro.mean()) if ro.size else 0.0
    components = int((py_f >= 0.025) + (gv_f >= 0.025) + (ro_f >= 0.025))
    cue_raw = organic_cue_score_from_pixels(img, raw_top_hint="")
    landfill = mixed_landfill_scene_score(img)
    chaos = hue_chaos_score(img)
    max_band = max(py_f, gv_f, ro_f)

    print("\n--- Pixel-level organic produce cues ---")
    print(
        _short(
            {
                "produce_cover": round(cover, 4),
                "peel_yellow_frac": round(py_f, 4),
                "green_veg_frac": round(gv_f, 4),
                "red_orange_frac": round(ro_f, 4),
                "produce_components_active": components,
                "max_single_band": round(max_band, 4),
                "organic_cue_raw": round(cue_raw, 4),
                "mixed_landfill_scene_score": round(landfill, 4),
                "hue_chaos_score": round(chaos, 4),
                "white_frac": round(white_frac, 4),
            }
        )
    )

    strong_peel = cue_raw >= 0.55 and cover >= 0.08 and max_band >= 0.04
    heavy_pile = cover >= 0.22 and components >= 2 and max_band >= 0.06
    multi_band_pile = components >= 3 and cover >= 0.16 and max_band >= 0.05
    print("\n--- Override fire predicates (need ANY) ---")
    print(
        _short(
            {
                "strong_peel": strong_peel,
                "heavy_pile": heavy_pile,
                "multi_band_pile": multi_band_pile,
                "any_fires": strong_peel or heavy_pile or multi_band_pile,
            }
        )
    )

    print("\n--- Material cues (headline veto thresholds) ---")
    metal = metal_cue_score(img)
    glass = glass_cue_score(img)
    plastic = plastic_cue_score(img)
    paper = paper_cue_score(img)
    print(
        _short(
            {
                "metal": {k: round(float(v), 4) for k, v in metal.items() if isinstance(v, (int, float))},
                "glass": {k: round(float(v), 4) for k, v in glass.items() if isinstance(v, (int, float))},
                "plastic": {k: round(float(v), 4) for k, v in plastic.items() if isinstance(v, (int, float))},
                "paper": {k: round(float(v), 4) for k, v in paper.items() if isinstance(v, (int, float))},
            }
        )
    )

    print("\n--- Full pipeline run ---")
    cfg = load_pipeline_config()
    core, safeguard, comparison, num_labels = run_research_pipeline(img, cfg)
    print("ViT core BEFORE headline_policy:")
    print(_short({"canonical_top": core.get("canonical_top"), "top_score": core.get("top_score"), "six": core.get("six_way_probs")}))

    core, num_labels, vit_snap = apply_headline_policy(core, comparison, num_labels_vit=num_labels)
    print("\nAFTER headline_policy (headline fields updated):")
    print(_short({"canonical_top": core.get("canonical_top"), "top_score": core.get("top_score"), "six": core.get("six_way_probs"), "raw_top_label": core.get("raw_top_label")}))

    apply_organic_visual_override_post_headline(core, img)
    print("\nAFTER organic_visual_override_post_headline:")
    print(
        _short(
            {
                "canonical_top": core.get("canonical_top"),
                "top_score": core.get("top_score"),
                "six": core.get("six_way_probs"),
                "organic_visual_override": core.get("organic_visual_override"),
                "organic_visual_override_rule": core.get("organic_visual_override_rule"),
                "organic_visual_override_from": core.get("organic_visual_override_from"),
                "organic_visual_cue": core.get("organic_visual_cue"),
                "organic_visual_produce_cover": core.get("organic_visual_produce_cover"),
                "fragment_cohesion_reason": core.get("fragment_cohesion_reason"),
            }
        )
    )

    apply_visual_evidence_override(img, core, comparison)
    apply_fragment_cohesion_if_mixed_dominant(img, core, comparison)
    print("\nFINAL after all overrides:")
    print(
        _short(
            {
                "canonical_top": core.get("canonical_top"),
                "top_score": core.get("top_score"),
                "six": core.get("six_way_probs"),
                "fragment_cohesion_reason": core.get("fragment_cohesion_reason"),
            }
        )
    )


if __name__ == "__main__":
    candidates = [
        Path(sys.argv[1]) if len(sys.argv) > 1 else None,
        _ROOT / "data" / "_smoketest_food_waste_crop.png",
    ]
    for c in candidates:
        if c is not None and c.exists():
            probe(c)
            break
    else:
        print("No probe image found; pass a path explicitly.")
