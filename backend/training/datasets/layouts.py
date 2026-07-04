from __future__ import annotations

import re
import os
from pathlib import Path

IMG_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif", ".tif", ".tiff"}


def normalize_class_name(name: str) -> str:
    """Collapse case/whitespace for deduplication (e.g. Train/Plastic vs train/plastic)."""
    s = name.strip().replace("\u00a0", " ")
    s = re.sub(r"\s+", "_", s)
    return s.lower()


def count_images(root: Path) -> int:
    n = 0
    for p in root.rglob("*"):
        if p.is_file() and p.suffix.lower() in IMG_EXTS:
            n += 1
    return n


def list_class_subdirs(root: Path) -> list[Path]:
    return sorted([p for p in root.iterdir() if p.is_dir()], key=lambda p: p.name.lower())


def find_kaggle_train_root(root: Path) -> Path | None:
    """Pick train/Train/TRAIN if present; else None."""
    if not root.is_dir():
        return None
    for name in os.listdir(root):
        if name.lower() == "train":
            candidate = root / name
            if candidate.is_dir():
                return candidate
    return None


def imagefolder_root_with_normalized_classes(root: Path) -> tuple[Path, dict[str, str]]:
    """
    If duplicate class folders differ only by case/spaces, pick one canonical subdir per key.
    Returns (effective_root, display_name_by_key) where display_name_by_key maps normalized -> folder name to use.
    Subdirs with zero images are skipped with warning by caller.
    """
    subdirs = list_class_subdirs(root)
    by_norm: dict[str, Path] = {}
    for p in subdirs:
        key = normalize_class_name(p.name)
        if key not in by_norm:
            by_norm[key] = p
    display = {k: by_norm[k].name for k in sorted(by_norm)}
    # Physical layout unchanged; we expose canonical names for labels.
    return root, display
