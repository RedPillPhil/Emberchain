import React, { useState } from "react";
import type { AppConfig, AppInfo } from "../App";

interface Props {
  config: AppConfig;
  info: AppInfo | null;
  onSave: (cfg: AppConfig) => void;
}

export default function Settings({ config, info, onSave }: Props) {
  const [form, setForm] = useState<AppConfig>({ ...config });
  const [saved, setSaved] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  function update<K extends keyof AppConfig>(key: K, value: AppConfig[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  async function save() {
    onSave(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function toggleNode() {
    setIsRunning(true);
    try {
      const running = await window.emberNode.isRunning();
      if (running) await window.emberNode.stopDaemon();
      else await window.emberNode.startDaemon();
    } finally {
      setIsRunning(false);
    }
  }

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
      <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--border)", fontSize: 12, fontWeight: 600, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{title}</div>
      <div style={{ padding: "18px", display: "flex", flexDirection: "column", gap: 14 }}>{children}</div>
    </div>
  );

  const Field = ({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) => (
    <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ fontSize: 12, color: "var(--text)", fontWeight: 500 }}>{label}</span>
      {sub && <span style={{ fontSize: 11, color: "var(--text2)" }}>{sub}</span>}
      {children}
    </label>
  );

  const inputStyle: React.CSSProperties = {
    background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 6,
    color: "var(--text)", fontSize: 12, padding: "8px 12px", outline: "none",
    fontFamily: "inherit",
  };

  const Toggle = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
    <div
      onClick={() => onChange(!checked)}
      style={{
        width: 36, height: 20, borderRadius: 10, cursor: "pointer",
        background: checked ? "var(--accent)" : "var(--border)",
        position: "relative", transition: "background 0.2s",
      }}
    >
      <div style={{
        position: "absolute", top: 3, left: checked ? 18 : 3,
        width: 14, height: 14, borderRadius: "50%", background: "#fff",
        transition: "left 0.2s",
      }} />
    </div>
  );

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Node control */}
      <Section title="Node Control">
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button onClick={() => void toggleNode()} disabled={isRunning} style={{
            padding: "9px 20px", borderRadius: 6, border: "1px solid var(--accent)",
            background: "rgba(255,107,53,0.1)", color: "var(--accent)",
            fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>
            {isRunning ? "…" : "Toggle Node (Start / Stop)"}
          </button>
          {info && <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text2)" }}>Port: {info.port}</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--text)", marginBottom: 2 }}>Start node automatically</div>
            <div style={{ fontSize: 11, color: "var(--text2)" }}>Launch the daemon when the app opens</div>
          </div>
          <Toggle checked={form.autoStart} onChange={(v) => update("autoStart", v)} />
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--text)", marginBottom: 2 }}>Minimize to tray on close</div>
            <div style={{ fontSize: 11, color: "var(--text2)" }}>Keep the node running in the system tray</div>
          </div>
          <Toggle checked={form.minimizeToTray} onChange={(v) => update("minimizeToTray", v)} />
        </div>
      </Section>

      {/* Network */}
      <Section title="Network">
        <Field label="RPC Port" sub="Default: 8545 (standard Ethereum RPC port)">
          <input type="number" value={form.port} onChange={(e) => update("port", Number(e.target.value))} style={inputStyle} />
        </Field>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--text)", marginBottom: 2 }}>Home-connection mode</div>
            <div style={{ fontSize: 11, color: "var(--text2)" }}>Smaller sync batches, sequential peer discovery — prevents bufferbloat on home routers</div>
          </div>
          <Toggle checked={form.gentleSync} onChange={(v) => update("gentleSync", v)} />
        </div>
        <Field label="Custom Seed Peers" sub="Comma-separated. Leave empty to use the default bootstrap nodes.">
          <input value={form.customPeers} onChange={(e) => update("customPeers", e.target.value)} placeholder="https://peer1.example.com, https://peer2.example.com" style={inputStyle} />
        </Field>
      </Section>

      {/* Mining */}
      <Section title="Mining">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--text)", marginBottom: 2 }}>Auto-mine on startup</div>
            <div style={{ fontSize: 11, color: "var(--text2)" }}>Start mining immediately when the node launches</div>
          </div>
          <Toggle checked={form.autoMine} onChange={(v) => update("autoMine", v)} />
        </div>
        <Field label="Default Miner Address" sub="Address that receives block rewards">
          <input value={form.minerAddress} onChange={(e) => update("minerAddress", e.target.value)} placeholder="0x..." style={{ ...inputStyle, fontFamily: "var(--mono)" }} />
        </Field>
        <Field label={`Mining Intensity: ${form.miningIntensity}`} sub="Higher values use more CPU">
          <input type="range" min={1} max={10} value={form.miningIntensity} onChange={(e) => update("miningIntensity", Number(e.target.value))} style={{ accentColor: "var(--accent)" }} />
        </Field>
      </Section>

      {/* Save */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={() => void save()} style={{
          padding: "9px 24px", borderRadius: 6, border: "none",
          background: "var(--accent)", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer",
        }}>
          Save Settings
        </button>
        {saved && <span style={{ color: "var(--green)", fontSize: 12 }}>✓ Saved — restart the node to apply changes</span>}
      </div>

      {info && (
        <div style={{ color: "var(--text2)", fontSize: 11, lineHeight: 1.7, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
          <strong style={{ color: "var(--text)" }}>Data directory:</strong> {info.dataDir}<br />
          Settings changes to port, peers, or sync mode require a node restart to take effect.
        </div>
      )}
    </div>
  );
}
