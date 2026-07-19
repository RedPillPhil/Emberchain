import { Construction, Gamepad2, Coins, Shield, Sparkles, ExternalLink } from "lucide-react";

export default function MercuryTalesPage() {
  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
  const gameUrl = BASE.replace(/\/wallet$/, "") + "/mercury-tales/";

  return (
    <div className="flex-1 overflow-y-auto p-8 flex flex-col items-center justify-start gap-8 bg-background min-h-full">

      {/* UNDER CONSTRUCTION banner */}
      <div className="w-full max-w-3xl border-2 border-yellow-500/60 bg-yellow-500/5 rounded-sm p-6 flex items-center gap-5">
        <Construction className="w-12 h-12 text-yellow-500 flex-shrink-0" />
        <div>
          <div className="text-yellow-400 font-display font-bold text-2xl tracking-widest uppercase">
            Under Construction
          </div>
          <div className="text-yellow-500/70 text-sm mt-1 font-sans">
            Mercury Tales is in early development. NFT and crypto integrations are not live yet — everything here is a preview of what's coming.
          </div>
        </div>
      </div>

      {/* Hero */}
      <div className="w-full max-w-3xl text-center flex flex-col items-center gap-3">
        <Gamepad2 className="w-14 h-14 text-primary" />
        <h1 className="font-display font-bold text-4xl text-foreground tracking-tight">Mercury Tales</h1>
        <p className="text-muted-foreground text-base max-w-xl leading-relaxed">
          A 2D side-scrolling platformer set on <span className="text-primary font-bold">Planet Scoria</span> — 
          a volcanic world where Iridium is the lifeblood of civilization and Baron Cinder's 
          Char Collectors lurk around every corner.
        </p>
        <a
          href={gameUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-2 bg-primary/10 border border-primary/40 hover:bg-primary/20 hover:border-primary/70 text-primary font-bold uppercase text-sm px-6 py-3 rounded-sm transition-all"
        >
          <Gamepad2 className="w-4 h-4" />
          Play Prototype (No Wallet Required)
          <ExternalLink className="w-3.5 h-3.5 opacity-60" />
        </a>
      </div>

      {/* Coming soon features */}
      <div className="w-full max-w-3xl grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          {
            icon: Coins,
            title: "$IRID Token",
            desc: "Earn Iridium in-game. Eventually withdraw to your wallet as a real ERC-20 token. 1,000,000 total supply — airdropped to EMBR holders at genesis.",
          },
          {
            icon: Sparkles,
            title: "NFT Characters",
            desc: "10 unique Genesis NFTs at launch, each with distinct abilities. Free players use the Ember Apprentice — NFT holders unlock the full roster.",
          },
          {
            icon: Shield,
            title: "On-Chain Progress",
            desc: "Level completions and rare achievements will settle lazily on-chain. No per-level transactions — batched sync keeps things fast and cheap.",
          },
        ].map(({ icon: Icon, title, desc }) => (
          <div key={title} className="border border-border bg-card rounded-sm p-5 flex flex-col gap-3 opacity-70">
            <div className="flex items-center gap-2 text-primary">
              <Icon className="w-5 h-5" />
              <span className="font-bold text-sm uppercase tracking-wider">{title}</span>
            </div>
            <p className="text-muted-foreground text-xs leading-relaxed">{desc}</p>
            <span className="text-[10px] font-bold uppercase tracking-widest text-yellow-500/80 border border-yellow-500/30 bg-yellow-500/5 px-2 py-0.5 rounded-sm self-start">
              Not Live Yet
            </span>
          </div>
        ))}
      </div>

      {/* Lore blurb */}
      <div className="w-full max-w-3xl border border-border bg-card/50 rounded-sm p-6">
        <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">World Lore</div>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Deep in the solar system, <strong className="text-foreground">Scoria</strong> burns. A Mercury-like planet 
          wrapped in volcanic fire, its surface littered with ancient ruins and lava rivers. 
          <strong className="text-foreground"> Iridium</strong> — the planet's rarest volcanic metal — once powered 
          a great civilization. Now <strong className="text-foreground">Baron Cinder</strong> and his army of 
          Char Collectors hoard it, enforcing tribute through fear. At the end of every level, 
          a Collector appears to steal 45% of your earnings. Only NFT Characters have the skills to fight back.
        </p>
      </div>

      <p className="text-muted-foreground/40 text-xs pb-4">
        Mercury Tales is a prototype. No real tokens, NFTs, or blockchain transactions are involved yet.
      </p>
    </div>
  );
}
