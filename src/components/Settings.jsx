import { useMemo, useState } from "react";
import { NavLink, useSearchParams } from "react-router-dom";
import { portal as t } from "./portal/portalTheme.js";
/** Resolved at build time by Vite (no import attributes — avoids Babel `assert` / `with` parser issues). */
import pkg from "../../package.json";

const DASH = "/dashboard";

const card = {
  background: t.card,
  border: `1px solid ${t.cardBorder}`,
  borderRadius: 14,
  padding: 22,
};

const labelStyle = { display: "block", fontSize: 12, fontWeight: 600, color: t.textMuted, marginBottom: 8 };
const inputStyle = {
  width: "100%",
  padding: "11px 14px",
  borderRadius: 10,
  border: `1px solid rgba(255,255,255,0.12)`,
  background: "rgba(0,0,0,0.35)",
  color: t.text,
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
};

const tabs = [
  { id: "general", label: "General" },
  { id: "security", label: "Security" },
  { id: "notifications", label: "Notifications" },
  { id: "system", label: "System" },
  { id: "integrations", label: "Integrations" },
  { id: "backup", label: "Backup" },
  { id: "appearance", label: "Appearance" },
];

function Toggle({ checked, onChange, label, noBorder }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        gap: 12,
        padding: "12px 0",
        border: "none",
        borderBottom: noBorder ? "none" : `1px solid ${t.cardBorder}`,
        background: "transparent",
        cursor: "pointer",
        color: t.text,
        textAlign: "left",
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 500 }}>{label}</span>
      <span
        style={{
          width: 46,
          height: 26,
          borderRadius: 999,
          background: checked ? "rgba(92,184,92,0.85)" : "rgba(255,255,255,0.15)",
          position: "relative",
          flexShrink: 0,
          transition: "background 0.2s",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 3,
            left: checked ? 22 : 3,
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: "#fff",
            boxShadow: "0 1px 4px rgba(0,0,0,0.35)",
            transition: "left 0.2s",
          }}
        />
      </span>
    </button>
  );
}

function Btn({ children, variant = "outline" }) {
  const isSolid = variant === "solid";
  return (
    <button
      type="button"
      style={{
        padding: "10px 18px",
        borderRadius: 10,
        border: isSolid ? "none" : `1px solid rgba(92,184,92,0.55)`,
        background: isSolid ? `linear-gradient(135deg, ${t.accent}, #9333ea)` : "transparent",
        color: "#fff",
        fontWeight: 700,
        fontSize: 13,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      ✓ {children}
    </button>
  );
}

export default function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab = tabs.some((x) => x.id === tabParam) ? tabParam : "general";

  const goTab = (id) => setSearchParams({ tab: id });

  const [portalName, setPortalName] = useState("Meghalaya Smart Waste Portal");
  const [tagline, setTagline] = useState("Waste monitoring & digital twin — Meghalaya");
  const [language, setLanguage] = useState("en");
  const [tz, setTz] = useState("Asia/Kolkata");
  const [dateFmt, setDateFmt] = useState("DD/MM/YYYY");
  const [timeFmt, setTimeFmt] = useState("24h");

  const [darkMode, setDarkMode] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [announcements, setAnnouncements] = useState(true);
  const [compact, setCompact] = useState(false);
  const [confirmDel, setConfirmDel] = useState(true);

  const [storagePath, setStoragePath] = useState("");
  const [maxMb, setMaxMb] = useState("25");
  const [retention, setRetention] = useState("90");

  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpSecure, setSmtpSecure] = useState(true);

  const [notifyCitizen, setNotifyCitizen] = useState(true);
  const [notifyClassification, setNotifyClassification] = useState(true);
  const [notifyRoutes, setNotifyRoutes] = useState(false);
  const [denseLayout, setDenseLayout] = useState(false);

  const clientNowLabel = useMemo(() => new Date().toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }), []);

  const linkStyle = {
    color: t.accent,
    fontWeight: 700,
    textDecoration: "none",
    borderBottom: `1px solid rgba(${t.accentRgb}, 0.35)`,
  };

  const secondaryPanels = (
    <>
      {tab === "security" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: 18 }}>
          <div style={card}>
            <h3 style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 800 }}>Access &amp; sessions</h3>
            <p style={{ margin: "0 0 14px", fontSize: 13, color: t.textMuted, lineHeight: 1.55 }}>
              This deployment does not ship with login. When you add SSO or municipal LDAP, password policies and session lifetime belong here.
            </p>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: t.textMuted, lineHeight: 1.65 }}>
              <li>Use HTTPS in production for citizen reports and admin actions.</li>
              <li>Restrict API keys for `/predict` and report ingestion to your infrastructure network.</li>
            </ul>
          </div>
          <div style={card}>
            <h3 style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 800 }}>Field &amp; map data</h3>
            <p style={{ margin: "0 0 14px", fontSize: 13, color: t.textMuted, lineHeight: 1.55 }}>
              GPS-based hotspot submissions should only be accepted over authenticated channels once your backend enforces roles (operator vs citizen).
            </p>
            <NavLink to={`${DASH}/field`} style={linkStyle}>
              Hotspot mapping →
            </NavLink>
          </div>
        </div>
      )}

      {tab === "notifications" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: 18 }}>
          <div style={card}>
            <h3 style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 800 }}>What you can be notified about</h3>
            <p style={{ margin: "0 0 14px", fontSize: 13, color: t.textMuted, lineHeight: 1.55 }}>
              Preferences below are UI-only until email or push is connected (configure SMTP under General first).
            </p>
            <Toggle label="Citizen overflow / cleanliness reports (map)" checked={notifyCitizen} onChange={setNotifyCitizen} />
            <Toggle label="Classification runs &amp; gallery uploads" checked={notifyClassification} onChange={setNotifyClassification} />
            <Toggle label="Route / bin scheduling alerts" checked={notifyRoutes} onChange={setNotifyRoutes} noBorder />
          </div>
          <div style={card}>
            <h3 style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 800 }}>Alert inbox</h3>
            <p style={{ margin: "0 0 14px", fontSize: 13, color: t.textMuted, lineHeight: 1.55 }}>
              Review ticket-style alerts and notification samples in the portal. Production wiring goes to your messaging provider.
            </p>
            <NavLink to={`${DASH}/alerts`} style={linkStyle}>
              Open Alerts &amp; Notifications →
            </NavLink>
          </div>
        </div>
      )}

      {tab === "system" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: 18 }}>
          <div style={card}>
            <h3 style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 800 }}>Classification log</h3>
            <p style={{ margin: "0 0 14px", fontSize: 13, color: t.textMuted, lineHeight: 1.55 }}>
              Runs from Image Classification are stored in this browser under key <code style={{ color: t.accent, fontSize: 12 }}>msw_vit_classification_log_v1</code>.
              Clearing site data removes KPI history on this device.
            </p>
            <NavLink to={`${DASH}/classify`} style={linkStyle}>
              Image Classification →
            </NavLink>
          </div>
          <div style={card}>
            <h3 style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 800 }}>Bins &amp; predictions</h3>
            <p style={{ margin: "0 0 14px", fontSize: 13, color: t.textMuted, lineHeight: 1.55 }}>
              Bin cards use optional POST <code style={{ color: t.accent }}>/predict</code> when your Flask service is running; otherwise the UI falls back to a local fill estimate.
            </p>
            <NavLink to={`${DASH}/bins`} style={linkStyle}>
              Open Bins →
            </NavLink>
          </div>
        </div>
      )}

      {tab === "integrations" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: 18 }}>
          <div style={card}>
            <h3 style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 800 }}>Backend endpoints</h3>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: t.textMuted, lineHeight: 1.55 }}>
              Vite dev proxies these paths to <code style={{ fontSize: 12 }}>127.0.0.1:5000</code>. Set <code style={{ fontSize: 12 }}>VITE_API_URL</code> for packaged builds.
            </p>
            <dl style={{ margin: 0, fontSize: 12, color: t.text, lineHeight: 1.7 }}>
              <dt style={{ color: t.textMuted, marginTop: 8 }}>Fill prediction</dt>
              <dd style={{ margin: "4px 0 0", fontFamily: "ui-monospace, monospace" }}>POST /predict</dd>
              <dt style={{ color: t.textMuted, marginTop: 10 }}>Citizen reports</dt>
              <dd style={{ margin: "4px 0 0", fontFamily: "ui-monospace, monospace" }}>GET/POST /api/reports → /reports</dd>
            </dl>
          </div>
          <div style={card}>
            <h3 style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 800 }}>Data &amp; ML hub</h3>
            <p style={{ margin: "0 0 14px", fontSize: 13, color: t.textMuted, lineHeight: 1.55 }}>
              Dataset catalog and benchmarks are driven by your files and research rows — not fake vendor APIs.
            </p>
            <NavLink to={`${DASH}/datasets`} style={{ ...linkStyle, marginRight: 14 }}>
              Dataset Management →
            </NavLink>
            <NavLink to={`${DASH}/ml-data`} style={linkStyle}>
              ML Data Hub →
            </NavLink>
          </div>
        </div>
      )}

      {tab === "backup" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: 18 }}>
          <div style={card}>
            <h3 style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 800 }}>Browser-side data</h3>
            <p style={{ margin: "0 0 14px", fontSize: 13, color: t.textMuted, lineHeight: 1.55 }}>
              Export dissertation screenshots or JSON backups from your evaluation scripts; this SPA does not auto-sync to cloud storage.
            </p>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: t.textMuted, lineHeight: 1.65 }}>
              <li>Classification log and ML gallery samples live in localStorage.</li>
              <li>Use General → Data &amp; Storage path once a server folder is provisioned.</li>
            </ul>
          </div>
          <div style={card}>
            <h3 style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 800 }}>Reports export</h3>
            <p style={{ margin: "0 0 14px", fontSize: 13, color: t.textMuted, lineHeight: 1.55 }}>
              Structured waste summaries are prepared on the reports route when your pipeline writes them.
            </p>
            <NavLink to={`${DASH}/reports`} style={linkStyle}>
              Waste Reports →
            </NavLink>
          </div>
        </div>
      )}

      {tab === "appearance" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: 18 }}>
          <div style={card}>
            <h3 style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 800 }}>Layout density</h3>
            <p style={{ margin: "0 0 14px", fontSize: 13, color: t.textMuted, lineHeight: 1.55 }}>
              Optional tighter spacing for dashboard reviews on laptops in the field (preference only — not persisted yet).
            </p>
            <Toggle label="Compact spacing on lists &amp; cards" checked={denseLayout} onChange={setDenseLayout} noBorder />
          </div>
          <div style={card}>
            <h3 style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 800 }}>Theme</h3>
            <p style={{ margin: "0 0 14px", fontSize: 13, color: t.textMuted, lineHeight: 1.55 }}>
              The portal uses the dark green glass theme for contrast on maps and charts across Meghalaya waste views. Light theme would require a separate palette pass.
            </p>
          </div>
        </div>
      )}
    </>
  );

  return (
    <div style={{ paddingBottom: 28 }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 22,
          borderBottom: `1px solid ${t.cardBorder}`,
          paddingBottom: 4,
        }}
      >
        {tabs.map((x) => (
          <button
            key={x.id}
            type="button"
            onClick={() => goTab(x.id)}
            style={{
              padding: "10px 16px",
              borderRadius: 10,
              border: tab === x.id ? `1px solid rgba(92,184,92,0.55)` : "1px solid transparent",
              background: tab === x.id ? "rgba(92,184,92,0.22)" : "transparent",
              color: tab === x.id ? "#fff" : t.textMuted,
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {x.label}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 22, alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 560px", minWidth: 0, display: "flex", flexDirection: "column", gap: 18 }}>
          {tab === "general" && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: 18 }}>
                <div style={card}>
                  <h3 style={{ margin: "0 0 18px", fontSize: 16, fontWeight: 800 }}>General Settings</h3>
                  <div style={{ display: "grid", gap: 14 }}>
                    <div>
                      <label style={labelStyle}>Portal Name</label>
                      <input style={inputStyle} value={portalName} onChange={(e) => setPortalName(e.target.value)} />
                    </div>
                    <div>
                      <label style={labelStyle}>Portal Tagline</label>
                      <input style={inputStyle} value={tagline} onChange={(e) => setTagline(e.target.value)} />
                    </div>
                    <div>
                      <label style={labelStyle}>Default Language</label>
                      <select style={{ ...inputStyle, cursor: "pointer" }} value={language} onChange={(e) => setLanguage(e.target.value)}>
                        <option value="en">English</option>
                        <option value="hi">Hindi</option>
                        <option value="kha">Khasi</option>
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Time Zone</label>
                      <select style={{ ...inputStyle, cursor: "pointer" }} value={tz} onChange={(e) => setTz(e.target.value)}>
                        <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                        <option value="UTC">UTC</option>
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Date Format</label>
                      <select style={{ ...inputStyle, cursor: "pointer" }} value={dateFmt} onChange={(e) => setDateFmt(e.target.value)}>
                        <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                        <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                        <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Time Format</label>
                      <select style={{ ...inputStyle, cursor: "pointer" }} value={timeFmt} onChange={(e) => setTimeFmt(e.target.value)}>
                        <option value="24h">24-hour</option>
                        <option value="12h">12-hour</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
                    <Btn>Save Changes</Btn>
                  </div>
                </div>

                <div style={card}>
                  <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 800 }}>System Preferences</h3>
                  <Toggle label="Enable Dark Mode" checked={darkMode} onChange={setDarkMode} />
                  <Toggle label="Auto Refresh Dashboard" checked={autoRefresh} onChange={setAutoRefresh} />
                  <Toggle label="Show System Announcements" checked={announcements} onChange={setAnnouncements} />
                  <Toggle label="Compact Mode" checked={compact} onChange={setCompact} />
                  <Toggle label="Confirm Before Delete" checked={confirmDel} onChange={setConfirmDel} noBorder />
                  <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
                    <Btn>Save Preferences</Btn>
                  </div>
                </div>

                <div style={card}>
                  <h3 style={{ margin: "0 0 18px", fontSize: 16, fontWeight: 800 }}>Data &amp; Storage</h3>
                  <div style={{ display: "grid", gap: 14 }}>
                    <div>
                      <label style={labelStyle}>Dataset Storage Path</label>
                      <div style={{ display: "flex", gap: 10 }}>
                        <input
                          style={{ ...inputStyle, flex: 1 }}
                          value={storagePath}
                          onChange={(e) => setStoragePath(e.target.value)}
                          placeholder="Set when your backend / object storage is configured"
                        />
                        <button
                          type="button"
                          style={{
                            padding: "10px 14px",
                            borderRadius: 10,
                            border: `1px solid ${t.cardBorder}`,
                            background: "rgba(255,255,255,0.06)",
                            color: t.text,
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                          }}
                        >
                          Browse
                        </button>
                      </div>
                    </div>
                    <div>
                      <label style={labelStyle}>Max File Upload Size (MB)</label>
                      <input style={inputStyle} value={maxMb} onChange={(e) => setMaxMb(e.target.value)} />
                    </div>
                    <div>
                      <label style={labelStyle}>Allowed File Types</label>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {["JPG", "JPEG", "PNG"].map((tag) => (
                          <span
                            key={tag}
                            style={{
                              padding: "6px 12px",
                              borderRadius: 8,
                              fontSize: 12,
                              fontWeight: 600,
                              background: "rgba(92,184,92,0.15)",
                              border: `1px solid rgba(92,184,92,0.35)`,
                            }}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label style={labelStyle}>Data Retention Period (days)</label>
                      <input style={inputStyle} value={retention} onChange={(e) => setRetention(e.target.value)} />
                    </div>
                  </div>
                  <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
                    <Btn>Save Data Settings</Btn>
                  </div>
                </div>

                <div style={card}>
                  <h3 style={{ margin: "0 0 18px", fontSize: 16, fontWeight: 800 }}>Email Configuration</h3>
                  <div style={{ display: "grid", gap: 14 }}>
                    <p style={{ margin: "0 0 12px", fontSize: 12, color: t.textMuted, lineHeight: 1.5 }}>
                      No mail server is pre-filled. Enter values from your IT / Meghalaya mail team when you enable notifications.
                    </p>
                    <div>
                      <label style={labelStyle}>SMTP Host</label>
                      <input
                        style={inputStyle}
                        value={smtpHost}
                        onChange={(e) => setSmtpHost(e.target.value)}
                        placeholder="e.g. smtp.your-provider.gov.in"
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Port</label>
                      <input style={inputStyle} value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} placeholder="587 or 465" />
                    </div>
                    <div>
                      <label style={labelStyle}>Email Address</label>
                      <input
                        style={inputStyle}
                        value={smtpUser}
                        onChange={(e) => setSmtpUser(e.target.value)}
                        placeholder="Sender address for portal mail"
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Password</label>
                      <input style={inputStyle} type="password" placeholder="••••••••" autoComplete="off" readOnly />
                    </div>
                    <Toggle label="Secure Connection (TLS/SSL)" checked={smtpSecure} onChange={setSmtpSecure} noBorder />
                  </div>
                  <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
                    <Btn>Save Email Settings</Btn>
                  </div>
                </div>
              </div>
            </>
          )}

          {tab !== "general" && secondaryPanels}
        </div>

        <aside style={{ flex: "0 1 340px", width: "100%", display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={card}>
            <h3 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 800 }}>Account Information</h3>
            <p style={{ margin: "0 0 14px", fontSize: 12, color: t.textMuted, lineHeight: 1.5 }}>
              No login provider is wired in this build. Fields below show placeholders until you connect authentication.
            </p>
            <dl style={{ margin: 0, display: "grid", gap: 12, fontSize: 13 }}>
              {[
                ["Full Name", "—"],
                ["Email", "—"],
                ["Role", "Not signed in", "tag"],
                ["Department", "—"],
                ["Last Login", "—"],
              ].map(([k, v, type]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                  <dt style={{ margin: 0, color: t.textMuted }}>{k}</dt>
                  <dd style={{ margin: 0, fontWeight: 600, textAlign: "right" }}>
                    {type === "tag" ? (
                      <span
                        style={{
                          padding: "4px 10px",
                          borderRadius: 999,
                          fontSize: 11,
                          background: "rgba(148,163,184,0.2)",
                          border: `1px solid rgba(148,163,184,0.35)`,
                          color: "rgba(226,232,240,0.95)",
                        }}
                      >
                        {v}
                      </span>
                    ) : (
                      v
                    )}
                  </dd>
                </div>
              ))}
            </dl>
            <div style={{ marginTop: 18 }}>
              <Btn variant="solid">Edit Profile</Btn>
            </div>
          </div>

          <div style={card}>
            <h3 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 800 }}>System Information</h3>
            <p style={{ margin: "0 0 14px", fontSize: 12, color: t.textMuted, lineHeight: 1.5 }}>
              Values reflect this web build only — not a live ops dashboard until backends are connected.
            </p>
            <dl style={{ margin: 0, display: "grid", gap: 12, fontSize: 13 }}>
              {[
                ["App version", pkg.version],
                ["Classification demo", "Browser colour heuristic (not a hosted ViT)"],
                ["Database", "Not configured (static SPA)"],
                ["Your session clock", clientNowLabel],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <dt style={{ margin: 0, color: t.textMuted }}>{k}</dt>
                  <dd style={{ margin: 0, fontWeight: 600, textAlign: "right", maxWidth: "58%", wordBreak: "break-word" }}>{v}</dd>
                </div>
              ))}
            </dl>
            <div style={{ marginTop: 16, fontSize: 12, color: t.textMuted, lineHeight: 1.5 }}>
              Deploy PostgreSQL, SMTP, and your ML API separately; this UI is the front-end shell for Meghalaya waste workflows.
            </div>
          </div>

          <div
            style={{
              ...card,
              border: `1px solid rgba(239, 68, 68, 0.45)`,
              background: "rgba(239, 68, 68, 0.06)",
            }}
          >
            <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 800, color: "#fca5a5" }}>Danger Zone</h3>
            <p style={{ margin: "0 0 14px", fontSize: 12, color: t.textMuted, lineHeight: 1.5 }}>
              Destructive actions cannot always be undone. Proceed with caution.
            </p>
            {[
              ["Clear Cache", "🗑️"],
              ["Reset All Settings", "↻"],
              ["Delete All Data", "✕"],
            ].map(([label, icon]) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "12px 0",
                  borderBottom: `1px solid rgba(239,68,68,0.15)`,
                }}
              >
                <span style={{ fontSize: 13 }}>{label}</span>
                <button
                  type="button"
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    border: "1px solid rgba(239,68,68,0.5)",
                    background: "rgba(239,68,68,0.15)",
                    cursor: "pointer",
                    fontSize: 16,
                  }}
                  aria-label={label}
                >
                  {icon}
                </button>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
