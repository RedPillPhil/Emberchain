import React from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useActiveWallet } from "@/hooks/use-active-wallet";
import { 
  Activity, 
  Send, 
  Flame, 
  Blocks,
  Wallet,
  ArrowLeftRight,
  Shield,
  Store,
  Search,
  BookUser,
  CreditCard,
  MessageSquare,
  Zap,
  Coins,
  Download,
  Gamepad2,
  FileText,
  Swords,
  Circle,
  Ticket,
  Gift,
  Droplets,
  Music2,
} from "lucide-react";

export const navItems: Array<{ href: string; label: string; icon: React.ComponentType<{ className?: string }>; highlight?: boolean; external?: boolean }> = [
  { href: "/wallet", label: "OVERVIEW", icon: Activity },
  { href: "/send", label: "TRANSFER", icon: Send },
  { href: "/onramp", label: "BUY EMBR", icon: CreditCard, highlight: true },
  { href: "/airdrop/", label: "AIRDROP", icon: Gift, highlight: true, external: true },
  { href: "/exchange", label: "EXCHANGE", icon: Store },
  { href: "/emberswap", label: "EMBERSWAP", icon: Zap, highlight: true },
  { href: "/ember-delta/", label: "EMBER DELTA", icon: ArrowLeftRight, highlight: true, external: true },
  { href: "/community", label: "COMMUNITY", icon: MessageSquare },
  { href: "/contacts", label: "ADDRESS BOOK", icon: BookUser },
  { href: "/privacy", label: "PRIVACY", icon: Shield },
  { href: "/mining", label: "FORGE (MINE)", icon: Flame },
  { href: "/ledger", label: "EXPLORER", icon: Search },
  { href: "/tokens", label: "TOKENS/CONTRACTS", icon: Coins },
  { href: "/blocks", label: "BLOCKS", icon: Blocks },
  { href: "/transactions", label: "TRANSACTIONS", icon: ArrowLeftRight },
  { href: "https://wbbl.site/", label: "WBBL", icon: Circle, highlight: true, external: true },
  { href: "/embermon", label: "EMBERMON", icon: Gamepad2, highlight: true },
  { href: "/chain-invaders", label: "CHAIN INVADERS", icon: Swords, highlight: true },
  { href: "/drip", label: "EMBER DRIP", icon: Droplets },
  { href: "/niftytracks", label: "NIFTYTRACKS", icon: Music2 },
  { href: "/lotto/", label: "EMBER LOTTO", icon: Ticket, highlight: true, external: true },
  { href: "/downloads", label: "DOWNLOADS", icon: Download },
];

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const [location] = useLocation();

  return (
    <>
      <div className="text-xs font-bold text-muted-foreground mb-2 mt-4 tracking-widest px-2">
        OPERATIONS
      </div>
      {navItems.map((item) => {
        const isActive = !item.external && location === item.href;
        const Icon = item.icon;
        const isHighlight = item.highlight && !isActive;
        const cls = cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-sm font-sans text-sm uppercase font-bold transition-all border",
          isActive
            ? "bg-primary/10 text-primary border-primary/30 box-glow"
            : isHighlight
            ? "bg-primary/5 text-primary border-primary/20 hover:bg-primary/10 hover:border-primary/40"
            : "border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground hover:border-border"
        );
        const inner = (
          <>
            <Icon className={cn("w-4 h-4", (isActive || isHighlight) && "text-primary")} />
            {item.label}
            {isHighlight && (
              <span className="ml-auto text-[9px] font-bold bg-primary/20 text-primary px-1.5 py-0.5 rounded-sm border border-primary/30 leading-none">
                NEW
              </span>
            )}
          </>
        );
        if (item.external) {
          const sameOrigin = item.href.startsWith("/");
          return (
            <a
              key={item.href}
              href={item.href}
              {...(!sameOrigin ? { target: "_blank", rel: "noreferrer" } : {})}
              className={cls}
              onClick={onNavigate}
            >
              {inner}
            </a>
          );
        }
        return (
          <Link key={item.href} href={item.href} className={cls} onClick={onNavigate}>
            {inner}
          </Link>
        );
      })}
    </>
  );
}

function WalletFooter() {
  const { activeWallet, setActiveWallet } = useActiveWallet();
  const [, navigate] = useLocation();

  const handleDisconnect = () => {
    setActiveWallet(null);
    navigate("/setup");
  };

  return (
    <div className="p-4 border-t border-border bg-noise">
      <div className="text-xs font-bold text-muted-foreground mb-3 tracking-widest px-2">
        ACTIVE WALLET
      </div>
      {activeWallet ? (
        <div className="flex flex-col gap-2 bg-secondary/50 p-3 border border-border rounded-sm">
          <div className="flex items-center gap-2 text-sm">
            <Wallet className="w-4 h-4 text-primary" />
            <span className="truncate flex-1 font-bold">
              {activeWallet.address.slice(0, 8)}...{activeWallet.address.slice(-6)}
            </span>
          </div>
          <button 
            onClick={handleDisconnect}
            className="text-xs text-muted-foreground hover:text-destructive text-left font-bold transition-colors uppercase mt-1"
          >
            Eject Wallet
          </button>
        </div>
      ) : (
        <div className="text-sm text-muted-foreground px-2 italic">
          NO WALLET CONNECTED
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden md:flex w-64 border-r border-border bg-card flex-col h-[100dvh] flex-shrink-0 sticky top-0">
      <div className="h-16 flex items-center px-6 border-b border-border bg-noise">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-sm bg-primary/20 flex items-center justify-center border border-primary/50 text-primary">
            <Flame className="w-5 h-5 fill-primary text-primary" />
          </div>
          <span className="font-display font-bold text-xl tracking-tight text-glow text-foreground">
            EMBERCHAIN
          </span>
        </div>
      </div>

      <div className="p-4 flex-1 flex flex-col gap-1 overflow-y-auto">
        <SidebarNav />
        <div className="mt-auto pt-4 border-t border-border/60">
          <Link
            href="/whitepaper"
            className="flex items-center gap-3 px-3 py-2.5 rounded-sm font-sans text-sm uppercase font-bold transition-all border border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground hover:border-border"
          >
            <FileText className="w-4 h-4" />
            Whitepaper
          </Link>
        </div>
      </div>

      <WalletFooter />
    </aside>
  );
}

export function MobileNav({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <>
      <div className="md:hidden h-14 flex items-center justify-between px-4 border-b border-border bg-card sticky top-0 z-40 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-sm bg-primary/20 flex items-center justify-center border border-primary/50 text-primary">
            <Flame className="w-4 h-4 fill-primary text-primary" />
          </div>
          <span className="font-display font-bold text-lg tracking-tight text-foreground">EMBERCHAIN</span>
        </div>
        <button
          type="button"
          onClick={() => onOpenChange(true)}
          className="p-2 rounded-sm border border-border text-muted-foreground hover:text-foreground"
          aria-label="Open menu"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
      </div>
      {open && (
        <div className="md:hidden fixed inset-0 z-50">
          <button type="button" className="absolute inset-0 bg-black/70" aria-label="Close menu" onClick={() => onOpenChange(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-[min(20rem,85vw)] bg-card border-r border-border flex flex-col">
            <div className="h-14 flex items-center justify-between px-4 border-b border-border">
              <span className="font-display font-bold text-lg">Menu</span>
              <button type="button" onClick={() => onOpenChange(false)} className="p-2 text-muted-foreground hover:text-foreground" aria-label="Close">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-4 flex-1 overflow-y-auto flex flex-col">
              <SidebarNav onNavigate={() => onOpenChange(false)} />
              <div className="mt-auto pt-4 border-t border-border/60">
                <Link
                  href="/whitepaper"
                  className="flex items-center gap-3 px-3 py-2.5 rounded-sm font-sans text-sm uppercase font-bold transition-all border border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground hover:border-border"
                  onClick={() => onOpenChange(false)}
                >
                  <FileText className="w-4 h-4" />
                  Whitepaper
                </Link>
              </div>
            </div>
            <WalletFooter />
          </aside>
        </div>
      )}
    </>
  );
}
