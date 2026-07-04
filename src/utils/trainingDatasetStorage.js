/**
 * Meghalaya waste imagery — **training queue** (browser-only store).
 *
 * Purpose (workflow 1): images labeled here feed ViT / classification training exports.
 * These rows are separate from field monitoring reports on the hotspot map.
 */

const KEY = "msw_meghalaya_training_queue_v1";
const MAX_ITEMS = 400;

function safeParse(raw) {
  try {
    const a = JSON.parse(raw || "[]");
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}

export function listTrainingSamples() {
  if (typeof localStorage === "undefined") return [];
  return safeParse(localStorage.getItem(KEY));
}

export function trainingSampleCount() {
  return listTrainingSamples().length;
}

/**
 * Save a labeled candidate after admin confirms the human label for AI training.
 * @param {{
 *   thumbDataUrl: string,
 *   fileName?: string,
 *   humanLabel: string,
 *   aiPredictedClass?: string,
 *   aiCategory?: string,
 *   aiConfidence?: number,
 *   notes?: string,
 * }} row
 */
export function pushTrainingSample(row) {
  if (typeof localStorage === "undefined") return;
  const thumb = String(row.thumbDataUrl || "");
  if (!thumb.startsWith("data:image/")) return;

  const entries = listTrainingSamples();
  entries.unshift({
    id: `tr-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    ts: Date.now(),
    region: "Meghalaya (field)",
    humanLabel: String(row.humanLabel || "").slice(0, 120),
    aiPredictedClass: String(row.aiPredictedClass || "").slice(0, 160),
    aiCategory: String(row.aiCategory || "").slice(0, 80),
    aiConfidence: typeof row.aiConfidence === "number" ? row.aiConfidence : null,
    notes: String(row.notes || "").slice(0, 500),
    fileName: String(row.fileName || "").slice(0, 300),
    thumbDataUrl: thumb.slice(0, 120_000),
  });

  try {
    localStorage.setItem(KEY, JSON.stringify(entries.slice(0, MAX_ITEMS)));
    window.dispatchEvent(new Event("msw-training-queue-updated"));
  } catch {
    let n = entries.length;
    while (n > 4) {
      n -= 1;
      try {
        localStorage.setItem(KEY, JSON.stringify(entries.slice(0, n)));
        window.dispatchEvent(new Event("msw-training-queue-updated"));
        return;
      } catch {
        /* shrink until fits */
      }
    }
  }
}

/** JSON manifest without thumbnails — safe to download for pipeline bookkeeping. */
export function exportTrainingManifestJson() {
  const rows = listTrainingSamples().map(({ thumbDataUrl: _t, ...rest }) => rest);
  return JSON.stringify(rows, null, 2);
}

export function clearTrainingQueue() {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(KEY);
  window.dispatchEvent(new Event("msw-training-queue-updated"));
}
