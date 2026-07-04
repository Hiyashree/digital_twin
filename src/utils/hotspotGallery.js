import { safeFieldPhotoThumbUrl } from "./citizenReportMapUi.js";
import { sitePhotoTouchesHotspot } from "./hotspotSitePhotos.js";

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

/** Allow larger inline payloads in fullscreen viewer than map marker HTML. */
const GALLERY_MAX_DATA_URL = 2_500_000;

/**
 * @param {string} [u]
 * @returns {string}
 */
export function pickGalleryDisplaySrc(u) {
  const s = typeof u === "string" ? u.trim() : "";
  if (!s) return "";
  const head = s.slice(0, 48).toLowerCase();
  if (
    !head.startsWith("data:image/jpeg;base64,") &&
    !head.startsWith("data:image/jpg;base64,") &&
    !head.startsWith("data:image/png;base64,") &&
    !head.startsWith("data:image/webp;base64,") &&
    !head.startsWith("data:image/gif;base64,")
  ) {
    return "";
  }
  if (s.length > GALLERY_MAX_DATA_URL) return "";
  return s;
}

/**
 * Prefer full-resolution URL when safe, else thumb (map-safe helper), else gallery-tolerant scan.
 * @param {{ thumbDataUrl?: string, fullDataUrl?: string }} row
 */
export function pickSlideDisplaySrc(row) {
  const candidates = [row?.fullDataUrl, row?.thumbDataUrl].filter(Boolean);
  for (const c of candidates) {
    const strict = safeFieldPhotoThumbUrl(c);
    if (strict) return strict;
    const loose = pickGalleryDisplaySrc(c);
    if (loose) return loose;
  }
  return "";
}

/**
 * @typedef {{ key: string, kind: "site" | "vision", displaySrc: string, title: string, detail: string, createdAt: string }} HotspotGallerySlide
 */

/**
 * Every site photo + every waste observation with coordinates inside the hotspot ring (nothing dropped).
 * @param {import("./hotspotSitePhotos.js").HotspotSitePhotoRecord[]} sitePhotos
 * @param {object[]} citizenReports
 * @returns {HotspotGallerySlide[]}
 */
export function buildHotspotZoneGallery(spot, sitePhotos, citizenReports) {
  const slides = [];

  for (const p of sitePhotos || []) {
    if (!spot || !sitePhotoTouchesHotspot(spot, p)) continue;
    const id = String(p?.id ?? "");
    const displaySrc = pickSlideDisplaySrc({
      thumbDataUrl: p?.thumbDataUrl,
      fullDataUrl: p?.fullDataUrl,
    });
    const title = String(p?.modelLabel || "Hotspot site imagery").trim() || "Hotspot site imagery";
    const detail =
      p?.hotspotId && String(p.hotspotId) !== String(spot.name)
        ? `Linked: ${p.hotspotId} · shown under ${spot.name}`
        : `Inside ${spot.name}`;
    slides.push({
      key: `site:${id || slides.length}`,
      kind: "site",
      displaySrc,
      title,
      detail,
      createdAt: String(p?.createdAt || ""),
    });
  }

  for (const r of citizenReports || []) {
    if (r?.type !== "Waste observation") continue;
    const lat = Number(r?.location?.lat);
    const lng = Number(r?.location?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (distanceMeters(spot.lat, spot.lng, lat, lng) > spot.radiusM) continue;

    const rid = String(r?.id ?? "");
    const thumb = r?.fieldPhoto?.thumbDataUrl;
    const displaySrc = pickSlideDisplaySrc({ thumbDataUrl: thumb, fullDataUrl: thumb });
    const pred = String(r?.vision?.predictedClass || "").trim();
    const conf =
      typeof r?.vision?.confidence === "number" && Number.isFinite(r.vision.confidence)
        ? ` · ${Number(r.vision.confidence).toFixed(1)}% conf`
        : "";
    const title = pred ? `Field · ${pred}` : "Waste observation (field)";
    const detail = `Image classification capture · ${spot.name}${conf}`;
    slides.push({
      key: `vision:${rid || slides.length}`,
      kind: "vision",
      displaySrc,
      title,
      detail,
      createdAt: String(r?.timestamp || r?.createdAt || ""),
    });
  }

  slides.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return slides;
}

/**
 * @param {import("./hotspotSitePhotos.js").HotspotSitePhotoRecord} photo
 * @param {Array<{ name: string, lat: number, lng: number, radiusM: number }>} zones
 */
export function primarySpotForSitePhoto(photo, zones) {
  const list = Array.isArray(zones) ? zones : [];
  if (photo?.hotspotId) {
    const byName = list.find((z) => String(z.name) === String(photo.hotspotId));
    if (byName) return byName;
  }
  for (const z of list) {
    if (sitePhotoTouchesHotspot(z, photo)) return z;
  }
  return null;
}

/** @returns {{ name: string, lat: number, lng: number, radiusM: number } | null} */
export function firstHotspotContainingLatLng(lat, lng, zones) {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
  for (const z of zones || []) {
    if (distanceMeters(z.lat, z.lng, la, ln) <= z.radiusM) return z;
  }
  return null;
}
