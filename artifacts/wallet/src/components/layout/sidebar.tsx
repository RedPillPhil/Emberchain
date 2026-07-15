import React from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useActiveWallet } from "@/hooks/use-active-wallet";
import { 
  Activity, 
  Cpu, 
  Send, 
  Flame, 
  Terminal,
  Blocks,
  Wallet,
  ArrowLeftRight,
  Shield,
} from "lucide-react";

const navItems = [
  { href: "/", label: "OVERVIEW", icon: Activity },
  { href: "/send", label: "TRANSFER", icon: Send },
  { href: "/privacy", label: "PRIVACY", icon: Shield },
  { href: "/mining", label: "FORGE (MINE)", icon: Flame },
  { href: "/blocks", label: "LEDGER", icon: Blocks },
  { href: "/transactions", label: "TRANSACTIONS", icon: ArrowLeftRight },
  { href: "/contracts", label: "CONTRACTS", icon: Terminal },
];

export function Sidebar() {
  const [location] = useLocation();
  const { activeWallet, setActiveWallet } = useActiveWallet();

  const handleDisconnect = () => {
    setActiveWallet(null);
  };

  return (
    <aside className="w-64 border-r border-border bg-card flex flex-col h-[100dvh] flex-shrink-0 sticky top-0">
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
        <div className="text-xs font-bold text-muted-foreground mb-2 mt-4 tracking-widest px-2">
          OPERATIONS
        </div>
        {navItems.map((item) => {
          const isActive = location === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-sm font-sans text-sm uppercase font-bold transition-all border border-transparent",
                isActive
                  ? "bg-primary/10 text-primary border-primary/30 box-glow"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground hover:border-border"
              )}
            >
              <Icon className={cn("w-4 h-4", isActive && "text-primary")} />
              {item.label}
            </Link>
          );
        })}
      </div>

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
    </aside>
  );
}
