/**
 * Dashboard home — KPIs include **waste classification** stats fed by the Image Classification page:
 * each successful classify calls recordClassification() (see classificationMetrics.js); this file
 * listens for updates and refreshes donuts / lists dynamically (no hard-coded predictions).
 */
import { NavLink } from "react-router-dom";
import { useMemo, useState, useEffect, useCallback } from "react";
import { getClassificationStats, formatInt, getClassificationDailyBuckets } from "../utils/classificationMetrics.js";
import { getTouristZoneVisionStats, getVisionObservationStats } from "../utils/visionSpatialStats.js";
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement, Filler } from "chart.js";
import { Doughnut, Line } from "react-chartjs-2";
import WasteMap from "./WasteMap.jsx";
import ExpandableMapFrame from "./ExpandableMapFrame.jsx";
import { portal as t } from "./portal/portalTheme.js";
import { computeHotspotGarbagePercent } from "../utils/wasteHotspots.js";

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement, Filler);

const DASH = "/dashboard";

const card = {
  background: t.card,
  border: `1px solid ${t.cardBorder}`,
  borderRadius: 14,
  overflow: "hidden",
};

const KPI_ICON = {
  width: 40,
  height: 40,
  borderRadius: 12,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 20,
};

function thumbForPredicted(predicted) {
  const p = String(predicted || "").toLowerCase();
  if (p.includes("organic")) return "🍎";
  if (p.includes("paper")) return "📰";
  if (p.includes("metal")) return "🥫";
  if (p.includes("plastic")) return "🧴";
  return "📷";
}

function typeToneFor(wasteType) {
  const w = String(wasteType || "").toLowerCase();
  if (w.includes("plastic")) return "#34d399";
  if (w.includes("paper")) return "#3b82f6";
  if (w.includes("organic")) return "#5cb85c";
  if (w.includes("metal")) return "#f97316";
  return "#94a3b8";
}

function levelForHotspotPercent(percent) {
  if (percent >= 70) return "High";
  if (percent >= 40) return "Medium";
  return "Low";
}

export default function DashboardHome({
  bins,
  routeData,
  depots,
  selectedDepot,
  citizenReports = [],
  hotspotSitePhotos = [],
  hotspotZones = [],
  hotspotCount = 0,
  onMapLocationClick,
}) {
  const [clsStats, setClsStats] = useState(() => getClassificationStats());

  const refreshCls = useCallback(() => {
    setClsStats(getClassificationStats());
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

  const dailyBuckets = useMemo(() => getClassificationDailyBuckets(clsStats.entries, 7), [clsStats]);

  const visionFieldStats = useMemo(() => getVisionObservationStats(citizenReports || []), [citizenReports]);

  const touristVision = useMemo(() => getTouristZoneVisionStats(citizenReports || []), [citizenReports]);

  const donutData = useMemo(() => {
    const { recyclable, nonRecyclable, total } = clsStats;
    if (total <= 0) {
      return {
        labels: ["No classifications yet"],
        datasets: [
          {
            data: [1],
            backgroundColor: ["rgba(100,116,139,0.45)"],
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

  const donutOpts = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      cutout: "62%",
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: "rgba(228,224,236,0.88)",
            boxWidth: 10,
            padding: 10,
            font: { size: 11 },
          },
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

  const trendData = useMemo(
    () => ({
      labels: dailyBuckets.labels,
      datasets: [
        {
          label: "Total",
          data: dailyBuckets.total,
          borderColor: "#5cb85c",
          backgroundColor: "rgba(92,184,92,0.12)",
          tension: 0.35,
          fill: true,
          pointRadius: 3,
          borderWidth: 2,
        },
        {
          label: "Recyclable",
          data: dailyBuckets.recyclable,
          borderColor: "#5cb85c",
          backgroundColor: "rgba(92,184,92,0.08)",
          tension: 0.35,
          fill: true,
          pointRadius: 3,
          borderWidth: 2,
        },
      ],
    }),
    [dailyBuckets]
  );

  const trendOpts = useMemo(() => {
    const maxVal = Math.max(5, ...dailyBuckets.total, ...dailyBuckets.recyclable);
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        x: {
          grid: { color: "rgba(255,255,255,0.06)" },
          ticks: { color: "rgba(228,224,236,0.65)", font: { size: 10 } },
        },
        y: {
          grid: { color: "rgba(255,255,255,0.06)" },
          ticks: {
            color: "rgba(228,224,236,0.65)",
            font: { size: 10 },
            callback: (v) => (v >= 1000 ? `${v / 1000}K` : v),
          },
          suggestedMax: Math.ceil(maxVal * 1.15),
        },
      },
      plugins: {
        legend: {
          position: "top",
          align: "end",
          labels: { color: "rgba(228,224,236,0.88)", boxWidth: 12, font: { size: 11 } },
        },
      },
    };
  }, [dailyBuckets]);

  const recentRows = useMemo(() => {
    return [...clsStats.entries]
      .slice(-8)
      .reverse()
      .map((e) => {
        const predicted = e.predictedClass || "—";
        const wt = e.wasteType || "—";
        const confLabel = e.recyclable ? "Recyclable" : "Non-recyclable";
        const confTone = e.recyclable ? "#5cb85c" : "#eab308";
        const confDetail =
          typeof e.confidence === "number" && Number.isFinite(e.confidence)
            ? `${Math.round(e.confidence)}% · ${confLabel}`
            : confLabel;
        return {
          key: e.ts,
          thumb: thumbForPredicted(predicted),
          predicted,
          type: wt,
          typeTone: typeToneFor(wt),
          conf: confDetail,
          confTone,
          time: new Date(e.ts).toLocaleString(undefined, { hour: "numeric", minute: "2-digit", month: "short", day: "numeric" }),
        };
      });
  }, [clsStats.entries]);

  const hotspotRows = useMemo(() => {
    return (hotspotZones || [])
      .map((spot) => {
        const percent = computeHotspotGarbagePercent(spot, bins || [], hotspotSitePhotos || []);
        return {
          name: spot.name,
          percent,
          level: levelForHotspotPercent(percent),
          totalLabel: `${Math.round(percent)}%`,
        };
      })
      .sort((a, b) => b.percent - a.percent || a.name.localeCompare(b.name))
      .slice(0, 8)
      .map((row, idx) => ({
        ...row,
        rank: idx + 1,
      }));
  }, [bins, hotspotSitePhotos, hotspotZones]);

  const dashboardAlerts = useMemo(() => {
    return (citizenReports || []).slice(0, 8).map((r) => {
      const isHi = r.type === "Overflow";
      return {
        key: String(r.id ?? `${r.timestamp}-${r.type}`),
        tone: isHi ? "#ef4444" : "#eab308",
        border: isHi ? "rgba(239,68,68,0.35)" : "rgba(234,179,8,0.35)",
        title: `${r.type} reported`,
        body: `Status: ${r.status ?? "open"} · citizen map`,
        time: r.timestamp ? new Date(r.timestamp).toLocaleString() : "",
      };
    });
  }, [citizenReports]);

  const kpiCards = useMemo(() => {
    const { total, recyclable, nonRecyclable, avgConfidence, momCountPct, weekAccuracyDeltaPct } = clsStats;
    const recPct = total > 0 ? (recyclable / total) * 100 : 0;
    const nonPct = total > 0 ? (nonRecyclable / total) * 100 : 0;

    const totalSub =
      total === 0
        ? "Run image classification to populate"
        : momCountPct == null
          ? "Building 30-day comparison…"
          : `${momCountPct >= 0 ? "+" : ""}${momCountPct.toFixed(1)}% vs prior 30 days`;

    const accValue = avgConfidence != null ? `${avgConfidence.toFixed(2)}%` : "—";
    const accSub =
      avgConfidence == null
        ? "No classifications yet"
        : weekAccuracyDeltaPct == null
          ? "Needs history for trend"
          : `${weekAccuracyDeltaPct >= 0 ? "↑" : "↓"} ${Math.abs(weekAccuracyDeltaPct).toFixed(1)}% vs prior week`;

    return [
      {
        label: "Total Images Analyzed",
        value: formatInt(total),
        sub: totalSub,
        subUp: total > 0 && momCountPct != null && momCountPct >= 0,
        iconBg: "rgba(92,184,92,0.25)",
        emoji: "📊",
      },
      {
        label: "Recyclable Waste",
        value: formatInt(recyclable),
        sub: total > 0 ? `${recPct.toFixed(1)}% of total` : "—",
        subUp: false,
        iconBg: "rgba(92,184,92,0.22)",
        emoji: "♻️",
      },
      {
        label: "Non-Recyclable Waste",
        value: formatInt(nonRecyclable),
        sub: total > 0 ? `${nonPct.toFixed(1)}% of total` : "—",
        subUp: false,
        iconBg: "rgba(234,179,8,0.2)",
        emoji: "🗑️",
      },
      {
        label: "Hotspot Areas",
        value: String(hotspotCount),
        sub: "Sites under critical pressure (≥95% fill signal)",
        subUp: false,
        iconBg: "rgba(239,68,68,0.2)",
        emoji: "📍",
      },
      {
        label: "Avg. confidence (runs)",
        value: accValue,
        sub: accSub,
        subUp: avgConfidence != null && weekAccuracyDeltaPct != null && weekAccuracyDeltaPct >= 0,
        iconBg: "rgba(59,130,246,0.22)",
        emoji: "🧠",
      },
    ];
  }, [clsStats, hotspotCount]);

  return (
    <div style={{ display: "grid", gap: 18, paddingBottom: 8 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 160px), 1fr))",
          gap: 14,
        }}
      >
        {kpiCards.map((k) => (
          <div key={k.label} style={{ ...card, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 8, fontWeight: 600 }}>{k.label}</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: t.text, letterSpacing: "-0.02em" }}>{k.value}</div>
                <div
                  style={{
                    fontSize: 11,
                    marginTop: 6,
                    color: k.subUp === true ? "#86efac" : t.textMuted,
                  }}
                >
                  {k.sub}
                </div>
              </div>
              <div style={{ ...KPI_ICON, background: k.iconBg }}>{k.emoji}</div>
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          ...card,
          padding: "12px 16px",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <p style={{ margin: 0, fontSize: 13, color: t.textMuted, lineHeight: 1.45, maxWidth: 560 }}>
          <strong style={{ color: t.text }}>Hotspot Mapping</strong> is the full field workspace: incident pins, Optimize route/Clear route, citizen reports list, and map mode controls (sidebar appears on that page).
        </p>
        <NavLink
          to={`${DASH}/field`}
          style={{
            flexShrink: 0,
            padding: "10px 16px",
            borderRadius: 12,
            border: `1px solid rgba(${t.accentRgb}, 0.45)`,
            background: `rgba(${t.accentRgb}, 0.18)`,
            color: t.accent,
            fontWeight: 800,
            fontSize: 13,
            textDecoration: "none",
          }}
        >
          Open Hotspot Mapping →
        </NavLink>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.6fr) minmax(280px, 1fr)",
          gap: 18,
          alignItems: "stretch",
        }}
        className="dashboard-home-mid"
      >
        <ExpandableMapFrame
          title="Waste Hotspot Map — Meghalaya"
          subtitle="Circles: curated tourist sites (severity from nearby telemetry). Route line, truck, and numbered badges use hotspot stops only—not individual bin dots."
          collapsedHeight="clamp(420px, 58vh, 720px)"
          cardStyle={{ ...card, display: "flex", flexDirection: "column" }}
        >
          <WasteMap
            bins={bins}
            routeData={routeData}
            depots={depots}
            selectedDepot={selectedDepot}
            citizenReports={citizenReports}
            hotspotSitePhotos={hotspotSitePhotos}
            hotspotZones={hotspotZones}
            onLocationClick={onMapLocationClick}
            showObservationHeat={false}
            showBins={false}
            showBinDensityHeat={false}
          />
        </ExpandableMapFrame>

        <div style={{ ...card, padding: 16, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>Waste Classification</div>
            <span style={{ fontSize: 11, color: t.textMuted }}>Local log</span>
          </div>
          <div style={{ flex: 1, minHeight: 220, position: "relative" }}>
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
              <div style={{ fontSize: 22, fontWeight: 800, color: t.text }}>
                {formatInt(clsStats.total)}
              </div>
              <div style={{ fontSize: 11, color: t.textMuted }}>Total</div>
            </div>
          </div>
          <NavLink
            to={`${DASH}/classify`}
            style={{
              marginTop: 12,
              fontSize: 13,
              fontWeight: 700,
              color: t.accent,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            View Details →
          </NavLink>
        </div>
      </div>

      {visionFieldStats.total > 0 ? (
        <div
          style={{
            ...card,
            padding: "12px 14px",
            fontSize: 12,
            color: t.textMuted,
            lineHeight: 1.5,
            borderLeft: `4px solid ${t.accent}`,
          }}
        >
          <strong style={{ color: t.text }}>GPS-linked AI observations:</strong>{" "}
          {formatInt(visionFieldStats.total)} report(s) with vision metadata · Recyclable {formatInt(visionFieldStats.recyclable)} · Non-recyclable{" "}
          {formatInt(visionFieldStats.nonRecyclable)}
          {visionFieldStats.unknown > 0 ? ` · Label unclear ${formatInt(visionFieldStats.unknown)}` : ""}. Shown on the map markers.
          {touristVision.visionCount > 0 ? (
            <>
              {" "}
              · <strong style={{ color: t.text }}>Tourist-area trend:</strong> {formatInt(touristVision.inTouristZone)} of{" "}
              {formatInt(touristVision.visionCount)} vision pins fall inside mapped East Khasi Hills / Sohra tourism hotspot circles (monitoring focus for
              visitor corridors).
            </>
          ) : null}
        </div>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr) minmax(260px, 0.9fr)",
          gap: 18,
          alignItems: "stretch",
        }}
        className="dashboard-home-bottom"
      >
        <div style={{ ...card }}>
          <div style={{ padding: "12px 14px", borderBottom: `1px solid ${t.cardBorder}`, fontWeight: 800, fontSize: 14 }}>
            Recent Classifications
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ color: t.textMuted, textAlign: "left" }}>
                  <th style={{ padding: "10px 12px", fontWeight: 600 }}>Image</th>
                  <th style={{ padding: "10px 8px", fontWeight: 600 }}>Predicted Class</th>
                  <th style={{ padding: "10px 8px", fontWeight: 600 }}>Type</th>
                  <th style={{ padding: "10px 8px", fontWeight: 600 }}>Confidence</th>
                  <th style={{ padding: "10px 12px", fontWeight: 600 }}>Time</th>
                </tr>
              </thead>
              <tbody>
                {recentRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: "22px 14px", color: t.textMuted, textAlign: "center", lineHeight: 1.5 }}>
                      No classifications logged yet. Use Image Classification — results appear here from your browser session.
                    </td>
                  </tr>
                ) : (
                  recentRows.map((row) => (
                    <tr key={row.key} style={{ borderTop: `1px solid ${t.cardBorder}` }}>
                      <td style={{ padding: "10px 12px", fontSize: 18 }}>{row.thumb}</td>
                      <td style={{ padding: "10px 8px", fontWeight: 600, color: t.text }}>{row.predicted}</td>
                      <td style={{ padding: "10px 8px" }}>
                        <span
                          style={{
                            padding: "4px 8px",
                            borderRadius: 8,
                            background: `${row.typeTone}33`,
                            color: row.typeTone,
                            fontWeight: 700,
                            fontSize: 11,
                          }}
                        >
                          {row.type}
                        </span>
                      </td>
                      <td style={{ padding: "10px 8px" }}>
                        <span
                          style={{
                            padding: "4px 8px",
                            borderRadius: 8,
                            background: `${row.confTone}33`,
                            color: row.confTone,
                            fontWeight: 700,
                            fontSize: 11,
                          }}
                        >
                          {row.conf}
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px", color: t.textMuted }}>{row.time}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div style={{ padding: "12px 14px", borderTop: `1px solid ${t.cardBorder}` }}>
            <NavLink to={`${DASH}/classify`} style={{ fontSize: 13, fontWeight: 700, color: t.accent, textDecoration: "none" }}>
              View All Classifications →
            </NavLink>
          </div>
        </div>

        <div style={{ ...card, padding: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontWeight: 800, fontSize: 14 }}>Waste Trend (This Week)</span>
            <select
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: `1px solid ${t.cardBorder}`,
                background: "rgba(0,0,0,0.35)",
                color: t.text,
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              <option>This Week</option>
              <option>This Month</option>
            </select>
          </div>
          <div style={{ height: 220 }}>
            <Line data={trendData} options={trendOpts} />
          </div>
        </div>

        <div style={{ ...card }}>
          <div style={{ padding: "12px 14px", borderBottom: `1px solid ${t.cardBorder}`, fontWeight: 800, fontSize: 14 }}>
            Top Hotspot Areas
          </div>
          <div style={{ padding: "8px 12px 12px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ color: t.textMuted, textAlign: "left" }}>
                  <th style={{ padding: "8px 6px", width: 36 }}>#</th>
                  <th style={{ padding: "8px 6px", fontWeight: 600 }}>Location</th>
                  <th style={{ padding: "8px 6px", fontWeight: 600 }}>Waste Level</th>
                  <th style={{ padding: "8px 6px", fontWeight: 600, textAlign: "right" }}>Waste Pressure</th>
                </tr>
              </thead>
              <tbody>
                {hotspotRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: "22px 12px", color: t.textMuted, textAlign: "center", lineHeight: 1.5 }}>
                      No configured hotspot areas yet.
                    </td>
                  </tr>
                ) : (
                  hotspotRows.map((row) => (
                    <tr key={row.name} style={{ borderTop: `1px solid ${t.cardBorder}` }}>
                      <td style={{ padding: "10px 6px", fontWeight: 800, color: t.textMuted }}>{row.rank}</td>
                      <td style={{ padding: "10px 6px", fontWeight: 600 }}>{row.name}</td>
                      <td style={{ padding: "10px 6px", color: t.textMuted }}>{row.level}</td>
                      <td style={{ padding: "10px 6px", textAlign: "right", fontWeight: 700 }}>{row.totalLabel}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div style={{ padding: "12px 14px", borderTop: `1px solid ${t.cardBorder}` }}>
            <NavLink to={`${DASH}/field`} style={{ fontSize: 13, fontWeight: 700, color: t.accent, textDecoration: "none" }}>
              View All Hotspots →
            </NavLink>
          </div>
        </div>
      </div>

      <div style={{ ...card, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
          <span style={{ fontWeight: 800, fontSize: 14 }}>Recent Alerts &amp; Notifications</span>
          <NavLink to={`${DASH}/alerts`} style={{ fontSize: 12, fontWeight: 700, color: t.accent, textDecoration: "none" }}>
            View All Alerts →
          </NavLink>
        </div>
        {dashboardAlerts.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: t.textMuted, lineHeight: 1.55 }}>
            No citizen field reports in this session. Overflow and cleanliness alerts appear here when reported from the map.
          </p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 220px), 1fr))", gap: 12 }}>
            {dashboardAlerts.map((a) => (
              <div
                key={a.key}
                style={{
                  padding: "14px 14px",
                  borderRadius: 12,
                  border: `1px solid ${a.border}`,
                  background: "rgba(0,0,0,0.28)",
                  borderLeft: `4px solid ${a.tone}`,
                }}
              >
                <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 6, color: a.tone }}>{a.title}</div>
                <div style={{ fontSize: 12, color: t.text, lineHeight: 1.45 }}>{a.body}</div>
                {a.time ? <div style={{ fontSize: 11, color: t.textMuted, marginTop: 8 }}>{a.time}</div> : null}
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        @media (max-width: 1100px) {
          .dashboard-home-mid { grid-template-columns: 1fr !important; }
          .dashboard-home-bottom { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
