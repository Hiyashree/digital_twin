import { NavLink, useSearchParams } from "react-router-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDatasetLibrary } from "../context/DatasetLibraryContext.jsx";
import { getClassificationStats, formatInt, clearClassificationLog } from "../utils/classificationMetrics.js";
import { getMlGallerySamples, removeMlGallerySample, clearMlGallery } from "../utils/mlGalleryStorage.js";
import { portal as t } from "./portal/portalTheme.js";
import { getFeedbackEvaluationStats } from "../utils/modelEvaluation.js";
import { clearTrainingQueue } from "../utils/trainingDatasetStorage.js";

const DASH = "/dashboard";

const card = {
  background: t.card,
  border: `1px solid ${t.cardBorder}`,
  borderRadius: 14,
  overflow: "hidden",
};

const TYPE_LABEL = {
  waste: "Waste type",
  recyclability: "Recyclability",
  hotspot: "Hotspot imagery",
  custom: "Custom",
};

function formatMlHubSizeGb(sizeGb) {
  const g = Number(sizeGb);
  if (!Number.isFinite(g) || g <= 0) return "0 MB";
  if (g < 0.01) return `${(g * 1024).toFixed(1)} MB`;
  return `${g.toFixed(2)} GB`;
}

const TAB_IDS = ["overview", "datasets", "gallery", "evaluation"];

export default function MlDataHub() {
  const { datasets, metrics } = useDatasetLibrary();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get("tab");
  const [tab, setTab] = useState(() => (tabFromUrl && TAB_IDS.includes(tabFromUrl) ? tabFromUrl : "overview"));
  const [cls, setCls] = useState(() => getClassificationStats());
  const [gallery, setGallery] = useState(() => getMlGallerySamples());
  const [evalStats, setEvalStats] = useState(() => getFeedbackEvaluationStats());

  const refresh = useCallback(() => {
    setCls(getClassificationStats());
    setGallery(getMlGallerySamples());
    setEvalStats(getFeedbackEvaluationStats());
  }, []);

  useEffect(() => {
    if (tabFromUrl && TAB_IDS.includes(tabFromUrl)) setTab(tabFromUrl);
  }, [tabFromUrl]);

  useEffect(() => {
    refresh();
    const onGal = () => refresh();
    const onCls = () => refresh();
    const onStorage = (e) => {
      if (e.key === "msw_ml_gallery_v1" || e.key === "msw_vit_classification_log_v1" || e.key === null) refresh();
    };
    window.addEventListener("msw-ml-gallery-updated", onGal);
    window.addEventListener("msw-classification-log-updated", onCls);
    window.addEventListener("msw-training-queue-updated", onCls);
    window.addEventListener("msw-training-override-updated", onCls);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("msw-ml-gallery-updated", onGal);
      window.removeEventListener("msw-classification-log-updated", onCls);
      window.removeEventListener("msw-training-queue-updated", onCls);
      window.removeEventListener("msw-training-override-updated", onCls);
      window.removeEventListener("storage", onStorage);
    };
  }, [refresh]);

  const overviewKpis = useMemo(
    () => [
      {
        label: "Classification runs (this browser)",
        value: formatInt(cls.total),
        sub: cls.avgConfidence != null ? `Avg confidence ${cls.avgConfidence.toFixed(1)}%` : "No runs yet",
        emoji: "🔮",
      },
      {
        label: "Registered datasets",
        value: formatInt(metrics.count),
        sub:
          metrics.count === 0
            ? "No catalog rows — add datasets only from files you control (Dataset Management)"
            : `${formatInt(metrics.totalImages)} images registered (catalog is file-based in this browser)`,
        emoji: "📁",
      },
      {
        label: "Gallery samples",
        value: formatInt(gallery.length),
        sub: "Thumbnails from Image Classification (this browser)",
        emoji: "🖼️",
      },
      {
        label: "Recyclable vs other",
        value: cls.total ? `${((cls.recyclable / cls.total) * 100).toFixed(0)}% rec.` : "—",
        sub: cls.total ? `${formatInt(cls.recyclable)} rec · ${formatInt(cls.nonRecyclable)} non-rec` : "Run classify to populate",
        emoji: "♻️",
      },
    ],
    [cls, metrics, gallery.length]
  );

  const tabs = [
    ["overview", "Overview"],
    ["datasets", "Training datasets"],
    ["gallery", "Inference gallery"],
    ["evaluation", "Model evaluation"],
  ];

  return (
    <div style={{ paddingBottom: 28 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 18 }}>
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setTab(id);
              if (id === "overview") setSearchParams({});
              else setSearchParams({ tab: id });
            }}
            style={{
              padding: "10px 18px",
              borderRadius: 12,
              border: `1px solid ${tab === id ? `rgba(${t.accentRgb}, 0.55)` : t.cardBorder}`,
              background: tab === id ? `rgba(${t.accentRgb}, 0.18)` : "transparent",
              color: tab === id ? "#fff" : t.textMuted,
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {label}
          </button>
        ))}
        <div style={{ marginLeft: "auto", display: "flex", flexWrap: "wrap", gap: 10 }}>
          <NavLink
            to={`${DASH}/classify`}
            style={{
              padding: "10px 16px",
              borderRadius: 12,
              border: `1px solid rgba(${t.accentRgb}, 0.45)`,
              background: `rgba(${t.accentRgb}, 0.12)`,
              color: t.accent,
              fontWeight: 700,
              fontSize: 13,
              textDecoration: "none",
            }}
          >
            Open Image Classification →
          </NavLink>
          <NavLink
            to={`${DASH}/datasets`}
            style={{
              padding: "10px 16px",
              borderRadius: 12,
              border: `1px solid ${t.cardBorder}`,
              color: t.textMuted,
              fontWeight: 700,
              fontSize: 13,
              textDecoration: "none",
            }}
          >
            Dataset Management →
          </NavLink>
        </div>
      </div>

      {tab === "overview" && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 160px), 1fr))",
              gap: 14,
              marginBottom: 22,
            }}
          >
            {overviewKpis.map((k) => (
              <div key={k.label} style={{ ...card, padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: t.textMuted, fontWeight: 600, marginBottom: 8 }}>{k.label}</div>
                    <div style={{ fontSize: 24, fontWeight: 800 }}>{k.value}</div>
                    <div style={{ fontSize: 11, color: "#86efac", marginTop: 6 }}>{k.sub}</div>
                  </div>
                  <span style={{ fontSize: 26 }}>{k.emoji}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "datasets" && (
        <div style={{ ...card }}>
          <div style={{ padding: "14px 16px", borderBottom: `1px solid ${t.cardBorder}`, fontWeight: 800, fontSize: 14 }}>
            Registered datasets ({datasets.length})
          </div>
          <p style={{ margin: 0, padding: "12px 16px", fontSize: 12, color: t.textMuted, lineHeight: 1.55, borderBottom: `1px solid ${t.cardBorder}` }}>
            Image counts and sizes come <strong style={{ color: t.text }}>only</strong> from datasets you add under Dataset Management (actual files you
            upload). This portal does not display vendor placeholder volumes as official statistics.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ color: t.textMuted, textAlign: "left" }}>
                  <th style={{ padding: "12px 14px" }}>Name</th>
                  <th style={{ padding: "12px 10px" }}>Purpose</th>
                  <th style={{ padding: "12px 10px" }}>Images</th>
                  <th style={{ padding: "12px 10px" }}>Size</th>
                  <th style={{ padding: "12px 10px" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {datasets.map((d) => (
                  <tr key={d.id} style={{ borderTop: `1px solid ${t.cardBorder}` }}>
                    <td style={{ padding: "12px 14px", fontWeight: 700 }}>
                      <span style={{ marginRight: 8 }}>{d.thumb}</span>
                      {d.name}
                    </td>
                    <td style={{ padding: "12px 10px", color: t.textMuted }}>{TYPE_LABEL[d.typeKey] || d.typeKey}</td>
                    <td style={{ padding: "12px 10px" }}>{d.imagesNum.toLocaleString()}</td>
                    <td style={{ padding: "12px 10px" }}>{formatMlHubSizeGb(d.sizeGb)}</td>
                    <td style={{ padding: "12px 10px" }}>{d.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {datasets.length === 0 && (
            <div style={{ padding: 28, textAlign: "center", color: t.textMuted, fontSize: 13, lineHeight: 1.6, maxWidth: 520, margin: "0 auto" }}>
              No datasets registered. Use{" "}
              <NavLink to={`${DASH}/datasets`} style={{ color: t.accent, fontWeight: 700 }}>
                Dataset Management
              </NavLink>{" "}
              to import images you own or are authorised to use — counts will reflect those files only.
            </div>
          )}
        </div>
      )}

      {tab === "gallery" && (
        <div>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12, marginBottom: 14, alignItems: "center" }}>
            <p style={{ margin: 0, fontSize: 13, color: t.textMuted, maxWidth: 560 }}>
              Visual history of classification runs from <NavLink to={`${DASH}/classify`}>Image Classification</NavLink>. Oldest entries drop off when the
              gallery hits the browser storage cap (oldest thumbnails are removed first).
            </p>
            {gallery.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm("Remove all inference thumbnails from this browser?")) clearMlGallery();
                  refresh();
                }}
                style={{
                  padding: "8px 14px",
                  borderRadius: 10,
                  border: "1px solid rgba(239,68,68,0.45)",
                  background: "rgba(239,68,68,0.12)",
                  color: "#fecaca",
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Clear gallery
              </button>
            )}
          </div>

          {gallery.length === 0 ? (
            <div style={{ ...card, padding: 40, textAlign: "center" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🖼️</div>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>No inference samples yet</div>
              <div style={{ color: t.textMuted, fontSize: 13, marginBottom: 18 }}>
                Upload a waste photo and run <strong style={{ color: t.text }}>Classify Waste</strong> — a thumbnail and prediction will appear
                here.
              </div>
              <NavLink
                to={`${DASH}/classify`}
                style={{
                  display: "inline-block",
                  padding: "12px 20px",
                  borderRadius: 12,
                  background: `linear-gradient(135deg, ${t.accent}, ${t.accentSecondary})`,
                  color: "#042f14",
                  fontWeight: 800,
                  fontSize: 14,
                  textDecoration: "none",
                }}
              >
                Go to classification
              </NavLink>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 200px), 1fr))",
                gap: 14,
              }}
            >
              {gallery.map((s) => (
                <div
                  key={s.id}
                  style={{
                    ...card,
                    padding: 12,
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      aspectRatio: "4/3",
                      borderRadius: 12,
                      overflow: "hidden",
                      background: "rgba(0,0,0,0.35)",
                      border: `1px solid ${t.cardBorder}`,
                    }}
                  >
                    <img src={s.thumbDataUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 13, lineHeight: 1.3 }}>{s.predictedClass}</div>
                  <div style={{ fontSize: 11, color: t.textMuted }}>
                    {s.recyclable ? (
                      <span style={{ color: "#86efac", fontWeight: 700 }}>Recyclable</span>
                    ) : (
                      <span style={{ color: "#fca5a5", fontWeight: 700 }}>Non-recyclable</span>
                    )}{" "}
                    · {typeof s.confidence === "number" ? `${s.confidence.toFixed(1)}%` : "—"}
                  </div>
                  <div style={{ fontSize: 10, color: t.textMuted }}>
                    {new Date(s.ts).toLocaleString()}
                    {s.fileName ? ` · ${s.fileName}` : ""}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      removeMlGallerySample(s.id);
                      refresh();
                    }}
                    style={{
                      alignSelf: "flex-start",
                      padding: "6px 10px",
                      borderRadius: 8,
                      border: `1px solid ${t.cardBorder}`,
                      background: "transparent",
                      color: t.textMuted,
                      fontSize: 11,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "evaluation" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ ...card, padding: 18 }}>
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 8 }}>Evaluation</div>
            <p style={{ margin: "0 0 14px", fontSize: 13, color: t.textMuted, lineHeight: 1.55 }}>
              Accuracy is computed only from images you reviewed and saved to the training queue. Unreviewed images are shown as pending and do not affect the score.
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 200px), 1fr))",
                gap: 12,
              }}
            >
              {[
                [
                  "Accuracy (reviewed images)",
                  evalStats.accuracy == null ? "—" : `${(evalStats.accuracy * 100).toFixed(1)}%`,
                  evalStats.totalLabeled
                    ? `${formatInt(evalStats.matched)} correct · ${formatInt(evalStats.corrected)} corrected by you (n=${formatInt(evalStats.totalLabeled)} reviewed)`
                    : "No reviewed samples yet — save labels to populate",
                ],
                [
                  "Macro-F1",
                  evalStats.macroF1 == null ? "—" : `${(evalStats.macroF1 * 100).toFixed(1)}%`,
                  "Macro-F1 across Plastic/Paper/Organic/Metal/Glass/Mixed (reviewed only)",
                ],
                [
                  "Recyclability accuracy",
                  evalStats.binaryAccuracy == null ? "—" : `${(evalStats.binaryAccuracy * 100).toFixed(1)}%`,
                  evalStats.binaryTotal ? `Recyclable vs non-recyclable (n=${formatInt(evalStats.binaryTotal)} reviewed)` : "No labeled binary samples yet",
                ],
                [
                  "Pending review",
                  formatInt(Math.max(0, (cls?.total || 0) - (evalStats?.totalLabeled || 0))),
                  "Images classified but not yet saved to training queue (not counted in accuracy)",
                ],
              ].map(([label, val, hint]) => (
                <div key={label} style={{ padding: 14, borderRadius: 12, border: `1px solid ${t.cardBorder}`, background: "rgba(0,0,0,0.18)" }}>
                  <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 6 }}>{label}</div>
                  <div style={{ fontSize: 22, fontWeight: 800 }}>{val}</div>
                  <div style={{ fontSize: 10, color: t.textMuted, marginTop: 6 }}>{hint}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ ...card, padding: 18 }}>
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 8 }}>Live signals</div>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: t.textMuted }}>
              These come from the interactive <NavLink to={`${DASH}/classify`}>Image Classification</NavLink> browser demo — useful for UX flow, not a
              substitute for offline test metrics above.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
              <div style={{ padding: 12, borderRadius: 10, background: "rgba(92,184,92,0.08)", border: `1px solid ${t.cardBorder}` }}>
                <div style={{ fontSize: 11, color: t.textMuted }}>Inference runs logged</div>
                <div style={{ fontSize: 20, fontWeight: 800 }}>{formatInt(cls.total)}</div>
              </div>
              <div style={{ padding: 12, borderRadius: 10, background: "rgba(92,184,92,0.08)", border: `1px solid ${t.cardBorder}` }}>
                <div style={{ fontSize: 11, color: t.textMuted }}>Mean confidence (demo)</div>
                <div style={{ fontSize: 20, fontWeight: 800 }}>
                  {cls.avgConfidence != null ? `${cls.avgConfidence.toFixed(1)}%` : "—"}
                </div>
              </div>
              <div style={{ padding: 12, borderRadius: 10, background: "rgba(92,184,92,0.08)", border: `1px solid ${t.cardBorder}` }}>
                <div style={{ fontSize: 11, color: t.textMuted }}>Recyclable share</div>
                <div style={{ fontSize: 20, fontWeight: 800 }}>
                  {cls.total ? `${((cls.recyclable / cls.total) * 100).toFixed(1)}%` : "—"}
                </div>
              </div>
            </div>
          </div>

          <div style={{ ...card, padding: 18 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 8 }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>Reviewed vs corrected</div>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm("Reset all evaluation data? This clears the training queue and classification log so you start fresh. This cannot be undone.")) {
                    clearTrainingQueue();
                    clearClassificationLog();
                    refresh();
                  }
                }}
                style={{
                  padding: "7px 14px",
                  borderRadius: 10,
                  border: "1px solid rgba(239,68,68,0.45)",
                  background: "rgba(239,68,68,0.1)",
                  color: "#fca5a5",
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Reset evaluation data
              </button>
            </div>
            <p style={{ margin: "0 0 4px", fontSize: 12, color: t.textMuted, lineHeight: 1.55 }}>
              Use <strong style={{ color: t.text }}>Reset</strong> to discard old inaccurate runs and start fresh — only new labels you save will count.
            </p>
            {evalStats.totalLabeled ? (
              <p style={{ margin: "8px 0 0", fontSize: 12, color: t.textMuted, lineHeight: 1.55 }}>
                Current summary: <strong style={{ color: "#86efac" }}>{formatInt(evalStats.matched)}</strong> correct ·{" "}
                <strong style={{ color: "#fca5a5" }}>{formatInt(evalStats.corrected)}</strong> corrected by you (out of {formatInt(evalStats.totalLabeled)} reviewed)
              </p>
            ) : (
              <p style={{ margin: "8px 0 0", fontSize: 12, color: t.textMuted, lineHeight: 1.55 }}>
                No feedback yet. Classify an image, confirm the label, and click <strong style={{ color: t.text }}>Save to training queue</strong> — metrics will appear here.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Benchmarks and ML pipeline sections removed because they were purely theoretical placeholders. */}
    </div>
  );
}
