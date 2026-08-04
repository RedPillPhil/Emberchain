import { useEffect, useRef } from "react";

const COLORS = ["ember", "heat", "forge", "ash", "coal"] as const;

/** Lego-blockchain inspired robot + stacking blocks section. */
export function LegoBlockchainSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const blocksRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const container = blocksRef.current;
    if (!section || !container) return;

    let interval: ReturnType<typeof setInterval> | null = null;
    let count = 0;

    const spawnBlock = () => {
      if (count >= 8) return;
      const color = COLORS[Math.floor(Math.random() * COLORS.length)];
      const el = document.createElement("div");
      el.className = `landing-lego-block is-${color}`;
      el.style.animationDelay = `${count * 0.08}s`;
      container.appendChild(el);
      count++;
      if (count >= 8 && interval) clearInterval(interval);
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !interval) {
          spawnBlock();
          interval = setInterval(spawnBlock, 900);
        }
      },
      { threshold: 0.25 },
    );
    observer.observe(section);

    return () => {
      observer.disconnect();
      if (interval) clearInterval(interval);
    };
  }, []);

  return (
    <section ref={sectionRef} className="landing-lego-section" id="how-it-works">
      <div className="landing-lego-grid">
        <div className="landing-lego-copy">
          <p className="landing-kicker">Proof of Work · EVM · Privacy</p>
          <h2 className="landing-section-title">Blocks forged in the open.<br />Assets shielded in the dark.</h2>
          <p className="landing-body">
            Emberchain combines CPU-friendly Keccak256 mining with a full Ethereum-compatible
            execution layer. Every block is validated on-chain, every miner earns proportionally,
            and optional zero-knowledge shielding keeps sensitive balances private.
          </p>
          <ul className="landing-feature-list">
            <li>5 EMBR block reward · ~8s target block time</li>
            <li>Built-in mining pool — no external operator</li>
            <li>Bridge to Base as wEMBR for DeFi on EmberSwap &amp; Ember Delta</li>
          </ul>
        </div>

        <div className="landing-lego-stage">
          <div className="landing-robot" aria-hidden>
            <div className="landing-robot-head">
              <div className="landing-robot-eye left" />
              <div className="landing-robot-eye right" />
              <div className="landing-robot-antenna" />
            </div>
            <div className="landing-robot-body">
              <div className="landing-robot-core" />
            </div>
            <div className="landing-robot-arm left" />
            <div className="landing-robot-arm right" />
            <div className="landing-robot-wheel" />
          </div>
          <div ref={blocksRef} className="landing-lego-blocks" />
        </div>
      </div>
    </section>
  );
}
