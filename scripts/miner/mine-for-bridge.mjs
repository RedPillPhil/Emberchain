#!/usr/bin/env node
/**
 * PC-only bridge miner — mines from YOUR computer onto the target node.
 * Does NOT start server-side mining on the seed (safe for production).
 *
 * Run BEFORE clicking Bridge (watch mode), or pass --tx after submit:
 *
 *   node mine-for-bridge.mjs --node https://emberchain.org --address 0xYOUR...
 *   node mine-for-bridge.mjs --node https://emberchain.org --address 0xYOUR... --tx 0xHASH
 */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const minerScript = path.join(__dirname, "emberchain-miner.mjs");

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);

if (!has("--address") && !process.env.EMBR_ADDRESS) {
  console.error(`
  mine-for-bridge.mjs — PC-only miner to confirm bridge locks

  Usage:
    node mine-for-bridge.mjs --node https://emberchain.org --address 0xYOUR_WALLET
    node mine-for-bridge.mjs --node https://emberchain.org --address 0xYOUR... --tx 0xLOCK_HASH

  Flags:
    --node URL          Chain node where you submit the bridge (required)
    --address 0x...     Your EMBR wallet (required)
    --tx 0x...          Lock tx hash (optional — omit to watch for new bridge submit)
    --threads N         CPU threads (default: all cores)

  Runs on YOUR PC only. Does not touch server-side mining.
`);
  process.exit(1);
}

const childArgs = [minerScript, ...args, "--until-confirmed"];

if (!has("--tx") && !process.env.EMBR_TX) {
  childArgs.push("--watch-bridge");
}

const child = spawn(process.execPath, childArgs, { stdio: "inherit", env: process.env });
child.on("exit", (code) => process.exit(code ?? 0));
