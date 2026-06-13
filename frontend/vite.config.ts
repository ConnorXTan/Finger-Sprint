import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The frontend talks to the backend only over /api (REST) and /ws (WebSocket).
// In dev we proxy both to the backend so the browser uses same-origin URLs
// (no CORS dance) and the two servers stay cleanly independent.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:4000", changeOrigin: true },
      "/ws": { target: "ws://localhost:4000", ws: true },
    },
  },
});
