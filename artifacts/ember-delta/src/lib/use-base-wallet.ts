/**
 * Injected MetaMask hook for Base Mainnet (same backend as EmberSwap bridge).
 */
import { useState, useEffect, useCallback } from "react";

interface EIP1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on(event: string, handler: (...args: unknown[]) => void): void;
  removeListener(event: string, handler: (...args: unknown[]) => void): void;
}

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

const TARGET_CHAIN_ID_INT = parseInt(import.meta.env.VITE_BASE_CHAIN_ID ?? "8453", 10);
const TARGET_CHAIN_HEX = "0x" + TARGET_CHAIN_ID_INT.toString(16);

const RPC_BY_CHAIN: Record<number, string> = {
  8453: "https://mainnet.base.org",
  84532: "https://sepolia.base.org",
};

const EXPLORER_BY_CHAIN: Record<number, string> = {
  8453: "https://basescan.org",
  84532: "https://sepolia.basescan.org",
};

const BASE_CHAIN_PARAMS =
  TARGET_CHAIN_ID_INT === 8453
    ? {
        chainId: TARGET_CHAIN_HEX,
        chainName: "Base",
        rpcUrls: [RPC_BY_CHAIN[8453]],
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        blockExplorerUrls: [EXPLORER_BY_CHAIN[8453]],
      }
    : {
        chainId: TARGET_CHAIN_HEX,
        chainName: "Base Sepolia",
        rpcUrls: [RPC_BY_CHAIN[84532]],
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        blockExplorerUrls: [EXPLORER_BY_CHAIN[84532]],
      };

export interface BaseWallet {
  address: string;
  chainId: number;
}

export function useBaseWallet() {
  const [wallet, setWallet] = useState<BaseWallet | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasMetaMask = typeof window !== "undefined" && !!window.ethereum;

  const refreshState = useCallback(async () => {
    if (!window.ethereum) return;
    try {
      const [accounts, chainIdHex] = await Promise.all([
        window.ethereum.request({ method: "eth_accounts" }) as Promise<string[]>,
        window.ethereum.request({ method: "eth_chainId" }) as Promise<string>,
      ]);
      if (accounts[0]) {
        setWallet({ address: accounts[0], chainId: parseInt(chainIdHex, 16) });
      } else {
        setWallet(null);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    refreshState();
    const eth = window.ethereum;
    if (!eth) return;
    eth.on("accountsChanged", refreshState);
    eth.on("chainChanged", refreshState);
    return () => {
      eth.removeListener("accountsChanged", refreshState);
      eth.removeListener("chainChanged", refreshState);
    };
  }, [refreshState]);

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      setError("MetaMask not detected.");
      return;
    }
    setIsConnecting(true);
    setError(null);
    try {
      const accounts = (await window.ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];
      const chainIdHex = (await window.ethereum.request({
        method: "eth_chainId",
      })) as string;
      setWallet({ address: accounts[0], chainId: parseInt(chainIdHex, 16) });
    } catch (err) {
      setError((err as Error).message ?? "Connection rejected");
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const switchToBase = useCallback(async () => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: TARGET_CHAIN_HEX }],
      });
    } catch (err: unknown) {
      if ((err as { code?: number }).code === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [BASE_CHAIN_PARAMS],
        });
      }
    }
    await refreshState();
  }, [refreshState]);

  const ethCall = useCallback(async (to: string, data: string): Promise<string> => {
    if (!window.ethereum) throw new Error("No provider");
    return window.ethereum.request({
      method: "eth_call",
      params: [{ to, data }, "latest"],
    }) as Promise<string>;
  }, []);

  const sendTx = useCallback(
    async (params: { to: string; data: string; value?: string; from?: string }): Promise<string> => {
      if (!window.ethereum) throw new Error("No provider");
      if (!wallet) throw new Error("Wallet not connected");
      return window.ethereum.request({
        method: "eth_sendTransaction",
        params: [
          {
            from: params.from ?? wallet.address,
            to: params.to,
            data: params.data,
            value: params.value ?? "0x0",
          },
        ],
      }) as Promise<string>;
    },
    [wallet],
  );

  const waitForTx = useCallback(
    async (txHash: string, timeoutMs = 120_000): Promise<{ status: number; to: string | null }> => {
      const rpc = RPC_BY_CHAIN[TARGET_CHAIN_ID_INT] ?? RPC_BY_CHAIN[8453];
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const res = await fetch(rpc, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "eth_getTransactionReceipt",
            params: [txHash],
          }),
        });
        const json = (await res.json()) as {
          result?: { status?: string; to?: string | null };
        };
        if (json.result) {
          return {
            status: parseInt(json.result.status ?? "0x0", 16),
            to: json.result.to ?? null,
          };
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      throw new Error("Transaction not found on Base Mainnet — check MetaMask network");
    },
    [],
  );

  return {
    wallet,
    isConnecting,
    error,
    hasMetaMask,
    connect,
    switchToBase,
    ethCall,
    sendTx,
    waitForTx,
    isOnBase: wallet?.chainId === TARGET_CHAIN_ID_INT,
    targetChainId: TARGET_CHAIN_ID_INT,
  };
}
