import React, { useMemo } from 'react';

interface TokenIconProps {
  symbol: string;
  size?: number;
}

export function TokenIcon({ symbol, size = 24 }: TokenIconProps) {
  const { color1, color2, initials } = useMemo(() => {
    // Generate deterministic colors from symbol string
    let hash = 0;
    for (let i = 0; i < symbol.length; i++) {
      hash = symbol.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    const h1 = Math.abs(hash) % 360;
    const h2 = (h1 + 40) % 360;
    
    const cleanSymbol = symbol.replace(/^w/, '');
    const initials = (symbol.startsWith('w') ? 'w' : '') + cleanSymbol.charAt(0);
    
    return {
      color1: `hsl(${h1}, 70%, 45%)`,
      color2: `hsl(${h2}, 80%, 35%)`,
      initials
    };
  }, [symbol]);

  return (
    <div
      className="flex items-center justify-center rounded-full text-white font-bold shrink-0"
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, size * 0.4),
        background: `linear-gradient(135deg, ${color1} 0%, ${color2} 100%)`,
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.1)'
      }}
      title={symbol}
    >
      {initials}
    </div>
  );
}
