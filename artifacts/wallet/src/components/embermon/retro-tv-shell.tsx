import type { ReactNode } from "react";

export function RetroTvShell({ children }: { children: ReactNode }) {
  return (
    <div className="embermon-stage embermon-tv-stage">
      <div className="embermon-tv-set">
        <div className="embermon-tv-bezel">
          <div className="embermon-tv-screen-well">
            <div className="embermon-tv-glass">{children}</div>
          </div>
          <div className="embermon-tv-brand">EMBERMON</div>
          <div className="embermon-tv-controls">
            <span className="embermon-tv-knob" />
            <span className="embermon-tv-knob" />
            <span className="embermon-tv-led" />
          </div>
        </div>
        <div className="embermon-tv-stand" />
      </div>
    </div>
  );
}
