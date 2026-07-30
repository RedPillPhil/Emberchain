/**
 * Deploy TokenLaunchFee + UniversalBridge to Base Mainnet.
 *
 * Usage:
 *   pnpm exec hardhat run scripts/deploy-launch-contracts.ts --network base
 *
 * Required env vars:
 *   DEPLOYER_PRIVATE_KEY  — wallet that pays gas, becomes owner, receives launch fees
 *   BASE_MAINNET_RPC      — RPC endpoint
 *
 * The launch-fee treasury is the deployer address itself so that the $20
 * fee goes directly to the address that will auto-add liquidity.
 * The UniversalBridge relayer is also the deployer (same key pair).
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  console.log("Deployer:", deployer.address);
  console.log("Network:", network.name, "chainId:", network.chainId.toString());

  if (network.chainId !== 8453n) {
    throw new Error(`Expected Base mainnet (8453), got ${network.chainId}`);
  }

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH");

  // ── 1. TokenLaunchFee ─────────────────────────────────────────────────────
  // Treasury = deployer: launch fees fund auto-liquidity operations.
  // minFeeWei = 0 at deploy; server sets it dynamically per ETH/USD price.
  console.log("\n[1/2] Deploying TokenLaunchFee...");
  const FeeFactory = await ethers.getContractFactory("TokenLaunchFee");
  const launchFee = await FeeFactory.deploy(
    deployer.address, // treasury = deployer
    0n                // minFeeWei (server controls dynamically)
  );
  await launchFee.waitForDeployment();
  const launchFeeAddr = await launchFee.getAddress();
  console.log("  TokenLaunchFee:", launchFeeAddr);

  // ── 2. UniversalBridge ────────────────────────────────────────────────────
  // Relayer = deployer key (same wallet relays EMBR bridge too).
  console.log("\n[2/2] Deploying UniversalBridge...");
  const BridgeFactory = await ethers.getContractFactory("UniversalBridge");
  const bridge = await BridgeFactory.deploy(deployer.address); // relayer = deployer
  await bridge.waitForDeployment();
  const bridgeAddr = await bridge.getAddress();
  console.log("  UniversalBridge:", bridgeAddr);

  // ── Update deployed-addresses ─────────────────────────────────────────────
  const outPath = path.join(__dirname, "..", "deployed-addresses.mainnet.json");
  const existing = JSON.parse(fs.readFileSync(outPath, "utf8"));
  existing.contracts.TokenLaunchFee = launchFeeAddr;
  existing.contracts.UniversalBridge = bridgeAddr;
  existing.launchContractsDeployedAt = new Date().toISOString();
  fs.writeFileSync(outPath, JSON.stringify(existing, null, 2));

  console.log("\n✅ Launch contracts deployed.");
  console.log(JSON.stringify({ TokenLaunchFee: launchFeeAddr, UniversalBridge: bridgeAddr }, null, 2));

  console.log("\n--- Set these env vars ---");
  console.log(`TOKEN_LAUNCH_FEE_ADDRESS=${launchFeeAddr}`);
  console.log(`UNIVERSAL_BRIDGE_ADDRESS=${bridgeAddr}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
