import React, { useState } from "react";
import { Sidebar, MobileNav } from "./sidebar";
import { useActiveWallet } from "@/hooks/use-active-wallet";
import { Redirect } from "wouter";

export function Shell({ children, requireWallet = true }: { children: React.ReactNode, requireWallet?: boolean }) {
  const { activeWallet, isLoaded } = useActiveWallet();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center font-sans text-primary">
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
          IGNITING FORGE...
        </div>
      </div>
    );
  }

  if (requireWallet && !activeWallet) {
    return <Redirect to="/setup" />;
  }

  if (location.pathname === '/setup' && activeWallet) {
    return <Redirect to="/wallet" />;
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground scanline">
      {activeWallet && <Sidebar />}
      <div className="flex-1 flex flex-col min-w-0 h-[100dvh]">
        {activeWallet && <MobileNav open={mobileOpen} onOpenChange={setMobileOpen} />}
        <main className="flex-1 flex flex-col overflow-y-auto bg-noise relative min-h-0">
          <div className="flex-1 container max-w-5xl mx-auto py-4 md:py-8 px-4 sm:px-6 lg:px-12 flex flex-col gap-4 md:gap-8 relative z-10">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
