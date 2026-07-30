import React, { useState, useRef, useEffect } from "react";
import type { AppInfo } from "../App";

interface ConsoleLine {
  id: number;
  type: "input" | "output" | "error";
  text: string;
}

const QUICK_COMMANDS = [
  { label: "Block number",   method: "eth_blockNumber",   params: [] },
  { label: "Chain ID",       method: "eth_chainId",       params: [] },
  { label: "Gas price",      method: "eth_gasPrice",      params: [] },
  { label: "Net version",    method: "net_version",       params: [] },
  { label: "Sync status",    method: "eth_syncing",       params: [] },
];

let idCounter = 0;

interface Props { info: AppInfo | null; }

export default function Console({ info }: Props) {
  const [input, setInput] = useState("");
  const [lines, setLines] = useState<ConsoleLine[]>([
    { id: idCounter++, type: "output", text: "// Emberchain JSON-RPC Console" },
    { id: idCounter++, type: "output", text: '// Type a method name or paste a full JSON request, then press Enter.' },
    { id: idCounter++, type: "output", text: '// Example: eth_blockNumber  or  {"method":"eth_getBalance","params":["0x...","latest"]}' },
    { id: idCounter++, type: "output", text: "" },
  ]);
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  function addLine(type: ConsoleLine["type"], text: string) {
    setLines((prev) => [...prev, { id: idCounter++, type, text }]);
  }

  async function run(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) return;

    addLine("input", `> ${trimmed}`);
    setHistory((prev) => [trimmed, ...prev.slice(0, 49)]);
    setHistIdx(-1);
    setInput("");

    let method = trimmed;
    let params: unknown[] = [];

    // Allow full JSON objects: {"method":"...", "params":[...]}
    if (trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed) as { method?: string; params?: unknown[] };
        method = parsed.method ?? trimmed;
        params = parsed.params ?? [];
      } catch {
        addLine("error", "Invalid JSON");
        return;
      }
    } else if (trimmed.includes("(")) {
      // method("arg1", "arg2") shorthand
      const m = trimmed.match(/^(\w+)\((.*)\)$/s);
      if (m) {
        method = m[1]!;
        try { params = JSON.parse(`[${m[2]}]`) as unknown[]; }
        catch { addLine("error", "Could not parse arguments"); return; }
      }
    }

    try {
      const result = await window.emberNode.rpc(method, params);
      addLine("output", JSON.stringify(result, null, 2));
    } catch (err) {
      addLine("error", err instanceof Error ? err.message : String(err));
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") { void run(input); return; }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.min(histIdx + 1, history.length - 1);
      setHistIdx(next);
      setInput(history[next] ?? "");
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = Math.max(histIdx - 1, -1);
      setHistIdx(next);
      setInput(next === -1 ? "" : (history[next] ?? ""));
    }
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Quick buttons */}
      <div style={{
        display: "flex", gap: 6, padding: "10px 16px", flexWrap: "wrap",
        borderBottom: "1px solid var(--border)", background: "var(--bg2)",
      }}>
        {QUICK_COMMANDS.map(({ label, method, params }) => (
          <button key={method} onClick={() => void run(params.length ? JSON.stringify({ method, params }) : method)} style={{
            padding: "4px 10px", borderRadius: 4, border: "1px solid var(--border)",
            background: "var(--bg3)", color: "var(--text2)", fontSize: 11, cursor: "pointer",
          }}>
            {label}
          </button>
        ))}
        {info && (
          <span style={{ marginLeft: "auto", fontFamily: "var(--mono)", fontSize: 11, color: "var(--text2)", alignSelf: "center" }}>
            {info.rpcUrl}
          </span>
        )}
      </div>

      {/* Output */}
      <div style={{
        flex: 1, overflowY: "auto", padding: "12px 16px",
        fontFamily: "var(--mono)", fontSize: 12, lineHeight: 1.7,
        background: "var(--bg)",
      }}>
        {lines.map((line) => (
          <div key={line.id} style={{
            color: line.type === "input" ? "var(--accent)" : line.type === "error" ? "var(--red)" : "var(--text2)",
            whiteSpace: "pre-wrap", wordBreak: "break-all",
          }}>
            {line.text}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 16px", borderTop: "1px solid var(--border)",
        background: "var(--bg2)",
      }}>
        <span style={{ color: "var(--accent)", fontFamily: "var(--mono)", fontSize: 13, flexShrink: 0 }}>❯</span>
        <input
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="eth_blockNumber  or  {&quot;method&quot;: &quot;eth_getBalance&quot;, &quot;params&quot;: [&quot;0x...&quot;, &quot;latest&quot;]}"
          style={{
            flex: 1, background: "none", border: "none", outline: "none",
            color: "var(--text)", fontFamily: "var(--mono)", fontSize: 12,
            caretColor: "var(--accent)",
          }}
        />
      </div>
    </div>
  );
}
