#!/usr/bin/env python3
"""
Fine-tune Vision Transformer (ViT) for waste classification — college / research friendly.

Base model: google/vit-base-patch16-224 (Hugging Face).

What fine-tuning does (short):
  • We keep most of the ViT backbone (pretrained on ImageNet) and **replace the last
    classification layer** with `num_labels` outputs (one per folder: plastic, metal, …).
  • Training images are resized/normalized by the ViT image processor; the model is trained
    with cross-entropy against your folder names as labels.
  • After a few epochs, predictions align with **your** waste categories instead of ImageNet.

How to add images:
  • Put files under `dataset/<class_name>/`. Class names = folder names (see dataset/README.md).

How retraining helps:
  • More Meghalaya (or other) photos per class usually improve validation accuracy and reduce
    confusion between similar materials (e.g. paper vs plastic).

Usage (from repo root):
  python backend/scripts/train_waste_vit.py --data_dir dataset --output_dir checkpoints/waste-vit-finetuned

If folders exist but contain no photos yet, smoke-test the stack with synthetic JPEGs only (not realistic waste):
  python backend/scripts/train_waste_vit.py --bootstrap_synthetic_per_class 12

Requires: pip install -r requirements.txt  (includes datasets, evaluate, scikit-learn, matplotlib)
"""

from __future__ import annotations

import argparse
import json
import os
import time
from pathlib import Path

import numpy as np
import torch
from PIL import ImageFile

ImageFile.LOAD_TRUNCATED_IMAGES = True

MODEL_NAME = "google/vit-base-patch16-224"

_IMG_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif", ".tif", ".tiff"}

# Default folder names when --data_dir is empty of class subdirs (matches dataset/README.md)
_DEFAULT_CLASS_DIRS = ("plastic", "metal", "paper", "glass", "organic", "mixed")


def _scan_local_images(data_root: Path) -> tuple[int, dict[str, int], list[str], int]:
    """Count image files, extension histogram, direct subdirs, files directly under root."""
    by_ext: dict[str, int] = {}
    n = 0
    root_level_images = 0
    for p in data_root.rglob("*"):
        if not p.is_file():
            continue
        ext = p.suffix.lower()
        if ext not in _IMG_EXTS:
            continue
        n += 1
        by_ext[ext] = by_ext.get(ext, 0) + 1
        try:
            if p.parent == data_root:
                root_level_images += 1
        except OSError:
            pass
    subdirs = sorted(p.name for p in data_root.iterdir() if p.is_dir())
    return n, by_ext, subdirs, root_level_images


def _bootstrap_synthetic_jpegs(data_root: Path, per_class: int, seed: int) -> tuple[int, list[Path]]:
    """Write synth_*.jpg into each class subfolder so ImageFolder training can run."""
    from PIL import Image

    class_dirs = sorted(p for p in data_root.iterdir() if p.is_dir() and not p.name.startswith("."))
    if not class_dirs:
        for name in _DEFAULT_CLASS_DIRS:
            d = data_root / name
            d.mkdir(parents=True, exist_ok=True)
            class_dirs.append(d)
        class_dirs.sort(key=lambda x: x.name)

    rng = np.random.default_rng(seed)
    written: list[Path] = []
    for folder in class_dirs:
        for i in range(per_class):
            rgb = rng.integers(0, 256, size=(224, 224, 3), dtype=np.uint8)
            img = Image.fromarray(rgb, mode="RGB")
            out_path = folder / f"synth_{seed}_{i:03d}.jpg"
            img.save(out_path, quality=88)
            written.append(out_path)
    print(
        "Bootstrap:",
        len(written),
        "synthetic JPEGs written under",
        str(data_root),
        "(sanity-check only - add real labelled photos for meaningful results).",
    )
    return len(written), class_dirs


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Fine-tune ViT on folder-organized waste images")
    p.add_argument("--data_dir", type=str, default="dataset", help="Root with class subfolders")
    p.add_argument("--output_dir", type=str, default="checkpoints/waste-vit-finetuned")
    p.add_argument("--epochs", type=float, default=3.0)
    p.add_argument("--batch_size", type=int, default=8)
    p.add_argument("--learning_rate", type=float, default=5e-5)
    p.add_argument("--val_ratio", type=float, default=0.15, help="Validation fraction (stratified when possible)")
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--warmup_ratio", type=float, default=0.05)
    p.add_argument("--num_workers", type=int, default=0, help="0 is safest on Windows")
    p.add_argument(
        "--bootstrap_synthetic_per_class",
        type=int,
        default=0,
        metavar="N",
        help="If no images exist yet: create N random JPEGs per class folder (sanity-check only; replace with real waste photos)",
    )
    return p.parse_args()


def _collate_fn(batch: list[dict]) -> dict[str, torch.Tensor]:
    pixel_values = torch.stack([torch.tensor(x["pixel_values"], dtype=torch.float32) for x in batch])
    labels = torch.tensor([x["labels"] for x in batch], dtype=torch.long)
    return {"pixel_values": pixel_values, "labels": labels}


def main() -> None:
    args = _parse_args()
    data_root = Path(args.data_dir).resolve()
    out_root = Path(args.output_dir).resolve()
    out_root.mkdir(parents=True, exist_ok=True)

    if not data_root.is_dir():
        raise SystemExit(f"Missing data folder: {data_root}. See dataset/README.md for layout.")

    img_n, img_by_ext, subdirs, root_imgs = _scan_local_images(data_root)
    if img_n == 0:
        if int(args.bootstrap_synthetic_per_class) > 0:
            n = int(args.bootstrap_synthetic_per_class)
            _bootstrap_synthetic_jpegs(data_root, n, args.seed)
            img_n, img_by_ext, subdirs, root_imgs = _scan_local_images(data_root)
            if img_n == 0:
                raise SystemExit("Bootstrap wrote no images; check permissions for --data_dir.")
        else:
            raise SystemExit(
                "No image files found under --data_dir.\n"
                f"  Path checked: {data_root}\n"
                "  Add photos under subfolders like dataset/plastic/, dataset/paper/, ... "
                "(see dataset/README.md). Example extensions: .jpg .png .webp\n"
                "  `.gitkeep` alone does not count - you need actual image files for training.\n"
                "  Or run once with: --bootstrap_synthetic_per_class 12  (random noise, pipeline test only)"
            )

    from datasets import load_dataset
    from datasets.data_files import EmptyDatasetError
    from sklearn.metrics import classification_report, confusion_matrix
    from transformers import (
        AutoImageProcessor,
        AutoModelForImageClassification,
        Trainer,
        TrainingArguments,
    )
    try:
        import evaluate
    except ImportError as exc:
        raise SystemExit(f"pip install evaluate  ({exc})") from exc

    # -------------------------------------------------------------------------
    # 1) Load images from dataset/<class>/* (ImageFolder)
    # Future Meghalaya expansion: add folders or duplicate images — class list is automatic.
    # -------------------------------------------------------------------------
    try:
        raw = load_dataset("imagefolder", data_dir=str(data_root), split="train")
    except EmptyDatasetError as exc:
        raise SystemExit(
            "Hugging Face could not find any loadable images in this folder layout.\n"
            f"  data_dir={data_root}\n"
            "  Put images in class subfolders (not only the root). See dataset/README.md."
        ) from exc
    feats = raw.features["label"]
    class_names: list[str] = list(feats.names)
    num_labels = len(class_names)
    if num_labels < 2:
        raise SystemExit("Need at least 2 class subfolders under --data_dir.")

    id2label = {i: n for i, n in enumerate(class_names)}
    label2id = {n: i for i, n in id2label.items()}
    print("Classes (order from dataset):", class_names)

    split_kw = dict(test_size=float(args.val_ratio), seed=args.seed, shuffle=True)
    try:
        sp = raw.train_test_split(**split_kw, stratify_by_column="label")
        train_ds, val_ds = sp["train"], sp["test"]
    except Exception as ex:
        print("WARNING: stratified split unavailable:", ex, "— using random split.")
        sp = raw.train_test_split(**split_kw)
        train_ds, val_ds = sp["train"], sp["test"]

    processor = AutoImageProcessor.from_pretrained(MODEL_NAME)

    # Per-sample transform: fixed-size tensors for ViT
    def _transform(example: dict) -> dict:
        rgb = example["image"].convert("RGB")
        enc = processor(images=rgb, return_tensors="pt")
        return {"pixel_values": enc["pixel_values"].squeeze(0).numpy(), "labels": example["label"]}

    train_ds.set_transform(_transform)
    val_ds.set_transform(_transform)

    model = AutoModelForImageClassification.from_pretrained(
        MODEL_NAME,
        num_labels=num_labels,
        id2label={str(k): v for k, v in id2label.items()},
        label2id=label2id,
        ignore_mismatched_sizes=True,
    )

    accuracy_metric = evaluate.load("accuracy")

    def compute_metrics(eval_pred):
        logits, labels = eval_pred
        preds = np.argmax(logits, axis=-1)
        acc = accuracy_metric.compute(predictions=preds, references=labels)
        return {"accuracy": float(acc["accuracy"])}

    use_cuda = torch.cuda.is_available()
    targs = TrainingArguments(
        output_dir=str(out_root),
        overwrite_output_dir=True,
        num_train_epochs=float(args.epochs),
        per_device_train_batch_size=int(args.batch_size),
        per_device_eval_batch_size=int(args.batch_size),
        learning_rate=float(args.learning_rate),
        warmup_ratio=float(args.warmup_ratio),
        lr_scheduler_type="cosine",
        eval_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model="accuracy",
        greater_is_better=True,
        logging_steps=max(10, len(train_ds) // max(args.batch_size * 10, 1) + 1),
        save_total_limit=2,
        seed=args.seed,
        fp16=use_cuda,
        dataloader_num_workers=args.num_workers,
        remove_unused_columns=False,
        report_to=[],
    )

    trainer = Trainer(
        model=model,
        args=targs,
        train_dataset=train_ds,
        eval_dataset=val_ds,
        compute_metrics=compute_metrics,
        data_collator=_collate_fn,
    )

    trainer.train()

    # -------------------------------------------------------------------------
    # Final evaluation + confusion matrix + classification report on validation set
    # -------------------------------------------------------------------------
    preds_output = trainer.predict(val_ds)
    logits = preds_output.predictions
    labels_true = preds_output.label_ids
    preds = np.argmax(logits, axis=-1)

    cm = confusion_matrix(labels_true, preds, labels=list(range(num_labels)))
    cm_path = out_root / "confusion_matrix.csv"
    header = "," + ",".join(class_names)
    rows = [header]
    for i, row_name in enumerate(class_names):
        rows.append(row_name + "," + ",".join(str(int(x)) for x in cm[i]))
    cm_path.write_text("\n".join(rows), encoding="utf-8")
    print("Wrote:", cm_path)

    try:
        import matplotlib.pyplot as plt

        fig, ax = plt.subplots(figsize=(8, 6))
        im = ax.imshow(cm, interpolation="nearest")
        ax.figure.colorbar(im, ax=ax)
        ax.set(xticks=np.arange(num_labels), yticks=np.arange(num_labels), xticklabels=class_names, yticklabels=class_names, ylabel="True", xlabel="Predicted", title="Validation confusion matrix")
        plt.setp(ax.get_xticklabels(), rotation=45, ha="right", rotation_mode="anchor")
        plt.tight_layout()
        fig_path = out_root / "confusion_matrix.png"
        fig.savefig(fig_path, dpi=120)
        plt.close(fig)
        print("Wrote:", fig_path)
    except Exception as ex:
        print("Matplotlib figure skipped:", ex)

    report = classification_report(
        labels_true,
        preds,
        target_names=class_names,
        digits=3,
        zero_division=0,
    )
    (out_root / "classification_report.txt").write_text(report, encoding="utf-8")
    print("Wrote:", out_root / "classification_report.txt")
    print(report)

    trainer.save_model(str(out_root))
    processor.save_pretrained(str(out_root))

    meta = {
        "model_name": MODEL_NAME,
        "classes": class_names,
        "train_size": len(train_ds),
        "val_size": len(val_ds),
        "val_accuracy": float((preds == labels_true).mean()) if len(labels_true) else None,
    }
    (out_root / "training_meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print("Saved model + processor to:", out_root)
    print("Inference: python backend/scripts/infer_waste_vit.py --model_dir", out_root, "--image path/to.jpg")


if __name__ == "__main__":
    main()