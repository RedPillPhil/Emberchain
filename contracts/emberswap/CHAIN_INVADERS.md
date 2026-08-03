# Chain Invaders — deploy & launch (EMBR chain)

## Payout model

Winners do **not** claim. After 8pm Eastern the competition window closes and
`settleDay(dayId)` sends:

- **75%** of the pot → highest cumulative score
- **25%** → highest single-run score

(same address can win both).

`api-server` runs an **auto-settler** every 5 minutes that calls `settleDay` for
eligible past days. Anyone else can also call it (permissionless).

## Deploy on seed

```bash
cd ~/Emberchain/emberchain
git pull origin main

# Generate a dedicated game-signer key (do NOT reuse the bridge relayer key)
node -e "const {Wallet}=require('ethers'); const w=Wallet.createRandom(); console.log('address', w.address); console.log('key', w.privateKey)"

cd contracts/emberswap
npm ci   # or npm install if lockfile issues
export DEPLOYER_PRIVATE_KEY=0x...          # funded with EMBR for gas
export EMBR_RPC=http://127.0.0.1:8080/api/rpc
export GAME_SIGNER=0x...                   # address from the key above
npx hardhat run scripts/deploy-chain-invaders.ts --network embr
```

## Wire api-server + wallet

`/etc/emberchain/api-server.env`:

```bash
CHAIN_INVADERS_ADDRESS=0x...               # from deploy output
CHAIN_INVADERS_SIGNER_KEY=0x...            # private key matching GAME_SIGNER
# optional: CHAIN_INVADERS_SETTLER_KEY=0x...  # defaults to signer key; needs EMBR for gas
```

```bash
sudo systemctl restart emberchain-api
```

Wallet build (on seed via static deploy script, or set before build):

```bash
export VITE_CHAIN_INVADERS_ADDRESS=0x...
bash scripts/deploy-vm/deploy-static-from-git.sh
bash scripts/deploy-vm/deploy-api-server.sh
```

Manual settle (optional):

```bash
curl -X POST https://emberchain.org/api/chain-invaders/settle
```
