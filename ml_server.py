"""
Full-stack Flask API (bins, auth, reports, optional **real** waste image model).

For a **lightweight** API without the ViT stack, run `backend/app.py` (it returns an error for `/classify_waste`
and tells you to use this server for real inference).

**Production path:** `pip install -r requirements.txt` → `python ml_server.py` loads the ViT from **WASTE_MODEL_ID**
(default **google/vit-base-patch16-224**), runs softmax, maps labels into six waste bins. The API headline and
``waste_classifier_snapshot`` mirrors the same ViT headline. Heuristic overrides (YOLO/plastic
prior, scene analyzer, fragment cohesion) are **not** applied in the simple pipeline.
"""

import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parent
_BACKEND_ROOT = _REPO_ROOT / "backend"
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

# Load repo-root `.env` before reading os.environ (WASTE_MODEL_ID, PORT, …).
try:
    from dotenv import load_dotenv

    load_dotenv(_REPO_ROOT / ".env")
except ImportError:
    pass

from flask import Flask, request, jsonify, make_response
import io
import os
import threading
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from datetime import datetime, timedelta, timezone
import base64
import hashlib
import hmac
import json
import uuid

from ml.research.non_waste_gate import assess_non_waste
from ml.waste_pipeline.config import load_pipeline_config
from ml.waste_pipeline.hf_classifier import hf_lock
from ml.waste_pipeline.response import (
    build_classify_response,
    build_waste_classifier_snapshot_from_core,
    finalize_research_payload,
)
from ml.waste_pipeline.simple_pipeline import run_simple_waste_pipeline
from ml.waste_flow_simulator import analyze_waste_flow

app = Flask(__name__)
app.config["SECRET_KEY"] = "change-this-in-production"
app.config["JWT_EXP_HOURS"] = 6


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


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("utf-8")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def create_jwt(payload: dict) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    header_segment = _b64url_encode(
        json.dumps(header, separators=(",", ":"), sort_keys=True).encode("utf-8")
    )
    payload_segment = _b64url_encode(
        json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    )
    signing_input = f"{header_segment}.{payload_segment}".encode("utf-8")
    signature = hmac.new(
        app.config["SECRET_KEY"].encode("utf-8"), signing_input, hashlib.sha256
    ).digest()
    return f"{header_segment}.{payload_segment}.{_b64url_encode(signature)}"


def decode_jwt(token: str) -> dict:
    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("Invalid token format")

    header_segment, payload_segment, signature_segment = parts
    signing_input = f"{header_segment}.{payload_segment}".encode("utf-8")
    expected_signature = hmac.new(
        app.config["SECRET_KEY"].encode("utf-8"), signing_input, hashlib.sha256
    ).digest()
    provided_signature = _b64url_decode(signature_segment)

    if not hmac.compare_digest(expected_signature, provided_signature):
        raise ValueError("Invalid token signature")

    payload = json.loads(_b64url_decode(payload_segment).decode("utf-8"))
    exp = payload.get("exp")
    if exp is None:
        raise ValueError("Token missing exp claim")
    now_ts = int(datetime.now(timezone.utc).timestamp())
    if now_ts >= int(exp):
        raise ValueError("Token expired")
    return payload


def get_bearer_token() -> str:
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return ""
    return auth_header.split(" ", 1)[1].strip()


def require_auth():
    token = get_bearer_token()
    if not token:
        return None, (jsonify({"message": "Missing bearer token"}), 401)
    try:
        payload = decode_jwt(token)
        return payload, None
    except Exception as error:
        return None, (jsonify({"message": str(error)}), 401)


# In-memory user store for demo use only.
# Replace with a database and hashed+salted passwords in production.
users = {
    "admin": {
        "email": "admin@example.com",
        "password": "1234",
    }
}
citizen_reports = []
next_report_id = 1

# Waste: WASTE_PIPELINE_MODE=hf (default), WASTE_MODEL_ID=google/vit-base-patch16-224, mapping in ml/waste_pipeline/


@app.route("/waste_model_config", methods=["GET"])
def waste_model_config():
    """Expose pipeline mode, backbone, and target categories for dashboard / ops."""
    cfg = load_pipeline_config()
    from ml.waste_pipeline.categories import DISPLAY_LABEL, WASTE_KEYS

    return jsonify(
        {
            "pipeline_mode": cfg.pipeline_mode,
            "backbone": cfg.backbone,
            "model_id": cfg.model_id,
            "categories": [{"key": k, "label": DISPLAY_LABEL[k]} for k in WASTE_KEYS],
            "datasets_supported": ["TrashNet", "TACO", "custom (Meghalaya)"],
            "docs": "ViT-only headline softmax; waste_classifier_snapshot mirrors the headline. Fine-tune on TrashNet/TACO/Meghalaya (ml/DATASETS.md).",
        }
    )


@app.route("/classify_waste", methods=["POST"])
def classify_waste():
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
    except ImportError:
        return jsonify({"message": "Install pillow: pip install pillow"}), 503

    try:
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        # Cap decode size — classifier resizes to ~224 anyway; smaller = less CPU prep work.
        img.thumbnail((512, 512))
    except Exception as exc:
        return jsonify({"message": f"Invalid image: {exc}"}), 400

    cfg = load_pipeline_config()

    try:
        with hf_lock():
            core, num_labels = run_simple_waste_pipeline(img, cfg)

        core["headline_source"] = "vit"
        imagenet_top_k_raw = list(core.pop("imagenet_top_k", []) or [])
        imagenet_top_k = [(str(a), float(b)) for a, b in imagenet_top_k_raw]
        p_lab = str(imagenet_top_k[0][0]) if imagenet_top_k else str(core.get("raw_top_label") or "")
        p_sc = float(imagenet_top_k[0][1]) if imagenet_top_k else 0.0
        snapshot = build_waste_classifier_snapshot_from_core(
            core, cfg, top_class_label=p_lab, top_class_score=p_sc
        )

        safeguard = assess_non_waste(
            vit_waste_bins_max=float(core["top_score"]),
            six_probs_pct=dict(core["six_way_probs"]),
            imagenet_top_k=(
                imagenet_top_k[:12]
                if imagenet_top_k
                else [
                    (
                        str(core.get("raw_top_label", "")),
                        max(1e-6, float(core.get("top_score", 0.0))),
                    )
                ]
            ),
            yolo_boxes=[],
        )
    except RuntimeError as exc:
        return jsonify({"message": str(exc), "code": "MODEL_UNAVAILABLE"}), 503
    except Exception as exc:
        return jsonify({"message": f"Inference failed: {exc}"}), 500

    base = build_classify_response(core, cfg, num_labels=num_labels)
    payload = finalize_research_payload(base, safeguard=safeguard, waste_classifier_snapshot=snapshot)

    return jsonify(payload)


_TRAIN_FB_ROOT = _REPO_ROOT / "training_feedback"
_DATASET_ROOT = _REPO_ROOT / "dataset"


def _dataset_class_from_ui_label(label: str) -> str:
    """Map ImageClassification.tsx TRAINING_LABELS (+ variants) → dataset/ folder for train_waste_vit."""
    low = (label or "").strip().lower()
    if not low:
        return "mixed"
    exact = {
        "plastic": "plastic",
        "paper / cardboard": "paper",
        "organic / food waste": "organic",
        "metal": "metal",
        "glass": "glass",
        "mixed / other": "mixed",
    }
    if low in exact:
        return exact[low]
    if "plastic" in low:
        return "plastic"
    if "paper" in low or "cardboard" in low:
        return "paper"
    if "organic" in low or "food waste" in low:
        return "organic"
    if "metal" in low or "alumin" in low:
        return "metal"
    if "glass" in low:
        return "glass"
    if "mixed" in low or "other" in low:
        return "mixed"
    return "mixed"


@app.route("/training_feedback", methods=["POST"])
def training_feedback():
    """
    Persist human-labeled images under training_feedback/<sanitized_label>/ for audit,
    and copy the same bytes into dataset/<class>/ for ImageFolder fine-tuning (train_waste_vit.py).
    Frontend POSTs multipart field `image`, form `label` (Quick category text).
    """
    if not request.files or "image" not in request.files:
        return jsonify({"ok": False, "message": "multipart field 'image' required"}), 400
    label = (request.form.get("label") or "unknown").strip()[:120]
    raw_slug = "".join(c if c.isalnum() or c in ("-", "_") else "_" for c in label.lower())
    slug = (raw_slug[:80] or "unknown").strip("_") or "unknown"
    try:
        up = request.files["image"]
        image_bytes = up.read()
        if not image_bytes:
            return jsonify({"ok": False, "message": "empty upload"}), 400

        _TRAIN_FB_ROOT.mkdir(parents=True, exist_ok=True)
        dest_dir = _TRAIN_FB_ROOT / slug
        dest_dir.mkdir(parents=True, exist_ok=True)
        uid = uuid.uuid4().hex
        dest_path = dest_dir / f"{uid}.jpg"
        dest_path.write_bytes(image_bytes)

        dataset_class = _dataset_class_from_ui_label(label)
        ds_dir = _DATASET_ROOT / dataset_class
        ds_dir.mkdir(parents=True, exist_ok=True)
        ds_rel_name = f"{uid}.jpg"
        ds_path = ds_dir / ds_rel_name
        ds_path.write_bytes(image_bytes)

        manifest = _TRAIN_FB_ROOT / "manifest.csv"
        ds_manifest = _DATASET_ROOT / "from_ui_imports.csv"
        ts = int(datetime.now(timezone.utc).timestamp())
        rel = dest_path.relative_to(_TRAIN_FB_ROOT).as_posix()
        write_header = not manifest.exists()
        with open(manifest, "a", encoding="utf-8") as f:
            if write_header:
                f.write("path,label,timestamp\n")
            f.write(f"{rel},{label},{ts}\n")
        ds_rel_full = ds_path.relative_to(_REPO_ROOT).as_posix()
        write_ds = not ds_manifest.exists()
        with open(ds_manifest, "a", encoding="utf-8") as df:
            if write_ds:
                df.write("path,ui_label,dataset_class,timestamp\n")
            df.write(f"{ds_rel_full},{label},{dataset_class},{ts}\n")

        ds_rel_web = ds_path.relative_to(_DATASET_ROOT).as_posix()
        return jsonify(
            {
                "ok": True,
                "path": rel,
                "stored_dataset": True,
                "dataset_class": dataset_class,
                "dataset_relative": ds_rel_web,
            }
        )
    except Exception as exc:
        return jsonify({"ok": False, "message": str(exc)[:300]}), 500


AREA_INDEX = {
    "office": 0,
    "residential": 1,
    "market": 2,
}


def _clamp(value: float, low: float, high: float) -> float:
    return min(high, max(low, value))


def _to_float(value, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _encode_area(area: str) -> int:
    normalized = str(area or "").strip().lower()
    return AREA_INDEX.get(normalized, 1)


def _build_features(fill: float, time_hours: float, temperature: float, gas: float, area: str):
    area_code = _encode_area(area)
    return [fill, time_hours, temperature, gas, area_code]


def _generate_synthetic_training_data():
    samples = []
    labels = []
    rng = np.random.default_rng(42)
    areas = list(AREA_INDEX.keys())

    for fill in range(0, 101, 5):
        for time_hours in [1, 2, 3, 4, 6]:
            for area in areas:
                for _ in range(4):
                    temperature = float(rng.uniform(18, 36))
                    gas = float(rng.uniform(8, 90))
                    area_code = _encode_area(area)

                    # Synthetic target logic with reasonable monotonic behavior.
                    growth = (
                        time_hours * 6.0
                        + (temperature - 25) * 0.35
                        + gas * 0.06
                        + area_code * 1.8
                        + rng.normal(0, 1.8)
                    )
                    predicted_fill = _clamp(fill + growth, 0, 100)

                    samples.append([fill, time_hours, temperature, gas, area_code])
                    labels.append(predicted_fill)

    return np.array(samples, dtype=float), np.array(labels, dtype=float)


X, y = _generate_synthetic_training_data()
model = RandomForestRegressor(n_estimators=180, random_state=42)
model.fit(X, y)

@app.route('/auth/signup', methods=['POST'])
def signup():
    data = request.json or {}
    username = str(data.get('username', '')).strip()
    email = str(data.get('email', '')).strip()
    password = str(data.get('password', ''))

    if not username or not email or not password:
        return jsonify({"message": "username, email and password are required"}), 400

    if username in users:
        return jsonify({"message": "Username already exists"}), 409

    users[username] = {
        "email": email,
        "password": password,
    }
    return jsonify({"message": "Account created successfully"}), 201


@app.route('/auth/login', methods=['POST'])
def login():
    data = request.json or {}
    username = str(data.get('username', '')).strip()
    password = str(data.get('password', ''))
    user = users.get(username)

    if not user or user.get("password") != password:
        return jsonify({"message": "Invalid credentials"}), 401

    now = datetime.now(timezone.utc)
    exp = now + timedelta(hours=app.config["JWT_EXP_HOURS"])
    token = create_jwt({
        "sub": username,
        "email": user.get("email", ""),
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    })
    return jsonify({"token": token})


@app.route('/auth/me', methods=['GET'])
def me():
    payload, auth_error = require_auth()
    if auth_error:
        return auth_error
    return jsonify({
        "username": payload.get("sub"),
        "email": payload.get("email"),
    })


@app.route('/waste-flow/analyze', methods=['POST'])
def waste_flow_analyze():
    """Python waste-flow analysis over simulated IoT bin telemetry."""
    data = request.json or {}
    bins = data.get('bins')
    if not isinstance(bins, list):
        return jsonify({"message": "Expected JSON { bins: [...] }"}), 400
    return jsonify(analyze_waste_flow(bins))


@app.route('/predict', methods=['POST'])
def predict():
    data = request.json or {}
    current_fill = _clamp(_to_float(data.get('fill', 0), 0), 0, 100)
    time_hours = _clamp(_to_float(data.get('time', 2), 2), 0.5, 12)
    temperature = _clamp(_to_float(data.get('temperature', 25), 25), -10, 70)
    gas = _clamp(_to_float(data.get('gas', 20), 20), 0, 100)
    area = str(data.get('area', 'residential')).strip().lower()

    feature_vector = _build_features(
        fill=current_fill,
        time_hours=time_hours,
        temperature=temperature,
        gas=gas,
        area=area,
    )

    prediction = float(model.predict([feature_vector])[0])
    prediction = _clamp(prediction, 0, 100)

    return jsonify({
        "predicted_fill": round(prediction, 2),
        "model_version": "rf-v2",
        "inputs_used": {
            "fill": current_fill,
            "time": time_hours,
            "temperature": temperature,
            "gas": gas,
            "area": area,
        },
    })


@app.route('/reports', methods=['GET'])
def get_reports():
    sorted_reports = sorted(citizen_reports, key=lambda r: r["timestamp"], reverse=True)
    return jsonify({"reports": sorted_reports})


ALLOWED_REPORT_TYPES = frozenset({"Overflow", "Dirty Area", "Waste observation"})


@app.route('/reports', methods=['POST'])
def create_report():
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
        "createdBy": str(data.get("createdBy") or "local"),
    }
    # Optional vision payload from Image Classification (field monitoring workflow).
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


@app.route('/reports/<int:report_id>/resolve', methods=['PATCH'])
def resolve_report(report_id: int):
    for report in citizen_reports:
        if report["id"] == report_id:
            report["status"] = "resolved"
            return jsonify(report)
    return jsonify({"message": "Report not found"}), 404


@app.route('/reports/<int:report_id>', methods=['DELETE'])
def delete_report(report_id: int):
    for idx, report in enumerate(citizen_reports):
        if report["id"] == report_id:
            citizen_reports.pop(idx)
            return jsonify({"message": "Report deleted"})
    return jsonify({"message": "Report not found"}), 404

def _warm_waste_classifier_async():
    """Load HF weights + one forward pass off the request thread (hf mode only)."""

    def _run():
        try:
            from PIL import Image

            cfg = load_pipeline_config()
            with hf_lock():
                img = Image.new("RGB", (224, 224), (120, 110, 90))
                run_simple_waste_pipeline(img, cfg)
        except Exception:
            pass

    threading.Thread(target=_run, daemon=True, name="waste-model-warmup").start()


if __name__ == '__main__':
    _warm_waste_classifier_async()
    _port = int(os.environ.get("PORT", "5000"))
    # Reloader spawns a second process (models load twice, more RAM, flaky on Windows).
    # Set FLASK_USE_RELOADER=1 if you want auto-reload on .py edits.
    _reload = os.environ.get("FLASK_USE_RELOADER", "").strip().lower() in ("1", "true", "yes")
    app.run(debug=True, use_reloader=_reload, host="127.0.0.1", port=_port)