import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// vite.config runs in Node; declare `process` so type-check passes without
// pulling in @types/node.
declare const process: { env: Record<string, string | undefined> };

// The frontend calls the backend at same-origin `/api/*`, and Vite proxies
// those to the FastAPI server in dev. Same-origin means session cookies work
// without cross-site/SameSite friction, and there's no CORS in the browser.
// Point the proxy elsewhere with CADENCE_BACKEND (run.sh sets it to match the
// backend port).
const backend = process.env.CADENCE_BACKEND || "http://127.0.0.1:8010";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": { target: backend, changeOrigin: true },
    },
  },
});
