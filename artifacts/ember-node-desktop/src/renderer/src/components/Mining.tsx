import React, { useState } from "react";
import type { MiningStatus, AppConfig } from "../App";

interface Props {
  miningStatus: MiningStatus;
  config: AppConfig | null;
  onRefresh: () => void;
}

export default function Mining({ miningStatus, config, onRefresh }: Props) {
  const [minerAddress, setMinerAddress] = useState(config?.minerAddress ?? "");
  const [intensity, setIntensity] = useState(config?.miningIntensity ?? 2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function toggle() {
    setError("");
    setBusy(true);
    try {
      if (miningStatus.mining) {
        await window.emberNode.stopMining();
      } else {
        if (!minerAddress.match(/^0x[0-9a-fA-F]{40}$/)) {
          setError("Enter a valid 0x… miner address");
          return;
        }
        await window.emberNode.startMining(minerAddress, intensity);
      }
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const intensityLabels = ["", "Minimal", "Low", "Balanced", "High", "Aggressive", "", "", "", "", "Max"];

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Status header */}
      <div style={{
        background: "var(--bg2)", border: `1px solid ${miningStatus.mining ? "rgba(63,185,80,0.4)" : "var(--border)"}`,
        borderRadius: 8, padding: "20px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: miningStatus.mining ? "var(--green)" : "var(--text2)" }} />
            <span style={{ fontSize: 15, fontWeight: 600 }}>{miningStatus.mining ? "Mining Active" : "Mining Idle"}</span>
          </div>
          {miningStatus.mining && (
            <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--text2)" }}>
              {miningStatus.hashRate.toFixed(2)} H/s  ·  {miningStatus.sharesInRound} shares this round
            </span>
          )}
        </div>
        <div style={{ fontFamily: "var(--mono)", textAlign: "right" }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: "var(--accent)" }}>{miningStatus.blocksMined}</div>
          <div style={{ fontSize: 11, color: "var(--text2)" }}>blocks found</div>
        </div>
      </div>

      {/* Controls */}
      <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Mining Configuration
        </div>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, color: "var(--text2)" }}>Miner Address (receives block rewards)</span>
          <input
            value={minerAddress}
            onChange={(e) => setMinerAddress(e.target.value)}
            placeholder="0x..."
            disabled={miningStatus.mining}
            style={{
              background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 6,
              color: "var(--text)", fontFamily: "var(--mono)", fontSize: 12,
              padding: "8px 12px", outline: "none",
              opacity: miningStatus.mining ? 0.5 : 1,
            }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, color: "var(--text2)" }}>
            Intensity: <strong style={{ color: "var(--text)" }}>{intensityLabels[intensity] ?? intensity}</strong> ({intensity})
          </span>
          <input
            type="range" min={1} max={10} value={intensity}
            onChange={(e) => setIntensity(Number(e.target.value))}
            disabled={miningStatus.mining}
            style={{ accentColor: "var(--accent)", opacity: miningStatus.mining ? 0.5 : 1 }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text2)" }}>
            <span>1 — Minimal (laptop-friendly)</span>
            <span>10 — Max (full CPU)</span>
          </div>
        </label>

        {error && <span style={{ color: "var(--red)", fontSize: 12 }}>{error}</span>}

        <button
          onClick={() => void toggle()}
          disabled={busy}
          style={{
            padding: "10px 24px", borderRadius: 6, border: "none", cursor: busy ? "not-allowed" : "pointer",
            background: miningStatus.mining ? "rgba(248,81,73,0.15)" : "rgba(255,107,53,0.15)",
            color: miningStatus.mining ? "var(--red)" : "var(--accent)",
            border: `1px solid ${miningStatus.mining ? "rgba(248,81,73,0.4)" : "rgba(255,107,53,0.4)"}`,
            fontWeight: 600, fontSize: 13, transition: "all 0.15s",
            alignSelf: "flex-start",
          } as React.CSSProperties}
        >
          {busy ? "…" : miningStatus.mining ? "⏹ Stop Mining" : "▶ Start Mining"}
        </button>
      </div>

      {/* Pool stats */}
      <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, padding: "20px 24px" }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 14 }}>
          Pool Activity (Network-Wide)
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          {[
            { label: "Active Miners", value: miningStatus.activeMiners },
            { label: "Shares This Round", value: miningStatus.sharesInRound.toLocaleString() },
            { label: "Your Hash Rate", value: `${miningStatus.hashRate.toFixed(1)} H/s` },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ color: "var(--text2)", fontSize: 11, marginBottom: 4 }}>{label}</div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 20, fontWeight: 600 }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ color: "var(--text2)", fontSize: 11, lineHeight: 1.6 }}>
        <strong style={{ color: "var(--text)" }}>Note:</strong> Server-side mining runs inside the node process. For high-performance solo or pool mining, use the standalone <code style={{ background: "var(--bg3)", padding: "1px 4px", borderRadius: 3 }}>emberd</code> CLI or point external mining software at your RPC URL.
      </div>
    </div>
  );
}
