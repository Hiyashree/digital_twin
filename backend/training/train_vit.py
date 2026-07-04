#!/usr/bin/env python3
"""
Train / fine-tune ViT on auto-discovered public waste datasets (config-driven).

Entry (from repo root: ``set PYTHONPATH=backend`` then ``python -m training.train_vit``, or ``cd backend`` then ``python -m training.train_vit``). Default config path is next to this file.

Matches existing repo stack: Hugging Face ``transformers`` + ``google/vit-base-patch16-224``.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import numpy as np
import torch
import yaml
from PIL import ImageFile

ImageFile.LOAD_TRUNCATED_IMAGES = True


def _load_config(path: Path) -> dict[str, Any]:
    if not path.is_file():
        raise SystemExit(f"Missing config: {path}\nCopy backend/training/config.example.yaml and edit.")
    with path.open(encoding="utf-8") as fh:
        return yaml.safe_load(fh)


def _resolve_paths(cfg: dict[str, Any], cwd: Path) -> dict[str, Path]:
    raw = cfg.get("paths") or {}
    root = cwd / Path(raw.get("data_root") or ".")

    def one(key: str, default_suffix: str) -> Path:
        v = raw.get(key)
        if v is None:
            return (root / default_suffix).resolve()
        p = Path(v)
        return (cwd / p).resolve() if not p.is_absolute() else p

    return {
        "trashnet": one("trashnet", "data/trashnet"),
        "taco": one("taco", "data/taco"),
        "taco_imagefolder": one("taco_imagefolder", "data/taco_imagefolder"),
        "kaggle_waste": one("kaggle_waste", "data/kaggle_waste"),
        "meghalaya_custom": one("meghalaya_custom", "data/meghalaya_custom"),
    }


def _collate_fn(batch: list[dict]) -> dict[str, torch.Tensor]:
    pixel_values = torch.stack([torch.tensor(x["pixel_values"], dtype=torch.float32) for x in batch])
    labels = torch.tensor([x["labels"] for x in batch], dtype=torch.long)
    return {"pixel_values": pixel_values, "labels": labels}


def main() -> None:
    parser = argparse.ArgumentParser(description="ViT waste training (TrashNet / Kaggle / Meghalaya / TACO ImageFolder)")
    _default_cfg = Path(__file__).resolve().parent / "config.yaml"
    parser.add_argument("--config", type=Path, default=_default_cfg)
    parser.add_argument(
        "--dataset",
        default=None,
        help="Override config dataset key (trashnet|kaggle_waste|meghalaya|taco_imagefolder)",
    )
    args = parser.parse_args()

    cwd = Path.cwd().resolve()
    cfg = _load_config(args.config)
    dataset_key = (args.dataset or cfg.get("dataset") or "").strip()
    if not dataset_key:
        raise SystemExit("Set `dataset:` in YAML or pass --dataset")

    paths = _resolve_paths(cfg, cwd)
    path_by_key = {
        "trashnet": paths["trashnet"],
        "kaggle_waste": paths["kaggle_waste"],
        "meghalaya": paths["meghalaya_custom"],
        "taco_imagefolder": paths["taco_imagefolder"],
    }
    primary_path = path_by_key.get(dataset_key)
    if primary_path is None:
        raise SystemExit(
            f"Unsupported dataset `{dataset_key}`. Use trashnet, kaggle_waste, meghalaya, or taco_imagefolder.\n"
            "Raw TACO: run backend/scripts/convert_taco_to_imagefolder.py first."
        )

    pre = cfg.get("preprocess") or {}
    tr = cfg.get("train") or {}

    train_ratio = float(pre.get("train_ratio", 0.7))
    val_ratio = float(pre.get("val_ratio", 0.15))
    test_ratio = float(pre.get("test_ratio", 0.15))
    seed = int(pre.get("seed", 42))
    augment = bool(pre.get("augment_train", True))

    out_dir = Path(tr.get("output_dir", "checkpoints/waste-vit-training"))
    out_dir = (cwd / out_dir).resolve() if not Path(out_dir).is_absolute() else Path(out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    splits_path = pre.get("splits_path")
    if splits_path:
        sp = Path(splits_path)
        splits_file = (cwd / sp).resolve() if not sp.is_absolute() else sp.resolve()
    else:
        splits_file = out_dir / "splits.json"

    extras_cfg = cfg.get("extra_datasets") or []
    extra_tuples: list[tuple[str, Path]] = []
    for block in extras_cfg:
        if not isinstance(block, dict):
            continue
        name = str(block.get("name", "")).strip()
        rel = block.get("path")
        if not name or not rel:
            continue
        pth = Path(rel)
        extra_tuples.append((name, (cwd / pth).resolve() if not pth.is_absolute() else pth.resolve()))

    from training.preprocess import run_preprocess

    meta = run_preprocess(
        primary_key=dataset_key,
        primary_path=primary_path,
        extra=extra_tuples,
        train_ratio=train_ratio,
        val_ratio=val_ratio,
        test_ratio=test_ratio,
        seed=seed,
        splits_out=splits_file,
    )
    print("Splits:", json.dumps(meta["counts"], indent=2))

    from datasets import Dataset, Features, Image, Value
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
        raise SystemExit(f"pip install evaluate ({exc})") from exc

    splits_payload = json.loads(splits_file.read_text(encoding="utf-8"))
    label2id: dict[str, int] = splits_payload["label2id"]

    def load_split(key: str) -> Dataset:
        rows = splits_payload["splits"][key]
        if not rows:
            raise SystemExit(f"Split `{key}` is empty — check ratios and dataset size.")
        return Dataset.from_dict(
            {"image": [r["path"] for r in rows], "labels": [r["label"] for r in rows]},
            features=Features({"image": Image(), "labels": Value("int64")}),
        )

    train_ds = load_split("train")
    val_ds = load_split("validation")

    processor_name = str(tr.get("model_name", "google/vit-base-patch16-224"))
    processor = AutoImageProcessor.from_pretrained(processor_name)
    num_labels = len(label2id)
    id2label = {i: n for n, i in label2id.items()}
    label2id_str = label2id

    try:
        from torchvision.transforms import ColorJitter, RandomHorizontalFlip

        _cj = ColorJitter(brightness=0.08, contrast=0.08, saturation=0.06, hue=0.02)
        _hflip_p = RandomHorizontalFlip(p=0.5)
    except ImportError:
        _cj = None
        _hflip_p = None

    def make_transform(for_train: bool):
        def _tf(example: dict) -> dict:
            img = example["image"].convert("RGB")
            if augment and for_train and _cj is not None and _hflip_p is not None:
                img = _hflip_p(img)
                img = _cj(img)
            enc = processor(images=img, return_tensors="pt")
            return {"pixel_values": enc["pixel_values"].squeeze(0).numpy(), "labels": int(example["labels"])}

        return _tf

    train_ds.set_transform(make_transform(True))
    val_ds.set_transform(make_transform(False))

    model = AutoModelForImageClassification.from_pretrained(
        processor_name,
        num_labels=num_labels,
        id2label={str(k): v for k, v in id2label.items()},
        label2id={k: v for k, v in label2id_str.items()},
        ignore_mismatched_sizes=True,
    )

    accuracy_metric = evaluate.load("accuracy")

    def compute_metrics(eval_pred):
        logits, labels = eval_pred
        preds = np.argmax(logits, axis=-1)
        acc = accuracy_metric.compute(predictions=preds, references=labels)
        return {"accuracy": float(acc["accuracy"])}

    batch_size = int(tr.get("batch_size", 8))
    use_cuda = torch.cuda.is_available()

    targs = TrainingArguments(
        output_dir=str(out_dir),
        overwrite_output_dir=True,
        num_train_epochs=float(tr.get("epochs", 3)),
        per_device_train_batch_size=batch_size,
        per_device_eval_batch_size=batch_size,
        learning_rate=float(tr.get("learning_rate", 5e-5)),
        warmup_ratio=float(tr.get("warmup_ratio", 0.05)),
        lr_scheduler_type="cosine",
        eval_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model="accuracy",
        greater_is_better=True,
        logging_steps=25,
        save_total_limit=2,
        seed=seed,
        fp16=use_cuda,
        dataloader_num_workers=int(tr.get("num_workers", 0)),
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

    class_names = [id2label[i] for i in range(num_labels)]

    preds_output = trainer.predict(val_ds)
    logits = preds_output.predictions
    labels_true = preds_output.label_ids
    preds = np.argmax(logits, axis=-1)

    cm = confusion_matrix(labels_true, preds, labels=list(range(num_labels)))
    cm_path = out_dir / "confusion_matrix.csv"
    header = "," + ",".join(class_names)
    rows = [header]
    for i, row_name in enumerate(class_names):
        rows.append(row_name + "," + ",".join(str(int(x)) for x in cm[i]))
    cm_path.write_text("\n".join(rows), encoding="utf-8")
    print("Wrote:", cm_path)

    if tr.get("save_plots", True):
        try:
            import matplotlib.pyplot as plt

            fig, ax = plt.subplots(figsize=(8, 6))
            im = ax.imshow(cm, interpolation="nearest")
            ax.figure.colorbar(im, ax=ax)
            ax.set(
                xticks=np.arange(num_labels),
                yticks=np.arange(num_labels),
                xticklabels=class_names,
                yticklabels=class_names,
                ylabel="True",
                xlabel="Predicted",
                title="Validation confusion matrix",
            )
            plt.setp(ax.get_xticklabels(), rotation=45, ha="right", rotation_mode="anchor")
            plt.tight_layout()
            fig_path = out_dir / "confusion_matrix.png"
            fig.savefig(fig_path, dpi=120)
            plt.close()
            print("Wrote:", fig_path)
        except Exception as exc:  # noqa: BLE001
            print("Matplotlib figure skipped:", exc)

    report = classification_report(
        labels_true,
        preds,
        target_names=class_names,
        digits=3,
        zero_division=0,
    )
    (out_dir / "classification_report.txt").write_text(report, encoding="utf-8")
    print("Wrote:", out_dir / "classification_report.txt")
    print(report)

    trainer.save_model(str(out_dir))
    processor.save_pretrained(str(out_dir))

    test_ds = load_split("test")
    test_ds.set_transform(make_transform(False))
    test_out = trainer.predict(test_ds)
    test_preds = np.argmax(test_out.predictions, axis=-1)
    test_acc = float((test_preds == test_out.label_ids).mean()) if len(test_out.label_ids) else None

    training_meta = {
        "model_name": processor_name,
        "dataset": dataset_key,
        "classes": class_names,
        "train_size": len(train_ds),
        "val_size": len(val_ds),
        "test_size": len(test_ds),
        "test_accuracy": test_acc,
        "splits_json": str(splits_file),
    }
    (out_dir / "training_meta.json").write_text(json.dumps(training_meta, indent=2), encoding="utf-8")
    print("Saved model + processor to:", out_dir)
    print(
        "Test accuracy (held-out):" if test_acc is not None else "Test:",
        f"{test_acc:.4f}" if test_acc is not None else "n/a",
    )


if __name__ == "__main__":
    main()
