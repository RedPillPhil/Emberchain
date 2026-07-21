/**
 * Copies the bundled server.mjs into node-resources/ so Tauri can bundle it.
 * Run automatically before tauri dev / tauri build.
 */
import { cp, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..", "..");
const SRC = path.resolve(ROOT, "lib", "emberchain-node", "dist", "downloads", "server.mjs");
const DEST_DIR = path.resolve(__dirname, "..", "node-resources");
const DEST = path.join(DEST_DIR, "server.mjs");

async function main() {
  if (!existsSync(SRC)) {
    console.error(`\n❌  server.mjs not found at:\n    ${SRC}\n`);
    console.error("    Run this first:\n");
    console.error("    pnpm --filter @workspace/emberchain-node run build\n");
    process.exit(1);
  }

  await mkdir(DEST_DIR, { recursive: true });
  await cp(SRC, DEST);
  console.log(`✅  Copied server.mjs → node-resources/`);
}

main().catch((e) => { console.error(e); process.exit(1); });
