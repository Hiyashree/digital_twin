# Waste classification dataset (folder layout)

Place **one subfolder per class**. The training script loads this as a Hugging Face *ImageFolder* dataset.

## Current classes (Meghalaya-ready, expandable)

```
dataset/
  plastic/     # images (.jpg, .png, …)
  metal/
  paper/
  glass/
  organic/
  mixed/
```

**How to add new images:** drop files into the right folder. More diverse photos (lighting, angle, background) usually **improve** generalization after retraining.

## Expanding for Meghalaya (or other regions)

1. **Add a new category** (example: `electronics/` or `medical_waste/`):

   - Create `dataset/electronics/` and add labeled images.
   - **Retrain** with `python backend/scripts/train_waste_vit.py --data_dir dataset` so the ViT head learns the new logits (the number of classes updates automatically from folder names).

2. **Region-specific data without new class names:** merge Meghalaya captures into the **existing** folders (same plastic/paper/… taxonomy). Retraining biases the model toward your local waste appearance.

3. **Incremental collection:** you can start with a few images per class; accuracy will be poor until you grow the set. Aim for at least **~20–50 images per class** for a small college prototype, more for production.

Training and inference scripts live in `backend/scripts/`. See comments there for **fine-tuning** and **checkpoint** paths.

**From the portal:** when **Image Classification** → “Save to training queue” runs against **`ml_server.py`**, the same JPEG is written into this tree (e.g. `plastic/<uuid>.jpg`) using your Quick category, so you can run `train_waste_vit.py` without a separate export step. The lightweight `backend/app.py` mock API does **not** write files.

**Plastic heaps / bottle dumps:** collect many angles under `dataset/plastic/`, then fine-tune; the live API also uses **YOLOv8 bottle/cup detections** to bias the dashboard toward Plastic before colour-based organic hints.
