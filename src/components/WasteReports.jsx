import { NavLink } from "react-router-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getClassificationStats,
  formatInt,
  getClassificationDailyBuckets,
} from "../utils/classificationMetrics.js";
import {
  aggregateLedgerKg,
  getWasteReportLedger,
  WASTE_REPORT_LEDGER_STORAGE_KEY,
  WASTE_REPORT_LEDGER_UPDATED_EVENT,
} from "../utils/wasteReportLedger.js";
import {
  CUSTOM_WASTE_HOTSPOTS_STORAGE_KEY,
  CUSTOM_WASTE_HOTSPOTS_UPDATED_EVENT,
  getMergedWasteHotspots,
} from "../utils/wasteHotspots.js";
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
} from "chart.js";
import { Doughnut, Line } from "react-chartjs-2";
import { portal as t } from "./portal/portalTheme.js";
import VitTrainingQueueBanner from "./VitTrainingQueueBanner.jsx";

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement, Filler);

const DASH = "/dashboard";

const DATE_RANGE_LABEL_STATIC = "Connect weighbridge / ERP API for a live period";

/** Weighbridge placeholders until an ERP feed is wired; image rows use the ledger below. */
const REPORT_KPIS_ERP = {
  hotspots: 0,
  collectionPoints: 0,
  trendPct: { total: 0, rec: 0, non: 0, hotspots: 0, points: 0 },
};

const HOTSPOTS_TOP_SEED = [];

function formatTrendLine(pct) {
  if (pct == null || !Number.isFinite(pct) || pct === 0) return "No prior-period comparison loaded";
  const sign = pct >= 0 ? "↑" : "↓";
  return `${sign} ${Math.abs(pct).toFixed(1)}% vs prior period (when API provides it)`;
}

function trendSubColor(pct) {
  return pct >= 0 ? "#86efac" : "#fca5a5";
}

const PAGE_SIZE = 7;

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeCsvCell(val) {
  const s = String(val ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function metricsToExportRows(metrics) {
  const fmt = (n) => Number(n).toLocaleString(undefined, { maximumFractionDigits: 4 });
  return metrics.map((r) => ({
    name: r.name,
    sub: r.sub,
    rec: fmt(r.recN),
    non: fmt(r.nonN),
    total: fmt(r.recN + r.nonN),
    status: r.status,
  }));
}

function buildReportHtml(generatedOn, showPdfHint, referenceTotalKg, exportRows, reportPeriodLabel = DATE_RANGE_LABEL_STATIC) {
  const hint = showPdfHint
    ? `<p style="font-size:13px;color:#333;margin:0 0 16px;padding:12px;background:#eef7ff;border-radius:8px;border:1px solid #bcd;"><strong>Save as PDF:</strong> When the print dialog opens, choose <strong>Save as PDF</strong> or <strong>Microsoft Print to PDF</strong>.</p>`
    : "";
  const rows = exportRows
    .map(
      (row) =>
        `<tr>
        <td>${escapeHtml(row.name)}</td>
        <td>${escapeHtml(row.sub)}</td>
        <td style="text-align:right">${escapeHtml(row.rec)}</td>
        <td style="text-align:right">${escapeHtml(row.non)}</td>
        <td style="text-align:right">${escapeHtml(row.total)}</td>
        <td>${escapeHtml(row.status)}</td>
      </tr>`
    )
    .join("");
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/><title>Waste Report — Meghalaya Smart Waste</title>
<style>
  body { font-family: system-ui, Segoe UI, sans-serif; padding: 28px; color: #111; max-width: 960px; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 8px; }
  .meta { font-size: 14px; line-height: 1.65; margin-bottom: 20px; color: #333; }
  table { border-collapse: collapse; width: 100%; font-size: 12px; }
  th, td { border: 1px solid #ccc; padding: 8px 10px; }
  th { background: #f2f2f2; text-align: left; }
  td.num { text-align: right; }
  .foot { margin-top: 20px; font-size: 11px; color: #666; }
</style></head><body>
${hint}
<h1>Meghalaya Smart Waste — Waste report</h1>
<div class="meta">
  <div><strong>Report period:</strong> ${escapeHtml(reportPeriodLabel)}</div>
  <div><strong>Generated:</strong> ${escapeHtml(generatedOn)}</div>
  <div><strong>Reference total:</strong> ${referenceTotalKg > 0 ? `${escapeHtml(String(referenceTotalKg.toLocaleString()))} kg` : escapeHtml("— (no weighed data loaded)")}</div>
</div>
<table>
<thead><tr>
  <th>Location</th><th>Area</th><th>Recyclable (kg)</th><th>Non-Recyclable (kg)</th><th>Total (kg)</th><th>Status</th>
</tr></thead>
<tbody>${rows}</tbody>
</table>
<p class="foot">Meghalaya Smart Waste Portal — export from Waste Reports</p>
</body></html>`;
}

function openReportPrintWindow(generatedOn, showPdfHint, referenceTotalKg, exportRows, reportPeriodLabel) {
  const html = buildReportHtml(generatedOn, showPdfHint, referenceTotalKg, exportRows, reportPeriodLabel);
  const w = window.open("", "_blank", "noopener,noreferrer");
  if (!w) {
    window.alert("Pop-up was blocked. Allow pop-ups for this site to print or save as PDF.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 200);
}

/** Saves a printable HTML file (open in browser → Print → Save as PDF). Works without pop-ups. */
function downloadReportHtmlFile(generatedOn, showPdfHint, referenceTotalKg, exportRows, reportPeriodLabel) {
  const html = buildReportHtml(generatedOn, showPdfHint, referenceTotalKg, exportRows, reportPeriodLabel);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `meghalaya-waste-report-${new Date().toISOString().slice(0, 10)}.html`;
  a.rel = "noopener";
  a.click();
  URL.revokeObjectURL(url);
}

function downloadLocationsCsv(exportRows) {
  const headers = ["Location", "Area", "Recyclable (kg)", "Non-Recyclable (kg)", "Total Waste (kg)", "Status"];
  const lines = [
    headers.map(escapeCsvCell).join(","),
    ...exportRows.map((row) =>
      [row.name, row.sub, row.rec, row.non, row.total, row.status].map(escapeCsvCell).join(",")
    ),
  ];
  const BOM = "\uFEFF";
  const blob = new Blob([BOM + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `meghalaya-waste-report-${new Date().toISOString().slice(0, 10)}.csv`;
  a.rel = "noopener";
  a.click();
  URL.revokeObjectURL(url);
}

function MiniSparkline({ values }) {
  const max = Math.max(...values, 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 28, minWidth: 72 }}>
      {values.map((v, i) => (
        <span
          key={i}
          style={{
            flex: 1,
            minWidth: 4,
            height: `${Math.max(12, (v / max) * 100)}%`,
            borderRadius: 2,
            background: "linear-gradient(180deg, #5cb85c, #449d44)",
            opacity: 0.75 + (i / values.length) * 0.25,
          }}
        />
      ))}
    </div>
  );
}

export default function WasteReports() {
  const [page, setPage] = useState(1);
  const [generatedOn, setGeneratedOn] = useState("");
  const [clsStats, setClsStats] = useState(() => getClassificationStats());
  const [ledger, setLedger] = useState(() => getWasteReportLedger());
  const [hotspotZoneRev, setHotspotZoneRev] = useState(0);

  const refreshCls = useCallback(() => {
    setClsStats(getClassificationStats());
  }, []);

  const refreshLedger = useCallback(() => {
    setLedger(getWasteReportLedger());
  }, []);

  useEffect(() => {
    refreshCls();
    const onStorage = (e) => {
      if (e.key === "msw_vit_classification_log_v1" || e.key === null) refreshCls();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("msw-classification-log-updated", refreshCls);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("msw-classification-log-updated", refreshCls);
    };
  }, [refreshCls]);

  useEffect(() => {
    refreshLedger();
    const onStorage = (e) => {
      if (e.key === WASTE_REPORT_LEDGER_STORAGE_KEY || e.key === null) refreshLedger();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(WASTE_REPORT_LEDGER_UPDATED_EVENT, refreshLedger);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(WASTE_REPORT_LEDGER_UPDATED_EVENT, refreshLedger);
    };
  }, [refreshLedger]);

  useEffect(() => {
    const bump = () => setHotspotZoneRev((n) => n + 1);
    window.addEventListener(CUSTOM_WASTE_HOTSPOTS_UPDATED_EVENT, bump);
    const onStorage = (e) => {
      if (e.key === CUSTOM_WASTE_HOTSPOTS_STORAGE_KEY || e.key === null) bump();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(CUSTOM_WASTE_HOTSPOTS_UPDATED_EVENT, bump);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const reportKpis = useMemo(() => {
    const agg = aggregateLedgerKg(ledger);
    return {
      totalKg: agg.totalKg,
      recyclableKg: agg.recyclableKg,
      nonRecyclableKg: agg.nonRecyclableKg,
      hotspots: getMergedWasteHotspots().length,
      collectionPoints: REPORT_KPIS_ERP.collectionPoints,
      trendPct: REPORT_KPIS_ERP.trendPct,
    };
  }, [ledger, hotspotZoneRev]);

  const dateRangeLabel =
    ledger.length > 0
      ? "This browser — estimated kg from AI-classified waste images"
      : DATE_RANGE_LABEL_STATIC;

  const totalDaysWithData = useMemo(() => {
    if (!ledger.length) return 0;
    const days = new Set(ledger.map((e) => new Date(e.ts).toDateString()));
    return days.size;
  }, [ledger]);

  const locationMetrics = useMemo(() => {
    const rev = [...ledger].reverse();
    return rev.map((e) => {
      const when = new Date(e.ts).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
      const locBit =
        e.lat != null && e.lng != null ? ` · ${Number(e.lat).toFixed(4)}, ${Number(e.lng).toFixed(4)}` : "";
      const recN = e.recyclable ? Number(e.estimatedKg) || 0 : 0;
      const nonN = e.recyclable ? 0 : Number(e.estimatedKg) || 0;
      const conf = Number(e.confidence) || 0;
      return {
        id: e.id,
        name: e.fileName || "(unnamed image)",
        sub: `${when} · ${e.predictedClass || "—"}${locBit}`,
        thumb: "📷",
        recN,
        nonN,
        trend: [recN + nonN, recN + nonN, recN + nonN],
        status: `${Math.round(conf)}% conf`,
        statusTone: conf >= 60 ? "#34d399" : "#eab308",
      };
    });
  }, [ledger]);

  const hotspotRows = useMemo(() => HOTSPOTS_TOP_SEED.map((h) => ({ ...h })), []);

  const totalPages = Math.max(1, Math.ceil(locationMetrics.length / PAGE_SIZE));
  const safePage = Math.max(1, Math.min(page, totalPages));
  const slice = locationMetrics.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const dailyBuckets = useMemo(() => getClassificationDailyBuckets(clsStats.entries, 21), [clsStats.entries]);

  const trendData = useMemo(() => {
    const nonRec = dailyBuckets.total.map((t, i) => Math.max(0, t - (dailyBuckets.recyclable[i] ?? 0)));
    return {
      labels: dailyBuckets.labels,
      datasets: [
        {
          label: "Recyclable (runs)",
          data: dailyBuckets.recyclable,
          borderColor: "#5cb85c",
          backgroundColor: "rgba(92,184,92,0.15)",
          fill: true,
          tension: 0.35,
          pointRadius: 2,
          borderWidth: 2,
        },
        {
          label: "Non-recyclable (runs)",
          data: nonRec,
          borderColor: "#ef4444",
          backgroundColor: "rgba(239,68,68,0.12)",
          fill: true,
          tension: 0.35,
          pointRadius: 2,
          borderWidth: 2,
        },
        {
          label: "Total classifications",
          data: dailyBuckets.total,
          borderColor: "#38bdf8",
          backgroundColor: "rgba(56,189,248,0.08)",
          fill: true,
          tension: 0.35,
          pointRadius: 2,
          borderWidth: 2,
        },
      ],
    };
  }, [dailyBuckets]);

  const trendOpts = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        x: {
          grid: { color: "rgba(255,255,255,0.06)" },
          ticks: { color: "rgba(228,224,236,0.55)", maxTicksLimit: 8, font: { size: 10 } },
        },
        y: {
          grid: { color: "rgba(255,255,255,0.06)" },
          ticks: {
            color: "rgba(228,224,236,0.55)",
            font: { size: 10 },
            callback: (v) => (v >= 1000 ? `${v / 1000}k` : v),
          },
        },
      },
      plugins: {
        legend: {
          position: "top",
          align: "start",
          labels: { color: "rgba(228,224,236,0.88)", boxWidth: 12, font: { size: 11 }, padding: 16 },
        },
      },
    }),
    []
  );

  const donutData = useMemo(() => {
    const { recyclable, nonRecyclable, total } = clsStats;
    if (total <= 0) {
      return {
        labels: ["No composition breakdown"],
        datasets: [
          {
            data: [1],
            backgroundColor: ["rgba(100,116,139,0.35)"],
            borderWidth: 0,
          },
        ],
      };
    }
    return {
      labels: ["Recyclable", "Non-recyclable"],
      datasets: [
        {
          data: [recyclable, nonRecyclable],
          backgroundColor: ["#34d399", "#eab308"],
          borderWidth: 0,
        },
      ],
    };
  }, [clsStats]);

  const donutCenterLabel = clsStats.total > 0 ? formatInt(clsStats.total) : "—";
  const donutCenterSub =
    clsStats.total > 0 ? "AI-classified images (this browser)" : "Awaiting weighbridge mix";

  const exportStamp = () =>
    generatedOn || new Date().toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  const exportRows = useMemo(() => metricsToExportRows(locationMetrics), [locationMetrics]);

  const donutOpts = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      cutout: "62%",
      plugins: {
        legend: {
          position: "bottom",
          labels: { color: "rgba(228,224,236,0.88)", boxWidth: 10, padding: 10, font: { size: 11 } },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              if (clsStats.total <= 0) return ` ${ctx.label}`;
              const v = ctx.raw;
              const sum = ctx.dataset.data.reduce((a, b) => a + b, 0) || 1;
              const pct = ((v / sum) * 100).toFixed(1);
              return ` ${ctx.label}: ${formatInt(v)} (${pct}%)`;
            },
          },
        },
      },
    }),
    [clsStats.total]
  );

  const card = {
    background: t.card,
    border: `1px solid ${t.cardBorder}`,
    borderRadius: 14,
    overflow: "hidden",
  };

  return (
    <div style={{ paddingBottom: 28 }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 10 }}>
          <NavLink to={DASH} style={{ color: t.accent, textDecoration: "none", fontWeight: 600 }}>
            Dashboard
          </NavLink>
          <span style={{ margin: "0 8px", opacity: 0.5 }}>/</span>
          <span>Waste Reports</span>
        </div>
        <h1 style={{ margin: "0 0 16px", fontSize: 22, fontWeight: 800, color: t.text, letterSpacing: "-0.02em" }}>
          Meghalaya waste composition &amp; trends
        </h1>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          <input
            type="text"
            readOnly
            value={dateRangeLabel}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: `1px solid ${t.cardBorder}`,
              background: "rgba(0,0,0,0.35)",
              color: t.text,
              fontSize: 13,
              minWidth: 260,
            }}
          />
          <button
            type="button"
            onClick={() =>
              setGeneratedOn(new Date().toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" }))
            }
            style={{
              padding: "10px 20px",
              borderRadius: 10,
              border: "none",
              background: "linear-gradient(135deg, #5cb85c, #449d44)",
              color: "#fff",
              fontWeight: 800,
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Generate Report
          </button>
        </div>
      </div>

      <VitTrainingQueueBanner />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 160px), 1fr))",
          gap: 14,
          marginBottom: 18,
        }}
      >
        {[
          {
            title: "Total Waste Collected",
            val: `${reportKpis.totalKg.toLocaleString(undefined, { maximumFractionDigits: 3 })} kg`,
            pct: reportKpis.trendPct.total,
            bg: "rgba(92,184,92,0.22)",
            icon: "📦",
          },
          {
            title: "Recyclable Waste",
            val: `${reportKpis.recyclableKg.toLocaleString(undefined, { maximumFractionDigits: 3 })} kg`,
            pct: reportKpis.trendPct.rec,
            bg: "rgba(92,184,92,0.22)",
            icon: "♻️",
          },
          {
            title: "Non-Recyclable Waste",
            val: `${reportKpis.nonRecyclableKg.toLocaleString(undefined, { maximumFractionDigits: 3 })} kg`,
            pct: reportKpis.trendPct.non,
            bg: "rgba(239,68,68,0.2)",
            icon: "🗑️",
          },
          {
            title: "Total Hotspot Areas",
            val: String(reportKpis.hotspots),
            pct: reportKpis.trendPct.hotspots,
            bg: "rgba(59,130,246,0.22)",
            icon: "📍",
            trendOverride:
              "Curated map POIs plus any custom zones (weighbridge / ERP period trend not wired here yet)",
          },
          {
            title: "Active Collection Points",
            val: String(reportKpis.collectionPoints),
            pct: reportKpis.trendPct.points,
            bg: "rgba(234,179,8,0.22)",
            icon: "📌",
          },
          {
            title: "Portal AI classifications",
            val:
              clsStats.total > 0
                ? `${formatInt(clsStats.recyclable)} rec · ${formatInt(clsStats.nonRecyclable)} non`
                : "—",
            pct: 0,
            bg: "rgba(52,211,153,0.18)",
            icon: "🧠",
            trendOverride:
              clsStats.total > 0
                ? "Session stream — attach GPS in Image Classification to tie labels to tourist hotspots"
                : "Run Image Classification to populate recyclable / non-recyclable counts",
          },
        ].map(({ title, val, pct, bg, icon, trendOverride }) => (
          <div key={title} style={{ ...card, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, color: t.textMuted, fontWeight: 600, marginBottom: 8 }}>{title}</div>
                <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>{val}</div>
                <div style={{ fontSize: 11, color: trendOverride ? t.textMuted : trendSubColor(pct), marginTop: 6 }}>
                  {trendOverride ?? formatTrendLine(pct)}
                </div>
              </div>
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 12,
                  background: bg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 20,
                  flexShrink: 0,
                }}
              >
                {icon}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.4fr) minmax(260px, 1fr) minmax(220px, 0.85fr)",
          gap: 16,
          marginBottom: 18,
          alignItems: "stretch",
        }}
        className="waste-reports-mid"
      >
        <div style={{ ...card }}>
          <div style={{ padding: "12px 14px", borderBottom: `1px solid ${t.cardBorder}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <span style={{ fontWeight: 800, fontSize: 14 }}>Classification activity (21 days)</span>
            <select
              defaultValue="daily"
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                border: `1px solid ${t.cardBorder}`,
                background: "rgba(0,0,0,0.35)",
                color: t.text,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </div>
          <div style={{ height: 280, padding: "8px 12px 16px" }}>
            <Line data={trendData} options={trendOpts} />
          </div>
        </div>

        <div style={{ ...card, padding: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>Recyclable vs non-recyclable (portal AI)</div>
          <p style={{ margin: "0 0 8px", fontSize: 11, color: t.textMuted, lineHeight: 1.45 }}>
            Mirrors the dashboard donut — labels from Image Classification; use alongside tourist corridors on the{" "}
            <NavLink to={`${DASH}/field`} style={{ color: t.accent, fontWeight: 700 }}>
              hotspot map
            </NavLink>
            .
          </p>
          <div style={{ height: 240, position: "relative" }}>
            <Doughnut data={donutData} options={donutOpts} />
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: "42%",
                transform: "translate(-50%, -50%)",
                textAlign: "center",
                pointerEvents: "none",
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 800 }}>{donutCenterLabel}</div>
              <div style={{ fontSize: 11, color: t.textMuted }}>{donutCenterSub}</div>
            </div>
          </div>
          <NavLink to={`${DASH}/analytics`} style={{ display: "inline-block", marginTop: 12, fontSize: 13, fontWeight: 700, color: t.accent, textDecoration: "none" }}>
            View Detailed Analysis →
          </NavLink>
        </div>

        <div style={{ ...card, padding: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 14 }}>Top Waste Hotspots</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {hotspotRows.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: t.textMuted, lineHeight: 1.55 }}>
                No ranked hotspots until tonnage by location is supplied by your reporting API.
              </p>
            ) : (
              hotspotRows.map((h) => (
                <div key={h.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{h.name}</div>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: 6,
                        background: `${h.tagTone}28`,
                        color: h.tagTone,
                        marginTop: 6,
                        display: "inline-block",
                      }}
                    >
                      {h.tag}
                    </span>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 13, color: t.textMuted }}>{h.kg.toLocaleString()} kg</div>
                </div>
              ))
            )}
          </div>
          <NavLink to={`${DASH}/field`} style={{ display: "inline-block", marginTop: 16, fontSize: 13, fontWeight: 700, color: t.accent, textDecoration: "none" }}>
            View All Hotspots →
          </NavLink>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(280px, 320px)",
          gap: 18,
          alignItems: "start",
        }}
        className="waste-reports-bottom"
      >
        <div style={{ ...card }}>
          <div style={{ padding: "12px 14px", borderBottom: `1px solid ${t.cardBorder}`, fontWeight: 800, fontSize: 14 }}>Image analyses (stored automatically)</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ color: t.textMuted, textAlign: "left" }}>
                  <th style={{ padding: "10px 12px" }}>Location</th>
                  <th style={{ padding: "10px 8px" }}>Recyclable (kg)</th>
                  <th style={{ padding: "10px 8px" }}>Non-Recyclable (kg)</th>
                  <th style={{ padding: "10px 8px" }}>Total Waste (kg)</th>
                  <th style={{ padding: "10px 8px" }}>Trend</th>
                  <th style={{ padding: "10px 12px" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {slice.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: "22px 14px", color: t.textMuted, textAlign: "center", lineHeight: 1.55 }}>
                      No rows yet. Each successful run on Image Classification is saved here with model-estimated mass (kg) and optional GPS from the map pin or manual coordinates.
                    </td>
                  </tr>
                ) : null}
                {slice.map((row) => (
                  <tr key={row.id} style={{ borderTop: `1px solid ${t.cardBorder}` }}>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 22 }}>{row.thumb}</span>
                        <div>
                          <div style={{ fontWeight: 700 }}>{row.name}</div>
                          <div style={{ fontSize: 11, color: t.textMuted }}>{row.sub}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "10px 8px", fontWeight: 600 }}>
                      {row.recN.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                    </td>
                    <td style={{ padding: "10px 8px", fontWeight: 600 }}>
                      {row.nonN.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                    </td>
                    <td style={{ padding: "10px 8px", fontWeight: 800 }}>
                      {(row.recN + row.nonN).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                    </td>
                    <td style={{ padding: "10px 8px" }}>
                      <MiniSparkline values={row.trend} />
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          padding: "4px 10px",
                          borderRadius: 999,
                          background: `${row.statusTone}22`,
                          color: row.statusTone,
                          border: `1px solid ${row.statusTone}55`,
                        }}
                      >
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: "14px 16px", borderTop: `1px solid ${t.cardBorder}`, display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: t.textMuted }}>
              Showing {(safePage - 1) * PAGE_SIZE + 1} to {Math.min(safePage * PAGE_SIZE, locationMetrics.length)} of {locationMetrics.length} records
            </span>
            <div style={{ display: "flex", gap: 6 }}>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPage(p)}
                  style={{
                    minWidth: 34,
                    height: 34,
                    borderRadius: 8,
                    border: `1px solid ${p === safePage ? `rgba(${t.accentRgb}, 0.55)` : t.cardBorder}`,
                    background: p === safePage ? `rgba(${t.accentRgb}, 0.22)` : "transparent",
                    color: p === safePage ? "#fff" : t.textMuted,
                    fontWeight: 700,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>

        <aside style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ ...card, padding: 16 }}>
            <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 14 }}>Report Summary</div>
            <div style={{ display: "grid", gap: 12, fontSize: 13 }}>
              {[
                ["Report Type", "Custom Range Report"],
                ["Duration", dateRangeLabel],
                ["Days with data", `${totalDaysWithData} day${totalDaysWithData === 1 ? "" : "s"}`],
                ["Generated On", generatedOn || "—"],
                ["Generated By", "—"],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, borderBottom: `1px solid ${t.cardBorder}`, paddingBottom: 10 }}>
                  <span style={{ color: t.textMuted }}>{k}</span>
                  <span style={{ fontWeight: 600, textAlign: "right" }}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ ...card, padding: 16 }}>
            <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 14 }}>Download Report</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                type="button"
                onClick={() =>
                  downloadReportHtmlFile(exportStamp(), true, reportKpis.totalKg, exportRows, dateRangeLabel)
                }
                style={{
                  padding: "14px 16px",
                  borderRadius: 12,
                  border: "none",
                  background: `linear-gradient(135deg, ${t.accent}, ${t.accentSecondary})`,
                  color: "#fff",
                  fontWeight: 800,
                  fontSize: 14,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                }}
              >
                <span>📄</span> Download report (HTML)
              </button>
              <button
                type="button"
                onClick={() => downloadLocationsCsv(exportRows)}
                style={{
                  padding: "14px 16px",
                  borderRadius: 12,
                  border: `1px solid rgba(92,184,92,0.45)`,
                  background: "rgba(92,184,92,0.15)",
                  color: "#86efac",
                  fontWeight: 800,
                  fontSize: 14,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                }}
              >
                <span>📊</span> Download Excel
              </button>
              <button
                type="button"
                onClick={() => openReportPrintWindow(exportStamp(), false, reportKpis.totalKg, exportRows, dateRangeLabel)}
                style={{
                  padding: "14px 16px",
                  borderRadius: 12,
                  border: `1px solid rgba(59,130,246,0.45)`,
                  background: "rgba(59,130,246,0.12)",
                  color: "#93c5fd",
                  fontWeight: 800,
                  fontSize: 14,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                }}
              >
                <span>🖨️</span> Print Report
              </button>
            </div>
          </div>
        </aside>
      </div>

      <style>{`
        @media (max-width: 1100px) {
          .waste-reports-mid { grid-template-columns: 1fr !important; }
          .waste-reports-bottom { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
