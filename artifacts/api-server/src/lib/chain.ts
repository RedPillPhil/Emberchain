import path from "node:path";
import { fileURLToPath } from "node:url";
import { Blockchain } from "@workspace/chain-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataFile = path.join(__dirname, "..", "..", "data", "chain.json");

export const chain = new Blockchain(dataFile);
