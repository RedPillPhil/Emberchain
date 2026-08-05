import React, { useCallback, useEffect, useState } from 'react';
import { Shell } from '@/components/layout/Shell';
import { getApiBase } from '@/lib/api';
import { operatorAdminFetch } from '@/lib/operator-admin-api';
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, RefreshCw, Shield } from 'lucide-react';

const SECRET_KEY = 'ember_delta_launch_admin_key';

interface LaunchRow {
  id: string;
  status: string;
  symbol: string;
  wrapped_symbol: string;
  token_name: string;
  chain_name: string;
  chain_type: string;
  decimals?: number;
  wrapped_token_address?: string;
  bridge_wallet_address?: string;
  native_bridge_address?: string;
  wallet_download_url?: string;
  escrow_mode?: string;
  admin_notes?: string;
  operator_message?: string;
  submitter_address?: string;
  error_msg?: string;
  created_at?: string;
}

interface DepositRow {
  id: string;
  native_tx_hash: string;
  gross_amount: string;
  base_recipient: string;
  status: string;
  manual_claim?: boolean;
  bridge_in_tx_hash?: string;
  admin_notes?: string;
  created_at?: string;
}

interface QueueResponse {
  awaiting_escrow: LaunchRow[];
  recent: LaunchRow[];
  counts: {
    awaiting_escrow: number;
    live: number;
    failed: number;
    in_progress: number;
  };
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    live: 'text-green-400 border-green-500/40',
    awaiting_escrow: 'text-amber-400 border-amber-500/40',
    failed: 'text-red-400 border-red-500/40',
    deploying: 'text-blue-400 border-blue-500/40',
  };
  return (
    <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded border ${colors[status] ?? 'text-muted-foreground border-border'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function EscrowForm({
  launch,
  privateKey,
  onSaved,
}: {
  launch: LaunchRow;
  privateKey: string;
  onSaved: () => void;
}) {
  const [address, setAddress] = useState(launch.bridge_wallet_address ?? '');
  const [notes, setNotes] = useState(launch.admin_notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!address.trim()) {
      setError('Escrow address required');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await operatorAdminFetch(privateKey, `/api/token-launch/admin/${launch.id}/escrow`, {
        method: 'PATCH',
        body: JSON.stringify({
          bridge_wallet_address: address.trim(),
          admin_notes: notes.trim() || undefined,
          mark_live: true,
        }),
      });
      const data = await r.json() as { error?: string };
      if (!r.ok) throw new Error(data.error ?? 'Save failed');
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 pt-3 border-t border-border/40">
      <div>
        <label className="text-xs text-muted-foreground uppercase font-semibold">Escrow deposit address</label>
        <input
          className="w-full mt-1 bg-background border border-border rounded px-3 py-2 font-mono text-sm text-white"
          placeholder="Paste address from native wallet"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
      </div>
      <div>
        <label className="text-xs text-muted-foreground uppercase font-semibold">Operator notes (internal)</label>
        <input
          className="w-full mt-1 bg-background border border-border rounded px-3 py-2 text-sm text-white"
          placeholder="Optional"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        type="button"
        onClick={() => void save()}
        disabled={busy}
        className="px-4 py-2 bg-primary text-white font-bold rounded text-sm disabled:opacity-50"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin inline" /> : 'Save escrow & mark live'}
      </button>
    </div>
  );
}

function ManualClaimForm({
  launch,
  privateKey,
  onSaved,
}: {
  launch: LaunchRow;
  privateKey: string;
  onSaved: () => void;
}) {
  const [nativeTx, setNativeTx] = useState('');
  const [recipient, setRecipient] = useState(launch.submitter_address ?? '');
  const [amount, setAmount] = useState('');
  const [nativeFrom, setNativeFrom] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [deposits, setDeposits] = useState<DepositRow[]>([]);
  const [loadingDeposits, setLoadingDeposits] = useState(false);

  const loadDeposits = useCallback(async () => {
    setLoadingDeposits(true);
    try {
      const r = await operatorAdminFetch(privateKey, `/api/token-launch/admin/${launch.id}/deposits`);
      const data = await r.json() as { deposits?: DepositRow[]; error?: string };
      if (r.ok) setDeposits(data.deposits ?? []);
    } finally {
      setLoadingDeposits(false);
    }
  }, [launch.id, privateKey]);

  useEffect(() => {
    void loadDeposits();
  }, [loadDeposits]);

  const submit = async () => {
    if (!nativeTx.trim() || !recipient.trim() || !amount.trim()) {
      setError('Native tx id, Base recipient, and amount are required');
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const r = await operatorAdminFetch(privateKey, `/api/token-launch/admin/${launch.id}/claim`, {
        method: 'POST',
        body: JSON.stringify({
          native_tx_hash: nativeTx.trim(),
          base_recipient: recipient.trim(),
          amount: amount.trim(),
          native_from: nativeFrom.trim() || undefined,
          admin_notes: notes.trim() || undefined,
        }),
      });
      const data = await r.json() as { error?: string; bridgeInTxHash?: string; message?: string };
      if (!r.ok) throw new Error(data.error ?? 'Claim failed');
      setSuccess(data.bridgeInTxHash
        ? `Minted — Base tx ${data.bridgeInTxHash.slice(0, 14)}…`
        : (data.message ?? 'Done'));
      setNativeTx('');
      setAmount('');
      void loadDeposits();
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const dec = launch.decimals ?? 18;

  return (
    <div className="space-y-3 pt-3 border-t border-border/40">
      <p className="text-xs text-muted-foreground">
        Manual bridge mint — use after confirming native coin arrived at escrow (Monero, custom chains, or when auto-claim fails).
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="text-xs text-muted-foreground uppercase font-semibold">Native tx id / hash</label>
          <input
            className="w-full mt-1 bg-background border border-border rounded px-3 py-2 font-mono text-sm text-white"
            placeholder="Paste native-chain transaction id"
            value={nativeTx}
            onChange={(e) => setNativeTx(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground uppercase font-semibold">Base recipient (0x)</label>
          <input
            className="w-full mt-1 bg-background border border-border rounded px-3 py-2 font-mono text-sm text-white"
            placeholder="0x… wallet to receive wTOKEN"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground uppercase font-semibold">
            Amount ({launch.symbol}, {dec} decimals)
          </label>
          <input
            className="w-full mt-1 bg-background border border-border rounded px-3 py-2 text-sm text-white"
            placeholder={`e.g. 1.5 ${launch.symbol}`}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground uppercase font-semibold">Sender address (optional)</label>
          <input
            className="w-full mt-1 bg-background border border-border rounded px-3 py-2 font-mono text-sm text-white"
            placeholder="Native sender, for records"
            value={nativeFrom}
            onChange={(e) => setNativeFrom(e.target.value)}
          />
        </div>
      </div>
      <div>
        <label className="text-xs text-muted-foreground uppercase font-semibold">Operator notes (optional)</label>
        <input
          className="w-full mt-1 bg-background border border-border rounded px-3 py-2 text-sm text-white"
          placeholder="e.g. verified in Monero wallet GUI"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {success && <p className="text-sm text-green-400">{success}</p>}
      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy}
        className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded text-sm disabled:opacity-50"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin inline" /> : 'Mint wrapped tokens (manual claim)'}
      </button>

      {(deposits.length > 0 || loadingDeposits) && (
        <div className="mt-4 space-y-2">
          <div className="text-xs text-muted-foreground uppercase font-semibold">Bridge deposits</div>
          {loadingDeposits && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
          {deposits.map((d) => (
            <div key={d.id} className="text-xs bg-background/50 border border-border/30 rounded p-2 space-y-1">
              <div className="flex flex-wrap gap-2 items-center">
                <span className={d.status === 'minted' ? 'text-green-400' : d.status === 'failed' ? 'text-red-400' : 'text-amber-400'}>
                  {d.status}
                </span>
                {d.manual_claim && <span className="text-amber-400/80">manual</span>}
              </div>
              <div className="font-mono break-all text-white/80">tx: {d.native_tx_hash}</div>
              <div className="text-muted-foreground">→ {d.base_recipient}</div>
              {d.bridge_in_tx_hash && (
                <a
                  href={`https://basescan.org/tx/${d.bridge_in_tx_hash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  Base mint tx <ExternalLink className="w-3 h-3 inline" />
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LaunchCard({
  launch,
  privateKey,
  onSaved,
  highlight,
}: {
  launch: LaunchRow;
  privateKey: string;
  onSaved: () => void;
  highlight?: boolean;
}) {
  return (
    <div className={`bg-card border rounded-lg p-5 space-y-2 ${highlight ? 'border-amber-500/40' : 'border-border/40'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-bold text-white">{launch.symbol} → {launch.wrapped_symbol}</h3>
        <StatusBadge status={launch.status} />
        <span className="text-xs text-muted-foreground">{launch.chain_name}</span>
        {launch.escrow_mode === 'manual' && (
          <span className="text-xs text-amber-400">manual escrow</span>
        )}
      </div>
      <div className="text-xs text-muted-foreground font-mono break-all">ID: {launch.id}</div>
      {launch.wrapped_token_address && (
        <div className="text-xs break-all">
          <span className="text-muted-foreground">wTOKEN: </span>
          <a href={`https://basescan.org/token/${launch.wrapped_token_address}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">
            {launch.wrapped_token_address} <ExternalLink className="w-3 h-3 inline" />
          </a>
        </div>
      )}
      {launch.wallet_download_url && (
        <div className="text-sm">
          <span className="text-muted-foreground">Wallet download: </span>
          <a href={launch.wallet_download_url} target="_blank" rel="noreferrer" className="text-primary hover:underline break-all">
            {launch.wallet_download_url}
          </a>
        </div>
      )}
      {launch.bridge_wallet_address && (
        <div className="text-xs font-mono break-all text-white">Escrow: {launch.bridge_wallet_address}</div>
      )}
      {launch.error_msg && <p className="text-sm text-red-400">{launch.error_msg}</p>}
      {launch.status === 'awaiting_escrow' && (
        <EscrowForm launch={launch} privateKey={privateKey} onSaved={onSaved} />
      )}
      {launch.status === 'live' && launch.bridge_wallet_address && (
        <ManualClaimForm launch={launch} privateKey={privateKey} onSaved={onSaved} />
      )}
    </div>
  );
}

export default function Admin() {
  const [privateKey, setPrivateKey] = useState('');
  const [inputKey, setInputKey] = useState('');
  const [queue, setQueue] = useState<QueueResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const saved = sessionStorage.getItem(SECRET_KEY);
    if (saved) setPrivateKey(saved);
  }, []);

  const load = useCallback(async () => {
    if (!privateKey) return;
    setLoading(true);
    setError(null);
    try {
      const r = await operatorAdminFetch(privateKey, '/api/token-launch/admin/queue');
      const data = await r.json() as QueueResponse & { error?: string };
      if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`);
      setQueue(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setQueue(null);
    } finally {
      setLoading(false);
    }
  }, [privateKey]);

  useEffect(() => {
    if (privateKey) void load();
  }, [privateKey, load]);

  if (!privateKey) {
    return (
      <Shell>
        <div className="h-full overflow-y-auto p-8 max-w-md mx-auto">
          <div className="bg-card border border-border rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-white font-bold">
              <Shield className="w-5 h-5 text-primary" /> Launch Admin
            </div>
            <p className="text-sm text-muted-foreground">
              Same login as <code className="text-primary">emberchain.org/admin</code> — your bridge relayer
              private key. Key stays in this browser only; the server verifies a signature, never the raw key.
            </p>
            <input
              type="password"
              className="w-full bg-background border border-border rounded px-3 py-2 text-sm"
              placeholder="Bridge relayer private key (0x…)"
              value={inputKey}
              onChange={(e) => setInputKey(e.target.value)}
            />
            <button
              type="button"
              className="w-full py-2 bg-primary text-white font-bold rounded"
              onClick={() => {
                sessionStorage.setItem(SECRET_KEY, inputKey.trim());
                setPrivateKey(inputKey.trim());
              }}
            >
              Unlock
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="h-full overflow-y-auto p-4 md:p-8 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Token Launch Admin</h1>
            <p className="text-sm text-muted-foreground">Manual escrow setup and bridge mints for privacy/custom chains</p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 border border-border rounded text-sm text-white hover:bg-white/5"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded text-red-300 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        {queue && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-card border border-amber-500/30 rounded p-3">
              <div className="text-2xl font-bold text-amber-400">{queue.counts.awaiting_escrow}</div>
              <div className="text-xs text-muted-foreground">Awaiting escrow</div>
            </div>
            <div className="bg-card border border-border rounded p-3">
              <div className="text-2xl font-bold text-green-400">{queue.counts.live}</div>
              <div className="text-xs text-muted-foreground">Live</div>
            </div>
            <div className="bg-card border border-border rounded p-3">
              <div className="text-2xl font-bold text-blue-400">{queue.counts.in_progress}</div>
              <div className="text-xs text-muted-foreground">In progress</div>
            </div>
            <div className="bg-card border border-border rounded p-3">
              <div className="text-2xl font-bold text-red-400">{queue.counts.failed}</div>
              <div className="text-xs text-muted-foreground">Failed</div>
            </div>
          </div>
        )}

        {queue && queue.awaiting_escrow.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-amber-300 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" /> Needs your action
            </h2>
            {queue.awaiting_escrow.map((l) => (
              <LaunchCard key={l.id} launch={l} privateKey={privateKey} onSaved={load} highlight />
            ))}
          </section>
        )}

        {queue && queue.awaiting_escrow.length === 0 && !loading && (
          <div className="flex items-center gap-2 text-green-400 text-sm">
            <CheckCircle2 className="w-4 h-4" /> No launches waiting for manual escrow
          </div>
        )}

        {queue && (
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white">Recent launches</h2>
            {queue.recent.slice(0, 20).map((l) => (
              <LaunchCard key={l.id} launch={l} privateKey={privateKey} onSaved={load} />
            ))}
          </section>
        )}
      </div>
    </Shell>
  );
}
