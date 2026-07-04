#!/usr/bin/env python3
"""
Run inference with a fine-tuned ViT waste classifier saved by ``train_waste_vit.py``.

The training script writes ``pytorch_model.bin`` (or ``model.safetensors``), ``config.json``,
and the image processor files into ``--model_dir``. This script loads them and prints the
predicted waste category plus **confidence scores** (softmax probabilities).

Fine-tuned models output one logit per folder you trained on; pretraining on ImageNet is
already “inside” the backbone — your saved head maps patches to **your** classes.

Adding new Meghalaya images: copy into ``dataset/<class>/``, retrain, then point ``--model_dir``
at the new ``--output_dir`` (or overwrite the same folder). More diverse local photos usually
raises validation accuracy.

Usage:
  python backend/scripts/infer_waste_vit.py --model_dir checkpoints/waste-vit-finetuned --image path/to/waste.jpg
  python backend/scripts/infer_waste_vit.py --model_dir checkpoints/waste-vit-finetuned --image a.jpg --top_k 3 --json
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import torch
from PIL import Image, ImageFile

ImageFile.LOAD_TRUNCATED_IMAGES = True


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="ViT waste classification inference (local checkpoint)")
    p.add_argument("--model_dir", type=str, required=True, help="Folder from train_waste_vit.py output")
    p.add_argument("--image", type=str, required=True, help="Path to an image file")
    p.add_argument("--top_k", type=int, default=6, help="How many top classes to show")
    p.add_argument("--json", action="store_true", help="Print one JSON object to stdout")
    return p.parse_args()


def _class_name(id2label: dict, idx: int) -> str:
    if not id2label:
        return str(idx)
    v = id2label.get(idx)
    if v is not None:
        return str(v)
    v = id2label.get(str(idx))
    if v is not None:
        return str(v)
    return str(idx)


def main() -> None:
    args = _parse_args()
    model_dir = Path(args.model_dir).resolve()
    img_path = Path(args.image).resolve()
    if not model_dir.is_dir():
        raise SystemExit(f"Not a directory: {model_dir}")
    if not img_path.is_file():
        raise SystemExit(
            "Image not found.\n"
            f"  Resolved path: {img_path}\n"
            "  Use a real path to your photo, e.g. --image C:\\Pictures\\waste_sample.jpg "
            '(not the placeholder "path/to/photo.jpg" from the README).'
        )

    from transformers import AutoImageProcessor, AutoModelForImageClassification

    processor = AutoImageProcessor.from_pretrained(str(model_dir))
    model = AutoModelForImageClassification.from_pretrained(str(model_dir))
    model.eval()

    id2label = dict(model.config.id2label) if model.config.id2label else {}

    pil = Image.open(img_path).convert("RGB")
    inputs = processor(images=pil, return_tensors="pt")

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model.to(device)
    inputs = {k: v.to(device) for k, v in inputs.items()}

    with torch.no_grad():
        logits = model(**inputs).logits
    probs = torch.softmax(logits[0], dim=-1)
    scores, indices = probs.sort(descending=True)
    top_k = max(1, min(int(args.top_k), probs.numel()))

    ranked = []
    for i in range(top_k):
        idx = int(indices[i].item())
        ranked.append({"label": _class_name(id2label, idx), "confidence": float(scores[i].item()), "class_index": idx})

    predicted = ranked[0]
    out = {
        "image": str(img_path),
        "model_dir": str(model_dir),
        "predicted_label": predicted["label"],
        "confidence": predicted["confidence"],
        "top_k": ranked,
    }

    if args.json:
        print(json.dumps(out, indent=2))
    else:
        print(f"predicted_label: {predicted['label']}")
        print(f"confidence:      {predicted['confidence']:.4f}")
        print("top_k:")
        for row in ranked:
            print(f"  {row['label']}: {row['confidence']:.4f}")


if __name__ == "__main__":
    main()
