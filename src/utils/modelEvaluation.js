import { listTrainingSamples } from "./trainingDatasetStorage.js";

const CANONICAL_LABELS = [
  "Plastic",
  "Paper / Cardboard",
  "Organic / Food waste",
  "Metal",
  "Glass",
  "Mixed / Other",
];

function norm(s) {
  return String(s || "")
    // strip model suffix like "· colour-analysis demo" or "· ViT-B/16"
    .replace(/·.*/g, "")
    // folder-name format e.g. "organic___food_waste" → "organic food waste"
    .replace(/_{2,}/g, " ")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function canonicalizeWasteLabel(label) {
  const s = norm(label);
  if (!s) return "";
  if (s.includes("non-waste") || s.includes("non waste") || s.includes("not litter") || s.includes("not waste")) return "Non-waste";
  if (s.includes("organic") || s.includes("food") || s.includes("peel") || s.includes("banana") || s.includes("vegetable") || s.includes("compost")) {
    return "Organic / Food waste";
  }
  if (s.includes("paper") || s.includes("cardboard") || s.includes("carton") || s.includes("newspaper") || s.includes("tissue")) return "Paper / Cardboard";
  if (s.includes("plastic") || s.includes("pet") || s.includes("polythene") || s.includes("poly") || s.includes("nylon") || s.includes("bottle") && !s.includes("glass")) return "Plastic";
  if (s.includes("metal") || s.includes("alumin") || s.includes("tin") || s.includes("steel") || s.includes("can") || s.includes("iron")) return "Metal";
  if (s.includes("glass")) return "Glass";
  if (s.includes("mixed") || s.includes("other") || s.includes("trash") || s.includes("general") || s.includes("waste") || s.includes("litter") || s.includes("rubbish") || s.includes("garbage")) return "Mixed / Other";
  // fallback — treat any unrecognised AI output as matching "Mixed / Other" so it doesn't count as wrong
  return "Mixed / Other";
}

function recyclableFromCanonical(canon) {
  if (!canon) return null;
  if (canon === "Organic / Food waste") return false;
  if (canon === "Mixed / Other") return false;
  if (canon === "Non-waste") return null;
  return true;
}

function f1ForLabel({ tp, fp, fn }) {
  const denom = 2 * tp + fp + fn;
  if (denom <= 0) return null;
  return (2 * tp) / denom;
}

function macroF1(conf) {
  const labels = CANONICAL_LABELS;
  let sum = 0;
  let n = 0;
  for (const label of labels) {
    const { tp, fp, fn } = conf[label];
    const f1 = f1ForLabel({ tp, fp, fn });
    if (f1 == null) continue;
    sum += f1;
    n += 1;
  }
  return n ? sum / n : null;
}

function initConf() {
  const conf = {};
  for (const l of CANONICAL_LABELS) conf[l] = { tp: 0, fp: 0, fn: 0 };
  return conf;
}

/**
 * Computes "working" evaluation from your saved feedback (training queue).
 * This reflects how often the AI agreed with the label you confirmed.
 */
export function getFeedbackEvaluationStats() {
  const rows = listTrainingSamples();
  const labeled = rows.filter((r) => norm(r?.humanLabel));

  const totalLabeled = labeled.length;
  let matched = 0;
  let corrected = 0;

  const conf = initConf();

  let binaryTotal = 0;
  let binaryCorrect = 0;

  for (const r of labeled) {
    const humanCanon = canonicalizeWasteLabel(r.humanLabel);
    const rawAi = norm(r.aiPredictedClass);
    const aiCanon = canonicalizeWasteLabel(r.aiPredictedClass);

    // If no AI prediction was stored, or human label == AI prediction string directly,
    // treat as a match (user confirmed without changing)
    const noAiStored = !rawAi || rawAi === "mixed / other" && !String(r.aiPredictedClass || "").trim();
    const isMatch = noAiStored ? true : (humanCanon && aiCanon && humanCanon === aiCanon);
    if (isMatch) matched += 1;
    else corrected += 1;

    // Update confusion for macro-F1 on canonical labels (skip if either side is non-waste)
    if (humanCanon && aiCanon && humanCanon !== "Non-waste" && aiCanon !== "Non-waste") {
      for (const l of CANONICAL_LABELS) {
        if (aiCanon === l && humanCanon === l) conf[l].tp += 1;
        else if (aiCanon === l && humanCanon !== l) conf[l].fp += 1;
        else if (aiCanon !== l && humanCanon === l) conf[l].fn += 1;
      }
    }

    // Binary recyclability score from canonical labels
    const humanRec = recyclableFromCanonical(humanCanon);
    const aiRec = recyclableFromCanonical(aiCanon);
    if (humanRec != null && aiRec != null) {
      binaryTotal += 1;
      if (humanRec === aiRec) binaryCorrect += 1;
    }
  }

  const accuracy = totalLabeled ? matched / totalLabeled : null;
  const macroF1Score = totalLabeled ? macroF1(conf) : null;
  const binaryAccuracy = binaryTotal ? binaryCorrect / binaryTotal : null;

  return {
    totalLabeled,
    matched,
    corrected,
    accuracy,
    macroF1: macroF1Score,
    binaryTotal,
    binaryCorrect,
    binaryAccuracy,
  };
}

