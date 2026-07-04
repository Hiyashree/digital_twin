from __future__ import annotations

import json
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

from training.datasets.layouts import IMG_EXTS, find_kaggle_train_root, normalize_class_name


@dataclass(frozen=True)
class Sample:
    path: Path
    class_name: str  # canonical display label (folder name chosen for this class)


def _iter_images(folder: Path) -> list[Path]:
    out: list[Path] = []
    for p in folder.rglob("*"):
        if p.is_file() and p.suffix.lower() in IMG_EXTS:
            out.append(p)
    return out


def collect_imagefolder(
    root: Path,
    *,
    canonical_names: dict[str, str] | None = None,
) -> list[Sample]:
    """
    Standard layout: root/<class_name>/*.(jpg|png|...)
    canonical_names: map normalize_class_name -> display folder name (see imagefolder_root_with_normalized_classes).
    """
    if canonical_names is None:
        canonical_names = {}
    samples: list[Sample] = []
    for sub in sorted([p for p in root.iterdir() if p.is_dir()], key=lambda p: p.name.lower()):
        key = normalize_class_name(sub.name)
        label = canonical_names.get(key, sub.name)
        for img in _iter_images(sub):
            samples.append(Sample(path=img.resolve(), class_name=label))
    return samples


def discover_kaggle_style_root(configured: Path) -> Path:
    """If configured root contains train/, use that as ImageFolder root."""
    if not configured.is_dir():
        return configured
    inner = find_kaggle_train_root(configured)
    return inner if inner is not None else configured


def merge_samples(parts: list[tuple[str, list[Sample]]]) -> list[Sample]:
    """Prefix class names with source if duplicate normalized labels would clash (optional)."""
    by_label: dict[str, list[Sample]] = defaultdict(list)
    for _source, rows in parts:
        for s in rows:
            by_label[s.class_name].append(s)
    merged: list[Sample] = []
    for label in sorted(by_label):
        merged.extend(by_label[label])
    return merged


def save_splits_json(
    path: Path,
    *,
    label2id: dict[str, int],
    splits: dict[str, list[dict]],
    meta: dict,
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {"label2id": label2id, "id2label": {str(i): n for n, i in label2id.items()}, "splits": splits, "meta": meta}
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
