import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Derlenmiş arayüz server/public'e çıkar; Electron tek porttan servis eder.
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: { outDir: "../server/public", emptyOutDir: true },
  server: {
    port: 5180,
    proxy: { "/api": "http://localhost:3010" },
  },
});
