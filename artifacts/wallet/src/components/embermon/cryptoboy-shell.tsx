import type { ReactNode } from "react";

export function CryptoboyShell({ children }: { children: ReactNode }) {
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
            <span className="product">EMBERMON</span>
          </div>
        </div>

        <div className="embermon-handheld-controls">
          <div className="embermon-dpad" aria-hidden="true">
            <div className="embermon-dpad-center" />
          </div>
          <div className="embermon-ab">
            <span className="embermon-btn b">B</span>
            <span className="embermon-btn a">A</span>
          </div>
        </div>

        <div className="embermon-handheld-start-row">
          <span>SELECT</span>
          <span>START</span>
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
