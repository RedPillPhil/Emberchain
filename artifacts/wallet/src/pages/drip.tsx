import { Shell } from "@/components/layout/shell";
import { Droplets, Flame } from "lucide-react";
import { Link } from "wouter";
import { useAirdropVisitConfirm } from "@/hooks/use-airdrop-visit";

export default function DripPage() {
  useAirdropVisitConfirm();

  return (
    <Shell>
      <div className="max-w-3xl">
        <div className="mb-2 inline-flex items-center gap-2 rounded-sm border border-primary/30 bg-primary/10 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-primary">
          <Droplets className="w-3.5 h-3.5" /> Ember Drip
        </div>
        <h1 className="text-4xl font-display font-bold uppercase tracking-tighter text-foreground mb-4">
          Mining Drip Faucet
        </h1>
        <p className="text-muted-foreground leading-relaxed mb-6">
          Ember Drip rewards active miners with bonus EMBR while the network bootstraps.
          Forge (mining) is live — run the browser miner or desktop node to earn block rewards
          and drip bonuses as the chain grows.
        </p>

        <div className="grid gap-4 sm:grid-cols-2 mb-8">
          <div className="border border-border bg-card/50 p-5 rounded-sm">
            <Flame className="w-8 h-8 text-primary mb-3" />
            <h3 className="font-display font-bold uppercase mb-2">Start mining</h3>
            <p className="text-sm text-muted-foreground mb-4">
              CPU proof-of-work on Emberchain — proportional pool payouts, no external operator.
            </p>
            <Link href="/mining" className="text-sm font-bold uppercase text-primary hover:underline">
              Open Forge →
            </Link>
          </div>
          <div className="border border-border bg-card/50 p-5 rounded-sm">
            <Droplets className="w-8 h-8 text-accent mb-3" />
            <h3 className="font-display font-bold uppercase mb-2">Airdrop task</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Visiting this page completes the Ember Drip airdrop task when you arrive from the campaign.
            </p>
            <a href="/airdrop/" className="text-sm font-bold uppercase text-primary hover:underline">
              Back to Airdrop →
            </a>
          </div>
        </div>
      </div>
    </Shell>
  );
}
