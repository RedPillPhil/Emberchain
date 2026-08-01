import { useCallback, useEffect, useState } from "react";
import { Wallet, JsonRpcProvider, Contract } from "ethers";
import {
  BASE_BRIDGE_ABI,
  BASE_RPC_URL,
  EMBERCHAIN_BRIDGE_ADDRESS,
} from "@/lib/bridge-contracts";

const SESSION_KEY = "ember_relayer_session";

export interface RelayerSession {
  privateKey: string;
  address: string;
}

function normalizeKey(key: string): string {
  const trimmed = key.trim();
  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
}

export function useRelayerAuth() {
  const [session, setSession] = useState<RelayerSession | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) setSession(JSON.parse(raw) as RelayerSession);
    } catch {
      sessionStorage.removeItem(SESSION_KEY);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  const login = useCallback(async (privateKeyInput: string) => {
    const privateKey = normalizeKey(privateKeyInput);
    const wallet = new Wallet(privateKey);
    const provider = new JsonRpcProvider(BASE_RPC_URL);
    const bridge = new Contract(EMBERCHAIN_BRIDGE_ADDRESS, BASE_BRIDGE_ABI, provider);
    const onChainRelayer = (await bridge.relayer()) as string;

    if (wallet.address.toLowerCase() !== onChainRelayer.toLowerCase()) {
      throw new Error(
        `This key is not the bridge relayer. Expected ${onChainRelayer}, got ${wallet.address}`,
      );
    }

    const next: RelayerSession = { privateKey, address: wallet.address };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
    setSession(next);
    return next;
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY);
    setSession(null);
  }, []);

  return { session, isLoaded, login, logout };
}
