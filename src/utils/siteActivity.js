/** Cross-cutting site activity for Alerts & Notifications (CustomEvent + localStorage). */

export const SITE_ACTIVITY_EVENT = "msw-site-activity-v1";
export const SITE_ACTIVITY_STORAGE_KEY = "msw_site_activity_feed_v1";
export const MAX_SITE_ACTIVITY_ITEMS = 400;

/** @param {string} [type] */
export function notificationTypeToSeverity(type) {
  if (type === "critical") return "critical";
  if (type === "warning") return "high";
  if (type === "success") return "low";
  return "low";
}

/**
 * @param {{
 *   title: string,
 *   desc?: string,
 *   severity?: "critical" | "high" | "medium" | "low",
 *   kind?: "alert" | "notice",
 *   category?: string,
 *   location?: string,
 *   status?: string,
 *   route?: string,
 * }} payload
 */
export function emitSiteActivity(payload) {
  if (typeof window === "undefined") return;
  const title = String(payload.title || "Activity").slice(0, 200);
  const desc = payload.desc != null ? String(payload.desc).slice(0, 2000) : title;
  const sev = payload.severity;
  const severity =
    sev === "critical" || sev === "high" || sev === "medium" || sev === "low" ? sev : "low";
  const kind = payload.kind === "alert" ? "alert" : "notice";
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  const detail = {
    id,
    title,
    desc,
    severity,
    kind,
    category: payload.category || "general",
    location: payload.location || "Portal",
    route: payload.route || "",
    status: payload.status || "new",
    at: Date.now(),
  };
  window.dispatchEvent(new CustomEvent(SITE_ACTIVITY_EVENT, { detail }));
}

export function routePathToLabel(pathname, search) {
  const p = (pathname || "").replace(/\/$/, "") || "/";
  const q = search && search !== "?" ? search : "";
  if (p === "/" || p === "") return `Landing${q ? ` ${q}` : ""}`;
  if (p.endsWith("/dashboard") || p === "/dashboard") return `Dashboard${q}`;
  if (p.includes("/dashboard/classify")) return `Image Classification${q}`;
  if (p.includes("/dashboard/ml-data")) return `ML Data Hub${q}`;
  if (p.includes("/dashboard/bins")) return `Bins${q}`;
  if (p.includes("/dashboard/field")) return `Hotspot Mapping${q}`;
  if (p.includes("/dashboard/analytics")) return `Analytics${q}`;
  if (p.includes("/dashboard/reports")) return `Waste Reports${q}`;
  if (p.includes("/dashboard/datasets")) return `Dataset Management${q}`;
  if (p.includes("/dashboard/alerts")) return `Alerts & Notifications${q}`;
  if (p.includes("/dashboard/users")) return `User Management${q}`;
  if (p.includes("/dashboard/settings")) return `Settings${q}`;
  return `${p}${q}`;
}
