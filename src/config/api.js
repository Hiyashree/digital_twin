/**
 * Base URL for Flask API (empty in dev → same-origin + Vite proxy).
 * Dev pattern: request `/api/classify_waste` → Vite proxies to `http://127.0.0.1:5000/classify_waste`.
 * Set VITE_API_URL when packaging Electron or pointing at a remote API.
 */
const raw = import.meta.env.VITE_API_URL ?? "";

/**
 * Resolve same-origin API paths. When `VITE_API_URL` is unset, prefix `import.meta.env.BASE_URL`
 * so requests work when the app is hosted under a subpath (e.g. GitHub Pages `/digital_twin/`).
 * Plain `/predict` would otherwise hit the site root and fail outside dev.
 */
export function apiUrl(path) {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (raw) {
    /** Dev proxy uses /api/rewrites → Flask /reports; direct server URLs must drop the /api prefix. */
    const forServer = p.replace(/^\/api(?=\/|$)/, "") || "/";
    return `${String(raw).replace(/\/$/, "")}${forServer}`;
  }
  const base = import.meta.env.BASE_URL ?? "/";
  const trimmed = base.replace(/\/+$/, "");
  const joined = `${trimmed}${p}`.replace(/\/+/g, "/");
  return joined.startsWith("/") ? joined : `/${joined}`;
}
