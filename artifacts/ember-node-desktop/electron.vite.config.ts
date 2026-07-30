import { resolve } from "path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ["better-sqlite3"] })],
    resolve: {
      alias: {
        // Resolve workspace packages directly from source so the desktop
        // build bundles everything without needing a pnpm workspace install.
        "@workspace/chain-core": resolve(__dirname, "../../lib/chain-core/src/index.ts"),
        "@workspace/api-zod":    resolve(__dirname, "../../lib/api-zod/src/index.ts"),
        // Re-use the standalone daemon source directly
        "@ember-daemon":         resolve(__dirname, "../../lib/ember-daemon/src"),
      },
    },
    build: {
      rollupOptions: {
        external: ["better-sqlite3", "electron"],
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    resolve: {
      alias: {
        "@renderer": resolve(__dirname, "src/renderer/src"),
      },
    },
    plugins: [react()],
  },
});
