import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "/internado/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Internado — Ciclos clínicos",
        short_name: "Internado",
        description: "Gestor personal de ciclos clínicos abiertos para el internado.",
        start_url: "/internado/",
        scope: "/internado/",
        display: "standalone",
        background_color: "#f4f6f8",
        theme_color: "#10212f",
        icons: [
          {
            src: "/internado/icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any"
          }
        ]
      }
    })
  ]
});
