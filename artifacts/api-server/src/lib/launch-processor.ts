/**
 * Token Launch Processor
 *
 * Background loop that advances token launches through their lifecycle:
 *
 *   payment_confirmed
 *     → derive bridge wallet
 *     → EVM chains:     pending_gas  (wait for user to fund gas)
 *     → non-EVM chains: deploying    (escrow wallet only, no native contract)
 *
 *   pending_gas
 *     → check if bridge wallet has gas on native chain
 *     → if funded: deploying
 *
 *   deploying
 *     → deploy WrappedToken on Base
 *     → register on UniversalBridge
 *     → EVM chains: deploy NativeBridge on native chain
 *     → live
 */

import { ethers } from "ethers";
import { logger } from "./logger";
import { getBaseProvider } from "./base-provider";
import {
  getLaunchesByStatus,
  updateLaunchStatus,
  type TokenLaunch,
} from "./launch-db";
import { getStaticBridgeAddress } from "./chain-adapters/index";
import { upsertContractRecord } from "./contract-registry";

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

async function deployWrappedToken(
  launch: TokenLaunch,
  wallet: ethers.Wallet,
): Promise<string | null> {
  try {
    // Load compiled artifact (available after `pnpm --filter @emberchain/contracts compile`)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const artifact = require("../../../../contracts/emberswap/artifacts/contracts/WrappedToken.sol/WrappedToken.json") as {
      abi: unknown[];
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
): Promise<void> {
  try {
    const provider = wallet.provider!;
    const balance = await provider.getBalance(wallet.address);

    // Keep a gas reserve for future relayer operations
    const gasReserve = ethers.parseEther(GAS_RESERVE_ETH.toString());
    if (balance <= gasReserve) {
      logger.warn(
        { id: launch.id, balance: balance.toString() },
        "[launch-processor] server balance too low for wEMBR liquidity — skipping",
      );
      return;
    }

    // Total ETH available for liquidity (wallet balance minus gas reserve)
    const liquidityEthTotal = balance - gasReserve;

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
  let wallet;
  try {
    wallet = getStaticBridgeAddress(
      launch.chain_type,
      launch.cryptography ?? "secp256k1",
      launch.address_format ?? "hex",
      launch.utxo_network ?? "bitcoin",
    );
  } catch (err) {
    logger.error({ err, id: launch.id }, "[launch-processor] static bridge address lookup failed");
    await updateLaunchStatus(launch.id, "failed", {
      error_msg: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  const nextStatus = launch.chain_type === "evm" ? "pending_gas" : "deploying";

  // For non-EVM chains the bridge wallet IS the deposit address — set it
  // immediately so the UI can display it without waiting for handleDeploying.
  // For EVM chains native_bridge_address is the NativeBridge contract address
  // (deployed later), so we don't pre-populate it here.
  const nativeBridgeAddress = launch.chain_type !== "evm" ? wallet.address : undefined;

  await updateLaunchStatus(launch.id, nextStatus, {
    bridge_wallet_address: wallet.address,
    bridge_wallet_type: wallet.type,
    native_bridge_address: nativeBridgeAddress,
  });

  logger.info(
    {
      id: launch.id,
      wallet: wallet.address,
      type: wallet.type,
      status: nextStatus,
      native_bridge_address: nativeBridgeAddress,
    },
    "[launch-processor] static bridge address assigned",
  );
}

async function handlePendingGas(launch: TokenLaunch): Promise<void> {
  if (!launch.rpc_url || !launch.bridge_wallet_address) return;

  try {
    const provider = new ethers.JsonRpcProvider(launch.rpc_url);
    const balance = await provider.getBalance(launch.bridge_wallet_address);

    // Require at least 0.01 native coins for gas
    const MIN_GAS = ethers.parseEther("0.01");
    if (balance >= MIN_GAS) {
      await updateLaunchStatus(launch.id, "deploying");
      logger.info({ id: launch.id }, "[launch-processor] gas funded → deploying");
    }
  } catch (err) {
    logger.warn({ err, id: launch.id }, "[launch-processor] gas check failed (will retry)");
  }
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

  // Register on UniversalBridge
  await registerOnUniversalBridge(wrappedTokenAddress, wallet);

  // Use fee ETH to add wEMBR/ETH liquidity — benefits the EMBR ecosystem
  await addWEMBRLiquidity(launch, wallet);

  // For non-EVM chains the native deposit address is the bridge wallet that was
  // assigned in handlePaymentConfirmed.  Re-assert it here so the field is
  // always populated on the final record even if the earlier step pre-dated
  // this logic (e.g. launches that were already in deploying state).
  const nativeBridgeAddress =
    launch.chain_type !== "evm"
      ? (launch.native_bridge_address ?? launch.bridge_wallet_address ?? undefined)
      : undefined;

  await updateLaunchStatus(launch.id, "live", {
    wrapped_token_address: wrappedTokenAddress,
    universal_bridge_address: universalBridgeAddress,
    native_bridge_address: nativeBridgeAddress,
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
  logger.info("[launch-processor] starting");
  void runOnce();
  setInterval(() => { void runOnce(); }, POLL_INTERVAL_MS);
}
