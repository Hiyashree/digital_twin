import { useMemo, useState } from "react";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";
import { Doughnut } from "react-chartjs-2";
import { portal as t } from "./portal/portalTheme.js";
import { useSiteActivityOptional } from "../context/SiteActivityContext.jsx";

ChartJS.register(ArcElement, Tooltip, Legend);

const SEVERITY_STYLES = {
  critical: { label: "Critical", bg: "rgba(239,68,68,0.18)", color: "#ef4444", border: "rgba(239,68,68,0.45)" },
  high: { label: "High", bg: "rgba(249,115,22,0.18)", color: "#f97316", border: "rgba(249,115,22,0.45)" },
  medium: { label: "Medium", bg: "rgba(245,158,11,0.18)", color: "#f59e0b", border: "rgba(245,158,11,0.45)" },
  low: { label: "Low", bg: "rgba(16,185,129,0.18)", color: "#10b981", border: "rgba(16,185,129,0.45)" },
};

const STATUS_STYLES = {
  new: { label: "New", bg: "rgba(239,68,68,0.2)", color: "#fca5a5" },
  "in progress": { label: "In Progress", bg: "rgba(249,115,22,0.2)", color: "#fdba74" },
  acknowledged: { label: "Acknowledged", bg: "rgba(245,158,11,0.2)", color: "#fcd34d" },
  resolved: { label: "Resolved", bg: "rgba(92,184,92,0.2)", color: "#86efac" },
};

const PAGE_SIZE = 7;

function mapActivityToRow(item) {
  const when = typeof item.at === "number" ? new Date(item.at).toLocaleString() : "";
  const warn = item.severity === "critical" || item.severity === "high";
  return {
    id: item.id,
    kind: item.kind === "notice" ? "notice" : "alert",
    severity: item.severity || "low",
    title: item.title || "Activity",
    desc: item.desc || item.title || "",
    location: item.location || "Portal",
    when,
    status: item.status || "new",
    warn,
  };
}

function ToggleRow({ label, on, onToggle }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 0", borderBottom: `1px solid ${t.cardBorder}` }}>
      <span style={{ fontSize: 13, color: t.text }}>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onToggle(!on)}
        style={{
          width: 44,
          height: 24,
          borderRadius: 999,
          border: "none",
          background: on ? "linear-gradient(135deg, #5cb85c, #449d44)" : "rgba(255,255,255,0.15)",
          cursor: "pointer",
          position: "relative",
          flexShrink: 0,
          transition: "background 0.2s",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 3,
            left: on ? 22 : 3,
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: "#fff",
            boxShadow: "0 1px 4px rgba(0,0,0,0.35)",
            transition: "left 0.2s",
          }}
        />
      </button>
    </div>
  );
}

export default function AlertsNotifications() {
  const site = useSiteActivityOptional();
  const rawItems = site?.items ?? [];

  const [tab, setTab] = useState("all");
  const [sortBy, setSortBy] = useState("latest");
  const [page, setPage] = useState(1);
  const [emailOn, setEmailOn] = useState(true);
  const [smsOn, setSmsOn] = useState(false);
  const [pushOn, setPushOn] = useState(true);
  const [criticalOnly, setCriticalOnly] = useState(false);

  const ALL_ITEMS = useMemo(() => rawItems.map(mapActivityToRow), [rawItems]);
  const NOTIFICATION_ITEMS = useMemo(() => ALL_ITEMS.filter((x) => x.kind === "notice"), [ALL_ITEMS]);

  const alertCounts = useMemo(() => {
    const list = ALL_ITEMS;
    return {
      all: list.length,
      critical: list.filter((x) => x.severity === "critical").length,
      high: list.filter((x) => x.severity === "high").length,
      medium: list.filter((x) => x.severity === "medium").length,
      low: list.filter((x) => x.severity === "low").length,
      resolved: list.filter((x) => x.status === "resolved").length,
      notifications: NOTIFICATION_ITEMS.length,
    };
  }, [ALL_ITEMS, NOTIFICATION_ITEMS]);

  const filtered = useMemo(() => {
    if (tab === "notifications") {
      const base = NOTIFICATION_ITEMS.map((n) => ({
        id: n.id,
        kind: "notice",
        severity: n.severity || "low",
        title: n.title,
        desc: n.desc,
        location: n.location,
        when: n.when,
        status: n.status,
        warn: n.warn,
      }));
      /* Feed is stored newest-first; "Oldest" reverses for chronological reading. */
      return sortBy === "oldest" ? [...base].reverse() : base;
    }
    let list = ALL_ITEMS;
    if (tab === "critical") list = ALL_ITEMS.filter((x) => x.severity === "critical");
    else if (tab === "high") list = ALL_ITEMS.filter((x) => x.severity === "high");
    else if (tab === "medium") list = ALL_ITEMS.filter((x) => x.severity === "medium");
    else if (tab === "low") list = ALL_ITEMS.filter((x) => x.severity === "low");
    return sortBy === "oldest" ? [...list].reverse() : list;
  }, [tab, sortBy, ALL_ITEMS, NOTIFICATION_ITEMS]);

  const totalFiltered = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageSlice = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const donutData = useMemo(() => {
    const { critical, high, medium, low, resolved } = alertCounts;
    const sum = critical + high + medium + low + resolved;
    if (sum === 0) {
      return {
        labels: ["No ticket data"],
        datasets: [{ data: [1], backgroundColor: ["rgba(100,116,139,0.45)"], borderWidth: 0 }],
      };
    }
    return {
      labels: ["Critical", "High", "Medium", "Low", "Resolved"],
      datasets: [
        {
          data: [critical, high, medium, low, resolved],
          backgroundColor: ["#ef4444", "#f97316", "#f59e0b", "#10b981", "#64748b"],
          borderWidth: 0,
        },
      ],
    };
  }, [alertCounts]);

  const donutOpts = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      cutout: "58%",
      plugins: {
        legend: {
          position: "bottom",
          labels: { color: "rgba(228,224,236,0.88)", boxWidth: 10, padding: 10, font: { size: 11 } },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.label}: ${ctx.raw}`,
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
  };

  const tabs = [
    ["all", `All Alerts (${alertCounts.all})`],
    ["critical", `Critical (${alertCounts.critical})`],
    ["high", `High (${alertCounts.high})`],
    ["medium", `Medium (${alertCounts.medium})`],
    ["low", `Low (${alertCounts.low})`],
    ["notifications", `Notifications (${alertCounts.notifications})`],
  ];

  return (
    <div
      className="alerts-grid-main"
      style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(280px, 340px)", gap: 20, alignItems: "start", paddingBottom: 28 }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {tabs.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setTab(key);
                setPage(1);
              }}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: `1px solid ${tab === key ? `rgba(${t.accentRgb}, 0.55)` : t.cardBorder}`,
                background: tab === key ? `rgba(${t.accentRgb}, 0.22)` : "rgba(0,0,0,0.25)",
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

        <div style={{ ...card, padding: "14px 16px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <button
                type="button"
                style={{
                  padding: "8px 14px",
                  borderRadius: 10,
                  border: `1px solid ${t.cardBorder}`,
                  background: "rgba(255,255,255,0.06)",
                  color: t.text,
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Filter
              </button>
              {site && rawItems.length > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    site.clearFeed();
                    setPage(1);
                  }}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 10,
                    border: `1px solid rgba(239,68,68,0.35)`,
                    background: "rgba(239,68,68,0.12)",
                    color: "#fecaca",
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  Clear activity log
                </button>
              ) : null}
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: t.textMuted }}>
              Sort by:
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
              </select>
            </label>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {totalFiltered === 0 ? (
              <div style={{ padding: "28px 16px", textAlign: "center", color: t.textMuted, fontSize: 13, lineHeight: 1.55 }}>
                {rawItems.length === 0
                  ? "No activity yet. As you navigate the portal, run classifications, update datasets, or trigger bin operations, entries appear here in real time."
                  : "Nothing in this tab matches the current filter."}
              </div>
            ) : null}
            {pageSlice.map((item) => {
              const sev = SEVERITY_STYLES[item.severity] || SEVERITY_STYLES.low;
              const st = STATUS_STYLES[item.status] || STATUS_STYLES.new;
              return (
                <div
                  key={item.id}
                  style={{
                    display: "flex",
                    alignItems: "stretch",
                    gap: 14,
                    padding: "14px 12px",
                    borderTop: `1px solid ${t.cardBorder}`,
                  }}
                >
                  <div style={{ fontSize: 22, lineHeight: 1, paddingTop: 2 }} aria-hidden>
                    {item.warn ? "⚠️" : "ℹ️"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 6 }}>{item.title}</div>
                    <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.45, marginBottom: 10 }}>{item.desc}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          letterSpacing: "0.06em",
                          padding: "4px 8px",
                          borderRadius: 8,
                          background: sev.bg,
                          color: sev.color,
                          border: `1px solid ${sev.border}`,
                        }}
                      >
                        {sev.label}
                      </span>
                      <span style={{ fontSize: 12, color: t.textMuted }}>{item.location}</span>
                      <span style={{ fontSize: 12, color: t.textMuted }}>·</span>
                      <span style={{ fontSize: 12, color: t.textMuted }}>{item.when}</span>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: "4px 8px",
                          borderRadius: 8,
                          background: st.bg,
                          color: st.color,
                          marginLeft: 4,
                        }}
                      >
                        {st.label}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label="Open details"
                    style={{
                      alignSelf: "center",
                      border: `1px solid ${t.cardBorder}`,
                      background: "rgba(255,255,255,0.05)",
                      color: t.textMuted,
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      cursor: "pointer",
                      fontSize: 16,
                      flexShrink: 0,
                    }}
                  >
                    ›
                  </button>
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 18, paddingTop: 14, borderTop: `1px solid ${t.cardBorder}` }}>
            <span style={{ fontSize: 12, color: t.textMuted }}>
              {totalFiltered === 0
                ? "0 items"
                : `Showing ${(safePage - 1) * PAGE_SIZE + 1} to ${Math.min(safePage * PAGE_SIZE, totalFiltered)} of ${totalFiltered} ${tab === "notifications" ? "notifications" : "alerts"}`}
            </span>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
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
                    background: p === safePage ? `rgba(${t.accentRgb}, 0.25)` : "transparent",
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

        <div>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 12 }}>Recent Notifications</div>
          {NOTIFICATION_ITEMS.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: t.textMuted, lineHeight: 1.55 }}>
              Browsing and storage-driven updates (classification, gallery, training queue) show up here as notices.
            </p>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
              {NOTIFICATION_ITEMS.slice(0, 6).map((n) => (
                <li
                  key={n.id}
                  style={{
                    fontSize: 13,
                    color: t.text,
                    lineHeight: 1.45,
                    padding: "10px 12px",
                    borderRadius: 12,
                    background: "rgba(0,0,0,0.28)",
                    border: `1px solid ${t.cardBorder}`,
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>{n.title}</div>
                  <div style={{ color: t.textMuted, fontSize: 12 }}>{n.desc}</div>
                  <div style={{ color: t.textMuted, fontSize: 11, marginTop: 6 }}>{n.when}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <aside style={{ display: "flex", flexDirection: "column", gap: 16, position: "sticky", top: 12 }}>
        <div style={{ ...card, padding: 18 }}>
          <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 800 }}>Alert Summary</h3>
          <div style={{ height: 200, position: "relative" }}>
            <Doughnut data={donutData} options={donutOpts} />
          </div>
          <div style={{ marginTop: 12, fontSize: 11, color: t.textMuted, lineHeight: 1.5 }}>
            Live view of this browser session: navigation, ML activity, and dashboard operations. Counts update as events arrive.
          </div>
        </div>

        <div style={{ ...card, padding: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 12 }}>Quick Stats</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[
              ["Critical", alertCounts.critical, "#ef4444"],
              ["High", alertCounts.high, "#f97316"],
              ["Medium", alertCounts.medium, "#f59e0b"],
              ["Resolved", alertCounts.resolved, "#10b981"],
            ].map(([label, val, tone]) => (
              <div key={label} style={{ padding: 12, borderRadius: 12, background: "rgba(0,0,0,0.28)", border: `1px solid ${t.cardBorder}` }}>
                <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 6 }}>{label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: tone }}>{val}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ ...card, padding: "8px 16px 16px" }}>
          <div style={{ fontWeight: 800, fontSize: 13, padding: "8px 0 4px" }}>Notification Settings</div>
          <ToggleRow label="Email" on={emailOn} onToggle={setEmailOn} />
          <ToggleRow label="SMS" on={smsOn} onToggle={setSmsOn} />
          <ToggleRow label="Push Notifications" on={pushOn} onToggle={setPushOn} />
          <ToggleRow label="Critical Alerts Only" on={criticalOnly} onToggle={setCriticalOnly} />
        </div>

        <div style={{ ...card, padding: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 10 }}>Emergency contacts</div>
          <p style={{ margin: 0, fontSize: 12, color: t.textMuted, lineHeight: 1.55 }}>
            Publish verified district control-room numbers in your deployment docs or link an internal directory — they are not hard-coded here so the
            portal never shows unverified phone data.
          </p>
        </div>
      </aside>

      <style>{`
        @media (max-width: 1060px) {
          .alerts-grid-main { grid-template-columns: 1fr !important; }
          .alerts-grid-main aside { position: static !important; }
        }
      `}</style>
    </div>
  );
}
