import React, { useState, useEffect, useCallback } from 'react';
import { Shell } from '@/components/layout/Shell';
import { Link } from 'wouter';
import {
  Rocket, ChevronRight, ChevronLeft, Wallet, CheckCircle2,
  Clock, AlertCircle, Loader2, ExternalLink, Copy, Check,
  Zap, Globe, Shield, HelpCircle, Info,
} from 'lucide-react';
import { useAccount, useSendTransaction, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther } from 'viem';
import { API, apiFetch } from '@/lib/api';

/** Set VITE_TOKEN_LAUNCH_DOWN=false when api-server + Postgres are running again. */
const TOKEN_LAUNCH_DOWN = import.meta.env.VITE_TOKEN_LAUNCH_DOWN !== 'false';

// ── Types ─────────────────────────────────────────────────────────────────────

type ChainType = 'evm' | 'utxo' | 'privacy' | 'custom';

interface FeeInfo { usdAmount: number; ethPrice: number; ethAmount: string; weiAmount: string }
interface LaunchRecord {
  id: string; status: string; symbol: string; wrapped_symbol: string;
  token_name: string; chain_name: string; chain_type: string;
  bridge_wallet_address?: string; bridge_wallet_type?: string;
  wrapped_token_address?: string; universal_bridge_address?: string;
  error_msg?: string;
}

// ── Step indicator ────────────────────────────────────────────────────────────

const STEPS = ['Token Info', 'Technical Details', 'Pay Fee', 'Track Status'];

function StepBar({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0 mb-8">
      {STEPS.map((label, i) => (
        <React.Fragment key={i}>
          <div className="flex flex-col items-center gap-1">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
              i < current ? 'bg-primary text-white' :
              i === current ? 'bg-primary/20 border-2 border-primary text-primary' :
              'bg-muted/30 border border-border text-muted-foreground'
            }`}>
              {i < current ? <Check className="w-4 h-4" /> : i + 1}
            </div>
            <span className={`text-xs hidden md:block ${i === current ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
              {label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`flex-1 h-px mx-2 mb-4 ${i < current ? 'bg-primary' : 'bg-border'}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ── Reusable field component ──────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
        {label}
        {hint && (
          <span className="group relative">
            <HelpCircle className="w-3 h-3 cursor-help" />
            <span className="absolute left-4 top-0 z-50 hidden group-hover:block w-52 bg-card border border-border rounded p-2 text-xs text-muted-foreground normal-case tracking-normal font-normal">
              {hint}
            </span>
          </span>
        )}
      </label>
      {children}
    </div>
  );
}

const inputCls = "w-full px-3 py-2 bg-input border border-border rounded text-sm text-white focus:outline-none focus:border-primary transition-colors";
const selectCls = `${inputCls} cursor-pointer`;

// ── Step 1: Token Info ────────────────────────────────────────────────────────

interface Step1Data {
  symbol: string; tokenName: string; chainName: string; chainType: ChainType;
}

function Step1({ data, onChange }: { data: Step1Data; onChange: (d: Step1Data) => void }) {
  const chainTypes: { value: ChainType; label: string; icon: React.ReactNode; desc: string }[] = [
    { value: 'evm', label: 'EVM-Compatible', icon: <Zap className="w-4 h-4" />, desc: 'Ethereum-style chain (ETH, MATIC, BNB forks)' },
    { value: 'utxo', label: 'Bitcoin / UTXO', icon: <Globe className="w-4 h-4" />, desc: 'Bitcoin-style PoW (BTC, LTC, DOGE, PEPE forks)' },
    { value: 'privacy', label: 'Privacy Chain', icon: <Shield className="w-4 h-4" />, desc: 'Monero-based or ring-signature chains' },
    { value: 'custom', label: 'Custom / Other', icon: <HelpCircle className="w-4 h-4" />, desc: 'Unique architecture or consensus model' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Token Symbol" hint="Enter only the base symbol — we add the 'w' prefix automatically.">
          <div className="relative">
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-primary font-mono font-bold text-sm">w</div>
            <input
              type="text"
              className={`${inputCls} pl-7 uppercase font-mono`}
              placeholder="PEPE"
              maxLength={10}
              value={data.symbol}
              onChange={e => onChange({ ...data, symbol: e.target.value.toUpperCase().replace(/^w/i, '') })}
            />
          </div>
          {data.symbol && (
            <p className="text-xs text-primary mt-1">Wrapped token will be: <strong>w{data.symbol}</strong></p>
          )}
        </Field>

        <Field label="Token Name" hint="Full name of the native token.">
          <input
            type="text"
            className={inputCls}
            placeholder="Pepecoin"
            value={data.tokenName}
            onChange={e => onChange({ ...data, tokenName: e.target.value })}
          />
        </Field>
      </div>

      <Field label="Blockchain Name" hint="The name of the native blockchain network.">
        <input
          type="text"
          className={inputCls}
          placeholder="Pepecoin Network"
          value={data.chainName}
          onChange={e => onChange({ ...data, chainName: e.target.value })}
        />
      </Field>

      <Field label="Chain Architecture">
        <div className="grid grid-cols-2 gap-2">
          {chainTypes.map(ct => (
            <button
              key={ct.value}
              type="button"
              onClick={() => onChange({ ...data, chainType: ct.value })}
              className={`p-3 rounded border text-left transition-all ${
                data.chainType === ct.value
                  ? 'border-primary bg-primary/10 text-white'
                  : 'border-border bg-card/30 text-muted-foreground hover:border-primary/40'
              }`}
            >
              <div className="flex items-center gap-2 font-semibold text-sm mb-0.5">
                {ct.icon} {ct.label}
              </div>
              <div className="text-xs opacity-70">{ct.desc}</div>
            </button>
          ))}
        </div>
      </Field>
    </div>
  );
}

// ── Step 2: Technical Details ─────────────────────────────────────────────────

interface Step2Data {
  rpcUrl: string; chainId: string; explorerUrl: string;
  consensus: string; cryptography: string; addressFormat: string;
  utxoNetwork: string; txModel: string; decimals: string; confirmationsReq: string;
}

function Step2({ data, onChange, chainType }: { data: Step2Data; onChange: (d: Step2Data) => void; chainType: ChainType }) {
  const isEvm = chainType === 'evm';

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="RPC Endpoint URL" hint="The JSON-RPC URL for the native chain (used to deploy and monitor the bridge).">
          <input type="url" className={inputCls} placeholder="https://rpc.yourchain.com" value={data.rpcUrl}
            onChange={e => onChange({ ...data, rpcUrl: e.target.value })} />
        </Field>
        {isEvm && (
          <Field label="Chain ID" hint="Numeric chain ID of the EVM network.">
            <input type="number" className={inputCls} placeholder="1234" value={data.chainId}
              onChange={e => onChange({ ...data, chainId: e.target.value })} />
          </Field>
        )}
      </div>

      {!isEvm && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Signing Curve" hint="The cryptographic curve used to sign transactions — determines which bridge wallet format the server uses.">
              <select className={selectCls} value={data.cryptography}
                onChange={e => onChange({ ...data, cryptography: e.target.value, utxoNetwork: '' })}>
                <option value="">Select…</option>
                <option value="secp256k1">secp256k1 — Bitcoin / Ethereum family</option>
                <option value="ed25519">ed25519 — Monero / Solana / Stellar family</option>
                <option value="other">Other / Custom</option>
              </select>
            </Field>

            <Field label="Address Format" hint="How native wallet addresses look on your chain.">
              <select className={selectCls} value={data.addressFormat}
                onChange={e => onChange({ ...data, addressFormat: e.target.value, utxoNetwork: '' })}>
                <option value="">Select…</option>
                <option value="hex">0x hex — Ethereum-style</option>
                <option value="base58">Base58 — Bitcoin-style (1… L… D…)</option>
                <option value="bech32">Bech32 — native SegWit (bc1… ltc1…)</option>
                <option value="custom">Custom / Other</option>
              </select>
            </Field>
          </div>

          {/* Show network selector only when we can pre-generate the right address */}
          {data.cryptography === 'secp256k1' && (data.addressFormat === 'base58' || data.addressFormat === 'bech32') && (
            <Field
              label="Which Network?"
              hint="Selects the correct address prefix — the server already holds a pre-generated deposit address for each network below."
            >
              <select className={selectCls} value={data.utxoNetwork}
                onChange={e => onChange({ ...data, utxoNetwork: e.target.value })}>
                <option value="">Select network…</option>
                {data.addressFormat === 'base58' && <>
                  <option value="bitcoin">Bitcoin (BTC) — legacy 1…</option>
                  <option value="litecoin">Litecoin (LTC) — L…</option>
                  <option value="dogecoin">Dogecoin (DOGE) — D…</option>
                  <option value="dash">Dash (DASH) — X…</option>
                  <option value="zcash">Zcash (ZEC) — t1…</option>
                  <option value="other">Other UTXO (Bitcoin-format fallback)</option>
                </>}
                {data.addressFormat === 'bech32' && <>
                  <option value="bitcoin">Bitcoin (BTC) — bc1…</option>
                  <option value="litecoin">Litecoin (LTC) — ltc1…</option>
                  <option value="other">Other SegWit (Bitcoin prefix fallback)</option>
                </>}
              </select>
            </Field>
          )}
        </>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Consensus" hint="How the chain reaches agreement on blocks.">
          <select className={selectCls} value={data.consensus}
            onChange={e => onChange({ ...data, consensus: e.target.value })}>
            <option value="">Select…</option>
            <option value="pow">Proof of Work</option>
            <option value="pos">Proof of Stake</option>
            <option value="other">Other</option>
          </select>
        </Field>

        <Field label="Token Decimals" hint="Number of decimal places (18 for most EVM tokens).">
          <input type="number" className={inputCls} placeholder="18" min={0} max={18}
            value={data.decimals} onChange={e => onChange({ ...data, decimals: e.target.value })} />
        </Field>

        <Field label="Confirmations Required" hint="Block confirmations before a bridge deposit is considered final.">
          <input type="number" className={inputCls} placeholder="6" min={1} max={200}
            value={data.confirmationsReq} onChange={e => onChange({ ...data, confirmationsReq: e.target.value })} />
        </Field>
      </div>

      <Field label="Block Explorer / API URL" hint="Optional — used to verify deposits (e.g. https://explorer.yourchain.com).">
        <input type="url" className={inputCls} placeholder="https://explorer.yourchain.com" value={data.explorerUrl}
          onChange={e => onChange({ ...data, explorerUrl: e.target.value })} />
      </Field>

      {!isEvm && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded p-4 text-sm text-amber-200/80">
          <strong className="text-amber-300">Non-EVM bridge note:</strong> For Bitcoin/UTXO and privacy chains,
          the bridge uses a server-side escrow wallet. No smart contract is deployed on your chain.
          Users send native coins to an escrow address; the server mints wrapped tokens on Base after confirmation.
        </div>
      )}
    </div>
  );
}

// ── Step 3: Pay Fee ───────────────────────────────────────────────────────────

function Step3({
  launchId, chainType, feeInfo, onPaid,
}: {
  launchId: string | null;
  chainType: ChainType;
  feeInfo: FeeInfo | null;
  onPaid: (txHash: string) => void;
}) {
  const { address, isConnected } = useAccount();
  const { data: txHash, sendTransaction, isPending } = useSendTransaction();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txHash });
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Launch fees go to the deployer address which funds auto-liquidity operations
  const FEE_RECIPIENT = (import.meta.env.VITE_LAUNCH_FEE_ADDRESS as string | undefined) ?? '0x2Cf79aaf301a6c41F03eB7C2667564949F44c0ce';

  const TEST_ADDRESS = '0xa8f6efc25896c24ac6c9441f9f693c14517aa818';
  const isTestWallet = address?.toLowerCase() === TEST_ADDRESS;

  const handlePay = () => {
    if (!feeInfo || !launchId) return;
    setError(null);
    sendTransaction({
      to: FEE_RECIPIENT as `0x${string}`,
      value: isTestWallet ? 0n : BigInt(feeInfo.weiAmount),
      chainId: 8453,
    });
  };

  // When tx confirmed → verify with backend
  useEffect(() => {
    if (!isConfirmed || !txHash || !launchId) return;
    setVerifying(true);
    fetch(`${API}/api/token-launch/${launchId}/verify-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tx_hash: txHash }),
    })
      .then(r => r.json())
      .then(() => { onPaid(txHash); })
      .catch(() => setError('Payment confirmed on-chain, but server verification failed. Please refresh.'))
      .finally(() => setVerifying(false));
  }, [isConfirmed, txHash, launchId, onPaid]);

  return (
    <div className="space-y-6">
      <div className="bg-primary/10 border border-primary/20 rounded-lg p-6">
        <div className="text-center mb-4">
          <div className="text-sm text-muted-foreground mb-1">Launch Fee</div>
          <div className="text-4xl font-bold text-white">${feeInfo?.usdAmount ?? 20}</div>
          <div className="text-primary font-mono text-lg mt-1">
            {feeInfo ? `≈ ${feeInfo.ethAmount} ETH` : <Loader2 className="w-4 h-4 animate-spin inline" />}
          </div>
          {feeInfo && (
            <div className="text-xs text-muted-foreground mt-1">
              at ${feeInfo.ethPrice.toLocaleString()} / ETH
            </div>
          )}
        </div>

        <div className="bg-background/60 rounded border border-border/40 p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Covers</span>
            <span className="text-white">Wrapped token deployment on Base</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Bridge setup</span>
            <span className="text-white">{chainType === 'evm' ? 'Smart contract on your chain' : 'Server escrow wallet'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">DEX listing</span>
            <span className="text-white">w{'{symbol}'} / ETH &amp; w{'{symbol}'} / wEMBR</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Surplus →</span>
            <span className="text-white">EmberDelta liquidity treasury</span>
          </div>
        </div>
      </div>

      {!isConnected ? (
        <div className="text-center p-6 border border-dashed border-border rounded-lg">
          <Wallet className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-muted-foreground">Connect your wallet to pay on Base</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Use the connect button in the top bar</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="w-2 h-2 rounded-full bg-green-400" />
            Connected: <span className="font-mono text-white">{address?.slice(0, 6)}…{address?.slice(-4)}</span>
            <span className="text-xs opacity-60">(Base network)</span>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded text-red-300 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
            </div>
          )}

          {isConfirmed ? (
            <div className="flex items-center gap-2 p-4 bg-green-500/10 border border-green-500/20 rounded text-green-300">
              <CheckCircle2 className="w-5 h-5" />
              {verifying ? 'Verifying payment…' : 'Payment confirmed! Advancing…'}
            </div>
          ) : (
            <button
              onClick={handlePay}
              disabled={!feeInfo || isPending || isConfirming}
              className="w-full py-4 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold uppercase tracking-widest rounded transition-all flex items-center justify-center gap-2"
            >
              {isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Confirm in Wallet…</> :
               isConfirming ? <><Loader2 className="w-4 h-4 animate-spin" /> Waiting for confirmation…</> :
               <><Rocket className="w-4 h-4" /> Pay Launch Fee &amp; List Token</>}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Step 4: Status Tracker ────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, { label: string; desc: string; color: string }> = {
  pending_payment:   { label: 'Awaiting Payment',      desc: 'Launch fee not yet received.',            color: 'text-amber-400' },
  payment_confirmed: { label: 'Payment Confirmed',     desc: 'Deriving bridge wallet…',                 color: 'text-blue-400' },
  pending_gas:       { label: 'Awaiting Bridge Gas',   desc: 'Send native gas to the bridge wallet on your chain so the server can deploy bridge contracts.',    color: 'text-amber-400' },
  deploying:         { label: 'Deploying Contracts',   desc: 'Wrapped token &amp; bridge going live…',  color: 'text-blue-400' },
  live:              { label: 'Live! 🎉',              desc: 'Your token is fully listed on EmberDelta.', color: 'text-green-400' },
  failed:            { label: 'Failed',                desc: 'Something went wrong.',                   color: 'text-red-400' },
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy} className="ml-1 text-muted-foreground hover:text-white transition-colors">
      {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

function Step4({ launchId, chainType }: { launchId: string; chainType: ChainType }) {
  const [launch, setLaunch] = useState<LaunchRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  const poll = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/token-launch/${launchId}`);
      if (r.ok) setLaunch(await r.json() as LaunchRecord);
    } catch { setError('Could not reach server — retrying…'); }
  }, [launchId]);

  useEffect(() => {
    poll();
    const iv = setInterval(poll, 8_000);
    return () => clearInterval(iv);
  }, [poll]);

  const status = launch?.status ?? 'pending_payment';
  const info = STATUS_LABELS[status] ?? STATUS_LABELS['pending_payment'];
  const isLive = status === 'live';
  const isFailed = status === 'failed';
  const isPendingGas = status === 'pending_gas';

  const statusOrder = ['pending_payment', 'payment_confirmed', 'pending_gas', 'deploying', 'live'];
  const currentIdx = statusOrder.indexOf(status);

  return (
    <div className="space-y-6">
      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex justify-between items-center mb-1">
          <span className={`font-bold ${info.color}`}>{info.label}</span>
          {!isLive && !isFailed && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
          {isLive && <CheckCircle2 className="w-5 h-5 text-green-400" />}
          {isFailed && <AlertCircle className="w-5 h-5 text-red-400" />}
        </div>
        <div className="w-full bg-muted/30 rounded-full h-2">
          <div
            className="bg-primary h-2 rounded-full transition-all duration-1000"
            style={{ width: `${isLive ? 100 : Math.max(5, (currentIdx / (statusOrder.length - 1)) * 100)}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Payment</span><span>Bridge wallet</span><span>Deploying</span><span>Live</span>
        </div>
      </div>

      {/* Launch ID */}
      <div className="bg-card border border-border/40 rounded p-4 text-sm space-y-1">
        <div className="text-xs text-muted-foreground uppercase font-semibold">Launch Reference ID</div>
        <div className="font-mono text-white break-all flex items-center gap-1 text-xs">
          {launchId} <CopyButton text={launchId} />
        </div>
        <div className="text-xs text-muted-foreground">Save this — you can use it to check status later.</div>
      </div>

      {/* Error message */}
      {isFailed && launch?.error_msg && (
        <div className="bg-red-500/10 border border-red-500/20 rounded p-4 text-red-300 text-sm">
          <strong>Error:</strong> {launch.error_msg}
        </div>
      )}

      {/* Bridge wallet (gas funding) — EVM chains only */}
      {isPendingGas && launch?.bridge_wallet_address && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded p-5 space-y-3">
          <h3 className="font-bold text-amber-300 flex items-center gap-2">
            <Wallet className="w-4 h-4" /> Fund Bridge Wallet on {launch.chain_name}
          </h3>

          {/* Explainer box */}
          <div className="bg-amber-500/5 border border-amber-500/15 rounded p-3 flex gap-2 text-xs text-amber-200/70">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
            <span>
              To deploy the bridge contract on <strong className="text-amber-300">{launch.chain_name}</strong>,
              our server needs a small amount of <strong className="text-amber-300">{launch.symbol}</strong>{' '}
              (the native gas coin of {launch.chain_name}) in its wallet.
              This is a one-time cost to cover transaction fees on your chain — it is separate from the $20 listing fee you already paid on Base.
            </span>
          </div>

          <p className="text-sm text-amber-200/80">
            Send at least{' '}
            <strong className="text-amber-300">0.01 {launch.symbol}</strong>{' '}
            <span className="text-amber-200/60">(on {launch.chain_name})</span>{' '}
            to this address:
          </p>
          <div className="bg-background/60 rounded border border-amber-500/20 p-3 font-mono text-sm text-white break-all flex items-start gap-2">
            {launch.bridge_wallet_address}
            <CopyButton text={launch.bridge_wallet_address} />
          </div>
          <p className="text-xs text-amber-200/60">
            {launch.bridge_wallet_type === 'utxo_derived'
              ? 'Address derived from the bridge relayer key using your chain\'s secp256k1 + Base58Check encoding.'
              : launch.bridge_wallet_type === 'manual'
              ? 'The team will provide your escrow address shortly — your chain requires a native wallet.'
              : `This is the EmberChain bridge relayer address. Make sure you're sending on ${launch.chain_name}, not on Base or any other chain.`}
          </p>
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin" /> Monitoring {launch.chain_name} balance every 30 seconds…
          </div>
        </div>
      )}

      {/* Live — show deployed info */}
      {isLive && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-5 space-y-4">
          <h3 className="font-bold text-green-300 text-lg flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5" /> {launch?.wrapped_symbol} is live on EmberDelta!
          </h3>

          {launch?.wrapped_token_address && (
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground uppercase font-semibold">Wrapped Token (Base)</div>
              <div className="font-mono text-sm text-white flex items-center gap-2 break-all">
                {launch.wrapped_token_address}
                <CopyButton text={launch.wrapped_token_address} />
                <a href={`https://basescan.org/token/${launch.wrapped_token_address}`} target="_blank" rel="noreferrer"
                  className="text-primary hover:text-primary/80 shrink-0">
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Link
              href={launch?.wrapped_token_address ? `/?pair=${launch.wrapped_token_address}` : '/'}
              className="flex items-center justify-center gap-2 py-3 bg-primary/20 border border-primary/30 text-primary hover:bg-primary/30 rounded font-semibold text-sm transition-all">
              <Rocket className="w-4 h-4" /> Trade {launch?.wrapped_symbol}
            </Link>
            <Link
              href="/bridge"
              className="flex items-center justify-center gap-2 py-3 bg-card border border-border text-muted-foreground hover:border-primary/40 hover:text-white rounded font-semibold text-sm transition-all">
              <Globe className="w-4 h-4" /> Bridge Page
            </Link>
          </div>
        </div>
      )}

      {/* Status description */}
      {!isFailed && !isLive && !isPendingGas && (
        <div className="flex items-start gap-3 p-4 bg-blue-500/10 border border-blue-500/20 rounded text-sm text-blue-200/80">
          <Clock className="w-4 h-4 shrink-0 mt-0.5 text-blue-400" />
          <span dangerouslySetInnerHTML={{ __html: info.desc }} />
        </div>
      )}

      {error && (
        <div className="text-xs text-amber-400 flex items-center gap-1.5">
          <AlertCircle className="w-3 h-3" /> {error}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function LaunchDown() {
  return (
    <Shell>
      <div className="relative min-h-[60vh] flex flex-col">
        <div className="space-y-6 opacity-40 pointer-events-none select-none blur-[1px]" aria-hidden>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/20 border border-primary/30" />
            <div>
              <h1 className="text-2xl font-bold text-white">Launch a Token</h1>
              <p className="text-muted-foreground text-sm">Wrapped token, bridge, and DEX listing</p>
            </div>
          </div>
          <div className="bg-card border border-border/40 rounded-lg h-64" />
        </div>
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-card border border-border rounded-xl shadow-xl p-8 text-center space-y-5">
            <AlertCircle className="w-10 h-10 text-muted-foreground mx-auto" />
            <div className="space-y-2">
              <h2 className="text-lg font-bold text-white">Token launch is paused</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Auto-launch needs an always-on api-server (Postgres + contract deployment). Payment can be
                verified on Base without a server, but listing a token on the DEX still requires backend
                processing. Use the bridge in the meantime.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <Link href="/bridge">
                <button type="button" className="w-full sm:w-auto px-5 py-2.5 bg-primary text-white font-bold rounded text-sm">
                  Go to Bridge
                </button>
              </Link>
              <a href="/emberswap">
                <button type="button" className="w-full sm:w-auto px-5 py-2.5 border border-border text-white rounded text-sm">
                  EmberSwap Bridge
                </button>
              </a>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}

function LaunchContent() {
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [launchId, setLaunchId] = useState<string | null>(null);
  const [feeTxHash, setFeeTxHash] = useState<string | null>(null);
  const [feeInfo, setFeeInfo] = useState<FeeInfo | null>(null);

  const { address } = useAccount();

  const [step1, setStep1] = useState<Step1Data>({
    symbol: '', tokenName: '', chainName: '', chainType: 'evm',
  });
  const [step2, setStep2] = useState<Step2Data>({
    rpcUrl: '', chainId: '', explorerUrl: '',
    consensus: '', cryptography: '', addressFormat: '', utxoNetwork: '', txModel: '',
    decimals: '18', confirmationsReq: '6',
  });

  // Fetch fee on load
  useEffect(() => {
    fetch(`${API}/api/token-launch/fee`)
      .then(r => r.json())
      .then(d => setFeeInfo(d as FeeInfo))
      .catch(() => {});
  }, []);

  const canAdvanceStep1 = step1.symbol.trim() && step1.tokenName.trim() && step1.chainName.trim();
  const canAdvanceStep2 = step2.rpcUrl.trim() &&
    (step1.chainType !== 'evm' || step2.chainId.trim());

  const handleSubmitLaunch = async () => {
    if (!address) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const r = await fetch(`${API}/api/token-launch/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: step1.symbol,
          token_name: step1.tokenName,
          chain_name: step1.chainName,
          chain_type: step1.chainType,
          chain_id: step2.chainId || undefined,
          rpc_url: step2.rpcUrl,
          explorer_url: step2.explorerUrl || undefined,
          consensus: step2.consensus || undefined,
          cryptography: step2.cryptography || undefined,
          address_format: step2.addressFormat || undefined,
          utxo_network: step2.utxoNetwork || undefined,
          tx_model: step2.txModel || undefined,
          decimals: step2.decimals || '18',
          confirmations_req: step2.confirmationsReq || '6',
          submitter_address: address,
        }),
      });
      if (!r.ok) {
        const err = await r.json() as { error?: string };
        throw new Error(err.error ?? 'Submission failed');
      }
      const data = await r.json() as { id: string };
      setLaunchId(data.id);
      setStep(2);
    } catch (err) {
      setSubmitError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handlePaid = (txHash: string) => {
    setFeeTxHash(txHash);
    setStep(3);
  };

  return (
    <Shell>
      <div className="h-full overflow-y-auto bg-background p-4 md:p-8">
        <div className="max-w-2xl mx-auto">

          {/* Header */}
          <div className="flex items-center gap-4 mb-8">
            <div className="w-12 h-12 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary">
              <Rocket className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Launch a Token</h1>
              <p className="text-muted-foreground text-sm mt-0.5">
                Bring your native coin to Base — wrapped token, bridge, and DEX listing in one step.
              </p>
            </div>
          </div>

          <StepBar current={step} />

          {/* Step content */}
          <div className="bg-card border border-border/40 rounded-lg shadow-xl p-6">
            {step === 0 && (
              <>
                <h2 className="text-lg font-semibold text-white mb-5 pb-2 border-b border-border/40">Token Information</h2>
                <Step1 data={step1} onChange={setStep1} />
                <div className="mt-6 flex justify-end">
                  <button
                    onClick={() => setStep(1)}
                    disabled={!canAdvanceStep1}
                    className="flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded transition-all"
                  >
                    Next: Technical Details <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <h2 className="text-lg font-semibold text-white mb-5 pb-2 border-b border-border/40">Technical Details</h2>
                <Step2 data={step2} onChange={setStep2} chainType={step1.chainType} />
                {submitError && (
                  <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded text-red-300 text-sm flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {submitError}
                  </div>
                )}
                <div className="mt-6 flex justify-between">
                  <button onClick={() => setStep(0)}
                    className="flex items-center gap-1.5 px-4 py-2 text-muted-foreground hover:text-white transition-colors">
                    <ChevronLeft className="w-4 h-4" /> Back
                  </button>
                  <button
                    onClick={handleSubmitLaunch}
                    disabled={!canAdvanceStep2 || submitting || !address}
                    className="flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded transition-all"
                  >
                    {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</> :
                     !address ? 'Connect wallet first' :
                     <>Next: Pay Fee <ChevronRight className="w-4 h-4" /></>}
                  </button>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <h2 className="text-lg font-semibold text-white mb-5 pb-2 border-b border-border/40">
                  Pay Launch Fee — w{step1.symbol || '{TOKEN}'}
                </h2>
                <Step3
                  launchId={launchId}
                  chainType={step1.chainType}
                  feeInfo={feeInfo}
                  onPaid={handlePaid}
                />
                {!feeTxHash && (
                  <div className="mt-4 flex justify-start">
                    <button onClick={() => setStep(1)}
                      className="flex items-center gap-1.5 px-4 py-2 text-muted-foreground hover:text-white transition-colors text-sm">
                      <ChevronLeft className="w-4 h-4" /> Back
                    </button>
                  </div>
                )}
              </>
            )}

            {step === 3 && launchId && (
              <>
                <h2 className="text-lg font-semibold text-white mb-5 pb-2 border-b border-border/40">
                  Deployment Status — w{step1.symbol}
                </h2>
                <Step4 launchId={launchId} chainType={step1.chainType} />
              </>
            )}
          </div>

          {/* Info cards below form */}
          {step < 2 && (
            <div className="mt-6 grid grid-cols-3 gap-3">
              {[
                { icon: <Rocket className="w-4 h-4" />, title: 'Wrapped Token', body: 'ERC-20 on Base with full mint/burn bridge control' },
                { icon: <Globe className="w-4 h-4" />, title: 'Bridge', body: 'Smart contract (EVM) or server escrow (non-EVM)' },
                { icon: <Zap className="w-4 h-4" />, title: 'DEX Listing', body: 'Instant w{TOKEN}/ETH and w{TOKEN}/wEMBR trading pairs' },
              ].map((card, i) => (
                <div key={i} className="bg-card border border-border/30 rounded p-4 text-sm">
                  <div className="text-primary mb-1.5">{card.icon}</div>
                  <div className="font-semibold text-white/80 mb-0.5">{card.title}</div>
                  <div className="text-muted-foreground text-xs">{card.body}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}

export default function Launch() {
  if (TOKEN_LAUNCH_DOWN) return <LaunchDown />;
  return <LaunchContent />;
}
