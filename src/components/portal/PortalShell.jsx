import { NavLink, useLocation } from "react-router-dom";
import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { getClassificationStats, formatInt } from "../../utils/classificationMetrics.js";
import { useDashboardNotificationsOptional } from "../../context/DashboardNotificationContext.jsx";
import BrandLogo from "../BrandLogo.jsx";
import { portal as t } from "./portalTheme.js";
import { useDatasetLibraryOptional } from "../../context/DatasetLibraryContext.jsx";
import NotificationPanel from "../NotificationPanel.jsx";

const DASH = "/dashboard";

const sidebarNav = [
  { to: DASH, end: true, label: "Dashboard", icon: "◉" },
  { to: `${DASH}/field`, label: "Hotspot Mapping", icon: "⌖" },
  { to: `${DASH}/classify`, label: "Image Classification", icon: "▣" },
  { to: `${DASH}/ml-data`, label: "ML Data Hub", icon: "◇" },
  { to: `${DASH}/analytics`, label: "Analytics", icon: "◈" },
  { to: `${DASH}/bins`, label: "Smart Bins", icon: "▦" },
  { to: `${DASH}/reports`, label: "Waste Reports", icon: "▤" },
  { to: `${DASH}/datasets`, label: "Dataset Management", icon: "◫" },
  { to: `${DASH}/alerts`, label: "Alerts & Notifications", icon: "◐" },
  { to: `${DASH}/users`, label: "User Management", icon: "◎" },
  { to: `${DASH}/settings`, label: "Settings", icon: "⚙" },
];

const quickLinks = [
  { to: `${DASH}/settings?tab=general`, label: "Profile", icon: "◇" },
  { to: `${DASH}/settings?tab=security`, label: "Security", icon: "🔐" },
  { to: `${DASH}/settings?tab=system`, label: "System Logs", icon: "📋" },
  { to: `${DASH}/settings?tab=notifications`, label: "Activity Logs", icon: "📜" },
  { to: `${DASH}/settings?tab=backup`, label: "Backup & Restore", icon: "💾" },
];

const metaDefaults = {
  notifyCount: 0,
  headerName: "Admin User",
  headerRole: "Operator",
};

function routeMeta(pathname) {
  const p = pathname.replace(/\/$/, "") || "/";
  if (p === "/dashboard")
    return {
      ...metaDefaults,
      title: "Dashboard",
      subtitle: "Monitoring: bin telemetry, POI-centered collection routes, citizen reports, and optional GPS-linked AI observations.",
      notifyCount: 0,
    };
  if (p.startsWith("/dashboard/classify"))
    return {
      ...metaDefaults,
      title: "Image Classification",
      subtitle: "Classify field imagery; log Waste observations with coordinates for hotspot analytics.",
    };
  if (p.includes("/dashboard/ml-data"))
    return {
      ...metaDefaults,
      title: "ML Data Hub",
      subtitle: "Training datasets, ViT inference gallery, and image-processing pipeline in one place.",
      headerRole: "Super Admin",
    };
  if (p.includes("/bins"))
    return { ...metaDefaults, title: "Smart Bins", subtitle: "Simulated IoT telemetry, Leaflet map, and Python waste-flow analysis." };
  if (p.includes("/field"))
    return {
      ...metaDefaults,
      title: "Hotspot Mapping",
      subtitle: "Tourist-area bin-pressure overlays, incident pins, and AI observation heat when data exists.",
    };
  if (p.includes("/analytics"))
    return { ...metaDefaults, title: "Analytics", subtitle: "Trends, KPIs, and environmental impact." };
  if (p.includes("/dashboard/reports"))
    return {
      ...metaDefaults,
      title: "Waste Reports",
      subtitle: "Collection volumes, composition, and exportable summaries by region.",
      notifyCount: 0,
      headerRole: "Administrator",
    };
  if (p.includes("/dashboard/datasets"))
    return {
      ...metaDefaults,
      title: "Dataset Management",
      subtitle: "Manage waste image datasets for model training and analysis.",
      notifyCount: 0,
      headerRole: "Super Admin",
    };
  if (p.includes("/users"))
    return {
      ...metaDefaults,
      title: "User Management",
      subtitle: "Manage portal accounts, roles, permissions, and activity.",
      notifyCount: 0,
      headerRole: "Super Administrator",
    };
  if (p.includes("/settings"))
    return {
      ...metaDefaults,
      title: "Settings",
      subtitle: "Manage your account, system preferences and portal configuration.",
      notifyCount: 0,
      headerRole: "Super Administrator",
    };
  if (p.includes("/dashboard/alerts"))
    return {
      ...metaDefaults,
      title: "Alerts & Notifications",
      subtitle: "Real-time alerts and system notifications for waste monitoring.",
      notifyCount: 0,
      headerRole: "Administrator",
    };
  return { ...metaDefaults, title: "Portal", subtitle: "Meghalaya Smart Waste Intelligence." };
}

export default function PortalShell({ children }) {
  const { pathname } = useLocation();
  const isUsers = pathname.includes("/dashboard/users");
  const isField = pathname.includes("/dashboard/field");
  const isAlerts = pathname.includes("/dashboard/alerts");
  const isReports = pathname.includes("/dashboard/reports");
  const isDatasets = pathname.includes("/dashboard/datasets");
  const isMlHub = pathname.includes("/dashboard/ml-data");
  const meta = useMemo(() => routeMeta(pathname), [pathname]);
  const nn = useDashboardNotificationsOptional();
  const datasetLib = useDatasetLibraryOptional();
  const notifWrapRef = useRef(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!nn?.panelOpen) return;
    const onDocMouseDown = (e) => {
      if (notifWrapRef.current && !notifWrapRef.current.contains(e.target)) {
        nn.closePanel();
      }
    };
    const onKey = (e) => {
      if (e.key === "Escape") nn.closePanel();
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [nn?.panelOpen, nn]);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  const [clsStats, setClsStats] = useState(() => getClassificationStats());
  const refreshCls = useCallback(() => setClsStats(getClassificationStats()), []);

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

  const dateStr = now.toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const timeStr = now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  const navItemStyle = (isActive, disabled) => ({
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "11px 14px",
    borderRadius: 12,
    fontSize: 13,
    fontWeight: 600,
    textDecoration: "none",
    color: disabled ? "rgba(255,255,255,0.35)" : isActive ? "#fff" : "rgba(235,230,245,0.82)",
    background: isActive ? `rgba(${t.accentRgb}, 0.28)` : "transparent",
    border: `1px solid ${isActive ? `rgba(${t.accentRgb}, 0.45)` : "transparent"}`,
    cursor: disabled ? "not-allowed" : "pointer",
    pointerEvents: disabled ? "none" : "auto",
    transition: "background 0.15s, border-color 0.15s",
  });

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        fontFamily: '"Inter", system-ui, sans-serif',
        background: `linear-gradient(145deg, ${t.bg} 0%, #030806 50%, #071814 100%)`,
        color: t.text,
      }}
    >
      <aside
        style={{
          width: 280,
          flexShrink: 0,
          background: t.sidebar,
          borderRight: `1px solid ${t.sidebarBorder}`,
          display: "flex",
          flexDirection: "column",
          padding: "20px 16px",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "4px 8px 16px", borderBottom: `1px solid ${t.sidebarBorder}` }}>
          <BrandLogo size={40} alt="" aria-hidden style={{ marginTop: 2 }} />
          <div>
            <div style={{ fontWeight: 800, fontSize: 14, letterSpacing: "-0.02em", lineHeight: 1.25 }}>
              Meghalaya Smart Waste Portal
            </div>
            <div style={{ fontSize: 11, color: t.textMuted, marginTop: 4 }}>AI-Powered Waste Intelligence</div>
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
          <nav style={{ display: "flex", flexDirection: "column", gap: 4, paddingTop: 8 }}>
            {sidebarNav.map((item) =>
              item.placeholder ? (
                <span key={item.label} style={navItemStyle(false, true)} title="Coming soon">
                  <span style={{ opacity: 0.9, width: 20, textAlign: "center" }}>{item.icon}</span>
                  {item.label}
                </span>
              ) : (
                <NavLink key={item.to} to={item.to} end={item.end} style={({ isActive }) => navItemStyle(isActive, false)}>
                  <span style={{ width: 20, textAlign: "center", fontSize: 14 }}>{item.icon}</span>
                  {item.label}
                </NavLink>
              )
            )}
          </nav>

          {isUsers ? (
            <div style={{ paddingTop: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: t.textMuted, marginBottom: 8, paddingLeft: 4 }}>
                QUICK ACTIONS
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[
                  ["➕", "Add New User"],
                  ["📥", "Import Users"],
                  ["📤", "Export Users"],
                  ["📜", "User Activity Log"],
                ].map(([icon, label]) => (
                  <button
                    key={label}
                    type="button"
                    style={{
                      ...navItemStyle(false, false),
                      width: "100%",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      textAlign: "left",
                    }}
                  >
                    <span style={{ width: 20, textAlign: "center", fontSize: 14 }}>{icon}</span>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ) : isAlerts ? (
            <div style={{ paddingTop: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: t.textMuted, marginBottom: 8, paddingLeft: 4 }}>
                QUICK ACTIONS
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[
                  ["✚", "Create New Alert"],
                  ["📣", "Send Notification"],
                  ["📈", "Alert Analytics"],
                ].map(([icon, label]) => (
                  <button
                    key={label}
                    type="button"
                    style={{
                      ...navItemStyle(false, false),
                      width: "100%",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      textAlign: "left",
                    }}
                  >
                    <span style={{ width: 20, textAlign: "center", fontSize: 14 }}>{icon}</span>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ) : isReports ? (
            <>
              <div style={{ paddingTop: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: t.textMuted, marginBottom: 8, paddingLeft: 4 }}>
                  QUICK REPORTS
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {[
                    ["📅", "Daily"],
                    ["📆", "Weekly"],
                    ["🗓️", "Monthly"],
                    ["⌛", "Custom Range"],
                  ].map(([icon, label]) => (
                    <button
                      key={label}
                      type="button"
                      style={{
                        ...navItemStyle(false, false),
                        width: "100%",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        textAlign: "left",
                      }}
                    >
                      <span style={{ width: 20, textAlign: "center", fontSize: 14 }}>{icon}</span>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ paddingTop: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: t.textMuted, marginBottom: 8, paddingLeft: 4 }}>
                  DOWNLOAD CENTER
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {[
                    ["📑", "All Reports"],
                    ["📥", "Export Data (CSV)"],
                    ["📕", "Export Data (PDF)"],
                  ].map(([icon, label]) => (
                    <button
                      key={label}
                      type="button"
                      style={{
                        ...navItemStyle(false, false),
                        width: "100%",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        textAlign: "left",
                      }}
                    >
                      <span style={{ width: 20, textAlign: "center", fontSize: 14 }}>{icon}</span>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : isDatasets || isMlHub ? null : (
            <div style={{ paddingTop: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: t.textMuted, marginBottom: 8, paddingLeft: 4 }}>
                QUICK LINKS
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {quickLinks.map((item) => (
                  <NavLink key={item.to} to={item.to} style={({ isActive }) => navItemStyle(isActive, false)}>
                    <span style={{ width: 20, textAlign: "center", fontSize: 13 }}>{item.icon}</span>
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          )}
        </div>

        {!isUsers && !isField && !isAlerts && !isReports && !isDatasets && !isMlHub ? (
          <>
            <div
              style={{
                padding: 14,
                borderRadius: 14,
                background: t.card,
                border: `1px solid ${t.cardBorder}`,
                marginTop: 8,
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, marginBottom: 8 }}>AI Model Status</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Vision Transformer (ViT)</span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "4px 8px",
                    borderRadius: 999,
                    background: "rgba(92, 184, 92, 0.2)",
                    color: t.green,
                  }}
                >
                  Active
                </span>
              </div>
            </div>

            <div
              style={{
                padding: 14,
                borderRadius: 14,
                background: t.card,
                border: `1px solid ${t.cardBorder}`,
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, marginBottom: 10 }}>Quick Stats</div>
              <div style={{ display: "grid", gap: 8, fontSize: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: t.textMuted }}>Images Analyzed</span>
                  <strong>{formatInt(clsStats.total)}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: t.textMuted }}>Recyclable</span>
                  <strong style={{ color: t.green }}>{formatInt(clsStats.recyclable)}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: t.textMuted }}>Non-Recyclable</span>
                  <strong style={{ color: t.red }}>{formatInt(clsStats.nonRecyclable)}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: t.textMuted }}>Accuracy (avg.)</span>
                  <strong>{clsStats.avgConfidence != null ? `${clsStats.avgConfidence.toFixed(2)}%` : "—"}</strong>
                </div>
              </div>
            </div>
          </>
        ) : isUsers || isAlerts || isReports ? (
          <div
            style={{
              padding: 14,
              borderRadius: 14,
              background: t.card,
              border: `1px solid ${t.cardBorder}`,
              marginTop: 8,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 22 }} aria-hidden>
                🛡️
              </span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700 }}>System Status: All systems operational</div>
                <div style={{ fontSize: 10, color: t.textMuted, marginTop: 4 }}>
                  Last updated: {now.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                </div>
              </div>
            </div>
          </div>
        ) : isField ? (
          <div
            style={{
              padding: 14,
              borderRadius: 14,
              background: t.card,
              border: `1px solid ${t.cardBorder}`,
              marginTop: 8,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, marginBottom: 10 }}>Legend</div>
            {[
              ["#ef4444", "High waste density"],
              ["#f97316", "Medium waste density"],
              ["#5cb85c", "Low waste density"],
              ["#3b82f6", "Very low waste density"],
              ["#2dd4bf", "Tourist location"],
            ].map(([color, label]) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, fontSize: 12 }}>
                <span style={{ width: 12, height: 12, borderRadius: "50%", background: color, flexShrink: 0, boxShadow: `0 0 8px ${color}` }} />
                <span>{label}</span>
              </div>
            ))}
          </div>
        ) : null}

        <NavLink
          to={`${DASH}/settings`}
          aria-label="Open settings"
          style={({ isActive }) => ({
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "14px 10px 4px",
            marginTop: 8,
            borderTop: `1px solid ${t.sidebarBorder}`,
            textDecoration: "none",
            color: "inherit",
            borderRadius: 12,
            outline: "none",
            background: isActive ? `rgba(${t.accentRgb}, 0.1)` : "transparent",
          })}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: `linear-gradient(135deg, ${t.accent}, ${t.accentSecondary})`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              fontWeight: 800,
              color: "#042f14",
            }}
          >
            A
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{meta.headerName}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
              <span style={{ fontSize: 11, color: t.textMuted }}>{meta.headerRole}</span>
              {(isDatasets || isMlHub) && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: 999,
                    background: "rgba(92, 184, 92, 0.2)",
                    color: t.green,
                  }}
                >
                  Super Admin
                </span>
              )}
            </div>
          </div>
        </NavLink>
      </aside>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <header
          style={{
            padding: "18px 28px",
            borderBottom: `1px solid ${t.sidebarBorder}`,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 20,
            flexWrap: "wrap",
            rowGap: 16,
            background: "rgba(5, 14, 10, 0.72)",
            backdropFilter: "blur(12px)",
          }}
        >
          <div style={{ minWidth: 0, flex: "1 1 280px" }}>
            <NavLink
              to="/"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 10,
                fontSize: 13,
                fontWeight: 700,
                color: t.accent,
                textDecoration: "none",
                borderRadius: 10,
                padding: "6px 12px 6px 8px",
                border: `1px solid rgba(${t.accentRgb}, 0.35)`,
                background: `rgba(${t.accentRgb}, 0.08)`,
                width: "fit-content",
              }}
            >
              <span aria-hidden>←</span>
              Back to home
            </NavLink>
            <h1 style={{ margin: 0, fontSize: "clamp(1.35rem, 2.5vw, 1.75rem)", fontWeight: 800, letterSpacing: "-0.03em" }}>{meta.title}</h1>
            <p style={{ margin: "8px 0 0", fontSize: 14, color: t.textMuted, maxWidth: 560 }}>{meta.subtitle}</p>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              flexShrink: 0,
              flexWrap: "wrap",
              justifyContent: "flex-end",
              alignSelf: "center",
            }}
          >
            {isDatasets && datasetLib && (
              <>
                <input
                  type="search"
                  placeholder="Search datasets..."
                  aria-label="Search datasets"
                  value={datasetLib.searchQuery}
                  onChange={(e) => datasetLib.setSearchQuery(e.target.value)}
                  style={{
                    width: 220,
                    maxWidth: "min(42vw, 320px)",
                    minWidth: 160,
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: `1px solid ${t.cardBorder}`,
                    background: t.card,
                    color: t.text,
                    fontSize: 13,
                    fontFamily: "inherit",
                  }}
                />
                <button
                  type="button"
                  onClick={() => datasetLib.setImportModalOpen(true)}
                  style={{
                    padding: "10px 18px",
                    borderRadius: 12,
                    border: "none",
                    background: `linear-gradient(135deg, ${t.accent}, ${t.accentSecondary})`,
                    color: "#042f14",
                    fontWeight: 800,
                    fontSize: 13,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    whiteSpace: "nowrap",
                  }}
                >
                  + Add New Dataset
                </button>
              </>
            )}
            <div
              style={{
                padding: "10px 16px",
                borderRadius: 12,
                border: `1px solid ${t.cardBorder}`,
                background: t.card,
                textAlign: "right",
                fontSize: 13,
                color: t.textMuted,
              }}
            >
              <div>{dateStr}</div>
              <div style={{ fontWeight: 700, color: t.text, marginTop: 2 }}>{timeStr}</div>
            </div>
            <div ref={notifWrapRef} style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => nn?.togglePanel()}
                style={{
                  position: "relative",
                  width: 42,
                  height: 42,
                  borderRadius: 12,
                  border: `1px solid ${nn?.panelOpen ? `rgba(${t.accentRgb}, 0.55)` : t.cardBorder}`,
                  background: nn?.panelOpen ? `rgba(${t.accentRgb}, 0.12)` : t.card,
                  cursor: nn ? "pointer" : "default",
                  fontSize: 18,
                }}
                aria-label="Notifications"
                aria-expanded={Boolean(nn?.panelOpen)}
                aria-haspopup="dialog"
              >
                🔔
                {(nn ? nn.notifications.length : meta.notifyCount) > 0 && (
                  <span
                    style={{
                      position: "absolute",
                      top: 4,
                      right: 4,
                      minWidth: 18,
                      height: 18,
                      padding: "0 5px",
                      borderRadius: 999,
                      background: t.accent,
                      color: "#042f14",
                      fontSize: 10,
                      fontWeight: 800,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {(nn ? nn.notifications.length : meta.notifyCount) > 99
                      ? "99+"
                      : nn
                        ? nn.notifications.length
                        : meta.notifyCount}
                  </span>
                )}
              </button>
              {nn?.panelOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 10px)",
                    right: 0,
                    zIndex: 200,
                  }}
                >
                  <NotificationPanel notifications={nn.notifications} onRemove={nn.onRemove} />
                </div>
              )}
            </div>
            <NavLink
              to={`${DASH}/settings`}
              aria-label="Open settings"
              style={({ isActive }) => ({
                display: "flex",
                alignItems: "center",
                gap: 12,
                textDecoration: "none",
                color: "inherit",
                padding: "6px 10px",
                marginRight: -4,
                borderRadius: 12,
                outline: "none",
                border: isActive ? `1px solid rgba(${t.accentRgb}, 0.45)` : "1px solid transparent",
                background: isActive ? `rgba(${t.accentRgb}, 0.1)` : "transparent",
                transition: "border-color 0.15s, background 0.15s",
              })}
            >
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{meta.headerName}</div>
                <div style={{ fontSize: 11, color: t.textMuted }}>{meta.headerRole}</div>
              </div>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: "50%",
                  background: `linear-gradient(135deg, ${t.accent}, ${t.accentSecondary})`,
                  border: `2px solid rgba(${t.accentRgb}, 0.45)`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 800,
                  fontSize: 14,
                  flexShrink: 0,
                  color: "#042f14",
                }}
              >
                AU
              </div>
            </NavLink>
          </div>
        </header>

        <main style={{ flex: 1, padding: "22px 28px 0", overflow: "auto" }}>
          <div style={{ maxWidth: 1480, margin: "0 auto", width: "100%" }}>{children}</div>
        </main>

        <footer
          style={{
            padding: "12px 28px",
            borderTop: `1px solid ${t.sidebarBorder}`,
            fontSize: 11,
            color: t.textMuted,
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "center",
            background: "rgba(8, 4, 14, 0.85)",
          }}
        >
          <span>
            AI Model: <strong style={{ color: t.text }}>Vision Transformer (ViT)</strong>
          </span>
          <span>
            Dataset: <strong style={{ color: t.text }}>Meghalaya Waste Dataset v1.2</strong>
          </span>
          <span>© {new Date().getFullYear()} Meghalaya Smart Waste Portal. All rights reserved.</span>
        </footer>
      </div>
    </div>
  );
}
