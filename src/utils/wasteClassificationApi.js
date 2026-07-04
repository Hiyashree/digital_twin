import { apiUrl } from "../config/api.js";

/**
 * ML integration (frontend step-by-step)
 * --------------------------------------
 * 1. User picks an image on ImageClassification.jsx (blob URL).
 * 2. This module reads that URL as a Blob and POSTs multipart field `image`.
 * 3. URL uses prefix `/api/` so Vite proxies to the ML API (run `python ml_server.py` / `npm run dev:api`).
 * 4. JSON from the server is mapped into UI fields below.
 * 5. ImageClassification calls recordClassification() → Dashboard reads the log.
 *
 * Map Flask /classify_waste JSON to the shape used by ImageClassification.jsx
 * (same as the old demoWasteClassifier output).
 */

const _SIX_ORDER = ["glass", "metal", "mixed", "organic", "paper", "plastic"];

/** Strip legacy server strings (old ResNet headline swap) so the Analyzer line is always ViT-style. */
function sanitizeClassifierModelDisplay(data) {
  const raw = String(data.model ?? "").trim();
  const mid = String(data.model_id ?? "").trim();
  const arch = String(data.architecture_label ?? "").trim() || "Vision Transformer (ViT)";
  if (
    /ResNet-50\s*headline|baseline\s*JSON|exploratory\s*ViT/i.test(raw) ||
    /\bResNet\b/i.test(raw)
  ) {
    return mid ? `${arch} · ${mid}` : arch;
  }
  if (!raw) {
    return mid ? `${arch} · ${mid}` : arch;
  }
  return raw;
}

/** Rich JSON for the UI debug panel (includes legacy keys if an old API still sends them). */
function buildClassificationDebugFromApiData(data) {
  if (!data || typeof data !== "object") return {};
  return {
    waste_classifier_snapshot: data.waste_classifier_snapshot ?? null,
    comparison_models: (() => {
      const c = data.comparison_models;
      if (!c || typeof c !== "object") return null;
      if ("resnet50" in c) return null;
      return c;
    })(),
    safeguard: data.safeguard ?? null,
    research_waste_hypothesis: data.research_waste_hypothesis ?? null,
    headline_source: data.headline_source ?? null,
    pipeline_mode: data.pipeline_mode ?? null,
    backbone: data.backbone ?? null,
    architecture_label: data.architecture_label ?? null,
    model_id: data.model_id ?? null,
    model_display_sanitized: sanitizeClassifierModelDisplay(data),
    canonical: data.canonical ?? null,
    predicted_class: data.predicted_class ?? null,
    confidence: data.confidence ?? null,
    category_probabilities: data.category_probabilities ?? null,
    probs: Array.isArray(data.probs) ? data.probs : null,
  };
}

/** Slim copy of Flask ``waste_classifier_snapshot`` for the UI. */
function slimWasteClassifierSnapshot(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.error === "string") {
    return { error: raw.error.slice(0, 260) };
  }
  const swIn = raw.six_way_probs_pct;
  const six = {};
  if (swIn && typeof swIn === "object") {
    for (const k of _SIX_ORDER) {
      const v = swIn[k];
      six[k] = typeof v === "number" ? Math.round(v * 100) / 100 : 0;
    }
  }
  return {
    canonical_top: raw.canonical_top,
    model_id: raw.model_id,
    top_class_label: raw.top_class_label,
    top_class_score: raw.top_class_score,
    six_way_probs_pct: six,
  };
}

function mapApiToResult(data) {
  const apiPred = String(data.predicted_class ?? "").trim();
  const modelDisplay = sanitizeClassifierModelDisplay(data);
  return {
    predictedClass: data.predicted_class,
    canonical: typeof data.canonical === "string" ? data.canonical : null,
    modelOriginalPrediction: apiPred,
    category: data.category,
    confidence: data.confidence,
    model: modelDisplay || "Research ML API",
    architectureLabel: typeof data.architecture_label === "string" ? data.architecture_label : null,
    modelId: typeof data.model_id === "string" ? data.model_id : null,
    backbone: typeof data.backbone === "string" ? data.backbone : null,
    classificationDebug: buildClassificationDebugFromApiData(data),
    wasteType: data.waste_type,
    material: data.material,
    recyclable: data.recyclable_label,
    decomposition: data.decomposition,
    impact: data.impact,
    impactTone: data.impact_tone,
    disposal: data.disposal,
    probs: Array.isArray(data.probs) ? data.probs : [],
    caveat: typeof data.caveat === "string" ? data.caveat : null,
    organicReviewRecommended: Boolean(data.organic_review_recommended),
    nonWasteDetected: Boolean(data.non_waste_detected),
    safeguardMessage: typeof data.safeguard_message === "string" ? data.safeguard_message : "",
    wasteClassifierSnapshot: slimWasteClassifierSnapshot(data.waste_classifier_snapshot),
    safeguard: data.safeguard && typeof data.safeguard === "object" ? data.safeguard : null,
    researchWasteHypothesis: data.research_waste_hypothesis && typeof data.research_waste_hypothesis === "object" ? data.research_waste_hypothesis : null,
    categoryProbabilities: data.category_probabilities && typeof data.category_probabilities === "object" ? data.category_probabilities : null,
    organicVisualOverride: Boolean(data.organic_visual_override),
    organicVisualCue: typeof data.organic_visual_cue === "number" ? data.organic_visual_cue : null,
    headlineSource: typeof data.headline_source === "string" ? data.headline_source : null,
    headlineModelId: typeof data.headline_model_id === "string" ? data.headline_model_id : null,
    pipelineMode: typeof data.pipeline_mode === "string" ? data.pipeline_mode : null,
    fragmentCohesionApplied: Boolean(data.fragment_cohesion_applied),
    fragmentCohesionReason:
      typeof data.fragment_cohesion_reason === "string" ? data.fragment_cohesion_reason : null,
    fragmentCohesion: data.fragment_cohesion && typeof data.fragment_cohesion === "object" ? data.fragment_cohesion : null,
    secondaryMaterial: typeof data.secondary_material === "string" ? data.secondary_material : null,
    secondaryMaterialLabel:
      typeof data.secondary_material_label === "string" ? data.secondary_material_label : null,
    secondaryMaterialCue:
      typeof data.secondary_material_cue === "number" ? data.secondary_material_cue : null,
    scrapSignal: typeof data.scrap_signal === "number" ? data.scrap_signal : null,
    materialCuesRaw:
      data.material_cues_raw && typeof data.material_cues_raw === "object" ? data.material_cues_raw : null,
    sceneType: typeof data.scene_type === "string" ? data.scene_type : null,
    sceneMaterial: typeof data.scene_material === "string" ? data.scene_material : null,
    sceneConfidence: typeof data.scene_confidence === "number" ? data.scene_confidence : null,
    sceneReasons: Array.isArray(data.scene_reasons) ? data.scene_reasons : null,
  };
}

/**
 * POST to `ml_server.py` — ViT softmax headline; `waste_classifier_snapshot` mirrors the headline.
 * @param {string} previewUrl blob: URL from createObjectURL or a data URL
 */
/**
 * Send the same bytes you classified to the API training_feedback folder (when ml_server.py runs).
 * Fire-and-forget from the UI; failures are ignored.
 */
/** @returns {Promise<{ ok?: boolean, stored_dataset?: boolean, dataset_relative?: string, dataset_class?: string, message?: string }>} */
export async function postTrainingFeedback(previewUrl, label) {
  try {
    const blob = await fetch(previewUrl).then((r) => r.blob());
    const form = new FormData();
    form.append("image", blob, "waste.jpg");
    form.append("label", String(label ?? "").slice(0, 120));
    const url = apiUrl("/api/training_feedback");
    const res = await fetch(url, { method: "POST", body: form });
    return await res.json().catch(() => ({}));
  } catch {
    return { ok: false, message: "network_error" };
  }
}

export async function classifyWasteFromPreview(previewUrl) {
  const blob = await fetch(previewUrl).then((r) => r.blob());
  const form = new FormData();
  form.append("image", blob, "waste.jpg");

  /** `/api` is stripped by Vite → Flask receives `/classify_waste` on port 5000. */
  const url = apiUrl("/api/classify_waste");

  /** ViT on CPU/GPU can take time on first load (Hugging Face cache download). */
  const CLASSIFY_TIMEOUT_MS = 360000;
  const ctl = new AbortController();
  const timeoutId = setTimeout(() => ctl.abort(), CLASSIFY_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      body: form,
      signal: ctl.signal,
    });
  } catch (err) {
    if (err?.name === "AbortError") {
      throw new Error(
        `Classification timed out after ${CLASSIFY_TIMEOUT_MS / 1000}s. The model may still be loading on the server (watch the Flask terminal), or CPU inference is very slow — wait and try again.`
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg = data?.message || `${res.status} ${res.statusText}`;
    const code = data?.code;
    const stub =
      code === "RUN_ML_SERVER_FOR_VIT" || code === "USE_HF_OR_BACKEND_MOCK"
        ? " Run the full API from the project root: pip install -r requirements.txt && python ml_server.py (or npm run dev:api). The lightweight backend/app.py does not load the ViT."
        : "";
    const hint =
      res.status === 503 || res.status === 404
        ? stub ||
          " Run the real classifier: pip install -r requirements.txt && python ml_server.py (or npm run dev:api)."
        : res.status === 500
          ? " Check the Flask terminal: inference often fails if torch/transformers are missing or the HF model did not download."
          : "";
    throw new Error(`${msg}${hint}`);
  }

  return mapApiToResult(data);
}
