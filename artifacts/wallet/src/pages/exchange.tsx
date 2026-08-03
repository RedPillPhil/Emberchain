import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Shell } from "@/components/layout/shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useActiveWallet } from "@/hooks/use-active-wallet";
import { useToast } from "@/hooks/use-toast";
import {
  useExchangeListings,
  useExchangeCreate,
  useExchangeCancel,
  useExchangeBuy,
  useExchangeReserve,
  type ExchangeListing,
} from "@/hooks/use-exchange-listings";
import type { ExchangeCurrency } from "@workspace/api-client-react";
import { useGetChainStatus } from "@workspace/api-client-react";
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
  Lock,
  ShieldCheck,
  CreditCard,
  ArrowLeftRight,
} from "lucide-react";
import { Link } from "wouter";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// ── helpers ───────────────────────────────────────────────────────────────────

const CURRENCY_COLORS: Record<ExchangeCurrency, string> = {
  ETH:  "bg-indigo-500/20 text-indigo-400 border-indigo-500/40",
  USDT: "bg-green-500/20 text-green-400 border-green-500/40",
  USDC: "bg-sky-500/20 text-sky-400 border-sky-500/40",
  BTC:  "bg-orange-500/20 text-orange-400 border-orange-500/40",
  SOL:  "bg-purple-500/20 text-purple-400 border-purple-500/40",
};

const CURRENCY_DECIMALS: Record<ExchangeCurrency, number> = {
  ETH: 18, USDT: 6, USDC: 6, BTC: 8, SOL: 9,
};

const CURRENCY_SYMBOLS: Record<ExchangeCurrency, string> = {
  ETH: "Ξ", USDT: "$", USDC: "$", BTC: "₿", SOL: "◎",
};

const CONFIRMATION_LABELS: Record<ExchangeCurrency, string> = {
  ETH:  "12 confirmations (~3 min)",
  USDT: "12 confirmations (~3 min)",
  USDC: "30 confirmations (~1 min)",
  BTC:  "2 confirmations (~20 min)",
  SOL:  "Finalized (~30 s)",
};

// ── payment networks ─────────────────────────────────────────────────────────

interface NetworkInfo {
  label: string;
  confirmations: string;
  addressPlaceholder: string;
  explorerTx: (hash: string) => string;
  /** Every EVM network takes the same 0x address, so one entry covers them all. */
  evm: boolean;
}

/**
 * Keyed by the network name stored on the listing.  "ERC-20" and "Ethereum" are
 * the same chain under two names — USDT has always called it ERC-20 and existing
 * listings depend on that spelling.
 */
const NETWORKS: Record<string, NetworkInfo> = {
  Ethereum: {
    label: "Ethereum mainnet",
    confirmations: "12 confirmations (~3 min)",
    addressPlaceholder: "0x... (Ethereum address)",
    explorerTx: (h) => `https://etherscan.io/tx/${h}`,
    evm: true,
  },
  Base: {
    label: "Base",
    confirmations: "30 confirmations (~1 min)",
    addressPlaceholder: "0x... (Base address)",
    explorerTx: (h) => `https://basescan.org/tx/${h}`,
    evm: true,
  },
  Arbitrum: {
    label: "Arbitrum One",
    confirmations: "120 confirmations (~30 s)",
    addressPlaceholder: "0x... (Arbitrum address)",
    explorerTx: (h) => `https://arbiscan.io/tx/${h}`,
    evm: true,
  },
  "ERC-20": {
    label: "ERC-20 · Ethereum mainnet",
    confirmations: "12 confirmations (~3 min)",
    addressPlaceholder: "0x... (Ethereum address)",
    explorerTx: (h) => `https://etherscan.io/tx/${h}`,
    evm: true,
  },
  "TRC-20": {
    label: "TRC-20 · Tron",
    confirmations: "Confirmed on-chain (~1 min)",
    addressPlaceholder: "T... (Tron address)",
    explorerTx: (h) => `https://tronscan.org/#/transaction/${h}`,
    evm: false,
  },
  "BEP-20": {
    label: "BEP-20 · BNB Smart Chain",
    confirmations: "15 confirmations (~45 s)",
    addressPlaceholder: "0x... (BSC address)",
    explorerTx: (h) => `https://bscscan.com/tx/${h}`,
    evm: true,
  },
  Polygon: {
    label: "Polygon",
    confirmations: "128 confirmations (~7 min)",
    addressPlaceholder: "0x... (Polygon address)",
    explorerTx: (h) => `https://polygonscan.com/tx/${h}`,
    evm: true,
  },
};

/**
 * Networks each currency can settle on, in the order they're offered.  The first
 * entry is the default.  Currencies absent from this map settle on one chain only.
 *
 * Base offers USDC rather than USDT deliberately: the only USDT on Base is a
 * bridged token that Tether disclaims, while USDC there is issued by Circle.
 */
const CURRENCY_NETWORKS: Partial<Record<ExchangeCurrency, string[]>> = {
  ETH:  ["Ethereum", "Base", "Arbitrum"],
  USDT: ["ERC-20", "TRC-20", "BEP-20", "Polygon", "Arbitrum"],
  USDC: ["Base", "Arbitrum", "Ethereum"],
};

/** Fixed network label for currencies that only settle on one chain. */
const CURRENCY_NETWORK: Record<ExchangeCurrency, string> = {
  ETH:  "Ethereum, Base or Arbitrum",
  USDT: "Ethereum, Tron, BNB Chain, Polygon or Arbitrum",
  USDC: "Base, Arbitrum or Ethereum",
  BTC:  "Bitcoin mainnet",
  SOL:  "Solana mainnet",
};

function networksFor(currency: ExchangeCurrency): string[] {
  return CURRENCY_NETWORKS[currency] ?? [];
}

function networkInfo(network: string | null | undefined): NetworkInfo | undefined {
  return network ? NETWORKS[network] : undefined;
}

/** Marketplace chip text — ETH/USDC need the chain name; USDT standards already encode it. */
function networkChipLabel(currency: ExchangeCurrency, network: string): string {
  if (currency === "ETH") {
    if (network === "Ethereum") return "ETH · Ethereum";
    if (network === "Base") return "Base ETH";
    if (network === "Arbitrum") return "Arbitrum ETH";
  }
  if (currency === "USDC") {
    if (network === "Ethereum") return "USDC · Ethereum";
    if (network === "Base") return "Base USDC";
    if (network === "Arbitrum") return "Arbitrum USDC";
  }
  return network;
}

const EXPLORER_LINKS: Record<ExchangeCurrency, (hash: string) => string> = {
  ETH:  (h) => `https://etherscan.io/tx/${h}`,
  USDT: (h) => `https://etherscan.io/tx/${h}`,
  USDC: (h) => `https://basescan.org/tx/${h}`,
  BTC:  (h) => `https://blockstream.info/tx/${h}`,
  SOL:  (h) => `https://solscan.io/tx/${h}`,
};

function getExplorerLink(currency: ExchangeCurrency, txHash: string, network?: string | null): string {
  return networkInfo(network)?.explorerTx(txHash) ?? EXPLORER_LINKS[currency](txHash);
}

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

function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, "0")}`;
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

/** Countdown hook — returns ms remaining and a setter to start/reset the clock. */
function useCountdown(until: number | null): number {
  const [msLeft, setMsLeft] = useState<number>(until ? Math.max(0, until - Date.now()) : 0);
  useEffect(() => {
    if (!until) { setMsLeft(0); return; }
    const tick = () => setMsLeft(Math.max(0, until - Date.now()));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [until]);
  return msLeft;
}

// ── trade history ─────────────────────────────────────────────────────────────

function TradeHistoryTab() {
  const { data: fulfilled = [], isLoading, isError } = useExchangeListings("fulfilled");

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

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
        <AlertTriangle className="w-12 h-12 text-destructive/40" />
        <p className="text-muted-foreground font-bold uppercase">Could not load trade history</p>
        <p className="text-sm text-muted-foreground">Could not reach the exchange API. Showing cached listings from the bundled snapshot when available.</p>
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
                    {listing.selectedNetwork && <span className="ml-1 opacity-60">via {listing.selectedNetwork}</span>}
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
                    href={getExplorerLink(listing.currency, listing.paymentTxHash, listing.selectedNetwork)}
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

// ── buy panel ─────────────────────────────────────────────────────────────────

type BuyPhase = "idle" | "reserving" | "reserved";

function BuyPanel({
  listing,
  myAddress,
  onClose,
}: {
  listing: ExchangeListing;
  myAddress: string;
  onClose: () => void;
}) {
  const { toast } = useToast();

  // If I already hold an active reservation from a previous visit, start in "reserved"
  const alreadyReserved =
    listing.reservedBy?.toLowerCase() === myAddress.toLowerCase() &&
    listing.reservedUntil !== null &&
    listing.reservedUntil > Date.now();

  const [phase, setPhase] = useState<BuyPhase>(alreadyReserved ? "reserved" : "idle");
  const [reservedUntil, setReservedUntil] = useState<number | null>(alreadyReserved ? listing.reservedUntil : null);

  // Which networks does the seller accept?  Listings created before a currency
  // went multi-chain carry no list, and those were all on its first network.
  const defaultNet = networksFor(listing.currency)[0];
  const acceptedNets = listing.acceptedNetworks?.length
    ? listing.acceptedNetworks
    : (defaultNet ? [defaultNet] : []);
  const isMultiNetwork = acceptedNets.length > 0;
  const [selectedNetwork, setSelectedNetwork] = useState<string>(acceptedNets[0] ?? "");

  const [buyerAddress, setBuyerAddress] = useState(myAddress);
  const [paymentTxHash, setPaymentTxHash] = useState("");

  const msLeft = useCountdown(reservedUntil);

  // When reservation expires, reset to idle
  useEffect(() => {
    if (phase === "reserved" && msLeft === 0 && reservedUntil !== null) {
      toast({ variant: "destructive", title: "Reservation expired", description: "The listing has been unlocked." });
      onClose();
    }
  }, [msLeft, phase, reservedUntil]);

  // Sellers may give a different address per network; fall back to the primary one.
  const receiveAddress =
    (selectedNetwork && listing.networkAddresses?.[selectedNetwork]) || listing.receiveAddress;

  const selectedNetInfo = networkInfo(selectedNetwork);
  const confirmLabel = selectedNetInfo?.confirmations ?? CONFIRMATION_LABELS[listing.currency];
  const networkLabel = selectedNetInfo?.label ?? CURRENCY_NETWORK[listing.currency];
  const explorerFn = (h: string) => getExplorerLink(listing.currency, h, selectedNetwork);

  // Reserve mutation
  const reserve = useExchangeReserve();

  // Buy mutation
  const buy = useExchangeBuy();

  const handleReserve = () => {
    reserve.mutate(
      { id: listing.id, buyerAddress: myAddress },
      {
        onSuccess: (data) => {
          setReservedUntil(data.reservedUntil);
          setPhase("reserved");
        },
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : "Could not reserve listing";
          toast({ variant: "destructive", title: "Reservation failed", description: msg });
        },
      },
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!buyerAddress.trim() || !paymentTxHash.trim()) return;
    buy.mutate(
      {
        id: listing.id,
        data: {
          buyerAddress: buyerAddress.trim(),
          paymentTxHash: paymentTxHash.trim(),
          selectedNetwork: isMultiNetwork ? selectedNetwork : undefined,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Payment verified!", description: "EMBR has been credited to your wallet." });
          onClose();
        },
        onError: (err: unknown) => {
          const data = (err as { data?: { code?: string; originalListingId?: string; error?: string } })?.data;
          if (data?.code === "DUPLICATE_PROOF") {
            const detail = data.originalListingId
              ? `This transaction was already used to fulfill listing ${data.originalListingId}.`
              : "This transaction was already used to fulfill a different listing.";
            toast({ variant: "destructive", title: "Transaction already used", description: detail });
          } else if (data?.code === "LISTING_RESERVED") {
            toast({
              variant: "destructive",
              title: "Listing reserved",
              description: data.error ?? "Another buyer holds the reservation.",
            });
          } else {
            const msg = err instanceof Error ? err.message : "Verification failed";
            toast({ variant: "destructive", title: "Verification failed", description: msg });
          }
        },
      },
    );
  };

  // ── Idle phase: reserve prompt ────────────────────────────────────────────

  if (phase === "idle") {
    return (
      <div className="mt-3 p-4 rounded-sm border border-primary/30 bg-primary/5">
        <h4 className="text-sm font-bold text-primary uppercase mb-3 flex items-center gap-2">
          <Store className="w-4 h-4" /> Buy this listing
        </h4>
        <p className="text-sm text-muted-foreground mb-4">
          Reserving this listing gives you <strong className="text-foreground">15 minutes</strong> to complete payment before it becomes available to others again.
        </p>
        {acceptedNets.length > 1 && (
          <div className="mb-4 p-3 bg-secondary/60 border border-border rounded-sm text-xs text-muted-foreground">
            <p className="font-bold text-foreground mb-1">Seller accepts {listing.currency} on:</p>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {acceptedNets.map(net => (
                <span key={net} className="px-2 py-0.5 rounded border border-green-500/40 bg-green-500/10 text-green-400 font-bold">
                  {net}
                </span>
              ))}
            </div>
          </div>
        )}
        <div className="flex gap-2">
          <Button
            onClick={handleReserve}
            disabled={reserve.isPending}
            className="flex-1 gap-2"
          >
            {reserve.isPending
              ? <><Loader2 className="w-4 h-4 animate-spin" />Reserving…</>
              : <><Lock className="w-4 h-4" />Reserve this listing</>
            }
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    );
  }

  // ── Reserved phase: payment form ─────────────────────────────────────────

  return (
    <div className="mt-3 p-4 rounded-sm border border-primary/30 bg-primary/5">
      {/* reservation countdown */}
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-bold text-primary uppercase flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" /> Listing reserved for you
        </h4>
        <div className={`flex items-center gap-1.5 text-sm font-mono font-bold tabular-nums ${
          msLeft < 120_000 ? "text-destructive" : "text-amber-400"
        }`}>
          <Clock className="w-3.5 h-3.5" />
          {formatCountdown(msLeft)}
        </div>
      </div>

      {/* payment network picker */}
      {acceptedNets.length > 1 && (
        <div className="mb-4">
          <p className="text-xs font-bold uppercase text-muted-foreground mb-2">Select your payment network</p>
          <div className="flex flex-wrap gap-2">
            {acceptedNets.map((net) => (
              <button
                key={net}
                type="button"
                onClick={() => setSelectedNetwork(net)}
                className={`px-3 py-1.5 rounded-sm border text-xs font-bold uppercase transition-all ${
                  selectedNetwork === net
                    ? "border-green-400 bg-green-500/20 text-green-400"
                    : "border-border text-muted-foreground hover:border-foreground/30"
                }`}
              >
                {net}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* payment instructions */}
      <div className="mb-4 p-3 bg-secondary/60 border border-border rounded-sm text-sm space-y-1">
        <p className="text-muted-foreground font-bold uppercase text-xs mb-2">Step 1 — Send payment externally</p>
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">Amount:</span>
          <span className="font-bold text-foreground ml-1">{CURRENCY_SYMBOLS[listing.currency]}{listing.priceAmount} {listing.currency}</span>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-muted-foreground">To address:</span>
          <code className="font-mono text-xs text-foreground bg-background/60 px-1 py-0.5 rounded">{receiveAddress}</code>
          <CopyButton text={receiveAddress} />
        </div>
        <div className="flex items-center gap-1 mt-1">
          <span className="text-muted-foreground text-xs">Network:</span>
          <span className="text-xs font-bold text-foreground ml-1">{networkLabel}</span>
        </div>
        <p className="text-muted-foreground text-xs mt-1">
          Wait for {confirmLabel} before submitting.
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
            placeholder="Transaction hash on the external chain…"
            className="font-mono text-sm"
          />
          {paymentTxHash && (
            <a
              href={explorerFn(paymentTxHash)}
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
            {buy.isPending
              ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Verifying…</>
              : "Verify & Claim EMBR"
            }
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>Close</Button>
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

function ReservationCountdown({ listing }: { listing: ExchangeListing }) {
  const msLeft = useCountdown(listing.reservedUntil);
  if (msLeft <= 0) return null;
  return (
    <span className="text-xs font-mono tabular-nums text-amber-400">
      {formatCountdown(msLeft)}
    </span>
  );
}

// CoinGecko simple/price — live spot prices for sorting by USD value
const spotPriceCache: Partial<Record<ExchangeCurrency, number>> = {};
let spotPriceFetchedAt = 0;

async function fetchSpotPrices(): Promise<Partial<Record<ExchangeCurrency, number>>> {
  if (Date.now() - spotPriceFetchedAt < 60_000) return spotPriceCache;
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum,bitcoin,solana&vs_currencies=usd",
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json() as {
      ethereum?: { usd?: number };
      bitcoin?: { usd?: number };
      solana?: { usd?: number };
    };
    spotPriceCache.ETH  = json.ethereum?.usd ?? spotPriceCache.ETH ?? 0;
    spotPriceCache.BTC  = json.bitcoin?.usd  ?? spotPriceCache.BTC  ?? 0;
    spotPriceCache.SOL  = json.solana?.usd   ?? spotPriceCache.SOL  ?? 0;
    spotPriceCache.USDT = 1;
    spotPriceCache.USDC = 1;
    spotPriceFetchedAt  = Date.now();
  } catch {
    spotPriceCache.USDT = 1;
    spotPriceCache.USDC = 1;
  }
  return spotPriceCache;
}

type MarketSort = "newest" | "oldest" | "highest" | "lowest";

function listingUsdValue(l: ExchangeListing, spots: Partial<Record<ExchangeCurrency, number>>): number {
  return parseFloat(l.priceAmount) * (spots[l.currency] ?? 0);
}

function fmtDate(iso: string | undefined | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
}

function MarketplaceTab() {
  const { activeWallet } = useActiveWallet();
  const { data: listings = [], isLoading, isError } = useExchangeListings("open", { refetchInterval: false });
  const [sortBy, setSortBy] = useState<MarketSort>("newest");
  const [spots, setSpots] = useState<Partial<Record<ExchangeCurrency, number>>>({});

  useEffect(() => {
    fetchSpotPrices().then(setSpots).catch(() => {});
  }, []);

  const now = Date.now();
  const myAddress = activeWallet?.address?.toLowerCase() ?? "";

  // Ensure listings is an array
  const listingsArray = Array.isArray(listings) ? listings : [];

  const myReservedListing = listingsArray.find(
    (l) => l.reservedBy?.toLowerCase() === myAddress && l.reservedUntil && l.reservedUntil > now
  );
  const [expandedId, setExpandedId] = useState<string | null>(myReservedListing?.id ?? null);

  const sorted = [...listingsArray].sort((a, b) => {
    if (sortBy === "newest") return new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime();
    if (sortBy === "oldest") return new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime();
    if (sortBy === "highest") return listingUsdValue(b, spots) - listingUsdValue(a, spots);
    if (sortBy === "lowest")  return listingUsdValue(a, spots) - listingUsdValue(b, spots);
    return 0;
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading listings…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
        <AlertTriangle className="w-12 h-12 text-destructive/40" />
        <p className="text-muted-foreground font-bold uppercase">Could not load marketplace</p>
        <p className="text-sm text-muted-foreground">Could not reach the exchange API. Showing cached listings from the bundled snapshot when available.</p>
      </div>
    );
  }

  if (!listingsArray.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
        <Store className="w-12 h-12 text-muted-foreground/40" />
        <p className="text-muted-foreground font-bold uppercase">No open listings yet</p>
        <p className="text-sm text-muted-foreground">Be the first to list EMBR for sale.</p>
      </div>
    );
  }

  const SORT_OPTIONS: { value: MarketSort; label: string }[] = [
    { value: "newest",  label: "Newest" },
    { value: "oldest",  label: "Oldest" },
    { value: "highest", label: "Highest $" },
    { value: "lowest",  label: "Lowest $" },
  ];

  return (
    <div className="space-y-3">
      {/* Sort controls */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest shrink-0">Sort by</span>
        {SORT_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setSortBy(opt.value)}
            className={cn(
              "text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded-sm border transition-all",
              sortBy === opt.value
                ? "bg-primary/10 text-primary border-primary/30"
                : "border-border text-muted-foreground hover:text-foreground hover:border-border/80 bg-secondary/30",
            )}
          >
            {opt.label}
          </button>
        ))}
        <span className="ml-auto text-[10px] text-muted-foreground">{listingsArray.length} listing{listingsArray.length !== 1 ? "s" : ""}</span>
      </div>

      <div className="space-y-2">
        {sorted.map((listing: ExchangeListing) => {
          const open = expandedId === listing.id;
          const isReservedByMe =
            myAddress &&
            listing.reservedBy?.toLowerCase() === myAddress &&
            listing.reservedUntil !== null &&
            listing.reservedUntil > now;
          const isReservedByOther =
            listing.reservedBy &&
            listing.reservedUntil !== null &&
            listing.reservedUntil > now &&
            !isReservedByMe;

          return (
            <div key={listing.id} className="border border-border rounded-sm bg-secondary/30">
              <div className="flex items-center gap-3 px-4 py-3">
                <Badge className={`text-xs uppercase border ${CURRENCY_COLORS[listing.currency]} font-bold w-14 justify-center`}>
                  {listing.currency}
                </Badge>

                <div className="flex-1 min-w-0">
                  <div className="font-bold text-foreground">{formatEmbr(listing.amountEmbr)}</div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-mono">{truncate(listing.sellerAddress)}</span>
                    {listing.createdAt && (
                      <span className="text-muted-foreground/50">· {fmtDate(listing.createdAt)}</span>
                    )}
                  </div>
                  {listing.acceptedNetworks && listing.acceptedNetworks.length > 0 && (
                    <div className="flex gap-1 mt-0.5 flex-wrap">
                      {listing.acceptedNetworks.map((n) => (
                        <span key={n} className="text-[10px] px-1.5 py-0 rounded border border-green-500/30 text-green-400/80">
                          {networkChipLabel(listing.currency, n)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="text-right mr-2">
                  <div className="font-bold text-foreground">
                    {CURRENCY_SYMBOLS[listing.currency]}{listing.priceAmount} {listing.currency}
                  </div>
                  {spots[listing.currency] !== undefined && (
                    <div className="text-[10px] text-muted-foreground">
                      ≈ ${listingUsdValue(listing, spots).toFixed(2)} USD
                    </div>
                  )}
                </div>

                {/* Reservation state / Buy button */}
                {isReservedByOther ? (
                  <div className="shrink-0 flex flex-col items-end gap-0.5">
                    <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/40 uppercase text-xs gap-1">
                      <Lock className="w-2.5 h-2.5" /> Reserved
                    </Badge>
                    <ReservationCountdown listing={listing} />
                  </div>
                ) : isReservedByMe ? (
                  <Button
                    size="sm"
                    onClick={() => setExpandedId(open ? null : listing.id)}
                    className="shrink-0 gap-1 bg-amber-500/20 border-amber-500/40 text-amber-400 hover:bg-amber-500/30"
                    variant="outline"
                  >
                    {open ? (
                      <><ChevronUp className="w-4 h-4" /> Close</>
                    ) : (
                      <><ShieldCheck className="w-4 h-4" /> Your reservation</>
                    )}
                  </Button>
                ) : (
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
                )}
              </div>

              {open && activeWallet && (
                <div className="px-4 pb-4">
                  <BuyPanel
                    listing={listing}
                    myAddress={activeWallet.address}
                    onClose={() => setExpandedId(null)}
                  />
                </div>
              )}
              {open && !activeWallet && (
                <div className="px-4 pb-4 text-sm text-muted-foreground">
                  Connect a wallet to buy this listing.
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── create listing tab ────────────────────────────────────────────────────────

const CURRENCIES: ExchangeCurrency[] = ["ETH", "USDT", "USDC", "BTC", "SOL"];

function CreateListingTab() {
  const { activeWallet } = useActiveWallet();
  const { toast } = useToast();

  const [amountEmbr, setAmountEmbr] = useState("");
  const [currency, setCurrency] = useState<ExchangeCurrency>("ETH");
  const [priceAmount, setPriceAmount] = useState("");

  // Single receive address for currencies that settle on one chain (BTC, SOL)
  const [receiveAddress, setReceiveAddress] = useState("");

  // Multi-chain currencies: one 0x address covers every EVM network they pick,
  // and Tron is the only non-EVM option so it needs a second field.
  const currencyNets = networksFor(currency);
  const isMultiNetwork = currencyNets.length > 0;
  const [acceptedNets, setAcceptedNets] = useState<string[]>(networksFor("ETH").slice(0, 1));
  const [evmAddress, setEvmAddress] = useState("");
  const [tronAddress, setTronAddress] = useState("");

  const hasEvmNets = acceptedNets.some((n) => NETWORKS[n]?.evm);
  const hasTronNet = acceptedNets.some((n) => NETWORKS[n]?.evm === false);

  const changeCurrency = (c: ExchangeCurrency) => {
    setCurrency(c);
    setReceiveAddress("");
    setAcceptedNets(networksFor(c).slice(0, 1));
  };

  const toggleNet = (net: string) => {
    setAcceptedNets((prev) => {
      const next = prev.includes(net) ? prev.filter((n) => n !== net) : [...prev, net];
      return next.length === 0 ? [net] : next; // always keep at least one
    });
  };

  const create = useExchangeCreate();

  if (!activeWallet) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <AlertTriangle className="w-10 h-10 text-muted-foreground/40" />
        <p className="text-muted-foreground font-bold uppercase">Wallet required</p>
        <p className="text-sm text-muted-foreground">Connect a wallet to create a listing.</p>
      </div>
    );
  }

  const createSuccess = () => {
    toast({ title: "Listing created!", description: "Your EMBR is now locked in escrow and visible in the marketplace." });
    setAmountEmbr("");
    setPriceAmount("");
    setReceiveAddress("");
    setEvmAddress("");
    setTronAddress("");
    setAcceptedNets(networksFor(currency).slice(0, 1));
  };

  const createError = (err: unknown) => {
    const msg = err instanceof Error ? err.message : "Failed to create listing";
    toast({ variant: "destructive", title: "Error", description: msg });
  };

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

    if (isMultiNetwork) {
      if (hasEvmNets && !evmAddress.trim()) {
        toast({ variant: "destructive", title: "Missing address", description: "Enter your EVM receive address." });
        return;
      }
      if (hasTronNet && !tronAddress.trim()) {
        toast({ variant: "destructive", title: "Missing address", description: "Enter your Tron receive address for TRC-20." });
        return;
      }
      const networkAddresses: Record<string, string> = {};
      for (const net of acceptedNets) {
        networkAddresses[net] = NETWORKS[net]?.evm ? evmAddress.trim() : tronAddress.trim();
      }
      // Primary receiveAddress = EVM address if any, otherwise Tron
      const primaryAddress = hasEvmNets ? evmAddress.trim() : tronAddress.trim();
      create.mutate(
        {
          data: {
            sellerPrivateKey: activeWallet.privateKey,
            amountEmbr: amountWei,
            currency,
            priceAmount: priceAmount.trim(),
            receiveAddress: primaryAddress,
            acceptedNetworks: acceptedNets,
            networkAddresses,
          },
        },
        { onSuccess: createSuccess, onError: createError },
      );
    } else {
      create.mutate(
        {
          data: {
            sellerPrivateKey: activeWallet.privateKey,
            amountEmbr: amountWei,
            currency,
            priceAmount: priceAmount.trim(),
            receiveAddress: receiveAddress.trim(),
          },
        },
        { onSuccess: createSuccess, onError: createError },
      );
    }
  };

  const CURRENCY_PLACEHOLDERS: Record<ExchangeCurrency, string> = {
    ETH:  "0x... (Ethereum address)",
    USDT: "0x... (EVM address)",
    USDC: "0x... (EVM address)",
    BTC:  "bc1... (Bitcoin address)",
    SOL:  "... (Solana public key)",
  };

  const PRICE_PLACEHOLDERS: Record<ExchangeCurrency, string> = {
    ETH: "0.05", USDT: "100", USDC: "100", BTC: "0.001", SOL: "1.5",
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
              onClick={() => changeCurrency(c)}
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
          placeholder={`e.g. ${PRICE_PLACEHOLDERS[currency]}`}
          type="number"
          min="0"
          step="any"
          required
        />
      </div>

      {/* Multi-chain network selection */}
      {isMultiNetwork && (
        <div className="space-y-3 p-3 border border-primary/20 rounded-sm bg-primary/5">
          <Label className="text-xs uppercase text-muted-foreground font-bold">Accepted {currency} networks</Label>
          <p className="text-xs text-muted-foreground">
            Select which networks you'll accept payment on. Buyers choose one of these, and payments
            on any other network are rejected.
          </p>
          <div className="space-y-2">
            {currencyNets.map((net) => (
              <div key={net} className="flex items-center gap-2">
                <Checkbox
                  id={`net-${net}`}
                  checked={acceptedNets.includes(net)}
                  onCheckedChange={() => toggleNet(net)}
                />
                <label htmlFor={`net-${net}`} className="text-sm cursor-pointer select-none">
                  {NETWORKS[net]?.label ?? net}
                </label>
              </div>
            ))}
          </div>

          {currency === "USDC" && (
            <p className="text-xs text-muted-foreground border-l-2 border-sky-500/40 pl-2">
              USDC is offered on Base rather than USDT because the only USDT on Base is a bridged
              token that Tether disclaims. This is Circle-issued native USDC.
            </p>
          )}

          {hasEvmNets && (
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">
                Your EVM receive address
                <span className="ml-1 font-normal normal-case opacity-60">
                  ({acceptedNets.filter((n) => NETWORKS[n]?.evm).join(" / ")})
                </span>
              </Label>
              <Input
                value={evmAddress}
                onChange={(e) => setEvmAddress(e.target.value)}
                placeholder="0x... (EVM address)"
                className="font-mono text-sm"
                required
              />
              <p className="text-xs text-muted-foreground">
                The same address works on every EVM network you selected.
              </p>
            </div>
          )}

          {hasTronNet && (
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Your Tron receive address (TRC-20)</Label>
              <Input
                value={tronAddress}
                onChange={(e) => setTronAddress(e.target.value)}
                placeholder="T... (Tron address)"
                className="font-mono text-sm"
                required
              />
            </div>
          )}

        </div>
      )}

      {/* Single receive address for currencies that settle on one chain */}
      {!isMultiNetwork && (
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
            Buyers will send {currency} here on <span className="text-foreground font-bold">{CURRENCY_NETWORK[currency]}</span>. The system verifies it before releasing EMBR.
          </p>
        </div>
      )}

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

  const { data: allListings = [], isLoading } = useExchangeListings(undefined, {
    refetchInterval: false,
  });

  const allListingsArray = useMemo(() => {
    const rows = Array.isArray(allListings) ? allListings : [];
    if (!activeWallet) return [];
    const seller = activeWallet.address.toLowerCase();
    return rows.filter((l) => l.sellerAddress.toLowerCase() === seller);
  }, [allListings, activeWallet]);

  const cancel = useExchangeCancel();

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

  if (!allListingsArray.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <List className="w-12 h-12 text-muted-foreground/40" />
        <p className="text-muted-foreground font-bold uppercase">No listings yet</p>
        <p className="text-sm text-muted-foreground">Use the "List EMBR" tab to create one.</p>
      </div>
    );
  }

  const now = Date.now();

  return (
    <div className="space-y-2">
      {allListingsArray.map((listing) => (
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
            {listing.acceptedNetworks && listing.acceptedNetworks.length > 0 && (
              <div className="flex gap-1 mt-0.5 flex-wrap">
                {listing.acceptedNetworks.map((n) => (
                  <span key={n} className="text-[10px] px-1.5 py-0 rounded border border-green-500/30 text-green-400/80">
                    {networkChipLabel(listing.currency, n)}
                  </span>
                ))}
              </div>
            )}
            {listing.status === "fulfilled" && listing.buyerAddress && (
              <div className="text-xs text-green-400 mt-0.5">
                Buyer: <code className="font-mono">{truncate(listing.buyerAddress)}</code>
                {listing.selectedNetwork && <span className="ml-1 opacity-70">via {listing.selectedNetwork}</span>}
              </div>
            )}
            {listing.status === "open" && listing.reservedBy && listing.reservedUntil && listing.reservedUntil > now && (
              <div className="text-xs text-amber-400/80 mt-0.5 flex items-center gap-1">
                <Lock className="w-3 h-3" /> Reserved by buyer
              </div>
            )}
          </div>

          <StatusBadge status={listing.status} />

          {listing.status === "open" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                cancel.mutate(
                  { id: listing.id, sellerPrivateKey: activeWallet!.privateKey },
                  {
                    onSuccess: () => {
                      toast({ title: "Listing cancelled", description: "EMBR has been returned to your balance." });
                    },
                    onError: (err: unknown) => {
                      const msg = err instanceof Error ? err.message : "Cancellation failed";
                      toast({ variant: "destructive", title: "Error", description: msg });
                    },
                  },
                )
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

const priceCache = new Map<string, number>();

/** USD-pegged currencies need no historical price lookup. */
const STABLECOINS: ExchangeCurrency[] = ["USDT", "USDC"];

const COINGECKO_ID: Record<ExchangeCurrency, string | null> = {
  ETH:  "ethereum",
  SOL:  "solana",
  BTC:  "bitcoin",
  USDT: null,
  USDC: null,
};

async function fetchUsdPrice(currency: ExchangeCurrency, isoDate: string): Promise<number> {
  if (STABLECOINS.includes(currency)) return 1;
  const coinId = COINGECKO_ID[currency];
  if (!coinId) return 0;
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
  const { data: listings = [] } = useExchangeListings("fulfilled", { refetchInterval: false });
  const { data: chainStatus } = useGetChainStatus({ query: { refetchInterval: false } });
  const [points, setPoints] = useState<PricePoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prevListingCount = useRef(-1);

  // Ensure listings is an array
  const listingsArray = Array.isArray(listings) ? listings : [];

  useEffect(() => {
    if (listingsArray.length === 0 || listingsArray.length === prevListingCount.current) return;
    prevListingCount.current = listingsArray.length;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const results: PricePoint[] = [];
        for (const l of listingsArray) {
          const date = l.updatedAt ?? l.createdAt ?? "";
          const coinUsd = await fetchUsdPrice(l.currency, date);
          if (coinUsd === 0 && !STABLECOINS.includes(l.currency)) continue;
          const embrAmount = Number(BigInt(l.amountEmbr)) / 1e18;
          const paidInCoin = parseFloat(l.priceAmount);
          if (embrAmount <= 0 || paidInCoin <= 0) continue;
          const embrUsd = (paidInCoin * coinUsd) / embrAmount;
          results.push({
            date: new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" }),
            price: Math.round(embrUsd * 1_000_000) / 1_000_000,
            currency: l.currency,
          });
        }
        setPoints(results.sort((a, b) => a.date.localeCompare(b.date)));
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

  const totalSupplyEmbr = chainStatus?.totalSupply
    ? Number(BigInt(chainStatus.totalSupply)) / 1e18
    : null;
  const marketCap = latest && totalSupplyEmbr
    ? latest.price * totalSupplyEmbr
    : null;
  const fmtMarketCap = (v: number) =>
    v >= 1_000_000 ? `${(v / 1_000_000).toFixed(2)}M` :
    v >= 1_000    ? `${(v / 1_000).toFixed(2)}K` :
    `${v.toFixed(2)}`;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Latest Price",  value: latest ? `${latest.price.toFixed(6)}` : "—" },
          { label: "Market Cap",    value: marketCap !== null ? fmtMarketCap(marketCap) : "—" },
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
      {loading ? (
        <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Fetching historical prices from CoinGecko…
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
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-sans">
        <Info className="w-3 h-3" />
        Historical ETH, SOL, and BTC prices sourced from CoinGecko. USDT and USDC trades use $1.00.
        Price = (amount paid × coin USD price) ÷ EMBR received.
      </div>
    </div>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────

/** Set false when escrow is migrated off Replit and exchange is live again. */
const EXCHANGE_ESCROW_DOWN = import.meta.env.VITE_EXCHANGE_ESCROW_DOWN !== "false";

type Tab = "marketplace" | "create" | "mine" | "history" | "price";

function ExchangeEscrowDown() {
  return (
    <Shell requireWallet={false}>
      <div className="relative min-h-[60vh] flex flex-col">
        <div className="space-y-6 opacity-40 pointer-events-none select-none blur-[1px]" aria-hidden>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-sm bg-primary/10 border border-primary/30 flex items-center justify-center">
              <Store className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="font-display font-bold text-xl tracking-tight text-foreground uppercase">
                Exchange
              </h1>
              <p className="text-sm text-muted-foreground">
                Peer-to-peer marketplace — swap EMBR for ETH, USDT, USDC, BTC, or SOL
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[1, 2, 3].map((n) => (
              <div key={n} className="border border-border rounded-sm p-3 bg-secondary/20 h-20" />
            ))}
          </div>
          <div className="border border-border rounded-sm bg-card h-64" />
        </div>

        <div className="absolute inset-0 flex items-center justify-center p-6">
          <Card className="max-w-md w-full border-border/80 bg-background/95 shadow-xl backdrop-blur-sm">
            <CardContent className="pt-8 pb-8 px-6 text-center space-y-5">
              <div className="mx-auto w-14 h-14 rounded-sm bg-muted border border-border flex items-center justify-center">
                <AlertTriangle className="w-7 h-7 text-muted-foreground" />
              </div>
              <div className="space-y-2">
                <h2 className="font-display font-bold text-lg uppercase tracking-tight text-foreground">
                  Escrow is down for now
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  The peer-to-peer marketplace escrow is temporarily unavailable. Please use the bridge and
                  Ember Delta to move and trade EMBR in the meantime.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 justify-center pt-1">
                <Link href="/emberswap">
                  <Button className="w-full sm:w-auto gap-2">
                    <ArrowLeftRight className="w-4 h-4" />
                    Bridge
                  </Button>
                </Link>
                <a href="/ember-delta/">
                  <Button variant="outline" className="w-full sm:w-auto gap-2">
                    <ArrowLeftRight className="w-4 h-4" />
                    Ember Delta
                  </Button>
                </a>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Shell>
  );
}

function ExchangeContent() {
  const [tab, setTab] = useState<Tab>("marketplace");
  const { data: openListings } = useExchangeListings("open", { refetchInterval: false });
  const { data: fulfilledListings } = useExchangeListings("fulfilled", { refetchInterval: false });

  const openListingsArray = Array.isArray(openListings) ? openListings : [];
  const fulfilledListingsArray = Array.isArray(fulfilledListings) ? fulfilledListings : [];

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: "marketplace", label: "Marketplace", badge: openListingsArray.length },
    { id: "create",      label: "List EMBR" },
    { id: "mine",        label: "My Listings" },
    { id: "history",     label: "Trade History", badge: fulfilledListingsArray.length },
    { id: "price",       label: "Price Chart" },
  ];

  return (
    <Shell requireWallet={false}>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-sm bg-primary/10 border border-primary/30 flex items-center justify-center">
            <Store className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="font-display font-bold text-xl tracking-tight text-foreground uppercase">
              Exchange
            </h1>
            <p className="text-sm text-muted-foreground">
              Peer-to-peer marketplace — swap EMBR for ETH, USDT, or USDC across Ethereum, Base and Arbitrum, plus BTC and SOL
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          {[
            { n: "1", title: "Seller lists EMBR", desc: "Locks EMBR in escrow and sets an asking price, picking which networks they'll accept payment on." },
            { n: "2", title: "Reserve & pay externally", desc: "Buyer reserves the listing for 15 min, picks a network, then sends payment on the chosen chain." },
            { n: "3", title: "Submit tx hash → done", desc: "The server verifies the payment on-chain and auto-releases the EMBR to the buyer." },
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

        {/* Fiat on-ramp CTA */}
        <div className="flex items-center gap-3 p-3 rounded-sm border border-primary/20 bg-primary/5">
          <CreditCard className="w-4 h-4 text-primary shrink-0" />
          <p className="text-sm text-muted-foreground flex-1">
            <span className="font-bold text-foreground">New to EMBR?</span> Buy ETH with a credit card, then trade it for EMBR on this exchange — no bridge needed.
          </p>
          <a href="/onramp" className="shrink-0">
            <Button size="sm" variant="outline" className="gap-1.5 border-primary/30 text-primary hover:bg-primary/10">
              <CreditCard className="w-3.5 h-3.5" /> Buy with Fiat
            </Button>
          </a>
        </div>

        <div className="flex gap-1 border-b border-border overflow-x-auto">
          {tabs.map(({ id, label, badge }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`px-4 py-2 text-sm font-bold uppercase tracking-wide border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
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

export default function Exchange() {
  if (EXCHANGE_ESCROW_DOWN) return <ExchangeEscrowDown />;
  return <ExchangeContent />;
}
