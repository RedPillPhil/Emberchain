import React, { useState, useEffect, useRef, useCallback } from "react";
import { Shell } from "@/components/layout/shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useActiveWallet } from "@/hooks/use-active-wallet";
import { useToast } from "@/hooks/use-toast";
import { useListExchangeListings } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import {
  CreditCard,
  ArrowRight,
  Store,
  CheckCircle2,
  ExternalLink,
  Copy,
  Loader2,
  AlertTriangle,
  Info,
  X,
  Wallet,
  ShieldCheck,
  Zap,
} from "lucide-react";

// ── types ─────────────────────────────────────────────────────────────────────

interface OnrampConfig {
  provider: "transak";
  apiKey: string;
  staging: boolean;
  widgetUrl: string;
  rampUrl: string;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function truncate(s: string, front = 10, back = 8): string {
  if (s.length <= front + back + 3) return s;
  return s.slice(0, front) + "…" + s.slice(-back);
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors font-bold"
    >
      {copied ? (
        <><CheckCircle2 className="w-3.5 h-3.5 text-green-400" />{label ? "Copied!" : ""}</>
      ) : (
        <><Copy className="w-3.5 h-3.5" />{label ?? ""}</>
      )}
    </button>
  );
}

// ── Transak iframe modal ──────────────────────────────────────────────────────

function TransakModal({
  config,
  ethAddress,
  onClose,
  onSuccess,
}: {
  config: OnrampConfig;
  ethAddress: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const widgetUrl = (() => {
    const params = new URLSearchParams({
      defaultCryptoCurrency: "ETH",
      defaultNetwork: "ethereum",
      themeColor: "FF6B35",
      hideMenu: "true",
      productsAvailed: "BUY",
      exchangeScreenTitle: "Buy ETH for Emberchain",
    });
    if (config.apiKey) params.set("apiKey", config.apiKey);
    if (ethAddress) {
      params.set("walletAddress", ethAddress);
      params.set("disableWalletAddressForm", "true");
    }
    return `${config.widgetUrl}?${params.toString()}`;
  })();

  // Listen for Transak postMessage events
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      // Transak events come from the widget origin
      if (!e.origin.includes("transak.com")) return;
      const data = e.data as { event_id?: string };
      if (
        data?.event_id === "TRANSAK_ORDER_SUCCESSFUL" ||
        data?.event_id === "TRANSAK_ORDER_COMPLETED"
      ) {
        onSuccess();
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onSuccess]);

  // Also handle ESC key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg h-[680px] bg-card border border-border rounded-sm shadow-2xl flex flex-col">
        {/* header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-primary" />
            <span className="font-bold text-sm uppercase text-foreground">
              Buy ETH {config.staging && <span className="text-xs text-amber-400 font-normal ml-1">(test mode)</span>}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* iframe */}
        <iframe
          ref={iframeRef}
          src={widgetUrl}
          className="flex-1 w-full border-0 rounded-b-sm"
          allow="camera;microphone;payment;accelerometer;gyroscope;geolocation"
          title="Transak On-Ramp"
        />
      </div>
    </div>
  );
}

// ── step card ─────────────────────────────────────────────────────────────────

function StepCard({
  n,
  title,
  desc,
  done,
  active,
}: {
  n: string;
  title: string;
  desc: string;
  done?: boolean;
  active?: boolean;
}) {
  return (
    <div className={`flex gap-3 p-3 rounded-sm border transition-all ${
      done
        ? "border-green-500/40 bg-green-500/5"
        : active
        ? "border-primary/40 bg-primary/5"
        : "border-border bg-secondary/20"
    }`}>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
        done
          ? "bg-green-500/20 text-green-400 border border-green-500/40"
          : active
          ? "bg-primary/20 text-primary border border-primary/40"
          : "bg-secondary text-muted-foreground border border-border"
      }`}>
        {done ? <CheckCircle2 className="w-4 h-4" /> : n}
      </div>
      <div>
        <p className={`text-xs font-bold uppercase ${done ? "text-green-400" : active ? "text-primary" : "text-muted-foreground"}`}>
          {title}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
      </div>
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function OnRamp() {
  const { activeWallet } = useActiveWallet();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  // Config from server
  const [config, setConfig] = useState<OnrampConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);

  // ETH address the user wants to receive ETH into
  const [ethAddress, setEthAddress] = useState("");

  // Widget open state
  const [widgetOpen, setWidgetOpen] = useState(false);
  const [purchaseDone, setPurchaseDone] = useState(false);

  // Live exchange listings (ETH only) for preview
  const { data: listings = [] } = useListExchangeListings({ status: "open" });
  const ethListings = listings.filter((l) => l.currency === "ETH");

  // Fetch on-ramp config from server
  useEffect(() => {
    fetch("/api/onramp/config")
      .then((r) => r.json())
      .then((d) => { setConfig(d as OnrampConfig); setConfigLoading(false); })
      .catch(() => setConfigLoading(false));
  }, []);

  const handleSuccess = useCallback(() => {
    setWidgetOpen(false);
    setPurchaseDone(true);
    toast({
      title: "ETH purchase initiated!",
      description: "Your ETH will arrive in your wallet shortly. Head to the Exchange to buy EMBR.",
    });
  }, [toast]);

  const openWidget = () => {
    if (!ethAddress.trim()) {
      toast({ variant: "destructive", title: "Enter your Ethereum address", description: "We need to know where to send your ETH." });
      return;
    }
    setWidgetOpen(true);
  };

  const step1Done = purchaseDone;
  const step2Active = purchaseDone;

  return (
    <Shell requireWallet={false}>
      {/* Transak modal */}
      {widgetOpen && config && (
        <TransakModal
          config={config}
          ethAddress={ethAddress}
          onClose={() => setWidgetOpen(false)}
          onSuccess={handleSuccess}
        />
      )}

      <div className="max-w-2xl mx-auto space-y-6">
        {/* header */}
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-sm bg-primary/10 border border-primary/30 flex items-center justify-center shrink-0">
            <CreditCard className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="font-display font-bold text-xl tracking-tight text-foreground uppercase">
              Buy EMBR
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              No EMBR listed? Get ETH with your card, then trade it for EMBR on the peer-to-peer exchange — the chain verifies every payment automatically.
            </p>
          </div>
        </div>

        {/* how it works */}
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase text-muted-foreground tracking-widest">How it works</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <StepCard
              n="1"
              title="Get ETH"
              desc="Buy ETH with a credit card, debit card, or bank transfer via Transak — directly to your Ethereum wallet."
              done={step1Done}
              active={!step1Done}
            />
            <StepCard
              n="2"
              title="Find a listing"
              desc="Browse open EMBR listings on the Exchange that accept ETH as payment."
              done={false}
              active={step2Active}
            />
            <StepCard
              n="3"
              title="Submit & claim"
              desc="Pay the seller's ETH address, paste the tx hash, and EMBR is released automatically after verification."
              done={false}
              active={false}
            />
          </div>
        </div>

        {/* purchase complete banner */}
        {purchaseDone && (
          <div className="p-4 rounded-sm border border-green-500/40 bg-green-500/5 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold text-green-400 text-sm">ETH purchase initiated!</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Your ETH will arrive in your Ethereum wallet within a few minutes. Once it lands, head to the Exchange and pick an open listing.
              </p>
            </div>
            <Button size="sm" onClick={() => navigate("/exchange")} className="shrink-0 gap-1.5">
              <Store className="w-4 h-4" /> Exchange
            </Button>
          </div>
        )}

        {/* step 1 card */}
        <Card className="border-border bg-card">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-primary/20 border border-primary/40 text-primary text-xs font-bold flex items-center justify-center">1</div>
              <h2 className="font-bold text-sm uppercase text-foreground tracking-wide">Get ETH with your card</h2>
              {config?.staging && (
                <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/40 text-xs ml-auto">Test mode</Badge>
              )}
            </div>

            {/* address input */}
            <div className="space-y-1.5">
              <Label className="text-xs uppercase text-muted-foreground font-bold">
                Your Ethereum receive address
              </Label>
              <div className="flex gap-2">
                <Input
                  value={ethAddress}
                  onChange={(e) => setEthAddress(e.target.value)}
                  placeholder="0x... (Ethereum mainnet address)"
                  className="font-mono text-sm flex-1"
                />
                {activeWallet && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setEthAddress(activeWallet.address)}
                    title="Use your EMBR wallet address (only do this if it's also your Ethereum address)"
                    className="shrink-0 text-xs"
                  >
                    <Wallet className="w-3.5 h-3.5 mr-1" /> Use wallet
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground flex items-start gap-1">
                <Info className="w-3 h-3 shrink-0 mt-0.5" />
                This is where your purchased ETH will land — use your MetaMask address or any Ethereum mainnet wallet you control.
              </p>
            </div>

            {/* action buttons */}
            <div className="flex gap-3 flex-wrap">
              <Button
                onClick={openWidget}
                disabled={configLoading || !ethAddress.trim()}
                className="gap-2 flex-1"
                size="lg"
              >
                {configLoading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Loading…</>
                ) : (
                  <><CreditCard className="w-4 h-4" /> Buy ETH — Card / Bank</>
                )}
              </Button>
            </div>

            {/* trust badges */}
            <div className="flex flex-wrap gap-3 pt-1">
              {[
                { icon: ShieldCheck, label: "KYC'd by Transak" },
                { icon: Zap,         label: "Instant card payments" },
                { icon: Info,        label: "170+ countries supported" },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Icon className="w-3.5 h-3.5 text-primary" /> {label}
                </div>
              ))}
            </div>

            {config?.staging && (
              <div className="p-2.5 rounded-sm border border-amber-500/30 bg-amber-500/5 text-xs text-amber-400/80 leading-relaxed">
                ⚠️ Running in <strong>Transak test mode</strong> — no real money will be charged.
                To enable live payments, add a <code className="font-mono">TRANSAK_API_KEY</code> Replit secret (get one free at <a href="https://transak.com" target="_blank" rel="noopener noreferrer" className="underline">transak.com</a>).
              </div>
            )}

            {/* alternative providers note */}
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer hover:text-foreground transition-colors font-bold uppercase tracking-wide">
                Alternative on-ramp providers
              </summary>
              <div className="mt-2 space-y-2 pl-2 border-l border-border">
                <div>
                  <a
                    href={config?.rampUrl ?? "https://app.ramp.network"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline font-bold inline-flex items-center gap-1"
                  >
                    Ramp Network <ExternalLink className="w-3 h-3" />
                  </a>
                  <span className="ml-1">— Buy ETH directly; no account required. Paste your address manually.</span>
                </div>
                <div>
                  <a
                    href="https://www.moonpay.com/buy/eth"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline font-bold inline-flex items-center gap-1"
                  >
                    MoonPay <ExternalLink className="w-3 h-3" />
                  </a>
                  <span className="ml-1">— Widely available; card &amp; bank supported.</span>
                </div>
                <div>
                  <a
                    href="https://pay.coinbase.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline font-bold inline-flex items-center gap-1"
                  >
                    Coinbase Pay <ExternalLink className="w-3 h-3" />
                  </a>
                  <span className="ml-1">— US/EU users; instant with Coinbase account.</span>
                </div>
                <p className="text-muted-foreground/60 mt-2">
                  Any provider works as long as ETH lands on Ethereum mainnet at your address.
                </p>
              </div>
            </details>
          </CardContent>
        </Card>

        {/* step 2 card */}
        <Card className="border-border bg-card">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-full border text-xs font-bold flex items-center justify-center ${
                  step2Active
                    ? "bg-primary/20 border-primary/40 text-primary"
                    : "bg-secondary border-border text-muted-foreground"
                }`}>2</div>
                <h2 className="font-bold text-sm uppercase text-foreground tracking-wide">Trade ETH for EMBR on the Exchange</h2>
              </div>
              <Button
                size="sm"
                variant={step2Active ? "default" : "outline"}
                onClick={() => navigate("/exchange")}
                className="shrink-0 gap-1.5"
              >
                <Store className="w-4 h-4" /> Exchange <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </div>

            <p className="text-sm text-muted-foreground">
              Once your ETH arrives, go to the Exchange, find a listing that accepts ETH, reserve it, and send your ETH to the seller's address.
              The chain will verify the payment on Ethereum mainnet and release your EMBR automatically.
            </p>

            {/* live ETH listings preview */}
            {ethListings.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase text-muted-foreground tracking-widest">
                  {ethListings.length} open listing{ethListings.length !== 1 ? "s" : ""} accepting ETH right now
                </p>
                {ethListings.slice(0, 3).map((listing) => {
                  const embrAmount = Number(BigInt(listing.amountEmbr)) / 1e18;
                  return (
                    <div
                      key={listing.id}
                      className="flex items-center gap-3 p-3 rounded-sm border border-border bg-secondary/30 hover:border-primary/30 transition-colors cursor-pointer"
                      onClick={() => navigate("/exchange")}
                    >
                      <Badge className="bg-indigo-500/20 text-indigo-400 border-indigo-500/40 text-xs font-bold uppercase shrink-0">
                        ETH
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-foreground text-sm">
                          {embrAmount.toLocaleString("en-US", { maximumFractionDigits: 4 })} EMBR
                        </p>
                        <p className="text-xs text-muted-foreground font-mono">
                          {truncate(listing.sellerAddress)}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold text-foreground text-sm">Ξ{listing.priceAmount} ETH</p>
                        <p className="text-xs text-muted-foreground">asking price</p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    </div>
                  );
                })}
                {ethListings.length > 3 && (
                  <p className="text-xs text-muted-foreground text-center">
                    +{ethListings.length - 3} more on the Exchange →
                  </p>
                )}
              </div>
            ) : (
              <div className="p-3 rounded-sm border border-border bg-secondary/20 text-sm text-muted-foreground flex items-center gap-2">
                <Store className="w-4 h-4 shrink-0" />
                No ETH listings open right now — check back after getting your ETH, or list EMBR yourself to attract buyers.
              </div>
            )}

            {/* flow diagram */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap pt-1">
              {[
                "Your ETH wallet",
                "→",
                "ETH to seller's address",
                "→",
                "Chain verifies on Ethereum",
                "→",
                "EMBR to your EMBR wallet",
              ].map((step, i) => (
                <span
                  key={i}
                  className={step === "→" ? "text-primary font-bold" : "font-mono bg-secondary/60 px-1.5 py-0.5 rounded-sm border border-border"}
                >
                  {step}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* FAQ */}
        <Card className="border-border bg-card">
          <CardContent className="p-5 space-y-4">
            <p className="text-xs font-bold uppercase text-muted-foreground tracking-widest">Common questions</p>
            {[
              {
                q: "Do I need a Coinbase or Binance account?",
                a: "No. Transak lets you buy ETH with a card or bank transfer without creating an exchange account. Your ETH goes straight to the address you enter.",
              },
              {
                q: "How long does it take for ETH to arrive?",
                a: "Card purchases typically settle in a few minutes. Bank transfers can take 1–3 business days depending on your region and Transak's compliance check.",
              },
              {
                q: "Why is there no direct EMBR purchase?",
                a: "EMBR is a newly minted chain with no established market price. The peer-to-peer exchange lets the market discover a natural price through real trades.",
              },
              {
                q: "What if there are no ETH listings when I check?",
                a: "You can still get EMBR by mining it directly — click FORGE (MINE) in the sidebar. Mining is free and runs in your browser with zero setup.",
              },
              {
                q: "Is my ETH address the same as my EMBR address?",
                a: "EMBR uses the same secp256k1 address format as Ethereum (0x…), so your private key works on both chains. But keep your keys separate for safety.",
              },
            ].map(({ q, a }) => (
              <details key={q} className="group">
                <summary className="cursor-pointer text-sm font-bold text-foreground hover:text-primary transition-colors list-none flex items-center justify-between">
                  {q}
                  <span className="text-muted-foreground group-open:rotate-90 transition-transform text-lg leading-none ml-2">›</span>
                </summary>
                <p className="mt-2 text-sm text-muted-foreground pl-2 border-l border-border">{a}</p>
              </details>
            ))}
          </CardContent>
        </Card>

        {/* disclaimer */}
        <p className="text-xs text-muted-foreground text-center leading-relaxed pb-4">
          On-ramp services are provided by Transak and other third parties.
          Emberchain has no affiliation with these providers and does not handle fiat payments.
          Verify all addresses before sending. Always do your own research.
        </p>
      </div>
    </Shell>
  );
}
