/**
 * Leaflet HTML for hotspot site-photo markers (WasteMap).
 */

import { escapeHtml, safeFieldPhotoThumbUrl } from "./citizenReportMapUi.js";

/**
 * @param {import("./hotspotSitePhotos.js").HotspotSitePhotoRecord} photo
 */
export function sitePhotoMarkerDivIconHtml(photo) {
  const thumb = safeFieldPhotoThumbUrl(photo?.thumbDataUrl);
  const border = "#fbbf24";
  if (thumb) {
    return `<div style="width:50px;height:50px;border-radius:50%;overflow:hidden;border:3px solid ${border};box-shadow:0 14px 28px rgba(0,0,0,0.4);background:#0f172a"><img src="${thumb}" alt="" style="width:100%;height:100%;object-fit:cover;display:block"/></div>`;
  }
  return `<div style="display:flex;align-items:center;justify-content:center;width:46px;height:46px;border-radius:50%;background:linear-gradient(135deg,#f59e0b,#ea580c);box-shadow:0 14px 28px rgba(0,0,0,0.35);color:#fff;font-size:1.15rem;border:3px solid #fff">📍</div>`;
}

/**
 * Prefer larger inline image for popup; fallback to thumb.
 */
function popupImageSrc(photo) {
  const full = typeof photo?.fullDataUrl === "string" ? photo.fullDataUrl.trim() : "";
  const fullOk =
    full &&
    /^(data:image\/(jpeg|jpg|png|webp|gif);base64,)/i.test(full.slice(0, 40)) &&
    full.length < 920000;
  if (fullOk) {
    return full;
  }
  return safeFieldPhotoThumbUrl(photo?.thumbDataUrl);
}

/**
 * @param {import("./hotspotSitePhotos.js").HotspotSitePhotoRecord & { linkedHotspotName?: string|null }} photo
 */
export function sitePhotoPopupHtml(photo) {
  const lat = Number(photo?.lat);
  const lng = Number(photo?.lng);
  const kg = Number(photo?.estimatedKg);
  const vol = photo?.estimatedVolumeL != null ? Number(photo.estimatedVolumeL) : null;
  const lbl = escapeHtml(photo?.modelLabel || "—");
  const zone = photo?.linkedHotspotName ? `<br/><span style="font-size:12px;color:#0f766e;font-weight:700">Linked hotspot: ${escapeHtml(photo.linkedHotspotName)}</span>` : "";

  const img = popupImageSrc(photo);
  const imgBlock = img
    ? `<div style="margin-top:8px;border-radius:10px;overflow:hidden;border:1px solid rgba(0,0,0,0.14);max-height:260px;display:flex;align-items:center;justify-content:center;background:#0f172a"><img src="${img}" alt="" style="max-width:280px;max-height:240px;width:auto;height:auto;display:block"/></div>`
    : "";

  const coords =
    Number.isFinite(lat) && Number.isFinite(lng)
      ? `<br/><span style="font-size:11px;color:#64748b">WGS84: <code style="font-size:11px">${escapeHtml(String(lat))}, ${escapeHtml(String(lng))}</code></span>`
      : "";

  const massLine =
    Number.isFinite(kg)
      ? `<br/><span style="font-size:12px;line-height:1.45"><strong>Estimated mass:</strong> ${escapeHtml(kg.toFixed(3))} kg (heuristic)</span>`
      : "";
  const volLine =
    vol != null && Number.isFinite(vol) ? `<br/><span style="font-size:11px;color:#64748b">≈ volume (loose): ${escapeHtml(String(vol))} L @ 200 kg/m³</span>` : "";

  const t = photo?.createdAt ? escapeHtml(new Date(photo.createdAt).toLocaleString()) : "";

  return `<b style="font-size:14px">Hotspot site photo</b>${zone}<br/><span style="font-size:11px;color:#64748b">${t}</span><br/><span style="font-size:12px">AI label: <b>${lbl}</b></span>${massLine}${volLine}${coords}${imgBlock}`;
}
