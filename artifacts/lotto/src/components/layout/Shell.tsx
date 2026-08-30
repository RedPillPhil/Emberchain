import type { ReactNode } from 'react';
import { Flame, Ticket, Wallet } from 'lucide-react';
import { useEmbrWallet } from '@/lib/embr-wallet';
import { shortAddress } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export function Shell({ children }: { children: ReactNode }) {
  const { activeWallet, isLoaded } = useEmbrWallet();

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      <header className="border-b border-border bg-card/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <a href="/lotto/" className="flex items-center gap-2 font-bold text-foreground hover:text-primary transition-colors">
            <div className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/40 flex items-center justify-center text-primary">
              <Ticket className="w-4 h-4" />
            </div>
            <span>Ember Lotto</span>
          </a>

          <nav className="hidden sm:flex items-center gap-4 text-sm text-muted-foreground">
            <a href="/" className="hover:text-foreground flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5" />
              Emberchain
            </a>
            <a href="/wallet" className="hover:text-foreground">Web Wallet</a>
          </nav>

          <div className="flex items-center gap-2">
            {!isLoaded ? (
              <span className="text-xs text-muted-foreground">Loading…</span>
            ) : activeWallet ? (
              <div className="flex items-center gap-2 text-xs font-mono bg-secondary border border-border rounded-md px-3 py-2">
                <Wallet className="w-3.5 h-3.5 text-primary" />
                {shortAddress(activeWallet.address, 5)}
              </div>
            ) : (
              <Button asChild size="sm">
                <a href="/wallet/setup">Connect Wallet</a>
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        Ember Lotto · Pay in native EMBR on Emberchain ·{' '}
        <a href="/lotto/" className="text-primary hover:underline">emberchain.org/lotto</a>
      </footer>
    </div>
  );
}
