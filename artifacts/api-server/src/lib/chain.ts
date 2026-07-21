import path from "node:path";
import { fileURLToPath } from "node:url";
import { Blockchain } from "@workspace/chain-core";
import { createChainPersistenceHooks } from "./db";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Local file is kept as a fast synchronous backup / fallback on first boot.
// CHAIN_DATA_FILE env var lets a standalone node point to a custom snapshot path.
const dataFile = process.env.CHAIN_DATA_FILE ?? path.join(__dirname, "..", "..", "data", "chain.json");

export const chain = new Blockchain(dataFile, createChainPersistenceHooks());
