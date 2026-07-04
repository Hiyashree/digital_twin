/**
 * Spatial / recyclable aggregates from **reports that carry AI vision metadata**
 * (typically `Waste observation` rows created from Image Classification + GPS).
 */

import { getMergedWasteHotspots, distanceMeters } from "./wasteHotspots.js";

function visionHasSignal(v) {
  if (!v || typeof v !== "object") return false;
  return (
    String(v.predictedClass || "").trim() !== "" ||
    v.confidence != null ||
    String(v.category || "").trim() !== ""
  );
}

/**
 * @returns {{ total: number, recyclable: number, nonRecyclable: number, unknown: number }}
 */
export function getVisionObservationStats(reports) {
  let total = 0;
  let recyclable = 0;
  let nonRecyclable = 0;
  let unknown = 0;

  for (const r of reports || []) {
    const v = r?.vision;
    if (!visionHasSignal(v)) continue;

    total += 1;
    const recStr = String(v.recyclable ?? "").trim().toLowerCase();
    const cat = String(v.category ?? "").trim().toLowerCase();
    if (recStr === "yes" || cat === "recyclable") {
      recyclable += 1;
    } else if (recStr === "no" || cat === "non-recyclable" || cat === "non recyclable") {
      nonRecyclable += 1;
    } else {
      unknown += 1;
    }
  }

  return { total, recyclable, nonRecyclable, unknown };
}

function reportGpsInsideHotspot(r) {
  const lat = Number(r?.location?.lat);
  const lng = Number(r?.location?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return getMergedWasteHotspots().some((s) => distanceMeters(s.lat, s.lng, lat, lng) <= s.radiusM);
}

/** Reports whose GPS lies inside any hotspot circle (built-in + custom). */
export function filterReportsInHotspotZones(reports) {
  return (reports || []).filter(reportGpsInsideHotspot);
}

/** Like {@link getVisionObservationStats}, but only rows whose GPS falls inside a hotspot circle. */
export function getVisionObservationStatsInHotspots(reports) {
  const inZone = filterReportsInHotspotZones(reports);
  return getVisionObservationStats(inZone);
}

/**
 * Leaflet.heat expects `[lat, lng, intensity]` with intensity typically 0–1.
 */
export function visionReportsHeatPoints(reports) {
  const out = [];
  for (const r of reports || []) {
    const lat = Number(r?.location?.lat);
    const lng = Number(r?.location?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const v = r?.vision;
    if (!visionHasSignal(v)) continue;
    const conf = typeof v.confidence === "number" && Number.isFinite(v.confidence) ? v.confidence : 50;
    const intensity = Math.min(1, Math.max(0.12, conf / 100));
    out.push([lat, lng, intensity]);
  }
  return out;
}

/**
 * Vision-linked reports whose GPS falls inside a configured tourist hotspot circle (Meghalaya POIs).
 */
export function getTouristZoneVisionStats(reports) {
  let visionCount = 0;
  let inTouristZone = 0;

  for (const r of reports || []) {
    const v = r?.vision;
    if (!visionHasSignal(v)) continue;
    visionCount += 1;

    const lat = Number(r?.location?.lat);
    const lng = Number(r?.location?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const inside = getMergedWasteHotspots().some((s) => distanceMeters(s.lat, s.lng, lat, lng) <= s.radiusM);
    if (inside) inTouristZone += 1;
  }

  return { visionCount, inTouristZone };
}

/** Leaflet.heat points from bin sensors — intensity from fill % (mock / live telemetry). */
export function binFillHeatPoints(bins) {
  const out = [];
  for (const b of bins || []) {
    const lat = Number(b?.lat);
    const lng = Number(b?.lng);
    const fill = Number(b?.fill);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(fill)) continue;
    if (b?.isOnline === false) continue;
    const intensity = Math.min(1, Math.max(0.14, fill / 100));
    out.push([lat, lng, intensity]);
  }
  return out;
}
