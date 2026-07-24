/**
 * EmberChain node client with automatic peer discovery and failover.
 *
 * Discovery flow:
 *  1. Check user-set override node (skip height check — user knows what they want)
 *  2. Race all bootstrap + cached peers in parallel: fetch block height from each
 *  3. Pick the node with the highest block height (latency as tiebreaker)
 *  4. Background-fetch the winning node's peer list to grow the cache
 *
 * All API calls auto-failover: if the active node goes down mid-session,
 * the next call triggers re-discovery and retries on a new node.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Constants ──────────────────────────────────────────────────────────────
const BOOTSTRAP: string[] = [
  'https://emberchain.org',
  'https://emberchain.duckdns.org',
  'https://po-w-chain.replit.app',
];
const CACHE_NODE_KEY  = 'embr_node_url';
const CACHE_PEERS_KEY = 'embr_peers';
const OVERRIDE_KEY    = 'embr_node_override';
const CALL_TIMEOUT    = 8000;
const PROBE_TIMEOUT   = 4000;  // tight — we probe all in parallel

// ── Runtime state ──────────────────────────────────────────────────────────
let _activeNode: string | null = null;
let _cachedPeers: string[] = [];
let _discoverInFlight: Promise<string | null> | null = null;

// ── Helpers ────────────────────────────────────────────────────────────────
async function timedFetch(url: string, opts: RequestInit = {}, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Probe a node: returns its current block height and latency, or null if unreachable.
 * Uses /api/chain/status so we get height + health in a single round-trip.
 */
async function probeNode(base: string): Promise<{ height: number; latencyMs: number } | null> {
  const t0 = Date.now();
  try {
    const res = await timedFetch(`${base}/api/chain/status`, {}, PROBE_TIMEOUT);
    if (!res.ok) return null;
    const data = await res.json() as { height?: number };
    const height = typeof data.height === 'number' ? data.height : 0;
    return { height, latencyMs: Date.now() - t0 };
  } catch {
    return null;
  }
}

async function fetchPeerList(base: string): Promise<string[]> {
  try {
    const res = await timedFetch(`${base}/api/sync/peers`, {}, CALL_TIMEOUT);
    if (!res.ok) return [];
    const data = await res.json() as { peers?: string[] };
    return (data.peers ?? []).filter(Boolean);
  } catch {
    return [];
  }
}

// ── Peer discovery ─────────────────────────────────────────────────────────
export async function discoverNode(force = false): Promise<string | null> {
  // Already connected — do a quick liveness check (not a full re-probe)
  if (!force && _activeNode) {
    const probe = await probeNode(_activeNode);
    if (probe !== null) return _activeNode;
    _activeNode = null;
  }

  // Deduplicate concurrent discoveries
  if (_discoverInFlight) return _discoverInFlight;

  _discoverInFlight = (async (): Promise<string | null> => {
    try {
      // 1. User override — honour it unconditionally (user chose it deliberately)
      const override = await AsyncStorage.getItem(OVERRIDE_KEY).catch(() => null);
      if (override) {
        const probe = await probeNode(override);
        if (probe !== null) {
          _activeNode = override;
          return override;
        }
        // Override unreachable — fall through to auto-select
      }

      // 2. Race all candidates, pick the one with the highest block height
      const raw = await AsyncStorage.getItem(CACHE_PEERS_KEY).catch(() => null);
      const knownPeers: string[] = raw ? JSON.parse(raw) : [];
      const candidates = [...new Set([...BOOTSTRAP, ...knownPeers])];

      const probes = await Promise.all(
        candidates.map(async (url) => {
          const result = await probeNode(url);
          return result ? { url, height: result.height, latencyMs: result.latencyMs } : null;
        })
      );

      const live = probes
        .filter((p): p is { url: string; height: number; latencyMs: number } => p !== null)
        // Sort: highest block height first; latency as tiebreaker within same height
        .sort((a, b) => b.height - a.height || a.latencyMs - b.latencyMs);

      if (!live.length) return null;

      const best = live[0].url;
      _activeNode = best;
      await AsyncStorage.setItem(CACHE_NODE_KEY, best).catch(() => {});

      // 3. Grow peer cache in background
      fetchPeerList(best).then(async (peers) => {
        if (peers.length) {
          _cachedPeers = peers;
          await AsyncStorage.setItem(CACHE_PEERS_KEY, JSON.stringify(peers)).catch(() => {});
        }
      });

      return best;
    } finally {
      _discoverInFlight = null;
    }
  })();

  return _discoverInFlight;
}

// ── Core API call with auto-failover ───────────────────────────────────────
async function apiCall<T>(path: string, opts: RequestInit = {}): Promise<T> {
  let node = _activeNode ?? (await discoverNode());
  if (!node) throw new Error('No EMBR nodes reachable. Check your internet connection.');

  async function attempt(n: string): Promise<T> {
    const res = await timedFetch(`${n}/api${path}`, {
      headers: { 'Content-Type': 'application/json', ...opts.headers },
      ...opts,
    }, CALL_TIMEOUT);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const err = Object.assign(new Error(`${res.status}: ${body.slice(0, 200)}`), { status: res.status });
      throw err;
    }
    return res.json() as Promise<T>;
  }

  try {
    return await attempt(node);
  } catch (err: any) {
    // Don't retry client errors
    if (err?.status >= 400 && err?.status < 500) throw err;
    // Try a fresh node
    _activeNode = null;
    const fresh = await discoverNode(true);
    if (!fresh || fresh === node) throw err;
    return attempt(fresh);
  }
}

// ── Types ──────────────────────────────────────────────────────────────────
export type Wallet = { address: string; balance: string; nonce: number };
export type WalletSecret = Wallet & { privateKey: string; publicKey: string };
export type Transaction = {
  hash: string;
  from: string;
  to: string | null;
  value: string;
  nonce: number;
  status: 'pending' | 'success' | 'failed';
  blockNumber: number | null;
  createdAt: string;
  gasUsed: string | null;
  data?: string | null;
};
export type ChainStatus = {
  height: number;
  symbol: string;
  chainName: string;
  totalSupply: string;
  blockReward: string;
  pendingTransactionCount: number;
};

// ── Public client ──────────────────────────────────────────────────────────
export const nodeClient = {
  getActiveNode: () => _activeNode,
  getCachedPeers: () => _cachedPeers,

  getWallet: (address: string) =>
    apiCall<Wallet>(`/wallets/${encodeURIComponent(address)}`),

  getTransactions: (address: string, limit = 30) =>
    apiCall<Transaction[]>(`/transactions?address=${encodeURIComponent(address)}&limit=${limit}`),

  createWallet: () =>
    apiCall<WalletSecret>('/wallets', { method: 'POST', body: JSON.stringify({}) }),

  importWallet: (privateKey: string) =>
    apiCall<WalletSecret>('/wallets', { method: 'POST', body: JSON.stringify({ privateKey }) }),

  sendTransaction: (fromPrivateKey: string, to: string, value: string) =>
    apiCall<Transaction>('/transactions', {
      method: 'POST',
      body: JSON.stringify({ fromPrivateKey, to, value, gasLimit: '21000' }),
    }),

  getChainStatus: () => apiCall<ChainStatus>('/chain/status'),

  setOverride: async (url: string | null) => {
    if (url) await AsyncStorage.setItem(OVERRIDE_KEY, url);
    else await AsyncStorage.removeItem(OVERRIDE_KEY);
    _activeNode = null;
  },
  getOverride: () => AsyncStorage.getItem(OVERRIDE_KEY),
};
