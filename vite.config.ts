import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "frontend",
    emptyOutDir: true
  },
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        headers: {
          "x-nebula-user-id": "jace",
          "x-nebula-user-name": "Jace",
          "x-nebula-user-role": "admin"
        }
      }
    }
  }
});