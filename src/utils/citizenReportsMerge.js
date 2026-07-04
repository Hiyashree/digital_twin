/**
 * Offline-safe merge for **Waste observation** reports when POST /reports fails
 * (no Flask process, wrong port, etc.). Persists only for this browser session.
 *
 * Rows may include `fieldPhoto.thumbDataUrl` (JPEG data URL) + exact `location.lat`/`lng`
 * from Image Classification field monitoring — WasteMap reads these via merged `citizenReports`.
 *
 * **Admin shadow** (`msw_admin_reports_shadow_v1`): last successful POST responses from Overflow /
 * Dirty Area / synced Waste observation — fills gaps when GET /reports flakes or Flask restarted
 * (in-memory list cleared) but the browser still has the rows.
 */
const LOCAL_KEY = "msw_local_vision_v1";
const ADMIN_SHADOW_KEY = "msw_admin_reports_shadow_v1";

/** Ensure the row returned by POST /reports appears in the list used for merge (GET can fail after POST). */
export function reconcileReportsAfterPost(serverReports, postedReport) {
  const list = Array.isArray(serverReports) ? [...serverReports] : [];
  if (postedReport && postedReport.id != null) {
    const idx = list.findIndex((r) => r.id === postedReport.id);
    if (idx >= 0) list[idx] = postedReport;
    else list.unshift(postedReport);
  }
  return list;
}

export function mergeCitizenReports(serverReports) {
  const server = Array.isArray(serverReports) ? serverReports : [];
  let locals = [];
  let adminShadow = [];
  try {
    locals = JSON.parse(sessionStorage.getItem(LOCAL_KEY) || "[]");
  } catch {
    locals = [];
  }
  try {
    adminShadow = JSON.parse(sessionStorage.getItem(ADMIN_SHADOW_KEY) || "[]");
  } catch {
    adminShadow = [];
  }
  const map = new Map();
  for (const r of server) map.set(r.id, r);
  for (const r of adminShadow) {
    if (r && r.id != null && !map.has(r.id)) map.set(r.id, r);
  }
  for (const r of locals) {
    if (r && r.id != null && !map.has(r.id)) map.set(r.id, r);
  }
  return [...map.values()].sort((a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || "")));
}

/** Call after a successful POST /reports so reload still shows the row if the API process resets. */
export function shadowPersistAdminReport(report) {
  if (!report || report.id == null) return;
  let cur = [];
  try {
    cur = JSON.parse(sessionStorage.getItem(ADMIN_SHADOW_KEY) || "[]");
  } catch {
    cur = [];
  }
  const next = [report, ...cur.filter((r) => r.id !== report.id)].slice(0, 120);
  try {
    sessionStorage.setItem(ADMIN_SHADOW_KEY, JSON.stringify(next));
  } catch {
    sessionStorage.setItem(ADMIN_SHADOW_KEY, JSON.stringify(next.slice(0, 20)));
  }
}

export function shadowRemoveAdminReport(id) {
  if (id == null) return;
  let cur = [];
  try {
    cur = JSON.parse(sessionStorage.getItem(ADMIN_SHADOW_KEY) || "[]");
  } catch {
    cur = [];
  }
  const next = cur.filter((r) => r.id !== id);
  sessionStorage.setItem(ADMIN_SHADOW_KEY, JSON.stringify(next));
}

export function appendLocalVisionReport(report) {
  let cur = [];
  try {
    cur = JSON.parse(sessionStorage.getItem(LOCAL_KEY) || "[]");
  } catch {
    cur = [];
  }
  cur.unshift(report);
  try {
    sessionStorage.setItem(LOCAL_KEY, JSON.stringify(cur.slice(0, 120)));
  } catch {
    sessionStorage.setItem(LOCAL_KEY, JSON.stringify(cur.slice(0, 20)));
  }
}
