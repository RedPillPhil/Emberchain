/**
 * Token Launch Processor
 *
 * Background loop that advances token launches through their lifecycle:
 *
 *   payment_confirmed → deploying → live
 *
 * All chains use a unique server-side escrow address (no NativeBridge deploy).
 */

import { ethers } from "ethers";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "./logger";
import { getBaseProvider } from "./base-provider";
import {
  getLaunchesByStatus,
  updateLaunchStatus,
  type TokenLaunch,
} from "./launch-db";
import { deriveLaunchBridgeWallet } from "./launch-wallet";
import { upsertContractRecord } from "./contract-registry";
import {
  validateLaunchFeeRouting,
} from "./launch-fee-recipient";

const POLL_INTERVAL_MS = 30_000;

// ── Known addresses (Base mainnet) ────────────────────────────────────────────

// wEMBR on Base — the token we're adding liquidity for on every launch
const WEMBR_ADDRESS = "0x9362587019Ea0e4ef90fbd981c615d4441D9D2c4";
// Wrapped native ETH on Base (needed as Uniswap V2 swap path intermediary)
const WETH_BASE     = "0x4200000000000000000000000000000000000006";
// Uniswap V2 Router02 on Base mainnet
const UNISWAP_V2_ROUTER = "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24";
// ETH to keep in server wallet per launch for future relayer gas ops
const GAS_RESERVE_ETH = 0.003;

// ── Contract ABIs (minimal — sufficient for deployment calls) ─────────────────

const WRAPPED_TOKEN_ABI = [
  "constructor(string name_, string symbol_, uint8 decimals_, address bridge_)",
];

const UNIVERSAL_BRIDGE_ABI = [
  "function registerToken(address token) external",
  "function supportedTokens(address token) external view returns (bool)",
];

const UNISWAP_ROUTER_ABI = [
  "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)",
  "function addLiquidityETH(address token, uint amountTokenDesired, uint amountTokenMin, uint amountETHMin, address to, uint deadline) external payable returns (uint amountToken, uint amountETH, uint liquidity)",
];

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address owner) external view returns (uint256)",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function getRelayerWallet(provider: ethers.JsonRpcProvider): ethers.Wallet | null {
  const key = process.env["BRIDGE_RELAYER_PRIVATE_KEY"];
  if (!key) return null;
  return new ethers.Wallet(key.startsWith("0x") ? key : "0x" + key, provider);
}

function wrappedTokenArtifactPath(): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, "../../../contracts/emberswap/artifacts/contracts/WrappedToken.sol/WrappedToken.json"),
    path.resolve(here, "../../../../contracts/emberswap/artifacts/contracts/WrappedToken.sol/WrappedToken.json"),
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

async function deployWrappedToken(
  launch: TokenLaunch,
  wallet: ethers.Wallet,
): Promise<string | null> {
  try {
    const artifactPath = wrappedTokenArtifactPath();
    if (!artifactPath) {
      logger.error(
        "[launch-processor] WrappedToken artifact missing — run: cd contracts/emberswap && pnpm exec hardhat compile",
      );
      return null;
    }

    const artifact = JSON.parse(readFileSync(artifactPath, "utf8")) as {
      abi: ethers.InterfaceAbi;
      bytecode: string;
    };

    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);

    const universalBridgeAddress = process.env["UNIVERSAL_BRIDGE_ADDRESS"] ?? "";
    if (!universalBridgeAddress) {
      logger.warn("[launch-processor] UNIVERSAL_BRIDGE_ADDRESS not set — skipping deployment");
      return null;
    }

    const contract = await factory.deploy(
      `Wrapped ${launch.token_name}`,
      launch.wrapped_symbol,
      launch.decimals,
      universalBridgeAddress,
    );
    await contract.waitForDeployment();
    return await contract.getAddress();
  } catch (err) {
    logger.error({ err }, "[launch-processor] deployWrappedToken failed");
    return null;
  }
}

async function registerOnUniversalBridge(
  wrappedTokenAddress: string,
  wallet: ethers.Wallet,
): Promise<boolean> {
  try {
    const bridgeAddr = process.env["UNIVERSAL_BRIDGE_ADDRESS"] ?? "";
    if (!bridgeAddr) return false;

    const bridge = new ethers.Contract(bridgeAddr, UNIVERSAL_BRIDGE_ABI, wallet);
    const already = await bridge.supportedTokens(wrappedTokenAddress);
    if (already) {
      logger.info({ wrappedTokenAddress }, "[launch-processor] token already registered on UniversalBridge");
      return true;
    }

    const tx = await bridge.registerToken(wrappedTokenAddress);
    await tx.wait(1);
    return true;
  } catch (err) {
    logger.error({ err }, "[launch-processor] registerOnUniversalBridge failed");
    return false;
  }
}


/**
 * Use the launch fee ETH to add wEMBR/ETH liquidity on Uniswap V2.
 *
 * Why: every token launch fees fund the wEMBR ecosystem — the ETH
 * from the $20 listing fee (minus a gas reserve) is split evenly:
 *   - Half swapped ETH → wEMBR via Uniswap V2
 *   - Both halves added as wEMBR/ETH LP; LP tokens held by the server wallet
 *
 * This is non-fatal — the launch goes live regardless.
 */
async function addWEMBRLiquidity(
  launch: TokenLaunch,
  wallet: ethers.Wallet,
  deployGasSpentWei: bigint,
): Promise<void> {
  try {
    const provider = wallet.provider!;
    const balance = await provider.getBalance(wallet.address);
    const gasReserve = ethers.parseEther(GAS_RESERVE_ETH.toString());

    // Use this launch's verified fee amount — not the entire relayer wallet balance.
    let feeWei = 0n;
    if (launch.fee_amount_eth && launch.fee_amount_eth !== "dev" && launch.fee_amount_eth !== "unknown") {
      try {
        feeWei = ethers.parseEther(launch.fee_amount_eth);
      } catch {
        logger.warn({ id: launch.id, fee: launch.fee_amount_eth }, "[launch-processor] invalid fee_amount_eth");
      }
    }

    let liquidityEthTotal: bigint;
    if (feeWei > 0n) {
      const afterDeploy = feeWei > deployGasSpentWei ? feeWei - deployGasSpentWei : 0n;
      const maxFromBalance = balance > gasReserve ? balance - gasReserve : 0n;
      liquidityEthTotal = afterDeploy < maxFromBalance ? afterDeploy : maxFromBalance;
    } else {
      liquidityEthTotal = balance > gasReserve ? balance - gasReserve : 0n;
    }

    // Need enough for swap + LP (roughly 0.002 ETH minimum on Base)
    const minLp = ethers.parseEther("0.002");
    if (liquidityEthTotal < minLp) {
      logger.warn(
        {
          id: launch.id,
          liquidityEthTotal: liquidityEthTotal.toString(),
          feeWei: feeWei.toString(),
          deployGasSpentWei: deployGasSpentWei.toString(),
        },
        "[launch-processor] fee too small for wEMBR/ETH LP after deploy gas — skipping",
      );
      return;
    }

    // Split 50/50: half buys wEMBR, half stays as ETH for the LP pair
    const ethForSwap = liquidityEthTotal / 2n;
    const ethForLP   = liquidityEthTotal - ethForSwap; // remaining half

    const router = new ethers.Contract(UNISWAP_V2_ROUTER, UNISWAP_ROUTER_ABI, wallet);
    const wembr  = new ethers.Contract(WEMBR_ADDRESS, ERC20_ABI, wallet);

    // ── Step 1: swap ETH → wEMBR ─────────────────────────────────────────────
    logger.info(
      { id: launch.id, ethForSwap: ethers.formatEther(ethForSwap) },
      "[launch-processor] swapping ETH → wEMBR...",
    );
    const swapTx = await router.swapExactETHForTokens(
      0n,                                   // amountOutMin — accept any (we control timing)
      [WETH_BASE, WEMBR_ADDRESS],           // path: WETH → wEMBR
      wallet.address,                       // wEMBR lands in server wallet
      Math.floor(Date.now() / 1000) + 600,  // deadline: 10 min
      { value: ethForSwap },
    );
    await swapTx.wait(1);

    const wembrBalance = await wembr.balanceOf(wallet.address);
    if (wembrBalance === 0n) {
      logger.warn({ id: launch.id }, "[launch-processor] swap returned 0 wEMBR — skipping LP");
      return;
    }

    // ── Step 2: approve router to spend wEMBR ────────────────────────────────
    const approveTx = await wembr.approve(UNISWAP_V2_ROUTER, wembrBalance);
    await approveTx.wait(1);

    // ── Step 3: add wEMBR/ETH liquidity ──────────────────────────────────────
    logger.info(
      {
        id: launch.id,
        wembrAmount: wembrBalance.toString(),
        ethForLP: ethers.formatEther(ethForLP),
      },
      "[launch-processor] adding wEMBR/ETH liquidity...",
    );
    const addTx = await router.addLiquidityETH(
      WEMBR_ADDRESS,
      wembrBalance, // amountTokenDesired
      0n,           // amountTokenMin — accept any
      0n,           // amountETHMin   — accept any
      wallet.address, // LP tokens stay with server wallet
      Math.floor(Date.now() / 1000) + 600,
      { value: ethForLP },
    );
    const receipt = await addTx.wait(1);

    logger.info(
      { id: launch.id, txHash: receipt.hash, ethUsed: ethers.formatEther(liquidityEthTotal) },
      "[launch-processor] ✅ wEMBR/ETH liquidity added — LP tokens held by server",
    );
  } catch (err) {
    logger.error({ err, id: launch.id }, "[launch-processor] addWEMBRLiquidity failed (non-fatal)");
  }
}

// ── Step handlers ─────────────────────────────────────────────────────────────

async function handlePaymentConfirmed(launch: TokenLaunch): Promise<void> {
  if (!launch.bridge_wallet_address) {
    try {
      const wallet = deriveLaunchBridgeWallet({
        launchId: launch.id,
        chainType: launch.chain_type,
        cryptography: launch.cryptography,
        addressFormat: launch.address_format,
        utxoNetwork: launch.utxo_network,
      });
      await updateLaunchStatus(launch.id, "deploying", {
        bridge_wallet_address: wallet.address,
        bridge_wallet_type: wallet.type,
        bridge_private_key_encrypted: wallet.privateKeyEncrypted,
        native_bridge_address: wallet.address,
      });
      logger.info({ id: launch.id, wallet: wallet.address }, "[launch-processor] escrow wallet derived");
      launch = { ...launch, bridge_wallet_address: wallet.address, native_bridge_address: wallet.address };
    } catch (err) {
      logger.error({ err, id: launch.id }, "[launch-processor] escrow wallet derivation failed");
      await updateLaunchStatus(launch.id, "failed", {
        error_msg: err instanceof Error ? err.message : String(err),
      });
      return;
    }
  } else if (!launch.native_bridge_address) {
    await updateLaunchStatus(launch.id, "deploying", {
      native_bridge_address: launch.bridge_wallet_address,
    });
  } else {
    await updateLaunchStatus(launch.id, "deploying");
  }

  logger.info(
    { id: launch.id, escrow: launch.bridge_wallet_address, status: "deploying" },
    "[launch-processor] advancing to deploy wrapped token on Base",
  );
}

async function handlePendingGas(launch: TokenLaunch): Promise<void> {
  await updateLaunchStatus(launch.id, "deploying", {
    native_bridge_address: launch.bridge_wallet_address ?? launch.native_bridge_address,
  });
  logger.info({ id: launch.id }, "[launch-processor] legacy pending_gas → deploying (escrow model)");
}

async function handleDeploying(launch: TokenLaunch): Promise<void> {
  const baseProvider = getBaseProvider();
  if (!baseProvider) {
    logger.warn("[launch-processor] BASE_RPC_URL not set — cannot deploy");
    return;
  }

  const wallet = getRelayerWallet(baseProvider);
  if (!wallet) {
    logger.warn("[launch-processor] BRIDGE_RELAYER_PRIVATE_KEY not set — cannot deploy");
    return;
  }

  const balanceBefore = await baseProvider.getBalance(wallet.address);

  const universalBridgeAddress = process.env["UNIVERSAL_BRIDGE_ADDRESS"] ?? "";
  if (!universalBridgeAddress) {
    // Can't deploy without a live UniversalBridge — this is expected before initial contract deployment
    logger.info({ id: launch.id }, "[launch-processor] waiting for UNIVERSAL_BRIDGE_ADDRESS");
    return;
  }

  // Deploy wrapped token on Base
  const wrappedTokenAddress = await deployWrappedToken(launch, wallet);
  if (!wrappedTokenAddress) {
    await updateLaunchStatus(launch.id, "failed", {
      error_msg: "Failed to deploy wrapped token on Base.",
    });
    return;
  }

  logger.info({ id: launch.id, wrappedTokenAddress }, "[launch-processor] wrapped token deployed");

  // Register on UniversalBridge (required for bridgeIn minting)
  const registered = await registerOnUniversalBridge(wrappedTokenAddress, wallet);
  if (!registered) {
    await updateLaunchStatus(launch.id, "failed", {
      error_msg: "Failed to register wrapped token on UniversalBridge — check relayer is contract owner.",
    });
    return;
  }

  const balanceAfter = await baseProvider.getBalance(wallet.address);
  const deployGasSpentWei = balanceBefore > balanceAfter ? balanceBefore - balanceAfter : 0n;

  // Listing fee ETH → wEMBR/ETH Uniswap V2 LP (same relayer wallet that received the fee)
  await addWEMBRLiquidity(launch, wallet, deployGasSpentWei);

  const escrowAddress = launch.bridge_wallet_address ?? launch.native_bridge_address;

  await updateLaunchStatus(launch.id, "live", {
    wrapped_token_address: wrappedTokenAddress,
    universal_bridge_address: universalBridgeAddress,
    native_bridge_address: escrowAddress,
    bridge_wallet_address: escrowAddress,
  });

  // Register the wrapped token in the DEX token registry so it auto-appears
  // in the EmberDelta pair selector without users having to add it manually.
  try {
    await upsertContractRecord({
      address: wrappedTokenAddress,
      name: `Wrapped ${launch.token_name}`,
      symbol: launch.wrapped_symbol,
      decimals: launch.decimals,
      isToken: true,
      creator: wallet.address,
    });
    logger.info({ id: launch.id, wrappedTokenAddress }, "[launch-processor] token registered in DEX registry");
  } catch (err) {
    logger.warn({ err, id: launch.id }, "[launch-processor] DEX registry upsert failed (non-fatal)");
  }

  logger.info({ id: launch.id, wrappedTokenAddress }, "[launch-processor] launch is LIVE");
}

// ── Main loop ─────────────────────────────────────────────────────────────────

async function runOnce(): Promise<void> {
  try {
    const [confirmed, pendingGas, deploying] = await Promise.all([
      getLaunchesByStatus("payment_confirmed"),
      getLaunchesByStatus("pending_gas"),
      getLaunchesByStatus("deploying"),
    ]);

    await Promise.all([
      ...confirmed.map((l) => handlePaymentConfirmed(l)),
      ...pendingGas.map((l) => handlePendingGas(l)),
      ...deploying.map((l) => handleDeploying(l)),
    ]);
  } catch (err) {
    logger.error({ err }, "[launch-processor] runOnce error");
  }
}

export function startLaunchProcessor(): void {
  validateLaunchFeeRouting();
  logger.info("[launch-processor] starting");
  void runOnce();
  setInterval(() => { void runOnce(); }, POLL_INTERVAL_MS);
}
