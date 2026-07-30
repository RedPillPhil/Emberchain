import React, { useState, useEffect, useCallback } from "react";
import Overview from "./components/Overview";
import Mining from "./components/Mining";
import Network from "./components/Network";
import Console from "./components/Console";
import Settings from "./components/Settings";

declare global {
  interface Window {
    emberNode: {
      getStatus: () => Promise<NodeStatus>;
      getMiningStatus: () => Promise<MiningStatus>;
      getPeers: () => Promise<string[]>;
      isRunning: () => Promise<boolean>;
      startDaemon: () => Promise<void>;
      stopDaemon: () => Promise<void>;
      startMining: (addr: string, intensity: number) => Promise<void>;
      stopMining: () => Promise<void>;
      getConfig: () => Promise<AppConfig>;
      saveConfig: (cfg: AppConfig) => Promise<void>;
      getInfo: () => Promise<AppInfo>;
      openDataDir: () => Promise<void>;
      rpc: (method: string, params: unknown[]) => Promise<unknown>;
    };
  }
}

export interface NodeStatus {
  running: boolean;
  blockHeight: number;
  difficulty: string;
  peers: number;
  isSynced: boolean;
  bestPeerHeight: number;
}

export interface MiningStatus {
  mining: boolean;
  minerAddress: string | null;
  hashRate: number;
  activeMiners: number;
  sharesInRound: number;
  blocksMined: number;
}

export interface AppConfig {
  port: number;
  autoMine: boolean;
  minerAddress: string;
  miningIntensity: number;
  gentleSync: boolean;
  customPeers: string;
  autoStart: boolean;
  minimizeToTray: boolean;
}

export interface AppInfo {
  dataDir: string;
  port: number;
  rpcUrl: string;
  chainId: number;
}

type Tab = "overview" | "mining" | "network" | "console" | "settings";

export default function App() {
  const [tab, setTab] = useState<Tab>("overview");
  const [nodeStatus, setNodeStatus] = useState<NodeStatus>({
    running: false, blockHeight: 0, difficulty: "0", peers: 0, isSynced: false, bestPeerHeight: 0,
  });
  const [miningStatus, setMiningStatus] = useState<MiningStatus>({
    mining: false, minerAddress: null, hashRate: 0, activeMiners: 0, sharesInRound: 0, blocksMined: 0,
  });
  const [peers, setPeers] = useState<string[]>([]);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [info, setInfo] = useState<AppInfo | null>(null);

  const poll = useCallback(async () => {
    try {
      const [status, mining, peerList] = await Promise.all([
        window.emberNode.getStatus(),
        window.emberNode.getMiningStatus(),
        window.emberNode.getPeers(),
      ]);
      setNodeStatus(status);
      setMiningStatus(mining);
      setPeers(peerList);
    } catch { /* daemon starting */ }
  }, []);

  useEffect(() => {
    void poll();
    const id = setInterval(() => void poll(), 3000);
    return () => clearInterval(id);
  }, [poll]);

  useEffect(() => {
    Promise.all([window.emberNode.getConfig(), window.emberNode.getInfo()])
      .then(([cfg, inf]) => { setConfig(cfg); setInfo(inf); })
      .catch(() => {});
  }, []);

  const syncPct = nodeStatus.bestPeerHeight > 0
    ? Math.min(100, Math.round((nodeStatus.blockHeight / nodeStatus.bestPeerHeight) * 100))
    : (nodeStatus.blockHeight > 0 ? 100 : 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg)" }}>
      {/* Title bar / status strip */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "0 16px", height: 44,
        background: "var(--bg2)", borderBottom: "1px solid var(--border)",
        WebkitAppRegion: "drag" as React.CSSProperties["WebkitAppRegion"],
      }}>
        <span style={{ color: "var(--accent)", fontWeight: 700, fontSize: 14, letterSpacing: 1 }}>⬡ EMBER NODE</span>
        <div style={{ flex: 1 }} />
        {/* Sync progress */}
        {!nodeStatus.isSynced && nodeStatus.running && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 100, height: 4, background: "var(--bg3)", borderRadius: 2 }}>
              <div style={{ width: `${syncPct}%`, height: "100%", background: "var(--accent)", borderRadius: 2, transition: "width 0.5s" }} />
            </div>
            <span style={{ color: "var(--text2)", fontSize: 11 }}>{syncPct}%</span>
          </div>
        )}
        {/* Status dot */}
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: nodeStatus.running ? (nodeStatus.isSynced ? "var(--green)" : "var(--yellow)") : "var(--red)" }} />
          <span style={{ color: "var(--text2)", fontSize: 11 }}>
            {nodeStatus.running ? (nodeStatus.isSynced ? "Synced" : "Syncing") : "Stopped"}
          </span>
        </div>
        {/* Block height */}
        {nodeStatus.running && (
          <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text2)" }}>
            #{nodeStatus.blockHeight.toLocaleString()}
          </span>
        )}
        {/* Peer count */}
        {nodeStatus.running && (
          <span style={{ fontSize: 11, color: "var(--text2)" }}>
            {nodeStatus.peers} peer{nodeStatus.peers !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Navigation tabs */}
      <div style={{
        display: "flex", gap: 0,
        background: "var(--bg2)", borderBottom: "1px solid var(--border)",
        WebkitAppRegion: "no-drag" as React.CSSProperties["WebkitAppRegion"],
      }}>
        {(["overview", "mining", "network", "console", "settings"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "8px 16px", border: "none", background: "none", cursor: "pointer",
            color: tab === t ? "var(--text)" : "var(--text2)",
            borderBottom: tab === t ? "2px solid var(--accent)" : "2px solid transparent",
            fontSize: 13, fontWeight: tab === t ? 600 : 400, textTransform: "capitalize",
            transition: "color 0.15s",
          }}>
            {t === "overview" && "⬡ "}
            {t === "mining" && "⛏ "}
            {t === "network" && "⬡ "}
            {t === "console" && "> "}
            {t === "settings" && "⚙ "}
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {tab === "overview"  && <Overview nodeStatus={nodeStatus} miningStatus={miningStatus} info={info} />}
        {tab === "mining"    && <Mining miningStatus={miningStatus} config={config} onRefresh={poll} />}
        {tab === "network"   && <Network peers={peers} nodeStatus={nodeStatus} info={info} />}
        {tab === "console"   && <Console info={info} />}
        {tab === "settings"  && config && <Settings config={config} info={info} onSave={(cfg) => {
          void window.emberNode.saveConfig(cfg).then(() => setConfig(cfg));
        }} />}
      </div>
    </div>
  );
}
