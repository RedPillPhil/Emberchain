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
  fetchEmbrLockByTxHash,
  fetchPendingBridges,
  formatBridgeTime,
  formatEmbr,
  type PendingBridge,
} from "@/lib/bridge-admin";
import { isBridgeLegComplete } from "@/lib/bridge-read";
import {
  deriveBridgeWallets,
  fetchLaunchById,
  fetchLaunchListings,
  maskPrivateKey,
  resolveLaunchDepositAddress,
  type LaunchRecord,
} from "@/lib/launch-admin";
import {
  fetchExchangeListings,
  formatListingTime,
  LEGACY_EXCHANGE_API,
  manualFulfillListing,
} from "@/lib/exchange-api";
import type { ExchangeListing } from "@/hooks/use-exchange-listings";
import { resolveApiServer } from "@/lib/config";
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
          Temporary operator portal. Your private key stays in this browser session only — it is never
          sent to a backend.
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
      if (await isBridgeLegComplete(row.direction, row.nonce)) {
        removeRow(row);
        toast({
          title: "Already completed",
          description: "This bridge was already relayed on the destination chain.",
        });
        return;
      }

      const hash =
        row.direction === "embr_to_base"
          ? await completeEmbrToBase(privateKey, row)
          : await completeBaseToEmbr(privateKey, row);

      removeRow(row);
      if (hash === "already_completed") {
        toast({
          title: "Already completed",
          description: "This bridge was already relayed — removed from the pending list.",
        });
      } else {
        toast({ title: "Bridge completed", description: hash });
      }
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
      const row = await fetchEmbrLockByTxHash(hash);
      if (!row || row.completed) {
        toast({
          title: row ? "Already completed" : "Not a lockEMBR tx",
          description: row
            ? "This bridge has already been completed on the destination chain."
            : "Hash not found or not a successful bridge lock.",
          variant: "destructive",
        });
        return;
      }
      setRows((prev) => (prev.some((p) => p.txHash === row.txHash) ? prev : [row, ...prev]));
      toast({ title: "Lock found", description: `${formatEmbr(row.amount)} EMBR → ${row.baseRecipient}` });
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
          placeholder="Paste EMBR lock tx hash (0x…)"
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

function LaunchTab({ defaultDepositKey }: { defaultDepositKey: string }) {
  const [depositKey, setDepositKey] = useState(defaultDepositKey);
  const [launches, setLaunches] = useState<LaunchRecord[]>([]);
  const [lookupId, setLookupId] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const apiUrl = resolveApiServer();

  const wallets = useMemo(() => {
    try {
      return deriveBridgeWallets(depositKey);
    } catch {
      return null;
    }
  }, [depositKey]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setLaunches(await fetchLaunchListings());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setDepositKey(defaultDepositKey);
  }, [defaultDepositKey]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function lookupLaunch() {
    if (!lookupId.trim()) return;
    setLoading(true);
    try {
      const row = await fetchLaunchById(lookupId.trim());
      if (!row) {
        toast({ title: "Launch not found", variant: "destructive" });
        return;
      }
      setLaunches((prev) => (prev.some((p) => p.id === row.id) ? prev : [row, ...prev]));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Deposit key (BRIDGE_UTXO_PRIVATE_KEY)</CardTitle>
          <CardDescription>
            Launch portal addresses are derived from this key on the server — usually the same secp256k1
            secret as the relayer, but paste the UTXO key here if yours differ.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            type="password"
            value={depositKey}
            onChange={(e) => setDepositKey(e.target.value)}
            placeholder="32-byte hex (no 0x required)"
            autoComplete="off"
          />
          {wallets && (
            <div className="rounded-md bg-muted/40 p-3 text-xs font-mono space-y-3">
              <div className="font-sans text-muted-foreground text-xs leading-relaxed">
                One deposit address per chain style (derived from BRIDGE_UTXO_PRIVATE_KEY). Users only see
                the public address during launch; the private key stays on the server and is shown here for
                the operator.
              </div>
              <div className="flex items-center justify-between gap-2">
                <span>
                  Private key: {maskPrivateKey(depositKey)}
                </span>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyText(depositKey)}>
                  <Copy className="w-3 h-3" />
                </Button>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span>EVM (Base fee + smart-contract bridges): {wallets.evm}</span>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyText(wallets.evm)}>
                  <Copy className="w-3 h-3" />
                </Button>
              </div>
              {Object.entries(wallets.utxo).map(([net, addr]) => (
                <div key={net}>UTXO P2PKH ({net}): {addr}</div>
              ))}
              {Object.entries(wallets.bech32).map(([net, addr]) => (
                <div key={net}>UTXO SegWit ({net}): {addr}</div>
              ))}
              <p className="text-muted-foreground font-sans">{wallets.note}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {!apiUrl && (
        <p className="text-sm text-amber-600 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          Set <code>VITE_API_URL</code> to load launches from Postgres. You can still derive deposit
          addresses locally with the key above.
        </p>
      )}

      <div className="flex gap-2">
        <Input placeholder="Launch UUID lookup" value={lookupId} onChange={(e) => setLookupId(e.target.value)} />
        <Button variant="outline" onClick={() => void lookupLaunch()} disabled={loading}>
          Lookup
        </Button>
        <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
        </Button>
      </div>

      {launches.length === 0 ? (
        <p className="text-sm text-muted-foreground">No launches loaded.</p>
      ) : (
        launches.map((launch) => {
          const derived = wallets ? resolveLaunchDepositAddress(wallets, launch) : undefined;
          const matches =
            derived &&
            launch.bridge_wallet_address &&
            derived.toLowerCase() === launch.bridge_wallet_address.toLowerCase();
          return (
            <Card key={launch.id}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-base">{launch.symbol ?? launch.token_name ?? launch.id}</CardTitle>
                  <Badge variant="outline">{launch.status}</Badge>
                  {launch.chain_name && <Badge variant="secondary">{launch.chain_name}</Badge>}
                </div>
              </CardHeader>
              <CardContent className="text-sm space-y-2 font-mono text-xs break-all">
                <div>id: {launch.id}</div>
                {launch.bridge_wallet_address && <div>DB deposit: {launch.bridge_wallet_address}</div>}
                {derived && (
                  <div className={matches ? "text-green-600" : "text-amber-600"}>
                    Derived deposit: {derived} {matches ? "✓" : "(mismatch — check UTXO key)"}
                  </div>
                )}
                {depositKey && (
                  <div className="text-muted-foreground font-sans">
                    Private key (session): {maskPrivateKey(depositKey)}
                  </div>
                )}
                {launch.wrapped_token_address && <div>wToken: {launch.wrapped_token_address}</div>}
                {launch.error_msg && <div className="text-destructive">{launch.error_msg}</div>}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
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
            <Label htmlFor="ex-net">USDT network (optional)</Label>
            <Input
              id="ex-net"
              value={selectedNetwork}
              onChange={(e) => setSelectedNetwork(e.target.value)}
              placeholder="ERC-20, BEP-20, Polygon, TRC-20…"
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
              <LaunchTab defaultDepositKey={session.privateKey} />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </Shell>
  );
}
