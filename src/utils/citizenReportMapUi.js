/**
 * Leaflet marker HTML for citizen / admin reports (shared by WasteMap.jsx).
 * Field-monitoring uploads attach `fieldPhoto.thumbDataUrl` (JPEG data URL) at exact `location.lat` / `location.lng`.
 */

export function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Inline images on Leaflet HTML markers — same-origin data: URLs only (no javascript:). */
const MAX_INLINE_DATA_URL_CHARS = 950_000;

function isAllowedRasterDataUrl(u) {
  const s = u.slice(0, 48).toLowerCase();
  return (
    s.startsWith("data:image/jpeg;base64,") ||
    s.startsWith("data:image/jpg;base64,") ||
    s.startsWith("data:image/png;base64,") ||
    s.startsWith("data:image/webp;base64,") ||
    s.startsWith("data:image/gif;base64,")
  );
}

/**
 * Allow embedded raster data URLs for map thumbs (dataset imports use JPEG/PNG/WebP; phones often exceed 280k base64).
 */
export function safeFieldPhotoThumbUrl(url) {
  const u = typeof url === "string" ? url.trim() : "";
  if (!isAllowedRasterDataUrl(u)) return "";
  if (u.length > MAX_INLINE_DATA_URL_CHARS) return "";
  return u;
}

function markerGlyphAndStyle(report) {
  const isVision = report.type === "Waste observation";
  const grad =
    report.type === "Overflow"
      ? "linear-gradient(135deg,#ff6b6b,#ff8787)"
      : isVision
        ? "linear-gradient(135deg,#38bdf8,#6366f1)"
        : "linear-gradient(135deg,#ffd166,#ffb84d)";
  const glyph = report.type === "Overflow" ? "🚨" : isVision ? "📷" : "🧹";
  return { grad, glyph };
}

/**
 * @returns {string} inner HTML for L.divIcon
 */
export function reportMarkerDivIconHtml(report) {
  const thumb = safeFieldPhotoThumbUrl(report?.fieldPhoto?.thumbDataUrl);
  const isVision = report.type === "Waste observation";
  if (thumb && isVision) {
    return `<div style="width:46px;height:46px;border-radius:50%;overflow:hidden;border:3px solid #fff;box-shadow:0 12px 24px rgba(0,0,0,0.35);background:#0f172a;"><img src="${thumb}" alt="" style="width:100%;height:100%;object-fit:cover;display:block"/></div>`;
  }
  const { grad, glyph } = markerGlyphAndStyle(report);
  return `<div style="display:flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:50%;background:${grad};box-shadow:0 12px 24px rgba(0,0,0,0.3);color:#fff;font-size:1.1rem;border:3px solid #fff;">${glyph}</div>`;
}

/**
 * @returns {string} HTML for marker.bindPopup
 */
export function reportPopupHtml(report) {
  const lat = Number(report?.location?.lat);
  const lng = Number(report?.location?.lng);
  const parsedTime = report?.timestamp ? new Date(report.timestamp) : null;
  const displayTime =
    parsedTime && !Number.isNaN(parsedTime.getTime()) ? parsedTime.toLocaleString() : "Unknown time";

  const v = report.vision;
  const visionLine =
    v && (v.predictedClass || v.confidence != null)
      ? `<br/><span style="font-size:11px;line-height:1.35">AI: <b>${escapeHtml(v.predictedClass || "—")}</b>${
          v.confidence != null ? ` · ${Number(v.confidence).toFixed(1)}% conf` : ""
        }${v.category ? ` · ${escapeHtml(v.category)}` : ""}</span>`
      : "";

  const thumb = safeFieldPhotoThumbUrl(report?.fieldPhoto?.thumbDataUrl);
  const fn = report?.fieldPhoto?.fileName;
  const imgBlock = thumb
    ? `<div style="margin-top:8px"><img src="${thumb}" alt="" style="max-width:240px;max-height:180px;width:auto;height:auto;border-radius:10px;display:block;border:1px solid rgba(0,0,0,0.12)"/></div>`
    : "";
  const fileLine =
    fn && String(fn).trim()
      ? `<br/><span style="font-size:11px;color:#64748b">Photo: ${escapeHtml(String(fn).slice(0, 120))}</span>`
      : "";

  const coordLine =
    Number.isFinite(lat) && Number.isFinite(lng)
      ? `<br/><span style="font-size:11px;color:#64748b">WGS84: <code style="font-size:11px">${escapeHtml(String(lat))}, ${escapeHtml(String(lng))}</code></span>`
      : "";

  return `<b>${escapeHtml(report.type)}</b><br/>Reported: ${escapeHtml(displayTime)}<br/>Status: ${escapeHtml(String(report.status ?? ""))}${visionLine}${coordLine}${fileLine}${imgBlock}`;
}
