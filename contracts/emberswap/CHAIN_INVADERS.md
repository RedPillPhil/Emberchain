# Chain Invaders — deploy & launch (EMBR chain)

## Entry & practice

- **Practice:** play anytime — no entry required; scores stay local.
- **Enter:** 500 EMBR anytime after the previous contest ends, until this
  contest's noon–8pm Eastern window closes (overnight pre-registration allowed).
- **Scored runs:** only during noon–8pm Eastern, and only if you've entered.

## Payout model

Winners do **not** claim. After 8pm Eastern the competition window closes and
`settleDay(dayId)` sends:

- **75%** of the pot → highest cumulative score
- **25%** → highest single-run score

(same address can win both).

`api-server` runs an **auto-settler** every 5 minutes that calls `settleDay` for
eligible past days. Anyone else can also call it (permissionless).

---

## Full launch on seed (`emberchain-seed-1`)

SSH in, then run in order. Replace every `0x...` with real values from the
steps that generate them.

### 1. Pull latest

```bash
cd ~/Emberchain/emberchain   # or /root/Emberchain/emberchain
git pull origin main
```

### 2. Make a dedicated game-signer key

Do **not** reuse the bridge relayer key. Save both lines somewhere safe
(password manager / root-only file) — you need the **address** for deploy and
the **private key** for api-server.

```bash
cd ~/Emberchain/emberchain
node -e "const {Wallet}=require('ethers'); const w=Wallet.createRandom(); console.log('address', w.address); console.log('key', w.privateKey)"
```

Example output:

```
address 0xGameSignerAddress...
key     0xGameSignerPrivateKey...
```

### 3. Deploy `ChainInvaders.sol`

`DEPLOYER_PRIVATE_KEY` must be a wallet that already has EMBR for gas on chain
7773. RPC hits local chain-node through nginx/api.

```bash
cd ~/Emberchain/emberchain/contracts/emberswap
npm ci   # or: npm install

export DEPLOYER_PRIVATE_KEY=0xYourDeployerKey...
export EMBR_RPC=http://127.0.0.1:8080/api/rpc
export GAME_SIGNER=0xGameSignerAddress...

npx hardhat run scripts/deploy-chain-invaders.ts --network embr
```

Copy the printed address, e.g.:

```
ChainInvaders deployed: 0xContractAddress...
```

### 4. Wire api-server env

```bash
sudo nano /etc/emberchain/api-server.env
```

Add / uncomment:

```bash
CHAIN_INVADERS_ADDRESS=0xContractAddress...
CHAIN_INVADERS_SIGNER_KEY=0xGameSignerPrivateKey...
# optional — defaults to signer key; needs a little EMBR for settle gas
# CHAIN_INVADERS_SETTLER_KEY=0x...
```

Redeploy / restart api:

```bash
cd ~/Emberchain/emberchain
bash scripts/deploy-vm/deploy-api-server.sh
# or if unit already installed:
# sudo systemctl restart emberchain-api
```

### 5. Rebuild wallet with contract address + publish static

`deploy-static-from-git.sh` runs `git pull` again and builds — export the
Vite var **before** the script so the wallet bakes in the address.

```bash
cd ~/Emberchain/emberchain
export VITE_CHAIN_INVADERS_ADDRESS=0xContractAddress...
bash scripts/deploy-vm/deploy-static-from-git.sh
```

### 6. Rebuild chain-node (DEV block boost + any core changes)

```bash
cd ~/Emberchain/emberchain
pnpm --filter @workspace/chain-node run build
sudo systemctl restart emberchain-node
```

### 7. Smoke check

```bash
curl -s http://127.0.0.1:8080/api/healthz
sudo systemctl status emberchain-api --no-pager
curl -s -X POST https://emberchain.org/api/chain-invaders/settle
# open https://emberchain.org/chain-invaders — Enter should talk to the contract
```

Manual settle (optional, permissionless on-chain too):

```bash
curl -X POST https://emberchain.org/api/chain-invaders/settle
```

---

## Env cheat sheet

| Where | Var | Value |
|--------|-----|--------|
| hardhat deploy | `DEPLOYER_PRIVATE_KEY` | funded EMBR wallet |
| hardhat deploy | `EMBR_RPC` | `http://127.0.0.1:8080/api/rpc` |
| hardhat deploy | `GAME_SIGNER` | game-signer **address** |
| `/etc/emberchain/api-server.env` | `CHAIN_INVADERS_ADDRESS` | deploy output |
| `/etc/emberchain/api-server.env` | `CHAIN_INVADERS_SIGNER_KEY` | game-signer **private key** |
| wallet build | `VITE_CHAIN_INVADERS_ADDRESS` | same contract address |
