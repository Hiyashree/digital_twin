import {
  appendHotspotSitePhoto,
  estimateMassFromClassificationResult,
  loadHotspotSitePhotos,
} from "./hotspotSitePhotos.js";
import { distanceMeters, findWasteHotspotByAdminLabel, getMergedWasteHotspots } from "./wasteHotspots.js";

/** @param {File} file */
export function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || ""));
    fr.onerror = () => reject(fr.error || new Error("read failed"));
    fr.readAsDataURL(file);
  });
}

/** Parse hints like "around 20 kg", "~15kg" from free text. */
export function parseKgHintFromText(text) {
  const s = String(text || "");
  const m = s.match(/(?:~|about|around|≈|ca\.?)?\s*([\d.]+)\s*(?:kg|kgs)\b/i);
  if (!m) return null;
  const v = parseFloat(m[1]);
  return Number.isFinite(v) && v > 0 ? Math.min(5000, v) : null;
}

/**
 * Resolve a curated POI for map pins: free text first, then EXIF GPS inside a hotspot radius.
 * @param {{ hotspotName?: string, name: string, desc?: string, files: File[] }} args
 * @returns {Promise<{ spot: import("./wasteHotspots.js").wasteHotspots[number] | null, via: "text" | "exif" | null }>}
 */
export async function resolveDatasetHotspotPlacement(args) {
  const { hotspotName, name, desc, files } = args;
  const combined = [hotspotName, name, desc].filter(Boolean).join(" · ");
  const fromText = findWasteHotspotByAdminLabel(combined);
  if (fromText) return { spot: fromText, via: "text" };

  const imageFiles = (Array.isArray(files) ? files : []).filter((f) => f && String(f.type || "").startsWith("image/"));
  if (!imageFiles.length) return { spot: null, via: null };

  try {
    const exifrMod = await import("exifr");
    const exifr = exifrMod.default ?? exifrMod;
    for (const file of imageFiles.slice(0, 4)) {
      const buf = await file.arrayBuffer();
      const blob = new Blob([buf], { type: file.type || "image/jpeg" });
      const gps = await exifr.gps(blob);
      if (!gps) continue;
      const lat = Number(gps.latitude);
      const lng = Number(gps.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      for (const s of getMergedWasteHotspots()) {
        if (distanceMeters(s.lat, s.lng, lat, lng) <= s.radiusM) {
          return { spot: s, via: "exif" };
        }
      }
    }
  } catch {
    /* exifr optional / corrupt image */
  }

  return { spot: null, via: null };
}

/**
 * Push dataset images onto `hotspotSitePhotos` so WasteMap / Hotspot Mapping show pins.
 * @param {{ hotspotName?: string, name: string, desc?: string, files: File[], sourceDatasetId: string, spot?: import("./wasteHotspots.js").wasteHotspots[number] }} args
 * @returns {Promise<{ ok: true, spotName: string, placedCount: number } | { ok: false, error: string }>}
 */
export async function appendHotspotDatasetFilesToSitePhotos(args) {
  const { hotspotName, name, desc, files, sourceDatasetId, spot: spotArg } = args;
  const combined = [hotspotName, name, desc].filter(Boolean).join(" · ");
  let spot = spotArg || findWasteHotspotByAdminLabel(combined);
  if (!spot) {
    const resolved = await resolveDatasetHotspotPlacement({ hotspotName, name, desc, files });
    spot = resolved.spot;
  }
  if (!spot) {
    return {
      ok: false,
      error:
        "Could not place this on the map: add a known site in **Hotspot or region** (e.g. Nohkalikai Falls) or use a photo with **GPS inside** that POI. Tip: choose **Hotspot / GIS imagery** as purpose so we always try to pin.",
    };
  }

  const kgHint = parseKgHintFromText(combined);
  let list = loadHotspotSitePhotos();

  for (const file of files) {
    const dataUrl = await readFileAsDataURL(file);
    if (!dataUrl.startsWith("data:image/")) {
      return { ok: false, error: "Each file must be an image (JPEG/PNG/WebP)." };
    }

    const est = estimateMassFromClassificationResult({
      predictedClass: "Mixed waste (dataset import)",
      confidence: kgHint != null ? 88 : 52,
    });
    const estimatedKg = kgHint != null ? kgHint : est.estimatedKg;
    const estimatedVolumeL =
      kgHint != null ? Math.round((kgHint / 200) * 1000) / 1000 : est.estimatedVolumeL;

    list = appendHotspotSitePhoto(list, {
      hotspotId: spot.name,
      lat: spot.lat,
      lng: spot.lng,
      thumbDataUrl: dataUrl,
      fullDataUrl: dataUrl.length < 880000 ? dataUrl : undefined,
      estimatedKg,
      estimatedVolumeL,
      classificationAnalyzed: false,
      modelLabel: `Dataset import · ${String(name || "hotspot").slice(0, 48)}`,
      confidencePct: kgHint != null ? 85 : 60,
      sourceDatasetId,
    });
  }

  return { ok: true, spotName: spot.name, placedCount: files.length };
}
