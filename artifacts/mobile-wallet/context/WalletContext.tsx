import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { nodeClient, discoverNode, type Transaction } from '@/lib/nodeClient';
import { formatEMBR, parseEMBR } from '@/lib/format';

// ── Storage keys ──────────────────────────────────────────────────────────
const PK_KEY = 'embr_pk';
const ADDR_KEY = 'embr_addr';
const BAL_CACHE = 'embr_bal';

// ── Types ─────────────────────────────────────────────────────────────────
export type NodeStatus = 'connected' | 'searching' | 'offline';

interface WalletCtx {
  isLoading: boolean;
  isSetup: boolean;
  address: string | null;
  balance: string;          // wei
  formattedBalance: string; // human EMBR
  transactions: Transaction[];
  txLoading: boolean;
  nodeStatus: NodeStatus;
  nodeUrl: string | null;
  peerCount: number;
  createWallet: () => Promise<void>;
  importWallet: (privateKey: string) => Promise<void>;
  send: (to: string, amountEmbr: string) => Promise<Transaction>;
  refreshBalance: () => Promise<void>;
  refreshTransactions: () => Promise<void>;
  removeWallet: () => Promise<void>;
  getPrivateKey: () => Promise<string | null>;
  reconnect: () => Promise<void>;
}

const Ctx = createContext<WalletCtx | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [address, setAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState('0');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [nodeStatus, setNodeStatus] = useState<NodeStatus>('searching');
  const [nodeUrl, setNodeUrl] = useState<string | null>(null);
  const [peerCount, setPeerCount] = useState(0);

  const formattedBalance = formatEMBR(balance);
  const isSetup = address !== null;

  // ── Boot: load persisted wallet ──────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const addr = await AsyncStorage.getItem(ADDR_KEY);
        if (addr) {
          setAddress(addr);
          const cached = await AsyncStorage.getItem(BAL_CACHE);
          if (cached) setBalance(cached);
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  // ── Auto-refresh when address is available ───────────────────────────
  useEffect(() => {
    if (!address) return;
    connectAndRefresh(address);
    const iv = setInterval(() => refreshBalance(address), 15_000);
    return () => clearInterval(iv);
  }, [address]);

  // ── Helpers ──────────────────────────────────────────────────────────
  const connectAndRefresh = useCallback(async (addr: string) => {
    setNodeStatus('searching');
    const node = await discoverNode();
    if (node) {
      setNodeUrl(node);
      setNodeStatus('connected');
      setPeerCount(nodeClient.getCachedPeers().length);
    } else {
      setNodeStatus('offline');
    }
    await Promise.allSettled([
      refreshBalance(addr),
      refreshTransactions(addr),
    ]);
  }, []);

  const refreshBalance = useCallback(async (addr?: string) => {
    const a = addr ?? address;
    if (!a) return;
    try {
      const w = await nodeClient.getWallet(a);
      setBalance(w.balance);
      setNodeStatus('connected');
      setNodeUrl(nodeClient.getActiveNode());
      setPeerCount(nodeClient.getCachedPeers().length);
      await AsyncStorage.setItem(BAL_CACHE, w.balance);
    } catch {
      setNodeStatus('offline');
    }
  }, [address]);

  const refreshTransactions = useCallback(async (addr?: string) => {
    const a = addr ?? address;
    if (!a) return;
    setTxLoading(true);
    try {
      const txs = await nodeClient.getTransactions(a, 30);
      setTransactions(txs);
    } catch {
      // keep stale list
    } finally {
      setTxLoading(false);
    }
  }, [address]);

  const reconnect = useCallback(async () => {
    if (!address) return;
    await connectAndRefresh(address);
  }, [address, connectAndRefresh]);

  // ── Wallet actions ───────────────────────────────────────────────────
  const createWallet = useCallback(async () => {
    const w = await nodeClient.createWallet();
    await SecureStore.setItemAsync(PK_KEY, w.privateKey);
    await AsyncStorage.setItem(ADDR_KEY, w.address);
    setAddress(w.address);
    setBalance(w.balance);
  }, []);

  const importWallet = useCallback(async (privateKey: string) => {
    const w = await nodeClient.importWallet(privateKey.trim());
    await SecureStore.setItemAsync(PK_KEY, w.privateKey);
    await AsyncStorage.setItem(ADDR_KEY, w.address);
    setAddress(w.address);
    setBalance(w.balance);
  }, []);

  const send = useCallback(async (to: string, amountEmbr: string): Promise<Transaction> => {
    const pk = await SecureStore.getItemAsync(PK_KEY);
    if (!pk) throw new Error('Wallet locked — private key not found.');
    const wei = parseEMBR(amountEmbr);
    const tx = await nodeClient.sendTransaction(pk, to, wei);
    // Refresh after the tx is likely mined
    setTimeout(() => refreshBalance(), 4000);
    setTimeout(() => refreshTransactions(), 5000);
    return tx;
  }, [refreshBalance, refreshTransactions]);

  const removeWallet = useCallback(async () => {
    await SecureStore.deleteItemAsync(PK_KEY);
    await AsyncStorage.multiRemove([ADDR_KEY, BAL_CACHE]);
    setAddress(null);
    setBalance('0');
    setTransactions([]);
  }, []);

  const getPrivateKey = useCallback(() => SecureStore.getItemAsync(PK_KEY), []);

  return (
    <Ctx.Provider value={{
      isLoading, isSetup, address, balance, formattedBalance,
      transactions, txLoading,
      nodeStatus, nodeUrl, peerCount,
      createWallet, importWallet, send,
      refreshBalance: () => refreshBalance(),
      refreshTransactions: () => refreshTransactions(),
      removeWallet, getPrivateKey, reconnect,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useWallet(): WalletCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useWallet must be used inside WalletProvider');
  return ctx;
}
