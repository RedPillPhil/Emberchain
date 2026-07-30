import path from "node:path";
import { fileURLToPath } from "node:url";
import { Blockchain } from "@workspace/chain-core";
import { createChainPersistenceHooks } from "./db";
import { broadcastBlock } from "./peers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataFile =
  process.env.CHAIN_DATA_FILE ??
  path.join(__dirname, "..", "..", "data", "chain.json");

export const chain = new Blockchain(dataFile, createChainPersistenceHooks());

// Broadcast every locally-mined block to all known peers.
chain.onBlock = (block, txs) => {
  broadcastBlock(block, txs).catch(() => {});
};
