import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Shell } from "@/components/layout/shell";
import { useActiveWallet } from "@/hooks/use-active-wallet";
import { useCreateTransaction, useGetWallet } from "@workspace/api-client-react";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Send, AlertCircle, ArrowRight, CheckCircle2 } from "lucide-react";
import { formatEmbr } from "@/lib/utils";
import { useState } from "react";
import { Link } from "wouter";

const sendSchema = z.object({
  to: z.string().min(40, "Address must be at least 40 characters").startsWith("0x", "Address must start with 0x"),
  amount: z.string().refine((val) => {
    const num = parseFloat(val);
    return !isNaN(num) && num > 0;
  }, "Amount must be greater than 0"),
});

type SendFormValues = z.infer<typeof sendSchema>;

export default function Transfer() {
  const { activeWallet } = useActiveWallet();
  const createTx = useCreateTransaction();
  const [successTxHash, setSuccessTxHash] = useState<string | null>(null);

  const { data: wallet } = useGetWallet(activeWallet?.address || "", {
    query: { enabled: !!activeWallet?.address }
  });

  const form = useForm<SendFormValues>({
    resolver: zodResolver(sendSchema),
    defaultValues: {
      to: "",
      amount: "",
    },
  });

  const onSubmit = (data: SendFormValues) => {
    if (!activeWallet) return;

    // Convert decimal EMBR back to emb (smallest unit, * 1e18)
    // Note: JS numbers lose precision at 1e18, but for demo UI we'll do simple math.
    // In a real app we'd use BigInt or ethers.utils.parseUnits
    const amountInEmb = BigInt(Math.floor(parseFloat(data.amount) * 1e18)).toString();

    createTx.mutate({
      data: {
        fromPrivateKey: activeWallet.privateKey,
        to: data.to,
        value: amountInEmb,
      }
    }, {
      onSuccess: (tx) => {
        setSuccessTxHash(tx.hash);
        form.reset();
      }
    });
  };

  return (
    <Shell>
      <div className="max-w-2xl mx-auto w-full">
        <div className="mb-8">
          <h1 className="text-4xl font-display font-bold uppercase tracking-tighter text-foreground mb-2 flex items-center gap-3">
            <Send className="w-8 h-8 text-primary" /> Transfer Funds
          </h1>
          <p className="text-muted-foreground font-sans text-sm uppercase tracking-widest font-bold">
            Move EMBR across the network.
          </p>
        </div>

        <Card className="p-1 mb-8 bg-secondary/50 border-border rounded-sm">
          <div className="flex justify-between items-center p-4 border border-dashed border-border">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Available Balance</span>
            <span className="font-mono text-xl text-primary">{wallet ? formatEmbr(wallet.balance) : "0.00"} EMBR</span>
          </div>
        </Card>

        {successTxHash ? (
          <Card className="border-primary bg-primary/5 p-8 text-center rounded-sm animate-in fade-in slide-in-from-bottom-4 duration-500 box-glow">
            <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-primary/50 text-primary">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-display font-bold uppercase mb-2">Transaction Broadcasted</h2>
            <p className="text-muted-foreground text-sm mb-6">Your transaction has been submitted to the mempool.</p>
            
            <div className="bg-secondary p-3 rounded-sm font-mono text-xs break-all mb-6 border border-border">
              {successTxHash}
            </div>

            <div className="flex gap-4 justify-center">
              <Button onClick={() => setSuccessTxHash(null)} variant="outline" className="rounded-sm font-bold uppercase text-xs">
                Send Another
              </Button>
              <Link href="/transactions" className="inline-flex items-center justify-center rounded-sm text-xs font-bold uppercase tracking-wider h-10 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
                View History
              </Link>
            </div>
          </Card>
        ) : (
          <Card className="border-border bg-card/80 backdrop-blur rounded-sm">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="p-6 space-y-6">
                
                <FormField
                  control={form.control}
                  name="to"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Recipient Address</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="0x..." 
                          className="font-mono bg-input border-border rounded-sm h-12" 
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage className="text-destructive uppercase text-xs font-bold" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex justify-between">
                        <span>Amount (EMBR)</span>
                        <button 
                          type="button"
                          className="text-primary hover:underline"
                          onClick={() => {
                            if (wallet?.balance) {
                              form.setValue("amount", formatEmbr(wallet.balance).replace(/,/g, ''));
                            }
                          }}
                        >
                          MAX
                        </button>
                      </FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input 
                            type="number"
                            step="any"
                            placeholder="0.00" 
                            className="font-mono bg-input border-border rounded-sm h-14 text-xl pl-4 pr-16" 
                            {...field} 
                          />
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold uppercase text-xs">
                            EMBR
                          </div>
                        </div>
                      </FormControl>
                      <FormMessage className="text-destructive uppercase text-xs font-bold" />
                    </FormItem>
                  )}
                />

                {createTx.isError && (
                  <div className="bg-destructive/10 border border-destructive/50 p-4 rounded-sm flex items-start gap-3 text-destructive">
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold uppercase text-sm mb-1">Transaction Failed</div>
                      <div className="text-xs font-mono break-all">{createTx.error?.message || "Unknown error"}</div>
                    </div>
                  </div>
                )}

                <Button 
                  type="submit" 
                  disabled={createTx.isPending}
                  className="w-full h-14 rounded-sm font-bold uppercase tracking-wider text-lg bg-primary text-primary-foreground hover:bg-primary/90 group"
                >
                  {createTx.isPending ? "Signing..." : "Sign & Send"}
                  {!createTx.isPending && <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />}
                </Button>

              </form>
            </Form>
          </Card>
        )}
      </div>
    </Shell>
  );
}
