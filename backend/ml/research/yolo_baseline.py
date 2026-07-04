"""
YOLOv8 baseline (Ultralytics): COCO-pretrained ``yolov8n.pt`` by default.

**Research use:** compare what's *detected in frame* versus ViT-derived global waste hypotheses.
Safeguards in ``non_waste_gate.py`` read top boxes (animals vs bottles).

Fine-tuning: swap ``YOLO_WEIGHTS`` for a custom ``.pt`` trained on Trash/TACO detections (
see Ultralytics docs: train on YAML dataset).

To disable (faster CPU): set env ``YOLO_ENABLED=false``.
"""

from __future__ import annotations

import os
from typing import Any, Optional

_yolo = None
_yolo_error: Optional[str] = None


def get_yolo_model():
    global _yolo, _yolo_error
    if _yolo_error is not None:
        raise RuntimeError(_yolo_error)
    if _yolo is not None:
        return _yolo
    try:
        from ultralytics import YOLO  # noqa: PLC0415
    except ImportError as exc:
        _yolo_error = f"Ultralytics not installed: {exc}"
        raise RuntimeError("pip install ultralytics") from exc
    weights = os.environ.get("YOLO_WEIGHTS", "yolov8n.pt").strip()
    try:
        _yolo = YOLO(weights)
        return _yolo
    except Exception as exc:
        _yolo_error = str(exc)[:240]
        raise RuntimeError(_yolo_error) from exc


def yolo_infer(pil_rgb) -> list[dict[str, Any]]:
    """Return detected instances sorted by confidence (top 15)."""
    if os.environ.get("YOLO_ENABLED", "true").lower() not in ("1", "true", "yes"):
        return []
    model = get_yolo_model()
    results = model.predict(pil_rgb, verbose=False)[0]
    nm = getattr(model, "names", None) or getattr(results, "names", None) or {}
    out: list[dict[str, Any]] = []
    if results.boxes is None or len(results.boxes) == 0:
        return out

    boxes = results.boxes
    coords = None
    try:
        # Ultralytics: boxes.xyxy is a Tensor of shape (N, 4)
        if hasattr(boxes, "xyxy") and boxes.xyxy is not None:
            coords = boxes.xyxy.detach().cpu().tolist()
    except Exception:
        coords = None
    for i in range(len(boxes)):
        cid = int(boxes.cls[i].item())
        conf = float(boxes.conf[i].item())
        if isinstance(nm, dict):
            name = nm.get(cid, nm.get(str(cid), str(cid)))
        elif isinstance(nm, (list, tuple)) and cid < len(nm):
            name = nm[cid]
        else:
            name = str(cid)
        entry: dict[str, Any] = {"class_name": name, "coco_id": cid, "confidence": round(conf, 4)}
        if coords is not None and i < len(coords):
            try:
                entry["xyxy"] = [float(v) for v in coords[i]]
            except (TypeError, ValueError):
                pass
        out.append(entry)
    out.sort(key=lambda z: z["confidence"], reverse=True)
    return out[:15]


def summarize_for_api(boxes: list[dict[str, Any]]) -> dict[str, Any]:
    return {"model": os.environ.get("YOLO_WEIGHTS", "yolov8n.pt"), "detections": boxes[:8]}
