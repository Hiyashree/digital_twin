/**
 * Merge a remembered human label into the classification result shape used by ImageClassification.
 */

export function categoryFromHumanLabel(label) {
  const s = String(label).toLowerCase();
  if (s.includes("organic") || s.includes("food")) return "Non-recyclable";
  if (s.includes("mixed")) return "Non-recyclable";
  return "Recyclable";
}

export function wasteTypeFromHumanLabel(label) {
  const s = String(label).toLowerCase();
  if (s.includes("organic") || s.includes("food")) return "Organic";
  if (s.includes("plastic")) return "Plastic";
  if (s.includes("metal")) return "Metal";
  if (s.includes("glass")) return "Glass";
  if (s.includes("paper") || s.includes("cardboard")) return "Paper";
  return "Mixed";
}

export function materialFromHumanLabel(label) {
  const s = String(label).toLowerCase();
  if (s.includes("organic") || s.includes("food")) return "Organic fraction — your confirmed label";
  if (s.includes("plastic")) return "Plastic — your confirmed label";
  if (s.includes("metal")) return "Metal — your confirmed label";
  if (s.includes("glass")) return "Glass — your confirmed label";
  if (s.includes("paper") || s.includes("cardboard")) return "Paper fibre — your confirmed label";
  return "Mixed — your confirmed label";
}

/**
 * @param {object} rest classification result from API or demo
 * @param {{ humanLabel: string }} saved from trainingOverridesStorage
 */
export function applySavedHumanLabel(rest, saved) {
  const label = saved.humanLabel;
  const apiPred = rest.predictedClass;
  const cat = categoryFromHumanLabel(label);
  let baseModel = String(rest.model || "").replace(/\s*·\s*Using your saved correction.*$/i, "").trim();
  if (/ResNet-50|baseline JSON|exploratory ViT|\bResNet\b/i.test(baseModel)) {
    const arch = rest.architectureLabel || "Vision Transformer (ViT)";
    const mid = String(rest.modelId || "").trim();
    baseModel = mid ? `${arch} · ${mid}` : arch;
  }
  return {
    ...rest,
    nonWasteDetected: false,
    safeguardMessage: "",
    modelOriginalPrediction: apiPred,
    predictedClass: label,
    category: cat,
    recyclable: cat === "Recyclable" ? "Yes" : "No",
    wasteType: wasteTypeFromHumanLabel(label),
    material: materialFromHumanLabel(label),
    confidence: 100,
    probs: [{ label: `${label} (saved ground truth)`, pct: 100 }],
    model: `${baseModel} · Using your saved correction for this image`,
    organicReviewRecommended: false,
    caveat:
      "This exact file was labeled before — showing your saved ground-truth. New photos still use the neural net until you fine-tune on exported data.",
    learnedFromCorrection: true,
    headlineSource: "human_saved",
    headlineModelId: null,
  };
}
