import React, { useEffect, useRef, useState } from "react";
import { Shell } from "@/components/layout/shell";
import { useActiveWallet } from "@/hooks/use-active-wallet";
import { useGetMiningStatus, useStartMining, useStopMining } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Flame, Zap, Hash, Database, Terminal, Cpu, Info } from "lucide-react";
import { cn, formatEmbr } from "@/lib/utils";

const INTENSITY_LEVELS = [
  {
    value: 1,
    label: "Eco",
    description: "~100 hashes/batch — gentle on the server, API stays fully responsive",
    color: "text-blue-400",
    bgColor: "bg-blue-400/10",
    borderColor: "border-blue-400/40",
  },
  {
    value: 2,
    label: "Balanced",
    description: "~400 hashes/batch — default. Good mix of speed and responsiveness",
    color: "text-green-400",
    bgColor: "bg-green-400/10",
    borderColor: "border-green-400/40",
  },
  {
    value: 3,
    label: "High",
    description: "~1,500 hashes/batch — noticeably faster mining, API still usable",
    color: "text-yellow-400",
    bgColor: "bg-yellow-400/10",
    borderColor: "border-yellow-400/40",
  },
  {
    value: 4,
    label: "Aggressive",
    description: "~5,000 hashes/batch — maximum practical speed, API may feel sluggish",
    color: "text-orange-400",
    bgColor: "bg-orange-400/10",
    borderColor: "border-orange-400/40",
  },
  {
    value: 5,
    label: "Max",
    description: "~15,000 hashes/batch — server eats a full CPU core. UI updates may lag",
    color: "text-primary",
    bgColor: "bg-primary/10",
    borderColor: "border-primary/40",
  },
] as const;

export default function Mining() {
  const { activeWallet } = useActiveWallet();
  const startMining = useStartMining();
  const stopMining = useStopMining();
  const [logs, setLogs] = useState<string[]>([]);
  const [selectedIntensity, setSelectedIntensity] = useState(2);

  const { data: status, refetch } = useGetMiningStatus({
    query: { refetchInterval: 2000 },
  });

  const isMining = status?.isMining || false;
  const activeIntensity = status?.intensity ?? selectedIntensity;
  const currentLevel = INTENSITY_LEVELS.find((l) => l.value === activeIntensity) ?? INTENSITY_LEVELS[1]!;

  const addLog = (msg: string) => {
    setLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 60));
  };

  const handleStart = () => {
    if (!activeWallet) return;
    startMining.mutate(
      { data: { minerAddress: activeWallet.address, intensity: selectedIntensity } },
      {
        onSuccess: () => {
          const level = INTENSITY_LEVELS.find((l) => l.value === selectedIntensity)!;
          addLog(`IGNITE @ intensity ${selectedIntensity} (${level.label}) — forging for ${activeWallet.address.slice(0, 10)}...`);
          refetch();
        },
      },
    );
  };

  const handleStop = () => {
    stopMining.mutate(undefined, {
      onSuccess: () => {
        addLog("HALT signal sent. Cooling down forge.");
        refetch();
      },
    });
  };

  const handleIntensityChange = (level: number) => {
    setSelectedIntensity(level);
    // If already mining, hot-swap the intensity immediately.
    if (isMining && activeWallet) {
      startMining.mutate(
        { data: { minerAddress: activeWallet.address, intensity: level } },
        {
          onSuccess: () => {
            const l = INTENSITY_LEVELS.find((x) => x.value === level)!;
            addLog(`Intensity changed → ${level} (${l.label}). Restarting loop.`);
            refetch();
          },
        },
      );
    }
  };

  // Activity logs while mining
  useEffect(() => {
    if (!isMining) return;
    const interval = setInterval(() => {
      if (Math.random() > 0.65) {
        const nonce = Math.floor(Math.random() * 1_000_000_000).toString(16).padStart(8, "0");
        const partial = Math.random().toString(16).slice(2).padStart(14, "0");
        addLog(`nonce:0x${nonce}  hash:0x${partial}… miss`);
      }
    }, 700);
    return () => clearInterval(interval);
  }, [isMining]);

  // Block-found alert
  const prevBlocksMined = useRef(status?.blocksMined);
  useEffect(() => {
    if (status && prevBlocksMined.current !== undefined && status.blocksMined > prevBlocksMined.current) {
      addLog(`★ BLOCK FORGED! Reward: ${formatEmbr(status.blockReward)} EMBR — session total: ${status.blocksMined}`);
    }
    prevBlocksMined.current = status?.blocksMined;
  }, [status?.blocksMined, status?.blockReward]);

  return (
    <Shell>
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between border-b border-border pb-6 gap-4 mb-6">
        <div>
          <h1 className="text-4xl font-display font-bold uppercase tracking-tighter text-foreground mb-2 flex items-center gap-3">
            <Flame className={cn("w-8 h-8", isMining ? "text-primary animate-pulse" : "text-muted-foreground")} />
            Mining Forge
          </h1>
          <p className="text-muted-foreground font-sans text-sm uppercase tracking-widest font-bold">
            Server-side CPU hashing — your browser sends commands, the node does the work.
          </p>
        </div>

        <div className="flex gap-3">
          {isMining ? (
            <Button
              onClick={handleStop}
              disabled={stopMining.isPending}
              className="h-14 px-8 rounded-sm font-display text-lg uppercase tracking-widest bg-destructive text-destructive-foreground hover:bg-destructive/90 animate-pulse"
            >
              SCRAM (Stop)
            </Button>
          ) : (
            <Button
              onClick={handleStart}
              disabled={!activeWallet || startMining.isPending}
              className="h-14 px-8 rounded-sm font-display text-lg uppercase tracking-widest bg-primary text-primary-foreground hover:bg-primary/90 box-glow"
            >
              IGNITE FORGE
            </Button>
          )}
        </div>
      </div>

      {/* How mining works — info banner */}
      <div className="mb-6 flex items-start gap-3 bg-secondary/40 border border-border rounded-sm p-4 text-sm">
        <Info className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
        <p className="text-muted-foreground font-sans leading-relaxed">
          <span className="text-foreground font-bold">Mining runs on the server's CPU</span> — not your browser or
          computer. Your device sends a start command; the Replit container's CPU does keccak256 hashing in a loop.
          No GPU is used. Intensity controls how many hashes the server tries per loop tick before yielding back to
          handle other requests.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: stats + intensity */}
        <div className="lg:col-span-1 space-y-4">
          {/* Live stats */}
          <Card className={cn(
            "p-6 rounded-sm border transition-colors duration-500",
            isMining ? "border-primary bg-primary/5" : "border-border bg-card/50",
          )}>
            <div className="flex items-center gap-3 mb-5">
              <div className={cn("w-3 h-3 rounded-full", isMining ? "bg-primary animate-pulse box-glow" : "bg-muted")} />
              <span className="font-bold uppercase tracking-widest text-sm font-sans">
                {isMining ? "Forge Active" : "Forge Idle"}
              </span>
              {isMining && (
                <span className={cn("ml-auto text-[10px] font-bold uppercase tracking-widest border rounded-sm px-2 py-0.5 font-sans", currentLevel.color, currentLevel.borderColor, currentLevel.bgColor)}>
                  {currentLevel.label}
                </span>
              )}
            </div>

            <div className="space-y-5">
              <div>
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1 flex items-center gap-2 font-sans">
                  <Zap className="w-3 h-3 text-accent" /> Hash Rate
                </div>
                <div className="font-mono text-4xl font-bold text-glow">
                  {isMining ? (status?.hashRate ?? 0).toLocaleString() : "0"}
                  <span className="text-sm text-muted-foreground ml-1">H/s</span>
                </div>
              </div>

              <div>
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1 flex items-center gap-2 font-sans">
                  <Database className="w-3 h-3 text-primary" /> Session Blocks
                </div>
                <div className="font-mono text-3xl">{status?.blocksMined || 0}</div>
              </div>

              <div className="pt-4 border-t border-border/50">
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1 font-sans">
                  <Hash className="w-3 h-3 inline mr-1" /> Difficulty
                </div>
                <div className="font-mono text-xs break-all text-muted-foreground">{status?.difficulty || "…"}</div>
              </div>

              <div className="pt-2 border-t border-border/50">
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1 flex items-center gap-1 font-sans">
                  <Cpu className="w-3 h-3" /> Compute Source
                </div>
                <div className="text-xs font-sans text-muted-foreground">
                  Replit container CPU (server-side)<br />
                  <span className="opacity-60">Single-threaded JS · keccak256 · No GPU</span>
                </div>
              </div>
            </div>
          </Card>

          {/* Intensity selector */}
          <Card className="p-4 rounded-sm border border-border bg-card/50">
            <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-2 font-sans">
              <Zap className="w-3 h-3" /> Mining Intensity
            </div>
            <div className="space-y-2">
              {INTENSITY_LEVELS.map((level) => {
                const isActive = selectedIntensity === level.value;
                const isLive = isMining && activeIntensity === level.value;
                return (
                  <button
                    key={level.value}
                    onClick={() => handleIntensityChange(level.value)}
                    disabled={startMining.isPending}
                    className={cn(
                      "w-full text-left rounded-sm border px-3 py-2 transition-all duration-150",
                      isActive
                        ? cn("border-2", level.borderColor, level.bgColor)
                        : "border-border/50 hover:border-border bg-transparent hover:bg-secondary/20",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className={cn("font-bold text-xs uppercase tracking-widest font-sans", isActive ? level.color : "text-muted-foreground")}>
                        {level.value}. {level.label}
                      </span>
                      {isLive && (
                        <span className={cn("text-[9px] font-bold uppercase tracking-widest font-sans animate-pulse", level.color)}>
                          LIVE
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground font-sans mt-0.5 leading-relaxed">
                      {level.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </Card>

          {isMining && activeWallet && (
            <Card className="p-3 border-primary/30 bg-primary/5 rounded-sm">
              <div className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1 font-sans">Payout Address</div>
              <div className="font-mono text-xs break-all text-muted-foreground">{activeWallet.address}</div>
            </Card>
          )}
        </div>

        {/* Terminal log */}
        <Card className="lg:col-span-2 border-border bg-black rounded-sm overflow-hidden flex flex-col h-[540px]">
          <div className="bg-secondary/50 border-b border-border p-3 flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest font-sans">
            <Terminal className="w-4 h-4" /> Forge Output Terminal
          </div>
          <div className="flex-1 p-4 font-mono text-xs overflow-y-auto space-y-0.5 bg-black">
            {logs.length === 0 && (
              <div className="text-muted-foreground/50 italic">Waiting for ignition sequence…</div>
            )}
            {logs.map((log, i) => (
              <div
                key={i}
                className={cn(
                  "leading-relaxed",
                  log.includes("★ BLOCK FORGED") ? "text-primary font-bold bg-primary/10 px-1 rounded-sm" : "text-green-500/70",
                  log.includes("HALT") ? "text-muted-foreground" : "",
                  log.includes("IGNITE") || log.includes("Intensity") ? "text-accent" : "",
                )}
              >
                {log}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </Shell>
  );
}
