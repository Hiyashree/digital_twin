/** Rolling ViT inference gallery (thumbnail + metadata) — browser-local only. */
const KEY = "msw_ml_gallery_v1";
const MAX_ITEMS = 72;
const MAX_THUMB_CHARS = 180_000;

function safeParse(raw) {
  try {
    const a = JSON.parse(raw || "[]");
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}

export function getMlGallerySamples() {
  if (typeof localStorage === "undefined") return [];
  return safeParse(localStorage.getItem(KEY));
}

/**
 * @param {{ thumbDataUrl: string, recyclable: boolean, confidence: number, predictedClass?: string, fileName?: string }} sample
 */
/**
 * Update the most recent gallery row for the same `fileName`, or push if none match.
 * Used when ground-truth is saved so the ML gallery matches headline / bins.
 */
export function upsertMlGallerySampleByFileName(sample) {
  if (typeof localStorage === "undefined") return;
  const thumb = String(sample.thumbDataUrl || "");
  if (!thumb.startsWith("data:image/") || thumb.length > MAX_THUMB_CHARS) return;

  const fn = String(sample.fileName || "").trim();
  const entries = getMlGallerySamples();
  const idx = fn ? entries.findIndex((e) => String(e.fileName || "").trim() === fn) : -1;

  const row = {
    ...(idx >= 0 ? entries[idx] : {}),
    id: idx >= 0 ? entries[idx].id : `ml-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    ts: Date.now(),
    recyclable: Boolean(sample.recyclable),
    confidence: typeof sample.confidence === "number" ? sample.confidence : 0,
    predictedClass: String(sample.predictedClass || "").slice(0, 120) || "—",
    fileName: String(sample.fileName || "").slice(0, 200),
    thumbDataUrl: thumb,
  };

  let next;
  if (idx >= 0) {
    next = [...entries];
    next[idx] = row;
  } else {
    next = [row, ...entries];
  }

  const baseline = next.slice(0, MAX_ITEMS);
  let working = baseline;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      localStorage.setItem(KEY, JSON.stringify(working));
      window.dispatchEvent(new Event("msw-ml-gallery-updated"));
      return;
    } catch (e) {
      if (working.length <= 1) break;
      working = working.slice(0, working.length - 1);
      void e;
    }
  }
  if (typeof console !== "undefined") {
    console.warn("[mlGalleryStorage] upsert skipped (quota); gallery unchanged.");
  }
}

export function pushMlGallerySample(sample) {
  if (typeof localStorage === "undefined") return;
  const thumb = String(sample.thumbDataUrl || "");
  if (!thumb.startsWith("data:image/") || thumb.length > MAX_THUMB_CHARS) return;

  const entries = getMlGallerySamples();
  entries.unshift({
    id: `ml-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    ts: Date.now(),
    recyclable: Boolean(sample.recyclable),
    confidence: typeof sample.confidence === "number" ? sample.confidence : 0,
    predictedClass: String(sample.predictedClass || "").slice(0, 120) || "—",
    fileName: String(sample.fileName || "").slice(0, 200),
    thumbDataUrl: thumb,
  });

  // Cap to the rolling window FIRST (this is intentional, non-destructive).
  const baseline = entries.slice(0, MAX_ITEMS);

  // NON-destructive write-or-shrink:
  //   * write at full size
  //   * on quota error, drop ONLY the single oldest entry and retry
  //   * try at most 3 oldest-drops before giving up
  //   * if still failing, ABORT WITHOUT TOUCHING THE EXISTING STORED LIST
  //     (so a single bad push can never wipe out the user's gallery — the
  //     previous version's loop dropped dozens of entries silently).
  let working = baseline;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      localStorage.setItem(KEY, JSON.stringify(working));
      window.dispatchEvent(new Event("msw-ml-gallery-updated"));
      return;
    } catch (e) {
      if (working.length <= 1) break;
      // Drop only the SINGLE oldest entry, not a destructive cascade.
      working = working.slice(0, working.length - 1);
      void e;
    }
  }
  // Give up silently — the prior stored list is intact and unmodified.
  if (typeof console !== "undefined") {
    console.warn(
      "[mlGalleryStorage] localStorage quota exceeded; new sample skipped. " +
        "Existing gallery preserved. Consider clearing older entries."
    );
  }
}

export function removeMlGallerySample(id) {
  if (typeof localStorage === "undefined") return;
  const next = getMlGallerySamples().filter((s) => s.id !== id);
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new Event("msw-ml-gallery-updated"));
}

export function clearMlGallery() {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(KEY);
  window.dispatchEvent(new Event("msw-ml-gallery-updated"));
}
