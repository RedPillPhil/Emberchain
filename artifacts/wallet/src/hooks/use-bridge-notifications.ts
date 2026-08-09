import { useCallback, useEffect, useRef, useState } from "react";
import { fetchPendingBridges, formatEmbr, type PendingBridge } from "@/lib/bridge-admin";
import {
  bridgeAlertKey,
  getBridgeNotifyEnabled,
  loadSeenBridgeKeys,
  saveSeenBridgeKeys,
  setBridgeNotifyEnabled,
  showBridgeNotification,
} from "@/lib/bridge-notifications";

const POLL_MS = 45_000;

function describeBridge(row: PendingBridge): { title: string; body: string } {
  const amount = formatEmbr(row.amount);
  if (row.direction === "embr_to_base") {
    return {
      title: "New bridge: EMBR → Base",
      body: `${amount} EMBR locked · nonce ${row.nonce} · → ${row.baseRecipient.slice(0, 10)}…`,
    };
  }
  return {
    title: "New bridge: Base → EMBR",
    body: `${amount} EMBR · nonce ${row.nonce} · → ${row.embrRecipient.slice(0, 10)}…`,
  };
}

/** Poll for pending bridges and fire browser notifications when admin alerts are enabled. */
export function useBridgeNotifications(active: boolean, operatorPrivateKey?: string) {
  const [enabled, setEnabled] = useState(getBridgeNotifyEnabled);
  const seenRef = useRef(loadSeenBridgeKeys());
  const primedRef = useRef(false);

  const poll = useCallback(async () => {
    if (!active || !enabled) return;
    try {
      const pending = (await fetchPendingBridges(1_000_000, operatorPrivateKey)).filter((r) => !r.completed);
      const seen = seenRef.current;

      if (!primedRef.current) {
        for (const row of pending) seen.add(bridgeAlertKey(row));
        primedRef.current = true;
        saveSeenBridgeKeys(seen);
        return;
      }

      for (const row of pending) {
        const key = bridgeAlertKey(row);
        if (seen.has(key)) continue;
        seen.add(key);
        const { title, body } = describeBridge(row);
        showBridgeNotification(title, body);
      }
      saveSeenBridgeKeys(seen);
    } catch {
      /* silent — will retry */
    }
  }, [active, enabled, operatorPrivateKey]);

  useEffect(() => {
    if (!active || !enabled) return;
    primedRef.current = false;
    void poll();
    const id = setInterval(() => void poll(), POLL_MS);
    return () => clearInterval(id);
  }, [active, enabled, poll]);

  return {
    enabled,
    setEnabled: (on: boolean) => {
      setBridgeNotifyEnabled(on);
      setEnabled(on);
      if (on) primedRef.current = false;
    },
  };
}
