import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Project Pages URL: https://hiyashree.github.io/digital_twin/ */
const GH_PAGES_BASE = "/digital_twin/";

export default defineConfig(({ command }) => {
  const ghPages = process.env.GH_PAGES === "true";
  const base =
    command === "serve" ? "/" : ghPages ? GH_PAGES_BASE : "./";

  return {
    base,
    plugins: [
      react(),
      {
        name: "github-pages-spa-fallback",
        closeBundle() {
          if (!ghPages) return;
          const dist = path.resolve(__dirname, "dist");
          fs.copyFileSync(path.join(dist, "index.html"), path.join(dist, "404.html"));
        },
      },
    ],
    server: {
      port: 5173,
      /** Fail fast if something (e.g. old Vite) still holds 5173 instead of jumping to 5174. */
      strictPort: true,
      proxy: {
        /**
         * API under /api so dev server paths like /reports never hit the proxy
         * (avoids breaking SPA routes and static /reports fetches from the page).
         * /api/reports → backend /reports
         */
        "/api": {
          target: "http://127.0.0.1:5000",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, "") || "/",
        },
        "/auth": {
          target: "http://127.0.0.1:5000",
          changeOrigin: true,
        },
        "/predict": {
          target: "http://127.0.0.1:5000",
          changeOrigin: true,
        },
        "/classify_waste": {
          target: "http://127.0.0.1:5000",
          changeOrigin: true,
        },
      },
    },
  };
});
