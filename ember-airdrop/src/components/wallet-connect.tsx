"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";
import { Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

export function WalletConnect() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-2">
        <span className="hidden rounded-full border border-orange-400/30 bg-black/40 px-3 py-1 font-mono text-xs text-orange-100 sm:inline">
          {address.slice(0, 6)}…{address.slice(-4)}
        </span>
        <button
          type="button"
          onClick={() => disconnect()}
          className="rounded-full border border-white/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-orange-100/70 hover:border-orange-400/40"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => connect({ connector: connectors[0] })}
      className={cn("ember-cta inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm uppercase tracking-wide")}
    >
      <Wallet className="size-4" />
      {isPending ? "Connecting…" : "Connect wallet"}
    </button>
  );
}
