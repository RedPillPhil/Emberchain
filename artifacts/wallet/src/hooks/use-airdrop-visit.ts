import { useEffect, useRef } from "react";

/** Confirm an airdrop visit task when user lands with ?airdrop_vt= token. */
export function useAirdropVisitConfirm() {
  const done = useRef(false);

  useEffect(() => {
    if (done.current || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const token = params.get("airdrop_vt");
    if (!token) return;

    done.current = true;
    fetch("/api/airdrop/confirm-visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (res.ok && data.ok) {
          console.info("[airdrop] Visit task confirmed:", data.taskId, data.reward);
        }
      })
      .catch(() => {
        /* non-fatal */
      });
  }, []);
}
