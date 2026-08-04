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
  encDays,
  encSettleDay,
  decodeDayState,
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
  if (!hex || hex === "0x" || hex === "0x0") return 0n;
  const clean = hex.replace(/^0x/i, "").toLowerCase();
  // eth_call used to return revert payloads as "success" — never treat as amounts
  if (clean.startsWith("08c379a0") || clean.startsWith("4e487b71")) return 0n;
  if (clean.length === 0 || clean.length > 64) {
    // ABI uint256 is one 32-byte word; longer = multi-return or junk
    if (clean.length > 64 && clean.length % 64 === 0) {
      return BigInt("0x" + clean.slice(0, 64));
    }
    if (clean.length > 64) return 0n;
  }
  return BigInt("0x" + clean.padStart(64, "0"));
}

function decodeBool(hex: string): boolean {
  return decodeUint(hex) !== 0n;
}

/** ABI decode (uint256,uint256) from eth_call */
function decodeTwoUint(hex: string): [bigint, bigint] {
  const clean = hex.replace(/^0x/i, "").toLowerCase();
  if (!clean || clean.startsWith("08c379a0") || clean.startsWith("4e487b71")) {
    return [0n, 0n];
  }
  if (clean.length < 128) return [0n, 0n];
  return [BigInt("0x" + clean.slice(0, 64)), BigInt("0x" + clean.slice(64, 128))];
}

/** Display zones — UTC first, then common local clocks (abbrev from Intl). */
const WINDOW_TIME_ZONES = [
  "UTC",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
  "Asia/Kolkata",
  "Asia/Shanghai",
  "Asia/Tokyo",
] as const;

function formatInTimeZone(sec: bigint, timeZone: string): string {
  return new Date(Number(sec) * 1000).toLocaleString("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

/** One line per zone: `Mon, Aug 3, 12:00 PM EDT → Mon, Aug 3, 8:00 PM EDT` */
function formatWindowLines(startSec: bigint, endSec: bigint): string[] {
  return WINDOW_TIME_ZONES.map(
    (tz) => `${formatInTimeZone(startSec, tz)} → ${formatInTimeZone(endSec, tz)}`,
  );
}

/** Fallback window for today using on-chain defaults (16:00–24:00 UTC). */
function defaultUtcWindowLines(now = new Date()): string[] {
  const utcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 1000;
  const start = BigInt(utcMidnight + 16 * 3600);
  const end = BigInt(utcMidnight + 24 * 3600);
  return formatWindowLines(start, end);
}

/** True during 16:00–24:00 UTC — matches ChainInvaders window offsets. */
function isUtcPlayWindowLocal(now = new Date()): boolean {
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes();
  return mins >= 16 * 60 && mins < 24 * 60;
}

function formatCountdown(totalSec: number): string {
  if (totalSec <= 0) return "0:00:00";
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export type EntryStatus =
  | "not_entered"
  | "entered_live"
  | "entered_next"
  | "unknown";

export type CountdownMode = "to_start" | "to_end" | "none";

export function useChainInvadersCompetition() {
  const { activeWallet } = useActiveWallet();
  const submitTx = useSubmitChainTransaction();
  const { toast } = useToast();

  const [jackpotWei, setJackpotWei] = useState(0n);
  const [currentDayId, setCurrentDayId] = useState(0n);
  const [entryDayId, setEntryDayId] = useState(0n);
  const [inWindow, setInWindow] = useState(false);
  /** false until a successful chain read — avoids "outside window" toasts while RPC is down */
  const [windowKnown, setWindowKnown] = useState(false);
  const [hasEnteredEntryDay, setHasEnteredEntryDay] = useState(false);
  const [hasEnteredLiveDay, setHasEnteredLiveDay] = useState(false);
  const [windowLines, setWindowLines] = useState<string[]>(() => defaultUtcWindowLines());
  const [windowStartSec, setWindowStartSec] = useState(0);
  const [windowEndSec, setWindowEndSec] = useState(0);
  const [unsettledDayId, setUnsettledDayId] = useState<bigint | null>(null);
  const [unsettledPotWei, setUnsettledPotWei] = useState(0n);
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
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

  const countdownMode: CountdownMode = !windowKnown
    ? "none"
    : inWindow
      ? "to_end"
      : windowStartSec > nowSec
        ? "to_start"
        : "none";

  const countdownTarget =
    countdownMode === "to_end"
      ? windowEndSec
      : countdownMode === "to_start"
        ? windowStartSec
        : 0;

  const countdownSec = Math.max(0, countdownTarget - nowSec);
  const countdownLabel =
    countdownMode === "to_end"
      ? "Tournament ends in"
      : countdownMode === "to_start"
        ? "Next tournament starts in"
        : "";
  const countdownText = countdownMode === "none" ? "" : formatCountdown(countdownSec);

  const settlePending =
    unsettledDayId != null && unsettledPotWei > 0n && !inWindow;

  const refresh = useCallback(async () => {
    if (!CHAIN_INVADERS_ADDRESS) {
      setJackpotWei(0n);
      setInWindow(false);
      setWindowKnown(false);
      setHasEnteredEntryDay(false);
      setHasEnteredLiveDay(false);
      setUnsettledDayId(null);
      setUnsettledPotWei(0n);
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
      setWindowKnown(true);

      // Display + countdown use the contest you're entering / next live window.
      try {
        const winData = await embrEthCall(CHAIN_INVADERS_ADDRESS, encDayWindow(entry));
        const [start, end] = decodeTwoUint(winData);
        if (start > 0n && end > start) {
          setWindowLines(formatWindowLines(start, end));
          setWindowStartSec(Number(start));
          setWindowEndSec(Number(end));
        } else {
          const lines = defaultUtcWindowLines();
          setWindowLines(lines);
        }
      } catch {
        setWindowLines(defaultUtcWindowLines());
      }

      // When live, countdown-to-end needs the *current* day's end (same as entry while live).
      if (live) {
        try {
          const liveWin = await embrEthCall(CHAIN_INVADERS_ADDRESS, encDayWindow(cur));
          const [, end] = decodeTwoUint(liveWin);
          if (end > 0n) setWindowEndSec(Number(end));
        } catch {
          /* keep entry window end */
        }
      }

      // Detect unpaid concluded contest (currentDayId after close still holds the pot).
      try {
        const dayHex = await embrEthCall(CHAIN_INVADERS_ADDRESS, encDays(cur));
        const day = decodeDayState(dayHex);
        if (
          day &&
          !live &&
          !day.settled &&
          day.pot > 0n &&
          day.cumulativeLeader !== "0x0000000000000000000000000000000000000000" &&
          day.singleLeader !== "0x0000000000000000000000000000000000000000"
        ) {
          setUnsettledDayId(cur);
          setUnsettledPotWei(day.pot);
        } else {
          setUnsettledDayId(null);
          setUnsettledPotWei(0n);
        }
      } catch {
        setUnsettledDayId(null);
        setUnsettledPotWei(0n);
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
      setWindowKnown(false);
      // Keep last known inWindow; local clock only used for toast copy below.
    }
  }, [activeWallet?.address]);

  useEffect(() => {
    void refresh();
    const t = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    const t = window.setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000);
    return () => window.clearInterval(t);
  }, []);

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
          : "500 EMBR locked for the next contest. Practice freely until 16:00 UTC.",
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
          let description: string;
          if (!windowKnown) {
            description = isUtcPlayWindowLocal()
              ? "Couldn't confirm the live window with the chain just now — hard refresh and play again. You do not need to pay another 500 EMBR if you're already entered."
              : "Couldn't reach the chain. Tournament scoring is 16:00–24:00 UTC — try again when the site is healthy.";
          } else if (inWindow) {
            description = "Enter the contest (500 EMBR) to submit scores for the jackpot.";
          } else {
            description =
              "Tournament scores only count 16:00–24:00 UTC. Enter anytime for the next contest.";
          }
          toast({
            title: "Practice run complete",
            description,
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
              roundToken: result.roundToken,
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
      windowKnown,
      refresh,
      submitTx,
      toast,
    ],
  );

  const fetchRoundSeed = useCallback(async () => {
    try {
      const api = resolveApiServer();
      const res = await fetch(`${api}/api/chain-invaders/round-seed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          player: activeWallet?.address,
        }),
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { seed?: string; token?: string };
      if (!json.seed) return null;
      return { seed: json.seed, token: json.token };
    } catch {
      return null;
    }
  }, [activeWallet?.address]);

  const settleWinners = useCallback(async () => {
    if (!CHAIN_INVADERS_ADDRESS) {
      toast({ title: "Contract not configured", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      // 1) Prefer server auto-settler (uses settler key; no wallet needed).
      const api = resolveApiServer();
      try {
        const res = await fetch(`${api}/api/chain-invaders/settle`, { method: "POST" });
        const json = (await res.json()) as {
          settled?: number[];
          skipped?: string[];
          error?: string;
        };
        if (res.ok && json.settled && json.settled.length > 0) {
          toast({
            title: "Winners paid",
            description: `Settled day ${json.settled.join(", ")} — jackpot sent on-chain.`,
          });
          await refresh();
          return;
        }
      } catch {
        /* fall through to on-chain settle */
      }

      // 2) Permissionless on-chain settleDay — anyone with a wallet can trigger payout.
      if (!activeWallet) {
        toast({
          title: "Connect a wallet to settle",
          description:
            "Server settle didn’t pay yet. Connect a wallet and press Settle again — anyone can call it.",
          variant: "destructive",
        });
        return;
      }
      if (unsettledDayId == null) {
        toast({
          title: "Nothing to settle",
          description: "No unpaid concluded contest found right now.",
        });
        await refresh();
        return;
      }

      await submitTx.mutateAsync({
        data: {
          fromPrivateKey: activeWallet.privateKey,
          to: CHAIN_INVADERS_ADDRESS,
          value: "0",
          data: encSettleDay(unsettledDayId),
          gasLimit: "300000",
        },
      });
      toast({
        title: "Winners paid",
        description: `Day ${unsettledDayId.toString()} settled — jackpot sent to the leaders.`,
      });
      await refresh();
    } catch (err) {
      toast({
        title: "Settle failed",
        description: err instanceof Error ? err.message : "Transaction failed",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }, [activeWallet, unsettledDayId, refresh, submitTx, toast]);

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
    windowLines,
    countdownMode,
    countdownLabel,
    countdownText,
    settlePending,
    unsettledPotLabel: unsettledPotWei > 0n ? formatEmbrJackpot(unsettledPotWei) : "",
    busy,
    lastResult,
    contractConfigured: Boolean(CHAIN_INVADERS_ADDRESS),
    enterCompetition,
    settleWinners,
    submitScore,
    fetchRoundSeed,
    refresh,
    setPadHandler,
    pressPad,
  };
}
