import React, { useState } from "react";
import { Shell } from "@/components/layout/shell";
import { useListTransactions } from "@workspace/api-client-react";
import { useActiveWallet } from "@/hooks/use-active-wallet";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { ArrowLeftRight, Activity, FileCode2, Clock, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { formatHash, formatEmbr, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export default function Transactions() {
  const { activeWallet } = useActiveWallet();
  const [filterActive, setFilterActive] = useState(false);
  
  const addressFilter = filterActive ? activeWallet?.address : undefined;
  
  const { data: transactions, isLoading } = useListTransactions(
    { limit: 50, address: addressFilter }, 
    { query: { refetchInterval: 5000 } }
  );

  return (
    <Shell>
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between border-b border-border pb-6 gap-4 mb-6">
        <div>
          <h1 className="text-4xl font-display font-bold uppercase tracking-tighter text-foreground mb-2 flex items-center gap-3">
            <ArrowLeftRight className="w-8 h-8 text-primary" /> Transactions
          </h1>
          <p className="text-muted-foreground font-sans text-sm uppercase tracking-widest font-bold">
            Activity stream across the network.
          </p>
        </div>
        
        {activeWallet && (
          <Button 
            variant="outline" 
            className={cn(
              "rounded-sm uppercase font-bold text-xs tracking-widest border-2",
              filterActive ? "border-primary bg-primary/10 text-primary box-glow" : "border-border text-muted-foreground"
            )}
            onClick={() => setFilterActive(!filterActive)}
          >
            {filterActive ? "Showing My Activity" : "Show My Activity Only"}
          </Button>
        )}
      </div>

      <Card className="border-border bg-card/80 backdrop-blur rounded-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-sm">
            <thead className="bg-secondary/50 border-b border-border font-sans text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="p-4 font-bold">Status</th>
                <th className="p-4 font-bold">Hash</th>
                <th className="p-4 font-bold">Type</th>
                <th className="p-4 font-bold">From</th>
                <th className="p-4 font-bold">To</th>
                <th className="p-4 font-bold text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground font-sans uppercase font-bold tracking-widest">
                    Scanning mempool and ledger...
                  </td>
                </tr>
              )}
              
              {!isLoading && transactions?.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground font-sans uppercase font-bold tracking-widest">
                    No transactions found.
                  </td>
                </tr>
              )}

              {transactions?.map((tx) => (
                <tr key={tx.hash} className="hover:bg-secondary/20 transition-colors group">
                  <td className="p-4">
                    {tx.status === 'success' && <CheckCircle2 className="w-5 h-5 text-primary" />}
                    {tx.status === 'pending' && <Loader2 className="w-5 h-5 text-accent animate-spin" />}
                    {tx.status === 'failed' && <XCircle className="w-5 h-5 text-destructive" />}
                  </td>
                  <td className="p-4">
                    <Link href={`/transactions/${tx.hash}`} className="text-primary font-bold hover:underline">
                      {formatHash(tx.hash, 6)}
                    </Link>
                  </td>
                  <td className="p-4">
                    {tx.to === null ? (
                      <span className="text-accent flex items-center gap-1 font-sans text-[10px] uppercase font-bold tracking-widest">
                        <FileCode2 className="w-3 h-3" /> Deploy
                      </span>
                    ) : (
                      <span className="text-muted-foreground flex items-center gap-1 font-sans text-[10px] uppercase font-bold tracking-widest">
                        <Activity className="w-3 h-3" /> Transfer
                      </span>
                    )}
                  </td>
                  <td className="p-4 text-muted-foreground group-hover:text-foreground transition-colors">
                    {activeWallet?.address === tx.from ? <span className="text-primary font-bold">YOU</span> : formatHash(tx.from, 6)}
                  </td>
                  <td className="p-4 text-muted-foreground group-hover:text-foreground transition-colors">
                    {tx.to === null ? (
                      <span className="italic opacity-50">Contract</span>
                    ) : activeWallet?.address === tx.to ? (
                      <span className="text-primary font-bold">YOU</span>
                    ) : (
                      formatHash(tx.to, 6)
                    )}
                  </td>
                  <td className="p-4 text-right font-bold text-foreground">
                    {formatEmbr(tx.value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </Shell>
  );
}
