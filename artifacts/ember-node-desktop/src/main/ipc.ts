/**
 * IPC handlers — bridge between the Electron renderer (React UI)
 * and the embedded ember-daemon running in the main process.
 */

import { ipcMain, shell } from "electron";
import type { DaemonHandle } from "@ember-daemon/embedded";
import type { AppConfig } from "./config.js";

let _daemon: DaemonHandle | null = null;
let _dataDir = "";
let _config: AppConfig | null = null;
let _saveConfigFn: ((cfg: AppConfig) => void) | null = null;

export function registerIpcHandlers(opts: {
  getHandle: () => DaemonHandle | null;
  dataDir: string;
  getConfig: () => AppConfig;
  saveConfig: (cfg: AppConfig) => void;
  startDaemon: () => Promise<void>;
  stopDaemon: () => Promise<void>;
}): void {
  _daemon    = opts.getHandle();
  _dataDir   = opts.dataDir;
  _config    = opts.getConfig();
  _saveConfigFn = opts.saveConfig;

  // ── Status ──────────────────────────────────────────────────────────────────
  ipcMain.handle("daemon:getStatus", async () => {
    const h = opts.getHandle();
    if (!h) return { running: false, blockHeight: 0, difficulty: "0", peers: 0, isSynced: false, bestPeerHeight: 0 };
    return h.getStatus();
  });

  ipcMain.handle("daemon:getMiningStatus", () => {
    const h = opts.getHandle();
    if (!h) return { mining: false, minerAddress: null, hashRate: 0, activeMiners: 0, sharesInRound: 0, blocksMined: 0 };
    return h.getMiningStatus();
  });

  ipcMain.handle("daemon:getPeers", () => {
    const h = opts.getHandle();
    return h ? h.getPeers() : [];
  });

  // ── Mining controls ─────────────────────────────────────────────────────────
  ipcMain.handle("daemon:startMining", async (_e, minerAddress: string, intensity: number) => {
    const h = opts.getHandle();
    if (!h) throw new Error("Daemon not running");
    await h.startMining(minerAddress, intensity);
    return { ok: true };
  });

  ipcMain.handle("daemon:stopMining", async () => {
    const h = opts.getHandle();
    if (!h) return { ok: true };
    await h.stopMining();
    return { ok: true };
  });

  // ── Daemon lifecycle ─────────────────────────────────────────────────────────
  ipcMain.handle("daemon:start", async () => {
    await opts.startDaemon();
    return { ok: true };
  });

  ipcMain.handle("daemon:stop", async () => {
    await opts.stopDaemon();
    return { ok: true };
  });

  ipcMain.handle("daemon:isRunning", () => opts.getHandle() !== null);

  // ── Config ──────────────────────────────────────────────────────────────────
  ipcMain.handle("config:get", () => opts.getConfig());
  ipcMain.handle("config:save", (_e, cfg: AppConfig) => {
    opts.saveConfig(cfg);
    return { ok: true };
  });

  // ── Misc ─────────────────────────────────────────────────────────────────────
  ipcMain.handle("app:openDataDir", () => shell.openPath(_dataDir));

  ipcMain.handle("app:getInfo", () => ({
    dataDir: _dataDir,
    port: opts.getHandle()?.port ?? opts.getConfig().port,
    rpcUrl: `http://127.0.0.1:${opts.getHandle()?.port ?? opts.getConfig().port}`,
    chainId: 7773,
  }));

  // ── Raw JSON-RPC passthrough (Console tab) ───────────────────────────────────
  ipcMain.handle("daemon:rpc", async (_e, method: string, params: unknown[]) => {
    const h = opts.getHandle();
    if (!h) throw new Error("Daemon not running");
    const res = await fetch(`http://127.0.0.1:${h.port}/api/rpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    return res.json();
  });
}
