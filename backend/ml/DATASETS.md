# Datasets & fine-tuning (TrashNet · TACO · Meghalaya)

## Loading data locally

Typical folder layout (**ImageFolder** — one subfolder per class):

```
data/meghalaya_waste/
  plastic/
  paper/
  organic/
  metal/
  glass/
  mixed/
```

* **TrashNet:** download archives, remap their class names onto the folders above (`canonical.py` already maps synonyms).
* **TACO:** COCO-format annotations → export cropped instances into the folders (script is project-specific — add under `scripts/prepare_taco.py` when ready).
* **Meghalaya custom:** citizen uploads from `training_feedback/` labels → sort into folders for training.

## Where fine-tuning runs

Train with Hugging Face `Trainer` in **`backend/scripts/train_waste_vit.py`** (ViT base, ImageFolder layout under `dataset/`). After training, smoke-test with **`backend/scripts/infer_waste_vit.py`**. Point **`WASTE_MODEL_ID`** in `.env` to the saved checkpoint directory so `ml_server.py` loads **your** weights instead of ImageNet-pretrained logits.

Legacy stub: `backend/scripts/train_waste_classifier.py` (`--verify_load` only).

## Adding a seventh category

1. Add a key + display string in **`ml/waste_pipeline/categories.py`** (`WASTE_KEYS`, `DISPLAY_LABEL`).
2. Extend **`canonical.py`** mappings from raw HF / ImageNet strings into your new key.
3. Retrain heads so logits match the expanded label set (`num_labels` in config).
