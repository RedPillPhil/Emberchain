import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, ExternalLink } from "lucide-react";
import { ScrollSyncCanvas } from "@/components/landing/scroll-sync-canvas";
import { LogoFieldCanvas } from "@/components/landing/logo-field-canvas";
import { BlockHeightCounter } from "@/components/landing/block-counter";
import { LegoBlockchainSection } from "@/components/landing/lego-section";
import { chainNodeApi } from "@/lib/config";
import "@/components/landing/landing.css";

type ChainStatus = {
  height?: number;
  difficulty?: string;
  targetBlockTimeSeconds?: number;
  avgBlockTime?: number;
  pendingTransactionCount?: number;
};

const WEMBR_ADDRESS = "0x9362587019Ea0e4ef90fbd981c615d4441D9D2c4";
const GITHUB = "https://github.com/RedPillPhil/Emberchain";

export default function LandingPage() {
  const [status, setStatus] = useState<ChainStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(chainNodeApi("/api/chain/status"));
        if (!res.ok) return;
        const data = (await res.json()) as ChainStatus;
        if (!cancelled) setStatus(data);
      } catch {
        /* offline — stats show placeholders */
      }
    };
    load();
    const id = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="landing-root">
      <ScrollSyncCanvas />

      <nav className="landing-nav">
        <a href="/" className="landing-nav-brand">
          <img src="/ember-coin.svg" alt="" width={28} height={28} />
          Emberchain
        </a>
        <div className="landing-nav-links">
          <a href="#about">About</a>
          <a href="#tokens">Token</a>
          <a href="#how-it-works">Technology</a>
          <a href="#ecosystem">Ecosystem</a>
          <a href="#team">Team</a>
        </div>
        <Link href="/wallet" className="landing-nav-cta">
          Web Wallet
        </Link>
      </nav>

      <header className="landing-hero">
        <LogoFieldCanvas />
        <div className="landing-hero-inner">
          <p className="landing-kicker">Privacy-native · Mineable · EVM</p>
          <h1 className="landing-hero-title">
            The blockchain<br />
            <span>forged in fire</span>
          </h1>
          <p className="landing-hero-sub">
            Emberchain is a proof-of-work smart contract chain with browser mining,
            zero-knowledge privacy, and a full DeFi stack bridged to Base. No premine.
            No ICO. Open source.
          </p>
          <Link href="/wallet" className="landing-hero-cta">
            Enter Ember Web Wallet
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
        <p className="landing-scroll-hint">Scroll to explore</p>
      </header>

      <section className="landing-stats" aria-label="Live network statistics">
        <div className="landing-stats-grid">
          <div>
            <p className="landing-stats-label">Live block height</p>
            <BlockHeightCounter value={status?.height ?? null} />
          </div>
          <div className="landing-stat-cards">
            <div className="landing-stat-card">
              <strong>
                {status?.avgBlockTime != null
                  ? `${status.avgBlockTime.toFixed(1)}s`
                  : status?.targetBlockTimeSeconds != null
                    ? `${status.targetBlockTimeSeconds}s`
                    : "8s"}
              </strong>
              <span>Avg block time</span>
            </div>
            <div className="landing-stat-card">
              <strong>7773</strong>
              <span>Chain ID</span>
            </div>
            <div className="landing-stat-card">
              <strong>5</strong>
              <span>EMBR / block</span>
            </div>
            <div className="landing-stat-card">
              <strong>{status?.pendingTransactionCount ?? "—"}</strong>
              <span>Pending txs</span>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-section" id="about">
        <p className="landing-kicker">About Emberchain</p>
        <h2 className="landing-section-title">A public L1 you can mine from your browser</h2>
        <p className="landing-body">
          Emberchain launched as a fully open, community-mined network. There was no premine,
          no venture allocation, and no gatekeeper pool — every EMBR in circulation was earned
          through proof-of-work or transferred on-chain. The chain runs an Ethereum-compatible
          virtual machine, supports shielded balances via a Monero-inspired privacy pool, and
          ships with native apps for mining, trading, and cross-chain bridging.
        </p>
        <p className="landing-body" style={{ marginTop: "1rem" }}>
          This site is the official home of Emberchain. Use the{" "}
          <Link href="/wallet" className="text-[#ffb020] hover:underline">web wallet</Link> to
          create or import a key, mine EMBR, explore the ledger, and interact with contracts.
          No account signup is required to learn about the project — everything on this page is
          publicly accessible.
        </p>
      </section>

      <LegoBlockchainSection />

      <section className="landing-section" id="tokens">
        <p className="landing-kicker">Token information</p>
        <h2 className="landing-section-title">EMBR &amp; wEMBR</h2>
        <p className="landing-body">
          Native EMBR lives on Emberchain (chain ID 7773). Wrapped EMBR (wEMBR) is an ERC-20 on
          Base mainnet, minted 1:1 when EMBR is locked in the EmberBridge contract. wEMBR powers
          liquidity on EmberSwap and Ember Delta.
        </p>
        <div className="landing-token-grid">
          <div className="landing-token-card">
            <h3>EMBR (native)</h3>
            <dl>
              <div className="landing-spec-row">
                <dt>Network</dt>
                <dd>Emberchain mainnet</dd>
              </div>
              <div className="landing-spec-row">
                <dt>Chain ID</dt>
                <dd>7773 (0x1E5D)</dd>
              </div>
              <div className="landing-spec-row">
                <dt>Symbol</dt>
                <dd>EMBR</dd>
              </div>
              <div className="landing-spec-row">
                <dt>Decimals</dt>
                <dd>18</dd>
              </div>
              <div className="landing-spec-row">
                <dt>Block reward</dt>
                <dd>5 EMBR</dd>
              </div>
              <div className="landing-spec-row">
                <dt>Algorithm</dt>
                <dd>Keccak256 PoW (CPU)</dd>
              </div>
              <div className="landing-spec-row">
                <dt>Explorer</dt>
                <dd><Link href="/ledger">emberchain.org/ledger</Link></dd>
              </div>
            </dl>
          </div>
          <div className="landing-token-card">
            <h3>wEMBR (Base)</h3>
            <dl>
              <div className="landing-spec-row">
                <dt>Network</dt>
                <dd>Base mainnet</dd>
              </div>
              <div className="landing-spec-row">
                <dt>Chain ID</dt>
                <dd>8453</dd>
              </div>
              <div className="landing-spec-row">
                <dt>Contract</dt>
                <dd>
                  <a
                    href={`https://basescan.org/token/${WEMBR_ADDRESS}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {WEMBR_ADDRESS.slice(0, 10)}…{WEMBR_ADDRESS.slice(-8)}
                  </a>
                </dd>
              </div>
              <div className="landing-spec-row">
                <dt>Symbol</dt>
                <dd>wEMBR</dd>
              </div>
              <div className="landing-spec-row">
                <dt>Decimals</dt>
                <dd>18</dd>
              </div>
              <div className="landing-spec-row">
                <dt>Bridge</dt>
                <dd>1:1 lock/mint via EmberBridge</dd>
              </div>
              <div className="landing-spec-row">
                <dt>Logo</dt>
                <dd><a href="/ember-coin.svg">emberchain.org/ember-coin.svg</a></dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      <section className="landing-section" id="ecosystem">
        <p className="landing-kicker">Ecosystem</p>
        <h2 className="landing-section-title">Built on Ember</h2>
        <div className="landing-eco-grid">
          <Link href="/wallet" className="landing-eco-card">
            <h4>Web Wallet</h4>
            <p>Create keys, send EMBR, mine from the browser, and explore blocks &amp; transactions.</p>
          </Link>
          <Link href="/emberswap" className="landing-eco-card">
            <h4>EmberSwap</h4>
            <p>Bridge EMBR ↔ wEMBR and swap on Base with auto-liquidity fee routing.</p>
          </Link>
          <a href="/ember-delta/" className="landing-eco-card">
            <h4>Ember Delta</h4>
            <p>Order-book DEX for wEMBR/ETH and custom token pairs on Base.</p>
          </a>
          <Link href="/mining" className="landing-eco-card">
            <h4>Forge (Mining)</h4>
            <p>CPU mining with proportional pool payouts — no external pool operator.</p>
          </Link>
          <Link href="/privacy" className="landing-eco-card">
            <h4>Privacy Pool</h4>
            <p>Shield and unshield EMBR with zero-knowledge proofs.</p>
          </Link>
          <Link href="/whitepaper" className="landing-eco-card">
            <h4>Whitepaper</h4>
            <p>Technical overview: consensus, EVM, privacy, bridges, and tokenomics.</p>
          </Link>
        </div>
      </section>

      <section className="landing-section" id="team">
        <p className="landing-kicker">Project &amp; contact</p>
        <h2 className="landing-section-title">Open source &amp; transparent</h2>
        <p className="landing-body">
          Emberchain is maintained in the open. Source code, contract addresses, and release
          artifacts are published on GitHub. For token listing inquiries and official
          correspondence, use the project email on the same domain as this website.
        </p>
        <div className="landing-team-grid">
          <div className="landing-team-card">
            <h4>Lead maintainer</h4>
            <p>
              <a href={GITHUB} target="_blank" rel="noreferrer">
                RedPillPhil / Emberchain on GitHub
              </a>
              <br />
              Full source, releases, and contribution history.
            </p>
          </div>
          <div className="landing-team-card">
            <h4>Official contact</h4>
            <p>
              <a href="mailto:hello@emberchain.org">hello@emberchain.org</a>
              <br />
              Website: <a href="https://emberchain.org">emberchain.org</a>
            </p>
          </div>
          <div className="landing-team-card">
            <h4>Documentation</h4>
            <p>
              <Link href="/whitepaper">Whitepaper</Link>
              {" · "}
              <Link href="/downloads">Downloads</Link>
              {" · "}
              <Link href="/ledger">Block explorer</Link>
            </p>
          </div>
          <div className="landing-team-card">
            <h4>Community</h4>
            <p>
              <Link href="/community">Community hub</Link>
              {" · "}
              <a href="https://x.com/emberchainorg" target="_blank" rel="noreferrer">
                @emberchainorg
              </a>
            </p>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-footer-links">
          <Link href="/wallet">Web Wallet</Link>
          <Link href="/whitepaper">Whitepaper</Link>
          <Link href="/ledger">Explorer</Link>
          <a href={GITHUB} target="_blank" rel="noreferrer">
            GitHub <ExternalLink className="inline w-3 h-3" />
          </a>
          <a href={`https://basescan.org/token/${WEMBR_ADDRESS}`} target="_blank" rel="noreferrer">
            wEMBR on BaseScan
          </a>
        </div>
        <p>© {new Date().getFullYear()} Emberchain — EMBR · Chain ID 7773 · No premine</p>
      </footer>
    </div>
  );
}
