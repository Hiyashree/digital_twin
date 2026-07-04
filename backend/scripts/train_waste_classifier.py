#!/usr/bin/env python3
"""
Fine-tuning entry point (TrashNet, TACO, Meghalaya folders).

**Where training happens:** use Hugging Face ``Trainer`` with an ImageFolder dataset
(class subfolders: plastic, paper, organic, metal, glass, mixed), starting from
``google/vit-base-patch16-224``, then save with ``model.save_pretrained(...)``.

Production inference in ``ml.waste_pipeline.vit_inference`` already applies softmax and
maps logits into six bins; after you train a **6-class** head, the same code uses your labels.

**Full training loop:** run ``python backend/scripts/train_waste_vit.py --data_dir dataset`` (see that file). This stub remains for ``--verify_load`` smoke tests only.

Quick check that the same ViT weights ``ml_server.py`` uses can load locally:
"""

from __future__ import annotations

import argparse


def main() -> None:
    parser = argparse.ArgumentParser(description="Waste ViT fine-tune helper / smoke test")
    parser.add_argument(
        "--verify_load",
        action="store_true",
        help="Download/cache google/vit-base-patch16-224 once (same as production inference).",
    )
    args = parser.parse_args()

    if args.verify_load:
        import torch
        from PIL import Image
        from transformers import AutoImageProcessor, AutoModelForImageClassification

        mid = "google/vit-base-patch16-224"
        processor = AutoImageProcessor.from_pretrained(mid)
        m = AutoModelForImageClassification.from_pretrained(mid)
        m.eval()
        img = Image.new("RGB", (224, 224), (40, 50, 30))
        inputs = processor(images=img, return_tensors="pt")
        with torch.no_grad():
            m(**inputs)
        print("OK:", mid, "loads and runs one forward pass (CPU). Start ml_server.py next.")
        return

    print(__doc__)


if __name__ == "__main__":
    main()
