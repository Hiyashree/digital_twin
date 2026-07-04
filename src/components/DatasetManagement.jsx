import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import VitTrainingQueueBanner from "./VitTrainingQueueBanner.jsx";
import { useDatasetLibrary } from "../context/DatasetLibraryContext.jsx";
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Filler,
} from "chart.js";
import { Doughnut, Line, Bar } from "react-chartjs-2";
import { portal as t } from "./portal/portalTheme.js";

ChartJS.register(
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Filler
);

const TYPE_BREAKDOWN = [
  { label: "Plastic", pct: 35.4, tone: "#34d399" },
  { label: "Paper", pct: 20.1, tone: "#3b82f6" },
  { label: "Food Waste", pct: 18.7, tone: "#5cb85c" },
  { label: "Glass", pct: 10.3, tone: "#eab308" },
  { label: "Metal", pct: 8.2, tone: "#f97316" },
  { label: "Others", pct: 7.3, tone: "#64748b" },
];

const PAGE_SIZE = 6;

/** Avoid "0.0 GB" for small uploads — table stays honest without looking broken. */
function formatDatasetSizeGb(sizeGb) {
  const g = Number(sizeGb);
  if (!Number.isFinite(g) || g <= 0) return "0 MB";
  if (g < 0.01) {
    const mb = g * 1024;
    if (mb < 0.05) return "<0.1 MB";
    return `${mb.toFixed(1)} MB`;
  }
  return `${g.toFixed(2)} GB`;
}

function formatDatasetRow(d) {
  return {
    ...d,
    images: d.imagesNum.toLocaleString(),
    size: formatDatasetSizeGb(d.sizeGb),
  };
}

function createdTs(s) {
  const x = Date.parse(s);
  return Number.isNaN(x) ? 0 : x;
}

function last6MonthLabels(anchor) {
  const labels = [];
  const d = new Date(anchor);
  for (let i = 5; i >= 0; i--) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
    labels.push(x.toLocaleString(undefined, { month: "short", year: "numeric" }));
  }
  return labels;
}

/** Stable-ish key so re-opening the picker does not duplicate the same File twice. */
function importFileKey(f) {
  return `${f.name}|${f.size}|${f.lastModified}`;
}

const TYPE_TAG = {
  waste: { label: "Waste type", bg: "rgba(92,184,92,0.2)", color: "#bbf7d0", border: "rgba(92,184,92,0.45)" },
  recyclability: { label: "Recyclability", bg: "rgba(92,184,92,0.18)", color: "#86efac", border: "rgba(92,184,92,0.4)" },
  hotspot: { label: "Hotspot imagery", bg: "rgba(45,212,191,0.18)", color: "#5eead4", border: "rgba(45,212,191,0.45)" },
  custom: { label: "Custom", bg: "rgba(59,130,246,0.18)", color: "#93c5fd", border: "rgba(59,130,246,0.45)" },
};

const STATUS_TAG = {
  completed: { label: "Completed", bg: "rgba(92,184,92,0.18)", color: "#86efac" },
  processing: { label: "Processing", bg: "rgba(245,158,11,0.2)", color: "#fcd34d" },
};

/** Placeholder hints for manual ML task fields — depend on dataset purpose. */
const ML_TASK_PLACEHOLDERS = {
  waste: {
    inputs: "e.g. RGB photos (handset), single object or street scene; optional crop 224×224",
    outputs: "e.g. plastic · paper · organic · metal · glass · mixed — your exact label set",
    characteristics: "e.g. class imbalance, lighting, season, annotation rules, train/val split notes",
  },
  recyclability: {
    inputs: "e.g. same images as waste model, or macro shots of packaging",
    outputs: "e.g. binary: Recyclable vs Non-recyclable (or Yes/No) — define edge cases",
    characteristics: "e.g. soiled plastic counts as non-recyclable; regional MRF rules",
  },
  hotspot: {
    inputs: "e.g. geotagged site photos, drone stills, fixed CCTV crops",
    outputs: "e.g. litter presence / density score / waste type per tile — what you label",
    characteristics: "e.g. CRS, ground sample distance, season, tide / crowd confounders",
  },
  custom: {
    inputs: "What the model receives (modalities, resolution, preprocessing)",
    outputs: "What you supervise (label taxonomy, units, thresholds)",
    characteristics: "Anything else: collection protocol, exclusions, known biases",
  },
};

function emptyMlTaskFields() {
  return { inputs: "", outputs: "", characteristics: "" };
}

export default function DatasetManagement() {
  const {
    datasets,
    searchQuery,
    metrics,
    removeDataset,
    importModalOpen,
    setImportModalOpen,
    addDatasetFromImport,
    updateDataset,
  } = useDatasetLibrary();
  const [tab, setTab] = useState("all");
  const [view, setView] = useState("list");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState("latest");
  const [statusFilter, setStatusFilter] = useState(null);
  const filteredRows = useMemo(() => {
    const formatted = datasets.map(formatDatasetRow);
    const q = searchQuery.trim().toLowerCase();
    let rows = q
      ? formatted.filter((r) => `${r.name} ${r.desc || ""}`.toLowerCase().includes(q))
      : formatted;

    if (tab === "waste") rows = rows.filter((r) => r.typeKey === "waste");
    else if (tab === "recyclability") rows = rows.filter((r) => r.typeKey === "recyclability");
    else if (tab === "hotspot") rows = rows.filter((r) => r.typeKey === "hotspot");
    else if (tab === "custom") rows = rows.filter((r) => r.typeKey === "custom");

    if (statusFilter === "completed") rows = rows.filter((r) => r.status === "completed");
    if (statusFilter === "processing") rows = rows.filter((r) => r.status === "processing");

    const sorted = [...rows];
    if (sortBy === "latest") sorted.sort((a, b) => createdTs(b.created) - createdTs(a.created));
    if (sortBy === "oldest") sorted.sort((a, b) => createdTs(a.created) - createdTs(b.created));
    if (sortBy === "size") sorted.sort((a, b) => b.imagesNum - a.imagesNum);

    return sorted;
  }, [datasets, searchQuery, tab, sortBy, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const slice = filteredRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, tab, statusFilter, sortBy]);

  const donutData = useMemo(
    () => ({
      labels: TYPE_BREAKDOWN.map((x) => x.label),
      datasets: [
        {
          data: TYPE_BREAKDOWN.map((x) => x.pct),
          backgroundColor: TYPE_BREAKDOWN.map((x) => x.tone),
          borderWidth: 0,
        },
      ],
    }),
    []
  );

  const donutOpts = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      cutout: "62%",
      plugins: {
        legend: {
          position: "bottom",
          labels: { color: "rgba(228,224,236,0.88)", boxWidth: 10, padding: 8, font: { size: 10 } },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.label}: ${ctx.raw}%`,
          },
        },
      },
    }),
    []
  );

  const growthData = useMemo(() => {
    const labels = last6MonthLabels(new Date());
    const target = metrics.totalImages;
    const start = Math.max(4800, Math.round(target * 0.58));
    const n = labels.length;
    const data = labels.map((_, i) => Math.round(start + ((target - start) * i) / Math.max(1, n - 1)));
    if (data.length) data[data.length - 1] = target;
    return {
      labels,
      datasets: [
        {
          label: "Total Images",
          data,
          borderColor: "#5cb85c",
          backgroundColor: "rgba(92,184,92,0.12)",
          fill: true,
          tension: 0.35,
          pointRadius: 3,
          borderWidth: 2,
        },
      ],
    };
  }, [metrics.totalImages]);

  const growthOpts = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          grid: { color: "rgba(255,255,255,0.06)" },
          ticks: { color: "rgba(228,224,236,0.6)", font: { size: 10 } },
        },
        y: {
          grid: { color: "rgba(255,255,255,0.06)" },
          ticks: {
            color: "rgba(228,224,236,0.6)",
            font: { size: 10 },
            callback: (v) => (v >= 1000 ? `${v / 1000}k` : v),
          },
        },
      },
      plugins: {
        legend: { display: false },
      },
    }),
    []
  );

  const barData = useMemo(
    () => ({
      labels: TYPE_BREAKDOWN.map((x) => x.label),
      datasets: [
        {
          label: "%",
          data: TYPE_BREAKDOWN.map((x) => x.pct),
          backgroundColor: TYPE_BREAKDOWN.map((x) => x.tone),
          borderRadius: 6,
          borderSkipped: false,
        },
      ],
    }),
    []
  );

  const barOpts = useMemo(
    () => ({
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          max: 40,
          grid: { color: "rgba(255,255,255,0.06)" },
          ticks: { color: "rgba(228,224,236,0.6)", font: { size: 10 }, callback: (v) => `${v}%` },
        },
        y: {
          grid: { display: false },
          ticks: { color: "rgba(228,224,236,0.88)", font: { size: 11 } },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.parsed.x}%`,
          },
        },
      },
    }),
    []
  );

  const card = {
    background: t.card,
    border: `1px solid ${t.cardBorder}`,
    borderRadius: 14,
    overflow: "hidden",
  };

  const tabs = [
    ["all", "All Datasets"],
    ["waste", "Waste type"],
    ["recyclability", "Recyclability"],
    ["hotspot", "Hotspot imagery"],
    ["custom", "Custom"],
  ];

  const [impName, setImpName] = useState("");
  const [impDesc, setImpDesc] = useState("");
  const [impHotspot, setImpHotspot] = useState("");
  const [impType, setImpType] = useState("waste");
  const [impMlTask, setImpMlTask] = useState(() => emptyMlTaskFields());
  const [impFiles, setImpFiles] = useState([]);
  const [impError, setImpError] = useState("");
  const [impSubmitting, setImpSubmitting] = useState(false);
  const impFileRef = useRef(null);

  useEffect(() => {
    if (!importModalOpen) {
      setImpName("");
      setImpDesc("");
      setImpHotspot("");
      setImpType("waste");
      setImpMlTask(emptyMlTaskFields());
      setImpFiles([]);
      setImpError("");
      if (impFileRef.current) impFileRef.current.value = "";
    }
  }, [importModalOpen]);

  const impMlHints = useMemo(() => ML_TASK_PLACEHOLDERS[impType] || ML_TASK_PLACEHOLDERS.waste, [impType]);

  const onPickFiles = (e) => {
    const incoming = e.target.files ? Array.from(e.target.files) : [];
    setImpFiles((prev) => {
      const seen = new Set(prev.map(importFileKey));
      const next = [...prev];
      for (const f of incoming) {
        const k = importFileKey(f);
        if (seen.has(k)) continue;
        seen.add(k);
        next.push(f);
      }
      return next;
    });
    setImpError("");
    e.target.value = "";
  };

  const removeImpFileAt = (index) => {
    setImpFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const submitImport = async () => {
    setImpError("");
    setImpSubmitting(true);
    try {
      const res = await addDatasetFromImport({
        name: impName,
        desc: impDesc,
        hotspotName: impHotspot,
        typeKey: impType,
        files: impFiles,
        mlTaskSpec: impMlTask,
      });
      if (res.ok) setImportModalOpen(false);
      else setImpError(res.error);
    } finally {
      setImpSubmitting(false);
    }
  };

  /** View / edit dataset — updates persist via DatasetLibraryContext + localStorage. */
  const [detailModal, setDetailModal] = useState(null);
  const [editFields, setEditFields] = useState(null);
  const [detailSaveError, setDetailSaveError] = useState("");

  useLayoutEffect(() => {
    if (!detailModal || detailModal.mode !== "edit") {
      setEditFields(null);
      setDetailSaveError("");
      return;
    }
    const r = detailModal.row;
    const spec = r.mlTaskSpec && typeof r.mlTaskSpec === "object" ? r.mlTaskSpec : {};
    setEditFields({
      name: r.name,
      desc: r.desc || "",
      typeKey: r.typeKey || "waste",
      imagesNum: r.imagesNum,
      sizeGb: r.sizeGb,
      status: r.status || "processing",
      thumb: r.thumb || "📦",
      mlTaskSpec: {
        inputs: String(spec.inputs ?? ""),
        outputs: String(spec.outputs ?? ""),
        characteristics: String(spec.characteristics ?? ""),
      },
    });
    setDetailSaveError("");
  }, [detailModal]);

  const editMlHints = useMemo(() => {
    const key = editFields?.typeKey;
    if (!key) return ML_TASK_PLACEHOLDERS.waste;
    return ML_TASK_PLACEHOLDERS[key] || ML_TASK_PLACEHOLDERS.waste;
  }, [editFields?.typeKey]);

  const saveDetailEdit = () => {
    if (!detailModal?.row?.id || !editFields) return;
    const name = String(editFields.name || "").trim();
    if (!name) {
      setDetailSaveError("Dataset name is required.");
      return;
    }
    updateDataset(detailModal.row.id, {
      name,
      desc: editFields.desc,
      typeKey: editFields.typeKey,
      imagesNum: editFields.imagesNum,
      sizeGb: editFields.sizeGb,
      status: editFields.status,
      thumb: editFields.thumb,
      mlTaskSpec: editFields.mlTaskSpec,
    });
    setDetailModal(null);
  };

  const inp = {
    width: "100%",
    boxSizing: "border-box",
    padding: "10px 12px",
    borderRadius: 10,
    border: `1px solid ${t.cardBorder}`,
    background: "rgba(0,0,0,0.35)",
    color: t.text,
    fontSize: 14,
    fontFamily: "inherit",
    marginBottom: 12,
  };

  return (
    <div style={{ paddingBottom: 28 }}>
      <VitTrainingQueueBanner />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 150px), 1fr))",
          gap: 14,
          marginBottom: 18,
        }}
      >
        {[
          ["Total Datasets", String(metrics.count), `↑ ${metrics.newThisMonth} new this month`, "📁"],
          [
            "Total Images",
            metrics.totalImages.toLocaleString(),
            `${metrics.imgDeltaPct >= 0 ? "↑" : "↓"} ${Math.abs(metrics.imgDeltaPct).toFixed(2)}% vs session start`,
            "🖼️",
          ],
          [
            "Total Size",
            `${metrics.totalGb.toFixed(1)} GB`,
            `${metrics.gbDeltaPct >= 0 ? "↑" : "↓"} ${Math.abs(metrics.gbDeltaPct).toFixed(2)}% vs session start`,
            "💾",
          ],
        ].map(([title, val, sub, icon]) => (
          <div key={title} style={{ ...card, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, color: t.textMuted, fontWeight: 600, marginBottom: 8 }}>{title}</div>
                <div style={{ fontSize: 24, fontWeight: 800 }}>{val}</div>
                <div style={{ fontSize: 11, color: "#86efac", marginTop: 6 }}>{sub}</div>
              </div>
              <div style={{ fontSize: 26, opacity: 0.9 }}>{icon}</div>
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(260px, 1fr) minmax(260px, 1fr) minmax(260px, 1fr)",
          gap: 16,
          marginBottom: 22,
          alignItems: "stretch",
        }}
        className="dataset-mgmt-charts"
      >
        <div style={{ ...card, padding: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>Dataset Overview</div>
          <div style={{ height: 220, position: "relative" }}>
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
              <div style={{ fontSize: 16, fontWeight: 800 }}>{metrics.totalImages.toLocaleString()}</div>
              <div style={{ fontSize: 10, color: t.textMuted }}>Total Images</div>
            </div>
          </div>
        </div>

        <div style={{ ...card, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
            <span style={{ fontWeight: 800, fontSize: 14 }}>Dataset Growth</span>
            <span style={{ fontSize: 11, color: t.textMuted }}>Last 6 months (rolling)</span>
          </div>
          <div style={{ height: 220 }}>
            <Line data={growthData} options={growthOpts} />
          </div>
        </div>

        <div style={{ ...card, padding: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>Data Distribution by Type</div>
          <div style={{ height: 220 }}>
            <Bar data={barData} options={barOpts} />
          </div>
        </div>
      </div>

      <div style={{ ...card }}>
        <div style={{ padding: "12px 14px", borderBottom: `1px solid ${t.cardBorder}`, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          {tabs.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setTab(key);
                setPage(1);
              }}
              style={{
                padding: "8px 14px",
                borderRadius: 10,
                border: `1px solid ${tab === key ? `rgba(${t.accentRgb}, 0.55)` : t.cardBorder}`,
                background: tab === key ? `rgba(${t.accentRgb}, 0.2)` : "transparent",
                color: tab === key ? "#fff" : t.textMuted,
                fontWeight: 700,
                fontSize: 12,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={{ padding: "12px 14px", borderBottom: `1px solid ${t.cardBorder}`, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => setView("grid")}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: `1px solid ${view === "grid" ? `rgba(${t.accentRgb}, 0.5)` : t.cardBorder}`,
                background: view === "grid" ? `rgba(${t.accentRgb}, 0.15)` : "transparent",
                color: t.text,
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 12,
              }}
              aria-label="Grid view"
            >
              ▦
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: `1px solid ${view === "list" ? `rgba(${t.accentRgb}, 0.5)` : t.cardBorder}`,
                background: view === "list" ? `rgba(${t.accentRgb}, 0.15)` : "transparent",
                color: t.text,
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 12,
              }}
              aria-label="List view"
            >
              ☰
            </button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <button
              type="button"
              onClick={() =>
                setStatusFilter((f) => (f === null ? "completed" : f === "completed" ? "processing" : null))
              }
              style={{
                padding: "8px 14px",
                borderRadius: 10,
                border: `1px solid ${statusFilter ? `rgba(${t.accentRgb}, 0.45)` : t.cardBorder}`,
                background: statusFilter ? `rgba(${t.accentRgb}, 0.12)` : "rgba(255,255,255,0.06)",
                color: t.text,
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {statusFilter === null ? "Filter: All" : statusFilter === "completed" ? "Filter: Completed" : "Filter: Processing"}
            </button>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: t.textMuted }}>
              Sort By:
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                style={{
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: `1px solid ${t.cardBorder}`,
                  background: "rgba(0,0,0,0.35)",
                  color: t.text,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                <option value="latest">Latest</option>
                <option value="oldest">Oldest</option>
                <option value="size">Size</option>
              </select>
            </label>
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ color: t.textMuted, textAlign: "left" }}>
                <th style={{ padding: "12px 14px" }}>Dataset Name</th>
                <th style={{ padding: "12px 10px" }}>Type</th>
                <th style={{ padding: "12px 10px" }}>Images</th>
                <th style={{ padding: "12px 10px" }}>Size</th>
                <th style={{ padding: "12px 10px" }}>Created On</th>
                <th style={{ padding: "12px 10px" }}>Status</th>
                <th style={{ padding: "12px 14px" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {slice.map((row) => {
                const tt = TYPE_TAG[row.typeKey] || TYPE_TAG.custom;
                const st = STATUS_TAG[row.status] || STATUS_TAG.completed;
                return (
                  <tr key={row.id || row.name} style={{ borderTop: `1px solid ${t.cardBorder}` }}>
                    <td style={{ padding: "14px 14px", verticalAlign: "top" }}>
                      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                        <span style={{ fontSize: 28, lineHeight: 1 }}>{row.thumb || "📦"}</span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 800, fontSize: 13 }}>{row.name}</div>
                          {row.desc && (
                            <div style={{ fontSize: 11, color: t.textMuted, marginTop: 4, lineHeight: 1.4, maxWidth: 280 }}>{row.desc}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "14px 10px", verticalAlign: "middle" }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          padding: "4px 10px",
                          borderRadius: 8,
                          background: tt.bg,
                          color: tt.color,
                          border: `1px solid ${tt.border}`,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {tt.label}
                      </span>
                    </td>
                    <td style={{ padding: "14px 10px", fontWeight: 700, verticalAlign: "middle" }}>{row.images}</td>
                    <td style={{ padding: "14px 10px", verticalAlign: "middle" }}>{row.size}</td>
                    <td style={{ padding: "14px 10px", color: t.textMuted, verticalAlign: "middle" }}>{row.created}</td>
                    <td style={{ padding: "14px 10px", verticalAlign: "middle" }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          padding: "4px 10px",
                          borderRadius: 999,
                          background: st.bg,
                          color: st.color,
                        }}
                      >
                        {st.label}
                      </span>
                    </td>
                    <td style={{ padding: "14px 14px", verticalAlign: "middle" }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          type="button"
                          style={actionBtn}
                          title="View"
                          onClick={() => setDetailModal({ mode: "view", row })}
                        >
                          👁
                        </button>
                        <button
                          type="button"
                          style={actionBtn}
                          title="Edit"
                          onClick={() => setDetailModal({ mode: "edit", row })}
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          style={{ ...actionBtn, color: "#fca5a5" }}
                          title="Delete"
                          onClick={() => {
                            if (window.confirm(`Remove dataset "${row.name}" from the catalog?`)) removeDataset(row.id);
                          }}
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{ padding: "14px 16px", borderTop: `1px solid ${t.cardBorder}`, display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: t.textMuted }}>
            Showing {(safePage - 1) * PAGE_SIZE + 1} to {Math.min(safePage * PAGE_SIZE, filteredRows.length)} of {filteredRows.length} datasets
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button type="button" style={pageArrow} disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} aria-label="Previous page">
              ‹
            </button>
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
            <button
              type="button"
              style={pageArrow}
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              aria-label="Next page"
            >
              ›
            </button>
          </div>
        </div>
      </div>

      {detailModal && (
        <div
          role="presentation"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 410,
            background: "rgba(0,0,0,0.72)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
          onClick={() => setDetailModal(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="dataset-detail-title"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(100%, 520px)",
              maxHeight: "min(92vh, 720px)",
              overflow: "auto",
              background: t.card,
              border: `1px solid ${t.cardBorder}`,
              borderRadius: 16,
              padding: "22px 22px 18px",
              boxShadow: "0 24px 64px rgba(0,0,0,0.55)",
            }}
          >
            <h2 id="dataset-detail-title" style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 800 }}>
              {detailModal.mode === "edit" ? "Edit dataset" : "Dataset details"}
            </h2>
            <p style={{ margin: "0 0 16px", fontSize: 12, color: t.textMuted, lineHeight: 1.45 }}>
              Changes are saved in this browser (local catalog). Connect an API later for shared storage.
            </p>

            {detailModal.mode === "view" ? (
              <>
                <div style={{ fontSize: 40, marginBottom: 8 }}>{detailModal.row.thumb}</div>
                <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 8 }}>{detailModal.row.name}</div>
                <div style={{ fontSize: 13, color: t.textMuted, marginBottom: 14, lineHeight: 1.5 }}>
                  {detailModal.row.desc || "—"}
                </div>
                <div style={{ display: "grid", gap: 8, fontSize: 13, marginBottom: 18 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <span style={{ color: t.textMuted }}>Type</span>
                    <span style={{ fontWeight: 600 }}>{TYPE_TAG[detailModal.row.typeKey]?.label || detailModal.row.typeKey}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <span style={{ color: t.textMuted }}>Images</span>
                    <span style={{ fontWeight: 600 }}>{detailModal.row.images}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <span style={{ color: t.textMuted }}>Size</span>
                    <span style={{ fontWeight: 600 }}>{detailModal.row.size}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <span style={{ color: t.textMuted }}>Created</span>
                    <span style={{ fontWeight: 600 }}>{detailModal.row.created}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <span style={{ color: t.textMuted }}>Status</span>
                    <span style={{ fontWeight: 600 }}>{STATUS_TAG[detailModal.row.status]?.label || detailModal.row.status}</span>
                  </div>
                  {detailModal.row.hotspotName && (
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                      <span style={{ color: t.textMuted }}>Hotspot</span>
                      <span style={{ fontWeight: 600 }}>{detailModal.row.hotspotName}</span>
                    </div>
                  )}
                </div>
                {(() => {
                  const m = detailModal.row.mlTaskSpec;
                  const has =
                    m &&
                    typeof m === "object" &&
                    (String(m.inputs || "").trim() ||
                      String(m.outputs || "").trim() ||
                      String(m.characteristics || "").trim());
                  if (!has) return null;
                  return (
                    <div
                      style={{
                        marginBottom: 18,
                        padding: "12px 14px",
                        borderRadius: 12,
                        border: `1px solid ${t.cardBorder}`,
                        background: "rgba(0,0,0,0.22)",
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 800, color: t.text, marginBottom: 10 }}>ML task (manual)</div>
                      {["inputs", "outputs", "characteristics"].map((key) => {
                        const val = String(m[key] || "").trim();
                        if (!val) return null;
                        const label =
                          key === "inputs" ? "Inputs" : key === "outputs" ? "Outputs / labels" : "Characteristics";
                        return (
                          <div key={key} style={{ marginBottom: key === "characteristics" ? 0 : 10 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, marginBottom: 4 }}>{label}</div>
                            <div style={{ fontSize: 13, color: t.text, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{val}</div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    onClick={() => setDetailModal(null)}
                    style={{
                      padding: "10px 18px",
                      borderRadius: 10,
                      border: `1px solid ${t.cardBorder}`,
                      background: "transparent",
                      color: t.textMuted,
                      fontWeight: 700,
                      fontSize: 13,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetailModal({ mode: "edit", row: detailModal.row })}
                    style={{
                      padding: "10px 18px",
                      borderRadius: 10,
                      border: "none",
                      background: `linear-gradient(135deg, ${t.accent}, ${t.accentSecondary})`,
                      color: "#042f14",
                      fontWeight: 800,
                      fontSize: 13,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    Edit
                  </button>
                </div>
              </>
            ) : (
              editFields && (
                <>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: t.textMuted, marginBottom: 6 }}>Icon (emoji)</label>
                  <input
                    value={editFields.thumb}
                    onChange={(e) => setEditFields((f) => ({ ...f, thumb: e.target.value }))}
                    style={inp}
                  />
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: t.textMuted, marginBottom: 6 }}>Name</label>
                  <input
                    value={editFields.name}
                    onChange={(e) => setEditFields((f) => ({ ...f, name: e.target.value }))}
                    style={inp}
                  />
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: t.textMuted, marginBottom: 6 }}>Description</label>
                  <textarea
                    value={editFields.desc}
                    onChange={(e) => setEditFields((f) => ({ ...f, desc: e.target.value }))}
                    rows={3}
                    style={{ ...inp, resize: "vertical", marginBottom: 12 }}
                  />
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: t.textMuted, marginBottom: 6 }}>Purpose</label>
                  <select
                    value={editFields.typeKey}
                    onChange={(e) => setEditFields((f) => ({ ...f, typeKey: e.target.value }))}
                    style={{ ...inp, cursor: "pointer", marginBottom: 12 }}
                  >
                    <option value="waste">Waste type</option>
                    <option value="recyclability">Recyclability</option>
                    <option value="hotspot">Hotspot imagery</option>
                    <option value="custom">Custom</option>
                  </select>
                  <div
                    style={{
                      marginBottom: 14,
                      padding: "12px 14px",
                      borderRadius: 12,
                      border: `1px solid ${t.cardBorder}`,
                      background: "rgba(0,0,0,0.18)",
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 800, color: t.text, marginBottom: 8 }}>Task inputs, outputs, characteristics</div>
                    <p style={{ margin: "0 0 10px", fontSize: 11, color: t.textMuted, lineHeight: 1.45 }}>
                      Describe what the model sees, what you label, and how the set differs from generic “name + location + image” metadata. Placeholders update when you change purpose.
                    </p>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: t.textMuted, marginBottom: 4 }}>Inputs</label>
                    <textarea
                      value={editFields.mlTaskSpec.inputs}
                      onChange={(e) =>
                        setEditFields((f) => ({
                          ...f,
                          mlTaskSpec: { ...f.mlTaskSpec, inputs: e.target.value },
                        }))
                      }
                      placeholder={editMlHints.inputs}
                      rows={2}
                      style={{ ...inp, resize: "vertical", marginBottom: 10 }}
                    />
                    <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: t.textMuted, marginBottom: 4 }}>
                      Outputs / labels
                    </label>
                    <textarea
                      value={editFields.mlTaskSpec.outputs}
                      onChange={(e) =>
                        setEditFields((f) => ({
                          ...f,
                          mlTaskSpec: { ...f.mlTaskSpec, outputs: e.target.value },
                        }))
                      }
                      placeholder={editMlHints.outputs}
                      rows={2}
                      style={{ ...inp, resize: "vertical", marginBottom: 10 }}
                    />
                    <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: t.textMuted, marginBottom: 4 }}>
                      Characteristics
                    </label>
                    <textarea
                      value={editFields.mlTaskSpec.characteristics}
                      onChange={(e) =>
                        setEditFields((f) => ({
                          ...f,
                          mlTaskSpec: { ...f.mlTaskSpec, characteristics: e.target.value },
                        }))
                      }
                      placeholder={editMlHints.characteristics}
                      rows={2}
                      style={{ ...inp, resize: "vertical", marginBottom: 0 }}
                    />
                  </div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: t.textMuted, marginBottom: 6 }}>Images (count)</label>
                  <input
                    type="number"
                    min={0}
                    value={editFields.imagesNum}
                    onChange={(e) =>
                      setEditFields((f) => ({
                        ...f,
                        imagesNum: Math.max(0, parseInt(e.target.value, 10) || 0),
                      }))
                    }
                    style={{ ...inp, marginBottom: 12 }}
                  />
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: t.textMuted, marginBottom: 6 }}>
                    Size (GB)
                  </label>
                  <input
                    type="number"
                    min={0.001}
                    step={0.01}
                    value={editFields.sizeGb}
                    onChange={(e) =>
                      setEditFields((f) => ({
                        ...f,
                        sizeGb: Math.max(0.001, parseFloat(e.target.value) || 0),
                      }))
                    }
                    style={inp}
                  />
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: t.textMuted, marginBottom: 6 }}>Status</label>
                  <select
                    value={editFields.status}
                    onChange={(e) => setEditFields((f) => ({ ...f, status: e.target.value }))}
                    style={{ ...inp, cursor: "pointer", marginBottom: 12 }}
                  >
                    <option value="processing">Processing</option>
                    <option value="completed">Completed</option>
                  </select>
                  {detailSaveError && (
                    <div
                      style={{
                        padding: "10px 12px",
                        borderRadius: 10,
                        background: "rgba(239,68,68,0.15)",
                        border: "1px solid rgba(239,68,68,0.35)",
                        color: "#fecaca",
                        fontSize: 13,
                        marginBottom: 12,
                      }}
                    >
                      {detailSaveError}
                    </div>
                  )}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      onClick={() => setDetailModal(null)}
                      style={{
                        padding: "10px 18px",
                        borderRadius: 10,
                        border: `1px solid ${t.cardBorder}`,
                        background: "transparent",
                        color: t.textMuted,
                        fontWeight: 700,
                        fontSize: 13,
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={saveDetailEdit}
                      style={{
                        padding: "10px 18px",
                        borderRadius: 10,
                        border: "none",
                        background: `linear-gradient(135deg, ${t.accent}, ${t.accentSecondary})`,
                        color: "#042f14",
                        fontWeight: 800,
                        fontSize: 13,
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      Save changes
                    </button>
                  </div>
                </>
              )
            )}
          </div>
        </div>
      )}

      {importModalOpen && (
        <div
          role="presentation"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 400,
            background: "rgba(0,0,0,0.72)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
          onClick={() => setImportModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="dataset-import-title"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(100%, 560px)",
              maxHeight: "min(92vh, 760px)",
              overflow: "auto",
              background: t.card,
              border: `1px solid ${t.cardBorder}`,
              borderRadius: 16,
              padding: "22px 22px 18px",
              boxShadow: "0 24px 64px rgba(0,0,0,0.55)",
            }}
          >
            <h2 id="dataset-import-title" style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 800 }}>
              Add ML dataset
            </h2>
            <p style={{ margin: "0 0 18px", fontSize: 13, color: t.textMuted, lineHeight: 1.55 }}>
              Upload waste or hotspot photos for training and classification. Image count and storage size come from your files only — nothing is auto-generated. For each ML purpose you can record what the model takes in, what you supervise, and dataset quirks beyond name, area, and files.
            </p>

            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: t.textMuted, marginBottom: 6 }}>Dataset name</label>
            <input
              value={impName}
              onChange={(e) => setImpName(e.target.value)}
              placeholder="e.g. Dawki riverfront — plastics May 2026"
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "10px 12px",
                borderRadius: 10,
                border: `1px solid ${t.cardBorder}`,
                background: "rgba(0,0,0,0.35)",
                color: t.text,
                fontSize: 14,
                marginBottom: 14,
                fontFamily: "inherit",
              }}
            />

            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: t.textMuted, marginBottom: 6 }}>
              Dataset purpose (ML)
            </label>
            <select
              value={impType}
              onChange={(e) => setImpType(e.target.value)}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "10px 12px",
                borderRadius: 10,
                border: `1px solid ${t.cardBorder}`,
                background: "rgba(0,0,0,0.35)",
                color: t.text,
                fontSize: 14,
                marginBottom: 14,
                fontFamily: "inherit",
                cursor: "pointer",
              }}
            >
              <option value="waste">Waste type classification (material labels)</option>
              <option value="recyclability">Recyclability (recyclable vs not)</option>
              <option value="hotspot">Hotspot / GIS imagery</option>
              <option value="custom">Custom labels</option>
            </select>

            <div
              style={{
                marginBottom: 14,
                padding: "12px 14px",
                borderRadius: 12,
                border: `1px solid ${t.cardBorder}`,
                background: "rgba(0,0,0,0.18)",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 800, color: t.text, marginBottom: 6 }}>Task inputs, outputs, characteristics</div>
              <p style={{ margin: "0 0 10px", fontSize: 11, color: t.textMuted, lineHeight: 1.45 }}>
                Optional but recommended: spell out the ML contract for this split (placeholders change with purpose above).
              </p>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: t.textMuted, marginBottom: 4 }}>Inputs</label>
              <textarea
                value={impMlTask.inputs}
                onChange={(e) => setImpMlTask((s) => ({ ...s, inputs: e.target.value }))}
                placeholder={impMlHints.inputs}
                rows={2}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: `1px solid ${t.cardBorder}`,
                  background: "rgba(0,0,0,0.35)",
                  color: t.text,
                  fontSize: 13,
                  marginBottom: 10,
                  fontFamily: "inherit",
                  resize: "vertical",
                }}
              />
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: t.textMuted, marginBottom: 4 }}>Outputs / labels</label>
              <textarea
                value={impMlTask.outputs}
                onChange={(e) => setImpMlTask((s) => ({ ...s, outputs: e.target.value }))}
                placeholder={impMlHints.outputs}
                rows={2}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: `1px solid ${t.cardBorder}`,
                  background: "rgba(0,0,0,0.35)",
                  color: t.text,
                  fontSize: 13,
                  marginBottom: 10,
                  fontFamily: "inherit",
                  resize: "vertical",
                }}
              />
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: t.textMuted, marginBottom: 4 }}>Characteristics</label>
              <textarea
                value={impMlTask.characteristics}
                onChange={(e) => setImpMlTask((s) => ({ ...s, characteristics: e.target.value }))}
                placeholder={impMlHints.characteristics}
                rows={2}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: `1px solid ${t.cardBorder}`,
                  background: "rgba(0,0,0,0.35)",
                  color: t.text,
                  fontSize: 13,
                  fontFamily: "inherit",
                  resize: "vertical",
                }}
              />
            </div>

            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: t.textMuted, marginBottom: 6 }}>
              Hotspot or region {impType === "hotspot" ? "(for map placement)" : "(optional)"}
            </label>
            <input
              value={impHotspot}
              onChange={(e) => setImpHotspot(e.target.value)}
              placeholder="e.g. Nohkalikai Falls (must match a known tourist POI on the map)"
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "10px 12px",
                borderRadius: 10,
                border: `1px solid ${t.cardBorder}`,
                background: "rgba(0,0,0,0.35)",
                color: t.text,
                fontSize: 14,
                marginBottom: 14,
                fontFamily: "inherit",
              }}
            />

            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: t.textMuted, marginBottom: 6 }}>Notes</label>
            <textarea
              value={impDesc}
              onChange={(e) => setImpDesc(e.target.value)}
              placeholder="Collection context, camera, lighting…"
              rows={3}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "10px 12px",
                borderRadius: 10,
                border: `1px solid ${t.cardBorder}`,
                background: "rgba(0,0,0,0.35)",
                color: t.text,
                fontSize: 14,
                marginBottom: 14,
                fontFamily: "inherit",
                resize: "vertical",
              }}
            />

            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: t.textMuted, marginBottom: 6 }}>
              Images <span style={{ fontWeight: 600, color: t.textMuted }}>(required)</span>
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 8 }}>
              <input
                ref={impFileRef}
                type="file"
                accept="image/*"
                multiple
                onChange={onPickFiles}
                style={{ fontSize: 13, color: t.text, flex: "1 1 180px", minWidth: 0 }}
              />
              <button
                type="button"
                onClick={() => impFileRef.current?.click()}
                style={{
                  padding: "8px 14px",
                  borderRadius: 10,
                  border: `1px solid ${t.cardBorder}`,
                  background: "rgba(255,255,255,0.06)",
                  color: t.text,
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  whiteSpace: "nowrap",
                }}
              >
                Add more images
              </button>
              <button
                type="button"
                disabled={impFiles.length === 0}
                onClick={() => {
                  setImpFiles([]);
                  if (impFileRef.current) impFileRef.current.value = "";
                }}
                style={{
                  padding: "8px 14px",
                  borderRadius: 10,
                  border: `1px solid ${t.cardBorder}`,
                  background: "transparent",
                  color: impFiles.length ? t.textMuted : "rgba(148,163,184,0.35)",
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: impFiles.length ? "pointer" : "not-allowed",
                  fontFamily: "inherit",
                  whiteSpace: "nowrap",
                }}
              >
                Clear all
              </button>
            </div>
            {impFiles.length > 0 ? (
              <ul
                style={{
                  margin: "0 0 12px",
                  padding: "8px 10px 8px 28px",
                  maxHeight: 140,
                  overflowY: "auto",
                  borderRadius: 10,
                  border: `1px solid ${t.cardBorder}`,
                  background: "rgba(0,0,0,0.25)",
                  fontSize: 12,
                  color: t.text,
                  lineHeight: 1.45,
                }}
              >
                {impFiles.map((f, i) => (
                  <li key={`${importFileKey(f)}-${i}`} style={{ marginBottom: 4 }}>
                    <span style={{ wordBreak: "break-all" }}>{f.name}</span>
                    <button
                      type="button"
                      onClick={() => removeImpFileAt(i)}
                      title="Remove from this import"
                      style={{
                        marginLeft: 8,
                        padding: "0 6px",
                        border: "none",
                        background: "transparent",
                        color: "#f87171",
                        fontWeight: 800,
                        cursor: "pointer",
                        fontSize: 13,
                        verticalAlign: "middle",
                        fontFamily: "inherit",
                      }}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <div style={{ fontSize: 12, color: t.textMuted, marginBottom: impError ? 10 : 16 }}>
              {impFiles.length ? (
                <>
                  {impFiles.length} image(s) queued — use <strong style={{ color: t.text }}>Add more images</strong> for another
                  batch, or select several at once (Ctrl+click on Windows, Cmd+click on Mac).
                </>
              ) : (
                <>
                  Choose one or more garbage / scene photos. Select several in one dialog, or add batches with{" "}
                  <strong style={{ color: t.text }}>Add more images</strong>.
                </>
              )}
            </div>
            {impType === "hotspot" ? (
              <p
                style={{
                  margin: "0 0 16px",
                  fontSize: 12,
                  color: t.accent,
                  lineHeight: 1.5,
                  borderLeft: `3px solid rgba(${t.accentRgb}, 0.55)`,
                  paddingLeft: 12,
                }}
              >
                Hotspot imagery is copied to the live map store: pins appear on <strong style={{ color: t.text }}>Dashboard</strong> and{" "}
                <strong style={{ color: t.text }}>Hotspot Mapping</strong> as soon as the name or notes mention a known site (e.g. Nohkalikai Falls, Mawsmai Cave).
              </p>
            ) : null}

            {impError && (
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: "rgba(239,68,68,0.15)",
                  border: "1px solid rgba(239,68,68,0.35)",
                  color: "#fecaca",
                  fontSize: 13,
                  marginBottom: 14,
                }}
              >
                {impError}
              </div>
            )}

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setImportModalOpen(false)}
                style={{
                  padding: "10px 18px",
                  borderRadius: 10,
                  border: `1px solid ${t.cardBorder}`,
                  background: "transparent",
                  color: t.textMuted,
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={impSubmitting}
                onClick={submitImport}
                style={{
                  padding: "10px 18px",
                  borderRadius: 10,
                  border: "none",
                  background: `linear-gradient(135deg, ${t.accent}, ${t.accentSecondary})`,
                  color: "#042f14",
                  fontWeight: 800,
                  fontSize: 13,
                  cursor: impSubmitting ? "wait" : "pointer",
                  fontFamily: "inherit",
                  opacity: impSubmitting ? 0.75 : 1,
                }}
              >
                {impSubmitting ? "Saving…" : "Create dataset"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 1100px) {
          .dataset-mgmt-charts { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

const actionBtn = {
  border: `1px solid rgba(255,255,255,0.12)`,
  background: "rgba(255,255,255,0.06)",
  borderRadius: 8,
  width: 34,
  height: 34,
  cursor: "pointer",
  fontSize: 14,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const pageArrow = {
  ...actionBtn,
  minWidth: 34,
  opacity: 1,
};
