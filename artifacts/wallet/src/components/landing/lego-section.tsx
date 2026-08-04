import { COLORS } from "./lego-constants";

/** Lego-blockchain inspired robot: tosses a contract, blocks shield him, cycle repeats. */
export function LegoBlockchainSection() {
  return (
    <section className="landing-lego-section" id="how-it-works">
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
          <div className="landing-lego-cycle" aria-hidden>
            <div className="landing-contract-paper">
              <span>CONTRACT</span>
            </div>

            <div className="landing-robot">
              <div className="landing-robot-head">
                <div className="landing-robot-eye left" />
                <div className="landing-robot-eye right" />
                <div className="landing-robot-antenna" />
              </div>
              <div className="landing-robot-body">
                <div className="landing-robot-core" />
              </div>
              <div className="landing-robot-arm left" />
              <div className="landing-robot-arm right landing-robot-arm-throw" />
              <div className="landing-robot-wheel" />
            </div>

            <div className="landing-lego-blocks-static">
              {COLORS.map((color, i) => (
                <div
                  key={color}
                  className={`landing-lego-block is-${color}`}
                  style={{ animationDelay: `${1.2 + i * 0.45}s` }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
