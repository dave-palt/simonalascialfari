import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  // Project page GitHub serve sotto /<repo>/; dominio custom → "/" (default).
  // CI passa VITE_BASE=/<repo>/ (deploy.yml).
  base: process.env.VITE_BASE || "/",
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  build: { outDir: "dist", sourcemap: false },
  server: { proxy: { "/api": "http://127.0.0.1:8787" } },
});
