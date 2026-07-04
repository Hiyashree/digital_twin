import { useMemo } from "react";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";
import { Doughnut } from "react-chartjs-2";
import WasteMap from "./WasteMap.jsx";
import ExpandableMapFrame from "./ExpandableMapFrame.jsx";
import { portal as t } from "./portal/portalTheme.js";
import {
  getVisionObservationStatsInHotspots,
  filterReportsInHotspotZones,
} from "../utils/visionSpatialStats.js";
import { distanceMeters } from "../utils/wasteHotspots.js";

ChartJS.register(ArcElement, Tooltip, Legend);

const card = {
  background: t.card,
  border: `1px solid ${t.cardBorder}`,
  borderRadius: 14,
};

export default function HotspotMappingPage({
  bins,
  citizenReports,
  hotspotSitePhotos = [],
  hotspotZones = [],
  routeData,
  depots,
  selectedDepot,
  reportingLocation,
  reportsSyncing,
  reportsReady,
  routeMessage = "",
  isRouting = false,
  onOptimizeRoute,
  onClearRoute,
  onLocationClick,
  onReportOverflow,
  onReportDirty,
  onResolveReport,
  onRemoveReport,
}) {
  const rangeLabel = "Set date range when analytics API is connected";

  const heatToggle = (active) => ({
    padding: "6px 12px",
    borderRadius: 999,
    border: `1px solid ${active ? `rgba(${t.accentRgb}, 0.65)` : t.cardBorder}`,
    background: active ? `rgba(${t.accentRgb}, 0.16)` : "rgba(255,255,255,0.05)",
    color: active ? t.accent : t.textMuted,
    fontWeight: 700,
    fontSize: 11,
    cursor: "pointer",
    fontFamily: "inherit",
  });

  const visionStats = useMemo(
    () => getVisionObservationStatsInHotspots(citizenReports || []),
    [citizenReports]
  );

  const reportsInHotspotZones = useMemo(
    () => filterReportsInHotspotZones(citizenReports || []),
    [citizenReports]
  );

  const kpiCards = useMemo(() => {
    const reports = citizenReports || [];
    const open = reports.filter((r) => String(r?.status || "").toLowerCase() === "open").length;
    return [
      {
        label: "Admin reports",
        value: reports.length,
        trend: "Logged from this session map",
        tone: "#3b82f6",
      },
      {
        label: "Inside hotspot zones",
        value: reportsInHotspotZones.length,
        trend: "GPS within named POI circles",
        tone: "#5cb85c",
      },
      {
        label: "Open incidents",
        value: open,
        trend: "Awaiting resolve",
        tone: "#f97316",
      },
      {
        label: "AI in zones",
        value: visionStats.total,
        trend: "Waste observation + vision metadata",
        tone: "#a78bfa",
      },
    ];
  }, [citizenReports, reportsInHotspotZones.length, visionStats.total]);

  const topHotspots = useMemo(() => {
    const reports = citizenReports || [];
    if (!reports.length) return [];
    const m = new Map();
    for (const r of reports) {
      const lat = Number(r?.location?.lat);
      const lng = Number(r?.location?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      let zoneName = null;
      for (const s of hotspotZones || []) {
        if (distanceMeters(s.lat, s.lng, lat, lng) <= s.radiusM) {
          zoneName = s.name;
          break;
        }
      }
      const key = zoneName || `${lat.toFixed(2)},${lng.toFixed(2)}`;
      const displayName = zoneName || `≈ ${lat.toFixed(2)}°, ${lng.toFixed(2)}°`;
      const cur = m.get(key) || { name: displayName, count: 0 };
      cur.count += 1;
      cur.name = displayName;
      m.set(key, cur);
    }
    return [...m.values()].sort((a, b) => b.count - a.count).slice(0, 5);
  }, [citizenReports, hotspotZones]);

  const visionDonutData = useMemo(() => {
    const { total, recyclable, nonRecyclable, unknown } = visionStats;
    if (total <= 0) {
      return {
        labels: ["No AI-linked reports in hotspot zones"],
        datasets: [{ data: [1], backgroundColor: ["rgba(100,116,139,0.4)"], borderWidth: 0 }],
      };
    }
    if (unknown > 0) {
      return {
        labels: ["Recyclable (AI)", "Non-recyclable (AI)", "Unclear label"],
        datasets: [
          {
            data: [recyclable, nonRecyclable, unknown],
            backgroundColor: ["#34d399", "#eab308", "#64748b"],
            borderWidth: 0,
          },
        ],
      };
    }
    return {
      labels: ["Recyclable (AI)", "Non-recyclable (AI)"],
      datasets: [
        {
          data: [recyclable, nonRecyclable],
          backgroundColor: ["#34d399", "#eab308"],
          borderWidth: 0,
        },
      ],
    };
  }, [visionStats]);

  const incidentMixDonutData = useMemo(() => {
    const rows = reportsInHotspotZones;
    let overflow = 0;
    let dirty = 0;
    let wasteObs = 0;
    let other = 0;
    for (const r of rows) {
      const typ = String(r?.type || "");
      if (typ === "Overflow") overflow += 1;
      else if (typ === "Dirty Area") dirty += 1;
      else if (typ === "Waste observation") wasteObs += 1;
      else if (typ) other += 1;
    }
    const sum = overflow + dirty + wasteObs + other;
    if (sum === 0) {
      return {
        labels: ["No reports inside hotspot zones"],
        datasets: [{ data: [1], backgroundColor: ["rgba(100,116,139,0.4)"], borderWidth: 0 }],
      };
    }
    const labels = [];
    const data = [];
    const colors = [];
    if (overflow > 0) {
      labels.push("Overflow");
      data.push(overflow);
      colors.push("#ef4444");
    }
    if (dirty > 0) {
      labels.push("Dirty area");
      data.push(dirty);
      colors.push("#f97316");
    }
    if (wasteObs > 0) {
      labels.push("Waste observation");
      data.push(wasteObs);
      colors.push("#38bdf8");
    }
    if (other > 0) {
      labels.push("Other");
      data.push(other);
      colors.push("#94a3b8");
    }
    return {
      labels,
      datasets: [{ data, backgroundColor: colors, borderWidth: 0 }],
    };
  }, [reportsInHotspotZones]);

  const donutOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "bottom",
        labels: { color: "rgba(228,224,236,0.88)", boxWidth: 10, padding: 10, font: { size: 11 } },
      },
    },
    cutout: "58%",
  };

  const alerts = useMemo(() => {
    const live =
      citizenReports?.slice(0, 4).map((r) => {
        const ts = r?.timestamp ? Date.parse(String(r.timestamp)) : NaN;
        const time = Number.isFinite(ts) ? new Date(ts).toLocaleString() : "—";
        return {
          id: `r-${r.id}`,
          level: r.type === "Overflow" ? "high" : "med",
          text: `${r.type} report — open`,
          time,
        };
      }) || [];
    return live.slice(0, 6);
  }, [citizenReports]);

  const inputBar = {
    padding: "10px 14px",
    borderRadius: 10,
    border: `1px solid rgba(255,255,255,0.12)`,
    background: "rgba(0,0,0,0.35)",
    color: t.text,
    fontSize: 13,
  };

  return (
    <div style={{ paddingBottom: 24 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: t.textMuted }}>Range</span>
          <input type="text" readOnly value={rangeLabel} style={{ ...inputBar, minWidth: 220 }} />
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            style={{
              padding: "10px 16px",
              borderRadius: 10,
              border: `1px solid ${t.cardBorder}`,
              background: "rgba(255,255,255,0.06)",
              color: t.text,
              fontWeight: 600,
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            Filter
          </button>
          <select style={{ ...inputBar, cursor: "pointer", minWidth: 160 }}>
            <option>All Waste Types</option>
            <option>Organic</option>
            <option>Plastic</option>
            <option>Mixed</option>
          </select>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 140px), 1fr))",
          gap: 14,
          marginBottom: 20,
        }}
      >
        {kpiCards.map((k) => (
          <div key={k.label} style={{ ...card, padding: 16, borderTop: `3px solid ${k.tone}` }}>
            <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 8 }}>{k.label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: k.tone }}>{k.value}</div>
            <div style={{ fontSize: 11, color: t.textMuted, marginTop: 6 }}>{k.trend}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 380px), 1fr))", gap: 18, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          <div style={{ ...card, padding: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4, color: t.textMuted }}>New reporting</div>
            <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 10, lineHeight: 1.45 }}>
              Admins record incidents from incoming reports; pick a map point, then submit.
              {!reportsReady ? (
                <span style={{ display: "block", marginTop: 8, color: "#fbbf24" }}>
                  API offline — start <code style={{ fontSize: 10 }}>npm run dev:api</code> or{" "}
                  <code style={{ fontSize: 10 }}>python ml_server.py</code> so reports sync (Vite proxies{" "}
                  <code style={{ fontSize: 10 }}>/api/reports</code> → port 5000).
                </span>
              ) : null}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
              {reportingLocation && (
                <span style={{ fontSize: 12, color: "#93c5fd" }}>
                  📍 {reportingLocation.lat.toFixed(3)}, {reportingLocation.lng.toFixed(3)}
                </span>
              )}
              <button
                type="button"
                disabled={!reportingLocation}
                onClick={onReportOverflow}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "none",
                  background: reportingLocation ? "#dc2626" : "#444",
                  color: "#fff",
                  fontWeight: 700,
                  cursor: reportingLocation ? "pointer" : "not-allowed",
                  fontSize: 12,
                }}
              >
                Overflow
              </button>
              <button
                type="button"
                disabled={!reportingLocation}
                onClick={onReportDirty}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "none",
                  background: reportingLocation ? "#ea580c" : "#444",
                  color: "#fff",
                  fontWeight: 700,
                  cursor: reportingLocation ? "pointer" : "not-allowed",
                  fontSize: 12,
                }}
              >
                Dirty Area
              </button>
              <span style={{ fontSize: 11, color: t.textMuted }}>{reportsSyncing ? "Syncing…" : reportsReady ? "Live" : "…"}</span>
            </div>
          </div>

          <ExpandableMapFrame
            title="Regional hotspot map — Meghalaya"
            subtitle="Circles: named tourist sites (admin reports + site photos); purple line, truck, and numbered badges = optimized site route (same state as dashboard overview)."
            collapsedHeight="clamp(520px, 62vh, 880px)"
            cardStyle={{ ...card, display: "flex", flexDirection: "column", padding: 0, overflow: "hidden" }}
            controls={
              <>
                {onOptimizeRoute ? (
                  <button
                    type="button"
                    disabled={isRouting}
                    onClick={onOptimizeRoute}
                    title={routeMessage || "Build road-snapped path through top-pressure tourist sites from the selected depot"}
                    style={{
                      ...heatToggle(true),
                      border: `1px solid rgba(${t.accentRgb}, 0.55)`,
                      opacity: isRouting ? 0.55 : 1,
                      cursor: isRouting ? "wait" : "pointer",
                    }}
                  >
                    {isRouting ? "Routing…" : "Optimize route"}
                  </button>
                ) : null}
                {onClearRoute ? (
                  <button
                    type="button"
                    disabled={!routeData?.coordinates?.length}
                    onClick={onClearRoute}
                    style={{
                      ...heatToggle(false),
                      opacity: routeData?.coordinates?.length ? 1 : 0.45,
                      cursor: routeData?.coordinates?.length ? "pointer" : "not-allowed",
                    }}
                  >
                    Clear route
                  </button>
                ) : null}
                {routeMessage ? (
                  <span
                    style={{
                      flex: "1 1 200px",
                      minWidth: 0,
                      fontSize: 11,
                      color: t.textMuted,
                      lineHeight: 1.35,
                    }}
                    title={routeMessage}
                  >
                    {routeMessage}
                  </span>
                ) : null}
              </>
            }
          >
            <WasteMap
              bins={bins}
              routeData={routeData}
              depots={depots}
              selectedDepot={selectedDepot}
              citizenReports={citizenReports}
              hotspotSitePhotos={hotspotSitePhotos}
              hotspotZones={hotspotZones}
              onLocationClick={onLocationClick}
              showObservationHeat={false}
              showBins={false}
              showBinDensityHeat={false}
            />
          </ExpandableMapFrame>
        </div>

        <aside style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          <div style={{ ...card, padding: 18 }}>
            <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 800 }}>Admin reporting by location</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {topHotspots.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: t.textMuted, lineHeight: 1.55 }}>
                  No GPS-tagged reports yet. Locations appear here as staff log overflow or cleanliness from the map.
                </p>
              ) : (
                topHotspots.map((h, idx) => (
                  <div key={`${h.name}-${idx}`} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: t.textMuted, width: 22 }}>{idx + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{h.name}</div>
                      <div style={{ fontSize: 11, color: t.textMuted }}>
                        {h.count} report{h.count === 1 ? "" : "s"}
                      </div>
                    </div>
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: "50%",
                        border: `3px solid rgba(${t.accentRgb}, 0.55)`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 800,
                        fontSize: 12,
                        color: "#fff",
                      }}
                    >
                      {h.count}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div style={{ ...card, padding: 18 }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 800 }}>Incidents — hotspot zones</h3>
            <div style={{ height: 220, position: "relative" }}>
              <Doughnut data={incidentMixDonutData} options={donutOpts} />
            </div>
          </div>

          <div style={{ ...card, padding: 18 }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 800 }}>Recyclability (AI) — hotspot zones</h3>
            <div style={{ height: 220, position: "relative" }}>
              <Doughnut data={visionDonutData} options={donutOpts} />
            </div>
          </div>

          <div style={{ ...card, padding: 18 }}>
            <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 800 }}>Live Waste Alerts</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {alerts.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: t.textMuted, lineHeight: 1.55 }}>
                  No open reports. Alerts appear when staff log overflow or cleanliness from the map.
                </p>
              ) : (
                alerts.map((a) => (
                  <div key={a.id} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        marginTop: 5,
                        flexShrink: 0,
                        background: a.level === "high" ? "#ef4444" : a.level === "med" ? "#f97316" : "#3b82f6",
                        boxShadow: `0 0 10px ${a.level === "high" ? "#ef4444" : "#f97316"}`,
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, lineHeight: 1.4 }}>{a.text}</div>
                      <div style={{ fontSize: 11, color: t.textMuted, marginTop: 4 }}>{a.time}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {citizenReports.length > 0 && (
            <div style={{ ...card, padding: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>Active reports</div>
              <div style={{ display: "grid", gap: 8, maxHeight: 200, overflowY: "auto" }}>
                {citizenReports.slice(0, 5).map((report) => (
                  <div
                    key={report.id}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 10,
                      background: "rgba(255,255,255,0.04)",
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 8,
                      alignItems: "center",
                      fontSize: 12,
                    }}
                  >
                    <span>
                      {report.type} · {report.status}
                    </span>
                    <span style={{ display: "flex", gap: 6 }}>
                      {report.status === "open" && (
                        <button type="button" style={{ border: "none", background: "rgba(92,184,92,0.25)", color: "#86efac", borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 11 }} onClick={() => onResolveReport(report.id)}>
                          Resolve
                        </button>
                      )}
                      <button type="button" style={{ border: "none", background: "rgba(239,68,68,0.2)", color: "#fca5a5", borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 11 }} onClick={() => onRemoveReport(report.id)}>
                        ✕
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
