import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const webSrc = fileURLToPath(new URL("./web/src", import.meta.url));

export default defineConfig({
  root: "web",
  resolve: {
    alias: { "@": webSrc },
  },
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8080",
      "/audio": "http://localhost:8080",
    },
  },
  build: {
    outDir: "../public",
    emptyOutDir: false,
  },
});
