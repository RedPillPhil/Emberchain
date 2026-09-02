import { Shell } from "@/components/layout/shell";
import { Music2 } from "lucide-react";
import { useAirdropVisitConfirm } from "@/hooks/use-airdrop-visit";

export default function NiftyTracksPage() {
  useAirdropVisitConfirm();

  return (
    <Shell>
      <div className="max-w-3xl">
        <div className="mb-2 inline-flex items-center gap-2 rounded-sm border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-400">
          <Music2 className="w-3.5 h-3.5" /> NiftyTracks
          <span className="text-amber-300/90">(DEMO)</span>
        </div>
        <h1 className="text-4xl font-display font-bold uppercase tracking-tighter text-foreground mb-4">
          NiftyTracks
        </h1>
        <p className="text-muted-foreground leading-relaxed mb-6">
          Preview the NiftyTracks music NFT experience on Emberchain. This demo showcases
          on-chain track metadata, artist royalties, and wallet-gated streaming — full launch
          follows the November liquidity event.
        </p>

        <div className="border border-dashed border-amber-500/30 bg-amber-500/5 rounded-sm p-8 text-center">
          <Music2 className="w-12 h-12 text-amber-400/60 mx-auto mb-4" />
          <p className="font-display font-bold uppercase text-amber-400/90 mb-2">Demo preview</p>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Browse curated demo tracks, connect your wallet, and explore the UI shell.
            Production catalog and minting go live after liquidity is added on November 1st.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {["Neon Forge", "Block Reward", "Privacy Pool"].map((track) => (
              <div
                key={track}
                className="px-4 py-3 border border-border bg-card/40 rounded-sm text-left min-w-[140px]"
              >
                <p className="text-xs font-bold uppercase text-foreground">{track}</p>
                <p className="text-[10px] text-muted-foreground mt-1">Demo · 3:42</p>
              </div>
            ))}
          </div>
        </div>

        <p className="mt-6 text-sm text-muted-foreground">
          Completing this visit counts toward your{" "}
          <a href="/airdrop/" className="text-primary hover:underline">Ember Airdrop</a> tasks.
        </p>
      </div>
    </Shell>
  );
}
