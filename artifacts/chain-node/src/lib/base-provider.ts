import { ethers } from "ethers";

let provider: ethers.JsonRpcProvider | null | undefined;

/** Default public Base RPC — used to verify EmberDelta trade() receipts. */
const DEFAULT_BASE_RPC = "https://mainnet.base.org";

export function getBaseProvider(): ethers.JsonRpcProvider | null {
  if (provider !== undefined) return provider;
  const url = (process.env.BASE_RPC_URL ?? "").trim() || DEFAULT_BASE_RPC;
  try {
    provider = new ethers.JsonRpcProvider(url);
  } catch {
    provider = null;
  }
  return provider;
}
