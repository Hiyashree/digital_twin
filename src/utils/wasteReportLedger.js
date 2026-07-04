/**
 * Persisted rows for Waste Reports: each successful image classification (with rough kg estimate).
 * localStorage — same origin as classificationMetrics.
 */

const KEY = "msw_waste_report_ledger_v1";
export const WASTE_REPORT_LEDGER_STORAGE_KEY = KEY;
export const WASTE_REPORT_LEDGER_UPDATED_EVENT = "msw-waste-report-ledger-updated";

const MAX_ENTRIES = 2000;

function safeParse(raw) {
  try {
    const a = JSON.parse(raw || "[]");
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}

function emitUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(WASTE_REPORT_LEDGER_UPDATED_EVENT));
}

/**
 * @param {object} p
 * @param {string} [p.fileName]
 * @param {string} [p.predictedClass]
 * @param {string} [p.wasteType]
 * @param {boolean} p.recyclable
 * @param {number} [p.confidence] 0–100
 * @param {number} p.estimatedKg
 * @param {number} [p.estimatedVolumeL]
 * @param {number} [p.lat]
 * @param {number} [p.lng]
 * @param {string} [p.source] classify | field | site_photo
 */
/**
 * Patch the latest ledger row with the same `fileName` (e.g. after user confirms ground truth).
 * @param {string} fileName
 * @param {Partial<{predictedClass: string, wasteType: string, recyclable: boolean, confidence: number, estimatedKg: number, estimatedVolumeL: number}>} patch
 * @returns {boolean} whether a row was updated
 */
export function patchLatestLedgerEntryByFileName(fileName, patch) {
  if (typeof localStorage === "undefined" || !patch) return false;
  const fn = String(fileName || "").trim();
  if (!fn) return false;

  const entries = safeParse(localStorage.getItem(KEY));
  for (let i = entries.length - 1; i >= 0; i--) {
    if (String(entries[i]?.fileName || "").trim() !== fn) continue;
    const row = { ...entries[i] };
    if (patch.predictedClass != null) row.predictedClass = String(patch.predictedClass).slice(0, 160);
    if (patch.wasteType != null) row.wasteType = String(patch.wasteType).slice(0, 100);
    if (patch.recyclable != null) row.recyclable = Boolean(patch.recyclable);
    if (patch.confidence != null && Number.isFinite(patch.confidence)) row.confidence = patch.confidence;
    if (patch.estimatedKg != null && Number.isFinite(Number(patch.estimatedKg))) {
      row.estimatedKg = Math.round(Number(patch.estimatedKg) * 1000) / 1000;
    }
    if (patch.estimatedVolumeL != null && Number.isFinite(Number(patch.estimatedVolumeL))) {
      row.estimatedVolumeL = Math.round(Number(patch.estimatedVolumeL) * 1000) / 1000;
    }
    entries[i] = row;
    try {
      localStorage.setItem(KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
      emitUpdated();
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export function appendWasteReportLedgerEntry(p) {
  if (typeof localStorage === "undefined" || !p) return;
  const kg = Number(p.estimatedKg);
  if (!Number.isFinite(kg) || kg < 0) return;

  const entries = safeParse(localStorage.getItem(KEY));
  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `wr-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  const row = {
    id,
    ts: typeof p.ts === "number" && Number.isFinite(p.ts) ? p.ts : Date.now(),
    fileName: p.fileName != null ? String(p.fileName).slice(0, 240) : "",
    predictedClass: p.predictedClass != null ? String(p.predictedClass).slice(0, 160) : "",
    wasteType: p.wasteType != null ? String(p.wasteType).slice(0, 100) : "",
    recyclable: Boolean(p.recyclable),
    confidence: typeof p.confidence === "number" && Number.isFinite(p.confidence) ? p.confidence : 0,
    estimatedKg: Math.round(kg * 1000) / 1000,
    estimatedVolumeL:
      typeof p.estimatedVolumeL === "number" && Number.isFinite(p.estimatedVolumeL)
        ? Math.round(p.estimatedVolumeL * 1000) / 1000
        : undefined,
    lat: typeof p.lat === "number" && Number.isFinite(p.lat) ? p.lat : undefined,
    lng: typeof p.lng === "number" && Number.isFinite(p.lng) ? p.lng : undefined,
    source: p.source != null ? String(p.source).slice(0, 32) : "classify",
  };

  entries.push(row);
  const trimmed = entries.slice(-MAX_ENTRIES);
  try {
    localStorage.setItem(KEY, JSON.stringify(trimmed));
  } catch {
    /* quota */
  }
  emitUpdated();
}

export function getWasteReportLedger() {
  return safeParse(typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null);
}

/** @returns {{ totalKg: number, recyclableKg: number, nonRecyclableKg: number, count: number }} */
export function aggregateLedgerKg(entries) {
  const list = Array.isArray(entries) ? entries : [];
  let recyclableKg = 0;
  let nonRecyclableKg = 0;
  for (const e of list) {
    const kg = Number(e?.estimatedKg);
    if (!Number.isFinite(kg)) continue;
    if (e.recyclable) recyclableKg += kg;
    else nonRecyclableKg += kg;
  }
  const totalKg = recyclableKg + nonRecyclableKg;
  return { totalKg, recyclableKg, nonRecyclableKg, count: list.length };
}
