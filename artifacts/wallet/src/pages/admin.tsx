import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Shell } from "@/components/layout/shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRelayerAuth } from "@/hooks/use-relayer-auth";
import {
  completeBaseToEmbr,
  completeEmbrToBase,
  fetchBaseOutByTxHash,
  fetchEmbrLockByTxHash,
  fetchPendingBridges,
  formatBridgeTime,
  formatEmbr,
  markBridgeRelayedOnServer,
  type PendingBridge,
} from "@/lib/bridge-admin";
import {
  deriveBridgeWallets,
  resolveLaunchDepositAddress,
  type LaunchRecord,
} from "@/lib/launch-admin";
import { operatorAdminFetch } from "@/lib/operator-admin-api";
import { BASE_RPC_URL } from "@/lib/bridge-contracts";
import { Contract, JsonRpcProvider } from "ethers";
import {
  fetchExchangeListings,
  formatListingTime,
  LEGACY_EXCHANGE_API,
  manualFulfillListing,
} from "@/lib/exchange-api";
import type { ExchangeListing } from "@/hooks/use-exchange-listings";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Copy,
  KeyRound,
  Loader2,
  LogOut,
  RefreshCcw,
  Shield,
  Smartphone,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useBridgeNotifications } from "@/hooks/use-bridge-notifications";
import {
  isStandalonePwa,
  notificationsSupported,
  requestNotificationPermission,
} from "@/lib/bridge-notifications";

function copyText(text: string) {
  void navigator.clipboard.writeText(text);
}

function LoginPanel({ onLogin }: { onLogin: (key: string) => Promise<unknown> }) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  return (
    <Card className="max-w-lg mx-auto border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" />
          Relayer Admin
        </CardTitle>
        <CardDescription>
          Operator portal — one unlock with your bridge relayer private key covers Bridge, Exchange,
          token launches, and Ember Delta token curation. Key stays in this browser only.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="relayer-key">Bridge relayer private key (Base)</Label>
          <Input
            id="relayer-key"
            type="password"
            placeholder="0x… or raw hex"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            autoComplete="off"
          />
        </div>
        <Button
          className="w-full"
          disabled={!key.trim() || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onLogin(key);
              toast({ title: "Authenticated as bridge relayer" });
            } catch (err) {
              toast({
                title: "Login failed",
                description: err instanceof Error ? err.message : String(err),
                variant: "destructive",
              });
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <KeyRound className="w-4 h-4 mr-2" />}
          Unlock admin
        </Button>
        <p className="text-xs text-muted-foreground flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Navigate to <code className="text-primary">/admin</code> — this page is not linked in the sidebar.
        </p>
      </CardContent>
    </Card>
  );
}

function BridgeAlertsPanel({
  enabled,
  onEnabledChange,
}: {
  enabled: boolean;
  onEnabledChange: (on: boolean) => void;
}) {
  const { toast } = useToast();
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">(
    notificationsSupported() ? Notification.permission : "unsupported",
  );

  async function enableAlerts(on: boolean) {
    if (!on) {
      onEnabledChange(false);
      return;
    }
    const p = await requestNotificationPermission();
    setPerm(p);
    if (p === "granted") {
      onEnabledChange(true);
      toast({ title: "Bridge alerts on", description: "You'll be notified when a new pending bridge appears." });
    } else if (p === "denied") {
      toast({
        title: "Notifications blocked",
        description: "Allow notifications in your browser or phone settings, then try again.",
        variant: "destructive",
      });
    }
  }

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Bell className="w-4 h-4 text-primary" />
          Bridge alerts
        </CardTitle>
        <CardDescription>
          Silent operator alerts only — bridge users are never notified. Polls on-chain every ~45s while admin is
          unlocked.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="bridge-notify" className="text-sm">Notify this device</Label>
          <Switch id="bridge-notify" checked={enabled} onCheckedChange={(v) => void enableAlerts(v)} />
        </div>

        {perm === "denied" && (
          <p className="text-xs text-amber-600">Notifications are blocked in browser settings.</p>
        )}

        <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground space-y-2">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <Smartphone className="w-3.5 h-3.5" />
            Add to Home Screen (recommended on phone)
          </div>
          <p>
            {isStandalonePwa()
              ? "Running as installed app — keep it open or in recents for alerts."
              : "Install this site as an app: browser menu → Add to Home Screen / Install app. Open /admin from the icon, unlock, and enable alerts above."}
          </p>
          <p className="text-[10px]">
            iOS/Android may limit background alerts unless the app is open. For email while away, set{" "}
            <code className="text-primary">ADMIN_ALERT_EMAIL</code> + <code className="text-primary">RESEND_API_KEY</code> on
            chain-node.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function BridgeTab({
  privateKey,
  notifyEnabled,
  setNotifyEnabled,
}: {
  privateKey: string;
  notifyEnabled: boolean;
  setNotifyEnabled: (on: boolean) => void;
}) {
  const [rows, setRows] = useState<PendingBridge[]>([]);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [txLookup, setTxLookup] = useState("");
  const { toast } = useToast();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const all = await fetchPendingBridges();
      setRows(all.filter((r) => !r.completed));
    } catch (err) {
      toast({
        title: "Scan failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const pending = rows.filter((r) => !r.completed);

  function removeRow(row: PendingBridge) {
    setRows((prev) =>
      prev.filter((r) => !(r.nonce === row.nonce && r.direction === row.direction)),
    );
  }

  async function complete(row: PendingBridge) {
    setActing(row.nonce + row.direction);
    try {
      const hash =
        row.direction === "embr_to_base"
          ? await completeEmbrToBase(privateKey, row)
          : await completeBaseToEmbr(privateKey, row);

      const destTxHash = hash !== "already_completed" ? hash : undefined;
      await markBridgeRelayedOnServer(row, destTxHash);
      removeRow(row);

      if (hash === "already_completed") {
        toast({ title: "Already completed", description: "Removed from admin queue." });
        return;
      }
      toast({ title: "Bridge completed", description: hash });
    } catch (err) {
      toast({
        title: "Completion failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setActing(null);
    }
  }

  async function lookupTx() {
    const hash = txLookup.trim();
    if (!hash) return;
    setLoading(true);
    try {
      let row: PendingBridge | null = await fetchEmbrLockByTxHash(hash);
      if (!row) row = await fetchBaseOutByTxHash(hash);
      if (!row || row.completed) {
        toast({
          title: row ? "Already completed" : "Not a bridge tx",
          description: row
            ? "This bridge has already been completed on the destination chain."
            : "Hash not found as an EMBR lock or Base bridgeOut transaction.",
          variant: "destructive",
        });
        return;
      }
      setRows((prev) =>
        prev.some((p) => p.nonce === row!.nonce && p.direction === row!.direction)
          ? prev
          : [row!, ...prev],
      );
      toast({
        title: "Bridge found",
        description:
          row.direction === "embr_to_base"
            ? `${formatEmbr(row.amount)} EMBR → ${row.baseRecipient}`
            : `${formatEmbr(row.amount)} wEMBR → ${row.embrRecipient}`,
      });
    } catch (err) {
      toast({
        title: "Lookup failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <BridgeAlertsPanel enabled={notifyEnabled} onEnabledChange={setNotifyEnabled} />

      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Ember Delta &amp; EmberSwap bridges</CardTitle>
          <CardDescription>
            Bridge attempts do not need Replit or a registration queue. When a user locks EMBR on Emberchain
            or calls <code>bridgeOut</code> on Base, the lock appears here after you click Refresh (on-chain
            scan). Paste a lock tx hash to look up a specific attempt. Complete with your relayer key below.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          EMBR locks are scanned via the chain REST API (Emberchain RPC does not implement{" "}
          <code>eth_getLogs</code>). Base → EMBR uses Base event logs.
        </p>
        <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
        </Button>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="Paste bridge tx hash — EMBR lock or Base bridgeOut (0x…)"
          value={txLookup}
          onChange={(e) => setTxLookup(e.target.value)}
        />
        <Button variant="outline" onClick={() => void lookupTx()} disabled={loading}>
          Lookup
        </Button>
      </div>

      <BridgeTable
        title="Pending bridges"
        empty="No incomplete bridge events found."
        rows={pending}
        acting={acting}
        onComplete={complete}
      />
    </div>
  );
}

function BridgeTable({
  title,
  empty,
  rows,
  acting,
  onComplete,
}: {
  title: string;
  empty: string;
  rows: PendingBridge[];
  acting: string | null;
  onComplete: (row: PendingBridge) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => (
              <div
                key={`${row.direction}-${row.nonce}-${row.txHash}`}
                className="rounded-lg border border-border/60 p-3 text-sm space-y-2"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={row.direction === "embr_to_base" ? "default" : "secondary"}>
                    {row.direction === "embr_to_base" ? "EMBR → Base" : "Base → EMBR"}
                  </Badge>
                  <Badge variant="destructive">pending</Badge>
                  <span className="text-muted-foreground">nonce {row.nonce}</span>
                </div>
                <div className="grid gap-1 font-mono text-xs break-all">
                  <div>submitted: {formatBridgeTime(row.submittedAt)}</div>
                  <div>amount: {formatEmbr(row.amount)} EMBR</div>
                  {row.direction === "embr_to_base" ? (
                    <div>→ Base: {row.baseRecipient}</div>
                  ) : (
                    <div>→ EMBR: {row.embrRecipient}</div>
                  )}
                  <div>lock tx: {row.txHash}</div>
                </div>
                <Button
                  size="sm"
                  onClick={() => void onComplete(row)}
                  disabled={acting === row.nonce + row.direction}
                >
                    {acting === row.nonce + row.direction ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                    )}
                    Complete bridge
                  </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LaunchTab({ privateKey }: { privateKey: string }) {
  const [queue, setQueue] = useState<{
    awaiting_escrow: LaunchRecord[];
    recent: LaunchRecord[];
    counts: { awaiting_escrow: number; live: number; failed: number; in_progress: number };
  } | null>(null);
  const [lookupId, setLookupId] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const wallets = useMemo(() => {
    try {
      return deriveBridgeWallets(privateKey);
    } catch {
      return null;
    }
  }, [privateKey]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await operatorAdminFetch(privateKey, "/api/token-launch/admin/queue");
      const data = await r.json() as typeof queue & { error?: string };
      if (!r.ok) throw new Error(data?.error ?? `HTTP ${r.status}`);
      setQueue(data);
    } catch (err) {
      toast({
        title: "Could not load launches",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [privateKey, toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function lookupLaunch() {
    if (!lookupId.trim()) return;
    setLoading(true);
    try {
      const base = (await import("@/lib/config")).resolveApiServer();
      const r = await fetch(`${base}/api/token-launch/${encodeURIComponent(lookupId.trim())}`);
      if (!r.ok) throw new Error("Launch not found");
      const row = await r.json() as LaunchRecord;
      setQueue((prev) => {
        const recent = prev?.recent ?? [];
        if (recent.some((p) => p.id === row.id)) return prev;
        return prev
          ? { ...prev, recent: [row, ...recent] }
          : { awaiting_escrow: [], recent: [row], counts: { awaiting_escrow: 0, live: 0, failed: 0, in_progress: 0 } };
      });
    } catch (err) {
      toast({
        title: "Lookup failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Token launch queue</CardTitle>
          <CardDescription>
            Authenticated with your relayer key — no separate admin secret or deposit key required.
            Escrow addresses for auto chains are derived server-side from{" "}
            <code className="text-primary">BRIDGE_UTXO_PRIVATE_KEY</code>.
          </CardDescription>
        </CardHeader>
        {queue && (
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 pb-4">
            <div className="rounded border border-amber-500/30 p-2 text-center">
              <div className="text-xl font-bold text-amber-600">{queue.counts.awaiting_escrow}</div>
              <div className="text-xs text-muted-foreground">Awaiting escrow</div>
            </div>
            <div className="rounded border p-2 text-center">
              <div className="text-xl font-bold text-green-600">{queue.counts.live}</div>
              <div className="text-xs text-muted-foreground">Live</div>
            </div>
            <div className="rounded border p-2 text-center">
              <div className="text-xl font-bold">{queue.counts.in_progress}</div>
              <div className="text-xs text-muted-foreground">In progress</div>
            </div>
            <div className="rounded border p-2 text-center">
              <div className="text-xl font-bold text-destructive">{queue.counts.failed}</div>
              <div className="text-xs text-muted-foreground">Failed</div>
            </div>
          </CardContent>
        )}
      </Card>

      <div className="flex gap-2">
        <Input placeholder="Launch UUID lookup" value={lookupId} onChange={(e) => setLookupId(e.target.value)} />
        <Button variant="outline" onClick={() => void lookupLaunch()} disabled={loading}>Lookup</Button>
        <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
        </Button>
      </div>

      {queue?.awaiting_escrow.map((launch) => (
        <LaunchAdminCard key={launch.id} launch={launch} privateKey={privateKey} wallets={wallets} onSaved={refresh} highlight />
      ))}

      {!loading && queue && queue.awaiting_escrow.length === 0 && (
        <p className="text-sm text-muted-foreground">No launches waiting for manual escrow.</p>
      )}

      {queue?.recent.slice(0, 30).map((launch) => (
        <LaunchAdminCard key={launch.id} launch={launch} privateKey={privateKey} wallets={wallets} onSaved={refresh} />
      ))}

      {!loading && !queue && (
        <p className="text-sm text-muted-foreground">No launches loaded — check api-server is running.</p>
      )}
    </div>
  );
}

interface FeaturedTokenRow {
  tokenAddress: string;
  symbol: string;
  name: string;
  source?: string;
  canRemove?: boolean;
}

function TokensTab({ privateKey }: { privateKey: string }) {
  const [tokens, setTokens] = useState<FeaturedTokenRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [newAddr, setNewAddr] = useState("");
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await operatorAdminFetch(privateKey, "/api/token-launch/admin/markets");
      const data = await r.json() as { markets?: FeaturedTokenRow[]; error?: string };
      if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`);
      setTokens(data.markets ?? []);
    } catch (err) {
      toast({
        title: "Could not load tokens",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [privateKey, toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function addToken() {
    const addr = newAddr.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) {
      toast({ title: "Invalid address", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const provider = new JsonRpcProvider(BASE_RPC_URL);
      const erc20 = new Contract(addr, [
        "function symbol() view returns (string)",
        "function name() view returns (string)",
      ], provider);
      const [symbol, name] = await Promise.all([
        erc20.symbol() as Promise<string>,
        erc20.name().catch(() => addr) as Promise<string>,
      ]);
      const r = await operatorAdminFetch(privateKey, "/api/dex/admin/tokens", {
        method: "POST",
        body: JSON.stringify({ address: addr, symbol, name, is_official: true }),
      });
      const data = await r.json() as { error?: string };
      if (!r.ok) throw new Error(data.error ?? "Save failed");
      toast({ title: `Added ${symbol} to Ember Delta markets` });
      setNewAddr("");
      await refresh();
    } catch (err) {
      toast({
        title: "Add failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  async function removeToken(address: string) {
    setBusy(true);
    try {
      const r = await operatorAdminFetch(privateKey, "/api/token-launch/admin/markets/delist", {
        method: "POST",
        body: JSON.stringify({ address, reason: "Removed via operator admin" }),
      });
      const data = await r.json() as { error?: string };
      if (!r.ok) throw new Error(data.error ?? "Remove failed");
      toast({ title: "Token removed from exchange" });
      await refresh();
    } catch (err) {
      toast({
        title: "Remove failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Ember Delta exchange markets</CardTitle>
          <CardDescription>
            All tokens shown on Ember Delta. Remove delists globally and marks launches as delisted.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Input
            placeholder="0x… ERC-20 on Base"
            value={newAddr}
            onChange={(e) => setNewAddr(e.target.value)}
            className="font-mono text-xs"
          />
          <Button onClick={() => void addToken()} disabled={busy || !newAddr.trim()}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add token"}
          </Button>
          <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
          </Button>
        </CardContent>
      </Card>

      {tokens.length === 0 ? (
        <p className="text-sm text-muted-foreground">No featured tokens yet (wEMBR is always built-in).</p>
      ) : (
        tokens.map((t) => (
          <Card key={t.tokenAddress}>
            <CardContent className="py-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-semibold">{t.symbol}</div>
                <div className="text-xs text-muted-foreground">{t.name} · {t.source ?? "market"}</div>
                <div className="font-mono text-xs break-all">{t.tokenAddress}</div>
              </div>
              <Button
                variant="destructive"
                size="sm"
                disabled={busy || t.canRemove === false}
                onClick={() => void removeToken(t.tokenAddress)}
              >
                Remove
              </Button>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

function LaunchAdminCard({
  launch,
  privateKey,
  wallets,
  onSaved,
  highlight,
}: {
  launch: LaunchRecord & {
    wallet_download_url?: string;
    admin_notes?: string;
    decimals?: number;
    escrow_mode?: string;
  };
  privateKey: string;
  wallets: ReturnType<typeof deriveBridgeWallets> | null;
  onSaved: () => void;
  highlight?: boolean;
}) {
  const [escrowAddr, setEscrowAddr] = useState(launch.bridge_wallet_address ?? "");
  const [notes, setNotes] = useState(launch.admin_notes ?? "");
  const [nativeTx, setNativeTx] = useState("");
  const [recipient, setRecipient] = useState(launch.submitter_address ?? "");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const derived = wallets ? resolveLaunchDepositAddress(wallets, launch) : undefined;
  const matches =
    derived &&
    launch.bridge_wallet_address &&
    derived.toLowerCase() === launch.bridge_wallet_address.toLowerCase();

  async function saveEscrow() {
    if (!escrowAddr.trim()) return;
    setBusy(true);
    try {
      const r = await operatorAdminFetch(privateKey, `/api/token-launch/admin/${launch.id}/escrow`, {
        method: "PATCH",
        body: JSON.stringify({ bridge_wallet_address: escrowAddr.trim(), admin_notes: notes.trim() || undefined, mark_live: true }),
      });
      const data = await r.json() as { error?: string };
      if (!r.ok) throw new Error(data.error ?? "Save failed");
      toast({ title: "Escrow saved — launch is live" });
      onSaved();
    } catch (err) {
      toast({ title: "Save failed", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function manualClaim() {
    if (!nativeTx.trim() || !recipient.trim() || !amount.trim()) {
      toast({ title: "Tx id, recipient, and amount required", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const r = await operatorAdminFetch(privateKey, `/api/token-launch/admin/${launch.id}/claim`, {
        method: "POST",
        body: JSON.stringify({
          native_tx_hash: nativeTx.trim(),
          base_recipient: recipient.trim(),
          amount: amount.trim(),
        }),
      });
      const data = await r.json() as { error?: string; bridgeInTxHash?: string };
      if (!r.ok) throw new Error(data.error ?? "Claim failed");
      toast({ title: "Minted", description: data.bridgeInTxHash?.slice(0, 18) });
      setNativeTx("");
      setAmount("");
      onSaved();
    } catch (err) {
      toast({ title: "Claim failed", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className={highlight ? "border-amber-500/40" : undefined}>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">{launch.symbol} → {launch.wrapped_symbol ?? `w${launch.symbol}`}</CardTitle>
          <Badge variant="outline">{launch.status}</Badge>
          {launch.chain_name && <Badge variant="secondary">{launch.chain_name}</Badge>}
        </div>
      </CardHeader>
      <CardContent className="text-sm space-y-3 font-mono text-xs break-all">
        <div>id: {launch.id}</div>
        {launch.wallet_download_url && (
          <div className="font-sans">
            Wallet:{" "}
            <a href={launch.wallet_download_url} target="_blank" rel="noreferrer" className="text-primary underline">
              {launch.wallet_download_url}
            </a>
          </div>
        )}
        {launch.bridge_wallet_address && <div>Escrow: {launch.bridge_wallet_address}</div>}
        {derived && (
          <div className={matches ? "text-green-600" : "text-amber-600"}>
            Derived (relayer key): {derived} {matches ? "✓" : "(may differ if UTXO key ≠ relayer on server)"}
          </div>
        )}
        {launch.wrapped_token_address && <div>wToken: {launch.wrapped_token_address}</div>}
        {launch.error_msg && <div className="text-destructive">{launch.error_msg}</div>}

        {launch.status === "awaiting_escrow" && (
          <div className="space-y-2 pt-2 border-t font-sans">
            <Label>Escrow deposit address</Label>
            <Input value={escrowAddr} onChange={(e) => setEscrowAddr(e.target.value)} className="font-mono" />
            <Input placeholder="Operator notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            <Button size="sm" disabled={busy} onClick={() => void saveEscrow()}>
              Save escrow &amp; mark live
            </Button>
          </div>
        )}

        {launch.status === "live" && launch.bridge_wallet_address && (
          <div className="space-y-2 pt-2 border-t font-sans">
            <p className="text-xs text-muted-foreground">Manual bridge mint (Monero / custom / failed auto-claim)</p>
            <Input placeholder="Native tx id" value={nativeTx} onChange={(e) => setNativeTx(e.target.value)} />
            <Input placeholder="Base recipient 0x…" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
            <Input placeholder={`Amount in ${launch.symbol}`} value={amount} onChange={(e) => setAmount(e.target.value)} />
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => void manualClaim()}>
              Mint wrapped tokens
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ExchangeTab() {
  const [listings, setListings] = useState<ExchangeListing[]>([]);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [listingId, setListingId] = useState("");
  const [buyerAddress, setBuyerAddress] = useState("");
  const [paymentTxHash, setPaymentTxHash] = useState("");
  const [selectedNetwork, setSelectedNetwork] = useState("");
  const { toast } = useToast();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchExchangeListings("open");
      setListings(rows);
    } catch (err) {
      toast({
        title: "Could not load listings",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function fulfill(listing: ExchangeListing) {
    if (!buyerAddress.trim() || !paymentTxHash.trim()) {
      toast({ title: "Buyer address and payment tx hash are required", variant: "destructive" });
      return;
    }
    setActing(listing.id);
    try {
      await manualFulfillListing({
        listingId: listing.id,
        buyerAddress: buyerAddress.trim(),
        paymentTxHash: paymentTxHash.trim(),
        selectedNetwork: selectedNetwork.trim() || undefined,
      });
      toast({ title: "Listing fulfilled", description: "EMBR credited to buyer on the exchange chain-node." });
      setListingId("");
      setBuyerAddress("");
      setPaymentTxHash("");
      setSelectedNetwork("");
      await refresh();
    } catch (err) {
      toast({
        title: "Fulfillment failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setActing(null);
    }
  }

  const open = listings.filter((l) => l.status === "open");

  return (
    <div className="space-y-4">
      <Card className="border-primary/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Exchange escrow (manual approval)</CardTitle>
          <CardDescription>
            There is no EMBR escrow wallet or private key. When sellers list, EMBR is debited into the
            chain-node&apos;s internal exchange ledger on{" "}
            <code className="text-primary">{LEGACY_EXCHANGE_API}</code>. Buyers pay the seller&apos;s external
            receive address (ETH / USDT / BTC / SOL). After you verify payment on-chain, submit the tx hash
            below — the api-server calls the chain-node to credit the buyer&apos;s EMBR address.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Manual fulfill</CardTitle>
          <CardDescription>
            Verify the external payment first, then release escrowed EMBR to the buyer.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="ex-listing-id">Listing ID (optional — pick from table below)</Label>
            <Input
              id="ex-listing-id"
              value={listingId}
              onChange={(e) => setListingId(e.target.value)}
              placeholder="0x…"
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ex-buyer">Buyer EMBR address</Label>
            <Input
              id="ex-buyer"
              value={buyerAddress}
              onChange={(e) => setBuyerAddress(e.target.value)}
              placeholder="0x…"
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ex-tx">External payment tx hash</Label>
            <Input
              id="ex-tx"
              value={paymentTxHash}
              onChange={(e) => setPaymentTxHash(e.target.value)}
              placeholder="0x… or Solana signature"
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="ex-net">Payment network (optional)</Label>
            <Input
              id="ex-net"
              value={selectedNetwork}
              onChange={(e) => setSelectedNetwork(e.target.value)}
              placeholder="Ethereum, Base, Arbitrum, ERC-20, BEP-20, Polygon, TRC-20…"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{open.length} open listing(s)</p>
        <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
        </Button>
      </div>

      {open.length === 0 ? (
        <p className="text-sm text-muted-foreground">No open listings. Bundled snapshot may still show on the Exchange page.</p>
      ) : (
        open.map((listing) => (
          <Card key={listing.id}>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base font-mono text-xs break-all">{listing.id}</CardTitle>
                <Badge variant="outline">{listing.currency}</Badge>
                <Badge variant="secondary">{listing.status}</Badge>
              </div>
              <CardDescription>
                {formatEmbr(listing.amountEmbr)} EMBR for {listing.priceAmount} {listing.currency} · listed{" "}
                {formatListingTime(listing.createdAt)}
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <div className="font-mono text-xs break-all">Seller: {listing.sellerAddress}</div>
              <div className="font-mono text-xs break-all">Receive: {listing.receiveAddress}</div>
              {listing.reservedBy && (
                <div className="text-amber-600 text-xs">Reserved by {listing.reservedBy}</div>
              )}
              <Button
                size="sm"
                disabled={acting === listing.id || (!buyerAddress.trim() || !paymentTxHash.trim())}
                onClick={() => {
                  setListingId(listing.id);
                  void fulfill(listing);
                }}
              >
                {acting === listing.id ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                )}
                Fulfill &amp; release EMBR
              </Button>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

export default function AdminPage() {
  const { session, isLoaded, login, logout } = useRelayerAuth();
  const { enabled: notifyEnabled, setEnabled: setNotifyEnabled } = useBridgeNotifications(!!session);

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Shell requireWallet={false}>
      {!session ? (
        <LoginPanel onLogin={login} />
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Operator Admin</h1>
              <p className="text-sm text-muted-foreground font-mono">{session.address}</p>
            </div>
            <Button variant="outline" size="sm" onClick={logout}>
              <LogOut className="w-4 h-4 mr-2" />
              Lock
            </Button>
          </div>

          <Tabs defaultValue="bridge">
            <TabsList>
              <TabsTrigger value="bridge">Bridge</TabsTrigger>
              <TabsTrigger value="exchange">Exchange</TabsTrigger>
              <TabsTrigger value="launches">Token launches</TabsTrigger>
              <TabsTrigger value="tokens">Tokens</TabsTrigger>
            </TabsList>
            <TabsContent value="bridge" className="mt-4">
              <BridgeTab
                privateKey={session.privateKey}
                notifyEnabled={notifyEnabled}
                setNotifyEnabled={setNotifyEnabled}
              />
            </TabsContent>
            <TabsContent value="exchange" className="mt-4">
              <ExchangeTab />
            </TabsContent>
            <TabsContent value="launches" className="mt-4">
              <LaunchTab privateKey={session.privateKey} />
            </TabsContent>
            <TabsContent value="tokens" className="mt-4">
              <TokensTab privateKey={session.privateKey} />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </Shell>
  );
}
