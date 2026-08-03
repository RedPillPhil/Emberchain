import { useCallback, useEffect, useRef, useState } from "react";
import { useActiveWallet } from "@/hooks/use-active-wallet";
import { useSubmitChainTransaction } from "@/hooks/use-submit-chain-transaction";
import { chainNodeApi } from "@/lib/config";
import { resolveApiServer } from "@/lib/api-server";
import { useToast } from "@/hooks/use-toast";
import type { PlayResult, PadButton } from "@/components/chain-invaders/engine";
import {
  CHAIN_INVADERS_ADDRESS,
  ENTRY_FEE_WEI,
  encEnter,
  encCommitScore,
  encRevealScore,
  encEntryJackpot,
  encCurrentDayId,
  encEntryDayId,
  encInWindow,
  encEntered,
  encDayWindow,
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

/** ABI decode (uint256,uint256) from eth_call */
function decodeTwoUint(hex: string): [bigint, bigint] {
  const clean = hex.replace(/^0x/, "").padStart(128, "0");
  return [BigInt("0x" + clean.slice(0, 64)), BigInt("0x" + clean.slice(64, 128))];
}

function formatEtRange(startSec: bigint, endSec: bigint): string {
  const fmt = (sec: bigint) =>
    new Date(Number(sec) * 1000).toLocaleString("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
  return `${fmt(startSec)} → ${fmt(endSec)}`;
}

export type EntryStatus =
  | "not_entered"
  | "entered_live"
  | "entered_next"
  | "unknown";

export function useChainInvadersCompetition() {
  const { activeWallet } = useActiveWallet();
  const submitTx = useSubmitChainTransaction();
  const { toast } = useToast();

  const [jackpotWei, setJackpotWei] = useState(0n);
  const [currentDayId, setCurrentDayId] = useState(0n);
  const [entryDayId, setEntryDayId] = useState(0n);
  const [inWindow, setInWindow] = useState(false);
  const [hasEnteredEntryDay, setHasEnteredEntryDay] = useState(false);
  const [hasEnteredLiveDay, setHasEnteredLiveDay] = useState(false);
  const [windowLabel, setWindowLabel] = useState("Noon–8pm Eastern daily");
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<PlayResult | null>(null);
  const padRef = useRef<((button: PadButton, active: boolean) => void) | null>(null);

  const isPreRegistered = hasEnteredEntryDay && !inWindow;
  const isLiveEntered = inWindow && hasEnteredLiveDay;

  const entryStatus: EntryStatus = !CHAIN_INVADERS_ADDRESS
    ? "unknown"
    : isLiveEntered
      ? "entered_live"
      : isPreRegistered
        ? "entered_next"
        : "not_entered";

  const jackpotLabel =
    jackpotWei > 0n ? `POT ${formatEmbrJackpot(jackpotWei)}` : "POT —";

  const practiceMode = !inWindow || !hasEnteredLiveDay;

  const refresh = useCallback(async () => {
    if (!CHAIN_INVADERS_ADDRESS) {
      setJackpotWei(0n);
      setInWindow(false);
      setHasEnteredEntryDay(false);
      setHasEnteredLiveDay(false);
      return;
    }
    try {
      const [potHex, curHex, entryHex, winHex] = await Promise.all([
        embrEthCall(CHAIN_INVADERS_ADDRESS, encEntryJackpot()),
        embrEthCall(CHAIN_INVADERS_ADDRESS, encCurrentDayId()),
        embrEthCall(CHAIN_INVADERS_ADDRESS, encEntryDayId()),
        embrEthCall(CHAIN_INVADERS_ADDRESS, encInWindow()),
      ]);
      const cur = decodeUint(curHex);
      const entry = decodeUint(entryHex);
      const live = decodeBool(winHex);
      setJackpotWei(decodeUint(potHex));
      setCurrentDayId(cur);
      setEntryDayId(entry);
      setInWindow(live);

      try {
        const winData = await embrEthCall(CHAIN_INVADERS_ADDRESS, encDayWindow(entry));
        const [start, end] = decodeTwoUint(winData);
        setWindowLabel(formatEtRange(start, end));
      } catch {
        setWindowLabel("Noon–8pm Eastern daily");
      }

      if (activeWallet?.address) {
        const [enteredEntry, enteredLive] = await Promise.all([
          embrEthCall(CHAIN_INVADERS_ADDRESS, encEntered(entry, activeWallet.address)),
          embrEthCall(CHAIN_INVADERS_ADDRESS, encEntered(cur, activeWallet.address)),
        ]);
        setHasEnteredEntryDay(decodeBool(enteredEntry));
        setHasEnteredLiveDay(decodeBool(enteredLive));
      } else {
        setHasEnteredEntryDay(false);
        setHasEnteredLiveDay(false);
      }
    } catch {
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
    if (hasEnteredEntryDay) {
      toast({ title: "Already entered", description: "You're registered for this contest." });
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
      toast({
        title: "Entered!",
        description: inWindow
          ? "500 EMBR locked — scored runs count toward today's jackpot."
          : "500 EMBR locked for the next contest. Practice freely until noon Eastern.",
      });
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
  }, [activeWallet, hasEnteredEntryDay, inWindow, refresh, submitTx, toast]);

  const submitScore = useCallback(
    async (result: PlayResult) => {
      setLastResult(result);
      // Practice: always allowed to play; only submit when live + entered for today
      if (!CHAIN_INVADERS_ADDRESS || !activeWallet || !inWindow || !hasEnteredLiveDay) {
        if (result.score > 0 && (!inWindow || !hasEnteredLiveDay)) {
          toast({
            title: "Practice run complete",
            description: inWindow
              ? "Enter the contest (500 EMBR) to submit scores for the jackpot."
              : "Tournament scores only count noon–8pm Eastern. Enter anytime for the next contest.",
          });
        }
        return;
      }
      setBusy(true);
      try {
        const salt = randomSalt();
        const score = BigInt(result.score);
        const dayId = currentDayId;
        const commitment = makeCommitment(
          activeWallet.address,
          dayId,
          score,
          salt,
          result.playHash,
        );

        await submitTx.mutateAsync({
          data: {
            fromPrivateKey: activeWallet.privateKey,
            to: CHAIN_INVADERS_ADDRESS,
            value: "0",
            data: encCommitScore(commitment),
            gasLimit: "150000",
          },
        });

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
    [
      activeWallet,
      currentDayId,
      hasEnteredLiveDay,
      inWindow,
      refresh,
      submitTx,
      toast,
    ],
  );

  const setPadHandler = useCallback((fn: (button: PadButton, active: boolean) => void) => {
    padRef.current = fn;
  }, []);

  const pressPad = useCallback((button: PadButton, active: boolean) => {
    padRef.current?.(button, active);
    if (active && button === "start") {
      document.querySelector<HTMLButtonElement>("[data-nifty-start]")?.click();
    }
  }, []);

  return {
    jackpotWei,
    jackpotLabel,
    formatJackpot: formatEmbrJackpot(jackpotWei),
    currentDayId,
    entryDayId,
    dayId: currentDayId,
    inWindow,
    hasEntered: hasEnteredEntryDay,
    hasEnteredLiveDay,
    entryStatus,
    practiceMode,
    windowLabel,
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
