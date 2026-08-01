import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Shell } from '@/components/layout/Shell';
import {
  ArrowRightLeft, Loader2, CheckCircle, XCircle, Clock, RefreshCcw,
  ExternalLink, Zap, ShieldCheck, ChevronDown, Copy, Check, AlertTriangle,
} from 'lucide-react';
import { TokenIcon } from '@/components/TokenIcon';
import { useWeb3 } from '@/lib/use-web3';
import { useWriteContract, useReadContract } from 'wagmi';
import { API, apiFetch } from '@/lib/api';
import { useEmbrWallet } from '@/lib/embr-wallet';
import { encLockEMBR } from '@/lib/bridge-encoding';
import {
  EMBER_BRIDGE_ADDRESS,
  EMBERCHAIN_BRIDGE_ADDRESS,
  WEMBR_ADDRESS,
} from '@/lib/bridge-contracts';
import {
  isBridgeLegComplete,
  formatBridgeTime,
} from '@/lib/bridge-read';
import {
  maxSpendableEmbr,
  submitChainTransaction,
  waitForChainTransaction,
} from '@/lib/chain-node';
import {
  BRIDGE_ADDRESS, WEMBR_ADDRESS as WEMBR_ADDR_LEGACY, BRIDGE_ABI, ERC20_ABI,
  EMBERCHAIN_CHAIN_ID, BASE_CHAIN_ID,
  NATIVE_BRIDGE_ABI, UNIVERSAL_BRIDGE_ABI,
} from '@/lib/contracts';
import { parseEther, formatEther, parseUnits, formatUnits } from 'viem';
import { cn } from '@/lib/utils';

const BASE_BRIDGE_ADDRESS = (EMBERCHAIN_BRIDGE_ADDRESS || BRIDGE_ADDRESS) as `0x${string}`;
const WEMBR_TOKEN = (WEMBR_ADDRESS || WEMBR_ADDR_LEGACY) as `0x${string}`;
const EMBR_LOCK_ADDRESS = EMBER_BRIDGE_ADDRESS as `0x${string}`;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TokenListing {
  id: string;
  symbol: string;
  wrapped_symbol: string;
  token_name: string;
  chain_name: string;
  chain_type: string;      // 'evm' | 'utxo' | 'privacy' | 'custom'
  chain_id?: string;       // numeric string for EVM chains
  rpc_url: string;
  explorer_url?: string;
  native_bridge_address?: string;
  wrapped_token_address?: string;
  universal_bridge_address?: string;
  decimals: number;
}

type BridgeToken = 'EMBR' | TokenListing;
type EmbrDirection = 'embr_to_base' | 'base_to_embr';
type TokenDirection = 'native_to_base' | 'base_to_native';
type BridgeStatus = 'locked' | 'pending' | 'confirmed' | 'failed' | 'relayed';

interface BridgeInflight {
  nonce: string;
  status: BridgeStatus;
  txHash?: string;
  submittedAt?: number;
  direction?: EmbrDirection;
}

function bridgeStatusMessage(status: BridgeStatus, direction?: EmbrDirection): string {
  const dir = direction ?? 'embr_to_base';
  if (status === 'confirmed') {
    return dir === 'embr_to_base'
      ? 'wEMBR has been minted on Base.'
      : 'EMBR has been released on Emberchain.';
  }
  if (status === 'locked') {
    return dir === 'embr_to_base'
      ? 'Your EMBR lock is confirmed on Emberchain. wEMBR will arrive on Base once the relayer completes the bridge.'
      : 'wEMBR was burned on Base. EMBR will arrive on Emberchain once the relayer releases it.';
  }
  if (status === 'relayed') return 'Relayer submitted the destination-chain transaction.';
  if (status === 'failed') return 'This bridge request failed.';
  return 'Waiting for relayer to complete the bridge.';
}

async function tryRegisterBridge(body: {
  txHash: string;
  baseRecipient: string;
  amount: string;
  nonce: string;
}): Promise<void> {
  const base = API;
  if (!base) return;
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const r = await fetch(`${base}/api/bridge/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (r.status === 201 || r.status === 200) return;
    if (r.status !== 202 && r.status !== 404) return;
    await new Promise((w) => setTimeout(w, 3000));
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isEvm(listing: TokenListing): boolean {
  return listing.chain_type === 'evm';
}

function formatWei(wei: string, decimals = 18): string {
  try {
    return parseFloat(formatUnits(BigInt(wei), decimals)).toFixed(4);
  } catch { return '0'; }
}

function shortAddr(addr: string): string {
  return `${addr.slice(0, 10)}…${addr.slice(-8)}`;
}

/** Switch MetaMask to an arbitrary EVM chain; adds it if needed. */
async function switchToChain(chainId: number, chainName: string, rpcUrl: string, explorerUrl?: string): Promise<void> {
  const hexChainId = '0x' + chainId.toString(16);
  try {
    await (window as any).ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: hexChainId }],
    });
  } catch (err: any) {
    if (err?.code === 4902 || err?.code === -32603) {
      await (window as any).ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: hexChainId,
          chainName,
          rpcUrls: [rpcUrl],
          blockExplorerUrls: explorerUrl ? [explorerUrl] : undefined,
        }],
      });
    } else {
      throw err;
    }
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: BridgeStatus }) {
  if (status === 'confirmed') return (
    <span className="flex items-center gap-1 text-green-400 text-xs font-bold">
      <CheckCircle className="w-3.5 h-3.5" /> Complete
    </span>
  );
  if (status === 'locked') return (
    <span className="flex items-center gap-1 text-emerald-400 text-xs font-bold">
      <CheckCircle className="w-3.5 h-3.5" /> Locked on-chain
    </span>
  );
  if (status === 'failed') return (
    <span className="flex items-center gap-1 text-red-400 text-xs font-bold">
      <XCircle className="w-3.5 h-3.5" /> Failed
    </span>
  );
  if (status === 'relayed') return (
    <span className="flex items-center gap-1 text-primary text-xs font-bold">
      <Zap className="w-3.5 h-3.5" /> Relayed
    </span>
  );
  return (
    <span className="flex items-center gap-1 text-yellow-400 text-xs font-bold">
      <Clock className="w-3.5 h-3.5 animate-pulse" /> Awaiting relayer
    </span>
  );
}

interface BridgeEvent {
  nonce: string;
  direction: string;
  amount: string;
  status: BridgeStatus;
  txHash?: string;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy} className="text-muted-foreground hover:text-white transition-colors ml-1">
      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function ChainTypeBadge({ chainType }: { chainType: string }) {
  const label = chainType === 'evm' ? 'EVM' : chainType === 'utxo' ? 'UTXO' : chainType.toUpperCase();
  const color = chainType === 'evm'
    ? 'border-blue-500/40 text-blue-400 bg-blue-500/10'
    : chainType === 'utxo'
    ? 'border-orange-500/40 text-orange-400 bg-orange-500/10'
    : 'border-purple-500/40 text-purple-400 bg-purple-500/10';
  return (
    <span className={cn('text-[9px] font-bold uppercase tracking-widest border rounded px-1 py-0.5', color)}>
      {label}
    </span>
  );
}

/** Dropdown that lets the user pick a bridge token. */
function TokenPicker({
  selected, listings, listingsLoaded, onSelect,
}: {
  selected: BridgeToken;
  listings: TokenListing[];
  listingsLoaded: boolean;
  onSelect: (t: BridgeToken) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const label = selected === 'EMBR' ? 'EMBR' : (selected as TokenListing).symbol;
  const sub = selected === 'EMBR' ? 'EmberChain · Native' : `${(selected as TokenListing).chain_name} · ${(selected as TokenListing).chain_type.toUpperCase()}`;

  const all: BridgeToken[] = ['EMBR', ...listings];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 bg-secondary/50 border border-border hover:border-primary/40 rounded-lg px-4 py-3 transition-colors"
      >
        <div className="flex items-center gap-3">
          <TokenIcon symbol={label} size={28} />
          <div className="text-left">
            <div className="text-white font-bold text-sm">{label}</div>
            <div className="text-muted-foreground text-[11px]">{sub}</div>
          </div>
        </div>
        <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 right-0 z-50 bg-card border border-border rounded-lg shadow-2xl overflow-hidden max-h-64 overflow-y-auto">
          {all.map((t, i) => {
            const sym = t === 'EMBR' ? 'EMBR' : (t as TokenListing).symbol;
            const chain = t === 'EMBR' ? 'EmberChain · Native' : `${(t as TokenListing).chain_name}`;
            const ct = t === 'EMBR' ? null : (t as TokenListing).chain_type;
            const isSelected = t === 'EMBR' ? selected === 'EMBR' : selected !== 'EMBR' && (selected as TokenListing).id === (t as TokenListing).id;
            return (
              <button
                key={t === 'EMBR' ? 'EMBR' : (t as TokenListing).id}
                onClick={() => { onSelect(t); setOpen(false); }}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/5',
                  i > 0 && 'border-t border-border/50',
                  isSelected && 'bg-primary/5',
                )}
              >
                <TokenIcon symbol={sym} size={22} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-white text-sm font-bold">{sym}</span>
                    {ct && <ChainTypeBadge chainType={ct} />}
                    {isSelected && <Check className="w-3.5 h-3.5 text-primary ml-auto" />}
                  </div>
                  <div className="text-muted-foreground text-[11px] truncate">{chain}</div>
                </div>
              </button>
            );
          })}
          {listings.length === 0 && (
            <div className="px-4 py-3 text-xs text-muted-foreground italic">
              {listingsLoaded ? 'No launched tokens yet' : 'Loading…'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BridgeHistory({ address }: { address: string }) {
  const [events, setEvents] = useState<BridgeEvent[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/bridge/history/${address}`);
      if (r.ok) setEvents(await r.json());
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [address]);

  useEffect(() => { load(); }, [load]);

  if (events.length === 0) return null;

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Bridge History</span>
        <button onClick={load} className="text-muted-foreground hover:text-white transition-colors">
          <RefreshCcw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
        </button>
      </div>
      <div className="space-y-2">
        {events.slice(0, 8).map(e => (
          <div key={e.nonce} className="flex items-center justify-between bg-secondary/40 border border-border rounded px-4 py-2.5 text-sm gap-4">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-muted-foreground text-xs font-mono">#{e.nonce.slice(-6)}</span>
              <span className="text-white font-bold text-xs uppercase truncate">{e.direction.replace('_', ' → ')}</span>
              <span className="text-primary font-mono text-xs">{formatWei(e.amount)}</span>
            </div>
            <StatusBadge status={e.status} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── EMBR Bridge Form (matches emberswap: Ember wallet → Base, MetaMask ← Base) ─

function EmbrBridgeForm({
  address, isConnected, chainId, connectWallet, switchToBase, showToast, setInflight, startBridgePoll,
}: {
  address?: string;
  isConnected: boolean;
  chainId?: number;
  connectWallet: () => void;
  switchToBase: () => void;
  showToast: (msg: string, variant?: 'error' | 'success') => void;
  setInflight: (v: BridgeInflight | null) => void;
  startBridgePoll: (nonce: string, direction: EmbrDirection) => void;
}) {
  const { activeWallet, isLoaded: embrWalletLoaded } = useEmbrWallet();
  const { writeContractAsync } = useWriteContract();
  const { wembrWalletBalance } = useWeb3();

  const [direction, setDirection] = useState<EmbrDirection>('embr_to_base');
  const [amount, setAmount] = useState('');
  const [baseRecipient, setBaseRecipient] = useState(address ?? '');
  const [embrRecipient, setEmbrRecipient] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStep, setSubmitStep] = useState('');
  const [embrBalanceWei, setEmbrBalanceWei] = useState<bigint>(0n);

  const bridgeGasLimit = 300000n;
  const maxBridgeWei = maxSpendableEmbr(embrBalanceWei, bridgeGasLimit);

  const { data: wembrSupplyRaw } = useReadContract({
    address: WEMBR_TOKEN,
    abi: ERC20_ABI,
    functionName: 'totalSupply',
    query: { refetchInterval: 60_000 },
  });
  const wembrSupply = wembrSupplyRaw != null ? parseFloat(formatEther(wembrSupplyRaw as bigint)) : null;

  const [embrReserves, setEmbrReserves] = useState<number | null>(null);
  useEffect(() => {
    if (!EMBR_LOCK_ADDRESS) return;
    let cancelled = false;
    const fetch_ = async () => {
      try {
        const rpcBase = API || '';
        const r = await fetch(`${rpcBase}/api/rpc`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'eth_getBalance',
            params: [EMBR_LOCK_ADDRESS, 'latest'],
          }),
        });
        if (!r.ok) return;
        const { result } = await r.json();
        if (!cancelled && result) setEmbrReserves(parseFloat(formatEther(BigInt(result))));
      } catch { /* ignore */ }
    };
    fetch_();
    const id = setInterval(fetch_, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  useEffect(() => {
    if (address && !baseRecipient) setBaseRecipient(address);
  }, [address, baseRecipient]);

  useEffect(() => {
    if (activeWallet?.address && direction === 'base_to_embr' && !embrRecipient) {
      setEmbrRecipient(activeWallet.address);
    }
  }, [activeWallet?.address, direction, embrRecipient]);

  useEffect(() => {
    if (!activeWallet?.address) {
      setEmbrBalanceWei(0n);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch(`/api/wallets/${activeWallet.address}`);
        if (!r.ok) return;
        const data = await r.json();
        const raw: string = data?.balance ?? '0';
        const wei = raw.startsWith('0x') ? BigInt(raw) : BigInt(raw || '0');
        if (!cancelled) setEmbrBalanceWei(wei);
      } catch { /* ignore */ }
    };
    load();
    const id = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [activeWallet?.address]);

  const isOnBase = chainId === BASE_CHAIN_ID;

  const submitEmbrToBase = async () => {
    if (!activeWallet) {
      showToast('Unlock your EMBR wallet in the main app first (Dashboard → Setup).', 'error');
      return;
    }
    if (!EMBR_LOCK_ADDRESS) {
      showToast('Emberchain bridge contract not configured.', 'error');
      return;
    }
    const amountWei = parseEther(amount || '0');
    if (amountWei === 0n) {
      showToast('Enter a valid EMBR amount', 'error');
      return;
    }
    if (amountWei > maxBridgeWei) {
      showToast(`Insufficient EMBR — max ${formatEther(maxBridgeWei)} (gas reserve included).`, 'error');
      return;
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(baseRecipient)) {
      showToast('Enter a valid Base recipient address', 'error');
      return;
    }

    const nonce = BigInt(Date.now());
    setIsSubmitting(true);
    setSubmitStep('Locking EMBR on Emberchain…');
    try {
      const tx = await submitChainTransaction({
        fromPrivateKey: activeWallet.privateKey,
        to: EMBR_LOCK_ADDRESS,
        value: amountWei.toString(),
        data: encLockEMBR(baseRecipient, nonce),
        gasLimit: bridgeGasLimit.toString(),
      });
      await waitForChainTransaction(tx.hash);
      const inflight: BridgeInflight = {
        nonce: nonce.toString(),
        status: 'locked',
        txHash: tx.hash,
        submittedAt: Date.now(),
        direction: 'embr_to_base',
      };
      setInflight(inflight);
      startBridgePoll(nonce.toString(), 'embr_to_base');
      setAmount('');
      showToast('EMBR locked on-chain — wEMBR will arrive on Base once the relayer completes the bridge.', 'success');
      void tryRegisterBridge({
        txHash: tx.hash,
        baseRecipient,
        amount: amountWei.toString(),
        nonce: nonce.toString(),
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'unknown error';
      showToast(`Bridge failed: ${msg}`, 'error');
    } finally {
      setIsSubmitting(false);
      setSubmitStep('');
    }
  };

  const submitBaseToEmbr = async () => {
    if (!isConnected) {
      connectWallet();
      return;
    }
    if (!isOnBase) {
      switchToBase();
      return;
    }
    const amountWei = parseEther(amount || '0');
    if (amountWei === 0n) {
      showToast('Enter a valid wEMBR amount', 'error');
      return;
    }
    if (!embrRecipient || embrRecipient.length < 10) {
      showToast('Enter a valid EMBR recipient address', 'error');
      return;
    }

    const nonce = BigInt(Date.now());
    setIsSubmitting(true);
    try {
      setSubmitStep('Check MetaMask — approve wEMBR spend (1/2)');
      showToast('Check MetaMask — approve wEMBR spend (step 1 of 2)');
      await writeContractAsync({
        address: WEMBR_TOKEN,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [BASE_BRIDGE_ADDRESS, amountWei * 2n],
        chainId: BASE_CHAIN_ID,
      });
      setSubmitStep('Check MetaMask — confirm bridge (2/2)');
      showToast('Approved — confirm the bridge transaction (step 2 of 2)');
      await new Promise((r) => setTimeout(r, 3000));
      const txHash = await writeContractAsync({
        address: BASE_BRIDGE_ADDRESS,
        abi: BRIDGE_ABI,
        functionName: 'bridgeOut',
        args: [amountWei, embrRecipient, nonce],
        chainId: BASE_CHAIN_ID,
      });
      setInflight({
        nonce: nonce.toString(),
        status: 'locked',
        txHash,
        submittedAt: Date.now(),
        direction: 'base_to_embr',
      });
      startBridgePoll(nonce.toString(), 'base_to_embr');
      setAmount('');
      showToast('wEMBR burned on Base — EMBR will arrive on Emberchain once the relayer completes the bridge.', 'success');
    } catch (e: unknown) {
      const err = e as { shortMessage?: string; message?: string };
      showToast(`Bridge failed: ${err?.shortMessage ?? err?.message ?? 'unknown error'}`, 'error');
    } finally {
      setIsSubmitting(false);
      setSubmitStep('');
    }
  };

  const btnLabel = () => {
    if (isSubmitting) return submitStep || 'Processing…';
    if (direction === 'embr_to_base') {
      if (!embrWalletLoaded) return 'Loading wallet…';
      if (!activeWallet) return 'Unlock EMBR wallet';
      return 'Bridge EMBR → wEMBR';
    }
    if (!isConnected) return 'Connect MetaMask';
    if (!isOnBase) return 'Switch to Base';
    return 'Bridge wEMBR → EMBR';
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {(['embr_to_base', 'base_to_embr'] as EmbrDirection[]).map((d) => (
          <button
            key={d}
            onClick={() => setDirection(d)}
            className={cn(
              'p-3 border rounded text-sm font-bold transition-all text-left',
              direction === d
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:bg-white/5 hover:text-white',
            )}
          >
            <div className="flex items-center gap-2 mb-1">
              <TokenIcon symbol={d === 'embr_to_base' ? 'EMBR' : 'wEMBR'} size={14} />
              {d === 'embr_to_base' ? 'EMBR → wEMBR' : 'wEMBR → EMBR'}
            </div>
            <div className="text-[10px] font-normal text-muted-foreground normal-case">
              {d === 'embr_to_base'
                ? 'Lock on Emberchain, receive wEMBR on Base'
                : 'Burn wEMBR on Base, release EMBR on Emberchain'}
            </div>
          </button>
        ))}
      </div>

      {direction === 'embr_to_base' ? (
        activeWallet ? (
          <div className="text-xs px-3 py-2 rounded border bg-success/10 border-success/30 text-bid flex items-center gap-2">
            ✓ EMBR wallet {shortAddr(activeWallet.address)}
          </div>
        ) : (
          <div className="text-xs px-3 py-2 rounded border bg-orange-500/10 border-orange-500/30 text-orange-400 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              EMBR → Base uses your Ember wallet (same as EmberSwap).{' '}
              <a href="/dashboard" className="text-primary underline">Open the wallet app</a> and unlock it first.
            </span>
          </div>
        )
      ) : isConnected ? (
        <div
          className={cn(
            'text-xs px-3 py-2 rounded border flex items-center gap-2',
            isOnBase
              ? 'bg-success/10 border-success/30 text-bid'
              : 'bg-orange-500/10 border-orange-500/30 text-orange-400',
          )}
        >
          {isOnBase ? '✓ MetaMask connected to Base' : '⚠ Click bridge to switch MetaMask to Base'}
        </div>
      ) : null}

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="p-6 space-y-4">
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Amount ({direction === 'embr_to_base' ? 'EMBR' : 'wEMBR'})
              </label>
              {direction === 'embr_to_base' && activeWallet && maxBridgeWei > 0n && (
                <button
                  type="button"
                  onClick={() => setAmount(formatEther(maxBridgeWei))}
                  className="text-xs text-primary hover:underline font-bold uppercase tracking-widest"
                >
                  Max: {formatEther(maxBridgeWei)} EMBR
                </button>
              )}
              {direction === 'base_to_embr' && isConnected && (
                <button
                  type="button"
                  onClick={() => wembrWalletBalance != null && setAmount(wembrWalletBalance.toFixed(4))}
                  className="text-xs text-primary hover:underline font-bold uppercase tracking-widest"
                >
                  Max: {wembrWalletBalance?.toFixed(4) ?? '—'} wEMBR
                </button>
              )}
            </div>
            <input
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-input border border-border rounded px-4 py-3 text-lg font-mono text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
            />
          </div>

          {direction === 'embr_to_base' ? (
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Base recipient address
                </label>
                {address && (
                  <button
                    type="button"
                    onClick={() => setBaseRecipient(address)}
                    className="text-xs text-primary hover:underline font-bold uppercase tracking-widest"
                  >
                    My MetaMask
                  </button>
                )}
              </div>
              <input
                type="text"
                placeholder="0x…"
                value={baseRecipient}
                onChange={(e) => setBaseRecipient(e.target.value)}
                className="w-full bg-input border border-border rounded px-4 py-2 text-sm font-mono text-white focus:outline-none focus:border-primary transition-all"
              />
              <p className="text-[10px] text-muted-foreground">wEMBR will be minted to this address on Base.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Emberchain recipient address
                </label>
                {activeWallet && (
                  <button
                    type="button"
                    onClick={() => setEmbrRecipient(activeWallet.address)}
                    className="text-xs text-primary hover:underline font-bold uppercase tracking-widest"
                  >
                    My EMBR wallet
                  </button>
                )}
              </div>
              <input
                type="text"
                placeholder="0x…"
                value={embrRecipient}
                onChange={(e) => setEmbrRecipient(e.target.value)}
                className="w-full bg-input border border-border rounded px-4 py-2 text-sm font-mono text-white focus:outline-none focus:border-primary transition-all"
              />
              <p className="text-[10px] text-muted-foreground">EMBR will be released to this address on Emberchain.</p>
            </div>
          )}

          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-secondary/40 border border-border rounded px-3 py-2">
            <Clock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              2-step confirmation — relayer picks up in <strong className="text-white">~2 minutes</strong>.
              Status is tracked on-chain (no api-server required).
            </span>
          </div>

          <button
            type="button"
            onClick={() => (direction === 'embr_to_base' ? submitEmbrToBase() : submitBaseToEmbr())}
            disabled={isSubmitting}
            className="w-full py-4 bg-primary text-primary-foreground font-bold uppercase tracking-wider rounded text-sm hover:bg-primary/90 transition-all shadow-[0_4px_14px_0_rgba(243,112,33,0.3)] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            {btnLabel()}
          </button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-bid" />
          <span className="text-sm font-bold text-white">Proof of Reserves</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Every wEMBR on Base is backed 1:1 by EMBR locked in the Emberchain bridge contract.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-secondary/40 border border-border rounded p-3">
            <div className="flex items-center gap-2 mb-2">
              <TokenIcon symbol="wEMBR" size={14} />
              <span className="text-xs font-bold text-white">wEMBR</span>
            </div>
            <div className="font-mono font-bold text-white text-sm">
              {wembrSupply !== null ? (
                wembrSupply.toLocaleString(undefined, { maximumFractionDigits: 2 })
              ) : (
                <span className="text-muted-foreground animate-pulse">Loading…</span>
              )}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">In Circulation (Base)</div>
            <a
              href={`https://basescan.org/token/${WEMBR_TOKEN}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-primary hover:underline flex items-center gap-0.5 mt-1"
            >
              Basescan <ExternalLink className="w-2.5 h-2.5" />
            </a>
          </div>
          <div className="bg-secondary/40 border border-border rounded p-3">
            <div className="flex items-center gap-2 mb-2">
              <TokenIcon symbol="EMBR" size={14} />
              <span className="text-xs font-bold text-white">EMBR</span>
            </div>
            <div className="font-mono font-bold text-white text-sm">
              {EMBR_LOCK_ADDRESS ? (
                embrReserves !== null ? (
                  embrReserves.toLocaleString(undefined, { maximumFractionDigits: 2 })
                ) : (
                  <span className="text-muted-foreground animate-pulse">Loading…</span>
                )
              ) : (
                <span className="text-muted-foreground text-xs">Bridge not deployed</span>
              )}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Locked as Reserves</div>
          </div>
        </div>
        {wembrSupply !== null && embrReserves !== null && (
          <div
            className={cn(
              'text-xs px-3 py-2 rounded flex items-center gap-2',
              Math.abs(wembrSupply - embrReserves) / Math.max(wembrSupply, 0.001) < 0.01
                ? 'bg-success/10 text-bid border border-success/20'
                : 'bg-orange-500/10 text-orange-400 border border-orange-500/20',
            )}
          >
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
            {Math.abs(wembrSupply - embrReserves) / Math.max(wembrSupply, 0.001) < 0.01
              ? 'Reserves match — fully collateralized'
              : `Δ ${Math.abs(wembrSupply - embrReserves).toFixed(4)} EMBR — relayer bridging in progress`}
          </div>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl p-4 text-xs space-y-3">
        <div className="text-muted-foreground font-bold uppercase tracking-wider text-[10px]">Contracts</div>
        <div>
          <div className="text-muted-foreground mb-0.5">EmberchainBridge (Base)</div>
          <a
            href={`https://basescan.org/address/${BASE_BRIDGE_ADDRESS}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-primary hover:underline flex items-center gap-1"
          >
            {BASE_BRIDGE_ADDRESS} <ExternalLink className="w-3 h-3 shrink-0" />
          </a>
        </div>
        <div>
          <div className="text-muted-foreground mb-0.5">wEMBR Token (Base)</div>
          <a
            href={`https://basescan.org/address/${WEMBR_TOKEN}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-primary hover:underline flex items-center gap-1"
          >
            {WEMBR_TOKEN} <ExternalLink className="w-3 h-3 shrink-0" />
          </a>
        </div>
        {EMBR_LOCK_ADDRESS && (
          <div>
            <div className="text-muted-foreground mb-0.5">Bridge Lock (Emberchain)</div>
            <span className="font-mono text-white">{EMBR_LOCK_ADDRESS}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── EVM Launched Token Bridge Form ────────────────────────────────────────────

function EvmTokenBridgeForm({
  listing, address, isConnected, chainId, connectWallet, showToast, setInflight, pollStatus,
}: {
  listing: TokenListing;
  address?: string;
  isConnected: boolean;
  chainId?: number;
  connectWallet: () => void;
  showToast: (msg: string, variant?: 'error' | 'success') => void;
  setInflight: (v: BridgeInflight | null) => void;
  pollStatus: (nonce: string) => void;
}) {
  const { writeContractAsync } = useWriteContract();
  const [direction, setDirection] = useState<TokenDirection>('native_to_base');
  const [amount, setAmount] = useState('');
  const [baseRecipient, setBaseRecipient] = useState(address ?? '');
  const [nativeRecipient, setNativeRecipient] = useState(address ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStep, setSubmitStep] = useState('');

  useEffect(() => { if (address) { setBaseRecipient(address); setNativeRecipient(address); } }, [address]);

  const nativeChainId = listing.chain_id ? parseInt(listing.chain_id) : null;
  const isOnNativeChain = nativeChainId ? chainId === nativeChainId : false;
  const isOnBase = chainId === BASE_CHAIN_ID;

  const bridgeNativeToBase = async () => {
    if (!isConnected) { connectWallet(); return; }
    if (!listing.native_bridge_address) { showToast('Native bridge contract not deployed yet.', 'error'); return; }
    if (!amount || parseFloat(amount) <= 0) { showToast('Enter a valid amount', 'error'); return; }
    if (!/^0x[0-9a-fA-F]{40}$/.test(baseRecipient)) { showToast('Enter a valid Base recipient address (0x…)', 'error'); return; }
    if (!nativeChainId) { showToast('Native chain ID not configured.', 'error'); return; }

    setIsSubmitting(true);
    try {
      if (!isOnNativeChain) {
        setSubmitStep(`Switching to ${listing.chain_name}…`);
        showToast(`Check MetaMask — switching to ${listing.chain_name}`);
        await switchToChain(nativeChainId, listing.chain_name, listing.rpc_url, listing.explorer_url);
      }

      const amountWei = parseUnits(amount, listing.decimals);
      const nonce = BigInt(Date.now());
      setSubmitStep('Check MetaMask — confirm lock transaction');
      showToast(`Check MetaMask — lock ${listing.symbol} on ${listing.chain_name}`);

      const txHash = await writeContractAsync({
        address: listing.native_bridge_address as `0x${string}`,
        abi: NATIVE_BRIDGE_ABI,
        functionName: 'lockNative',
        args: [baseRecipient as `0x${string}`, nonce],
        value: amountWei,
        chainId: nativeChainId,
      } as any);

      setInflight({ nonce: nonce.toString(), status: 'pending', txHash });
      pollStatus(nonce.toString());
      setAmount('');
      showToast(`Locked! w${listing.symbol} arrives on Base in ~2–5 min`, 'success');
    } catch (e: any) {
      showToast(`Bridge failed: ${e?.shortMessage ?? e?.message ?? 'unknown error'}`, 'error');
    } finally { setIsSubmitting(false); setSubmitStep(''); }
  };

  const bridgeBaseToNative = async () => {
    if (!isConnected) { connectWallet(); return; }
    if (!listing.wrapped_token_address || !listing.universal_bridge_address) {
      showToast('Bridge contracts not deployed yet.', 'error'); return;
    }
    if (!amount || parseFloat(amount) <= 0) { showToast('Enter a valid amount', 'error'); return; }
    if (!nativeRecipient || nativeRecipient.length < 10) { showToast('Enter a valid recipient address on ' + listing.chain_name, 'error'); return; }

    if (!isOnBase) {
      setIsSubmitting(true);
      try {
        showToast('Switching to Base…');
        await switchToChain(BASE_CHAIN_ID, 'Base', 'https://mainnet.base.org', 'https://basescan.org');
      } catch (e: any) {
        showToast('Switch to Base rejected — please switch manually.', 'error');
        setIsSubmitting(false); return;
      }
    }

    setIsSubmitting(true);
    try {
      const amountWei = parseUnits(amount, listing.decimals);
      const nonce = BigInt(Date.now());
      setSubmitStep('Check MetaMask — confirm bridge transaction');
      showToast(`Check MetaMask — burn w${listing.symbol} on Base`);

      const txHash = await writeContractAsync({
        address: listing.universal_bridge_address as `0x${string}`,
        abi: UNIVERSAL_BRIDGE_ABI,
        functionName: 'bridgeOut',
        args: [listing.wrapped_token_address as `0x${string}`, amountWei, nativeRecipient, nonce],
        chainId: BASE_CHAIN_ID,
      });

      setInflight({ nonce: nonce.toString(), status: 'pending', txHash });
      pollStatus(nonce.toString());
      setAmount('');
      showToast(`Submitted! ${listing.symbol} releases on ${listing.chain_name} in ~2–5 min`, 'success');
    } catch (e: any) {
      showToast(`Bridge failed: ${e?.shortMessage ?? e?.message ?? 'unknown error'}`, 'error');
    } finally { setIsSubmitting(false); setSubmitStep(''); }
  };

  const btnLabel = () => {
    if (!isConnected) return 'Connect Wallet';
    if (isSubmitting) return submitStep || 'Processing…';
    if (direction === 'native_to_base') {
      if (!isOnNativeChain) return `Switch to ${listing.chain_name} & Bridge`;
      return `Bridge ${listing.symbol} → w${listing.symbol}`;
    }
    if (!isOnBase) return 'Switch to Base';
    return `Bridge w${listing.symbol} → ${listing.symbol}`;
  };

  return (
    <div className="space-y-4">
      {/* Direction */}
      <div className="grid grid-cols-2 gap-2">
        {(['native_to_base', 'base_to_native'] as TokenDirection[]).map(d => (
          <button key={d} onClick={() => { setDirection(d); setAmount(''); }}
            className={cn('p-3 border rounded text-sm font-bold transition-all text-left',
              direction === d ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-white/5 hover:text-white')}>
            <div className="flex items-center gap-2 mb-1 text-xs">
              {d === 'native_to_base' ? `${listing.symbol} → w${listing.symbol}` : `w${listing.symbol} → ${listing.symbol}`}
            </div>
            <div className="text-[10px] font-normal text-muted-foreground normal-case">
              {d === 'native_to_base'
                ? `Lock ${listing.symbol} on ${listing.chain_name}, receive w${listing.symbol} on Base`
                : `Burn w${listing.symbol} on Base, receive ${listing.symbol} on ${listing.chain_name}`}
            </div>
          </button>
        ))}
      </div>

      {/* Network hint */}
      {isConnected && (
        <div className={cn('text-xs px-3 py-2 rounded border flex items-center gap-2',
          direction === 'native_to_base'
            ? isOnNativeChain ? 'bg-success/10 border-success/30 text-bid' : 'bg-orange-500/10 border-orange-500/30 text-orange-400'
            : isOnBase ? 'bg-success/10 border-success/30 text-bid' : 'bg-orange-500/10 border-orange-500/30 text-orange-400'
        )}>
          {direction === 'native_to_base'
            ? isOnNativeChain ? `✓ Connected to ${listing.chain_name}` : `⚠ MetaMask will switch to ${listing.chain_name} when you bridge`
            : isOnBase ? '✓ Connected to Base' : '⚠ Click bridge to switch to Base'}
        </div>
      )}

      {/* If native bridge not deployed */}
      {direction === 'native_to_base' && !listing.native_bridge_address && (
        <div className="flex items-start gap-2 text-xs bg-orange-500/10 border border-orange-500/20 text-orange-300 rounded px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          Native bridge contract for {listing.symbol} is being deployed. Check back soon.
        </div>
      )}

      {/* Form */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Amount ({direction === 'native_to_base' ? listing.symbol : `w${listing.symbol}`})
            </label>
            <input type="number" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)}
              className="w-full bg-input border border-border rounded px-4 py-3 text-lg font-mono text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all" />
            <p className="text-[10px] text-muted-foreground">0.5% bridge fee applied. Relayer releases net amount.</p>
          </div>

          {direction === 'native_to_base' ? (
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Base recipient address</label>
                {address && <button onClick={() => setBaseRecipient(address)} className="text-xs text-primary hover:underline font-bold uppercase tracking-widest">Myself</button>}
              </div>
              <input type="text" placeholder="0x…" value={baseRecipient} onChange={e => setBaseRecipient(e.target.value)}
                className="w-full bg-input border border-border rounded px-4 py-2 text-sm font-mono text-white focus:outline-none focus:border-primary transition-all" />
              <p className="text-[10px] text-muted-foreground">w{listing.symbol} will be minted to this address on Base.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Recipient address on {listing.chain_name}</label>
                {address && <button onClick={() => setNativeRecipient(address)} className="text-xs text-primary hover:underline font-bold uppercase tracking-widest">Myself</button>}
              </div>
              <input type="text" placeholder={`${listing.chain_name} address…`} value={nativeRecipient} onChange={e => setNativeRecipient(e.target.value)}
                className="w-full bg-input border border-border rounded px-4 py-2 text-sm font-mono text-white focus:outline-none focus:border-primary transition-all" />
              <p className="text-[10px] text-muted-foreground">{listing.symbol} will be released to this address on {listing.chain_name}.</p>
            </div>
          )}

          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-secondary/40 border border-border rounded px-3 py-2">
            <Clock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>Relayer picks up in <strong className="text-white">~2–5 minutes</strong> after confirmation.</span>
          </div>

          <button onClick={() => direction === 'native_to_base' ? bridgeNativeToBase() : bridgeBaseToNative()} disabled={isSubmitting}
            className="w-full py-4 bg-primary text-primary-foreground font-bold uppercase tracking-wider rounded text-sm hover:bg-primary/90 transition-all shadow-[0_4px_14px_0_rgba(243,112,33,0.3)] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2">
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            {btnLabel()}
          </button>
        </div>
      </div>

      {/* Contract info */}
      <div className="bg-card border border-border rounded-xl p-4 text-xs space-y-3">
        <div className="text-muted-foreground font-bold uppercase tracking-wider text-[10px]">Contracts</div>
        {listing.native_bridge_address && (
          <div>
            <div className="text-muted-foreground mb-0.5">Native Bridge ({listing.chain_name})</div>
            <div className="flex items-center gap-1 font-mono text-white break-all">
              {listing.native_bridge_address}
              <CopyButton text={listing.native_bridge_address} />
              {listing.explorer_url && <a href={`${listing.explorer_url.replace(/\/$/, '')}/address/${listing.native_bridge_address}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline ml-1"><ExternalLink className="w-3 h-3" /></a>}
            </div>
          </div>
        )}
        {listing.wrapped_token_address && (
          <div>
            <div className="text-muted-foreground mb-0.5">w{listing.symbol} Token (Base)</div>
            <div className="flex items-center gap-1 font-mono text-white break-all">
              {listing.wrapped_token_address}
              <CopyButton text={listing.wrapped_token_address} />
              <a href={`https://basescan.org/token/${listing.wrapped_token_address}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline ml-1"><ExternalLink className="w-3 h-3" /></a>
            </div>
          </div>
        )}
        {listing.universal_bridge_address && (
          <div>
            <div className="text-muted-foreground mb-0.5">Universal Bridge (Base)</div>
            <div className="flex items-center gap-1 font-mono text-white break-all">
              {listing.universal_bridge_address}
              <CopyButton text={listing.universal_bridge_address} />
              <a href={`https://basescan.org/address/${listing.universal_bridge_address}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline ml-1"><ExternalLink className="w-3 h-3" /></a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Non-EVM Launched Token Bridge Form ────────────────────────────────────────

function NonEvmTokenBridgeForm({
  listing, address, isConnected, chainId, connectWallet, showToast, setInflight, pollStatus,
}: {
  listing: TokenListing;
  address?: string;
  isConnected: boolean;
  chainId?: number;
  connectWallet: () => void;
  showToast: (msg: string, variant?: 'error' | 'success') => void;
  setInflight: (v: BridgeInflight | null) => void;
  pollStatus: (nonce: string) => void;
}) {
  const { writeContractAsync } = useWriteContract();
  const [direction, setDirection] = useState<TokenDirection>('native_to_base');
  const [amount, setAmount] = useState('');
  const [nativeRecipient, setNativeRecipient] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStep, setSubmitStep] = useState('');

  const isOnBase = chainId === BASE_CHAIN_ID;

  // Base → Native: same UniversalBridge.bridgeOut call as EVM tokens
  const bridgeBaseToNative = async () => {
    if (!isConnected) { connectWallet(); return; }
    if (!listing.wrapped_token_address || !listing.universal_bridge_address) {
      showToast('Bridge contracts not deployed yet.', 'error'); return;
    }
    if (!amount || parseFloat(amount) <= 0) { showToast('Enter a valid amount', 'error'); return; }
    if (!nativeRecipient || nativeRecipient.length < 5) {
      showToast(`Enter a valid ${listing.chain_name} address`, 'error'); return;
    }

    if (!isOnBase) {
      setIsSubmitting(true);
      try {
        showToast('Switching to Base…');
        await switchToChain(BASE_CHAIN_ID, 'Base', 'https://mainnet.base.org', 'https://basescan.org');
      } catch {
        showToast('Switch to Base rejected — please switch manually.', 'error');
        setIsSubmitting(false); return;
      }
    }

    setIsSubmitting(true);
    try {
      const amountWei = parseUnits(amount, listing.decimals);
      const nonce = BigInt(Date.now());
      setSubmitStep('Check MetaMask — confirm bridge transaction');
      showToast(`Check MetaMask — burn w${listing.symbol} on Base`);

      const txHash = await writeContractAsync({
        address: listing.universal_bridge_address as `0x${string}`,
        abi: UNIVERSAL_BRIDGE_ABI,
        functionName: 'bridgeOut',
        args: [listing.wrapped_token_address as `0x${string}`, amountWei, nativeRecipient, nonce],
        chainId: BASE_CHAIN_ID,
      });

      setInflight({ nonce: nonce.toString(), status: 'pending', txHash });
      pollStatus(nonce.toString());
      setAmount('');
      showToast(`Submitted! ${listing.symbol} releases on ${listing.chain_name} in ~2–5 min`, 'success');
    } catch (e: any) {
      showToast(`Bridge failed: ${e?.shortMessage ?? e?.message ?? 'unknown error'}`, 'error');
    } finally { setIsSubmitting(false); setSubmitStep(''); }
  };

  return (
    <div className="space-y-4">
      {/* Direction */}
      <div className="grid grid-cols-2 gap-2">
        {(['native_to_base', 'base_to_native'] as TokenDirection[]).map(d => (
          <button key={d} onClick={() => { setDirection(d); setAmount(''); }}
            className={cn('p-3 border rounded text-sm font-bold transition-all text-left',
              direction === d ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-white/5 hover:text-white')}>
            <div className="text-xs font-bold mb-1">
              {d === 'native_to_base' ? `${listing.symbol} → w${listing.symbol}` : `w${listing.symbol} → ${listing.symbol}`}
            </div>
            <div className="text-[10px] font-normal text-muted-foreground normal-case">
              {d === 'native_to_base'
                ? `Send ${listing.symbol} to bridge address, receive w${listing.symbol} on Base`
                : `Burn w${listing.symbol} on Base, receive ${listing.symbol} on ${listing.chain_name}`}
            </div>
          </button>
        ))}
      </div>

      {direction === 'native_to_base' ? (
        /* Manual send instructions for non-EVM */
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-start gap-2 text-xs text-yellow-300 bg-yellow-500/10 border border-yellow-500/20 rounded px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            {listing.chain_name} is not EVM-compatible. Send {listing.symbol} manually to the bridge address below. The relayer will mint w{listing.symbol} on Base after {listing.chain_name ?? 'network'} confirmations.
          </div>

          {listing.native_bridge_address ? (
            <div className="space-y-2">
              <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Bridge Deposit Address ({listing.chain_name})</div>
              <div className="flex items-start gap-2 bg-secondary/60 border border-border rounded-lg p-3">
                <span className="font-mono text-white text-sm break-all flex-1">{listing.native_bridge_address}</span>
                <CopyButton text={listing.native_bridge_address} />
              </div>
              <p className="text-[10px] text-muted-foreground">
                Send exactly the amount you want to bridge. Include your <strong className="text-white">Base address</strong> in the memo/message field if supported by {listing.chain_name}.
              </p>
            </div>
          ) : (
            <div className="flex items-start gap-2 text-xs bg-orange-500/10 border border-orange-500/20 text-orange-300 rounded px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              Bridge deposit address is being assigned. Check back soon.
            </div>
          )}

          {listing.wrapped_token_address && (
            <div className="space-y-1">
              <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">You will receive on Base</div>
              <div className="flex items-center gap-2 text-xs">
                <TokenIcon symbol={listing.wrapped_symbol} size={16} />
                <span className="text-white font-bold">w{listing.symbol}</span>
                <span className="font-mono text-muted-foreground">{shortAddr(listing.wrapped_token_address)}</span>
                <CopyButton text={listing.wrapped_token_address} />
                <a href={`https://basescan.org/token/${listing.wrapped_token_address}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline"><ExternalLink className="w-3 h-3" /></a>
              </div>
            </div>
          )}

          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-secondary/40 border border-border rounded px-3 py-2">
            <Clock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>Relayer mints w{listing.symbol} on Base after confirming your {listing.chain_name} transaction.</span>
          </div>
        </div>
      ) : (
        /* Base → Native: wagmi call to UniversalBridge */
        <div className="space-y-4">
          {isConnected && (
            <div className={cn('text-xs px-3 py-2 rounded border flex items-center gap-2', isOnBase ? 'bg-success/10 border-success/30 text-bid' : 'bg-orange-500/10 border-orange-500/30 text-orange-400')}>
              {isOnBase ? '✓ Connected to Base' : '⚠ Click bridge to switch to Base'}
            </div>
          )}

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Amount (w{listing.symbol})</label>
                <input type="number" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)}
                  className="w-full bg-input border border-border rounded px-4 py-3 text-lg font-mono text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all" />
                <p className="text-[10px] text-muted-foreground">0.5% bridge fee applied. Relayer releases net amount.</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{listing.chain_name} recipient address</label>
                <input type="text" placeholder={`Your ${listing.chain_name} address…`} value={nativeRecipient} onChange={e => setNativeRecipient(e.target.value)}
                  className="w-full bg-input border border-border rounded px-4 py-2 text-sm font-mono text-white focus:outline-none focus:border-primary transition-all" />
                <p className="text-[10px] text-muted-foreground">{listing.symbol} will be sent to this address on {listing.chain_name}.</p>
              </div>

              <div className="flex items-start gap-2 text-xs text-muted-foreground bg-secondary/40 border border-border rounded px-3 py-2">
                <Clock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>Relayer processes in <strong className="text-white">~2–5 minutes</strong>.</span>
              </div>

              <button onClick={bridgeBaseToNative} disabled={isSubmitting}
                className="w-full py-4 bg-primary text-primary-foreground font-bold uppercase tracking-wider rounded text-sm hover:bg-primary/90 transition-all shadow-[0_4px_14px_0_rgba(243,112,33,0.3)] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                {!isConnected ? 'Connect Wallet' : isSubmitting ? (submitStep || 'Processing…') : !isOnBase ? 'Switch to Base' : `Bridge w${listing.symbol} → ${listing.symbol}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Contract addresses */}
      {(listing.wrapped_token_address || listing.universal_bridge_address || listing.native_bridge_address) && (
        <div className="bg-card border border-border rounded-xl p-4 text-xs space-y-3">
          <div className="text-muted-foreground font-bold uppercase tracking-wider text-[10px]">Contracts</div>
          {listing.native_bridge_address && (
            <div><div className="text-muted-foreground mb-0.5">Bridge Address ({listing.chain_name})</div>
              <div className="flex items-center gap-1 font-mono text-white break-all">{listing.native_bridge_address}<CopyButton text={listing.native_bridge_address} /></div></div>
          )}
          {listing.wrapped_token_address && (
            <div><div className="text-muted-foreground mb-0.5">w{listing.symbol} Token (Base)</div>
              <div className="flex items-center gap-1">
                <a href={`https://basescan.org/token/${listing.wrapped_token_address}`} target="_blank" rel="noopener noreferrer" className="font-mono text-primary hover:underline break-all">{listing.wrapped_token_address}</a>
                <CopyButton text={listing.wrapped_token_address} />
                <ExternalLink className="w-3 h-3 text-primary shrink-0" />
              </div></div>
          )}
          {listing.universal_bridge_address && (
            <div><div className="text-muted-foreground mb-0.5">Universal Bridge (Base)</div>
              <div className="flex items-center gap-1">
                <a href={`https://basescan.org/address/${listing.universal_bridge_address}`} target="_blank" rel="noopener noreferrer" className="font-mono text-primary hover:underline break-all">{listing.universal_bridge_address}</a>
                <ExternalLink className="w-3 h-3 text-primary shrink-0" />
              </div></div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Bridge Component ─────────────────────────────────────────────────────

export default function Bridge() {
  const { address, isConnected, chainId, connectWallet, switchToBase } = useWeb3();

  const [selectedToken, setSelectedToken] = useState<BridgeToken>('EMBR');
  const [listings, setListings] = useState<TokenListing[]>(() => {
    // Seed immediately from cache so tokens appear without any loading flash
    try {
      const cached = localStorage.getItem('bridge_listings_cache');
      if (cached) return JSON.parse(cached) as TokenListing[];
    } catch { /* ignore */ }
    return [];
  });
  const [listingsLoaded, setListingsLoaded] = useState(false);
  const [inflight, setInflight] = useState<BridgeInflight | null>(null);
  const [toast, setToast] = useState<{ msg: string; variant?: 'error' | 'success' } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string, variant?: 'error' | 'success') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ msg, variant });
    if (variant) toastTimerRef.current = setTimeout(() => setToast(null), 7000);
  }, []);

  const startBridgePoll = useCallback((nonce: string, direction: EmbrDirection) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const complete = await isBridgeLegComplete(direction, nonce);
        if (complete) {
          setInflight((prev) => (prev ? { ...prev, status: 'confirmed' } : null));
          clearInterval(pollRef.current!);
          showToast(
            direction === 'embr_to_base'
              ? 'Bridge complete — wEMBR is on Base.'
              : 'Bridge complete — EMBR is on Emberchain.',
            'success',
          );
          return;
        }
        if (API) {
          try {
            const data = (await apiFetch(`/api/bridge/status/${nonce}`)) as { status?: BridgeStatus };
            const status = data.status;
            if (status === 'relayed' || status === 'confirmed') {
              setInflight((prev) => (prev ? { ...prev, status } : null));
              if (status === 'confirmed') clearInterval(pollRef.current!);
            }
          } catch {
            /* api-server optional */
          }
        }
      } catch {
        /* ignore transient RPC errors */
      }
    }, 4000);
  }, [showToast]);

  const pollStatus = useCallback((nonce: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`${API}/api/bridge/status/${nonce}`);
        if (!r.ok) return;
        const data = await r.json();
        const status = data.status as BridgeStatus;
        setInflight((prev) => (prev ? { ...prev, status } : null));
        if (status === 'confirmed' || status === 'failed') clearInterval(pollRef.current!);
      } catch { /* ignore */ }
    }, 5000);
  }, []);

  // Fetch live launched tokens — with cache and retry so they always appear quickly
  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const fetchListings = async (attempt = 0) => {
      try {
        const r = await fetch(`${API}/api/token-launch/listings`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data: TokenListing[] = await r.json();
        const live = data.filter(l => (l as any).status === 'live');
        if (!cancelled) {
          setListings(live);
          setListingsLoaded(true);
          try { localStorage.setItem('bridge_listings_cache', JSON.stringify(live)); } catch { /* ignore */ }
        }
      } catch {
        if (!cancelled) {
          setListingsLoaded(true); // stop showing spinner even on error
          // Retry up to 3 times with exponential back-off (2s, 4s, 8s)
          if (attempt < 3) {
            retryTimer = setTimeout(() => fetchListings(attempt + 1), 2000 * Math.pow(2, attempt));
          }
        }
      }
    };

    fetchListings();
    return () => { cancelled = true; if (retryTimer) clearTimeout(retryTimer); };
  }, []);

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  const listing = selectedToken !== 'EMBR' ? selectedToken as TokenListing : null;

  return (
    <Shell>
      <div className="h-full overflow-y-auto bg-background p-4 md:p-8">
        <div className="max-w-lg mx-auto space-y-6">

          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-secondary border border-border flex items-center justify-center">
              <ArrowRightLeft className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Bridge</h1>
              <p className="text-muted-foreground text-sm">Move tokens between chains and Base.</p>
            </div>
          </div>

          {/* Token picker */}
          <div className="space-y-1.5">
            <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Token to bridge</div>
            <TokenPicker
              selected={selectedToken}
              listings={listings}
              listingsLoaded={listingsLoaded}
              onSelect={(t) => { setSelectedToken(t); setInflight(null); }}
            />
          </div>

          {/* Bridge form — switches based on selected token */}
          {selectedToken === 'EMBR' ? (
            <EmbrBridgeForm
              address={address}
              isConnected={isConnected}
              chainId={chainId}
              connectWallet={connectWallet}
              switchToBase={switchToBase}
              showToast={showToast}
              setInflight={setInflight}
              startBridgePoll={startBridgePoll}
            />
          ) : isEvm(listing!) ? (
            <EvmTokenBridgeForm
              listing={listing!}
              address={address}
              isConnected={isConnected}
              chainId={chainId}
              connectWallet={connectWallet}
              showToast={showToast}
              setInflight={setInflight}
              pollStatus={pollStatus}
            />
          ) : (
            <NonEvmTokenBridgeForm
              listing={listing!}
              address={address}
              isConnected={isConnected}
              chainId={chainId}
              connectWallet={connectWallet}
              showToast={showToast}
              setInflight={setInflight}
              pollStatus={pollStatus}
            />
          )}

          {/* In-flight status */}
          {inflight && (
            <div
              className={cn(
                'border rounded-xl p-4 flex items-start justify-between gap-4',
                inflight.status === 'confirmed' || inflight.status === 'locked'
                  ? 'border-green-500/40 bg-green-500/5'
                  : inflight.status === 'failed'
                  ? 'border-red-500/40 bg-red-500/5'
                  : 'border-primary/30 bg-primary/5',
              )}
            >
              <div className="min-w-0 space-y-1">
                <div className="text-xs text-muted-foreground uppercase font-bold tracking-widest">
                  Bridge #{inflight.nonce.slice(-6)}
                </div>
                {inflight.submittedAt && (
                  <div className="text-xs text-muted-foreground">
                    Submitted {formatBridgeTime(inflight.submittedAt)}
                  </div>
                )}
                {inflight.direction && (
                  <p className="text-xs text-foreground/80">
                    {bridgeStatusMessage(inflight.status, inflight.direction)}
                  </p>
                )}
                {inflight.txHash && (
                  <a
                    href={
                      inflight.direction === 'base_to_embr'
                        ? `https://basescan.org/tx/${inflight.txHash}`
                        : `#${inflight.txHash}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-mono text-primary hover:underline flex items-center gap-1"
                  >
                    {inflight.txHash.slice(0, 20)}…
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              <StatusBadge status={inflight.status} />
            </div>
          )}

          {/* Bridge history */}
          {address && <BridgeHistory address={address} />}

        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={cn('fixed bottom-4 right-4 max-w-sm border-l-4 p-4 shadow-2xl z-50 text-sm font-medium bg-card',
          toast.variant === 'error' ? 'border-destructive' : toast.variant === 'success' ? 'border-green-500' : 'border-primary'
        )}>
          {toast.msg}
        </div>
      )}
    </Shell>
  );
}
