"""
College research prototype: hybrid waste vision pipeline.

* **Primary:** ViT (Hugging Face) — configurable via ``WASTE_MODEL_ID``.
* **Optional cues:** YOLOv8 detection for scene / non-waste context where enabled.

Fine-tuning and dataset layout: see ``ml/DATASETS.md`` and ``backend/scripts/train_waste_classifier.py``.
"""
