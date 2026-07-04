# Waste ViT training (public datasets)

Offline **Vision Transformer** fine-tuning with **auto-discovered folder layouts** — no hand-built CSV.

Stack matches the rest of the repo: **PyTorch** + Hugging Face **`transformers`** (`google/vit-base-patch16-224` by default).

## Quick start

```bash
pip install -r requirements.txt
cd backend
copy training\config.example.yaml training\config.yaml
# Edit training\config.yaml paths, place dataset under data\… (repo root)
python -m training.train_vit
```

Override dataset key without editing YAML:

```bash
cd backend
python -m training.train_vit --dataset kaggle_waste
```

Merge a custom **Meghalaya** ImageFolder with the same class folder names:

```yaml
dataset: trashnet
extra_datasets:
  - name: meghalaya
    path: data/meghalaya_custom
```

## Where to put downloads (layout)

Create `data/` under the repo root (gitignored except placeholders; see `data/README.md`).

| Dataset | Suggested path | Layout |
|--------|----------------|--------|
| **TrashNet** | `data/trashnet` | `<class>/*.jpg` (one folder per class). |
| **Kaggle “waste” style** | `data/kaggle_waste` | `train/<class>/…` **or** `<class>/…` at top level. |
| **TACO (COCO)** | `data/taco` | Raw: `annotations.json` + `images/`. **Not** ImageFolder until converted. |
| **TACO → training** | `data/taco_imagefolder` | Output of `backend/scripts/convert_taco_to_imagefolder.py`. |
| **Meghalaya custom** | `data/meghalaya_custom` | Same as TrashNet-style ImageFolder. |

## TrashNet download

1. Open the **garythung/trashnet** repository release or clone: [https://github.com/garythung/trashnet](https://github.com/garythung/trashnet) (data is sometimes provided as a zip in the repo or linked README).
2. Unzip so you have **one folder per material** (e.g. `cardboard/`, `glass/`, …) under `data/trashnet`.
3. Rename folders if you want them to match your deployment labels; the trainer uses **folder names** as class strings.

## Kaggle download (CLI)

1. Install API: `pip install kaggle` and put `kaggle.json` in `~/.kaggle/` (see Kaggle account → API token).
2. Download (replace with your dataset slug):

   ```bash
   kaggle datasets download -d <owner>/<dataset-slug> -p data/
   ```

3. Unzip into `data/kaggle_waste` so you either get `train/<class>/...` or `<class>/...` at the top level. The loader detects `train/` in any casing and **normalizes** class folder names (case / spaces).

## TACO download and convert

1. Get **TACO** from the project site / repository (COCO format with `annotations.json`).
2. Unzip to e.g. `data/taco` with `annotations.json` and an `images/` directory.
3. Convert to six coarse buckets (beginner default: heuristic mapping; override with JSON):

   ```bash
   python backend/scripts/convert_taco_to_imagefolder.py --taco_root data/taco --output data/taco_imagefolder
   ```

   Optional mapping file: `--mapping_json training/datasets/taco_category_map.example.json`

4. Set in `backend/training/config.yaml`: `dataset: taco_imagefolder`, `paths.taco_imagefolder: data/taco_imagefolder`.

## Preprocess-only (splits.json)

```bash
python -m training.preprocess --dataset trashnet --path data/trashnet --splits_out checkpoints/my_run/splits.json
python -m training.preprocess --dataset kaggle_waste --path data/kaggle_waste --extra meghalaya=data/meghalaya_custom
```

Training always rebuilds splits from the live folders unless you later add a “reuse splits” feature; for now **`train_vit` writes `splits.json` every run** next to `output_dir` (or `preprocess.splits_path` in YAML).

## Outputs

- **Checkpoint + processor**: `train.output_dir` (default `checkpoints/waste-vit-training`).
- **`splits.json`**: paths, labels, ratios, seed (for reproducibility).
- **Confusion matrix / report**: `confusion_matrix.csv`, `classification_report.txt`, optional `confusion_matrix.png`.

Wire the folder to the app the same way as `backend/scripts/train_waste_vit.py`: set `WASTE_MODEL_ID` to the saved directory (see root `requirements.txt` / `ml_server.py`).

## Legacy script

The older single-folder trainer remains: `python backend/scripts/train_waste_vit.py --data_dir dataset` (from repo root). The new `training/` package adds **multi-dataset discovery**, **test split**, and **TACO** conversion.
