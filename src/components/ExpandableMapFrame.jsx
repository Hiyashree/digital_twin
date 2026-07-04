import { useEffect, useState } from "react";
import { portal as theme } from "./portal/portalTheme.js";

const btn = {
  padding: "8px 14px",
  borderRadius: 10,
  fontWeight: 700,
  fontSize: 12,
  cursor: "pointer",
  fontFamily: "inherit",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  whiteSpace: "nowrap",
};

/**
 * Wraps a map so it can expand to near-fullscreen without remounting (same Leaflet instance).
 */
export default function ExpandableMapFrame({
  title,
  subtitle,
  /** Map pane height when not expanded — number = px, or any CSS length (e.g. `clamp(420px, 52vh, 720px)`). */
  collapsedHeight = 380,
  cardStyle = {},
  /** Optional toolbar (toggles, hints) between the title row and the map. */
  controls = null,
  children,
}) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e) => {
      if (e.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    const id = window.setTimeout(() => window.dispatchEvent(new Event("resize")), 60);
    return () => clearTimeout(id);
  }, [expanded]);

  const shell = {
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    ...cardStyle,
    ...(expanded
      ? {
          position: "fixed",
          left: 14,
          right: 14,
          top: 14,
          bottom: 14,
          zIndex: 10050,
          maxHeight: "calc(100vh - 28px)",
          boxShadow: "0 0 0 9999px rgba(2, 10, 8, 0.88)",
        }
      : {}),
  };

  return (
    <>
      {expanded && (
        <button
          type="button"
          aria-label="Close expanded map"
          onClick={() => setExpanded(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10040,
            border: "none",
            padding: 0,
            margin: 0,
            background: "rgba(0, 0, 0, 0.55)",
            cursor: "pointer",
          }}
        />
      )}
      <div style={shell}>
        <div
          style={{
            padding: "12px 14px",
            borderBottom: `1px solid ${theme.cardBorder}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: 10,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: expanded ? 17 : 15 }}>{title}</div>
            {subtitle ? (
              <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 4 }}>{subtitle}</div>
            ) : null}
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            {!expanded ? (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                style={{
                  ...btn,
                  border: `1px solid rgba(${theme.accentRgb}, 0.45)`,
                  background: `rgba(${theme.accentRgb}, 0.2)`,
                  color: "#ecfdf5",
                }}
              >
                ⛶ Expand map
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setExpanded(false)}
                style={{
                  ...btn,
                  border: `1px solid ${theme.cardBorder}`,
                  background: theme.card,
                  color: theme.text,
                }}
              >
                ✕ Close
              </button>
            )}
          </div>
        </div>
        {controls ? (
          <div
            style={{
              padding: "8px 14px",
              borderBottom: `1px solid ${theme.cardBorder}`,
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 10,
              fontSize: 12,
              color: theme.textMuted,
              flexShrink: 0,
            }}
          >
            {controls}
          </div>
        ) : null}
        <div
          style={{
            width: "100%",
            position: "relative",
            overflow: "hidden",
            ...(expanded
              ? {
                  /* Expanded shell has fixed inset + maxHeight; map consumes remaining vertical space */
                  flex: 1,
                  minHeight: 0,
                  height: "min(78vh, calc(100vh - 132px))",
                }
              : {
                  /*
                   * Collapsed: must NOT use flex:1 + minHeight:0 — if `height` is dropped (bad CSS),
                   * the row collapses to 0px and Leaflet shows nothing.
                   */
                  flex: "none",
                  flexShrink: 0,
                  height:
                    typeof collapsedHeight === "number"
                      ? collapsedHeight
                      : collapsedHeight,
                  minHeight:
                    typeof collapsedHeight === "number"
                      ? collapsedHeight
                      : collapsedHeight,
                }),
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              minHeight: 0,
              width: "100%",
              height: "100%",
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </>
  );
}
