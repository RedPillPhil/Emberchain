import React, { useState } from "react";
import { Shell } from "@/components/layout/shell";
import { useGetTransaction, getGetTransactionQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowLeftRight, CheckCircle2, XCircle, Loader2, AlertTriangle, Code2, Trash2 } from "lucide-react";
import { formatEmbr } from "@/lib/utils";
import { decodeCalldata, formatUint256Display } from "@/lib/calldata-decoder";
import { DecodedAddressLink, LedgerAddressLink } from "@/components/explorer/address-link";
import { dropChainTransaction } from "@/lib/chain-node";
import { chainNodeBaseUrl } from "@/lib/config";
import { useToast } from "@/hooks/use-toast";
import { internalMovedWei, type TxWithInternals } from "@/lib/tx-internals";

export default function TransactionDetail() {
  const { hash } = useParams();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [dropping, setDropping] = useState(false);
  
  const { data: tx, isLoading, isError, refetch } = useGetTransaction(hash || "", {
    query: { 
      enabled: !!hash,
      refetchInterval: (query) => (query.state.data as {status?: string} | undefined)?.status === 'pending' ? 2000 : false 
    }
  });

  const handleDrop = async () => {
    if (!hash || !tx || tx.status !== "pending") return;
    if (!window.confirm(
      "Drop this transaction from the mempool?\n\nIt will be marked failed. Your EMBR was never moved — you can safely submit again.",
    )) return;

    setDropping(true);
    try {
      await dropChainTransaction(hash);
      await queryClient.invalidateQueries({ queryKey: getGetTransactionQueryKey(hash) });
      await refetch();
      toast({
        title: "Transaction dropped",
        description: "Removed from mempool. You can submit a new bridge or transfer.",
      });
    } catch (err) {
      toast({
        title: "Could not drop transaction",
        description: (err as Error).message,
        variant: "destructive",
      });
    } finally {
      setDropping(false);
    }
  };

  return (
    <Shell requireWallet={false}>
      <div className="mb-6">
        <Link href="/transactions" className="inline-flex items-center text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to History
        </Link>
        <h1 className="text-4xl font-display font-bold uppercase tracking-tighter text-foreground mb-2 flex items-center gap-3">
          <ArrowLeftRight className="w-8 h-8 text-primary" /> TX Details
        </h1>
      </div>

      {isLoading && <div className="text-muted-foreground uppercase font-bold tracking-widest animate-pulse">Scanning ledgers...</div>}
      
      {isError && <div className="text-destructive uppercase font-bold tracking-widest">Failed to retrieve transaction. It may not exist.</div>}

      {tx && (
        <div className="grid gap-6">
          <Card className="border-border bg-card/80 backdrop-blur rounded-sm">
            <CardHeader className="border-b border-border bg-secondary/30 flex flex-row items-center justify-between">
              <CardTitle className="font-display tracking-tight text-xl uppercase">Payload</CardTitle>
              <div className="flex items-center gap-2">
                {tx.status === 'success' && <span className="bg-primary/20 text-primary border border-primary/50 px-3 py-1 rounded-sm text-xs font-bold uppercase tracking-widest flex items-center gap-2"><CheckCircle2 className="w-4 h-4"/> Success</span>}
                {tx.status === 'pending' && <span className="bg-accent/20 text-accent border border-accent/50 px-3 py-1 rounded-sm text-xs font-bold uppercase tracking-widest flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin"/> In Mempool</span>}
                {tx.status === 'failed' && <span className="bg-destructive/20 text-destructive border border-destructive/50 px-3 py-1 rounded-sm text-xs font-bold uppercase tracking-widest flex items-center gap-2"><XCircle className="w-4 h-4"/> Failed</span>}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <dl className="divide-y divide-border/50 font-mono text-sm">
                <div className="grid grid-cols-1 md:grid-cols-4 p-4 hover:bg-secondary/20 transition-colors">
                  <dt className="text-muted-foreground font-sans font-bold uppercase tracking-widest text-xs md:col-span-1 flex items-center">TX Hash</dt>
                  <dd className="md:col-span-3 break-all font-bold text-primary">{tx.hash}</dd>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 p-4 hover:bg-secondary/20 transition-colors">
                  <dt className="text-muted-foreground font-sans font-bold uppercase tracking-widest text-xs md:col-span-1 flex items-center">Block Number</dt>
                  <dd className="md:col-span-3">
                    {tx.blockNumber ? (
                      <Link href={`/blocks/${tx.blockNumber}`} className="text-primary hover:underline font-bold">#{tx.blockNumber}</Link>
                    ) : (
                      <span className="text-muted-foreground italic">Pending...</span>
                    )}
                  </dd>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 p-4 hover:bg-secondary/20 transition-colors">
                  <dt className="text-muted-foreground font-sans font-bold uppercase tracking-widest text-xs md:col-span-1 flex items-center">From</dt>
                  <dd className="md:col-span-3 break-all">
                    <LedgerAddressLink address={tx.from} />
                  </dd>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 p-4 hover:bg-secondary/20 transition-colors">
                  <dt className="text-muted-foreground font-sans font-bold uppercase tracking-widest text-xs md:col-span-1 flex items-center">To</dt>
                  <dd className="md:col-span-3 break-all">
                    {tx.to ? (
                      <LedgerAddressLink address={tx.to} />
                    ) : (
                      <span className="text-accent italic font-sans font-bold uppercase text-xs tracking-widest">Contract Creation</span>
                    )}
                  </dd>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 p-4 hover:bg-secondary/20 transition-colors">
                  <dt className="text-muted-foreground font-sans font-bold uppercase tracking-widest text-xs md:col-span-1 flex items-center">Value</dt>
                  <dd className="md:col-span-3 font-bold text-glow text-xl">
                    {formatEmbr(tx.value)} EMBR
                    {(() => {
                      const moved = internalMovedWei(tx as TxWithInternals);
                      if (moved <= 0n || BigInt(tx.value || "0") !== 0n) return null;
                      return (
                        <span className="ml-2 text-base font-semibold text-primary">
                          ({formatEmbr(moved.toString())} moved internally)
                        </span>
                      );
                    })()}
                  </dd>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 p-4 hover:bg-secondary/20 transition-colors">
                  <dt className="text-muted-foreground font-sans font-bold uppercase tracking-widest text-xs md:col-span-1 flex items-center">Gas Limit</dt>
                  <dd className="md:col-span-3">{parseInt(tx.gasLimit).toLocaleString()}</dd>
                </div>
                {tx.gasUsed && (
                  <div className="grid grid-cols-1 md:grid-cols-4 p-4 hover:bg-secondary/20 transition-colors">
                    <dt className="text-muted-foreground font-sans font-bold uppercase tracking-widest text-xs md:col-span-1 flex items-center">Gas Used</dt>
                    <dd className="md:col-span-3">{parseInt(tx.gasUsed).toLocaleString()}</dd>
                  </div>
                )}
                {tx.contractAddress && (
                  <div className="grid grid-cols-1 md:grid-cols-4 p-4 hover:bg-secondary/20 transition-colors bg-accent/5">
                    <dt className="text-accent font-sans font-bold uppercase tracking-widest text-xs md:col-span-1 flex items-center">Created Contract</dt>
                    <dd className="md:col-span-3 break-all">
                      <LedgerAddressLink
                        address={tx.contractAddress}
                        className="font-bold text-accent border-accent/30 bg-accent/10 hover:border-accent/60"
                      />
                    </dd>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-4 p-4 hover:bg-secondary/20 transition-colors">
                  <dt className="text-muted-foreground font-sans font-bold uppercase tracking-widest text-xs md:col-span-1 flex items-center">Nonce</dt>
                  <dd className="md:col-span-3">{tx.nonce}</dd>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 p-4 hover:bg-secondary/20 transition-colors">
                  <dt className="text-muted-foreground font-sans font-bold uppercase tracking-widest text-xs md:col-span-1 flex items-center">Submission Time</dt>
                  <dd className="md:col-span-3">{new Date(tx.createdAt).toLocaleString()}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {tx.status === "pending" && (
            <Card className="border-accent/40 bg-accent/5 rounded-sm">
              <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <div className="font-display uppercase tracking-tight text-sm text-accent flex items-center gap-2 mb-1">
                    <AlertTriangle className="w-4 h-4" /> Stuck in mempool
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed max-w-xl">
                    This transaction never mined — often after a node restart. Your balance is unchanged.
                    Drop it to clear the pending state, then submit again.
                  </p>
                  <p className="text-[10px] text-muted-foreground/80 font-mono mt-2 break-all">
                    Node: {chainNodeBaseUrl() || (typeof location !== "undefined" ? location.origin : "")}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={dropping}
                  onClick={handleDrop}
                  className="shrink-0 border-destructive/50 text-destructive hover:bg-destructive/10 uppercase text-xs font-bold tracking-widest gap-2"
                >
                  {dropping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Drop from mempool
                </Button>
              </CardContent>
            </Card>
          )}

          {(() => {
            const internals = (tx as TxWithInternals).internalTransfers ?? [];
            if (internals.length === 0) return null;
            return (
              <Card className="border-primary/30 bg-card/80 backdrop-blur rounded-sm">
                <CardHeader className="border-b border-border bg-secondary/30">
                  <CardTitle className="font-display tracking-tight text-xl uppercase">
                    Internal Transfers
                  </CardTitle>
                  <p className="text-xs text-muted-foreground font-sans mt-1 normal-case tracking-normal">
                    Native EMBR moved by the contract during this call (not the top-level tx value).
                  </p>
                </CardHeader>
                <CardContent className="p-0">
                  <dl className="divide-y divide-border/50 font-mono text-sm">
                    {internals.map((tr, i) => (
                      <div
                        key={`${tr.from}-${tr.to}-${tr.value}-${i}`}
                        className="grid grid-cols-1 md:grid-cols-12 gap-2 p-4 hover:bg-secondary/20 transition-colors"
                      >
                        <div className="md:col-span-5 break-all">
                          <span className="text-[10px] font-sans font-bold uppercase tracking-widest text-muted-foreground block mb-1">From</span>
                          <LedgerAddressLink address={tr.from} />
                        </div>
                        <div className="md:col-span-5 break-all">
                          <span className="text-[10px] font-sans font-bold uppercase tracking-widest text-muted-foreground block mb-1">To</span>
                          <LedgerAddressLink address={tr.to} />
                        </div>
                        <div className="md:col-span-2 md:text-right">
                          <span className="text-[10px] font-sans font-bold uppercase tracking-widest text-muted-foreground block mb-1">Amount</span>
                          <span className="font-bold text-primary">{formatEmbr(tr.value)} EMBR</span>
                        </div>
                      </div>
                    ))}
                  </dl>
                </CardContent>
              </Card>
            );
          })()}

          {(tx.data && tx.data !== "0x") && (() => {
            const decoded = decodeCalldata(tx.data);
            if (decoded) {
              const internals = (tx as TxWithInternals).internalTransfers ?? [];
              const showSettleHint =
                decoded.functionName === "settleDay" &&
                internals.length === 0 &&
                BigInt(tx.value || "0") === 0n &&
                tx.status === "success";
              return (
                <Card className="border-border bg-card/80 backdrop-blur rounded-sm">
                  <CardHeader className="border-b border-border bg-secondary/30 flex flex-row items-center gap-3">
                    <Code2 className="w-5 h-5 text-primary" />
                    <CardTitle className="font-display tracking-tight text-xl uppercase">
                      Decoded Input —{" "}
                      <span className="text-primary">{decoded.functionName}</span>
                      <span className="text-muted-foreground text-sm font-mono ml-2 normal-case tracking-normal">
                        {decoded.selector}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  {showSettleHint && (
                    <div className="px-4 py-3 border-b border-border/50 text-xs text-muted-foreground font-sans leading-relaxed">
                      Top-level value is 0 because the signer only paid gas. The game contract paid winners
                      with internal CALLs. After receipt reindexing, those moves appear under Internal Transfers.
                    </div>
                  )}
                  <CardContent className="p-0">
                    <dl className="divide-y divide-border/50 font-mono text-sm">
                      {decoded.params.map((p) => {
                        const fmt = p.type === "uint256"
                          ? formatUint256Display(p.value, p.name)
                          : null;
                        return (
                          <div key={p.name} className="grid grid-cols-1 md:grid-cols-4 p-4 hover:bg-secondary/20 transition-colors">
                            <dt className="text-muted-foreground font-sans font-bold uppercase tracking-widest text-xs md:col-span-1 flex items-start pt-1">
                              {p.name}
                              <span className="ml-1 text-muted-foreground/50 font-mono normal-case font-normal tracking-normal text-xs">
                                {p.type}
                              </span>
                            </dt>
                            <dd className="md:col-span-3 break-all">
                              {p.type === "address" ? (
                                <DecodedAddressLink
                                  functionName={decoded.functionName}
                                  paramName={p.name}
                                  address={p.value}
                                  selector={decoded.selector}
                                />
                              ) : fmt ? (
                                <span className="font-bold text-foreground">
                                  {fmt.display}
                                  {fmt.hint && (
                                    <span className="ml-2 text-muted-foreground text-xs font-normal">
                                      ({fmt.hint})
                                    </span>
                                  )}
                                </span>
                              ) : (
                                <span className="text-foreground">{p.value}</span>
                              )}
                            </dd>
                          </div>
                        );
                      })}
                    </dl>
                    {/* Raw hex toggle */}
                    <details className="border-t border-border/50">
                      <summary className="p-3 text-xs text-muted-foreground font-sans uppercase tracking-widest cursor-pointer hover:text-foreground transition-colors select-none">
                        Raw calldata
                      </summary>
                      <div className="bg-black text-muted-foreground p-4 font-mono text-xs break-all max-h-40 overflow-y-auto border-t border-border">
                        {tx.data}
                      </div>
                    </details>
                  </CardContent>
                </Card>
              );
            }
            // Unknown function — fall back to raw hex display
            return (
              <Card className="border-border bg-card/80 backdrop-blur rounded-sm">
                <CardHeader className="border-b border-border bg-secondary/30">
                  <CardTitle className="font-display tracking-tight text-xl uppercase">Input Data</CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="bg-black text-muted-foreground p-4 rounded-sm font-mono text-xs break-all max-h-64 overflow-y-auto border border-border">
                    {tx.data}
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          {tx.error && (
            <Card className="border-destructive bg-destructive/5 rounded-sm">
              <CardHeader className="border-b border-destructive/20 bg-destructive/10">
                <CardTitle className="font-display tracking-tight text-xl uppercase text-destructive flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" /> Revert Reason
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="text-destructive font-mono text-sm">
                  {tx.error}
                </div>
              </CardContent>
            </Card>
          )}

          {tx.returnData && tx.returnData !== "0x" && (
            <Card className="border-border bg-card/80 backdrop-blur rounded-sm">
              <CardHeader className="border-b border-border bg-secondary/30">
                <CardTitle className="font-display tracking-tight text-xl uppercase">Return Data</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="bg-black text-primary p-4 rounded-sm font-mono text-xs break-all border border-border">
                  {tx.returnData}
                </div>
              </CardContent>
            </Card>
          )}

        </div>
      )}
    </Shell>
  );
}
