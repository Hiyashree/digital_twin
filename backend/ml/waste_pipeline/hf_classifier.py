"""Hugging Face image-classification backend with lazy loading."""

from __future__ import annotations

import threading
from typing import Any, Callable, Optional

from ml.waste_pipeline.config import PipelineConfig
from ml.waste_pipeline.six_way import six_way_from_resolved

_pipe = None
_pipe_error: Optional[str] = None
_lock = threading.Lock()


def get_hf_pipeline(config: PipelineConfig):
    global _pipe, _pipe_error
    if _pipe_error is not None:
        raise RuntimeError(_pipe_error)
    if _pipe is not None:
        return _pipe
    try:
        from transformers import pipeline
    except ImportError as exc:
        _pipe_error = str(exc)
        raise RuntimeError(
            "Install: pip install torch transformers pillow accelerate"
        ) from exc
    try:
        _pipe = pipeline(
            "image-classification",
            model=config.model_id,
            device=config.device,
        )
        return _pipe
    except Exception as exc:
        _pipe_error = f"Could not load model {config.model_id}: {exc}"
        raise RuntimeError(_pipe_error) from exc


def resolve_label(pipe, entry: dict) -> tuple[str, float]:
    """Resolve LABEL_0 style ids via model id2label."""
    id2label = getattr(pipe.model.config, "id2label", None)
    lab_raw = entry["label"]
    lab = str(lab_raw)
    score = float(entry["score"])
    name = lab
    if isinstance(id2label, dict):
        if lab in id2label or lab_raw in id2label:
            name = id2label.get(lab, id2label.get(lab_raw, lab))
        elif lab.startswith("LABEL_"):
            try:
                idx = int(lab.replace("LABEL_", ""))
                name = id2label.get(idx) or id2label.get(str(idx)) or lab
            except ValueError:
                name = lab
    return str(name), score


def classify_pil_hf(pipe, img, top_k: int = 24) -> dict[str, Any]:
    """Run HF pipeline (non-ViT backbones) and aggregate top-k labels into six waste categories."""
    raw_outputs = pipe(img, top_k=top_k)
    resolved = [resolve_label(pipe, o) for o in raw_outputs]
    num_labels = getattr(getattr(pipe.model, "config", None), "num_labels", None)
    out = six_way_from_resolved(resolved, num_labels=num_labels)
    out["imagenet_top_k"] = [(str(resolved[i][0]), float(resolved[i][1])) for i in range(min(12, len(resolved)))]
    return out


def warmup_hf(config: PipelineConfig, on_error: Optional[Callable[[str], None]] = None):
    """Optional background warmup for hf mode."""

    def _run():
        try:
            from PIL import Image

            with _lock:
                pipe = get_hf_pipeline(config)
                img = Image.new("RGB", (224, 224), (120, 110, 90))
                classify_pil_hf(pipe, img, top_k=8)
        except Exception as exc:
            if on_error:
                on_error(str(exc)[:500])

    threading.Thread(target=_run, daemon=True, name="waste-hf-warmup").start()


def hf_lock():
    return _lock
