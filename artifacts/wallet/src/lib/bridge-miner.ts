/**
 * Trigger the local bridge-miner daemon (PC only).
 * Requires scripts/miner/bridge-miner-daemon.mjs running on localhost:19747.
 */

const DEFAULT_PORT = 19747;

function daemonBase(): string {
  const port =
    (import.meta.env.VITE_BRIDGE_MINER_PORT as string | undefined)?.trim() || String(DEFAULT_PORT);
  return `http://127.0.0.1:${port}`;
}

export interface BridgeMinerStartOptions {
  node: string;
  address: string;
  txHash: string;
}

/** Ask the local PC daemon to mine until this bridge lock confirms. */
export async function triggerLocalBridgeMiner(
  opts: BridgeMinerStartOptions,
): Promise<{ ok: boolean; error?: string }> {
  const node = (opts.node || "https://emberchain.org").replace(/\/+$/, "");
  try {
    const res = await fetch(`${daemonBase()}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        node,
        address: opts.address,
        tx: opts.txHash,
      }),
      signal: AbortSignal.timeout(2500),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      return { ok: false, error: body.error ?? `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: "Bridge miner daemon not running on this PC",
    };
  }
}

export async function isBridgeMinerDaemonRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${daemonBase()}/health`, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return false;
    const body = (await res.json()) as { ok?: boolean };
    return body.ok === true;
  } catch {
    return false;
  }
}
