"""
Vision Transformer waste classification for the Digital Twin Flask API.

Inference via Hugging Face; optional YOLOv8 cues live in ``ml.research`` where enabled.

Fine-tune on TrashNet, TACO, or custom folders — see `backend/scripts/train_waste_classifier.py`.
"""

from ml.waste_pipeline.response import build_classify_response
from ml.waste_pipeline.config import PipelineConfig, load_pipeline_config

__all__ = [
    "PipelineConfig",
    "load_pipeline_config",
    "build_classify_response",
]
