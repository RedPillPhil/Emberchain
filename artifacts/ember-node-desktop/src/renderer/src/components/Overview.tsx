import React from "react";
import type { NodeStatus, MiningStatus, AppInfo } from "../App";

interface Props {
  nodeStatus: NodeStatus;
  miningStatus: MiningStatus;
  info: AppInfo | null;
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{
      background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8,
      padding: "16px 20px", display: "flex", flexDirection: "column", gap: 4,
    }}>
      <span style={{ color: "var(--text2)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
      <span style={{ fontFamily: "var(--mono)", fontSize: 22, fontWeight: 600, color: color ?? "var(--text)" }}>{value}</span>
      {sub && <span style={{ color: "var(--text2)", fontSize: 11 }}>{sub}</span>}
    </div>
  );
}

export default function Overview({ nodeStatus, miningStatus, info }: Props) {
  const syncPct = nodeStatus.bestPeerHeight > 0
    ? Math.min(100, Math.round((nodeStatus.blockHeight / nodeStatus.bestPeerHeight) * 100))
    : (nodeStatus.blockHeight > 0 ? 100 : 0);

  const blocksRemaining = Math.max(0, nodeStatus.bestPeerHeight - nodeStatus.blockHeight);

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Node status banner */}
      {!nodeStatus.running && (
        <div style={{
          background: "rgba(248,81,73,0.1)", border: "1px solid rgba(248,81,73,0.3)",
          borderRadius: 8, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10,
        }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--red)" }} />
          <span style={{ color: "var(--red)", fontWeight: 500 }}>Node is not running</span>
          <span style={{ color: "var(--text2)" }}>— go to Settings and click Start Node</span>
        </div>
      )}

      {nodeStatus.running && !nodeStatus.isSynced && (
        <div style={{
          background: "rgba(210,153,34,0.1)", border: "1px solid rgba(210,153,34,0.3)",
          borderRadius: 8, padding: "12px 16px",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ color: "var(--yellow)", fontWeight: 500 }}>Syncing blockchain…</span>
            <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--yellow)" }}>
              {syncPct}% — {blocksRemaining.toLocaleString()} blocks remaining
            </span>
          </div>
          <div style={{ height: 4, background: "var(--bg3)", borderRadius: 2 }}>
            <div style={{ width: `${syncPct}%`, height: "100%", background: "var(--yellow)", borderRadius: 2, transition: "width 0.5s" }} />
          </div>
        </div>
      )}

      {/* Stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
        <StatCard label="Block Height" value={nodeStatus.blockHeight.toLocaleString()} sub={nodeStatus.isSynced ? "fully synced" : `of ${nodeStatus.bestPeerHeight.toLocaleString()}`} />
        <StatCard label="Connected Peers" value={nodeStatus.peers} sub="active connections" />
        <StatCard label="Mining" value={miningStatus.mining ? "Active" : "Idle"} color={miningStatus.mining ? "var(--green)" : "var(--text2)"} sub={miningStatus.mining ? `${miningStatus.hashRate.toFixed(1)} H/s` : "not mining"} />
        <StatCard label="Blocks Mined" value={miningStatus.blocksMined} sub="this session" />
        <StatCard label="Shares This Round" value={miningStatus.sharesInRound.toLocaleString()} sub={`${miningStatus.activeMiners} active miner${miningStatus.activeMiners !== 1 ? "s" : ""}`} />
        <StatCard label="Chain ID" value="7773" sub="Emberchain mainnet" />
      </div>

      {/* RPC info box */}
      {info && nodeStatus.running && (
        <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, padding: "16px 20px" }}>
          <div style={{ color: "var(--text2)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>
            MetaMask / Wallet Connection
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: "8px 12px", fontFamily: "var(--mono)", fontSize: 12 }}>
            {[
              ["Network Name", "Emberchain"],
              ["RPC URL", info.rpcUrl],
              ["Chain ID", "7773"],
              ["Symbol", "EMBR"],
              ["Explorer", "https://emberchain.org"],
            ].map(([k, v]) => (
              <React.Fragment key={k}>
                <span style={{ color: "var(--text2)" }}>{k}</span>
                <span style={{ color: "var(--accent2)" }}>{v}</span>
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      {/* Data dir */}
      {info && (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: "var(--text2)", fontSize: 11 }}>Data directory:</span>
          <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text2)" }}>{info.dataDir}</span>
          <button onClick={() => window.emberNode.openDataDir()} style={{
            background: "none", border: "1px solid var(--border)", borderRadius: 4,
            color: "var(--text2)", fontSize: 11, padding: "2px 8px", cursor: "pointer",
          }}>Open</button>
        </div>
      )}
    </div>
  );
}
