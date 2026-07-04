"""
Build stratified train/val/test splits and write ``splits.json`` (paths + integer labels).

Resize/normalization happen in the ViT image processor at training time; this module only
assigns which files belong to which split.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from sklearn.model_selection import train_test_split

from training.datasets.collect import Sample, merge_samples, save_splits_json
from training.datasets.registry import DATASET_KEYS, describe_expected_layout, load_samples_for_key


def build_label_map(samples: list[Sample]) -> dict[str, int]:
    names = sorted({s.class_name for s in samples}, key=str.lower)
    if len(names) < 2:
        raise RuntimeError("Need images in at least 2 distinct class folders.")
    return {n: i for i, n in enumerate(names)}


def stratified_three_way_split(
    samples: list[Sample],
    label2id: dict[str, int],
    *,
    train_ratio: float,
    val_ratio: float,
    test_ratio: float,
    seed: int,
) -> dict[str, list[Sample]]:
    s = train_ratio + val_ratio + test_ratio
    if abs(s - 1.0) > 1e-6:
        raise ValueError(f"train/val/test ratios must sum to 1.0 (got {s})")

    ys = [label2id[s.class_name] for s in samples]
    indices = list(range(len(samples)))

    temp_size = val_ratio + test_ratio
    try:
        i_train, i_temp = train_test_split(
            indices,
            test_size=temp_size,
            stratify=ys,
            random_state=seed,
            shuffle=True,
        )
    except ValueError:
        i_train, i_temp = train_test_split(
            indices,
            test_size=temp_size,
            random_state=seed,
            shuffle=True,
        )

    ys_temp = [ys[i] for i in i_temp]
    relative_test = test_ratio / temp_size if temp_size > 0 else 0.0
    try:
        i_val, i_test = train_test_split(
            i_temp,
            test_size=relative_test,
            stratify=ys_temp,
            random_state=seed + 1,
            shuffle=True,
        )
    except ValueError:
        i_val, i_test = train_test_split(
            i_temp,
            test_size=relative_test,
            random_state=seed + 1,
            shuffle=True,
        )

    def pack(idxs: list[int]) -> list[Sample]:
        return [samples[i] for i in idxs]

    return {"train": pack(i_train), "validation": pack(i_val), "test": pack(i_test)}


def samples_to_records(rows: list[Sample], label2id: dict[str, int]) -> list[dict]:
    return [{"path": str(s.path), "label": label2id[s.class_name], "class_name": s.class_name} for s in rows]


def run_preprocess(
    *,
    primary_key: str,
    primary_path: Path,
    extra: list[tuple[str, Path]],
    train_ratio: float,
    val_ratio: float,
    test_ratio: float,
    seed: int,
    splits_out: Path,
) -> dict:
    if primary_key not in DATASET_KEYS:
        raise SystemExit(f"Unknown dataset key `{primary_key}`. Choose from: {sorted(DATASET_KEYS)}")
    if primary_key == "taco":
        raise SystemExit(
            "dataset `taco` is raw COCO — convert first, then use `taco_imagefolder`.\n"
            + describe_expected_layout("taco")
        )

    parts: list[tuple[str, list[Sample]]] = [(primary_key, load_samples_for_key(primary_key, primary_path))]
    for name, pth in extra:
        if name not in DATASET_KEYS or name == "taco":
            raise SystemExit(f"Invalid extra dataset `{name}`. Use an ImageFolder key (not raw taco).")
        parts.append((name, load_samples_for_key(name, pth)))

    merged = merge_samples(parts)
    label2id = build_label_map(merged)
    split_map = stratified_three_way_split(
        merged,
        label2id,
        train_ratio=train_ratio,
        val_ratio=val_ratio,
        test_ratio=test_ratio,
        seed=seed,
    )

    splits_serialized = {k: samples_to_records(v, label2id) for k, v in split_map.items()}
    meta = {
        "primary": primary_key,
        "extras": [{"name": n, "path": str(p.resolve())} for n, p in extra],
        "counts": {k: len(v) for k, v in split_map.items()},
        "classes": list(label2id.keys()),
        "seed": seed,
        "ratios": {"train": train_ratio, "val": val_ratio, "test": test_ratio},
    }
    save_splits_json(splits_out, label2id=label2id, splits=splits_serialized, meta=meta)
    return meta


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Build splits.json for training (no manual CSV).")
    p.add_argument("--dataset", required=True, choices=sorted(DATASET_KEYS - {"taco"}))
    p.add_argument("--path", required=True, type=Path, help="Root path for chosen dataset layout")
    p.add_argument("--extra", nargs="*", default=[], metavar="NAME=PATH", help="Optional merge: meghalaya=data/meghalaya")
    p.add_argument("--train_ratio", type=float, default=0.7)
    p.add_argument("--val_ratio", type=float, default=0.15)
    p.add_argument("--test_ratio", type=float, default=0.15)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--splits_out", type=Path, default=Path("checkpoints/waste-vit-training/splits.json"))
    return p.parse_args()


def main() -> None:
    args = _parse_args()
    extra: list[tuple[str, Path]] = []
    for chunk in args.extra:
        if "=" not in chunk:
            raise SystemExit(f"Bad --extra `{chunk}`; use NAME=PATH")
        name, path = chunk.split("=", 1)
        extra.append((name.strip(), Path(path.strip())))
    meta = run_preprocess(
        primary_key=args.dataset,
        primary_path=args.path,
        extra=extra,
        train_ratio=args.train_ratio,
        val_ratio=args.val_ratio,
        test_ratio=args.test_ratio,
        seed=args.seed,
        splits_out=args.splits_out,
    )
    print("Wrote splits:", args.splits_out.resolve())
    print(json.dumps(meta["counts"], indent=2))


if __name__ == "__main__":
    main()
