import { Component, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";
import App from "./App.jsx";

/** Avoid a blank dark page when a child throws — surface the error instead. */
class RootErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { err: null };
  }
  static getDerivedStateFromError(err) {
    return { err };
  }
  render() {
    if (this.state.err) {
      const msg = this.state.err instanceof Error ? this.state.err.message : String(this.state.err);
      return (
        <div
          style={{
            minHeight: "100vh",
            padding: 28,
            background: "#0a0f12",
            color: "#fecaca",
            fontFamily: "Inter, system-ui, sans-serif",
            lineHeight: 1.5,
          }}
        >
          <h1 style={{ margin: "0 0 12px", fontSize: 20, color: "#fff" }}>App error</h1>
          <p style={{ margin: "0 0 16px", color: "rgba(248,250,252,0.85)", maxWidth: 560 }}>
            The UI crashed while rendering. Open the browser devtools console for the stack trace, then reload after fixing
            the error.
          </p>
          <pre
            style={{
              margin: 0,
              padding: 14,
              borderRadius: 10,
              background: "rgba(0,0,0,0.45)",
              color: "#fda4af",
              fontSize: 13,
              overflow: "auto",
              maxWidth: "min(100%, 720px)",
            }}
          >
            {msg}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

// Vite / browser: use path-based routing ("/" = landing). HashRouter with no "#" in the URL
// often fails to match "/", so the first screen is blank. Packaged Electron uses file:// and
// must keep hash routing for client-side paths.
const useFileProtocol = typeof window !== "undefined" && window.location.protocol === "file:";
if (useFileProtocol && !window.location.hash) {
  window.location.hash = "#/";
}
const Router = useFileProtocol ? HashRouter : BrowserRouter;

// GitHub Pages is served under /digital_twin/ — import.meta.env.BASE_URL must match vite base.
function routerBasename() {
  if (useFileProtocol) return undefined;
  const raw = import.meta.env.BASE_URL ?? "/";
  const trimmed = raw.replace(/\/$/, "");
  if (!trimmed || trimmed === "." || raw === "/" || raw === "./") return undefined;
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <RootErrorBoundary>
      <Router basename={routerBasename()}>
        <App />
      </Router>
    </RootErrorBoundary>
  </StrictMode>
);
