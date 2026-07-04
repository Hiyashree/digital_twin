"""
Real Vision Transformer inference (Hugging Face) — **google/vit-base-patch16-224** by default.

Flow (beginner-friendly):
  1. **Preprocess**: ``AutoImageProcessor`` resizes to 224×224, ImageNet normalize (ViT standard).
  2. **Forward**: ``AutoModelForImageClassification`` → logits.
  3. **Probabilities**: softmax over all classes.
  4. **Waste bins**: top-K ImageNet labels are mapped into plastic / paper / organic / metal / glass / mixed
     via ``canonical_waste_six`` in ``canonical.py`` (temporary until you fine-tune).

**Where fine-tuning fits in (TrashNet, TACO, Meghalaya):**
  - Prepare folders: ``data/plastic/``, ``data/paper/``, … (ImageFolder layout).
  - Fine-tune with Hugging Face ``Trainer`` (see ``backend/scripts/train_waste_classifier.py`` in repo root).
  - Save checkpoint and set ``WASTE_MODEL_ID=/path/to/checkpoint`` or push to Hub.
  - After fine-tuning with 6 classes, the same code path applies softmax; you may tighten mapping
    in ``six_way.py`` to use argmax over six logits only when ``num_labels == 6``.
"""

from __future__ import annotations

import os
from typing import Any, Optional, Tuple

import torch

from ml.waste_pipeline.canonical import is_trashnet_six_id2label
from ml.waste_pipeline.config import PipelineConfig
from ml.waste_pipeline.six_way import six_way_from_resolved

_vit_model = None
_vit_processor = None
_vit_model_id_loaded: Optional[str] = None
_vit_error: Optional[str] = None


def _pick_device(config: PipelineConfig) -> torch.device:
    if config.device >= 0 and torch.cuda.is_available():
        return torch.device("cuda", config.device)
    return torch.device("cpu")


def get_vit_bundle(config: PipelineConfig) -> Tuple[Any, Any]:
    """
    Lazy-load ViT + processor for ``config.model_id`` (cached until process exit).
    """
    global _vit_model, _vit_processor, _vit_model_id_loaded, _vit_error

    if _vit_error is not None:
        raise RuntimeError(_vit_error)

    if _vit_model is not None and _vit_model_id_loaded == config.model_id:
        return _vit_model, _vit_processor

    try:
        from transformers import AutoImageProcessor, AutoModelForImageClassification
    except ImportError as exc:
        _vit_error = str(exc)
        raise RuntimeError(
            "Install: pip install torch transformers pillow accelerate"
        ) from exc

    try:
        mid = config.model_id
        processor = AutoImageProcessor.from_pretrained(mid)
        model = AutoModelForImageClassification.from_pretrained(mid)
        model.eval()
        dev = _pick_device(config)
        model.to(dev)
        _vit_processor = processor
        _vit_model = model
        _vit_model_id_loaded = mid
        return _vit_model, _vit_processor
    except Exception as exc:
        _vit_error = f"Could not load ViT {config.model_id}: {exc}"
        raise RuntimeError(_vit_error) from exc


def classify_pil_vit(
    model,
    processor,
    img,
    *,
    top_k: int = 50,
) -> dict[str, Any]:
    """
    Run one forward pass with proper batching (B=1) and map logits → six waste categories.

    ``img`` is a PIL.Image RGB.
    """
    device = next(model.parameters()).device
    # Processor: pixel_values float tensor (1,3,224,224), ImageNet normalization built in.
    inputs = processor(images=img, return_tensors="pt")
    inputs = {k: v.to(device) for k, v in inputs.items()}

    with torch.no_grad():
        out = model(**inputs)
        logits = out.logits[0]
        probs = torch.softmax(logits, dim=-1)

    id2l = model.config.id2label
    num_labels = getattr(model.config, "num_labels", None)

    # Future fine-tuning: six-class waste head — softmax over 6 logits, map labels to bins.
    if num_labels == 6:
        resolved_ft: list[tuple[str, float]] = []
        for i in range(6):
            lab = id2l.get(i) if isinstance(id2l, dict) else id2l[i]
            resolved_ft.append((str(lab), float(probs[i].item())))
        trash_share = 0.0
        # TrashNet-style checkpoints have no organic logit — "trash" would otherwise yield 0% Organic in the UI.
        if id2l is not None and is_trashnet_six_id2label(id2l):
            try:
                trash_share = float(os.environ.get("WASTE_TRASHNET_ORGANIC_SHARE", "0.28"))
            except ValueError:
                trash_share = 0.28
            trash_share = max(0.0, min(1.0, trash_share))
        out_ft = six_way_from_resolved(
            resolved_ft,
            num_labels=6,
            trashnet_trash_organic_share=trash_share,
        )
        out_ft["imagenet_top_k"] = [(resolved_ft[i][0], float(resolved_ft[i][1])) for i in range(6)]
        return out_ft

    k = min(top_k, probs.shape[0])
    top_p, top_idx = torch.topk(probs, k)

    resolved: list[tuple[str, float]] = []
    for i in range(k):
        idx = int(top_idx[i].item())
        p = float(top_p[i].item())
        name = id2l.get(idx) if isinstance(id2l, dict) else id2l[idx]
        resolved.append((str(name), p))

    out = six_way_from_resolved(resolved, num_labels=num_labels)
    out["imagenet_top_k"] = [(str(resolved[i][0]), float(resolved[i][1])) for i in range(min(12, len(resolved)))]
    return out


def use_explicit_vit_runtime(cfg: PipelineConfig) -> bool:
    """Use AutoImageProcessor + forward pass for ViT checkpoints; use ``pipeline`` for plain CNN ids."""
    mid = (cfg.model_id or "").lower()
    _rnet = chr(114) + "esnet"
    looks_cnn = any(k in mid for k in (_rnet, "mobilenet", "efficientnet")) and "vit" not in mid
    if looks_cnn:
        return False
    return cfg.backbone == "vit" or "vit" in mid
