/**
 * Chain Scanner — discovers deployed contracts from EVM state + deployment txs.
 */

import { ethers } from "ethers";
import { chain } from "./chain";
import { upsertContractRecord, ensureContractTable, registryBackend } from "./contract-registry";
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

export interface RescanResult {
  discovered: number;
  scanned: number;
  storage: "postgres" | "file";
}

/** Scan EVM state + tx history for contract deployments. */
export async function rescanContracts(_force = false): Promise<RescanResult> {
  await chain.whenReady();

  const meta = new Map<string, { creator?: string; creatorTx?: string }>();

  // Primary: every address with bytecode in live chain state
  const codeAddrs = await chain.listContractAddresses();
  for (const addr of codeAddrs) {
    meta.set(addr.toLowerCase(), {});
  }

  // Secondary: contract-creation txs (derive address when metadata missing)
  const txs = await chain.listTransactions(undefined, 1_000_000);
  for (const tx of txs) {
    if (tx.to !== null || tx.status !== "success") continue;

    let addr = tx.contractAddress?.toLowerCase() ?? null;
    if (!addr) {
      try {
        addr = ethers.getCreateAddress({ from: tx.from, nonce: tx.nonce }).toLowerCase();
      } catch { continue; }
    }

    const code = await chain.getContractCode(addr);
    if (code === "0x" || code.length <= 2) continue;

    meta.set(addr, {
      creator:   tx.from?.toLowerCase(),
      creatorTx: tx.hash,
    });
  }

  let discovered = 0;
  for (const [addr, info] of meta) {
    const erc20 = await detectERC20(addr);
    await upsertContractRecord({
      address:     addr,
      isToken:     !!erc20,
      name:        erc20?.name        ?? null,
      symbol:      erc20?.symbol      ?? null,
      decimals:    erc20?.decimals    ?? null,
      totalSupply: erc20?.totalSupply ?? null,
      creator:     info.creator       ?? null,
      creatorTx:   info.creatorTx     ?? null,
    });
    discovered++;

    if (erc20) {
      logger.info(
        { address: addr, name: erc20.name, symbol: erc20.symbol },
        "[scanner] ERC-20 token indexed",
      );
    } else {
      logger.info({ address: addr }, "[scanner] contract indexed");
    }
  }

  if (discovered > 0) {
    logger.info({ discovered, storage: registryBackend() }, "[scanner] rescan complete");
  }

  return { discovered, scanned: meta.size, storage: registryBackend() };
}

async function scanOnce(): Promise<void> {
  await rescanContracts(false);
}

let _timer: ReturnType<typeof setInterval> | null = null;

export function startChainScanner(): void {
  if (_timer) return;

  ensureContractTable()
    .then(async () => {
      logger.info({ storage: registryBackend() }, "[scanner] starting contract registry");
      await rescanContracts(true);
    })
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
