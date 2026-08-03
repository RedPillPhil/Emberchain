import type { ReactNode } from "react";
import { Shell } from "@/components/layout/shell";
import { FileText, Flame } from "lucide-react";

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-display font-bold uppercase tracking-wide text-primary border-l-4 border-primary pl-3">
        {title}
      </h2>
      <div className="text-sm text-muted-foreground font-sans leading-relaxed space-y-3 pl-1">
        {children}
      </div>
    </section>
  );
}

function SpecTable({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div className="border border-border rounded-sm overflow-hidden text-sm">
      <table className="w-full">
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label} className="border-b border-border/60 last:border-0">
              <td className="px-3 py-2 font-bold text-foreground bg-secondary/40 w-[38%] uppercase text-xs tracking-wide">
                {label}
              </td>
              <td className="px-3 py-2 text-muted-foreground">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function WhitepaperPage() {
  return (
    <Shell>
      <div className="max-w-3xl mx-auto space-y-10 pb-8">
        <header className="border-b border-border pb-8 space-y-3">
          <h1 className="text-4xl font-display font-bold uppercase tracking-tighter text-foreground flex items-center gap-3">
            <FileText className="w-8 h-8 text-primary" />
            Whitepaper
          </h1>
          <p className="text-muted-foreground font-sans text-sm uppercase tracking-widest font-bold">
            Emberchain (EMBR) — Technical Overview
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Emberchain is a mineable proof-of-work blockchain with a real EVM execution engine,
            a Monero-inspired shielded privacy pool, cross-chain bridges, and a built-in
            peer-to-peer escrow exchange — all accessible from a browser-based wallet.
          </p>
        </header>

        <Section title="Chain Specifications">
          <SpecTable
            rows={[
              ["Name", "Emberchain"],
              ["Ticker", "EMBR"],
              ["Algorithm", "Keccak256 (CPU-friendly PoW)"],
              ["Block reward", "5 EMBR per block"],
              ["Target block time", "8 seconds"],
              ["Difficulty", "Retargets every block (±25% clamp)"],
              ["Supply", "Fully mined — no premine, no ICO, no dev fund"],
              ["Chain ID", "7773 (0x1e5d)"],
              ["Address format", "Standard 0x Ethereum-style (secp256k1)"],
              ["EVM", "EthereumJS — Cancun hardfork opcodes"],
            ]}
          />
        </Section>

        <Section title="Mining & Proportional Payouts">
          <p>
            Miners find a nonce such that{" "}
            <code className="text-primary text-xs bg-primary/10 px-1 py-0.5 rounded">
              keccak256(blockHeader) ≤ target
            </code>
            . There is no DAG, no GPU requirement — pure CPU work accessible from a browser
            WebWorker or a lightweight external script.
          </p>
          <p>
            Block rewards are <strong className="text-foreground">not</strong> winner-takes-all.
            Every miner who submits a valid share during the round earns a cut proportional to
            their share count when the block lands. The template exposes a{" "}
            <code className="text-primary text-xs bg-primary/10 px-1 py-0.5 rounded">shareTarget</code>{" "}
            64× easier than the full block target — roughly 64 shares per block on average.
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>No external pool operator — the pool lives inside the chain engine</li>
            <li>No pool fee — 100% of the block reward goes to miners, split by shares</li>
            <li>Payout breakdown visible in the block explorer for every block</li>
          </ul>
        </Section>

        <Section title="Privacy — Shielded Pool">
          <p>
            Public EMBR can be shielded, transferred privately, and unshielded back. During the
            private leg, sender, recipient, and amount are hidden on-chain.
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong className="text-foreground">Stealth addresses</strong> — ECDH one-time keys per payment</li>
            <li><strong className="text-foreground">Pedersen commitments</strong> — amounts never stored in plaintext</li>
            <li><strong className="text-foreground">LSAG ring signatures</strong> — sender anonymity via decoy notes</li>
            <li><strong className="text-foreground">Key images</strong> — double-spend prevention without revealing which note was spent</li>
          </ul>
          <p className="text-xs italic">
            Shield and unshield boundaries remain visible (same design as Zcash t↔z). Anonymity
            set grows with usage.
          </p>
        </Section>

        <Section title="Cross-Chain & DeFi">
          <p>
            <strong className="text-foreground">EmberSwap</strong> bridges native EMBR to wEMBR on
            Base mainnet via lock-and-mint contracts. <strong className="text-foreground">Ember Delta</strong>{" "}
            is a DEX for wEMBR/ETH trading on Base. Token launches can deploy bridged assets
            through the universal bridge.
          </p>
          <p>
            The <strong className="text-foreground">P2P escrow exchange</strong> lets sellers lock
            EMBR on-chain and accept payment in ETH, USDT, USDC, BTC, or SOL across multiple
            networks. The chain verifies external payments via RPC before releasing escrow —
            no intermediary, no KYC.
          </p>
        </Section>

        <Section title="NiftyMon & Chain Invaders">
          <p>
            <strong className="text-foreground">NiftyMon</strong> is an upcoming monster-collecting
            MMO (nifties = NFTs) set in the Emberchain wasteland — played on{" "}
            <strong className="text-foreground">NiftyVision</strong> (desktop) or the{" "}
            <strong className="text-foreground">NiftyBoy</strong> handheld shell (mobile).
          </p>
          <p>
            <strong className="text-foreground">Chain Invaders</strong> is a live arcade mini-game
            with a daily 500 EMBR jackpot (noon–8pm Eastern):{" "}
            <strong className="text-foreground">75%</strong> to highest cumulative score,{" "}
            <strong className="text-foreground">25%</strong> to highest single run. Scores are
            secured with <strong className="text-foreground">commit–reveal</strong> plus{" "}
            <strong className="text-foreground">ECDSA signatures</strong> from the game server —
            players cannot forge rewards without the server key.
          </p>
        </Section>

        <Section title="Technical Stack">
          <ul className="list-disc pl-5 space-y-1">
            <li><strong className="text-foreground">Consensus:</strong> Custom Keccak256 PoW, per-block difficulty</li>
            <li><strong className="text-foreground">EVM:</strong> EthereumJS SimpleStateManager</li>
            <li><strong className="text-foreground">Cryptography:</strong> ethereum-cryptography, @noble/curves</li>
            <li><strong className="text-foreground">API:</strong> Express REST + Ethereum JSON-RPC 2.0</li>
            <li><strong className="text-foreground">Frontend:</strong> React, Vite, TanStack Query</li>
          </ul>
        </Section>

        <Section title="Roadmap Highlights">
          <ul className="space-y-2">
            {[
              "Keccak256 PoW with proportional share pool",
              "Browser & external CPU mining",
              "EVM smart contract deployment",
              "Monero-style shielded pool",
              "Multi-chain P2P escrow exchange",
              "EmberSwap bridge (EMBR ↔ wEMBR on Base)",
              "Ember Delta DEX",
              "NiftyMon MMO launch",
              "Chain Invaders daily jackpot arcade",
              "Bulletproofs / ZK range proofs for shielded amounts",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <Flame className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </Section>

        <footer className="text-xs text-muted-foreground border-t border-border pt-6">
          Emberchain — mine from your browser, shield your transactions, trade peer-to-peer.
          No premine. No ICO.
        </footer>
      </div>
    </Shell>
  );
}
