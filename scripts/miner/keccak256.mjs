/** Bundled keccak256 — no npm install required. Uses js-sha3 (MIT). */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sha3 = require("./vendor/sha3.cjs");

/** @param {Uint8Array} data */
export function keccak256(data) {
  return Uint8Array.from(sha3.keccak256.array(data));
}
