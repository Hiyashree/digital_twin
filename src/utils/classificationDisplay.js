/**
 * Single source of truth for labels shown everywhere (UI, maps, reports, gallery).
 * Uses Flask ``waste_classifier_snapshot`` when present.
 */

/** @param {object | null | undefined} result */
function wasteClassifierHeadlineSnapshot(result) {
  const snap = result?.wasteClassifierSnapshot;
  if (!snap || typeof snap !== "object") return null;
  if (snap.error) return null;
  if (snap.six_way_probs_pct && typeof snap.six_way_probs_pct === "object") return snap;
  return null;
}

/** Mirrors Flask ``DISPLAY_LABEL`` for the six canonical keys. */
export const BAR_LABEL_BY_CANONICAL = {
  plastic: "Plastic Waste",
  paper: "Paper Waste",
  organic: "Organic/Food Waste",
  metal: "Metal Waste",
  glass: "Glass Waste",
  mixed: "Mixed Waste",
};

const WASTE_TYPE_SHORT = {
  plastic: "Plastic",
  paper: "Paper",
  organic: "Organic",
  metal: "Metal",
  glass: "Glass",
  mixed: "Mixed",
};

const CANONICAL_ORDER = ["glass", "metal", "mixed", "organic", "paper", "plastic"];

/**
 * Map training-queue label (quick pick or free text) → six-way canonical key.
 * @returns {string | null}
 */
export function trainingLabelTextToCanonicalKey(labelText) {
  const raw = String(labelText || "").trim();
  if (!raw) return null;
  const s = raw.toLowerCase();
  const pick = {
    plastic: "plastic",
    "paper / cardboard": "paper",
    "organic / food waste": "organic",
    metal: "metal",
    glass: "glass",
    "mixed / other": "mixed",
  };
  if (pick[s]) return pick[s];
  if (s.includes("organic") || s.includes("food") || s.includes("biological")) return "organic";
  if (s.includes("paper") || s.includes("cardboard")) return "paper";
  if (s.includes("plastic")) return "plastic";
  if (s.includes("metal") || s.includes("alumin")) return "metal";
  if (s.includes("glass")) return "glass";
  if (s.includes("mixed") || s.includes("trash") || s.includes("general waste")) return "mixed";
  return "mixed";
}

/**
 * After the user saves a ground-truth label, align headline, bins, Research JSON, and display helpers.
 * Preserves `modelOriginalPrediction` when set (or seeds from current headline).
 * @param {object | null | undefined} result
 * @param {string} humanLabelText
 */
export function mergeGroundTruthLabelIntoResult(result, humanLabelText) {
  if (!result || result.nonWasteDetected) return result;
  const key = trainingLabelTextToCanonicalKey(humanLabelText);
  if (!key) return result;

  const six = {};
  for (const k of CANONICAL_ORDER) six[k] = k === key ? 100 : 0;

  const prev = wasteClassifierHeadlineSnapshot(result);
  const prevClean =
    prev && typeof prev === "object"
      ? Object.fromEntries(Object.entries(prev).filter(([name]) => name !== "error"))
      : {};

  const modelNote =
    typeof prevClean.model_id === "string" && prevClean.model_id && !String(prevClean.model_id).includes("ground truth")
      ? `${prevClean.model_id} · UI ground truth`
      : "ui_ground_truth";

  const aiSnapshot =
    String(result.modelOriginalPrediction || "").trim() ||
    String(result.predictedClass || "").trim() ||
    "";

  const arch = "Vision Transformer (ViT)";
  const modelLine = `${arch} · ${modelNote}`;

  const nextSnapshot = {
    ...(result.wasteClassifierSnapshot && typeof result.wasteClassifierSnapshot === "object"
      ? result.wasteClassifierSnapshot
      : {}),
    ...prevClean,
    canonical_top: key,
    model_id: modelNote,
    six_way_probs_pct: six,
    top_class_label: key === "mixed" ? "mixed_material_scene" : `${key}_waste_object`,
    top_class_score: 1,
  };

  return {
    ...result,
    modelOriginalPrediction: aiSnapshot || result.modelOriginalPrediction,
    groundTruthLabel: String(humanLabelText || "").slice(0, 120),
    headlineSource: "ground_truth",
    headlineModelId: null,
    predictedClass: BAR_LABEL_BY_CANONICAL[key],
    confidence: 100,
    wasteType: WASTE_TYPE_SHORT[key],
    category: key !== "organic" && key !== "mixed" ? "Recyclable" : "Non-recyclable",
    recyclable: key !== "organic" && key !== "mixed" ? "Yes" : "No",
    model: modelLine,
    architectureLabel: arch,
    modelId: modelNote,
    caveat:
      "Showing your confirmed ground-truth label for this image (same bins & JSON below). Model weights change only after training on exported data.",
    wasteClassifierSnapshot: nextSnapshot,
    classificationDebug: {
      ...(result.classificationDebug && typeof result.classificationDebug === "object" ? result.classificationDebug : {}),
      waste_classifier_snapshot: nextSnapshot,
      headline_source: "ground_truth",
      model_id: modelNote,
      architecture_label: arch,
      model_display_sanitized: modelLine,
      predicted_class: BAR_LABEL_BY_CANONICAL[key],
      confidence: 100,
      canonical: key,
    },
  };
}

/**
 * @param {object | null | undefined} result — mapApiToResult / classify payload
 * @returns {{ predictedTitle: string, confidencePct: number, categoryLabel: string, wasteTypeShort: string, canonicalKey: string } | null}
 */
export function baselineDerivedSummary(result) {
  const cm = wasteClassifierHeadlineSnapshot(result);
  const sw = cm?.six_way_probs_pct;
  if (!cm || cm.error || !sw || typeof sw !== "object") {
    const key = String(result?.canonical || "").toLowerCase();
    const cp = result?.categoryProbabilities;
    if (key && cp && typeof cp === "object" && Object.prototype.hasOwnProperty.call(BAR_LABEL_BY_CANONICAL, key)) {
      const pct = typeof cp[key] === "number" ? cp[key] : 0;
      const recyclable = key !== "organic" && key !== "mixed";
      return {
        predictedTitle: BAR_LABEL_BY_CANONICAL[key],
        confidencePct: Math.min(100, Math.max(0, pct)),
        categoryLabel: recyclable ? "Recyclable" : "Non-recyclable",
        wasteTypeShort: WASTE_TYPE_SHORT[key] || "Mixed",
        canonicalKey: key,
      };
    }
    return null;
  }
  const key = String(cm.canonical_top || "").toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(BAR_LABEL_BY_CANONICAL, key)) return null;
  const pct = typeof sw[key] === "number" ? sw[key] : 0;
  const recyclable = key !== "organic" && key !== "mixed";
  return {
    predictedTitle: BAR_LABEL_BY_CANONICAL[key],
    confidencePct: Math.min(100, Math.max(0, pct)),
    categoryLabel: recyclable ? "Recyclable" : "Non-recyclable",
    wasteTypeShort: WASTE_TYPE_SHORT[key] || "Mixed",
    canonicalKey: key,
  };
}

export function displayPredictedClass(result) {
  if (result?.nonWasteDetected) return String(result?.predictedClass ?? "").trim();
  const d = baselineDerivedSummary(result);
  if (d) return d.predictedTitle;
  return String(result?.predictedClass ?? "").trim();
}

export function displayWasteType(result) {
  if (result?.nonWasteDetected) return String(result?.wasteType ?? "").trim();
  const d = baselineDerivedSummary(result);
  if (d) return d.wasteTypeShort;
  return String(result?.wasteType ?? "").trim();
}

/** 0–100 — matches top bin % when classifier snapshot exists. */
export function displayConfidence(result) {
  if (result?.nonWasteDetected) return Number(result?.confidence) || 0;
  const d = baselineDerivedSummary(result);
  if (d) return Math.round(d.confidencePct * 100) / 100;
  const c = Number(result?.confidence);
  return Number.isFinite(c) ? c : 0;
}

/** API-style category line for dashboards / ledger. */
export function displayCategory(result) {
  if (result?.nonWasteDetected) return String(result?.category ?? "Not classified as litter").trim();
  const d = baselineDerivedSummary(result);
  if (d) return d.categoryLabel === "Recyclable" ? "Recyclable" : "Non-recyclable";
  const c = String(result?.category ?? "").trim();
  return c || "—";
}

/** Probability rows — same order logic as Image Classification chart. */
export function probBarsForChart(res) {
  if (!res) return [];
  const snap = res.wasteClassifierSnapshot;
  const pctObj = snap?.six_way_probs_pct;
  if (snap && !snap.error && pctObj && typeof pctObj === "object") {
    const rows = Object.keys(pctObj).map((key) => ({
      label: BAR_LABEL_BY_CANONICAL[key] || key,
      pct: typeof pctObj[key] === "number" ? pctObj[key] : 0,
    }));
    rows.sort((a, b) => b.pct - a.pct);
    return rows;
  }
  const direct = res.probs;
  if (Array.isArray(direct) && direct.length) return direct;
  const fb = res.researchWasteHypothesis?.provisional_probability_bars;
  return Array.isArray(fb) ? fb : [];
}
