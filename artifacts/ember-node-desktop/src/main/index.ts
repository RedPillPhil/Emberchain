import { app, BrowserWindow, Tray, Menu, nativeImage, shell } from "electron";
import { join } from "node:path";
import { homedir } from "node:os";
import { mkdirSync } from "node:fs";
import { loadConfig, saveConfig, AppConfig } from "./config.js";
import { registerIpcHandlers } from "./ipc.js";
import type { DaemonHandle } from "@ember-daemon/embedded";

// ── Data directory ────────────────────────────────────────────────────────────
function getDataDir(): string {
  switch (process.platform) {
    case "win32":  return join(process.env.APPDATA ?? homedir(), "Emberchain");
    case "darwin": return join(homedir(), "Library", "Application Support", "Emberchain");
    default:       return join(homedir(), ".emberchain");
  }
}

const DATA_DIR = app.getPath("userData") || getDataDir();
mkdirSync(DATA_DIR, { recursive: true });

// ── Globals ───────────────────────────────────────────────────────────────────
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let daemon: DaemonHandle | null = null;
let config: AppConfig = loadConfig(DATA_DIR);

// ── Daemon lifecycle ──────────────────────────────────────────────────────────
async function startDaemon(): Promise<void> {
  if (daemon) return;
  const { startEmbeddedDaemon } = await import("@ember-daemon/embedded");
  const peers = config.customPeers
    ? config.customPeers.split(",").map((s) => s.trim()).filter(Boolean)
    : ["https://emberchain.org"];

  daemon = await startEmbeddedDaemon({
    dataDir: DATA_DIR,
    port: config.port,
    seedPeers: peers,
    gentleSync: config.gentleSync,
  });

  if (config.autoMine && config.minerAddress) {
    setTimeout(async () => {
      try { await daemon!.startMining(config.minerAddress, config.miningIntensity); }
      catch (err) { console.warn("[main] Auto-mine failed:", err); }
    }, 8_000);
  }

  updateTray();
}

async function stopDaemon(): Promise<void> {
  if (!daemon) return;
  await daemon.stop();
  daemon = null;
  updateTray();
}

// ── Window ────────────────────────────────────────────────────────────────────
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 680,
    minWidth: 800,
    minHeight: 560,
    backgroundColor: "#0f1117",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
    icon: join(__dirname, "../../resources/icon.png"),
  });

  mainWindow.once("ready-to-show", () => { mainWindow?.show(); });

  mainWindow.on("close", (e) => {
    if (config.minimizeToTray && tray) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

// ── System tray ───────────────────────────────────────────────────────────────
function updateTray(): void {
  if (!tray) return;
  const isRunning = daemon !== null;
  const menu = Menu.buildFromTemplate([
    { label: `Ember Node ${isRunning ? "● Running" : "○ Stopped"}`, enabled: false },
    { type: "separator" },
    {
      label: isRunning ? "Stop Node" : "Start Node",
      click: isRunning ? () => void stopDaemon() : () => void startDaemon(),
    },
    { label: "Open Dashboard", click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { type: "separator" },
    {
      label: "Open Data Folder",
      click: () => shell.openPath(DATA_DIR),
    },
    { type: "separator" },
    { label: "Quit Ember Node", click: () => { void stopDaemon().then(() => app.quit()); } },
  ]);
  tray.setContextMenu(menu);
  tray.setToolTip(`Ember Node — ${isRunning ? "Running" : "Stopped"}`);
}

function createTray(): void {
  const iconPath = join(__dirname, "../../resources/tray-icon.png");
  try {
    const icon = nativeImage.createFromPath(iconPath);
    tray = new Tray(icon.resize({ width: 16, height: 16 }));
  } catch {
    // Fallback empty icon if resources aren't generated yet
    tray = new Tray(nativeImage.createEmpty());
  }
  tray.on("click", () => { mainWindow?.show(); mainWindow?.focus(); });
  updateTray();
}

// ── IPC ───────────────────────────────────────────────────────────────────────
registerIpcHandlers({
  getHandle:   () => daemon,
  dataDir:     DATA_DIR,
  getConfig:   () => config,
  saveConfig:  (cfg) => { config = cfg; saveConfig(DATA_DIR, cfg); },
  startDaemon,
  stopDaemon,
});

// ── App events ────────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  createWindow();
  createTray();
  if (config.autoStart) await startDaemon();
});

app.on("window-all-closed", () => {
  // On macOS the app stays alive in the tray even when all windows are closed.
  if (process.platform !== "darwin") {
    void stopDaemon().then(() => app.quit());
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
  else mainWindow?.show();
});

app.on("before-quit", () => {
  mainWindow?.removeAllListeners("close");
  void stopDaemon();
});
