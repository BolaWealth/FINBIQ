import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Dual-stack: listen on :: so both http://localhost:5173 and
    // http://127.0.0.1:5173 work (Windows resolves localhost to ::1).
    host: "::",
    strictPort: true,
    proxy: {
      "/api": "http://localhost:4000",
    },
  },
});
