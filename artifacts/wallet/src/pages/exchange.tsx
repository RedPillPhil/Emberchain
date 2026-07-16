import React, { useState, useEffect, useRef } from "react";
import { Shell } from "@/components/layout/shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useActiveWallet } from "@/hooks/use-active-wallet";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListExchangeListings,
  useCreateListing,
  useCancelListing,
  useBuyListing,
  getListExchangeListingsQueryKey,
} from "@workspace/api-client-react";
import type { ExchangeListing, ExchangeCurrency } from "@workspace/api-client-react";
import {
  Store,
  Plus,
  List,
  ChevronDown,
  ChevronUp,
  Copy,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Loader2,
  TrendingUp,
  Info,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

// ── helpers ───────────────────────────────────────────────────────────────────

const CURRENCY_COLORS: Record<ExchangeCurrency, string> = {
  ETH:  "bg-indigo-500/20 text-indigo-400 border-indigo-500/40",
  USDT: "bg-green-500/20 text-green-400 border-green-500/40",
  BTC:  "bg-orange-500/20 text-orange-400 border-orange-500/40",
  SOL:  "bg-purple-500/20 text-purple-400 border-purple-500/40",
};

const CURRENCY_DECIMALS: Record<ExchangeCurrency, number> = {
  ETH: 18, USDT: 6, BTC: 8, SOL: 9,
};

const CURRENCY_SYMBOLS: Record<ExchangeCurrency, string> = {
  ETH: "Ξ", USDT: "$", BTC: "₿", SOL: "◎",
};

const CONFIRMATION_LABELS: Record<ExchangeCurrency, string> = {
  ETH:  "12 confirmations (~3 min)",
  USDT: "12 confirmations (~3 min)",
  BTC:  "2 confirmations (~20 min)",
  SOL:  "Finalized (~30 s)",
};

const EXPLORER_LINKS: Record<ExchangeCurrency, (hash: string) => string> = {
  ETH:  (h) => `https://etherscan.io/tx/${h}`,
  USDT: (h) => `https://etherscan.io/tx/${h}`,
  BTC:  (h) => `https://blockstream.info/tx/${h}`,
  SOL:  (h) => `https://solscan.io/tx/${h}`,
};

function formatEmbr(wei: string): string {
  try {
    const n = BigInt(wei);
    const eth = Number(n) / 1e18;
    return eth.toLocaleString("en-US", { maximumFractionDigits: 4 }) + " EMBR";
  } catch {
    return wei + " wei";
  }
}

function truncate(s: string, front = 8, back = 6): string {
  if (s.length <= front + back + 3) return s;
  return s.slice(0, front) + "…" + s.slice(-back);
}

function StatusBadge({ status }: { status: ExchangeListing["status"] }) {
  if (status === "open")      return <Badge className="bg-primary/20 text-primary border-primary/40 uppercase text-xs">Open</Badge>;
  if (status === "fulfilled") return <Badge className="bg-green-500/20 text-green-400 border-green-500/40 uppercase text-xs">Fulfilled</Badge>;
  return <Badge className="bg-secondary text-muted-foreground border-border uppercase text-xs">Cancelled</Badge>;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="ml-1 text-muted-foreground hover:text-primary transition-colors"
      title="Copy"
    >
      {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

// ── trade history + avg price ─────────────────────────────────────────────────

function TradeHistoryTab() {
  const { data: fulfilled = [], isLoading } = useListExchangeListings({ status: "fulfilled" });

  // Average EMBR price per currency from fulfilled trades
  const avgPrices = React.useMemo(() => {
    const byCurrency: Record<string, { totalPrice: number; totalEmbr: number; count: number }> = {};
    for (const l of fulfilled) {
      const embr = Number(BigInt(l.amountEmbr)) / 1e18;
      const price = parseFloat(l.priceAmount);
      if (!isFinite(embr) || !isFinite(price) || embr === 0) continue;
      if (!byCurrency[l.currency]) byCurrency[l.currency] = { totalPrice: 0, totalEmbr: 0, count: 0 };
      byCurrency[l.currency]!.totalPrice += price;
      byCurrency[l.currency]!.totalEmbr += embr;
      byCurrency[l.currency]!.count += 1;
    }
    return Object.entries(byCurrency).map(([currency, { totalPrice, totalEmbr, count }]) => ({
      currency: currency as ExchangeCurrency,
      avgPerEmbr: totalPrice / totalEmbr,
      count,
    }));
  }, [fulfilled]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading history…
      </div>
    );
  }

  if (!fulfilled.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
        <CheckCircle2 className="w-12 h-12 text-muted-foreground/40" />
        <p className="text-muted-foreground font-bold uppercase">No completed trades yet</p>
        <p className="text-sm text-muted-foreground">Fulfilled listings will appear here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Average price summary */}
      {avgPrices.length > 0 && (
        <div>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Average Price (from completed trades)</p>
          <div className="flex flex-wrap gap-3">
            {avgPrices.map(({ currency, avgPerEmbr, count }) => (
              <div key={currency} className={`border rounded-sm px-4 py-3 ${CURRENCY_COLORS[currency]}`}>
                <div className="text-xs font-bold uppercase mb-1">{currency}</div>
                <div className="font-mono font-bold text-lg">
                  {CURRENCY_SYMBOLS[currency]}{avgPerEmbr.toFixed(6)}
                  <span className="text-xs font-normal ml-1">/ EMBR</span>
                </div>
                <div className="text-xs opacity-70 mt-0.5">{count} trade{count !== 1 ? "s" : ""}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Trade list */}
      <div>
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Completed Trades</p>
        <div className="space-y-2">
          {fulfilled.map((listing) => (
            <div key={listing.id} className="border border-border rounded-sm bg-secondary/30 px-4 py-3">
              <div className="flex items-center gap-3 flex-wrap">
                <Badge className={`text-xs uppercase border ${CURRENCY_COLORS[listing.currency]} font-bold w-14 justify-center shrink-0`}>
                  {listing.currency}
                </Badge>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-foreground">{formatEmbr(listing.amountEmbr)}</div>
                  <div className="text-xs text-muted-foreground">
                    for {CURRENCY_SYMBOLS[listing.currency]}{listing.priceAmount} {listing.currency}
                  </div>
                </div>
                <div className="text-right text-xs text-muted-foreground shrink-0">
                  <div className="font-mono">
                    {(() => {
                      const embr = Number(BigInt(listing.amountEmbr)) / 1e18;
                      const price = parseFloat(listing.priceAmount);
                      return embr > 0 ? `${CURRENCY_SYMBOLS[listing.currency]}${(price / embr).toFixed(6)}/EMBR` : null;
                    })()}
                  </div>
                  <div className="text-muted-foreground/60 mt-0.5">
                    {new Date(listing.updatedAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
              <div className="mt-2 pt-2 border-t border-border/50 flex gap-4 text-xs text-muted-foreground flex-wrap">
                <span>Seller: <code className="font-mono">{truncate(listing.sellerAddress)}</code></span>
                {listing.buyerAddress && (
                  <span>Buyer: <code className="font-mono">{truncate(listing.buyerAddress)}</code></span>
                )}
                {listing.paymentTxHash && (
                  <a
                    href={EXPLORER_LINKS[listing.currency](listing.paymentTxHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    View payment ↗
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── tabs ──────────────────────────────────────────────────────────────────────

type Tab = "marketplace" | "create" | "mine" | "history" | "price";

// ── buy panel (inline per listing) ───────────────────────────────────────────

function BuyPanel({
  listing,
  onClose,
}: {
  listing: ExchangeListing;
  onClose: () => void;
}) {
  const { activeWallet } = useActiveWallet();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [buyerAddress, setBuyerAddress] = useState(activeWallet?.address ?? "");
  const [paymentTxHash, setPaymentTxHash] = useState("");

  const buy = useBuyListing({
    mutation: {
      onSuccess: () => {
        toast({ title: "Payment verified!", description: "EMBR has been credited to your wallet." });
        qc.invalidateQueries({ queryKey: getListExchangeListingsQueryKey() });
        onClose();
      },
      onError: (err: unknown) => {
        // ApiError from custom-fetch carries the parsed response body in `.data`.
        const data = (err as { data?: { code?: string; originalListingId?: string; currency?: string; error?: string } })?.data;

        if (data?.code === "DUPLICATE_PROOF") {
          const detail = data.originalListingId
            ? `This ${data.currency ?? ""} transaction was already used to fulfill listing ${data.originalListingId}. Each payment transaction can only be used once.`.trim()
            : "This transaction was already used to fulfill a different listing. Each payment transaction can only be used once.";
          toast({
            variant: "destructive",
            title: "Transaction already used",
            description: detail,
          });
        } else {
          const msg = (err as { message?: string })?.message ?? "Verification failed";
          toast({ variant: "destructive", title: "Verification failed", description: msg });
        }
      },
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!buyerAddress.trim() || !paymentTxHash.trim()) return;
    buy.mutate({ id: listing.id, data: { buyerAddress: buyerAddress.trim(), paymentTxHash: paymentTxHash.trim() } });
  };

  return (
    <div className="mt-3 p-4 rounded-sm border border-primary/30 bg-primary/5">
      <h4 className="text-sm font-bold text-primary uppercase mb-3 flex items-center gap-2">
        <Store className="w-4 h-4" /> Buy this listing
      </h4>

      {/* payment instructions */}
      <div className="mb-4 p-3 bg-secondary/60 border border-border rounded-sm text-sm space-y-1">
        <p className="text-muted-foreground font-bold uppercase text-xs mb-2">Step 1 — Send payment externally</p>
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">Amount:</span>
          <span className="font-bold text-foreground ml-1">{CURRENCY_SYMBOLS[listing.currency]}{listing.priceAmount} {listing.currency}</span>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-muted-foreground">To address:</span>
          <code className="font-mono text-xs text-foreground bg-background/60 px-1 py-0.5 rounded">{listing.receiveAddress}</code>
          <CopyButton text={listing.receiveAddress} />
        </div>
        <p className="text-muted-foreground text-xs mt-1">
          Wait for {CONFIRMATION_LABELS[listing.currency]} before submitting.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <p className="text-muted-foreground font-bold uppercase text-xs">Step 2 — Submit proof</p>

        <div className="space-y-1">
          <Label className="text-xs uppercase text-muted-foreground">Your EMBR wallet address</Label>
          <Input
            value={buyerAddress}
            onChange={(e) => setBuyerAddress(e.target.value)}
            placeholder="0x..."
            className="font-mono text-sm"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs uppercase text-muted-foreground">Payment transaction hash</Label>
          <Input
            value={paymentTxHash}
            onChange={(e) => setPaymentTxHash(e.target.value)}
            placeholder="Transaction hash on the external chain..."
            className="font-mono text-sm"
          />
          {paymentTxHash && (
            <a
              href={EXPLORER_LINKS[listing.currency](paymentTxHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline"
            >
              View on explorer ↗
            </a>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            type="submit"
            disabled={buy.isPending || !buyerAddress.trim() || !paymentTxHash.trim()}
            className="flex-1"
          >
            {buy.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-2" />Verifying…</>
            ) : (
              "Verify & Claim EMBR"
            )}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>

        {buy.isPending && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Checking the external blockchain — this may take up to 20 seconds…
          </p>
        )}
      </form>
    </div>
  );
}

// ── marketplace tab ───────────────────────────────────────────────────────────

function MarketplaceTab() {
  const { data: listings = [], isLoading } = useListExchangeListings({ status: "open" });
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading listings…
      </div>
    );
  }

  if (!listings.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
        <Store className="w-12 h-12 text-muted-foreground/40" />
        <p className="text-muted-foreground font-bold uppercase">No open listings yet</p>
        <p className="text-sm text-muted-foreground">Be the first to list EMBR for sale.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {listings.map((listing: ExchangeListing) => {
        const open = expandedId === listing.id;
        return (
          <div key={listing.id} className="border border-border rounded-sm bg-secondary/30">
            <div className="flex items-center gap-3 px-4 py-3">
              {/* currency */}
              <Badge className={`text-xs uppercase border ${CURRENCY_COLORS[listing.currency]} font-bold w-14 justify-center`}>
                {listing.currency}
              </Badge>

              {/* embr amount */}
              <div className="flex-1 min-w-0">
                <div className="font-bold text-foreground">{formatEmbr(listing.amountEmbr)}</div>
                <div className="text-xs text-muted-foreground font-mono">{truncate(listing.sellerAddress)}</div>
              </div>

              {/* price */}
              <div className="text-right mr-2">
                <div className="font-bold text-foreground">
                  {CURRENCY_SYMBOLS[listing.currency]}{listing.priceAmount} {listing.currency}
                </div>
                <div className="text-xs text-muted-foreground">asking price</div>
              </div>

              {/* buy button */}
              <Button
                size="sm"
                onClick={() => setExpandedId(open ? null : listing.id)}
                className="shrink-0 gap-1"
              >
                {open ? (
                  <><ChevronUp className="w-4 h-4" /> Close</>
                ) : (
                  <><ChevronDown className="w-4 h-4" /> Buy</>
                )}
              </Button>
            </div>

            {open && (
              <div className="px-4 pb-4">
                <BuyPanel listing={listing} onClose={() => setExpandedId(null)} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── create listing tab ────────────────────────────────────────────────────────

const CURRENCIES: ExchangeCurrency[] = ["ETH", "USDT", "BTC", "SOL"];

function CreateListingTab() {
  const { activeWallet } = useActiveWallet();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [amountEmbr, setAmountEmbr] = useState("");
  const [currency, setCurrency] = useState<ExchangeCurrency>("ETH");
  const [priceAmount, setPriceAmount] = useState("");
  const [receiveAddress, setReceiveAddress] = useState("");

  const create = useCreateListing({
    mutation: {
      onSuccess: () => {
        toast({ title: "Listing created!", description: "Your EMBR is now locked in escrow and visible in the marketplace." });
        qc.invalidateQueries({ queryKey: getListExchangeListingsQueryKey() });
        setAmountEmbr(""); setPriceAmount(""); setReceiveAddress("");
      },
      onError: (err: unknown) => {
        const msg = (err as { message?: string })?.message ?? "Failed to create listing";
        toast({ variant: "destructive", title: "Error", description: msg });
      },
    },
  });

  if (!activeWallet) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <AlertTriangle className="w-10 h-10 text-muted-foreground/40" />
        <p className="text-muted-foreground font-bold uppercase">Wallet required</p>
        <p className="text-sm text-muted-foreground">Connect a wallet to create a listing.</p>
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amountWei = (() => {
      try {
        const n = parseFloat(amountEmbr);
        if (!isFinite(n) || n <= 0) throw new Error();
        return BigInt(Math.floor(n * 1e18)).toString();
      } catch {
        toast({ variant: "destructive", title: "Invalid amount", description: "Enter a valid EMBR amount." });
        return null;
      }
    })();
    if (!amountWei) return;

    create.mutate({
      data: {
        sellerPrivateKey: activeWallet.privateKey,
        amountEmbr: amountWei,
        currency,
        priceAmount: priceAmount.trim(),
        receiveAddress: receiveAddress.trim(),
      },
    });
  };

  const CURRENCY_PLACEHOLDERS: Record<ExchangeCurrency, string> = {
    ETH:  "0x... (Ethereum address)",
    USDT: "0x... (Ethereum address)",
    BTC:  "bc1... (Bitcoin address)",
    SOL:  "... (Solana public key)",
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-lg space-y-5">
      <div className="p-3 bg-secondary/60 border border-border rounded-sm text-sm text-muted-foreground flex gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <span>
          The EMBR amount is <strong className="text-foreground">locked immediately</strong> when you create a listing.
          You can cancel any open listing to get it back.
        </span>
      </div>

      <div className="space-y-1">
        <Label className="text-xs uppercase text-muted-foreground">EMBR amount to sell</Label>
        <Input
          value={amountEmbr}
          onChange={(e) => setAmountEmbr(e.target.value)}
          placeholder="e.g. 10"
          type="number"
          min="0"
          step="any"
          required
        />
        <p className="text-xs text-muted-foreground">
          Seller wallet: <code className="font-mono">{truncate(activeWallet.address)}</code>
        </p>
      </div>

      <div className="space-y-1">
        <Label className="text-xs uppercase text-muted-foreground">Asking currency</Label>
        <div className="flex gap-2 flex-wrap">
          {CURRENCIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => { setCurrency(c); setReceiveAddress(""); }}
              className={`px-4 py-2 rounded-sm border text-sm font-bold uppercase transition-all ${
                currency === c
                  ? `${CURRENCY_COLORS[c]} border-current`
                  : "border-border text-muted-foreground hover:border-foreground/30"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs uppercase text-muted-foreground">Asking price ({currency})</Label>
        <Input
          value={priceAmount}
          onChange={(e) => setPriceAmount(e.target.value)}
          placeholder={`e.g. ${currency === "ETH" ? "0.05" : currency === "USDT" ? "100" : currency === "BTC" ? "0.001" : "1.5"}`}
          type="number"
          min="0"
          step="any"
          required
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs uppercase text-muted-foreground">Your {currency} receive address</Label>
        <Input
          value={receiveAddress}
          onChange={(e) => setReceiveAddress(e.target.value)}
          placeholder={CURRENCY_PLACEHOLDERS[currency]}
          className="font-mono text-sm"
          required
        />
        <p className="text-xs text-muted-foreground">
          Buyers will send {currency} here. The system verifies it before releasing EMBR.
        </p>
      </div>

      <Button type="submit" disabled={create.isPending} className="w-full">
        {create.isPending ? (
          <><Loader2 className="w-4 h-4 animate-spin mr-2" />Creating…</>
        ) : (
          <><Plus className="w-4 h-4 mr-2" />Create Listing &amp; Lock EMBR</>
        )}
      </Button>
    </form>
  );
}

// ── my listings tab ───────────────────────────────────────────────────────────

function MyListingsTab() {
  const { activeWallet } = useActiveWallet();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: allListings = [], isLoading } = useListExchangeListings(
    activeWallet ? { seller: activeWallet.address } : undefined,
    { query: { enabled: !!activeWallet } }
  );

  const cancel = useCancelListing({
    mutation: {
      onSuccess: () => {
        toast({ title: "Listing cancelled", description: "EMBR has been returned to your balance." });
        qc.invalidateQueries({ queryKey: getListExchangeListingsQueryKey() });
      },
      onError: (err: unknown) => {
        const msg = (err as { message?: string })?.message ?? "Cancellation failed";
        toast({ variant: "destructive", title: "Error", description: msg });
      },
    },
  });

  if (!activeWallet) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <AlertTriangle className="w-10 h-10 text-muted-foreground/40" />
        <p className="text-muted-foreground font-bold uppercase">Wallet required</p>
        <p className="text-sm text-muted-foreground">Connect a wallet to view your listings.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading your listings…
      </div>
    );
  }

  if (!allListings.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <List className="w-12 h-12 text-muted-foreground/40" />
        <p className="text-muted-foreground font-bold uppercase">No listings yet</p>
        <p className="text-sm text-muted-foreground">Use the "List EMBR" tab to create one.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {allListings.map((listing) => (
        <div key={listing.id} className="border border-border rounded-sm bg-secondary/30 px-4 py-3 flex items-center gap-3">
          <Badge className={`text-xs uppercase border ${CURRENCY_COLORS[listing.currency]} font-bold w-14 justify-center`}>
            {listing.currency}
          </Badge>

          <div className="flex-1 min-w-0">
            <div className="font-bold text-foreground">{formatEmbr(listing.amountEmbr)}</div>
            <div className="text-xs text-muted-foreground">
              for {CURRENCY_SYMBOLS[listing.currency]}{listing.priceAmount} {listing.currency}
              {listing.receiveAddress && (
                <> → <code className="font-mono">{truncate(listing.receiveAddress, 10, 6)}</code></>
              )}
            </div>
            {listing.status === "fulfilled" && listing.buyerAddress && (
              <div className="text-xs text-green-400 mt-0.5">
                Buyer: <code className="font-mono">{truncate(listing.buyerAddress)}</code>
              </div>
            )}
          </div>

          <StatusBadge status={listing.status} />

          {listing.status === "open" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                cancel.mutate({ id: listing.id, data: { sellerPrivateKey: activeWallet!.privateKey } })
              }
              disabled={cancel.isPending}
              className="shrink-0 border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              {cancel.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Cancel listing"}
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

// ── price history tab ─────────────────────────────────────────────────────────

// CoinGecko historical price cache: "ethereum|30-06-2025" → usd price
const priceCache = new Map<string, number>();

const COINGECKO_ID: Record<ExchangeCurrency, string | null> = {
  ETH:  "ethereum",
  SOL:  "solana",
  BTC:  "bitcoin",
  USDT: null, // always $1
};

async function fetchUsdPrice(currency: ExchangeCurrency, isoDate: string): Promise<number> {
  if (currency === "USDT") return 1;
  const coinId = COINGECKO_ID[currency];
  if (!coinId) return 0;
  // CoinGecko date format: dd-mm-yyyy
  const d = new Date(isoDate);
  const dateStr = [
    String(d.getUTCDate()).padStart(2, "0"),
    String(d.getUTCMonth() + 1).padStart(2, "0"),
    d.getUTCFullYear(),
  ].join("-");
  const key = `${coinId}|${dateStr}`;
  if (priceCache.has(key)) return priceCache.get(key)!;
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/${coinId}/history?date=${dateStr}&localization=false`,
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json() as { market_data?: { current_price?: { usd?: number } } };
    const usd = json.market_data?.current_price?.usd ?? 0;
    priceCache.set(key, usd);
    return usd;
  } catch {
    return 0;
  }
}

interface PricePoint { date: string; price: number; currency: string }

function PriceHistoryTab() {
  const { data: listings = [] } = useListExchangeListings({ status: "fulfilled" });
  const [points, setPoints] = useState<PricePoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prevListingCount = useRef(-1);

  useEffect(() => {
    if (listings.length === 0 || listings.length === prevListingCount.current) return;
    prevListingCount.current = listings.length;

    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const results: PricePoint[] = [];
        // Fetch prices in small batches to respect CoinGecko rate limits
        for (const l of listings) {
          const date = l.updatedAt ?? l.createdAt ?? "";
          const coinUsd = await fetchUsdPrice(l.currency, date);
          if (coinUsd === 0 && l.currency !== "USDT") continue; // price unavailable
          const embrAmount = Number(BigInt(l.amountEmbr)) / 1e18;
          const paidInCoin = parseFloat(l.priceAmount);
          if (embrAmount <= 0 || paidInCoin <= 0) continue;
          const embrUsd = (paidInCoin * coinUsd) / embrAmount;
          results.push({
            date: new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" }),
            price: Math.round(embrUsd * 1_000_000) / 1_000_000, // 6 dp
            currency: l.currency,
          });
        }
        // Sort by original date ascending
        const sorted = results.sort((a, b) => a.date.localeCompare(b.date));
        setPoints(sorted);
      } catch {
        setError("Failed to load price history.");
      } finally {
        setLoading(false);
      }
    })();
  }, [listings]);

  const latest = points.at(-1);
  const earliest = points[0];
  const pctChange = latest && earliest && earliest.price > 0
    ? ((latest.price - earliest.price) / earliest.price) * 100
    : null;

  if (listings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <TrendingUp className="w-12 h-12 text-muted-foreground/40" />
        <p className="text-muted-foreground font-bold uppercase">No trade data yet</p>
        <p className="text-sm text-muted-foreground">Price history appears once trades are completed on the exchange.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* summary row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Latest Price", value: latest ? `${latest.price.toFixed(6)}` : "—" },
          { label: "All-time High", value: points.length ? `${Math.max(...points.map(p => p.price)).toFixed(6)}` : "—" },
          { label: "All-time Low",  value: points.length ? `${Math.min(...points.map(p => p.price)).toFixed(6)}` : "—" },
          {
            label: "Total Change",
            value: pctChange !== null ? `${pctChange >= 0 ? "+" : ""}${pctChange.toFixed(1)}%` : "—",
          },
        ].map(({ label, value }) => (
          <div key={label} className="border border-border rounded-sm p-3 bg-secondary/30">
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">{label}</div>
            <div className="font-mono text-sm font-bold text-foreground">{value}</div>
          </div>
        ))}
      </div>

      {/* chart */}
      {loading ? (
        <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Fetching historical prices from CoinGecko…
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-destructive text-sm py-8 justify-center">
          <AlertTriangle className="w-4 h-4" /> {error}
        </div>
      ) : points.length > 0 ? (
        <div className="border border-border rounded-sm p-4 bg-secondary/10">
          <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2">
            <TrendingUp className="w-3.5 h-3.5 text-primary" /> EMBR / USD — Trade Price History
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={points} margin={{ top: 4, right: 16, bottom: 0, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="date"
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tickFormatter={(v: number) => `${v.toFixed(4)}`}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                width={72}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 4,
                  fontSize: 12,
                }}
                labelStyle={{ color: "hsl(var(--foreground))", fontWeight: "bold" }}
                formatter={(v: number, _: string, entry: { payload?: PricePoint }) => [
                  `${v.toFixed(6)} (via ${entry.payload?.currency ?? ""})`,
                  "EMBR Price",
                ]}
              />
              <Line
                type="monotone"
                dataKey="price"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ fill: "hsl(var(--primary))", r: 3, strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="text-center py-10 text-muted-foreground text-sm">
          Could not resolve USD prices for any trades.
        </div>
      )}

      {/* attribution */}
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-sans">
        <Info className="w-3 h-3" />
        Historical ETH, SOL, and BTC prices sourced from CoinGecko. USDT trades use $1.00.
        Price = (amount paid × coin USD price) ÷ EMBR received.
      </div>
    </div>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function Exchange() {
  const [tab, setTab] = useState<Tab>("marketplace");
  const { data: openListings } = useListExchangeListings({ status: "open" });

  const { data: fulfilledListings } = useListExchangeListings({ status: "fulfilled" });
  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: "marketplace", label: "Marketplace", badge: openListings?.length },
    { id: "create",      label: "List EMBR" },
    { id: "mine",        label: "My Listings" },
    { id: "history",     label: "Trade History", badge: fulfilledListings?.length },
    { id: "price",       label: "Price Chart" },
  ];

  return (
    <Shell requireWallet={false}>
      <div className="space-y-6">
        {/* header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-sm bg-primary/10 border border-primary/30 flex items-center justify-center">
            <Store className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="font-display font-bold text-xl tracking-tight text-foreground uppercase">
              Exchange
            </h1>
            <p className="text-sm text-muted-foreground">
              Peer-to-peer marketplace — swap EMBR for ETH, USDT, BTC, or SOL
            </p>
          </div>
        </div>

        {/* how it works */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          {[
            { n: "1", title: "Seller lists EMBR", desc: "Locks EMBR in escrow and sets an asking price in any supported currency." },
            { n: "2", title: "Buyer pays externally", desc: "Sends the agreed amount to the seller's address on the other chain." },
            { n: "3", title: "Submit tx hash → done", desc: "The server verifies the payment on-chain and auto-releases the EMBR." },
          ].map(({ n, title, desc }) => (
            <div key={n} className="border border-border rounded-sm p-3 bg-secondary/20 flex gap-3">
              <div className="w-6 h-6 rounded-full bg-primary/20 border border-primary/40 text-primary text-xs font-bold flex items-center justify-center shrink-0">
                {n}
              </div>
              <div>
                <p className="font-bold text-foreground text-xs uppercase">{title}</p>
                <p className="text-muted-foreground text-xs mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* tab bar */}
        <div className="flex gap-1 border-b border-border">
          {tabs.map(({ id, label, badge }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`px-4 py-2 text-sm font-bold uppercase tracking-wide border-b-2 transition-all flex items-center gap-2 ${
                tab === id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
              {badge !== undefined && badge > 0 && (
                <span className="text-xs bg-primary/20 text-primary border border-primary/40 rounded-full px-1.5 leading-4 h-4 inline-flex items-center">
                  {badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* tab content */}
        <Card className="border-border bg-card">
          <CardContent className="p-4 md:p-6">
            {tab === "marketplace" && <MarketplaceTab />}
            {tab === "create"      && <CreateListingTab />}
            {tab === "mine"        && <MyListingsTab />}
            {tab === "history"     && <TradeHistoryTab />}
            {tab === "price"       && <PriceHistoryTab />}
          </CardContent>
        </Card>
      </div>
    </Shell>
  );
}
