import React, { useState } from "react";
import { useActiveWallet } from "@/hooks/use-active-wallet";
import { useCallContract } from "@workspace/api-client-react";
import { useSubmitChainTransaction } from "@/hooks/use-submit-chain-transaction";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Terminal, Play, UploadCloud, AlertCircle, CheckCircle2 } from "lucide-react";
import { Link } from "wouter";

/** Deploy / call EVM contracts — bottom section of Tokens/Contracts page. */
export function ContractTools() {
  const { activeWallet } = useActiveWallet();
  const createTx = useSubmitChainTransaction();
  const callContract = useCallContract();

  const [deployBytecode, setDeployBytecode] = useState("");
  const [deployResultHash, setDeployResultHash] = useState<string | null>(null);

  const [callAddress, setCallAddress] = useState("");
  const [callData, setCallData] = useState("0x");
  const [callResult, setCallResult] = useState<{ success: boolean; data?: string; error?: string } | null>(null);

  const handleDeploy = () => {
    if (!activeWallet || !deployBytecode.trim()) return;

    const bytecode = deployBytecode.startsWith("0x") ? deployBytecode : `0x${deployBytecode}`;

    createTx.mutate({
      data: {
        fromPrivateKey: activeWallet.privateKey,
        to: null,
        value: "0",
        data: bytecode,
        gasLimit: "5000000",
      },
    }, {
      onSuccess: (tx) => {
        setDeployResultHash(tx.hash);
        setDeployBytecode("");
      },
    });
  };

  const handleCall = () => {
    if (!callAddress.trim()) return;

    const data = callData.trim().startsWith("0x") ? callData.trim() : `0x${callData.trim()}`;

    callContract.mutate({
      data: {
        to: callAddress,
        data,
        from: activeWallet?.address,
      },
    }, {
      onSuccess: (res) => {
        setCallResult({
          success: res.success,
          data: res.returnData,
          error: res.error || undefined,
        });
      },
      onError: (err: { message?: string }) => {
        setCallResult({
          success: false,
          error: err.message || "Failed to execute call",
        });
      },
    });
  };

  return (
    <section id="deploy-tools" className="space-y-6 pt-8 border-t border-border">
      <div>
        <h2 className="text-2xl font-display font-bold uppercase tracking-tighter text-foreground mb-2 flex items-center gap-3">
          <Terminal className="w-6 h-6 text-primary" /> Deploy &amp; Call
        </h2>
        <p className="text-muted-foreground font-sans text-xs uppercase tracking-widest font-bold">
          Deploy new bytecode or execute read/call against existing contracts.
        </p>
      </div>

      <Tabs defaultValue="deploy" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2 bg-secondary rounded-sm p-1">
          <TabsTrigger value="deploy" className="rounded-sm uppercase font-bold text-xs tracking-widest data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Deploy New
          </TabsTrigger>
          <TabsTrigger value="call" className="rounded-sm uppercase font-bold text-xs tracking-widest data-[state=active]:bg-accent data-[state=active]:text-accent-foreground">
            Read/Call Existing
          </TabsTrigger>
        </TabsList>

        <TabsContent value="deploy" className="space-y-6 mt-6">
          <Card className="border-border bg-card/80 backdrop-blur rounded-sm">
            <CardHeader className="border-b border-border bg-secondary/30">
              <CardTitle className="font-display tracking-tight text-xl uppercase flex items-center gap-2">
                <UploadCloud className="w-5 h-5 text-primary" /> Deploy Contract Bytecode
              </CardTitle>
              <CardDescription className="text-xs uppercase font-bold tracking-widest font-sans">
                Submits a transaction to the mempool with no recipient.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              {!activeWallet && (
                <p className="text-sm text-amber-400/90">
                  Connect a wallet via <Link href="/setup" className="underline">Setup</Link> to deploy contracts.
                </p>
              )}

              {deployResultHash && (
                <div className="bg-primary/10 border border-primary/50 p-4 rounded-sm flex flex-col gap-2 mb-6 animate-in fade-in">
                  <div className="flex items-center gap-2 text-primary font-bold uppercase text-sm">
                    <CheckCircle2 className="w-4 h-4" /> Deployment Transaction Sent
                  </div>
                  <div className="text-sm font-mono break-all text-muted-foreground">
                    Hash: <Link href={`/transactions/${deployResultHash}`} className="text-primary hover:underline">{deployResultHash}</Link>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Compiled Bytecode (Hex)</label>
                <Textarea
                  value={deployBytecode}
                  onChange={(e) => setDeployBytecode(e.target.value)}
                  placeholder="0x608060405234801561001057600080fd5b5061011e806100206000396000..."
                  className="min-h-[200px] font-mono bg-black text-primary border-border rounded-sm focus-visible:ring-primary text-xs"
                />
              </div>

              <Button
                onClick={handleDeploy}
                disabled={createTx.isPending || !deployBytecode.trim() || !activeWallet}
                className="w-full h-12 rounded-sm font-bold uppercase tracking-wider bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {createTx.isPending ? "Signing..." : "Sign & Deploy Contract"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="call" className="space-y-6 mt-6">
          <Card className="border-border bg-card/80 backdrop-blur rounded-sm">
            <CardHeader className="border-b border-border bg-secondary/30">
              <CardTitle className="font-display tracking-tight text-xl uppercase flex items-center gap-2">
                <Play className="w-5 h-5 text-accent" /> Execute Local Call
              </CardTitle>
              <CardDescription className="text-xs uppercase font-bold tracking-widest font-sans">
                Read state directly from the node. No gas spent, not mined.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Target Contract Address</label>
                <Input
                  value={callAddress}
                  onChange={(e) => setCallAddress(e.target.value)}
                  placeholder="0x..."
                  className="font-mono bg-input border-border rounded-sm"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Call Data (ABI Encoded Hex)</label>
                <Textarea
                  value={callData}
                  onChange={(e) => setCallData(e.target.value)}
                  placeholder="0x (Empty for fallback function)"
                  className="min-h-[100px] font-mono bg-black text-accent border-border rounded-sm focus-visible:ring-accent text-xs"
                />
              </div>

              <Button
                onClick={handleCall}
                disabled={callContract.isPending || !callAddress.trim()}
                className="w-full h-12 rounded-sm font-bold uppercase tracking-wider bg-accent text-accent-foreground hover:bg-accent/90"
              >
                {callContract.isPending ? "Executing..." : "Execute Local Call"}
              </Button>

              {callResult && (
                <div className="mt-8 border-t border-border pt-6 animate-in slide-in-from-bottom-2">
                  <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">Execution Result</div>
                  {callResult.success ? (
                    <div className="bg-black border border-border p-4 rounded-sm font-mono text-sm break-all text-primary">
                      {callResult.data || "0x (Success, no return data)"}
                    </div>
                  ) : (
                    <div className="bg-destructive/10 border border-destructive/50 p-4 rounded-sm font-mono text-sm text-destructive flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-sans font-bold uppercase text-xs mb-1">Execution Reverted</div>
                        <div className="break-all">{callResult.error}</div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </section>
  );
}
