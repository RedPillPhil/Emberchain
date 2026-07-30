import path from "node:path";
import { mkdirSync } from "node:fs";
import { Blockchain } from "@workspace/chain-core";
import { createChainPersistenceHooks } from "./db.js";
import { broadcastBlock } from "./peers.js";
import { daemonConfig } from "./config.js";

// Ensure the data directory exists before chain-core tries to write chain.json
mkdirSync(daemonConfig.dataDir, { recursive: true });

const dataFile = path.join(daemonConfig.dataDir, "chain.json");

export const chain = new Blockchain(dataFile, createChainPersistenceHooks());

// Broadcast every locally-mined block to all known peers.
chain.onBlock = (block, txs) => {
  broadcastBlock(block, txs).catch(() => {});
};
