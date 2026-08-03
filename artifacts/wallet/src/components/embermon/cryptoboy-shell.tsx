import { useCallback, useRef, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import type { PadButton } from "@/components/chain-invaders/engine";

/**
 * NiftyBoy handheld shell with oversized touch targets.
 * D-pad uses a single hit surface + zone detection (more reliable than 4 tiny buttons).
 */
export function NiftyBoyShell({
  children,
  onPad,
}: {
  children: ReactNode;
  onPad?: (button: PadButton, active: boolean) => void;
}) {
  const activeDirs = useRef(new Set<PadButton>());
  const held = useRef(new Set<PadButton>());

  const setDir = useCallback(
    (next: Set<PadButton>) => {
      const prev = activeDirs.current;
      for (const d of ["up", "down", "left", "right"] as const) {
        const was = prev.has(d);
        const now = next.has(d);
        if (was !== now) onPad?.(d, now);
      }
      activeDirs.current = next;
    },
    [onPad],
  );

  const dirsFromPoint = (el: HTMLElement, clientX: number, clientY: number) => {
    const rect = el.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width - 0.5;
    const y = (clientY - rect.top) / rect.height - 0.5;
    const next = new Set<PadButton>();
    // Deadzone in the center; generous axes outside it.
    const dead = 0.12;
    if (Math.abs(x) > dead || Math.abs(y) > dead) {
      if (Math.abs(x) >= Math.abs(y) * 0.55) {
        next.add(x < 0 ? "left" : "right");
      }
      if (Math.abs(y) >= Math.abs(x) * 0.55) {
        next.add(y < 0 ? "up" : "down");
      }
      // Allow diagonals when both axes are strong.
      if (Math.abs(x) > 0.22 && Math.abs(y) > 0.22) {
        next.add(x < 0 ? "left" : "right");
        next.add(y < 0 ? "up" : "down");
      }
    }
    return next;
  };

  const onDpadDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDir(dirsFromPoint(e.currentTarget, e.clientX, e.clientY));
  };

  const onDpadMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    setDir(dirsFromPoint(e.currentTarget, e.clientX, e.clientY));
  };

  const onDpadUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    setDir(new Set());
  };

  const hold = (button: PadButton, active: boolean) => {
    if (active) {
      if (held.current.has(button)) return;
      held.current.add(button);
      onPad?.(button, true);
    } else {
      if (!held.current.has(button)) return;
      held.current.delete(button);
      onPad?.(button, false);
    }
  };

  const buttonHandlers = (button: PadButton) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      e.currentTarget.classList.add("is-pressed");
      hold(button, true);
    },
    onPointerUp: (e: ReactPointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.currentTarget.classList.remove("is-pressed");
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      hold(button, false);
    },
    onPointerCancel: (e: ReactPointerEvent<HTMLButtonElement>) => {
      e.currentTarget.classList.remove("is-pressed");
      hold(button, false);
    },
    onLostPointerCapture: (e: ReactPointerEvent<HTMLButtonElement>) => {
      e.currentTarget.classList.remove("is-pressed");
      hold(button, false);
    },
  });

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
            role="group"
            aria-label="D-pad"
            onPointerDown={onDpadDown}
            onPointerMove={onDpadMove}
            onPointerUp={onDpadUp}
            onPointerCancel={onDpadUp}
            onContextMenu={(e) => e.preventDefault()}
          >
            <div className="embermon-dpad-visual" aria-hidden="true">
              <div className="embermon-dpad-center" />
            </div>
          </div>

          <div className="embermon-ab">
            <button
              type="button"
              className="embermon-btn b"
              aria-label="B"
              {...buttonHandlers("b")}
              onContextMenu={(e) => e.preventDefault()}
            >
              <span className="embermon-btn-face">B</span>
            </button>
            <button
              type="button"
              className="embermon-btn a"
              aria-label="A"
              {...buttonHandlers("a")}
              onContextMenu={(e) => e.preventDefault()}
            >
              <span className="embermon-btn-face">A</span>
            </button>
          </div>
        </div>

        <div className="embermon-handheld-start-row">
          <button
            type="button"
            className="embermon-option-btn"
            aria-label="Select"
            {...buttonHandlers("select")}
            onContextMenu={(e) => e.preventDefault()}
          >
            <span className="embermon-option-pill" />
            <span className="embermon-option-label">SELECT</span>
          </button>
          <button
            type="button"
            className="embermon-option-btn"
            aria-label="Start"
            {...buttonHandlers("start")}
            onContextMenu={(e) => e.preventDefault()}
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
