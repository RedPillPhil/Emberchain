import React, { useEffect, useRef, useState } from "react";
import { Shell } from "@/components/layout/shell";
import { useActiveWallet } from "@/hooks/use-active-wallet";
import { useGetMiningStatus, useStartMining, useStopMining } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Flame, Zap, Hash, Database, Clock, Terminal } from "lucide-react";
import { cn, formatEmbr } from "@/lib/utils";

export default function Mining() {
  const { activeWallet } = useActiveWallet();
  const startMining = useStartMining();
  const stopMining = useStopMining();
  const [logs, setLogs] = useState<string[]>([]);
  
  const { data: status, refetch } = useGetMiningStatus({
    query: { refetchInterval: 2000 } // Fast poll to feel alive
  });

  const isMining = status?.isMining || false;

  const addLog = (msg: string) => {
    setLogs(prev => {
      const newLogs = [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev];
      return newLogs.slice(0, 50); // Keep last 50
    });
  };

  const handleToggle = () => {
    if (!activeWallet) return;

    if (isMining) {
      stopMining.mutate(undefined, {
        onSuccess: () => {
          addLog("HALT signal sent. Cooling down forge.");
          refetch();
        }
      });
    } else {
      startMining.mutate({
        data: { minerAddress: activeWallet.address }
      }, {
        onSuccess: () => {
          addLog(`IGNITE signal sent. Forging blocks for ${activeWallet.address.slice(0,8)}...`);
          refetch();
        }
      });
    }
  };

  // Simulate hashing logs when active
  useEffect(() => {
    if (!isMining) return;
    
    const interval = setInterval(() => {
      if (Math.random() > 0.7) {
        const nonce = Math.floor(Math.random() * 1000000000).toString(16).padStart(8, '0');
        const hash = "00" + Math.random().toString(16).slice(2).padStart(62, '0');
        addLog(`Hashing... nonce:0x${nonce} -> ${hash.slice(0, 16)}...`);
      }
    }, 800);

    return () => clearInterval(interval);
  }, [isMining]);

  // Alert on new block found
  const prevBlocksMined = useRef(status?.blocksMined);
  useEffect(() => {
    if (status && prevBlocksMined.current !== undefined && status.blocksMined > prevBlocksMined.current) {
      addLog(`BLOCK FORGED! Reward: ${formatEmbr(status.blockReward)} EMBR. Total session: ${status.blocksMined}`);
    }
    prevBlocksMined.current = status?.blocksMined;
  }, [status?.blocksMined, status?.blockReward]);

  return (
    <Shell>
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between border-b border-border pb-6 gap-4">
        <div>
          <h1 className="text-4xl font-display font-bold uppercase tracking-tighter text-foreground mb-2 flex items-center gap-3">
            <Flame className={cn("w-8 h-8", isMining ? "text-primary animate-pulse" : "text-muted-foreground")} /> 
            Mining Forge
          </h1>
          <p className="text-muted-foreground font-sans text-sm uppercase tracking-widest font-bold">
            Compute hashes to secure the network and earn EMBR.
          </p>
        </div>

        <Button
          onClick={handleToggle}
          disabled={startMining.isPending || stopMining.isPending}
          className={cn(
            "h-16 px-8 rounded-sm font-display text-xl uppercase tracking-widest transition-all duration-300",
            isMining 
              ? "bg-destructive text-destructive-foreground hover:bg-destructive/90 animate-pulse" 
              : "bg-primary text-primary-foreground hover:bg-primary/90 box-glow"
          )}
        >
          {isMining ? "SCRAM (Stop)" : "IGNITE FORGE"}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Stats */}
        <div className="lg:col-span-1 space-y-6">
          <Card className={cn(
            "p-6 rounded-sm border transition-colors duration-500",
            isMining ? "border-primary bg-primary/5" : "border-border bg-card/50"
          )}>
            <div className="flex items-center gap-3 mb-6">
              <div className={cn("w-3 h-3 rounded-full", isMining ? "bg-primary animate-pulse box-glow" : "bg-muted")}></div>
              <span className="font-bold uppercase tracking-widest text-sm">
                {isMining ? "Forge Active" : "Forge Idle"}
              </span>
            </div>

            <div className="space-y-6">
              <div>
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1 flex items-center gap-2">
                  <Zap className="w-3 h-3 text-accent" /> Hash Rate
                </div>
                <div className="font-mono text-4xl font-bold text-glow">
                  {status?.isMining ? status.hashRate.toLocaleString() : "0"} <span className="text-sm text-muted-foreground">H/s</span>
                </div>
              </div>

              <div>
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1 flex items-center gap-2">
                  <Database className="w-3 h-3 text-primary" /> Session Blocks
                </div>
                <div className="font-mono text-3xl">
                  {status?.blocksMined || 0}
                </div>
              </div>

              <div className="pt-4 border-t border-border/50">
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">Target Difficulty</div>
                <div className="font-mono text-sm break-all">{status?.difficulty || "..."}</div>
              </div>
            </div>
          </Card>

          {isMining && activeWallet && (
            <Card className="p-4 border-primary/30 bg-primary/5 rounded-sm">
              <div className="text-xs font-bold text-primary uppercase tracking-widest mb-2">Rewards Payout Address</div>
              <div className="font-mono text-xs break-all text-muted-foreground">
                {activeWallet.address}
              </div>
            </Card>
          )}
        </div>

        {/* Terminal Log */}
        <Card className="lg:col-span-2 border-border bg-black rounded-sm overflow-hidden flex flex-col h-[500px]">
          <div className="bg-secondary/50 border-b border-border p-3 flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">
            <Terminal className="w-4 h-4" /> Forge Output Terminal
          </div>
          <div className="flex-1 p-4 font-mono text-xs overflow-y-auto space-y-1 text-green-500/80 bg-noise">
            {logs.length === 0 && (
              <div className="text-muted-foreground italic">Waiting for ignition sequence...</div>
            )}
            {logs.map((log, i) => (
              <div key={i} className={log.includes('BLOCK FORGED') ? 'text-primary font-bold bg-primary/10 p-1' : ''}>
                {log}
              </div>
            ))}
          </div>
        </Card>

      </div>
    </Shell>
  );
}
