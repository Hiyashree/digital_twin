import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import BrandLogo from "./BrandLogo.jsx";

const neon = "#5cb85c";
const neonRgb = "92, 184, 92";
const bgDeep = "#030306";
const bgPage = "#050508";
const textMuted = "rgba(232, 241, 249, 0.82)";
const font = '"Inter", system-ui, "Segoe UI", sans-serif';
const contentMax = 1120;
const heroPhotoUrl = `${import.meta.env.BASE_URL}hero-landing-bg.png`;

/** Feature icons: neon lime + glow (matches marketing strip reference). */
const featureIconNeonRgb = "57, 255, 20";

/** Dark glass — feature strip cards */
const glassStrip = {
  background: `rgba(6, 10, 14, 0.72)`,
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  border: `1px solid rgba(255, 255, 255, 0.06)`,
  boxShadow: `
    0 12px 48px rgba(0, 0, 0, 0.55),
    0 0 0 1px rgba(255, 255, 255, 0.03) inset,
    0 0 28px rgba(${neonRgb}, 0.06)
  `,
};

function scrollToId(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function FeatureStripCard({ icon, title, description, plainIcon = false }) {
  const iconGlow = {
    filter: `
      drop-shadow(0 0 7px rgba(${featureIconNeonRgb}, 1))
      drop-shadow(0 0 16px rgba(${featureIconNeonRgb}, 0.65))
      drop-shadow(0 0 32px rgba(${featureIconNeonRgb}, 0.42))
    `,
  };

  return (
    <div
      style={{
        padding: "24px 18px",
        borderRadius: 16,
        ...glassStrip,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
      }}
    >
      <div
        style={{
          position: "relative",
          width: 56,
          height: 56,
          marginBottom: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <div
          aria-hidden
          style={{
            position: "absolute",
            width: 44,
            height: 44,
            borderRadius: "50%",
            background: `radial-gradient(circle, rgba(${featureIconNeonRgb}, 0.5) 0%, rgba(${featureIconNeonRgb}, 0.12) 42%, transparent 72%)`,
            filter: "blur(10px)",
            pointerEvents: "none",
          }}
        />
        <span
          style={{
            ...(plainIcon ? {} : iconGlow),
            position: "relative",
            zIndex: 1,
            display: "flex",
            lineHeight: 0,
          }}
        >
          {icon}
        </span>
      </div>
      <h3 style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 700, color: "#fff", letterSpacing: "-0.02em", lineHeight: 1.25 }}>
        {title}
      </h3>
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: "rgba(200, 212, 224, 0.88)", flex: 1 }}>{description}</p>
    </div>
  );
}

export default function Index() {
  const [activeNav, setActiveNav] = useState("home");

  const go = useCallback((section, id) => {
    setActiveNav(section);
    if (id) scrollToId(id);
    else window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const navActive = (isActive) => ({
    textDecoration: "none",
    fontSize: 16,
    fontWeight: isActive ? 700 : 500,
    color: isActive ? "#fff" : "rgba(255,255,255,0.78)",
    padding: "10px 14px",
    borderBottom: isActive ? `3px solid ${neon}` : "3px solid transparent",
    textShadow: isActive ? `0 0 20px rgba(${neonRgb}, 0.35)` : "none",
    borderRadius: 4,
  });

  const navBtn = (section, id, label, isActive) => (
    <button
      type="button"
      onClick={() => go(section, id)}
      style={{
        ...navActive(isActive),
        background: "none",
        borderLeft: "none",
        borderRight: "none",
        borderTop: "none",
        cursor: "pointer",
        fontFamily: font,
      }}
    >
      {label}
    </button>
  );

  /** Photo at native brightness — overlays were crushing luminance; readability handled on the copy panel only. */
  const heroBg = `url(${heroPhotoUrl})`;

  const padX = "clamp(20px, 5vw, 48px)";
  /** Tighter left inset for hero copy; right keeps page rhythm next to the photo. */
  const heroPadLeft = "clamp(60px, 8vw, 120px)";

  const pillPrimary = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: "14px 28px",
    borderRadius: 999,
    background: neon,
    color: "#042f14",
    fontWeight: 800,
    fontSize: 15,
    textDecoration: "none",
    boxShadow: `0 4px 24px rgba(${neonRgb}, 0.45)`,
    border: "none",
    minHeight: 48,
  };

  const cardGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 190px), 1fr))",
    gap: 16,
    width: "100%",
    maxWidth: contentMax,
    margin: "0 auto",
  };

  return (
    <div
      style={{
        fontFamily: font,
        background: bgDeep,
        color: "#f4f7ff",
        minHeight: "100vh",
      }}
    >
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          borderBottom: `1px solid rgba(${neonRgb}, 0.12)`,
          background: "rgba(3, 3, 6, 0.88)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
        }}
      >
        <div
          style={{
            maxWidth: contentMax + 80,
            margin: "0 auto",
            padding: `16px ${padX}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 20,
            flexWrap: "wrap",
            rowGap: 14,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            <BrandLogo size={44} alt="" aria-hidden />
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: "clamp(1rem, 2.5vw, 1.25rem)",
                  fontWeight: 800,
                  letterSpacing: "-0.03em",
                  color: "#fff",
                  lineHeight: 1.2,
                }}
              >
                Meghalaya <span style={{ color: neon }}>Smart</span> Waste
              </div>
              <div style={{ fontSize: 12, color: textMuted, marginTop: 4, lineHeight: 1.35 }}>
                AI-Powered Waste Intelligence Portal
              </div>
            </div>
          </div>

          <nav
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 8,
              justifyContent: "center",
              flex: "1 1 200px",
            }}
          >
            {navBtn("home", null, "Home", activeNav === "home")}
            {navBtn("features", "feature-strip", "Features", activeNav === "features")}
          </nav>

          <button
            type="button"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 20px",
              borderRadius: 999,
              color: "#ecfdf5",
              fontSize: 13,
              fontWeight: 600,
              fontFamily: font,
              border: `1px solid rgba(${neonRgb}, 0.45)`,
              background: `rgba(${neonRgb}, 0.1)`,
              flexShrink: 0,
              cursor: "pointer",
            }}
          >
            Login/signup
          </button>
        </div>
      </header>

      {/* Hero */}
      <section
        id="top"
        style={{
          backgroundImage: heroBg,
          backgroundColor: "#050608",
          backgroundSize: "cover",
          backgroundPosition: "62% center",
          backgroundRepeat: "no-repeat",
          paddingTop: "clamp(40px, 8vw, 72px)",
          paddingRight: padX,
          paddingBottom: "clamp(48px, 9vw, 88px)",
          paddingLeft: heroPadLeft,
          minHeight: "min(620px, 92vh)",
          display: "flex",
          alignItems: "center",
        }}
      >
        <div style={{ width: "100%", maxWidth: contentMax, marginLeft: 0, marginRight: "auto" }}>
          <div style={{ textAlign: "left", minWidth: 0, maxWidth: 640 }}>
            <h1
              style={{
                margin: "0 0 16px",
                fontSize: "clamp(1.65rem, 4vw, 2.55rem)",
                fontWeight: 800,
                lineHeight: 1.12,
                letterSpacing: "-0.03em",
                maxWidth: 560,
              }}
            >
              <span
                style={{
                  color: "#fff",
                  textShadow:
                    "0 1px 2px rgba(0,0,0,0.95), 0 2px 16px rgba(0,0,0,0.65), 0 4px 28px rgba(0,0,0,0.45)",
                }}
              >
                AI-Powered Waste Classification &amp;{" "}
              </span>
              <span
                style={{
                  color: neon,
                  textShadow:
                    "0 0 1px rgba(0,0,0,0.9), 0 2px 14px rgba(0,0,0,0.75), 0 2px 28px rgba(0,0,0,0.5)",
                }}
              >
                Hotspot Mapping
              </span>
            </h1>
            <p
              style={{
                fontSize: "clamp(1.05rem, 2.2vw, 1.22rem)",
                color: "#fff",
                margin: "0 0 18px",
                fontWeight: 700,
                lineHeight: 1.4,
                maxWidth: 520,
                textShadow:
                  "0 1px 2px rgba(0,0,0,0.9), 0 2px 12px rgba(0,0,0,0.55)",
              }}
            >
              For A Cleaner &amp; Sustainable Meghalaya
            </p>
            <p
              style={{
                margin: "0 0 30px",
                fontSize: 15,
                lineHeight: 1.65,
                color: "rgba(255,255,255,0.94)",
                maxWidth: 520,
                textShadow: "0 1px 3px rgba(0,0,0,0.85), 0 2px 14px rgba(0,0,0,0.45)",
              }}
            >
              Using Deep Learning and Vision Transformer to identify waste types and map hotspot areas in tourist regions of Meghalaya for better waste management and a cleaner tomorrow.
            </p>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 14,
                justifyContent: "flex-start",
                alignItems: "center",
              }}
            >
              <Link to="/dashboard" style={pillPrimary}>
                View Dashboard
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section
        id="feature-strip"
        style={{
          padding: `48px ${padX} 56px`,
          background: `linear-gradient(180deg, #040508 0%, ${bgPage} 55%, #06080d 100%)`,
        }}
      >
        <div style={cardGrid}>
          <FeatureStripCard
            plainIcon
            icon={
              <img
                src={`${import.meta.env.BASE_URL}ai-waste-classification-logo.png`}
                alt=""
                width={48}
                height={48}
                style={{ width: 48, height: 48, objectFit: "contain", display: "block" }}
              />
            }
            title="AI Waste Classification"
            description="Classify waste types using advanced Deep Learning & Vision Transformer models."
          />
          <FeatureStripCard
            plainIcon
            icon={
              <img
                src={`${import.meta.env.BASE_URL}feature-hotspot-mapping.png`}
                alt=""
                width={48}
                height={48}
                style={{ width: 48, height: 48, objectFit: "contain", display: "block" }}
              />
            }
            title="Hotspot Mapping"
            description="Identify and visualize waste hotspots on interactive GIS maps."
          />
          <FeatureStripCard
            plainIcon
            icon={
              <img
                src={`${import.meta.env.BASE_URL}feature-recyclable-detection.png`}
                alt=""
                width={48}
                height={48}
                style={{ width: 48, height: 48, objectFit: "contain", display: "block" }}
              />
            }
            title="Recyclable Detection"
            description="Automatically segregate recyclable and non-recyclable waste."
          />
          <FeatureStripCard
            plainIcon
            icon={
              <img
                src={`${import.meta.env.BASE_URL}feature-analytics-reports.png`}
                alt=""
                width={48}
                height={48}
                style={{ width: 48, height: 48, objectFit: "contain", display: "block" }}
              />
            }
            title="Analytics & Reports"
            description="Get insights through smart analytics and downloadable reports."
          />
          <FeatureStripCard
            plainIcon
            icon={
              <img
                src={`${import.meta.env.BASE_URL}feature-sustainable-tourism.png`}
                alt=""
                width={48}
                height={48}
                style={{ width: 48, height: 48, objectFit: "contain", display: "block" }}
              />
            }
            title="Sustainable Tourism"
            description="Promote cleanliness and sustainability in Meghalaya's tourist destinations."
          />
        </div>

        <footer
          style={{
            maxWidth: contentMax,
            margin: "40px auto 0",
            paddingTop: 28,
            borderTop: `1px solid rgba(${neonRgb}, 0.12)`,
            fontSize: 12,
            color: "rgba(156, 168, 182, 0.95)",
            textAlign: "center",
            lineHeight: 1.65,
          }}
        >
          © {new Date().getFullYear()} Meghalaya Smart Waste Portal. All rights reserved.
        </footer>
      </section>
    </div>
  );
}
