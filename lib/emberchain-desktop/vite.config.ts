import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Tauri expects a fixed devPort
  server: {
    port: 1420,
    strictPort: true,
    host: "localhost",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  // Tauri needs absolute paths for production
  base: "./",
  build: {
    outDir: "dist",
    target: ["es2021", "chrome100", "safari13"],
    minify: !process.env.TAURI_DEBUG,
    sourcemap: !!process.env.TAURI_DEBUG,
  },
  // Prevent vite from obscuring Rust errors
  clearScreen: false,
  envPrefix: ["VITE_", "TAURI_"],
});
