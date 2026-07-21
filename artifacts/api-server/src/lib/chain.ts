import path from "node:path";
import { fileURLToPath } from "node:url";
import { Blockchain } from "@workspace/chain-core";
import { createChainPersistenceHooks } from "./db";
import { broadcastBlock } from "./peers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Local file is kept as a fast synchronous backup / fallback on first boot.
// CHAIN_DATA_FILE env var lets a standalone node point to a custom snapshot path.
const dataFile = process.env.CHAIN_DATA_FILE ?? path.join(__dirname, "..", "..", "data", "chain.json");

export const chain = new Blockchain(dataFile, createChainPersistenceHooks());

// Broadcast every locally-mined block to known peers so the network stays in
// sync even when this node is the one finding blocks.
chain.onBlock = (block, txs) => {
  broadcastBlock(block, txs).catch(() => {});
};
