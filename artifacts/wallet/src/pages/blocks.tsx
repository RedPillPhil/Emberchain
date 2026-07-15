import React from "react";
import { Shell } from "@/components/layout/shell";
import { useListBlocks } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Blocks, Clock, Hash, Activity } from "lucide-react";
import { formatHash } from "@/lib/utils";

export default function BlockExplorer() {
  const { data: blocks, isLoading } = useListBlocks({ limit: 50 }, {
    query: { refetchInterval: 5000 }
  });

  return (
    <Shell>
      <div className="mb-8">
        <h1 className="text-4xl font-display font-bold uppercase tracking-tighter text-foreground mb-2 flex items-center gap-3">
          <Blocks className="w-8 h-8 text-primary" /> Network Ledger
        </h1>
        <p className="text-muted-foreground font-sans text-sm uppercase tracking-widest font-bold">
          Immutable history of the Emberchain.
        </p>
      </div>

      <Card className="border-border bg-card/80 backdrop-blur rounded-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-sm">
            <thead className="bg-secondary/50 border-b border-border font-sans text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="p-4 font-bold">Block</th>
                <th className="p-4 font-bold">Hash</th>
                <th className="p-4 font-bold">Timestamp</th>
                <th className="p-4 font-bold">Miner</th>
                <th className="p-4 font-bold text-right">TXs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted-foreground font-sans uppercase font-bold tracking-widest">
                    Scanning chain...
                  </td>
                </tr>
              )}
              
              {!isLoading && blocks?.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted-foreground font-sans uppercase font-bold tracking-widest">
                    Genesis block pending. Start the forge.
                  </td>
                </tr>
              )}

              {blocks?.map((block) => (
                <tr key={block.hash} className="hover:bg-secondary/20 transition-colors group">
                  <td className="p-4">
                    <Link href={`/blocks/${block.number}`} className="text-primary font-bold hover:underline">
                      #{block.number}
                    </Link>
                  </td>
                  <td className="p-4 text-muted-foreground group-hover:text-foreground transition-colors">
                    {formatHash(block.hash, 8)}
                  </td>
                  <td className="p-4 text-muted-foreground">
                    {new Date(block.timestamp).toLocaleString()}
                  </td>
                  <td className="p-4">
                    <span className="bg-secondary px-2 py-1 rounded-sm text-xs border border-border">
                      {formatHash(block.miner)}
                    </span>
                  </td>
                  <td className="p-4 text-right font-bold text-foreground">
                    {block.transactionCount}
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
