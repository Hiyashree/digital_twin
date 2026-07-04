#!/usr/bin/env python3
r"""
Beginner helper: convert TACO **COCO** annotations into an **ImageFolder** tree for ViT training.

TACO layout (typical unzip):
  <taco_root>/annotations.json
  <taco_root>/images/*.jpg

This script maps each trash instance category onto six waste buckets (plastic/paper/organic/metal/glass/mixed)
using substring rules in ``taco_name_to_bucket``. Override with ``--mapping_json`` for finer control:

  {
    "Plastic film": "plastic",
    "Paper cup": "paper"
  }

Per image, the **mode** (most common) bucket among all annotations wins. Images with no matching trash → skipped.

Usage (from repo root):
  python backend/scripts/convert_taco_to_imagefolder.py --taco_root data/taco --output data/taco_imagefolder

Options:
  --link  try os.link (hardlink) when copy is too heavy; falls back to copy on failure.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
from collections import Counter, defaultdict
from pathlib import Path


WASTE_BUCKETS = ("plastic", "paper", "organic", "metal", "glass", "mixed")


def taco_name_to_bucket(name: str) -> str:
    n = name.lower()
    if any(k in n for k in ("food", "fruit", "vegetable", "snack", "leftover", "compost")):
        return "organic"
    if any(k in n for k in ("can", "foil", "metal", "alum", "tin")):
        return "metal"
    if any(k in n for k in ("paper", "cardboard", "napkin", "tissue", "carton")):
        return "paper"
    if any(k in n for k in ("plastic", "pet", "poly", "bag", "wrapper", "styro", "foam", "straw", "cup", "lid")):
        return "plastic"
    if "glass" in n or "jar" in n:
        return "glass"
    if "bottle" in n:
        return "mixed"
    return "mixed"


def load_mapping(path: Path | None, categories: dict[int, str]) -> dict[int, str]:
    """Returns category_id -> bucket."""
    cid_to_bucket: dict[int, str] = {}
    overrides: dict[str, str] = {}
    if path and path.is_file():
        overrides = json.loads(path.read_text(encoding="utf-8"))

    by_name_ov = {k.lower(): v for k, v in overrides.items()}
    for cid, cname in categories.items():
        if cname in overrides:
            b = overrides[cname]
        else:
            low = by_name_ov.get(cname.lower())
            b = low if low is not None else taco_name_to_bucket(cname)
        if b not in WASTE_BUCKETS:
            b = "mixed"
        cid_to_bucket[cid] = b
    return cid_to_bucket


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="TACO COCO → ImageFolder (plastic/paper/…) for ViT training")
    p.add_argument("--taco_root", type=Path, required=True, help="Folder containing annotations.json + images/")
    p.add_argument("--output", type=Path, required=True, help="New ImageFolder root (created)")
    p.add_argument("--annotations", type=Path, default=None, help="Override path to annotations.json")
    p.add_argument("--mapping_json", type=Path, default=None, help="Optional {category_name: bucket} overrides")
    p.add_argument(
        "--link",
        action="store_true",
        help="Prefer hardlinks instead of copying when same filesystem permits",
    )
    return p.parse_args()


def main() -> None:
    args = parse_args()
    taco_root: Path = args.taco_root.resolve()
    ann_path = args.annotations.resolve() if args.annotations else taco_root / "annotations.json"
    if not ann_path.is_file():
        raise SystemExit(
            f"Missing annotations.json at {ann_path}\n"
            "Unzip TACO so you have annotations.json next to an images folder.\n"
            "See training/README.md."
        )

    data = json.loads(ann_path.read_text(encoding="utf-8"))
    images_meta = data.get("images") or []
    categories = {c["id"]: c["name"] for c in (data.get("categories") or [])}
    cid_to_bucket = load_mapping(args.mapping_json, categories)

    id_to_file: dict[int, Path] = {}
    for im in images_meta:
        fid = im["id"]
        fn = im.get("file_name")
        if not fn:
            continue
        rel = Path(fn)
        for cand in (taco_root / fn, taco_root / "images" / fn, taco_root / "images" / rel.name):
            if cand.is_file():
                id_to_file[fid] = cand.resolve()
                break

    anns_by_image: dict[int, list[dict]] = defaultdict(list)
    for ann in data.get("annotations") or []:
        anns_by_image[ann["image_id"]].append(ann)

    out_root: Path = args.output.resolve()
    for b in WASTE_BUCKETS:
        (out_root / b).mkdir(parents=True, exist_ok=True)

    used = 0
    skipped = 0
    for im in images_meta:
        iid = im["id"]
        src = id_to_file.get(iid)
        if src is None:
            skipped += 1
            continue
        cats = []
        for ann in anns_by_image.get(iid, []):
            cid = ann.get("category_id")
            if cid in cid_to_bucket:
                cats.append(cid_to_bucket[cid])
        if not cats:
            skipped += 1
            continue
        bucket = Counter(cats).most_common(1)[0][0]
        dest_dir = out_root / bucket
        dest = dest_dir / src.name
        if dest.is_file():
            stem, suf = src.stem, src.suffix
            dest = dest_dir / f"{stem}__taco_{iid}{suf}"
        try:
            if args.link:
                try:
                    os.link(src, dest)
                except OSError:
                    shutil.copy2(src, dest)
            else:
                shutil.copy2(src, dest)
            used += 1
        except OSError as exc:
            print("Skip copy", src, "→", dest, exc)
            skipped += 1

    if used == 0:
        raise SystemExit(
            "No images were exported. Check:\n"
            "  • images/ exists under taco_root and file_name entries match files\n"
            "  • annotations reference known category_ids\n"
            f"  taco_root={taco_root}"
        )

    print(f"Exported {used} images into ImageFolder: {out_root}")
    print(f"Skipped {skipped} images (missing file or no mapped categories).")
    print("Next: set backend/training/config.yaml → dataset: taco_imagefolder, paths.taco_imagefolder:", out_root)


if __name__ == "__main__":
    main()
