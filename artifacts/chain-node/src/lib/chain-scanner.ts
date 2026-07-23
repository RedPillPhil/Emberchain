/**
 * Chain Scanner — runs in chain-node, writes to the shared contract_registry table.
 * Scans all transactions to discover deployed ERC-20 contracts automatically.
 */

import { ethers } from "ethers";
import { chain } from "./chain";
import { upsertContractRecord, getContractRecord, ensureContractTable } from "./contract-registry";
import { logger } from "./logger";

const coder = ethers.AbiCoder.defaultAbiCoder();

async function callView(to: string, selector: string, types: string[]): Promise<unknown[] | null> {
  try {
    const result = await chain.callContract({ to, data: selector });
    if (!result.success || !result.returnData || result.returnData === "0x") return null;
    return coder.decode(types, result.returnData) as unknown[];
  } catch { return null; }
}

async function detectERC20(address: string): Promise<{
  name: string; symbol: string; decimals: number; totalSupply: string;
} | null> {
  const [nameR, symbolR, decimalsR, supplyR] = await Promise.all([
    callView(address, "0x06fdde03", ["string"]),
    callView(address, "0x95d89b41", ["string"]),
    callView(address, "0x313ce567", ["uint8"]),
    callView(address, "0x18160ddd", ["uint256"]),
  ]);
  if (!nameR || !symbolR) return null;
  return {
    name:        String(nameR[0]),
    symbol:      String(symbolR[0]),
    decimals:    decimalsR ? Number(decimalsR[0]) : 18,
    totalSupply: supplyR  ? String(supplyR[0])    : "0",
  };
}

const indexed = new Set<string>();

async function scanOnce(): Promise<void> {
  const txs = await chain.listTransactions(undefined, 1_000_000);
  const deployments = txs.filter(
    (tx) => tx.to === null && tx.status === "success" && tx.contractAddress,
  );
  if (deployments.length === 0) return;

  let added = 0;
  for (const tx of deployments) {
    const addr = tx.contractAddress!.toLowerCase();
    if (indexed.has(addr)) continue;
    const existing = await getContractRecord(addr);
    if (existing && (existing.isToken || existing.name)) { indexed.add(addr); continue; }

    const erc20 = await detectERC20(addr);
    await upsertContractRecord({
      address:     addr,
      isToken:     !!erc20,
      name:        erc20?.name        ?? null,
      symbol:      erc20?.symbol      ?? null,
      decimals:    erc20?.decimals    ?? null,
      totalSupply: erc20?.totalSupply ?? null,
      creator:     tx.from?.toLowerCase() ?? null,
      creatorTx:   tx.hash,
    });
    indexed.add(addr);
    added++;

    if (erc20) {
      logger.info(
        { address: addr, name: erc20.name, symbol: erc20.symbol },
        "[scanner] ERC-20 token discovered",
      );
    }
  }
  if (added > 0) logger.info({ discovered: added }, "[scanner] scan complete");
}

let _timer: ReturnType<typeof setInterval> | null = null;

export function startChainScanner(): void {
  if (_timer) return;
  if (!process.env.DATABASE_URL) {
    logger.info("[scanner] no database configured — contract registry disabled");
    return;
  }
  ensureContractTable()
    .then(() => scanOnce())
    .catch((err: Error) => logger.warn({ err: err.message }, "[scanner] initial scan error"));
  _timer = setInterval(() => {
    scanOnce().catch((err: Error) =>
      logger.warn({ err: err.message }, "[scanner] periodic scan error"),
    );
  }, 30_000);
}

export function stopChainScanner(): void {
  if (_timer) { clearInterval(_timer); _timer = null; }
}
