import { contextBridge, ipcRenderer } from "electron";

/** Type-safe bridge exposed to the renderer as `window.emberNode`. */
contextBridge.exposeInMainWorld("emberNode", {
  // ── Node status ─────────────────────────────────────────────────────────────
  getStatus:       () => ipcRenderer.invoke("daemon:getStatus"),
  getMiningStatus: () => ipcRenderer.invoke("daemon:getMiningStatus"),
  getPeers:        () => ipcRenderer.invoke("daemon:getPeers"),
  isRunning:       () => ipcRenderer.invoke("daemon:isRunning"),

  // ── Daemon controls ──────────────────────────────────────────────────────────
  startDaemon: () => ipcRenderer.invoke("daemon:start"),
  stopDaemon:  () => ipcRenderer.invoke("daemon:stop"),

  // ── Mining controls ──────────────────────────────────────────────────────────
  startMining: (minerAddress: string, intensity: number) =>
    ipcRenderer.invoke("daemon:startMining", minerAddress, intensity),
  stopMining: () => ipcRenderer.invoke("daemon:stopMining"),

  // ── Config ───────────────────────────────────────────────────────────────────
  getConfig:  () => ipcRenderer.invoke("config:get"),
  saveConfig: (cfg: unknown) => ipcRenderer.invoke("config:save", cfg),

  // ── App info ─────────────────────────────────────────────────────────────────
  getInfo:       () => ipcRenderer.invoke("app:getInfo"),
  openDataDir:   () => ipcRenderer.invoke("app:openDataDir"),

  // ── JSON-RPC console ─────────────────────────────────────────────────────────
  rpc: (method: string, params: unknown[]) =>
    ipcRenderer.invoke("daemon:rpc", method, params),
});
