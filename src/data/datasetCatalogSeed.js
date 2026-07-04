/** Start with no fabricated catalog rows — only user-added datasets (import modal) appear here. */
export const DATASET_CATALOG_SEED = [];

/**
 * Legacy demo rows once shipped with the template (fake image counts / GB). Stripped on load so the
 * catalog never presents unverified numbers as fact.
 */
export const FABRICATED_DATASET_NAMES = new Set([
  "Plastic Waste Dataset",
  "Paper & Cardboard Dataset",
  "Recyclability QC Dataset",
  "Organic / Food Waste Dataset",
  "Metal & Glass Mixed Dataset",
]);

/** Match legacy demo rows even if casing/spacing drifted in stored JSON. */
export function isFabricatedDatasetName(name) {
  const s = String(name ?? "").trim();
  if (!s) return false;
  if (FABRICATED_DATASET_NAMES.has(s)) return true;
  const lower = s.toLowerCase().replace(/\s+/g, " ");
  for (const f of FABRICATED_DATASET_NAMES) {
    if (f.toLowerCase().replace(/\s+/g, " ") === lower) return true;
  }
  return false;
}
