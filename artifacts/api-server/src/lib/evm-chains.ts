/**
 * EVM chain and token registry for P2P exchange payment verification.
 *
 * Verification reads chain state over plain JSON-RPC rather than a block explorer
 * API.  Etherscan retired every per-chain V1 endpoint (api.bscscan.com,
 * api.polygonscan.com, api.basescan.org, api.arbiscan.io) on 15 Aug 2025, and the
 * unified V2 API puts Base behind a paid plan.  RPC needs no key, no subscription,
 * and reads the chain directly instead of an explorer's index.
 *
 * Every RPC URL and confirmation count can be overridden by env var so an operator
 * can point at a private node without a code change.
 */

export interface EvmChainConfig {
  /** Stable identifier used in listings as the selected network name. */
  key: string;
  chainId: number;
  label: string;
  /** Tried in order; the first that answers wins. */
  rpcUrls: string[];
  confirmations: number;
}

function envList(name: string, fallback: string[]): string[] {
  const raw = (process.env[name] ?? "").trim();
  if (!raw) return fallback;
  const urls = raw.split(",").map((u) => u.trim()).filter(Boolean);
  return urls.length > 0 ? urls : fallback;
}

function envInt(name: string, fallback: number): number {
  const parsed = Number.parseInt((process.env[name] ?? "").trim(), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export const ETHEREUM: EvmChainConfig = {
  key: "Ethereum",
  chainId: 1,
  label: "Ethereum mainnet",
  rpcUrls: envList("ETH_RPC_URL", [
    "https://ethereum-rpc.publicnode.com",
    "https://eth.drpc.org",
    "https://eth.llamarpc.com",
  ]),
  confirmations: envInt("ETH_CONFIRMATIONS", 12),
};

export const BASE: EvmChainConfig = {
  key: "Base",
  chainId: 8453,
  label: "Base",
  rpcUrls: envList("BASE_RPC_URL", [
    "https://mainnet.base.org",
    "https://base-rpc.publicnode.com",
  ]),
  // ~2s blocks, so 30 confirmations is roughly a minute.
  confirmations: envInt("BASE_CONFIRMATIONS", 30),
};

export const ARBITRUM: EvmChainConfig = {
  key: "Arbitrum",
  chainId: 42161,
  label: "Arbitrum One",
  rpcUrls: envList("ARBITRUM_RPC_URL", [
    "https://arb1.arbitrum.io/rpc",
    "https://arbitrum-one-rpc.publicnode.com",
  ]),
  // ~0.25s blocks, so 120 confirmations is roughly 30 seconds.
  confirmations: envInt("ARBITRUM_CONFIRMATIONS", 120),
};

export const BSC: EvmChainConfig = {
  key: "BEP-20",
  chainId: 56,
  label: "BNB Smart Chain",
  rpcUrls: envList("BSC_RPC_URL", [
    "https://bsc-dataseed.binance.org",
    "https://bsc-rpc.publicnode.com",
  ]),
  confirmations: envInt("BSC_CONFIRMATIONS", 15),
};

export const POLYGON: EvmChainConfig = {
  key: "Polygon",
  chainId: 137,
  label: "Polygon",
  rpcUrls: envList("POLYGON_RPC_URL", [
    "https://polygon-bor-rpc.publicnode.com",
    "https://polygon.drpc.org",
  ]),
  confirmations: envInt("POLYGON_CONFIRMATIONS", 128),
};

export interface Erc20TokenConfig {
  symbol: string;
  chain: EvmChainConfig;
  address: string;
  /**
   * Decimals differ per deployment and getting this wrong is a money bug: USDT is
   * 6 decimals everywhere except BNB Smart Chain, where it is 18.  Treating BSC as
   * 6 would make the required amount 10^12 too small and accept dust as payment.
   */
  decimals: number;
}

/** Networks a seller may accept native ETH on. */
export const ETH_NETWORKS: Record<string, EvmChainConfig> = {
  [ETHEREUM.key]: ETHEREUM,
  [BASE.key]: BASE,
  [ARBITRUM.key]: ARBITRUM,
};

/** Networks a seller may accept USDT on, keyed by the listing's network name. */
export const USDT_NETWORKS: Record<string, Erc20TokenConfig> = {
  "ERC-20": {
    symbol: "USDT",
    chain: ETHEREUM,
    address: "0xdac17f958d2ee523a2206206994597c13d831ec7",
    decimals: 6,
  },
  "BEP-20": {
    symbol: "USDT",
    chain: BSC,
    address: "0x55d398326f99059ff775485246999027b3197955",
    decimals: 18,
  },
  Polygon: {
    symbol: "USDT",
    chain: POLYGON,
    address: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f",
    decimals: 6,
  },
  // Native USDT0 — Tether's official LayerZero OFT deployment on Arbitrum.
  Arbitrum: {
    symbol: "USDT",
    chain: ARBITRUM,
    address: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9",
    decimals: 6,
  },
};

/**
 * Networks a seller may accept USDC on.
 *
 * Base deliberately uses USDC rather than USDT: the only USDT on Base is a bridged
 * token that Tether explicitly disclaims, whereas this is Circle-issued native USDC.
 */
export const USDC_NETWORKS: Record<string, Erc20TokenConfig> = {
  Base: {
    symbol: "USDC",
    chain: BASE,
    address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    decimals: 6,
  },
  Arbitrum: {
    symbol: "USDC",
    chain: ARBITRUM,
    address: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
    decimals: 6,
  },
  Ethereum: {
    symbol: "USDC",
    chain: ETHEREUM,
    address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    decimals: 6,
  },
};

interface JsonRpcResponse<T> {
  result?: T;
  error?: { message?: string };
}

/**
 * Call a JSON-RPC method, falling back through the chain's configured endpoints.
 * Public RPCs rate-limit and go down; a single failure shouldn't fail a payment.
 */
export async function evmRpc<T>(
  chain: EvmChainConfig,
  method: string,
  params: unknown[],
): Promise<T> {
  const failures: string[] = [];
  for (const url of chain.rpcUrls) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as JsonRpcResponse<T>;
      if (json.error) throw new Error(json.error.message ?? "RPC error");
      return json.result as T;
    } catch (err) {
      // Record every endpoint rather than just the last one: reporting a single
      // failure hides which providers were tried and why each refused, which is
      // exactly what you need to know when a chain goes unreachable.
      const host = URL.canParse(url) ? new URL(url).host : url;
      failures.push(`${host}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new Error(
    `${chain.label} RPC unavailable — ${failures.join(" | ") || "no endpoint configured"}`,
  );
}
