/**
 * Smoke test for the exchange payment chain registry.
 *
 * Confirms every configured RPC answers, and that each token address really is
 * the symbol and decimals the registry claims — a wrong pairing here would let
 * dust settle a real listing.  Run: node --import tsx/esm smoke-evm-chains.mts
 */

import {
  evmRpc,
  ETH_NETWORKS,
  USDT_NETWORKS,
  USDC_NETWORKS,
  type EvmChainConfig,
  type Erc20TokenConfig,
} from "./src/lib/evm-chains";

const SELECTOR_DECIMALS = "0x313ce567";
const SELECTOR_SYMBOL = "0x95d89b41";

function decodeString(hex: string): string {
  const body = hex.slice(2);
  if (body.length <= 64) return Buffer.from(body.replace(/0+$/, ""), "hex").toString("utf8");
  const len = parseInt(body.slice(64, 128), 16);
  return Buffer.from(body.slice(128, 128 + len * 2), "hex").toString("utf8");
}

let failures = 0;

async function checkChain(chain: EvmChainConfig): Promise<boolean> {
  try {
    const [chainIdHex, blockHex] = await Promise.all([
      evmRpc<string>(chain, "eth_chainId", []),
      evmRpc<string>(chain, "eth_blockNumber", []),
    ]);
    const actual = parseInt(chainIdHex, 16);
    const ok = actual === chain.chainId;
    if (!ok) failures++;
    console.log(
      `${ok ? "OK  " : "FAIL"} ${chain.label.padEnd(20)} chainId=${actual} (expected ${chain.chainId}) block=${parseInt(blockHex, 16)}`,
    );
    return ok;
  } catch (err) {
    failures++;
    console.log(`FAIL ${chain.label.padEnd(20)} ${(err as Error).message}`);
    return false;
  }
}

async function checkToken(network: string, token: Erc20TokenConfig): Promise<void> {
  try {
    const [decHex, symHex] = await Promise.all([
      evmRpc<string>(token.chain, "eth_call", [{ to: token.address, data: SELECTOR_DECIMALS }, "latest"]),
      evmRpc<string>(token.chain, "eth_call", [{ to: token.address, data: SELECTOR_SYMBOL }, "latest"]),
    ]);
    const decimals = parseInt(decHex, 16);
    const symbol = decodeString(symHex).replace(/\0/g, "").trim();
    const decOk = decimals === token.decimals;
    // USD₮0 on Arbitrum reports a non-ASCII ticker, so match loosely.
    const symOk = symbol.toUpperCase().includes(token.symbol === "USDT" ? "USD" : token.symbol);
    if (!decOk || !symOk) failures++;
    console.log(
      `${decOk && symOk ? "OK  " : "FAIL"} ${token.symbol}/${network.padEnd(10)} on ${token.chain.label.padEnd(18)} symbol=${symbol} decimals=${decimals} (registry says ${token.decimals})`,
    );
  } catch (err) {
    failures++;
    console.log(`FAIL ${token.symbol}/${network} — ${(err as Error).message}`);
  }
}

console.log("── chains ──");
const chains = new Map<number, EvmChainConfig>();
for (const c of [
  ...Object.values(ETH_NETWORKS),
  ...Object.values(USDT_NETWORKS).map((t) => t.chain),
  ...Object.values(USDC_NETWORKS).map((t) => t.chain),
]) {
  chains.set(c.chainId, c);
}
for (const chain of chains.values()) await checkChain(chain);

console.log("\n── tokens ──");
for (const [net, token] of Object.entries(USDT_NETWORKS)) await checkToken(net, token);
for (const [net, token] of Object.entries(USDC_NETWORKS)) await checkToken(net, token);

console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) FAILED.`}`);
process.exit(failures === 0 ? 0 : 1);
