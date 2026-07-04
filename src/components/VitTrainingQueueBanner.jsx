import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { exportTrainingManifestJson, trainingSampleCount } from "../utils/trainingDatasetStorage.js";
import { portal as t } from "./portal/portalTheme.js";

const CLASSIFY_PATH = "/dashboard/classify";

/**
 * Browser-local ViT training queue: labeled samples from Image Classification workflow ① + JSON export.
 * Shown on Dataset Management and Waste Reports when at least one sample exists.
 */
export default function VitTrainingQueueBanner() {
  const [n, setN] = useState(() => trainingSampleCount());

  useEffect(() => {
    const fn = () => setN(trainingSampleCount());
    window.addEventListener("msw-training-queue-updated", fn);
    return () => window.removeEventListener("msw-training-queue-updated", fn);
  }, []);

  if (n <= 0) return null;

  return (
    <div
      style={{
        background: "rgba(56,189,248,0.08)",
        border: "1px solid rgba(56,189,248,0.35)",
        borderRadius: 14,
        padding: "14px 16px",
        marginBottom: 18,
        display: "flex",
        flexWrap: "wrap",
        gap: 12,
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <div>
        <div style={{ fontWeight: 800, fontSize: 13, color: t.text, marginBottom: 4 }}>ViT training queue (browser)</div>
        <p style={{ margin: 0, fontSize: 12, color: t.textMuted, lineHeight: 1.5, maxWidth: 560 }}>
          {n} labeled sample(s) saved from{" "}
          <NavLink to={CLASSIFY_PATH} style={{ color: t.accent, fontWeight: 700 }}>
            Image Classification → workflow ①
          </NavLink>
          . Export JSON manifest for your offline training pipeline (no automatic cloud upload).
        </p>
      </div>
      <button
        type="button"
        onClick={() => {
          const blob = new Blob([exportTrainingManifestJson()], { type: "application/json" });
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = `meghalaya-training-manifest-${Date.now()}.json`;
          a.click();
          URL.revokeObjectURL(a.href);
        }}
        style={{
          padding: "10px 16px",
          borderRadius: 12,
          border: "none",
          background: "linear-gradient(135deg,#38bdf8,#6366f1)",
          color: "#fff",
          fontWeight: 800,
          fontSize: 13,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        Download manifest JSON
      </button>
    </div>
  );
}
