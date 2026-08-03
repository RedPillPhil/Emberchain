import { useCallback, useEffect, useRef, useState } from "react";
import { useActiveWallet } from "@/hooks/use-active-wallet";
import { useSubmitChainTransaction } from "@/hooks/use-submit-chain-transaction";
import { chainNodeApi } from "@/lib/config";
import { resolveApiServer } from "@/lib/api-server";
import { useToast } from "@/hooks/use-toast";
import type { PlayResult } from "@/components/chain-invaders/engine";
import type { PadButton } from "@/components/chain-invaders/engine";
import {
  CHAIN_INVADERS_ADDRESS,
  ENTRY_FEE_WEI,
  encEnter,
  encCommitScore,
  encRevealScore,
  encTodayJackpot,
  encCurrentDayId,
  encInWindow,
  encEntered,
  makeCommitment,
  randomSalt,
  formatEmbrJackpot,
} from "@/lib/chain-invaders";

async function embrEthCall(to: string, data: string): Promise<string> {
  const res = await fetch(chainNodeApi("/api/rpc"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to, data }, "latest"],
    }),
  });
  const d = await res.json();
  if (d.error) throw new Error(d.error.message ?? JSON.stringify(d.error));
  return d.result as string;
}

function decodeUint(hex: string): bigint {
  if (!hex || hex === "0x") return 0n;
  return BigInt(hex);
}

function decodeBool(hex: string): boolean {
  return decodeUint(hex) !== 0n;
}

export function useChainInvadersCompetition() {
  const { activeWallet } = useActiveWallet();
  const submitTx = useSubmitChainTransaction();
  const { toast } = useToast();

  const [jackpotWei, setJackpotWei] = useState(0n);
  const [dayId, setDayId] = useState(0n);
  const [inWindow, setInWindow] = useState(false);
  const [hasEntered, setHasEntered] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<PlayResult | null>(null);
  const padRef = useRef<((button: PadButton, active: boolean) => void) | null>(null);

  const jackpotLabel = jackpotWei > 0n
    ? `POT ${formatEmbrJackpot(jackpotWei)}`
    : "POT —";

  const refresh = useCallback(async () => {
    if (!CHAIN_INVADERS_ADDRESS) {
      setJackpotWei(0n);
      setInWindow(false);
      return;
    }
    try {
      const [potHex, dayHex, winHex] = await Promise.all([
        embrEthCall(CHAIN_INVADERS_ADDRESS, encTodayJackpot()),
        embrEthCall(CHAIN_INVADERS_ADDRESS, encCurrentDayId()),
        embrEthCall(CHAIN_INVADERS_ADDRESS, encInWindow()),
      ]);
      const day = decodeUint(dayHex);
      setJackpotWei(decodeUint(potHex));
      setDayId(day);
      setInWindow(decodeBool(winHex));

      if (activeWallet?.address) {
        const enteredHex = await embrEthCall(
          CHAIN_INVADERS_ADDRESS,
          encEntered(day, activeWallet.address),
        );
        setHasEntered(decodeBool(enteredHex));
      } else {
        setHasEntered(false);
      }
    } catch {
      // Contract may not be deployed yet
      setJackpotWei(0n);
    }
  }, [activeWallet?.address]);

  useEffect(() => {
    void refresh();
    const t = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(t);
  }, [refresh]);

  const enterCompetition = useCallback(async () => {
    if (!CHAIN_INVADERS_ADDRESS) {
      toast({
        title: "Contract not deployed",
        description: "Set VITE_CHAIN_INVADERS_ADDRESS after deploying ChainInvaders.sol",
        variant: "destructive",
      });
      return;
    }
    if (!activeWallet) {
      toast({ title: "Connect a wallet first", variant: "destructive" });
      return;
    }
    if (!inWindow) {
      toast({
        title: "Competition closed",
        description: "Daily window is noon–8pm Eastern (16:00–24:00 UTC).",
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    try {
      await submitTx.mutateAsync({
        data: {
          fromPrivateKey: activeWallet.privateKey,
          to: CHAIN_INVADERS_ADDRESS,
          value: ENTRY_FEE_WEI.toString(),
          data: encEnter(),
          gasLimit: "200000",
        },
      });
      toast({ title: "Entered!", description: "500 EMBR locked into today's jackpot." });
      await refresh();
    } catch (err) {
      toast({
        title: "Entry failed",
        description: err instanceof Error ? err.message : "Transaction failed",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }, [activeWallet, inWindow, refresh, submitTx, toast]);

  const submitScore = useCallback(
    async (result: PlayResult) => {
      setLastResult(result);
      if (!CHAIN_INVADERS_ADDRESS || !activeWallet || !hasEntered) {
        return;
      }
      setBusy(true);
      try {
        const salt = randomSalt();
        const score = BigInt(result.score);
        const commitment = makeCommitment(
          activeWallet.address,
          dayId,
          score,
          salt,
          result.playHash,
        );

        // Commit–reveal step 1
        await submitTx.mutateAsync({
          data: {
            fromPrivateKey: activeWallet.privateKey,
            to: CHAIN_INVADERS_ADDRESS,
            value: "0",
            data: encCommitScore(commitment),
            gasLimit: "150000",
          },
        });

        // ECDSA signature from game server (api-server private key)
        let signature = "0x";
        try {
          const api = resolveApiServer();
          const res = await fetch(`${api}/api/chain-invaders/attest`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              player: activeWallet.address,
              dayId: dayId.toString(),
              score: result.score,
              playHash: result.playHash,
              seed: result.seed,
              durationMs: result.durationMs,
              kills: result.kills,
            }),
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error ?? "Signing failed");
          signature = (json.signature ?? json.attestation) as string;
        } catch (err) {
          toast({
            title: "Game signature unavailable",
            description:
              err instanceof Error
                ? err.message
                : "Could not get ECDSA signature — score not submitted on-chain",
            variant: "destructive",
          });
          setBusy(false);
          return;
        }

        // Commit–reveal step 2 (contract verifies ECDSA)
        await submitTx.mutateAsync({
          data: {
            fromPrivateKey: activeWallet.privateKey,
            to: CHAIN_INVADERS_ADDRESS,
            value: "0",
            data: encRevealScore(score, salt, result.playHash, signature),
            gasLimit: "250000",
          },
        });

        toast({
          title: "Score submitted",
          description: `${result.score} pts added to your daily cumulative total.`,
        });
        await refresh();
      } catch (err) {
        toast({
          title: "Score submit failed",
          description: err instanceof Error ? err.message : "Transaction failed",
          variant: "destructive",
        });
      } finally {
        setBusy(false);
      }
    },
    [activeWallet, dayId, hasEntered, refresh, submitTx, toast],
  );

  const setPadHandler = useCallback((fn: (button: PadButton, active: boolean) => void) => {
    padRef.current = fn;
  }, []);

  const pressPad = useCallback((button: PadButton, active: boolean) => {
    padRef.current?.(button, active);
    // Also click the NiftyMon "start chain invaders" overlay if present
    if (active && button === "start") {
      const el = document.querySelector<HTMLButtonElement>("[data-nifty-start]");
      el?.click();
    }
  }, []);

  return {
    jackpotWei,
    jackpotLabel,
    formatJackpot: formatEmbrJackpot(jackpotWei),
    dayId,
    inWindow,
    hasEntered,
    busy,
    lastResult,
    contractConfigured: Boolean(CHAIN_INVADERS_ADDRESS),
    enterCompetition,
    submitScore,
    refresh,
    setPadHandler,
    pressPad,
  };
}
