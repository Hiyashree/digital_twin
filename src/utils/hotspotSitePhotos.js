/**
 * Admin-uploaded hotspot site imagery: persists estimates from the classify pipeline + GPS.
 * Stored separately from citizenReports; merges only when callers explicitly combine lists.
 */

import { displayConfidence, displayPredictedClass } from "./classificationDisplay.js";

function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** @typedef {object} HotspotSitePhotoRecord */
/** @prop {string} id */
/** @prop {string} [hotspotId] tourism POI name when admin pinned to a named zone */
/** @prop {number} lat */
/** @prop {number} lng */
/** @prop {string} thumbDataUrl */
/** @prop {string} [fullDataUrl] */
/** @prop {number} estimatedKg rough mass from class + confidence heuristic */
/** @prop {number} [estimatedVolumeL] nominal volume assuming ~200 kg/m³ loose litter */
/** @prop {string} modelLabel classifier output (predicted_class) */
/** @prop {number} [confidencePct] */
/** @prop {string} createdAt ISO */
/** @prop {string} [sourceDatasetId] Dataset catalog row id when imported from Dataset Management */
/** @prop {boolean} [classificationAnalyzed] true when the image was run through the in-app classify pipeline (not heuristic dataset-only placement). */

export const HOTSPOT_SITE_PHOTOS_STORAGE_KEY = "msw_hotspot_site_photos_v1";
export const HOTSPOT_SITE_PHOTOS_UPDATED_EVENT = "msw-hotspot-site-photos-updated";

const MAX_RECORDS = 72;
const AVG_LITTER_BULK_KG_PER_M3 = 200;

/**
 * Rough per-item mass (kg) for common demo classes — not calibrated; anchors UI pressure only.
 * “Pile” feel: multiplied by `0.55 + normalizedConfidence * 1.65` below.
 */
const BASE_KG_HINTS = [
  [/mixed|trash|other|general/, 0.06],
  [/organic|food|biological/, 0.04],
  [/metal|can/, 0.12],
  [/glass/, 0.08],
  [/paper|card/, 0.04],
  [/plastic/, 0.05],
  [/chip|snack/, 0.02],
  [/bottle/, 0.05],
  [/cup|cups/, 0.03],
];

function baseKgFromLabel(label) {
  const s = String(label || "").toLowerCase();
  for (const [re, kg] of BASE_KG_HINTS) {
    if (re.test(s)) return kg;
  }
  return 0.055;
}

/**
 * @param {object} result — ImageClassification / classify API shape
 * @returns {{ estimatedKg: number, estimatedVolumeL: number, confidence01: number }}
 */
export function estimateMassFromClassificationResult(result) {
  const confRaw = displayConfidence(result);
  const confidence01 = Number.isFinite(confRaw) ? Math.min(1, Math.max(0, confRaw / 100)) : 0.5;
  const base = baseKgFromLabel(displayPredictedClass(result) || result?.category || "");
  const pile = 0.55 + confidence01 * 1.65;
  const estimatedKg = Math.round(base * pile * 1000) / 1000;
  const estimatedVolumeL = Math.round((estimatedKg / AVG_LITTER_BULK_KG_PER_M3) * 1000) / 1000;
  return { estimatedKg, estimatedVolumeL, confidence01 };
}

export function newSitePhotoId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `hsp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Same WGS84 → one map pin; used to collapse stacked site photos. */
export function hotspotSitePhotoClusterKey(photo) {
  const lat = Number(photo?.lat);
  const lng = Number(photo?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "_";
  return `${lat.toFixed(6)}|${lng.toFixed(6)}`;
}

/**
 * True when this row reflects an actual image-classification run (UI pipeline),
 * not only a dataset/heuristic map placement.
 * @param {HotspotSitePhotoRecord} photo
 */
export function sitePhotoHasClassificationAnalysis(photo) {
  if (!photo || typeof photo !== "object") return false;
  if (photo.classificationAnalyzed === true) return true;
  if (photo.classificationAnalyzed === false) return false;
  const lbl = String(photo.modelLabel || "").trim();
  if (!lbl) return false;
  if (/^dataset import\b/i.test(lbl)) return false;
  return true;
}

function stablePickIndex(seed, length) {
  if (length <= 0) return 0;
  let h = 2166136261 >>> 0;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % length;
}

/**
 * One thumbnail per stacked coordinate: prefer photos that passed real classification;
 * among ties, pick a stable pseudo-random row so the pin does not flicker on re-render.
 * @param {HotspotSitePhotoRecord[]} photos
 * @param {string} [clusterKey]
 * @returns {HotspotSitePhotoRecord | null}
 */
export function pickRepresentativeSitePhotoForCluster(photos, clusterKey = "") {
  const list = (photos || []).filter((p) => {
    const la = Number(p?.lat);
    const ln = Number(p?.lng);
    return Number.isFinite(la) && Number.isFinite(ln);
  });
  if (!list.length) return null;
  if (list.length === 1) return list[0];
  const analyzed = list.filter(sitePhotoHasClassificationAnalysis);
  const pool = analyzed.length ? analyzed : list;
  const sorted = [...pool].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const seed = `${clusterKey}|${sorted.map((p) => p.id).join(",")}`;
  const idx = stablePickIndex(seed, sorted.length);
  return sorted[idx];
}

function parseStored(raw) {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function loadHotspotSitePhotos() {
  if (typeof localStorage === "undefined") return [];
  return parseStored(localStorage.getItem(HOTSPOT_SITE_PHOTOS_STORAGE_KEY));
}

function trimRecords(list) {
  if (list.length <= MAX_RECORDS) return list;
  const sorted = [...list].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return sorted.slice(0, MAX_RECORDS);
}

export function saveHotspotSitePhotos(list) {
  if (typeof localStorage === "undefined") return;
  const next = trimRecords(list);
  try {
    localStorage.setItem(HOTSPOT_SITE_PHOTOS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* quota */
  }
  window.dispatchEvent(new CustomEvent(HOTSPOT_SITE_PHOTOS_UPDATED_EVENT));
}

/**
 * @param {HotspotSitePhotoRecord[]} existing
 * @param {Omit<HotspotSitePhotoRecord, 'id'|'createdAt'> & { id?: string, createdAt?: string }} record
 */
export function removeHotspotSitePhotosBySourceDatasetId(sourceDatasetId) {
  if (!sourceDatasetId || typeof localStorage === "undefined") return;
  const prev = loadHotspotSitePhotos();
  const next = prev.filter((p) => String(p?.sourceDatasetId || "") !== String(sourceDatasetId));
  if (next.length === prev.length) return;
  saveHotspotSitePhotos(next);
}

export function appendHotspotSitePhoto(existing, record) {
  const rec = {
    ...record,
    id: record.id || newSitePhotoId(),
    createdAt: record.createdAt || new Date().toISOString(),
  };
  const next = trimRecords([...(existing || []), rec]);
  saveHotspotSitePhotos(next);
  return next;
}

/** Photo counts toward POI pressure if labeled for that hotspot or coords fall inside radius. */
export function sitePhotoTouchesHotspot(spot, photo) {
  if (!photo || !spot) return false;
  if (photo.hotspotId && String(photo.hotspotId) === String(spot.name)) return true;
  const lat = Number(photo.lat);
  const lng = Number(photo.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return distanceMeters(spot.lat, spot.lng, lat, lng) <= spot.radiusM;
}

/**
 * Aggregate kg credited to one hotspot ring (photos either tagged to spot or geographically inside).
 */
export function totalSitePhotoKgForHotspot(spot, allPhotos) {
  if (!allPhotos?.length) return 0;
  let sum = 0;
  for (const p of allPhotos) {
    if (!sitePhotoTouchesHotspot(spot, p)) continue;
    const kg = Number(p.estimatedKg);
    sum += Number.isFinite(kg) ? kg : 0;
  }
  return Math.round(sum * 1000) / 1000;
}

/**
 * Optional merge for lists that expect `citizenReports`-like rows (GPS + type). Map uses a dedicated prop instead.
 */
export function mergeCitizenReportsWithSitePhotos(citizenReports, sitePhotos) {
  const base = Array.isArray(citizenReports) ? citizenReports : [];
  const extra = (sitePhotos || []).map((p) => ({
    id: `site-photo:${p.id}`,
    type: "Hotspot site photo",
    timestamp: p.createdAt || new Date().toISOString(),
    status: "Logged",
    location: { lat: p.lat, lng: p.lng },
    vision: {
      predictedClass: p.modelLabel,
      confidence: p.confidencePct ?? null,
      category: "",
      model: "",
    },
    fieldPhoto: { thumbDataUrl: p.thumbDataUrl, fileName: "" },
    sitePhotoHotspotId: p.hotspotId || null,
  }));
  return [...base, ...extra];
}
