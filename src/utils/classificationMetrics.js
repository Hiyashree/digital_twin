/** Persisted classification runs for dashboard KPIs (localStorage). */
const KEY = "msw_vit_classification_log_v1";
const MAX_ENTRIES = 8000;

function safeParse(raw) {
  try {
    const a = JSON.parse(raw || "[]");
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}

/** @param {{ omitFromKpi?: boolean }} extras — set when safeguard abstains (non-litter) so hotspot KPIs stay meaningful */
export function recordClassification({ recyclable, confidence, predictedClass, wasteType, omitFromKpi }) {
  if (omitFromKpi) return;
  const rec = Boolean(recyclable);
  const conf = typeof confidence === "number" && Number.isFinite(confidence) ? confidence : 0;
  const entries = safeParse(typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null);
  const row = { ts: Date.now(), recyclable: rec, confidence: conf };
  if (predictedClass != null && predictedClass !== "") row.predictedClass = String(predictedClass).slice(0, 120);
  if (wasteType != null && wasteType !== "") row.wasteType = String(wasteType).slice(0, 80);
  entries.push(row);
  const trimmed = entries.slice(-MAX_ENTRIES);
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(KEY, JSON.stringify(trimmed));
    window.dispatchEvent(new Event("msw-classification-log-updated"));
  }
}

function filterWindow(entries, startMs, endMs) {
  return entries.filter((e) => e.ts >= startMs && e.ts < endMs);
}

function pctChange(current, previous) {
  if (previous <= 0) return current > 0 ? 100 : null;
  return ((current - previous) / previous) * 100;
}

/**
 * Aggregate stats for dashboard cards + donut.
 * @returns {{
 *   total: number,
 *   recyclable: number,
 *   nonRecyclable: number,
 *   avgConfidence: number | null,
 *   momCountPct: number | null,
 *   weekAccuracyDeltaPct: number | null,
 * }}
 */
export function getClassificationStats() {
  const entries = safeParse(typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null);
  const total = entries.length;
  const recyclable = entries.filter((e) => e.recyclable).length;
  const nonRecyclable = total - recyclable;

  let avgConfidence = null;
  if (total > 0) {
    const sum = entries.reduce((s, e) => s + (Number(e.confidence) || 0), 0);
    avgConfidence = sum / total;
  }

  const now = Date.now();
  const d30 = 30 * 24 * 60 * 60 * 1000;
  const d7 = 7 * 24 * 60 * 60 * 1000;

  const last30 = filterWindow(entries, now - d30, now).length;
  const prev30 = filterWindow(entries, now - 2 * d30, now - d30).length;
  let momCountPct = pctChange(last30, prev30);
  if (prev30 === 0 && last30 === 0) momCountPct = null;

  const confLast7 = filterWindow(entries, now - d7, now);
  const confPrev7 = filterWindow(entries, now - 2 * d7, now - d7);
  let weekAccuracyDeltaPct = null;
  if (confLast7.length && confPrev7.length) {
    const avg7 = confLast7.reduce((s, e) => s + (Number(e.confidence) || 0), 0) / confLast7.length;
    const avgP = confPrev7.reduce((s, e) => s + (Number(e.confidence) || 0), 0) / confPrev7.length;
    if (avgP > 0) weekAccuracyDeltaPct = ((avg7 - avgP) / avgP) * 100;
  }

  return {
    total,
    recyclable,
    nonRecyclable,
    avgConfidence,
    momCountPct,
    weekAccuracyDeltaPct,
    entries,
  };
}

export function clearClassificationLog() {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(KEY);
  window.dispatchEvent(new Event("msw-classification-log-updated"));
}

export function formatInt(n) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(Math.round(n));
}

/**
 * Bucket classification events into the last `dayCount` local calendar days (oldest → newest).
 * Only changes when `entries` change (e.g. new runs recorded).
 */
export function getClassificationDailyBuckets(entries, dayCount = 7) {
  const n = Math.max(1, Math.min(31, dayCount));
  const now = new Date();
  const labels = [];
  const total = new Array(n).fill(0);
  const recyclable = new Array(n).fill(0);

  const dayWindows = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (n - 1 - i));
    d.setHours(0, 0, 0, 0);
    const start = d.getTime();
    const end = start + 86400000;
    dayWindows.push({ start, end });
    labels.push(d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric" }));
  }

  for (const e of entries) {
    if (!e || typeof e.ts !== "number") continue;
    for (let i = 0; i < n; i++) {
      const { start, end } = dayWindows[i];
      if (e.ts >= start && e.ts < end) {
        total[i] += 1;
        if (e.recyclable) recyclable[i] += 1;
        break;
      }
    }
  }

  return { labels, total, recyclable };
}
