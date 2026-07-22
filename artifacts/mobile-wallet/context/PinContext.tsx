/**
 * PinContext — manages PIN-lock state.
 *
 * On foreground restore (background → active) the wallet locks itself
 * if a PIN has been set. A PinLock overlay is rendered by _layout.tsx
 * when isLocked is true.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';
import {
  getPinEnabled,
  setPin,
  verifyPin,
  clearPin,
} from '@/lib/pinStorage';

interface PinCtx {
  isPinEnabled: boolean;
  isLocked: boolean;
  /** Called from the lock screen when the user enters their PIN. */
  unlock: (pin: string) => Promise<boolean>;
  /** Set (or change) the PIN. Enables PIN lock. */
  setupPin: (pin: string) => Promise<void>;
  /** Disable and remove the PIN. */
  disablePin: () => Promise<void>;
  /** Manually lock (e.g. from Settings). */
  lock: () => void;
}

const Ctx = createContext<PinCtx | null>(null);

export function PinProvider({ children }: { children: React.ReactNode }) {
  const [isPinEnabled, setIsPinEnabled] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // Boot: read whether a PIN is set
  useEffect(() => {
    getPinEnabled().then((enabled) => {
      setIsPinEnabled(enabled);
      // Lock immediately on first load if PIN is enabled
      if (enabled) setIsLocked(true);
    });
  }, []);

  // Lock on foreground restore
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      if (prev.match(/inactive|background/) && next === 'active') {
        // Re-read in case the user just disabled the PIN
        getPinEnabled().then((enabled) => {
          if (enabled) setIsLocked(true);
        });
      }
    });
    return () => sub.remove();
  }, []);

  const unlock = useCallback(async (pin: string): Promise<boolean> => {
    const ok = await verifyPin(pin);
    if (ok) setIsLocked(false);
    return ok;
  }, []);

  const setupPin = useCallback(async (pin: string) => {
    await setPin(pin);
    setIsPinEnabled(true);
    setIsLocked(false);
  }, []);

  const disablePin = useCallback(async () => {
    await clearPin();
    setIsPinEnabled(false);
    setIsLocked(false);
  }, []);

  const lock = useCallback(() => {
    if (isPinEnabled) setIsLocked(true);
  }, [isPinEnabled]);

  return (
    <Ctx.Provider value={{ isPinEnabled, isLocked, unlock, setupPin, disablePin, lock }}>
      {children}
    </Ctx.Provider>
  );
}

export function usePin(): PinCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePin must be used inside PinProvider');
  return ctx;
}
