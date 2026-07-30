import React, { useState } from "react";
import type { NodeStatus, AppInfo } from "../App";

interface Props {
  peers: string[];
  nodeStatus: NodeStatus;
  info: AppInfo | null;
}

export default function Network({ peers, nodeStatus, info }: Props) {
  const [newPeer, setNewPeer] = useState("");
  const [adding, setAdding] = useState(false);

  async function addPeer() {
    if (!newPeer.startsWith("http")) return;
    setAdding(true);
    try {
      await fetch(`http://127.0.0.1:${info?.port ?? 8545}/api/sync/peers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: newPeer.trim() }),
      });
      setNewPeer("");
    } catch { /* ignore */ } finally {
      setAdding(false);
    }
  }

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Summary */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {[
          { label: "Connected Peers", value: nodeStatus.peers },
          { label: "Best Peer Height", value: nodeStatus.bestPeerHeight.toLocaleString() },
          { label: "Our Height", value: nodeStatus.blockHeight.toLocaleString() },
        ].map(({ label, value }) => (
          <div key={label} style={{
            background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, padding: "14px 18px",
          }}>
            <div style={{ color: "var(--text2)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{label}</div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 22, fontWeight: 600 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Peer list */}
      <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
        <div style={{
          padding: "12px 18px", borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Peer Connections
          </span>
          <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text2)" }}>{peers.length} peers</span>
        </div>

        {peers.length === 0 ? (
          <div style={{ padding: "32px 18px", textAlign: "center", color: "var(--text2)" }}>
            {nodeStatus.running ? "Discovering peers…" : "Node not running"}
          </div>
        ) : (
          <div style={{ maxHeight: 280, overflowY: "auto" }}>
            {peers.map((peer) => (
              <div key={peer} style={{
                padding: "10px 18px", borderBottom: "1px solid var(--border)",
                display: "flex", alignItems: "center", gap: 10,
                fontSize: 12, fontFamily: "var(--mono)",
              }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green)", flexShrink: 0 }} />
                <span style={{ flex: 1, color: "var(--text2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{peer}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add peer */}
      <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, padding: "16px 18px" }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>
          Add Peer
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={newPeer}
            onChange={(e) => setNewPeer(e.target.value)}
            placeholder="https://peer.example.com"
            style={{
              flex: 1, background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 6,
              color: "var(--text)", fontFamily: "var(--mono)", fontSize: 12, padding: "8px 12px", outline: "none",
            }}
            onKeyDown={(e) => { if (e.key === "Enter") void addPeer(); }}
          />
          <button
            onClick={() => void addPeer()}
            disabled={adding || !newPeer.startsWith("http")}
            style={{
              padding: "8px 16px", borderRadius: 6, border: "1px solid var(--border)",
              background: "var(--bg3)", color: "var(--text)", cursor: "pointer", fontSize: 12,
            }}
          >
            {adding ? "…" : "Add"}
          </button>
        </div>
      </div>

      {/* Info */}
      {info && nodeStatus.running && (
        <div style={{ color: "var(--text2)", fontSize: 11, lineHeight: 1.7 }}>
          <strong style={{ color: "var(--text)" }}>Your node URL</strong> (share with other node operators so they can connect to you):{" "}
          {info.rpcUrl.replace("/api/rpc", "")} — only useful if your port is publicly accessible.
        </div>
      )}
    </div>
  );
}
