import { useEffect } from "react";
import { portal as t } from "./portal/portalTheme.js";

const slideKeyframes = `
@keyframes notificationSlideIn {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}
`;

export default function NotificationPanel({ notifications, onRemove }) {
  useEffect(() => {
    const styleSheet = document.createElement("style");
    styleSheet.textContent = slideKeyframes;
    document.head.appendChild(styleSheet);
    return () => document.head.removeChild(styleSheet);
  }, []);

  const getTone = (type) => {
    switch (type) {
      case "critical":
        return { bg: "rgba(239,68,68,0.18)", border: "rgba(239,68,68,0.35)", accent: "#fca5a5" };
      case "success":
        return { bg: "rgba(92,184,92,0.15)", border: "rgba(92,184,92,0.35)", accent: "#86efac" };
      case "info":
        return { bg: "rgba(59,130,246,0.12)", border: "rgba(59,130,246,0.3)", accent: "#93c5fd" };
      case "warning":
        return { bg: "rgba(245,158,11,0.14)", border: "rgba(245,158,11,0.35)", accent: "#fcd34d" };
      default:
        return { bg: "rgba(255,255,255,0.04)", border: t.cardBorder, accent: t.textMuted };
    }
  };

  return (
    <div
      style={{
        width: "min(100vw - 32px, 360px)",
        maxHeight: "min(70vh, 420px)",
        overflowY: "auto",
        padding: 12,
        borderRadius: 14,
        background: t.card,
        border: `1px solid ${t.cardBorder}`,
        boxShadow: "0 24px 48px rgba(0,0,0,0.45), 0 0 1px rgba(92,184,92,0.2)",
        backdropFilter: "blur(12px)",
        animation: "notificationSlideIn 0.2s ease-out",
      }}
      role="dialog"
      aria-label="Notifications"
    >
      {notifications.length === 0 ? (
        <div style={{ padding: "20px 14px", textAlign: "center", color: t.textMuted, fontSize: 13 }}>
          No notifications yet. System alerts will appear here.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {notifications.map((notification) => {
            const tone = getTone(notification.type);
            return (
              <div
                key={notification.id}
                style={{
                  position: "relative",
                  padding: "12px 36px 12px 12px",
                  borderRadius: 12,
                  background: tone.bg,
                  border: `1px solid ${tone.border}`,
                  color: t.text,
                  fontSize: 13,
                  lineHeight: 1.45,
                }}
              >
                <button
                  type="button"
                  style={{
                    position: "absolute",
                    top: 8,
                    right: 8,
                    background: "rgba(0,0,0,0.25)",
                    border: "none",
                    borderRadius: 8,
                    color: tone.accent,
                    cursor: "pointer",
                    fontSize: 16,
                    lineHeight: 1,
                    padding: "4px 8px",
                  }}
                  onClick={() => onRemove(notification.id)}
                  aria-label="Dismiss notification"
                >
                  ×
                </button>
                <div>{notification.message}</div>
                <div style={{ fontSize: 11, color: t.textMuted, marginTop: 6 }}>
                  {new Date(notification.timestamp).toLocaleString()}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
