import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // The browser calls /api/..., the backend expects the same path without the /api prefix.
    proxy: { "/api": { target: "http://localhost:8000", rewrite: (p) => p.replace(/^\/api/, "") } },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.js",
    env: { VITE_USE_MOCK: "true" },
  },
});