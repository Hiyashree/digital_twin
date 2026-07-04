# Backend (Python) — ML API

This folder holds the **Python side** of the project. The **React app** lives in `src/` at the repo root; they talk over HTTP during development (see below).

## Folder layout

| Path | Purpose |
|------|---------|
| `backend/app.py` | Flask server: **stub** `/classify_waste` (503 + instructions — no ViT). Stubs `/predict` for bins. Run via **`npm run dev:api:mock`**. |
| `backend/requirements.txt` | Python packages for `app.py` only. |
| `../ml_server.py` (repo root) | **Full** server with **real ViT** (`google/vit-base-patch16-224` by default). Dev API: **`npm run dev:api`**. |
| `backend/ml/` | Waste pipeline + research modules (`import ml.*` once `backend/` is on `PYTHONPATH`; `ml_server.py` adds it automatically). |
| `../src/utils/wasteClassificationApi.js` | Frontend client — builds `FormData` and POSTs the image. |
| `../vite.config.js` | Dev proxy: browser calls `/api/...` → Flask on port 5000. |

## Run the lightweight API (no PyTorch)

From the **repository root** (or `npm run dev:api:mock`):

```bash
pip install -r backend/requirements.txt
python backend/app.py
```

`/classify_waste` returns **503** with a message to run **`ml_server.py`** for Vision Transformer inference. Use this only if you need `/reports` without installing `torch`.

## Real waste classification (ViT)

From the repo root — **`pip install -r requirements.txt`** then **`python ml_server.py`** or **`npm run dev:api`**. Model weights cache under `~/.cache/huggingface`.

## Where fine-tuning fits (TrashNet / TACO / Meghalaya)

1. See **`backend/scripts/train_waste_classifier.py`** and **`backend/ml/waste_pipeline/vit_inference.py`** comments.
2. Production inference lives in **`ml_server.py`** → **`classify_waste()`** → **`ml/waste_pipeline/`** (Python package under **`backend/ml/`**).

Weights and checkpoints typically live under the repo root or `HF_HOME`; set **`WASTE_MODEL_ID`** in `.env` to a local folder after training.

## Checklist (architecture exercise)

| Step | Status |
|------|--------|
| Frontend and backend separated (React vs Python) | Yes — `src/` vs `backend/` + `ml_server.py` |
| Flask API | Yes — `backend/app.py` (lightweight) and `ml_server.py` (ViT) |
| Image upload endpoint | Yes — `POST /classify_waste` (multipart `image`) |
| Real ViT inference | Yes — **`npm run dev:api`** → `ml_server.py` |
| Frontend wired to API | Yes — `wasteClassificationApi.js` → `/api/classify_waste` |
| Dashboard shows results | Yes — `recordClassification` + `DashboardHome` reads local log |

## Meghalaya workflows (training vs monitoring)

- **Training (workflow ①):** Image Classification → human label → `trainingDatasetStorage` → export manifest from Dataset Management.
- **Monitoring (workflow ②):** GPS pin (Field map) or manual lat/lng → classify → `POST /reports` with `type: "Waste observation"` and optional `vision` metadata. Implemented on **`backend/app.py`** and **`ml_server.py`** (same JSON shape).
