# =============================================================================
# MSW Digital Twin — simple Flask API (beginner / mock ML)
# =============================================================================
#
# What this file does
# -------------------
# 1. Runs a small web server (default port 5000).
# 2. Exposes POST /classify_waste — accepts an image file, returns **mock** JSON.
# 3. Exposes POST /predict — a tiny mock for bin “fill” so the rest of the
#    dashboard still works if you use this server instead of ml_server.py.
#
# How to run (from the project root folder)
# ------------------------------------------
#   pip install -r backend/requirements.txt
#   python backend/app.py
#
# Then start the React app (separate terminal):
#   npm run dev
#
# The browser talks to Vite; Vite proxies /api/* → this Flask app (see vite.config.js).
#
# Where the real ML model goes later
# ----------------------------------
# Replace the body of `build_mock_classification_json()` with something like:
#   image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
#   outputs = your_pipeline(image)
#   return jsonify(format_outputs(outputs))
# Put model weights under backend/models/ or load from Hugging Face — see README.md.
#
# =============================================================================

from __future__ import annotations

import base64
import io
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, jsonify, make_response, request

# Allow `import ml.*` when running `python backend/app.py` (`ml` lives under this folder).
_BACKEND_ROOT = Path(__file__).resolve().parent
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

from ml.waste_pipeline.categories import DISPLAY_LABEL, WASTE_KEYS
from ml.waste_pipeline.config import load_pipeline_config
from ml.waste_flow_simulator import analyze_waste_flow, predict_fill_from_sensors

# Same repo-root `.env` as `ml_server.py` (PORT, etc.).
try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except ImportError:
    pass

app = Flask(__name__)


# In-memory hotspot reports (same contract as ml_server.py — resets when process stops).
ALLOWED_REPORT_TYPES = frozenset({"Overflow", "Dirty Area", "Waste observation"})
citizen_reports = []
next_report_id = 1

# --- Optional: allow running on a different port (advanced) ---
API_PORT = int(os.environ.get("PORT", "5000"))


# -----------------------------------------------------------------------------
# Step A — CORS (Cross-Origin Resource Sharing)
# -----------------------------------------------------------------------------
# Your React dev server runs on another port (e.g. 5173). Browsers block
# cross-origin requests unless the API sends these headers. We mirror the
# pattern used in ml_server.py so behaviour stays consistent.


@app.before_request
def _cors_preflight():
    if request.method != "OPTIONS":
        return None
    resp = make_response("", 204)
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, PATCH, DELETE, OPTIONS"
    return resp


@app.after_request
def _cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PATCH, DELETE, OPTIONS"
    return response


# -----------------------------------------------------------------------------
# Step C — Routes
# -----------------------------------------------------------------------------


@app.route("/health", methods=["GET"])
def health():
    """Quick check that the server is alive (browser or curl)."""
    return jsonify({"status": "ok", "service": "backend-mock-ml", "port": API_PORT})


@app.route("/waste_model_config", methods=["GET"])
def waste_model_config():
    """Lightweight API only — real ViT + softmax lives in ml_server.py (project root)."""
    cfg = load_pipeline_config()
    return jsonify(
        {
            "pipeline_mode": "backend_stub",
            "backbone": cfg.backbone,
            "model_id": cfg.model_id,
            "categories": [{"key": k, "label": DISPLAY_LABEL[k]} for k in WASTE_KEYS],
            "datasets_supported": ["TrashNet", "TACO", "custom (Meghalaya)"],
            "docs": "Run `pip install -r requirements.txt` then `python ml_server.py` (or `npm run dev:api`) for local ViT inference.",
        }
    )


@app.route("/classify_waste", methods=["POST"])
def classify_waste():
    """
    Image classification is implemented in **ml_server.py** (real ViT, ~224×224 preprocessing, softmax).

    This lightweight server keeps routes like `/reports` working without installing PyTorch.
    """
    image_bytes = None

    if request.files and "image" in request.files:
        image_bytes = request.files["image"].read()
    else:
        data = request.json or {}
        b64 = data.get("image_base64") or data.get("image")
        if b64 and isinstance(b64, str):
            if "," in b64 and b64.strip().startswith("data:"):
                b64 = b64.split(",", 1)[1]
            try:
                image_bytes = base64.b64decode(b64)
            except Exception:
                image_bytes = None

    if not image_bytes:
        return jsonify({"message": "Provide multipart form field 'image' or JSON { image_base64 }"}), 400

    try:
        from PIL import Image

        Image.open(io.BytesIO(image_bytes)).convert("RGB").thumbnail((64, 64))
    except Exception:
        return jsonify({"message": "Uploaded bytes are not a readable image"}), 400

    return jsonify(
        {
            "message": "Real Vision Transformer runs in ml_server.py. From the project root: "
            "pip install -r requirements.txt && python ml_server.py  (or npm run dev:api). "
            "Keep using npm run dev and point Vite at that process on port 5000.",
            "code": "RUN_ML_SERVER_FOR_VIT",
        }
    ), 503


@app.route("/training_feedback", methods=["POST"])
def training_feedback():
    """Mock server does not persist files; returns OK so the UI can call this during dev."""
    return jsonify(
        {
            "ok": True,
            "stored": False,
            "stored_dataset": False,
            "message": "mock API — run ml_server.py (npm run dev:api) to write training_feedback/ and dataset/.",
        }
    ), 200


@app.route("/waste-flow/analyze", methods=["POST"])
def waste_flow_analyze():
    """Python waste-flow analysis over simulated IoT bin telemetry."""
    data = request.json or {}
    bins = data.get("bins")
    if not isinstance(bins, list):
        return jsonify({"message": "Expected JSON { bins: [...] }"}), 400
    return jsonify(analyze_waste_flow(bins))


@app.route("/predict", methods=["POST"])
def predict():
    """
    Sensor-based fill prediction — matches the shape App.jsx expects.
    Full RandomForest lives in ml_server.py; this uses waste_flow_simulator.
    """
    data = request.json or {}
    try:
        fill = float(data.get("fill", 0))
        time_h = float(data.get("time", 2))
        temperature = float(data.get("temperature", 25))
        gas = float(data.get("gas", 20))
    except (TypeError, ValueError):
        fill, time_h, temperature, gas = 0.0, 2.0, 25.0, 20.0

    area = str(data.get("area", "residential"))
    predicted = predict_fill_from_sensors(fill, temperature, gas, area, time_h)

    return jsonify(
        {
            "predicted_fill": predicted,
            "model_version": "waste-flow-simulator",
            "inputs_used": {
                "fill": fill,
                "time": time_h,
                "temperature": temperature,
                "gas": gas,
                "area": area,
            },
        }
    )


def _to_float(value, default=None):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


@app.route("/reports", methods=["GET"])
def get_reports():
    """Same JSON shape as ml_server — Dashboard polls this to paint the Meghalaya map."""
    sorted_reports = sorted(citizen_reports, key=lambda r: r["timestamp"], reverse=True)
    return jsonify({"reports": sorted_reports})


@app.route("/reports", methods=["POST"])
def create_report():
    """Citizen / admin field reports. \"Waste observation\" carries optional AI metadata."""
    global next_report_id

    data = request.json or {}
    report_type = str(data.get("type", "")).strip()
    location = data.get("location") or {}
    lat = _to_float(location.get("lat"), None)
    lng = _to_float(location.get("lng"), None)

    if report_type not in ALLOWED_REPORT_TYPES:
        return jsonify({"message": "Invalid report type"}), 400
    if lat is None or lng is None:
        return jsonify({"message": "Valid location is required"}), 400

    report = {
        "id": next_report_id,
        "type": report_type,
        "location": {"lat": lat, "lng": lng},
        "status": "open",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "createdBy": str(data.get("createdBy") or "backend-mock"),
    }
    vision_in = data.get("vision")
    if isinstance(vision_in, dict):
        conf_raw = vision_in.get("confidence")
        try:
            conf_val = float(conf_raw) if conf_raw is not None else None
        except (TypeError, ValueError):
            conf_val = None
        report["vision"] = {
            "predictedClass": str(vision_in.get("predictedClass", ""))[:160],
            "category": str(vision_in.get("category", ""))[:80],
            "confidence": conf_val,
            "model": str(vision_in.get("model", ""))[:200],
            "recyclable": str(vision_in.get("recyclable", ""))[:20] if vision_in.get("recyclable") is not None else None,
            "wasteType": str(vision_in.get("wasteType", ""))[:80] if vision_in.get("wasteType") else None,
        }

    # Admin field photo (JPEG/PNG data URL) for map popups — same contract as ml_server.py.
    fp_in = data.get("fieldPhoto")
    if isinstance(fp_in, dict):
        thumb_raw = str(fp_in.get("thumbDataUrl") or "")
        if thumb_raw.startswith("data:image/") and len(thumb_raw) <= 240_000:
            report["fieldPhoto"] = {
                "thumbDataUrl": thumb_raw,
                "fileName": str(fp_in.get("fileName") or "")[:220],
            }

    next_report_id += 1
    citizen_reports.append(report)
    return jsonify(report), 201


@app.route("/reports/<int:report_id>/resolve", methods=["PATCH"])
def resolve_report(report_id):
    for report in citizen_reports:
        if report["id"] == report_id:
            report["status"] = "resolved"
            return jsonify(report)
    return jsonify({"message": "Report not found"}), 404


@app.route("/reports/<int:report_id>", methods=["DELETE"])
def delete_report(report_id):
    for idx, report in enumerate(citizen_reports):
        if report["id"] == report_id:
            citizen_reports.pop(idx)
            return jsonify({"message": "Report deleted"})
    return jsonify({"message": "Report not found"}), 404


# -----------------------------------------------------------------------------
# Step D — Start the dev server
# -----------------------------------------------------------------------------

if __name__ == "__main__":
    print(f"Mock ML API listening on http://127.0.0.1:{API_PORT}")
    print("  POST /classify_waste — mock waste labels")
    print("  POST /waste-flow/analyze — Python IoT waste-flow analysis")
    print("  POST /predict        — sensor-based bin fill projection")
    print("  GET/POST /reports    — hotspot / vision observations (in-memory)")
    print("  GET  /health         — sanity check")
    app.run(host="127.0.0.1", port=API_PORT, debug=True)
