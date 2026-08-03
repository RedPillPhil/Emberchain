/**
 * Deploy ChainInvaders.sol to the EMBR chain (chain ID 7773).
 *
 * Usage:
 *   GAME_SIGNER=0x... pnpm hardhat run scripts/deploy-chain-invaders.ts --network embr
 *
 * Required env:
 *   DEPLOYER_PRIVATE_KEY
 *   EMBR_RPC
 *   GAME_SIGNER — address of the api-server key that ECDSA-signs play rewards
 *                 (falls back to SCORE_ORACLE for older env names)
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  console.log("Deployer:", deployer.address);
  console.log("Network chainId:", network.chainId.toString());

  const gameSigner =
    process.env.GAME_SIGNER || process.env.SCORE_ORACLE || deployer.address;
  console.log("Game signer (ECDSA):", gameSigner);

  console.log("\nDeploying ChainInvaders...");
  const Factory = await ethers.getContractFactory("ChainInvaders");
  const game = await Factory.deploy(gameSigner);
  await game.waitForDeployment();
  const addr = await game.getAddress();
  console.log("  ChainInvaders deployed:", addr);

  const addressFile = path.join(__dirname, "..", "deployed-addresses.json");
  if (fs.existsSync(addressFile)) {
    const existing = JSON.parse(fs.readFileSync(addressFile, "utf8"));
    existing.contracts = existing.contracts || {};
    existing.contracts.ChainInvaders = addr;
    existing.embrChainId = 7773;
    fs.writeFileSync(addressFile, JSON.stringify(existing, null, 2));
    console.log("  Updated deployed-addresses.json");
  } else {
    fs.writeFileSync(
      path.join(__dirname, "..", "deployed-addresses.chain-invaders.json"),
      JSON.stringify({ ChainInvaders: addr, chainId: 7773, gameSigner }, null, 2),
    );
  }

  console.log("\n✅ ChainInvaders deployed.");
  console.log("   Entry fee: 500 EMBR");
  console.log("   Payouts: 75% cumulative · 25% best single run");
  console.log("   Window: 16:00–24:00 UTC (noon–8pm Eastern Daylight Time)");
  console.log("   Anti-cheat: commit–reveal + ECDSA game-server signatures");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
