import { useEffect, useRef, useState } from "react";

/** Modular flip-style counter inspired by modular-counter-css-only. */
export function BlockHeightCounter({ value }: { value: number | null }) {
  const digits = value != null ? String(value).split("") : ["—"];
  const [flipKey, setFlipKey] = useState(0);
  const prev = useRef(value);

  useEffect(() => {
    if (value != null && value !== prev.current) {
      setFlipKey((k) => k + 1);
      prev.current = value;
    }
  }, [value]);

  return (
    <div className="landing-counter" aria-label={value != null ? `Block height ${value}` : "Loading block height"}>
      {digits.map((d, i) => (
        <span key={`${i}-${flipKey}`} className="landing-counter-digit" data-digit={d}>
          <span className="landing-counter-face">{d}</span>
        </span>
      ))}
    </div>
  );
}
