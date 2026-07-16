# BitcoinTalk Post — Altcoin Mining Board

**Board:** Altcoin Discussion → Mining (Altcoins)
**Thread title:** [ANN][EMBR] ⛏️ Emberchain — Keccak256 PoW | 5 EMBR Block Reward | 8s Blocks | Browser Mining | Monero-Style Privacy | In-App P2P Escrow Exchange

---

```bbcode
[center][size=22pt][b][color=#FF6B35]🔥 EMBERCHAIN (EMBR)[/color][/b][/size]
[size=12pt][i]Mine from your browser. Shield your transactions. Trade peer-to-peer.[/i][/size][/center]

[center]━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━[/center]

[b][size=14pt][color=#FF6B35]▌ WHAT IS EMBERCHAIN?[/color][/size][/b]

Emberchain (EMBR) is a mineable proof-of-work blockchain with a real EVM execution engine for smart contracts, a Monero-inspired shielded privacy pool, and a built-in peer-to-peer escrow exchange — all accessible through a single browser-based wallet. No Rust node. No GPU driver installation. Mine directly from the wallet UI.

[center]━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━[/center]

[b][size=14pt][color=#FF6B35]▌ CHAIN SPECIFICATIONS[/color][/size][/b]

[table]
[tr][td][b]Name[/b][/td][td]Emberchain[/td][/tr]
[tr][td][b]Ticker[/b][/td][td]EMBR[/td][/tr]
[tr][td][b]Algorithm[/b][/td][td]Keccak256 (custom PoW)[/td][/tr]
[tr][td][b]Block Reward[/b][/td][td]5 EMBR per block[/td][/tr]
[tr][td][b]Target Block Time[/b][/td][td]8 seconds[/td][/tr]
[tr][td][b]Difficulty Adjustment[/b][/td][td]Every block — ±25% nudge to maintain 8s target[/td][/tr]
[tr][td][b]Supply[/b][/td][td]Fully mined — no premine, no ICO, no dev fund[/td][/tr]
[tr][td][b]Chain ID[/b][/td][td]7773 (0x1e5d)[/td][/tr]
[tr][td][b]Address Format[/b][/td][td]Standard 0x Ethereum-style (secp256k1)[/td][/tr]
[tr][td][b]EVM Compatible[/b][/td][td]Yes — real EthereumJS EVM (Cancun hardfork opcodes)[/td][/tr]
[tr][td][b]Smart Contracts[/b][/td][td]Fully supported — deploy and call from wallet UI[/td][/tr]
[/table]

[center]━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━[/center]

[b][size=14pt][color=#FF6B35]▌ ADD TO METAMASK / EVM WALLET[/color][/size][/b]

Emberchain speaks standard Ethereum JSON-RPC, so any EVM wallet (MetaMask, Rabby, Frame) can connect natively.

[code]
Network Name : Emberchain
RPC URL      : https://<your-node-url>/api/rpc
Chain ID     : 7773
Currency     : EMBR
Block Explorer: https://<your-node-url>/ledger
[/code]

[center]━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━[/center]

[b][size=14pt][color=#FF6B35]▌ MINING — HOW IT WORKS[/color][/size][/b]

[b]Algorithm: Keccak256 PoW[/b]

Emberchain uses keccak256 hashed over a JSON-encoded block header. The miner must find a nonce (BigInt, unlimited range) such that:

[code]keccak256(JSON.stringify({ parentHash, height, miner, timestamp, nonce })) < target[/code]

Where [b]target = (2^256 - 1) / difficulty[/b]. This is intentionally CPU-friendly — keccak256 without the SHA3 padding of Ethereum's ethash, making it accessible to anyone running a browser or a script.

[b]Difficulty Retargeting[/b]

Difficulty adjusts every single block. If the last block arrived faster than 8 seconds, difficulty increases; slower and it drops. The adjustment is clamped to ±25% per block to prevent wild swings and difficulty-bomb attacks. The chain self-stabilizes around an 8-second cadence.

[b]Block Header Format (for external miners)[/b]

[code]
GET /api/mining/template?minerAddress=0xYOURWALLET

Response:
{
  "parentHash": "0xabc...",
  "height": 1234,
  "miner": "0xYOURWALLET",
  "timestamp": "2026-07-16T15:00:00.000Z",
  "difficulty": "4000000",
  "target": "0x000000ffffffffff..."
}
[/code]

[code]
POST /api/mining/submit

Body:
{
  "parentHash": "0xabc...",
  "height": 1234,
  "miner": "0xYOURWALLET",
  "timestamp": "2026-07-16T15:00:00.000Z",
  "nonce": "8374619234"
}
[/code]

[code]
GET /api/mining/status

Response:
{
  "mining": true,
  "hashRate": 182400,
  "difficulty": "4000000",
  "height": 1234,
  "recentBlocksMined": 7
}
[/code]

[b]No proprietary stratum protocol needed.[/b] Three plain HTTPS calls is all it takes to mine a block. You can build a miner in Python, Rust, Go, or a shell script in under 50 lines.

[center]━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━[/center]

[b][size=14pt][color=#FF6B35]▌ BROWSER MINING — MINE WITH ZERO SETUP[/color][/size][/b]

The wallet UI includes a fully-functional miner powered by a Web Worker. Open the wallet, click [b]Mining[/b], enter your wallet address, and click [b]Start Mining[/b]. Your browser's CPU starts hashing immediately.

[b]What you see in real time:[/b]
[list]
[li]Live hash rate (H/s)[/li]
[li]Current difficulty and target[/li]
[li]Blocks mined this session[/li]
[li]Running EMBR balance update[/li]
[/list]

No drivers. No mining software to install. No pool account signup. Works on any desktop browser. This is what mining looked like in 2009 for Bitcoin — now brought back for a new chain.

[center]━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━[/center]

[b][size=14pt][color=#FF6B35]▌ PROPORTIONAL SHARE-BASED MINING PAYOUTS (Coming)[/color][/size][/b]

The chain already tracks active miner addresses across recent blocks. The next major mining update introduces [b]proportional share-based payout pools[/b]:

[list]
[li][b]Submit shares, not just winning blocks.[/b] Every valid near-miss hash (above a share difficulty threshold) earns you a recorded share.[/li]
[li][b]Block reward is split proportionally[/b] across all miners by their share count when the block lands — so your contribution is recognized even if someone else finds the winning nonce.[/li]
[li][b]No luck spikes.[/b] Small miners earn steadily in proportion to their hash rate, the same economic guarantee as a traditional pool — without an external pool operator taking a cut.[/li]
[li][b]Fully on-chain accounting.[/b] Share records and payout math live inside the chain engine, not on a centralized pool server.[/li]
[/list]

[i]If you're running a node and contributing CPU time, proportional payouts ensure you get your fair cut of every block mined on the network — not just the blocks you happened to win.[/i]

[center]━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━[/center]

[b][size=14pt][color=#FF6B35]▌ PRIVACY — MONERO-STYLE SHIELDED POOL[/color][/size][/b]

Emberchain includes a full shielded transaction pool inspired by Monero's cryptographic primitives. Public EMBR can be shielded (made private), transferred privately, and unshielded back — with sender, recipient, and amount hidden during the private leg.

[b]The four cryptographic layers:[/b]

[b]1. Stealth Addresses (ECDH one-time keys)[/b]
Each private note is sent to a one-time address derived from an Elliptic-Curve Diffie-Hellman shared secret between sender and recipient. No two payments to the same recipient produce the same on-chain address. Only the recipient's private spend key can identify and claim the note.

[b]2. Pedersen Commitments (amount hiding)[/b]
Amounts are never stored in plaintext in the shielded pool. Instead, each note carries a Pedersen commitment: [i]C = v·G + r·H[/i] where v is the amount, r is a blinding factor, and G/H are independent curve generators. The chain verifies that inputs equal outputs + fee without learning the value of any individual note.

[b]3. LSAG Linkable Ring Signatures (sender anonymity)[/b]
When spending a note, the spender includes decoy unspent notes from the pool in a Linkable Spontaneous Anonymous Group (LSAG) signature. The ring size is [i]min(available notes, 4 decoys) + 1 real signer[/i]. Verifiers confirm that exactly one ring member authorized the spend without learning which one. This is the same construction used in Monero.

[b]4. Key Images (double-spend prevention)[/b]
Each spend produces a unique key image derived from the note's private key. The chain records all used key images and rejects any attempt to re-spend a note — without ever revealing which note the image corresponds to.

[b]Honest limitations (no surprises):[/b]
[list]
[li]No Bulletproofs range proofs yet — amount non-negativity is enforced by the server operator. Trustless ZK range proofs are on the roadmap.[/li]
[li]Shield and unshield boundaries are visible (same design as Zcash transparent ↔ shielded). What happens inside the pool stays private.[/li]
[li]Anonymity set grows with usage — early movers have smaller rings, like early Monero adopters.[/li]
[li]Smart contract interactions remain on the public path. Private EMBR transfers only.[/li]
[/list]

[center]━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━[/center]

[b][size=14pt][color=#FF6B35]▌ IN-APP P2P ESCROW EXCHANGE[/color][/size][/b]

Emberchain has a peer-to-peer marketplace baked directly into the wallet. Sellers lock EMBR into trustless on-chain escrow and set an asking price in an external currency. Buyers pay externally, submit their transaction hash, and the chain verifies the payment on the external blockchain before releasing the EMBR automatically — no intermediary, no withdrawal requests, no KYC.

[b]Supported payment currencies:[/b]
[list]
[li][b]ETH[/b] — Ethereum mainnet (verified via Etherscan, 12 confirmations)[/li]
[li][b]USDT[/b] — Multi-network: ERC-20 (Ethereum), TRC-20 (Tron), BEP-20 (BSC), Polygon (128 confirmations each as required)[/li]
[li][b]BTC[/b] — Bitcoin mainnet (verified via Blockstream.info, 2 confirmations)[/li]
[li][b]SOL[/b] — Solana mainnet (verified via public RPC, finalized state)[/li]
[/list]

[b]How a trade works:[/b]
[list=1]
[li][b]Seller creates listing[/b] — locks EMBR in escrow instantly. Specifies asking price and which payment networks they accept.[/li]
[li][b]Buyer reserves listing[/b] — claims a 15-minute exclusive window. Other buyers see the countdown and cannot jump the queue.[/li]
[li][b]Buyer pays externally[/b] — sends ETH/USDT/BTC/SOL directly to the seller's address on the chosen network.[/li]
[li][b]Buyer submits tx hash[/b] — the chain fetches the transaction from the public block explorer API, verifies recipient, amount, and confirmation count.[/li]
[li][b]EMBR released automatically[/b] — on successful verification, EMBR is credited to the buyer's wallet. No human in the loop.[/li]
[/list]

Replay protection is enforced at the chain level — each external transaction hash can only fulfill one listing, ever, even across separate listing reopenings.

[center]━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━[/center]

[b][size=14pt][color=#FF6B35]▌ WALLET FEATURES[/color][/size][/b]

[list]
[li]Create or import wallets — private key shown once, never stored server-side[/li]
[li]Send public EMBR transactions[/li]
[li]Deploy EVM smart contracts from the browser[/li]
[li]Call contract functions (read-only)[/li]
[li]Shield public EMBR → private pool[/li]
[li]Send privately within the pool[/li]
[li]Unshield back to a public address[/li]
[li]Browser mining with live hash rate display[/li]
[li]P2P exchange — list, reserve, buy, cancel[/li]
[li]Full transaction and block explorer[/li]
[li]Price history chart from fulfilled exchange trades[/li]
[/list]

[center]━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━[/center]

[b][size=14pt][color=#FF6B35]▌ FOR EXTERNAL MINERS — QUICK-START SCRIPT[/color][/size][/b]

Here's a minimal Python miner to get you started in under 60 lines:

[code]
#!/usr/bin/env python3
"""Minimal Emberchain CPU miner."""
import hashlib, json, time, random, requests

NODE = "https://<your-node-url>"
WALLET = "0xYOUR_EMBR_ADDRESS"

def keccak256(data: bytes) -> bytes:
    from Crypto.Hash import keccak
    k = keccak.new(digest_bits=256)
    k.update(data)
    return k.digest()

def mine():
    while True:
        tmpl = requests.get(f"{NODE}/api/mining/template?minerAddress={WALLET}").json()
        target = int(tmpl["target"], 16)
        nonce = random.randint(0, 2**64)
        start = time.time()
        hashes = 0
        while True:
            header = {**{k: tmpl[k] for k in ("parentHash","height","miner","timestamp")},
                      "nonce": str(nonce)}
            h = int.from_bytes(keccak256(json.dumps(header, separators=(',',':')).encode()), 'big')
            if h < target:
                r = requests.post(f"{NODE}/api/mining/submit", json=header)
                print(f"Block found! Height {tmpl['height']} — {r.status_code}")
                break
            nonce += 1
            hashes += 1
            if hashes % 5000 == 0:
                elapsed = time.time() - start
                print(f"  {hashes/elapsed:.0f} H/s | diff {tmpl['difficulty']} | nonce {nonce}")
                # Refresh template every 5000 hashes to get latest block
                break

if __name__ == "__main__":
    mine()
[/code]

[i]Requires: requests, pycryptodome[/i]
[code]pip install requests pycryptodome[/code]

[center]━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━[/center]

[b][size=14pt][color=#FF6B35]▌ TECHNICAL STACK[/color][/size][/b]

[list]
[li][b]Consensus:[/b] Custom Keccak256 PoW, per-block difficulty adjustment[/li]
[li][b]EVM:[/b] EthereumJS (@ethereumjs/evm) — Cancun hardfork, full opcode support[/li]
[li][b]Cryptography:[/b] ethereum-cryptography (secp256k1, keccak256), @noble/curves for privacy primitives[/li]
[li][b]State:[/b] In-memory flat state manager (EthereumJS SimpleStateManager), persisted as JSON + PostgreSQL backup[/li]
[li][b]API:[/b] Express 5 REST + Ethereum JSON-RPC 2.0 endpoint[/li]
[li][b]Runtime:[/b] Node.js 24, TypeScript 5.9[/li]
[li][b]Frontend:[/b] React + Vite + TanStack Query[/li]
[li][b]No Merkle trie[/b] — single-node chain design; stateRoot is block hash. Appropriate for a self-hosted node.[/li]
[/list]

[center]━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━[/center]

[b][size=14pt][color=#FF6B35]▌ ROADMAP[/color][/size][/b]

[list]
[✓] Keccak256 PoW with per-block difficulty adjustment
[✓] Browser-based WebWorker miner
[✓] EVM smart contract deployment and execution
[✓] Monero-style shielded pool (stealth, commitments, LSAG rings, key images)
[✓] P2P escrow exchange (ETH, BTC, SOL, USDT multi-chain)
[✓] Listing reservation system (15-min buyer lock)
[✓] MetaMask / EVM wallet RPC endpoint
[ ] Proportional share-based mining payouts (in progress)
[ ] Wallet backup and encrypted export
[ ] Bulletproofs / ZK range proofs for trustless amount privacy
[ ] Multi-node peer discovery
[/list]

[center]━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━[/center]

[b][size=14pt][color=#FF6B35]▌ NO PREMINE. NO ICO. NO DEV TAX.[/color][/size][/b]

[center][i]Every EMBR in existence was mined. If you want some, run a miner.[/i][/center]

[center]━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━[/center]

[center][b]Replies, mining reports, questions, and hash rate benchmarks all welcome below.[/b][/center]
```
