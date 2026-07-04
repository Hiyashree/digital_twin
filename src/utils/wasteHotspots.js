import { totalSitePhotoKgForHotspot, sitePhotoTouchesHotspot } from "./hotspotSitePhotos.js";

/**
 * Main tourist-area waste hotspots (Meghalaya) — map overlay only; not bin sensors.
 * Garbage % is derived live from dashboard bin telemetry (see computeHotspotGarbagePercent).
 * POI lat/lng verified 2026-05 (Wikipedia infobox, showcaves.com, Shillong–Sohra tourism POIs).
 */
/** When true, collection route optimization uses these POI centers (not smart-bin coordinates). */
export const COLLECTION_ROUTING_USES_SITE_STOPS = true;

export const wasteHotspots = [
  { name: "Nohkalikai Falls", lat: 25.27556, lng: 91.68667, radiusM: 650 },
  { name: "Mawsmai Cave", lat: 25.29583, lng: 91.69056, radiusM: 600 },
  { name: "Seven Sisters Falls", lat: 25.243, lng: 91.743, radiusM: 650 },
  { name: "Double Decker Living Root Bridge", lat: 25.25126, lng: 91.67197, radiusM: 700 },
  { name: "Mawkdok Dympep Valley View Point", lat: 25.2647, lng: 91.725, radiusM: 600 },
  { name: "Dainthlen Falls", lat: 25.29331, lng: 91.68361, radiusM: 600 },
  { name: "Arwah Cave", lat: 25.29857, lng: 91.72636, radiusM: 550 },
  { name: "Wei Sawdong Falls", lat: 25.29123, lng: 91.67835, radiusM: 600 },
  { name: "Garden of Caves", lat: 25.31244, lng: 91.7605, radiusM: 600 },
  { name: "Wah Kaba Falls", lat: 25.31145, lng: 91.73286, radiusM: 600 },
];

/** Browser-persisted POI zones (name + WGS84 + radius). Merged with {@link wasteHotspots} for maps and routing. */
export const CUSTOM_WASTE_HOTSPOTS_STORAGE_KEY = "msw_custom_waste_hotspots_v1";
export const CUSTOM_WASTE_HOTSPOTS_UPDATED_EVENT = "msw-custom-waste-hotspots-updated";
/** Select value in Image Classification → “new place” flow. */
export const CUSTOM_HOTSPOT_UI_SENTINEL = "__msw_new_hotspot__";

const MAX_CUSTOM_HOTSPOTS = 48;

function normHotspotName(n) {
  return String(n || "")
    .trim()
    .replace(/\s+/g, " ");
}

export function loadCustomWasteHotspots() {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(CUSTOM_WASTE_HOTSPOTS_STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(data)) return [];
    return data
      .map((r) => ({
        name: normHotspotName(r?.name),
        lat: Number(r?.lat),
        lng: Number(r?.lng),
        radiusM: Math.max(120, Math.min(5000, Number(r?.radiusM) || 600)),
      }))
      .filter((r) => r.name && Number.isFinite(r.lat) && Number.isFinite(r.lng));
  } catch {
    return [];
  }
}

function saveCustomWasteHotspots(list) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(CUSTOM_WASTE_HOTSPOTS_STORAGE_KEY, JSON.stringify(list.slice(0, MAX_CUSTOM_HOTSPOTS)));
    window.dispatchEvent(new CustomEvent(CUSTOM_WASTE_HOTSPOTS_UPDATED_EVENT));
  } catch {
    /* quota */
  }
}

/** Built-in POIs plus any zones saved from the admin UI (localStorage). */
export function getMergedWasteHotspots() {
  return [...wasteHotspots, ...loadCustomWasteHotspots()];
}

/**
 * Save or update a user-defined hotspot. If the name matches a built-in POI, returns that row and does not write to custom storage.
 * @returns {{ spot: { name: string, lat: number, lng: number, radiusM: number } | null, stored: boolean }}
 */
export function upsertCustomWasteHotspot({ name, lat, lng, radiusM = 600 }) {
  const spotName = normHotspotName(name);
  const la = Number(lat);
  const ln = Number(lng);
  const rad = Math.max(120, Math.min(5000, Number(radiusM) || 600));
  if (!spotName || !Number.isFinite(la) || !Number.isFinite(ln)) {
    return { spot: null, stored: false };
  }

  const curatedHit = wasteHotspots.find((s) => s.name.toLowerCase() === spotName.toLowerCase());
  if (curatedHit) {
    return { spot: { ...curatedHit }, stored: false };
  }

  let list = loadCustomWasteHotspots();
  const idx = list.findIndex((x) => x.name.toLowerCase() === spotName.toLowerCase());
  const newRow = { name: spotName, lat: la, lng: ln, radiusM: rad };
  if (idx >= 0) list[idx] = newRow;
  else list = [...list, newRow];
  saveCustomWasteHotspots(list);
  return { spot: newRow, stored: true };
}

/**
 * Match admin free-text (dataset name, "Hotspot / area: …", description) to a curated POI for map placement.
 * @param {string} raw
 * @returns {(typeof wasteHotspots)[number] | null}
 */
/** Short admin phrases → official POI name (substring / typo tolerant). */
const HOTSPOT_NAME_ALIASES = [
  [/nohkalikai|cherrapunj[ie].*falls|sohra.*noh/i, "Nohkalikai Falls"],
  [/mawsmai|mawsynram.*cave/i, "Mawsmai Cave"],
  [/seven\s*sisters|nohsngithiang/i, "Seven Sisters Falls"],
  [/double\s*decker|living\s*root/i, "Double Decker Living Root Bridge"],
  [/mawkdok|dympep|valley\s*view/i, "Mawkdok Dympep Valley View Point"],
  [/dainthlen/i, "Dainthlen Falls"],
  [/arwah/i, "Arwah Cave"],
  [/wei\s*sawdong/i, "Wei Sawdong Falls"],
  [/garden\s*of\s*caves/i, "Garden of Caves"],
  [/wah\s*kaba/i, "Wah Kaba Falls"],
];

export function findWasteHotspotByAdminLabel(raw) {
  const merged = String(raw || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  if (!merged) return null;

  for (const [re, official] of HOTSPOT_NAME_ALIASES) {
    if (re.test(merged)) {
      const hit = wasteHotspots.find((s) => s.name === official);
      if (hit) return hit;
    }
  }

  let q = merged;
  const areaMatch = merged.match(/hotspot\s*\/\s*area\s*:\s*([^·|]+?)(?:\s*·|\s*\||$)/i);
  if (areaMatch) q = areaMatch[1].trim();

  const norm = (s) => s.replace(/[^a-z0-9\s-]/gi, " ").replace(/\s+/g, " ").trim();

  /** @type {Array<{ spot: (typeof wasteHotspots)[number], score: number }>} */
  const scored = [];
  for (const spot of getMergedWasteHotspots()) {
    const name = spot.name.toLowerCase();
    const nq = norm(q);
    const nn = norm(name);
    if (!nq || !nn) continue;
    if (nq.includes(nn) || nn.includes(nq)) {
      scored.push({ spot, score: 100 });
      continue;
    }
    const qTokens = nq.split(" ").filter((w) => w.length > 2);
    const nameTokens = nn.split(" ").filter((w) => w.length > 2);
    let hits = 0;
    for (const t of nameTokens) {
      if (qTokens.some((qt) => qt === t || (t.length > 4 && qt.includes(t)) || (qt.length > 4 && t.includes(qt)))) hits++;
    }
    if (hits > 0) scored.push({ spot, score: 40 + hits * 20 });
  }
  if (!scored.length) return null;
  scored.sort((a, b) => b.score - a.score || String(a.spot.name).localeCompare(String(b.spot.name)));
  return scored[0].spot;
}

/** Haversine distance between two WGS84 points (meters). */
export function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** True when a WGS84 point lies inside any hotspot circle (built-in + custom). */
export function pointInsideWasteHotspotArea(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return getMergedWasteHotspots().some((s) => distanceMeters(s.lat, s.lng, lat, lng) <= s.radiusM);
}

/** Bin rows whose coordinates fall inside a hotspot circle (same geometry as the map overlay). */
export function binsWithinHotspotAreas(bins) {
  return (bins || []).filter((b) => {
    const lat = Number(b.lat);
    const lng = Number(b.lng);
    return pointInsideWasteHotspotArea(lat, lng);
  });
}

/**
 * Real-time-style garbage pressure for a hotspot: inverse-distance-weighted mean of bin fill %.
 * Nearby bins dominate; simulated IoT telemetry ticks every ~5s (see binTelemetrySimulator.js).
 * Prefers online bins; falls back to all bins if none are online.
 */
function pressureBoostFromSitePhotosKg(kg) {
  const k = Number(kg);
  if (!Number.isFinite(k) || k <= 0) return 0;
  return Math.min(36, Math.sqrt(k) * 13.5);
}

/** @param {import("./hotspotSitePhotos.js").HotspotSitePhotoRecord[]} [sitePhotos] */
export function computeHotspotGarbagePercent(spot, bins, sitePhotos = []) {
  let base = 0;
  if (bins?.length) {
    const online = bins.filter((b) => b.isOnline !== false);
    const pool = online.length ? online : bins;

    let sumW = 0;
    let sumV = 0;
    for (const bin of pool) {
      const fill = Number(bin.fill);
      if (!Number.isFinite(fill)) continue;
      const d = Math.max(80, distanceMeters(spot.lat, spot.lng, bin.lat, bin.lng));
      const w = 1 / (d * d);
      sumW += w;
      sumV += w * fill;
    }
    if (sumW > 0) base = Math.max(0, sumV / sumW);
  }

  const photoKg = totalSitePhotoKgForHotspot(spot, sitePhotos);
  const boosted = base + pressureBoostFromSitePhotosKg(photoKg);
  return Math.min(100, Math.max(0, boosted));
}

/** Leaflet circle styles — opacity ramps slightly with severity; stays readable on OSM tiles. */
export function hotspotCircleStyle(percent) {
  const p = Math.min(100, Math.max(0, percent));
  if (p >= 70) {
    return {
      weight: 3,
      color: "#7f1d1d",
      fillColor: "#991b1b",
      fillOpacity: 0.38,
    };
  }
  if (p >= 40) {
    return {
      weight: 2,
      color: "#b91c1c",
      fillColor: "#dc2626",
      fillOpacity: 0.32,
    };
  }
  return {
    weight: 2,
    color: "#be123c",
    fillColor: "#f87171",
    fillOpacity: 0.24,
  };
}

/** @param {import("./hotspotSitePhotos.js").HotspotSitePhotoRecord[]} sitePhotos */
export function hotspotPopupHtml(spot, percent, sitePhotos = []) {
  const p = Math.round(Math.min(100, Math.max(0, percent)));
  const esc = (s) =>
    String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const photoKg = totalSitePhotoKgForHotspot(spot, sitePhotos);
  const photoNote =
    photoKg > 0
      ? `<br/><span style="font-size:11px;opacity:0.88">Site photo signal: ~${esc(photoKg)} kg (heuristic contribution to pressure)</span>`
      : "";
  const galleryTip = `<br/><span style="font-size:11px;opacity:0.85"><strong>Slideshow:</strong> click this zone or any hotspot photo pin to browse <em>every</em> dataset + field-classification image in this ring.</span>`;
  return `<b>${esc(spot.name)}</b><br/>Zone pressure: <b>${p}%</b><br/><span style="font-size:11px;opacity:0.88">Site photos and optional nearby sensors when configured (routes use this POI center)</span>${photoNote}${galleryTip}`;
}

/**
 * Tourism POI centers to send on the truck route, ordered by garbage pressure (see computeHotspotGarbagePercent).
 * `bins` is only used to score severity; coordinates always come from merged hotspot zones.
 */
/** @param {import("./hotspotSitePhotos.js").HotspotSitePhotoRecord | null | undefined} photo */
export function linkedHotspotNameForSitePhoto(photo) {
  if (!photo) return null;
  if (photo.hotspotId && String(photo.hotspotId).trim()) return String(photo.hotspotId);
  for (const s of getMergedWasteHotspots()) {
    if (sitePhotoTouchesHotspot(s, photo)) return s.name;
  }
  return null;
}

export function collectionStopsFromHotspots(bins, { limit = 6, sitePhotos = [] } = {}) {
  const all = getMergedWasteHotspots();
  if (!all.length) return [];
  const ranked = [...all]
    .map((spot) => ({
      spot,
      severityPercent: computeHotspotGarbagePercent(spot, bins, sitePhotos),
    }))
    .sort(
      (a, b) =>
        b.severityPercent - a.severityPercent || String(a.spot.name).localeCompare(String(b.spot.name))
    );
  const n = Math.max(0, Math.min(limit, ranked.length));
  return ranked.slice(0, n).map(({ spot, severityPercent }) => ({
    id: `site:${spot.name}`,
    name: spot.name,
    lat: spot.lat,
    lng: spot.lng,
    severityPercent,
  }));
}
