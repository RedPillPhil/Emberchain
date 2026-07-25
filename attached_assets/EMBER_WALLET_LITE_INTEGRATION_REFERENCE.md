# Ember Wallet Lite — Privacy Integration Reference

Complete technical reference for building a standalone Emberchain wallet with full
privacy support, derived directly from the Emberchain node source code.

**Node:** `https://po-w-chain.replit.app` (most reliable, managed TLS cert)  
**Chain ID:** 7773  
**Currency:** EMBR  
**All amounts:** decimal strings, wei-denomination (1 EMBR = 1 × 10¹⁸)

---

## 1. Privacy API Endpoints

Emberchain privacy is **REST-only** — there are no custom JSON-RPC methods.
All privacy endpoints live under `/api/privacy/*` on any Emberchain node.

### 1.1 Get pool status

```
GET /api/privacy/status
```

No body, no auth.

**Response:**
```json
{
  "totalNotes":    142,
  "unspentNotes":  89,
  "shieldedTxCount": 67
}
```

---

### 1.2 Get a wallet's stealth meta-address

```
GET /api/privacy/meta/:address
```

`:address` — a 0x-prefixed Emberchain address that has been created or imported
on this node at least once.

**Response:**
```json
{
  "spendPublicKey": "0x02a1b2c3...",
  "viewPublicKey":  "0x03d4e5f6..."
}
```

Both keys are 33-byte compressed secp256k1 public keys in hex.  
Returns `404` if the address has never been seen by this node.

---

### 1.3 Scan private balance

```
POST /api/privacy/balance
Content-Type: application/json

{
  "privateKey": "0xYOUR_PRIVATE_KEY_HEX"
}
```

The node scans every note in the pool using `recoverStealthOwnership()` and
returns only the notes belonging to this key.

**Response:**
```json
{
  "address": "0xabc...",
  "balance": "500000000000000000",
  "notes": [
    {
      "id":        "note_abc123",
      "amount":    "500000000000000000",
      "status":    "unspent",
      "source":    "shield",
      "createdAt": "2026-07-25T10:00:00.000Z"
    }
  ]
}
```

- `balance` and `amount` are decimal wei strings.
- `status`: `"unspent"` | `"spent"`
- `source`: `"shield"` | `"private-send"`

---

### 1.4 Shield — move public EMBR into the private pool

```
POST /api/privacy/shield
Content-Type: application/json

{
  "fromPrivateKey": "0xYOUR_PRIVATE_KEY_HEX",
  "amount":         "1000000000000000000",
  "toAddress":      "0xOPTIONAL_RECIPIENT_ADDRESS"
}
```

- `amount`: wei decimal string. Must be > 0.
- `toAddress`: optional. If omitted, defaults to the sender's own address.
  The recipient must already have been seen by this node (so its stealth meta
  keys are registered). Shielding to yourself always works.
- **Fee:** none (0).
- The source address and amount **are** visible on the public ledger — this is
  the transparent → shielded boundary.

**Response (`201 Created`):**
```json
{
  "id":             "stx_abc123",
  "type":           "shield",
  "createdAt":      "2026-07-25T10:00:00.000Z",
  "publicAddress":  "0xSENDER_ADDRESS",
  "publicAmount":   "1000000000000000000",
  "fee":            "0",
  "noteIdsCreated": ["note_xyz"],
  "noteIdsSpent":   []
}
```

---

### 1.5 Private send — shielded transfer between wallets

```
POST /api/privacy/send
Content-Type: application/json

{
  "fromPrivateKey": "0xSENDER_PRIVATE_KEY_HEX",
  "toAddress":      "0xRECIPIENT_0x_ADDRESS",
  "amount":         "500000000000000000",
  "fee":            "10000000000000000"
}
```

- `amount`: wei decimal string. Must be > 0.
- `fee`: optional. Defaults to `"10000000000000000"` (0.01 EMBR). The fee is
  burned to address `0x00000000000000000000000000000000deadbeef`.
- Both sender and recipient must be known to the node (both must have been
  created/imported there at least once so their stealth meta-keys are registered).
- Sender, recipient, and amount are **not** recorded in the ledger entry.
  Change is automatically returned to the sender as a new hidden note.
- Ring signatures are created **node-side** (see §3 below).

**Response (`201 Created`):**
```json
{
  "id":             "stx_def456",
  "type":           "private-send",
  "createdAt":      "2026-07-25T10:01:00.000Z",
  "publicAddress":  null,
  "publicAmount":   null,
  "fee":            "10000000000000000",
  "noteIdsCreated": ["note_new1", "note_change1"],
  "noteIdsSpent":   ["note_xyz"],
  "ringSignatures": [
    {
      "ring":     ["0x02aa...", "0x03bb...", "0x02cc..."],
      "c0":       "0x1a2b...",
      "s":        ["0xaa11...", "0xbb22...", "0xcc33..."],
      "keyImage": "0x02deadbeef..."
    }
  ]
}
```

Note: `ringSignatures` is an extension on the response object (not part of the
`ShieldedTxRecord` type definition) and is present only on `private-send` and
`unshield` responses.

---

### 1.6 Unshield — move private EMBR back to public

```
POST /api/privacy/unshield
Content-Type: application/json

{
  "fromPrivateKey": "0xYOUR_PRIVATE_KEY_HEX",
  "toAddress":      "0xDESTINATION_ADDRESS",
  "amount":         "500000000000000000"
}
```

- `amount`: wei decimal string. Must be > 0.
- `toAddress`: the public Emberchain address to receive funds. Can be any address.
- **Fee:** none (0). The unshielded amount itself acts as the commitment balance
  offset.
- The destination address and amount **are** visible on the public ledger —
  this is the shielded → transparent boundary.

**Response (`201 Created`):**
```json
{
  "id":             "stx_ghi789",
  "type":           "unshield",
  "createdAt":      "2026-07-25T10:02:00.000Z",
  "publicAddress":  "0xDESTINATION_ADDRESS",
  "publicAmount":   "500000000000000000",
  "fee":            "0",
  "noteIdsCreated": ["note_change2"],
  "noteIdsSpent":   ["note_xyz"]
}
```

---

### 1.7 Public privacy ledger

```
GET /api/privacy/transactions?limit=20
```

Returns the most recent shielded-pool operations, newest first.  
`private-send` entries always have `publicAddress: null` and `publicAmount: null`.

**Response:**
```json
[
  {
    "id":            "stx_abc123",
    "type":          "shield",
    "createdAt":     "2026-07-25T10:00:00.000Z",
    "publicAddress": "0xSENDER",
    "publicAmount":  "1000000000000000000",
    "fee":           "0",
    "noteIdsCreated": ["note_xyz"],
    "noteIdsSpent":   []
  },
  {
    "id":            "stx_def456",
    "type":          "private-send",
    "createdAt":     "2026-07-25T10:01:00.000Z",
    "publicAddress": null,
    "publicAmount":  null,
    "fee":           "10000000000000000",
    "noteIdsCreated": ["note_new1"],
    "noteIdsSpent":   ["note_xyz"]
  }
]
```

---

## 2. Stealth Address System

**File:** `lib/chain-core/src/privacy/stealth.ts`  
**Construction:** ERC-5564 / Monero-style dual-key stealth scheme on secp256k1.

### 2.1 How a wallet's stealth meta-address is derived

Every regular Emberchain private key implicitly has two child keys derived from
it deterministically:

```typescript
import { keccak256 } from "ethereum-cryptography/keccak.js";
import { secp256k1 } from "ethereum-cryptography/secp256k1.js";

// Domain-separated keccak derivation
function deriveChildScalar(mainPrivateKeyHex: string, domain: string): bigint {
  // keccak256(domain_string_bytes || private_key_bytes) mod curve_order
}

// Spend private key
function deriveSpendPrivateKey(mainPrivateKeyHex: string): bigint {
  return deriveChildScalar(mainPrivateKeyHex, "EMBERCHAIN_STEALTH_SPEND_KEY_V1");
}

// View private key
function deriveViewPrivateKey(mainPrivateKeyHex: string): bigint {
  return deriveChildScalar(mainPrivateKeyHex, "EMBERCHAIN_STEALTH_VIEW_KEY_V1");
}
```

**Public stealth meta-address** (safe to publish):
```typescript
function getStealthMetaAddress(mainPrivateKeyHex: string): StealthMeta {
  return {
    spendPublicKey: mulG(deriveSpendPrivateKey(mainPrivateKeyHex)),  // 33-byte compressed
    viewPublicKey:  mulG(deriveViewPrivateKey(mainPrivateKeyHex)),   // 33-byte compressed
  };
}
```

### 2.2 Sender: deriving a one-time destination address

```typescript
function deriveStealthDestination(recipientMeta: StealthMeta): StealthDestination {
  const r = randomScalar();                          // ephemeral random scalar
  const R = mulG(r);                                 // ephemeral public key (published with note)

  const sharedPoint = mulPoint(recipientMeta.viewPublicKey, r);   // r * viewPub == viewPriv * R
  const sharedSecret = hashToScalar(
    "EMBERCHAIN_STEALTH_SHARED_SECRET_V1",
    pointToHex(sharedPoint)
  );

  // P = spendPub + hash(sharedSecret)*G
  const stealthPoint = addPoints(
    hexToPoint(recipientMeta.spendPublicKey),
    mulG(sharedSecret)
  );

  return {
    ephemeralPublicKey: pointToHex(R),       // stored with note so recipient can scan
    stealthPublicKey:   pointToHex(stealthPoint),
    stealthAddress:     ethAddressFromPublicKey(stealthPoint),
    sharedSecretScalar: sharedSecret,        // used to encrypt note payload
  };
}
```

### 2.3 Recipient: detecting and recovering owned notes

```typescript
function recoverStealthOwnership(
  mainPrivateKeyHex:          string,
  ephemeralPublicKeyHex:      string,   // R published with the note
  expectedStealthPublicKeyHex: string,  // stored with the note
): { owned: boolean; oneTimePrivateKey: bigint; sharedSecretScalar: bigint } {

  const viewPriv = deriveViewPrivateKey(mainPrivateKeyHex);
  const sharedPoint = mulPoint(hexToPoint(ephemeralPublicKeyHex), viewPriv);  // viewPriv * R
  const sharedSecret = hashToScalar("EMBERCHAIN_STEALTH_SHARED_SECRET_V1", pointToHex(sharedPoint));

  const spendPriv = deriveSpendPrivateKey(mainPrivateKeyHex);
  const candidate = addPoints(mulG(spendPriv), mulG(sharedSecret));
  const owned = pointToHex(candidate) === expectedStealthPublicKeyHex;

  // One-time private key: p = spendPriv + sharedSecret (mod curve order)
  const oneTimePrivateKey = (spendPriv + sharedSecret) % CURVE_ORDER;

  return { owned, oneTimePrivateKey, sharedSecretScalar: sharedSecret };
}
```

**Scanning algorithm:** iterate every `PrivateNote` in the pool, call
`recoverStealthOwnership(myPrivKey, note.ephemeralPublicKey, note.stealthPublicKey)`.
If `owned === true`, decrypt the note payload with `sharedSecretScalar` to get
the actual amount and blinding factor.

### 2.4 Required cryptographic libraries

```
ethereum-cryptography   (secp256k1, keccak256)
@ethereumjs/util        (hexToBytes, bytesToHex)
```

Both are already available in the standard ethers.js ecosystem.

### 2.5 Which RPC methods expose stealth transactions

None — there is no JSON-RPC exposure.  
Scanning is done via `POST /api/privacy/balance` (server scans on behalf of the
key holder) or can be done client-side using the algorithm in §2.3 against the
raw note data.

---

## 3. Ring Signature (LSAG) Implementation

**File:** `lib/chain-core/src/privacy/ring.ts`

### 3.1 Summary

| Property | Value |
|---|---|
| Algorithm | LSAG (Linkable Spontaneous Anonymous Group) |
| Curve | secp256k1 |
| Ring size | Up to 5 (1 real + up to 4 decoys) |
| Default ring size | Min(pool_size, 5) |
| Decoy source | Random unspent notes from the pool |
| Created by | **Node-side** (inside `blockchain.ts#computeSpend`) |
| Double-spend prevention | Unique `keyImage` per one-time private key, persisted and rejected on reuse |

### 3.2 Key constants

```typescript
// lib/chain-core/src/blockchain.ts
const MAX_RING_DECOYS = 4;   // up to 4 decoys → ring size up to 5
```

### 3.3 Function signatures

```typescript
// ring.ts
function signRing(
  message:           Uint8Array,          // keccak256 of the transaction payload
  ring:              PrefixedHexString[], // array of compressed secp256k1 public keys
  secretIndex:       number,              // which ring entry is the real spender
  oneTimePrivateKey: bigint,              // recovered from recoverStealthOwnership()
): RingSignature

function verifyRing(
  message:   Uint8Array,
  ring:      PrefixedHexString[],
  signature: RingSignature,
): boolean

function computeKeyImage(
  oneTimePrivateKey:  bigint,
  oneTimePublicKeyHex: string,
): PrefixedHexString    // Hp(P) * p — unique per private key, reveals nothing else

interface RingSignature {
  c0:       PrefixedHexString;   // initial challenge scalar
  s:        PrefixedHexString[]; // response scalars, one per ring member
  keyImage: PrefixedHexString;   // used for double-spend detection
}
```

### 3.4 How the node selects decoys

```typescript
// blockchain.ts — selectDecoyRing()
private selectDecoyRing(excludeNoteIds: Set<string>): PrefixedHexString[] {
  const candidates = [...this.privateNotes.values()]
    .filter(n => n.status === "unspent" && !excludeNoteIds.has(n.id));
  // Fisher-Yates shuffle, take first MAX_RING_DECOYS
  return shuffled(candidates).slice(0, MAX_RING_DECOYS).map(n => n.stealthPublicKey);
}
```

The real key is then spliced at a random position among the decoys.

### 3.5 What the wallet must do

**Nothing** — ring signatures are built entirely on the server. The wallet sends
its `fromPrivateKey` to `POST /api/privacy/send` or `POST /api/privacy/unshield`.
The node:
1. Scans the pool for owned notes via `findOwnedNotes(fromPrivateKey)`
2. Selects notes to spend greedily (smallest notes first until `amount + fee` is covered)
3. Calls `computeSpend()` → `signRing()` for each spent note
4. Verifies the signature internally before committing

For Ember Wallet Lite the wallet does not need to implement `signRing()`.

---

## 4. Pedersen Commitment / Confidential Amount System

**File:** `lib/chain-core/src/privacy/commitments.ts`

### 4.1 Commitment formula

```
C(amount, blinding) = amount × G + blinding × H
```

Where:
- `G` — secp256k1 base point
- `H` — nothing-up-my-sleeve second generator derived as:
  `hashToCurvePoint("EMBERCHAIN_PEDERSEN_H_GENERATOR_V1")`
- `amount` — bigint, wei denomination
- `blinding` — random scalar (32 bytes), kept secret

```typescript
// commitments.ts
function pedersenCommit(amount: bigint, blinding: bigint): PrefixedHexString {
  // returns 33-byte compressed point hex
  return pointToHex(addPoints(mulG(amount), mulPoint(PEDERSEN_H, blinding)));
}
```

### 4.2 Balance conservation check

For a shielded send, the node verifies:

```
sum(input_commitments) - sum(output_commitments) - fee×G = identity_point
```

This proves value is conserved without revealing any individual amount.

```typescript
function verifyCommitmentBalance(
  inputCommitments:  PrefixedHexString[],
  outputCommitments: PrefixedHexString[],
  fee:               bigint,
): boolean
```

### 4.3 Known limitation

**No range proofs.** The scheme proves conservation but not that individual
amounts are non-negative. The node applies a plaintext bounds check at submission
time (`amount > 0` and `amount < sane_max`) as a stand-in. This is documented
in the source as a known limitation.

### 4.4 Are amounts hidden on-chain?

- **Private-send notes:** Yes. Only the Pedersen commitment (an EC point) is stored. Without the blinding factor and the owner's private key, an observer cannot determine the amount.
- **Shield/unshield boundaries:** No. The `publicAmount` field is stored in plaintext in the `ShieldedTxRecord` because crossing the public ↔ private boundary is intentionally visible (same design as Zcash transparent ↔ shielded).

### 4.5 Note payload encryption

**File:** `lib/chain-core/src/privacy/note-cipher.ts`

Amount and blinding factor are encrypted to the stealth shared secret before being stored with the note:

```typescript
interface NotePlaintext {
  amount:   string;  // decimal string, wei
  blinding: string;  // 0x-prefixed hex scalar
}

// Encrypt: keccak-based CTR cipher + 16-byte keccak MAC
function encryptNotePayload(
  sharedSecretScalarHex: string,   // from deriveStealthDestination() / recoverStealthOwnership()
  plaintext: NotePlaintext,
): PrefixedHexString   // 0x + 16-byte tag + ciphertext

// Decrypt: returns null if wrong owner or corrupted
function decryptNotePayload(
  sharedSecretScalarHex: string,
  encryptedHex: string,
): NotePlaintext | null
```

The encryption key and MAC key are each derived independently from the shared secret:
```
encKey = keccak256(sharedSecretBytes || "note-encrypt")
macKey = keccak256(sharedSecretBytes || "note-mac")
```

---

## 5. Full Private Transaction Lifecycle

### 5.1 Shield (public → private)

```
Wallet (user holds private key)
  │
  ├─ POST /api/privacy/shield
  │    { fromPrivateKey, amount, toAddress? }
  │
  ▼
Node: shield()  [blockchain.ts:2171]
  │
  ├─ 1. walletFromPrivateKey(fromPrivateKey)       → derives Ethereum address
  ├─ 2. registerWallet(address, fromPrivateKey)    → stores StealthMeta (spendPub, viewPub)
  ├─ 3. getWalletMeta(recipientAddress)            → looks up StealthMeta
  ├─ 4. randomBlindingFactor()                     → 32-byte random scalar
  ├─ 5. createNoteFor(recipientMeta, amount, blinding, "shield")
  │      ├─ deriveStealthDestination(meta)         → ephemeralPublicKey, stealthPublicKey, sharedSecretScalar
  │      ├─ pedersenCommit(amount, blinding)       → commitment EC point
  │      └─ encryptNotePayload(sharedSecret, {amount, blinding}) → encryptedPayload
  ├─ 6. debit(stateManager, fromAddress, amount)   → deducts from public balance
  ├─ 7. privateNotes.set(note.id, note)            → note enters pool as "unspent"
  └─ 8. shieldedTxs.push(record)                  → public ledger entry (amount visible)
  │
  ▼
Response: ShieldedTxRecord
```

### 5.2 Private Send (private → private)

```
Wallet (user holds private key)
  │
  ├─ POST /api/privacy/send
  │    { fromPrivateKey, toAddress, amount, fee? }
  │
  ▼
Node: privateSend()  [blockchain.ts:2214]
  │
  ├─ 1. registerWallet(senderAddress, fromPrivateKey)  → registers stealth keys
  ├─ 2. findOwnedNotes(fromPrivateKey)                 → scans pool, recovers notes
  │      └─ for each note: recoverStealthOwnership() + decryptNotePayload()
  ├─ 3. Select notes greedily until total ≥ amount + fee
  ├─ 4. Compute blinding balance:
  │      inputBlindingSum = sum(all input blindings)
  │      recipientBlinding = random
  │      changeBlinding    = inputBlindingSum - recipientBlinding
  ├─ 5. createNoteFor(recipientMeta, amount, recipientBlinding, "private-send")
  ├─ 6. createNoteFor(senderMeta, change, changeBlinding, "private-send")  [if change > 0]
  ├─ 7. verifyCommitmentBalance(inputCommitments, outputCommitments, fee)
  ├─ 8. Build message = keccak256({outputCommitments, ephemeralKeys, fee})
  ├─ 9. For each input note: computeSpend()
  │      ├─ selectDecoyRing(excludedNoteIds)       → up to 4 random unspent stealthPublicKeys
  │      ├─ splice real stealthPublicKey at random position
  │      └─ signRing(message, ring, secretIndex, oneTimePrivateKey)  → RingSignature
  ├─ 10. applySpend() → mark notes spent, record keyImages
  ├─ 11. credit(PRIVACY_FEE_SINK, fee)
  └─ 12. shieldedTxs.push(record)  [publicAddress=null, publicAmount=null]
  │
  ▼
Response: ShieldedTxRecord (sender/recipient/amount NOT recorded)
```

### 5.3 Unshield (private → public)

```
Wallet
  │
  ├─ POST /api/privacy/unshield
  │    { fromPrivateKey, toAddress, amount }
  │
  ▼
Node: unshield()  [blockchain.ts:2311]
  │
  ├─ 1. findOwnedNotes(fromPrivateKey)             → scan pool
  ├─ 2. Select notes until total ≥ amount
  ├─ 3. change = total - amount
  │      changeBlinding = inputBlindingSum (conserves commitments)
  ├─ 4. createNoteFor(senderMeta, change, changeBlinding, "private-send")  [if change > 0]
  ├─ 5. verifyCommitmentBalance(inputs, [changeCommitment], amount)
  │      (amount acts as a zero-blinding "fee" in the commitment identity check)
  ├─ 6. computeSpend() + signRing() for each spent note
  ├─ 7. applySpend()
  ├─ 8. credit(toAddress, amount)                  → funds appear in public balance
  └─ 9. shieldedTxs.push(record)                  [publicAddress=toAddress, publicAmount=amount]
  │
  ▼
Response: ShieldedTxRecord (amount and destination visible)
```

---

## 6. Existing Wallet Implementation Reference

### 6.1 Web wallet privacy UI

**File:** `artifacts/wallet/src/pages/privacy.tsx`

- Five tabs: `balance` | `shield` | `send` | `unshield` | `ledger`
- All amounts entered in EMBR (float), converted to wei string client-side:
  ```javascript
  const amountWei = BigInt(Math.floor(parseFloat(amountEmbr) * 1e18)).toString();
  ```
- API base is inferred from `window.location.origin`, falls back to hardcoded
  `https://po-w-chain.replit.app` when the origin doesn't match.
- Calls:
  ```javascript
  // Balance scan
  POST /api/privacy/balance  { privateKey }

  // Shield
  POST /api/privacy/shield   { fromPrivateKey, amount, toAddress? }

  // Private send
  POST /api/privacy/send     { fromPrivateKey, toAddress, amount }

  // Unshield
  POST /api/privacy/unshield { fromPrivateKey, toAddress, amount }

  // Ledger
  GET  /api/privacy/transactions?limit=20
  ```

### 6.2 Mobile wallet privacy client

**File:** `artifacts/mobile-wallet/lib/privacyClient.ts`

```typescript
export const privacyClient = {
  getStatus:   () => GET /api/privacy/status,
  getBalance:  (privateKey: string) => POST /api/privacy/balance,
  shield:      (fromPrivateKey, amountEmbr, toAddress?) => POST /api/privacy/shield,
  privateSend: (fromPrivateKey, toAddress, amountEmbr)  => POST /api/privacy/send,
  unshield:    (fromPrivateKey, toAddress, amountEmbr)  => POST /api/privacy/unshield,
  listLedger:  (limit = 20)  => GET /api/privacy/transactions?limit=20,
};
```

`parseEMBR(amountEmbr)` converts a float string to a wei decimal string:
```typescript
function parseEMBR(embr: string): string {
  return BigInt(Math.floor(parseFloat(embr) * 1e18)).toString();
}
```

### 6.3 Standard EMBR transactions (non-private)

Standard sends use JSON-RPC (`eth_sendRawTransaction`) or the REST endpoint:

```
POST /api/transactions
{
  "fromPrivateKey": "0x...",
  "to":             "0xRECIPIENT",
  "value":          "1000000000000000000",
  "gasLimit":       "21000"
}
```

Get wallet:
```
GET /api/wallets/0xADDRESS
→ { address, balance, nonce }
```

---

## 7. What Ember Wallet Lite Needs

### 7.1 Required frontend functions

```typescript
// ── Standard wallet ────────────────────────────────────────────────────────

async function createWallet(): Promise<{ address, privateKey, mnemonic }>
async function importWallet(privateKeyOrMnemonic: string): Promise<{ address, privateKey }>
async function getBalance(address: string): Promise<string>  // wei string
async function sendEMBR(fromPrivateKey, to, amountWei): Promise<TxHash>

// ── Amount helpers ─────────────────────────────────────────────────────────

function embrToWei(embr: string): string   // "1.5" → "1500000000000000000"
function weiToEmbr(wei: string): string    // "1500000000000000000" → "1.5"

// ── Privacy pool ───────────────────────────────────────────────────────────

async function getPrivacyStatus(): Promise<{ totalNotes, unspentNotes, shieldedTxCount }>
async function getPrivateBalance(privateKey: string): Promise<{ balance, notes[] }>
async function shieldEMBR(privateKey, amountWei, toAddress?): Promise<ShieldedTxRecord>
async function privateSend(privateKey, toAddress, amountWei, fee?): Promise<ShieldedTxRecord>
async function unshieldEMBR(privateKey, toAddress, amountWei): Promise<ShieldedTxRecord>
async function getPrivacyLedger(limit?): Promise<ShieldedTxRecord[]>

// ── Stealth address (display/receive) ─────────────────────────────────────

async function getMyStealthMeta(address: string): Promise<{ spendPublicKey, viewPublicKey } | null>
```

### 7.2 Required REST endpoints (hit from the frontend)

```
GET  /api/wallets/:address
POST /api/transactions            (standard send)
GET  /api/privacy/status
POST /api/privacy/balance         { privateKey }
POST /api/privacy/shield          { fromPrivateKey, amount, toAddress? }
POST /api/privacy/send            { fromPrivateKey, toAddress, amount, fee? }
POST /api/privacy/unshield        { fromPrivateKey, toAddress, amount }
GET  /api/privacy/transactions?limit=N
GET  /api/privacy/meta/:address   (to get a recipient's stealth meta for display)
```

No JSON-RPC calls are needed for privacy. Standard RPC calls you may want:
```
POST /api/rpc  { jsonrpc:"2.0", method:"eth_blockNumber", params:[], id:1 }
POST /api/rpc  { jsonrpc:"2.0", method:"eth_gasPrice", params:[], id:1 }
```

### 7.3 Cryptographic libraries needed

The wallet does **not** need to implement ring signatures or Pedersen commitments
itself — all of that happens on the node. The only crypto the frontend needs:

```
ethers   (v6)         — wallet creation, key import, transaction signing, mnemonic
```

Or equivalent:
```
@ethereumjs/wallet    — key derivation
viem                  — modern alternative to ethers
```

For **client-side note scanning** (optional — the server does it via `/privacy/balance`):
```
ethereum-cryptography  — secp256k1, keccak256
@ethereumjs/util       — hex utilities
```

### 7.4 Important design constraints

1. **Both sender and recipient must be known to the node** for `private-send`.
   "Known" means the wallet was created or imported via the node's API at least
   once. The wallet's stealth meta-address is registered at that time.
   If you try to send to a fresh address that has never touched the node,
   you'll get: `"No known stealth address for 0x..."` — 400 error.

2. **The private key is sent to the server** for all privacy operations.
   The server does the scanning and signing. This is the documented trust model —
   it is NOT a trustless ZK system. Users must trust the node operator.

3. **Default fee for private-send:** `10000000000000000` (0.01 EMBR).
   Pass `fee: "0"` to waive it (the node allows zero fees).

4. **No minimum ring size.** If the pool has fewer than 5 unspent notes, the
   ring will be smaller. The note can still be spent with ring size 1 (no decoys).

5. **Amounts are always wei decimal strings**, never floats, never hex.
   Use `BigInt(Math.floor(parseFloat(embr) * 1e18)).toString()` to convert.

6. **Chain ID:** 7773  
   Use this for EIP-155 transaction signing.

---

## 8. Minimal Working Example (fetch-based)

```javascript
const NODE = 'https://po-w-chain.replit.app';

// Convert EMBR → wei
const toWei = embr => BigInt(Math.floor(parseFloat(embr) * 1e18)).toString();
const toEmbr = wei => (Number(BigInt(wei)) / 1e18).toFixed(6);

// Scan private balance
async function getPrivateBalance(privateKey) {
  const r = await fetch(`${NODE}/api/privacy/balance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ privateKey }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error);
  return { embr: toEmbr(data.balance), notes: data.notes };
}

// Shield 1 EMBR
async function shield(privateKey, amountEmbr) {
  const r = await fetch(`${NODE}/api/privacy/shield`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fromPrivateKey: privateKey, amount: toWei(amountEmbr) }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error);
  return data;
}

// Private send 0.5 EMBR to recipient
async function privateSend(privateKey, toAddress, amountEmbr) {
  const r = await fetch(`${NODE}/api/privacy/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fromPrivateKey: privateKey,
      toAddress,
      amount: toWei(amountEmbr),
      // fee omitted → defaults to 0.01 EMBR
    }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error);
  return data;
}

// Unshield 0.5 EMBR to a public address
async function unshield(privateKey, toAddress, amountEmbr) {
  const r = await fetch(`${NODE}/api/privacy/unshield`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fromPrivateKey: privateKey,
      toAddress,
      amount: toWei(amountEmbr),
    }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error);
  return data;
}
```

---

## 9. Type Definitions (copy-paste ready)

```typescript
// Shielded note as stored on the node
interface PrivateNote {
  id:                   string;
  ephemeralPublicKey:   string;   // 33-byte compressed hex — published with note
  stealthPublicKey:     string;   // 33-byte compressed hex — one-time destination key
  commitment:           string;   // 33-byte compressed hex — Pedersen commitment
  encryptedPayload:     string;   // keccak-CTR encrypted { amount, blinding }
  status:               'unspent' | 'spent';
  keyImage:             string | null;  // set when spent, used for double-spend detection
  source:               'shield' | 'private-send';
  createdAtBlockHeight: number;
  createdAt:            string;   // ISO 8601
}

// Public ledger record (returned by all privacy write endpoints + GET /privacy/transactions)
interface ShieldedTxRecord {
  id:             string;
  type:           'shield' | 'private-send' | 'unshield';
  createdAt:      string;
  publicAddress:  string | null;   // null for private-send
  publicAmount:   string | null;   // null for private-send (wei string otherwise)
  fee:            string;          // wei string
  noteIdsCreated: string[];
  noteIdsSpent:   string[];
}

// Stealth meta-address
interface StealthMeta {
  spendPublicKey: string;   // 33-byte compressed secp256k1 hex
  viewPublicKey:  string;   // 33-byte compressed secp256k1 hex
}

// Ring signature
interface RingSignature {
  c0:       string;     // 0x-prefixed 32-byte scalar hex
  s:        string[];   // one response scalar per ring member
  keyImage: string;     // 33-byte compressed secp256k1 point hex
}
```
