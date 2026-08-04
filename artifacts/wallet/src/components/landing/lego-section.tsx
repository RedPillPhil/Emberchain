import { useEffect, useRef } from "react";

import { COLORS } from "./lego-constants";

const MAX_BLOCKS = 8;
const SPAWN_MS = 900;
const SHIELD_HOLD_MS = 2200;

/** Lego-blockchain inspired robot + stacking blocks that shield him, then reset. */
export function LegoBlockchainSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const blocksRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const container = blocksRef.current;
    if (!section || !container) return;

    let spawnTimer: ReturnType<typeof setInterval> | null = null;
    let resetTimer: ReturnType<typeof setTimeout> | null = null;
    let exitTimer: ReturnType<typeof setTimeout> | null = null;
    let count = 0;
    let visible = false;

    const clearSpawnTimer = () => {
      if (spawnTimer) {
        clearInterval(spawnTimer);
        spawnTimer = null;
      }
    };

    const clearResetTimers = () => {
      if (resetTimer) {
        clearTimeout(resetTimer);
        resetTimer = null;
      }
      if (exitTimer) {
        clearTimeout(exitTimer);
        exitTimer = null;
      }
    };

    const spawnBlock = () => {
      if (count >= MAX_BLOCKS) return;

      const color = COLORS[Math.floor(Math.random() * COLORS.length)];
      const el = document.createElement("div");
      el.className = `landing-lego-block is-${color}`;
      el.style.animationDelay = `${count * 0.08}s`;
      container.appendChild(el);
      count++;

      if (count >= MAX_BLOCKS) {
        clearSpawnTimer();
        resetTimer = setTimeout(() => {
          const blocks = container.querySelectorAll(".landing-lego-block");
          blocks.forEach((block, i) => {
            block.classList.add("is-exiting");
            (block as HTMLElement).style.animationDelay = `${i * 0.06}s`;
          });

          exitTimer = setTimeout(() => {
            container.replaceChildren();
            count = 0;
            if (visible) {
              spawnBlock();
              spawnTimer = setInterval(spawnBlock, SPAWN_MS);
            }
          }, blocks.length * 60 + 520);
        }, SHIELD_HOLD_MS);
      }
    };

    const startCycle = () => {
      if (spawnTimer || resetTimer) return;
      spawnBlock();
      spawnTimer = setInterval(spawnBlock, SPAWN_MS);
    };

    const stopCycle = () => {
      clearSpawnTimer();
      clearResetTimers();
      container.replaceChildren();
      count = 0;
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible) startCycle();
        else stopCycle();
      },
      { threshold: 0.25 },
    );
    observer.observe(section);

    return () => {
      observer.disconnect();
      stopCycle();
    };
  }, []);

  return (
    <section ref={sectionRef} className="landing-lego-section" id="how-it-works">
      <div className="landing-lego-grid">
        <div className="landing-lego-copy">
          <p className="landing-kicker">Proof of Work · EVM · Privacy</p>
          <h2 className="landing-section-title">Deploy in the open.<br />Shield what matters.</h2>
          <p className="landing-body">
            Emberchain combines CPU-friendly Keccak256 mining with a full Ethereum-compatible
            execution layer. Smart contracts run in plain view — then optional shielded balances
            hide sender, recipient, and amount inside a Monero-inspired privacy pool.
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
