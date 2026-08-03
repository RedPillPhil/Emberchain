import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY ?? "0x" + "a".repeat(64);
const BASE_SEPOLIA_RPC = process.env.BASE_SEPOLIA_RPC ?? "https://sepolia.base.org";
const BASE_MAINNET_RPC = process.env.BASE_MAINNET_RPC ?? "https://mainnet.base.org";
// Verification goes through Etherscan's unified V2 API, so this is an Etherscan
// key, not a Basescan one. BASESCAN_API_KEY stays accepted for existing setups.
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY ?? process.env.BASESCAN_API_KEY ?? "";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      evmVersion: "paris",
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    "base-sepolia": {
      url: BASE_SEPOLIA_RPC,
      chainId: 84532,
      accounts: [DEPLOYER_PRIVATE_KEY],
    },
    base: {
      url: BASE_MAINNET_RPC,
      chainId: 8453,
      accounts: [DEPLOYER_PRIVATE_KEY],
    },
    // EMBR chain — for deploying EmberBridge.sol
    embr: {
      url: process.env.EMBR_RPC ?? "http://localhost:3001",
      chainId: 7773,
      accounts: [DEPLOYER_PRIVATE_KEY],
    },
  },
  etherscan: {
    // One Etherscan key covers every chain under the V2 API.  There is
    // deliberately no customChains block: the per-chain V1 endpoints this used to
    // point at (api.basescan.org) were shut down on 2025-08-15, and hardhat-verify
    // already knows how to reach Base through the unified V2 endpoint.
    apiKey: ETHERSCAN_API_KEY,
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};

export default config;
