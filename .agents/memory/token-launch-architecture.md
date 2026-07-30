---
name: Token Launch Architecture
description: EmberDelta Universal Token Launch system — contracts, backend, and frontend
---

# Token Launch Architecture

## Contracts (contracts/emberswap/contracts/)
- `WrappedToken.sol` — generic ERC-20, parameterized name/symbol/decimals, bridge-controlled mint/burn
- `UniversalBridge.sol` — Base-side multi-token bridge; 0.5% fee to `0xa8F6eFC25896c24ac6c9441f9f693C14517aa818`; onlyRelayer bridgeIn, public bridgeOut
- `TokenLaunchFee.sol` — collects ~$20 ETH launch fee, forwards to treasury, emits `LaunchFeeReceived(payer, launchId, amount)`
- `NativeBridge.sol` — generic EVM native chain lock/release bridge (like EmberBridge but parameterized)

**Why:** WrappedEMBR/EmberchainBridge are EMBR-specific. New tokens need generic versions.

## Backend (artifacts/api-server/src/)
- `lib/launch-db.ts` — `token_launches` table, status flow: pending_payment → payment_confirmed → pending_gas (EVM) / deploying (non-EVM) → live | failed
- `lib/chain-adapters/index.ts` — `deriveBridgeWallet(chainType, cryptography, addressFormat)`:
  - EVM / secp256k1+hex → computeAddress from BRIDGE_RELAYER_PRIVATE_KEY (same across all EVM)
  - UTXO secp256k1+base58 → SHA256→RIPEMD160→Base58Check P2PKH derivation from same key
  - ed25519/privacy/custom → type="manual", returns null (requires dedicated wallet)
- `lib/launch-processor.ts` — polls every 30s; handles payment_confirmed (wallet derivation), pending_gas (native balance check), deploying (Base contract deployment via ethers ContractFactory)
- `routes/token-launch.ts` — GET /token-launch/fee (CoinGecko ETH/USD, $20 target, 60s cache); POST /submit; GET /listings; GET /:id; POST /:id/verify-payment (checks Base tx receipt)

**Why:** UniversalBridge must be deployed before `deploying` status actually deploys wrapped tokens. Set `UNIVERSAL_BRIDGE_ADDRESS` env var after deploying UniversalBridge to Base.

## Frontend (artifacts/ember-delta/src/pages/Launch.tsx)
4-step wizard:
1. Token Info (symbol auto-prefixed w, chain type selector)
2. Technical Details (RPC, chain ID, cryptography, address format, tx model, decimals, confirmations)
3. Pay Fee (useSendTransaction wagmi, sends ETH to FEE_RECIPIENT on Base chainId 8453)
4. Track Status (polls GET /api/token-launch/:id every 8s, shows bridge wallet for gas funding)

**Fee recipient for launch payment:** same address `0xa8F6eFC25896c24ac6c9441f9f693C14517aa818`

## Deployed addresses (Base Mainnet, chainId 8453)
- `TokenLaunchFee`: `0x2Cf79aaf301a6c41F03eB7C2667564949F44c0ce` — treasury = deployer (launch fees fund auto-liquidity)
- `UniversalBridge`: `0x6F86927ee98757eB478cc5be8696Ee9927eDa3E2` — relayer = deployer; FEE_RECIPIENT = `0xa8F6eFC25896c24ac6c9441f9f693C14517aa818`

## ENV vars (all set in shared environment)
- `TOKEN_LAUNCH_FEE_ADDRESS` = `0x2Cf79aaf301a6c41F03eB7C2667564949F44c0ce`
- `UNIVERSAL_BRIDGE_ADDRESS` = `0x6F86927ee98757eB478cc5be8696Ee9927eDa3E2`
- `BRIDGE_RELAYER_PRIVATE_KEY` — already set; reused for bridge wallet derivation

## Compilation
Run: `cd contracts/emberswap && DO_NOT_TRACK=1 pnpm exec hardhat compile`
Artifacts at: `contracts/emberswap/artifacts/contracts/<Name>.sol/<Name>.json`
