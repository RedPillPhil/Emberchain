import type { ReactNode } from "react";
import type { PadButton } from "@/components/chain-invaders/engine";

function bindPress(
  el: HTMLElement,
  button: PadButton,
  onPad?: (button: PadButton, active: boolean) => void,
) {
  let pressed = false;
  const down = (event: PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (pressed) return;
    pressed = true;
    el.setPointerCapture?.(event.pointerId);
    el.classList.add("is-pressed");
    onPad?.(button, true);
  };
  const up = (event: PointerEvent) => {
    event.preventDefault();
    if (!pressed) return;
    pressed = false;
    try {
      el.releasePointerCapture?.(event.pointerId);
    } catch {
      /* ignore */
    }
    el.classList.remove("is-pressed");
    onPad?.(button, false);
  };
  el.addEventListener("pointerdown", down);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);
}

export function NiftyBoyShell({
  children,
  onPad,
}: {
  children: ReactNode;
  onPad?: (button: PadButton, active: boolean) => void;
}) {
  return (
    <div className="embermon-stage embermon-handheld-stage">
      <div className="embermon-handheld">
        <div className="embermon-handheld-top">
          <span>◁ OFF·ON ▷</span>
        </div>

        <div className="embermon-handheld-screen-block">
          <div className="embermon-handheld-crystal">
            <div className="embermon-handheld-crystal-label">DOT MATRIX WITH STEREO SOUND</div>
            <div className="embermon-handheld-lcd">{children}</div>
            <div className="embermon-handheld-battery">
              <span className="embermon-handheld-led" />
              BATTERY
            </div>
          </div>
          <div className="embermon-handheld-brand">
            <span className="company">Emberchain</span>
            <span className="product">NIFTY BOY</span>
          </div>
        </div>

        <div className="embermon-handheld-controls">
          <div
            className="embermon-dpad"
            ref={(node) => {
              if (!node || node.dataset.bound) return;
              node.dataset.bound = "1";
              for (const dir of ["up", "down", "left", "right"] as const) {
                const hit = node.querySelector(`.hit.${dir}`);
                if (hit instanceof HTMLElement) bindPress(hit, dir, onPad);
              }
            }}
          >
            <div className="embermon-dpad-center" />
            <button type="button" className="hit up" aria-label="Up" />
            <button type="button" className="hit down" aria-label="Down" />
            <button type="button" className="hit left" aria-label="Left" />
            <button type="button" className="hit right" aria-label="Right" />
          </div>
          <div className="embermon-ab">
            <button
              type="button"
              className="embermon-btn b"
              aria-label="B"
              ref={(node) => {
                if (!node || node.dataset.bound) return;
                node.dataset.bound = "1";
                bindPress(node, "b", onPad);
              }}
            >
              B
            </button>
            <button
              type="button"
              className="embermon-btn a"
              aria-label="A"
              ref={(node) => {
                if (!node || node.dataset.bound) return;
                node.dataset.bound = "1";
                bindPress(node, "a", onPad);
              }}
            >
              A
            </button>
          </div>
        </div>

        <div className="embermon-handheld-start-row">
          <button
            type="button"
            className="embermon-option-btn"
            aria-label="Select"
            ref={(node) => {
              if (!node || node.dataset.bound) return;
              node.dataset.bound = "1";
              bindPress(node, "select", onPad);
            }}
          >
            <span className="embermon-option-pill" />
            <span className="embermon-option-label">SELECT</span>
          </button>
          <button
            type="button"
            className="embermon-option-btn"
            aria-label="Start"
            ref={(node) => {
              if (!node || node.dataset.bound) return;
              node.dataset.bound = "1";
              bindPress(node, "start", onPad);
            }}
          >
            <span className="embermon-option-pill" />
            <span className="embermon-option-label">START</span>
          </button>
        </div>

        <div className="embermon-handheld-speaker" aria-hidden="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <span key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
