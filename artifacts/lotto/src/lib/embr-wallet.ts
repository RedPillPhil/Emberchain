import { useEffect, useState } from 'react';

/** Same localStorage key as artifacts/wallet — shared when embedded at /lotto/ */
export interface EmbrWallet {
  address: string;
  privateKey: string;
}

const WALLET_KEY = 'emberchain_active_wallet';

export function useEmbrWallet() {
  const [activeWallet, setActiveWallet] = useState<EmbrWallet | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const read = () => {
      try {
        const stored = localStorage.getItem(WALLET_KEY);
        setActiveWallet(stored ? (JSON.parse(stored) as EmbrWallet) : null);
      } catch {
        setActiveWallet(null);
      } finally {
        setIsLoaded(true);
      }
    };
    read();
    window.addEventListener('wallet-changed', read);
    window.addEventListener('storage', read);
    return () => {
      window.removeEventListener('wallet-changed', read);
      window.removeEventListener('storage', read);
    };
  }, []);

  return { activeWallet, isLoaded };
}
