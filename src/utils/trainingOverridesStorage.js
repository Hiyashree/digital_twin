/**
 * Remember ground-truth labels **per image** (SHA-256 of raw bytes).
 * Re-uploading the **same file** then applies your label so the UI reflects what you taught it.
 * (Different photos of the same object get new hashes — full generalization needs exported data + fine-tuning.)
 */

const KEY = "msw_training_label_overrides_v1";
const MAX_ENTRIES = 600;

async function sha256Hex(blob) {
  const buf = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buf);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashImagePreview(previewUrl) {
  const blob = await fetch(previewUrl).then((r) => r.blob());
  return sha256Hex(blob);
}

function loadMap() {
  try {
    const raw = localStorage.getItem(KEY);
    const o = JSON.parse(raw || "{}");
    return o && typeof o === "object" ? o : {};
  } catch {
    return {};
  }
}

function trimOldest(map) {
  const ids = Object.keys(map);
  if (ids.length <= MAX_ENTRIES) return map;
  const withTs = ids.map((id) => ({ id, ts: map[id]?.savedAt || 0 }));
  withTs.sort((a, b) => a.ts - b.ts);
  const next = { ...map };
  while (Object.keys(next).length > MAX_ENTRIES) {
    const drop = withTs.shift();
    if (drop) delete next[drop.id];
  }
  return next;
}

/**
 * @param {{ humanLabel: string, aiPredictedClass?: string }} payload
 */
export async function saveTrainingOverride(previewUrl, payload) {
  if (typeof localStorage === "undefined") return;
  const hash = await hashImagePreview(previewUrl);
  const map = trimOldest(loadMap());
  map[hash] = {
    humanLabel: String(payload.humanLabel || "").slice(0, 120),
    aiPredictedClass: String(payload.aiPredictedClass || "").slice(0, 160),
    savedAt: Date.now(),
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
    window.dispatchEvent(new Event("msw-training-override-updated"));
  } catch {
    /* quota */
  }
}

export function getTrainingOverrideSync(hashHex) {
  const map = loadMap();
  return map[hashHex] || null;
}

export async function getTrainingOverrideForPreview(previewUrl) {
  const hash = await hashImagePreview(previewUrl);
  return { hash, override: getTrainingOverrideSync(hash) };
}
