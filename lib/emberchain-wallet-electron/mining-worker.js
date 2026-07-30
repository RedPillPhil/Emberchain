"use strict";

// node_modules/.pnpm/@noble+hashes@1.8.0/node_modules/@noble/hashes/esm/_u64.js
var U32_MASK64 = /* @__PURE__ */ BigInt(2 ** 32 - 1);
var _32n = /* @__PURE__ */ BigInt(32);
function fromBig(n, le = false) {
  if (le)
    return { h: Number(n & U32_MASK64), l: Number(n >> _32n & U32_MASK64) };
  return { h: Number(n >> _32n & U32_MASK64) | 0, l: Number(n & U32_MASK64) | 0 };
}
function split(lst, le = false) {
  const len = lst.length;
  let Ah = new Uint32Array(len);
  let Al = new Uint32Array(len);
  for (let i = 0; i < len; i++) {
    const { h, l } = fromBig(lst[i], le);
    [Ah[i], Al[i]] = [h, l];
  }
  return [Ah, Al];
}
var rotlSH = (h, l, s) => h << s | l >>> 32 - s;
var rotlSL = (h, l, s) => l << s | h >>> 32 - s;
var rotlBH = (h, l, s) => l << s - 32 | h >>> 64 - s;
var rotlBL = (h, l, s) => h << s - 32 | l >>> 64 - s;

// node_modules/.pnpm/@noble+hashes@1.8.0/node_modules/@noble/hashes/esm/utils.js
function isBytes(a) {
  return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array";
}
function anumber(n) {
  if (!Number.isSafeInteger(n) || n < 0)
    throw new Error("positive integer expected, got " + n);
}
function abytes(b, ...lengths) {
  if (!isBytes(b))
    throw new Error("Uint8Array expected");
  if (lengths.length > 0 && !lengths.includes(b.length))
    throw new Error("Uint8Array expected of length " + lengths + ", got length=" + b.length);
}
function aexists(instance, checkFinished = true) {
  if (instance.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (checkFinished && instance.finished)
    throw new Error("Hash#digest() has already been called");
}
function aoutput(out, instance) {
  abytes(out);
  const min = instance.outputLen;
  if (out.length < min) {
    throw new Error("digestInto() expects output buffer of length at least " + min);
  }
}
function u32(arr) {
  return new Uint32Array(arr.buffer, arr.byteOffset, Math.floor(arr.byteLength / 4));
}
function clean(...arrays) {
  for (let i = 0; i < arrays.length; i++) {
    arrays[i].fill(0);
  }
}
var isLE = /* @__PURE__ */ (() => new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68)();
function byteSwap(word) {
  return word << 24 & 4278190080 | word << 8 & 16711680 | word >>> 8 & 65280 | word >>> 24 & 255;
}
function byteSwap32(arr) {
  for (let i = 0; i < arr.length; i++) {
    arr[i] = byteSwap(arr[i]);
  }
  return arr;
}
var swap32IfBE = isLE ? (u) => u : byteSwap32;
function utf8ToBytes(str) {
  if (typeof str !== "string")
    throw new Error("string expected");
  return new Uint8Array(new TextEncoder().encode(str));
}
function toBytes(data) {
  if (typeof data === "string")
    data = utf8ToBytes(data);
  abytes(data);
  return data;
}
var Hash = class {
};
function createHasher(hashCons) {
  const hashC = (msg) => hashCons().update(toBytes(msg)).digest();
  const tmp = hashCons();
  hashC.outputLen = tmp.outputLen;
  hashC.blockLen = tmp.blockLen;
  hashC.create = () => hashCons();
  return hashC;
}

// node_modules/.pnpm/@noble+hashes@1.8.0/node_modules/@noble/hashes/esm/sha3.js
var _0n = BigInt(0);
var _1n = BigInt(1);
var _2n = BigInt(2);
var _7n = BigInt(7);
var _256n = BigInt(256);
var _0x71n = BigInt(113);
var SHA3_PI = [];
var SHA3_ROTL = [];
var _SHA3_IOTA = [];
for (let round = 0, R = _1n, x = 1, y = 0; round < 24; round++) {
  [x, y] = [y, (2 * x + 3 * y) % 5];
  SHA3_PI.push(2 * (5 * y + x));
  SHA3_ROTL.push((round + 1) * (round + 2) / 2 % 64);
  let t = _0n;
  for (let j = 0; j < 7; j++) {
    R = (R << _1n ^ (R >> _7n) * _0x71n) % _256n;
    if (R & _2n)
      t ^= _1n << (_1n << /* @__PURE__ */ BigInt(j)) - _1n;
  }
  _SHA3_IOTA.push(t);
}
var IOTAS = split(_SHA3_IOTA, true);
var SHA3_IOTA_H = IOTAS[0];
var SHA3_IOTA_L = IOTAS[1];
var rotlH = (h, l, s) => s > 32 ? rotlBH(h, l, s) : rotlSH(h, l, s);
var rotlL = (h, l, s) => s > 32 ? rotlBL(h, l, s) : rotlSL(h, l, s);
function keccakP(s, rounds = 24) {
  const B = new Uint32Array(5 * 2);
  for (let round = 24 - rounds; round < 24; round++) {
    for (let x = 0; x < 10; x++)
      B[x] = s[x] ^ s[x + 10] ^ s[x + 20] ^ s[x + 30] ^ s[x + 40];
    for (let x = 0; x < 10; x += 2) {
      const idx1 = (x + 8) % 10;
      const idx0 = (x + 2) % 10;
      const B0 = B[idx0];
      const B1 = B[idx0 + 1];
      const Th = rotlH(B0, B1, 1) ^ B[idx1];
      const Tl = rotlL(B0, B1, 1) ^ B[idx1 + 1];
      for (let y = 0; y < 50; y += 10) {
        s[x + y] ^= Th;
        s[x + y + 1] ^= Tl;
      }
    }
    let curH = s[2];
    let curL = s[3];
    for (let t = 0; t < 24; t++) {
      const shift = SHA3_ROTL[t];
      const Th = rotlH(curH, curL, shift);
      const Tl = rotlL(curH, curL, shift);
      const PI = SHA3_PI[t];
      curH = s[PI];
      curL = s[PI + 1];
      s[PI] = Th;
      s[PI + 1] = Tl;
    }
    for (let y = 0; y < 50; y += 10) {
      for (let x = 0; x < 10; x++)
        B[x] = s[y + x];
      for (let x = 0; x < 10; x++)
        s[y + x] ^= ~B[(x + 2) % 10] & B[(x + 4) % 10];
    }
    s[0] ^= SHA3_IOTA_H[round];
    s[1] ^= SHA3_IOTA_L[round];
  }
  clean(B);
}
var Keccak = class _Keccak extends Hash {
  // NOTE: we accept arguments in bytes instead of bits here.
  constructor(blockLen, suffix, outputLen, enableXOF = false, rounds = 24) {
    super();
    this.pos = 0;
    this.posOut = 0;
    this.finished = false;
    this.destroyed = false;
    this.enableXOF = false;
    this.blockLen = blockLen;
    this.suffix = suffix;
    this.outputLen = outputLen;
    this.enableXOF = enableXOF;
    this.rounds = rounds;
    anumber(outputLen);
    if (!(0 < blockLen && blockLen < 200))
      throw new Error("only keccak-f1600 function is supported");
    this.state = new Uint8Array(200);
    this.state32 = u32(this.state);
  }
  clone() {
    return this._cloneInto();
  }
  keccak() {
    swap32IfBE(this.state32);
    keccakP(this.state32, this.rounds);
    swap32IfBE(this.state32);
    this.posOut = 0;
    this.pos = 0;
  }
  update(data) {
    aexists(this);
    data = toBytes(data);
    abytes(data);
    const { blockLen, state } = this;
    const len = data.length;
    for (let pos = 0; pos < len; ) {
      const take = Math.min(blockLen - this.pos, len - pos);
      for (let i = 0; i < take; i++)
        state[this.pos++] ^= data[pos++];
      if (this.pos === blockLen)
        this.keccak();
    }
    return this;
  }
  finish() {
    if (this.finished)
      return;
    this.finished = true;
    const { state, suffix, pos, blockLen } = this;
    state[pos] ^= suffix;
    if ((suffix & 128) !== 0 && pos === blockLen - 1)
      this.keccak();
    state[blockLen - 1] ^= 128;
    this.keccak();
  }
  writeInto(out) {
    aexists(this, false);
    abytes(out);
    this.finish();
    const bufferOut = this.state;
    const { blockLen } = this;
    for (let pos = 0, len = out.length; pos < len; ) {
      if (this.posOut >= blockLen)
        this.keccak();
      const take = Math.min(blockLen - this.posOut, len - pos);
      out.set(bufferOut.subarray(this.posOut, this.posOut + take), pos);
      this.posOut += take;
      pos += take;
    }
    return out;
  }
  xofInto(out) {
    if (!this.enableXOF)
      throw new Error("XOF is not possible for this instance");
    return this.writeInto(out);
  }
  xof(bytes) {
    anumber(bytes);
    return this.xofInto(new Uint8Array(bytes));
  }
  digestInto(out) {
    aoutput(out, this);
    if (this.finished)
      throw new Error("digest() was already called");
    this.writeInto(out);
    this.destroy();
    return out;
  }
  digest() {
    return this.digestInto(new Uint8Array(this.outputLen));
  }
  destroy() {
    this.destroyed = true;
    clean(this.state);
  }
  _cloneInto(to) {
    const { blockLen, suffix, outputLen, rounds, enableXOF } = this;
    to || (to = new _Keccak(blockLen, suffix, outputLen, enableXOF, rounds));
    to.state32.set(this.state32);
    to.pos = this.pos;
    to.posOut = this.posOut;
    to.finished = this.finished;
    to.rounds = rounds;
    to.suffix = suffix;
    to.outputLen = outputLen;
    to.enableXOF = enableXOF;
    to.destroyed = this.destroyed;
    return to;
  }
};
var gen = (suffix, blockLen, outputLen) => createHasher(() => new Keccak(blockLen, suffix, outputLen));
var keccak_224 = /* @__PURE__ */ (() => gen(1, 144, 224 / 8))();
var keccak_256 = /* @__PURE__ */ (() => gen(1, 136, 256 / 8))();
var keccak_384 = /* @__PURE__ */ (() => gen(1, 104, 384 / 8))();
var keccak_512 = /* @__PURE__ */ (() => gen(1, 72, 512 / 8))();

// node_modules/.pnpm/@noble+hashes@1.8.0/node_modules/@noble/hashes/esm/_assert.js
var abytes2 = abytes;

// node_modules/.pnpm/ethereum-cryptography@3.2.0/node_modules/ethereum-cryptography/esm/utils.js
function wrapHash(hash) {
  return (msg) => {
    abytes2(msg);
    return hash(msg);
  };
}

// node_modules/.pnpm/ethereum-cryptography@3.2.0/node_modules/ethereum-cryptography/esm/keccak.js
var keccak224 = wrapHash(keccak_224);
var keccak256 = (() => {
  const k = wrapHash(keccak_256);
  k.create = keccak_256.create;
  return k;
})();
var keccak384 = wrapHash(keccak_384);
var keccak512 = wrapHash(keccak_512);

// lib/emberchain-miner-electron/src/worker.ts
var import_worker_threads = require("worker_threads");
var { nodeUrl, address, intensity } = import_worker_threads.workerData;
var BATCH_SIZES = {
  1: 300,
  2: 1500,
  3: 6e3,
  4: 2e4,
  5: 6e4,
  6: 12e4,
  7: 3e5,
  8: 6e5,
  9: 12e5,
  10: 2e6
};
var BATCH_SIZE = BATCH_SIZES[intensity] ?? 6e3;
var MAX_PER_TPL = 1e7;
var enc = new TextEncoder();
function encodeHeader(h, nonce) {
  return enc.encode(JSON.stringify({
    number: h.number,
    parentHash: h.parentHash,
    timestamp: h.timestamp,
    miner: h.miner,
    difficulty: h.difficulty,
    transactionsRoot: h.transactionsRoot,
    nonce: nonce.toString()
  }));
}
function hashHeader(h, nonce) {
  const bytes = keccak256(encodeHeader(h, nonce));
  const hex = "0x" + Buffer.from(bytes).toString("hex");
  let value = 0n;
  for (const b of bytes) value = value << 8n | BigInt(b);
  return { hex, value };
}
function randomNonce() {
  const hi = Math.floor(Math.random() * 16777216);
  const lo = Math.floor(Math.random() * 16777216);
  return BigInt(hi) << 24n | BigInt(lo);
}
var base = nodeUrl.replace(/\/api\/?$/, "");
async function fetchTemplate() {
  const r = await fetch(`${base}/api/mining/template?minerAddress=${address}`, {
    signal: AbortSignal.timeout(1e4)
  });
  if (!r.ok) throw new Error(`Template fetch failed: ${r.status}`);
  return r.json();
}
async function submitShare(header, nonce) {
  const r = await fetch(`${base}/api/mining/share`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ minerAddress: address, header, nonce })
  });
  return r.json();
}
async function submitBlock(header, nonce, blockHash) {
  const r = await fetch(`${base}/api/mining/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ minerAddress: address, header, nonce, blockHash, pendingTxHashes: [] })
  });
  if (r.status === 409) return { stale: true };
  return r.json();
}
async function fetchStatus() {
  try {
    const r = await fetch(`${base}/api/chain/status`, {
      signal: AbortSignal.timeout(8e3)
    });
    if (r.ok) return r.json();
  } catch {
  }
  return null;
}
var running = true;
var totalShares = 0;
var totalBlocks = 0;
import_worker_threads.parentPort.on("message", (msg) => {
  if (msg === "stop") running = false;
});
async function mine() {
  import_worker_threads.parentPort.postMessage({ type: "status", msg: "Connecting to node\u2026" });
  const status = await fetchStatus();
  if (status) import_worker_threads.parentPort.postMessage({ type: "network", data: status });
  let lastStatusFetch = Date.now();
  let miningStarted = false;
  while (running) {
    let template;
    try {
      template = await fetchTemplate();
    } catch (err) {
      import_worker_threads.parentPort.postMessage({ type: "warn", msg: err.message });
      await new Promise((r) => setTimeout(r, 2e3));
      continue;
    }
    if (!miningStarted) {
      miningStarted = true;
      import_worker_threads.parentPort.postMessage({ type: "mining_started" });
    }
    const { header, target, shareTarget } = template;
    const blockTarget = BigInt(target);
    const shareTargetBig = BigInt(shareTarget);
    let nonce = randomNonce();
    let hashCount = 0;
    let batchStart = Date.now();
    let batchHashes = 0;
    let templateDone = false;
    while (!templateDone && running) {
      for (let i = 0; i < BATCH_SIZE && running; i++) {
        const { hex, value } = hashHeader(header, nonce);
        hashCount++;
        batchHashes++;
        if (value <= blockTarget) {
          const result = await submitBlock(header, nonce.toString(), hex);
          if (!("stale" in result)) {
            totalBlocks++;
            import_worker_threads.parentPort.postMessage({ type: "block", number: result.number, totalBlocks });
          } else {
            import_worker_threads.parentPort.postMessage({ type: "stale" });
          }
          templateDone = true;
          break;
        }
        if (value <= shareTargetBig) {
          submitShare(header, nonce.toString()).then((r) => {
            if (r.accepted) {
              totalShares++;
              import_worker_threads.parentPort.postMessage({ type: "share", totalShares });
            }
            if (r.blockFound) {
              totalBlocks++;
              import_worker_threads.parentPort.postMessage({ type: "block", number: void 0, totalBlocks });
            }
          }).catch(() => {
          });
        }
        nonce++;
      }
      if (!templateDone) {
        const elapsedMs = Date.now() - batchStart;
        if (elapsedMs > 0) {
          import_worker_threads.parentPort.postMessage({
            type: "hashrate",
            hashrate: Math.round(batchHashes / elapsedMs * 1e3),
            blockNumber: header.number,
            difficulty: header.difficulty
          });
          batchStart = Date.now();
          batchHashes = 0;
        }
        if (hashCount >= MAX_PER_TPL) templateDone = true;
        if (Date.now() - lastStatusFetch > 15e3) {
          lastStatusFetch = Date.now();
          fetchStatus().then((s) => {
            if (s) import_worker_threads.parentPort.postMessage({ type: "network", data: s });
          });
        }
        await new Promise((r) => setImmediate(r));
      }
    }
  }
  import_worker_threads.parentPort.postMessage({ type: "stopped" });
}
mine().catch((err) => import_worker_threads.parentPort.postMessage({ type: "error", msg: err.message }));
/*! Bundled license information:

@noble/hashes/esm/utils.js:
  (*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) *)
*/
