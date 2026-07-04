from __future__ import annotations

from pathlib import Path

from training.datasets.collect import collect_imagefolder, discover_kaggle_style_root
from training.datasets.layouts import count_images, imagefolder_root_with_normalized_classes, list_class_subdirs

DATASET_KEYS = frozenset({"trashnet", "kaggle_waste", "meghalaya", "taco_imagefolder", "taco"})


def describe_expected_layout(key: str) -> str:
    lines = {
        "trashnet": (
            "TrashNet-style: <path>/<class_name>/*.jpg\n"
            "  Example: data/trashnet/plastic/001.jpg, data/trashnet/metal/002.jpg\n"
            "  Download: see training/README.md (GitHub archive → unzip so class folders sit under your trashnet path)."
        ),
        "kaggle_waste": (
            "Kaggle-style: <path>/train/<class_name>/*  OR  <path>/<class_name>/*\n"
            "  Script auto-detects a `train/` folder (any case). Class folder names are normalized "
            "(case/spaces) when building labels.\n"
            "  Download: `kaggle datasets download ...` then unzip into data/kaggle_waste (see training/README.md)."
        ),
        "meghalaya": (
            "Custom ImageFolder: data/meghalaya_custom/<class_name>/*\n"
            "  Use dataset: meghalaya or merge with --dataset trashnet --extra_datasets [{name: meghalaya, path: ...}]"
        ),
        "taco_imagefolder": (
            "ImageFolder produced from TACO COCO annotations:\n"
            "  python backend/scripts/convert_taco_to_imagefolder.py ... --output data/taco_imagefolder\n"
            "  Then set dataset: taco_imagefolder in config."
        ),
        "taco": (
            "Raw TACO is COCO JSON, not ImageFolder.\n"
            "  Convert first: backend/scripts/convert_taco_to_imagefolder.py\n"
            "  Point paths.taco at the unzip folder with annotations.json; use dataset: taco_imagefolder after conversion."
        ),
    }
    return lines.get(key, key)


def _empty_message(key: str, path: Path) -> str:
    return (
        f"No images found for dataset `{key}` at:\n"
        f"  {path.resolve()}\n\n"
        f"Expected layout:\n{describe_expected_layout(key)}\n"
    )


def resolve_imagefolder_root(
    key: str,
    path: Path,
) -> tuple[Path, dict[str, str]]:
    """
    Returns (root_for_imagefolder, canonical_display_names_by_normalized_key).

    Raises:
        FileNotFoundError: missing path
        RuntimeError: empty / unusable layout
    """
    if key == "taco":
        raise RuntimeError(
            "Dataset `taco` points at raw COCO data. Either:\n"
            "  1) Run: python backend/scripts/convert_taco_to_imagefolder.py --taco_root <paths.taco> --output <paths.taco_imagefolder>\n"
            "  2) Set dataset: taco_imagefolder and paths.taco_imagefolder to the converted folder.\n\n"
            + describe_expected_layout("taco")
        )

    if not path.exists():
        raise FileNotFoundError(
            f"Path does not exist for `{key}`: {path}\n"
            f"Create it or update your YAML. Hint:\n{describe_expected_layout(key)}"
        )

    if key == "kaggle_waste":
        effective = discover_kaggle_style_root(path)
        root, canon = imagefolder_root_with_normalized_classes(effective)
    else:
        root = path
        _, canon = imagefolder_root_with_normalized_classes(root)

    if not root.is_dir():
        raise RuntimeError(_empty_message(key, path))

    subs = list_class_subdirs(root)
    if not subs:
        raise RuntimeError(_empty_message(key, path))

    n = count_images(root)
    if n == 0:
        sub_hint = ", ".join(s.name for s in subs[:8]) if subs else "(no subfolders)"
        raise RuntimeError(
            _empty_message(key, path)
            + f"Subfolders seen: {sub_hint}\n"
            + "If you only have .gitkeep files, add real images.\n"
        )

    # Ensure at least one image per class folder (beginner check)
    dead = [s.name for s in subs if count_images(s) == 0]
    if dead:
        raise RuntimeError(
            f"These class folders under {root} have no images: {', '.join(dead[:12])}"
            + (" ..." if len(dead) > 12 else "")
            + "\nRemove empty folders or add images."
        )

    return root, canon


def load_samples_for_key(key: str, path: Path):
    root, canon = resolve_imagefolder_root(key, path)
    return collect_imagefolder(root, canonical_names=canon)
