import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Gift, Loader2, RefreshCw, Shuffle, Ticket } from 'lucide-react';
import { toast } from 'sonner';
import { Shell } from '@/components/layout/Shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  fetchDrawStatus,
  fetchLottoConfig,
  fetchMyTickets,
  fetchReferralStats,
  registerTicket,
  type LottoConfig,
  type LottoDrawStatus,
  type LottoTicket,
  type ReferralStats,
} from '@/lib/lotto-api';
import { useEmbrWallet } from '@/lib/embr-wallet';
import {
  fetchWalletBalance,
  maxSpendableEmbr,
  parseEmbrToWei,
  submitChainTransaction,
  waitForChainTransaction,
  weiToHex,
} from '@/lib/chain-node';
import {
  buildReferralLink,
  captureReferralFromUrl,
  getStoredReferrer,
} from '@/lib/referral';
import { cn, formatEmbr, shortAddress } from '@/lib/utils';

function pickRandomNumbers(min: number, max: number, count: number): number[] {
  const pool = Array.from({ length: max - min + 1 }, (_, i) => i + min);
  const picked: number[] = [];
  while (picked.length < count && pool.length > 0) {
    const idx = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(idx, 1)[0]!);
  }
  return picked.sort((a, b) => a - b);
}

function formatClosesAt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

export default function LottoPage() {
  const { activeWallet, isLoaded } = useEmbrWallet();
  const [config, setConfig] = useState<LottoConfig | null>(null);
  const [draw, setDraw] = useState<LottoDrawStatus | null>(null);
  const [tickets, setTickets] = useState<LottoTicket[]>([]);
  const [referralStats, setReferralStats] = useState<ReferralStats | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [balanceWei, setBalanceWei] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(true);
  const [entering, setEntering] = useState(false);
  const [referrer, setReferrer] = useState<string | null>(null);

  const numberRange = useMemo(() => {
    if (!config) return [];
    return Array.from(
      { length: config.numberMax - config.numberMin + 1 },
      (_, i) => i + config.numberMin,
    );
  }, [config]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [cfg, status] = await Promise.all([fetchLottoConfig(), fetchDrawStatus()]);
      setConfig(cfg);
      setDraw(status);

      if (activeWallet) {
        const [myTickets, stats, bal] = await Promise.all([
          fetchMyTickets(activeWallet.address, status.drawId).catch(() => []),
          fetchReferralStats(activeWallet.address).catch(() => null),
          fetchWalletBalance(activeWallet.address).catch(() => 0n),
        ]);
        setTickets(myTickets);
        setReferralStats(stats);
        setBalanceWei(bal);
      } else {
        setTickets([]);
        setReferralStats(null);
        setBalanceWei(null);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load lotto');
    } finally {
      setLoading(false);
    }
  }, [activeWallet]);

  useEffect(() => {
    const ref = captureReferralFromUrl() ?? getStoredReferrer();
    setReferrer(ref);
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    void loadAll();
  }, [isLoaded, loadAll]);

  const toggleNumber = (n: number) => {
    if (!config || draw?.drawn) return;
    setSelected((prev) => {
      if (prev.includes(n)) return prev.filter((x) => x !== n);
      if (prev.length >= config.numbersPerTicket) {
        toast.message(`Pick exactly ${config.numbersPerTicket} numbers`);
        return prev;
      }
      return [...prev, n].sort((a, b) => a - b);
    });
  };

  const handleQuickPick = () => {
    if (!config) return;
    setSelected(pickRandomNumbers(config.numberMin, config.numberMax, config.numbersPerTicket));
  };

  const handleClear = () => setSelected([]);

  const canEnter =
    config &&
    draw &&
    !draw.drawn &&
    activeWallet &&
    config.treasuryAddress &&
    selected.length === config.numbersPerTicket &&
    !entering;

  const handleEnter = async () => {
    if (!canEnter || !config || !activeWallet || !config.treasuryAddress) return;

    const priceWei = parseEmbrToWei(config.ticketPriceEmbr);
    const gasLimit = 100_000n;
    const bal = balanceWei ?? (await fetchWalletBalance(activeWallet.address));
    const spendable = maxSpendableEmbr(bal, gasLimit);

    if (spendable < priceWei) {
      toast.error(`Need at least ${config.ticketPriceEmbr} EMBR plus gas`);
      return;
    }

    const ref = referrer?.toLowerCase();
    const selfRef = activeWallet.address.toLowerCase();
    const effectiveReferrer = ref && ref !== selfRef ? ref : null;

    setEntering(true);
    try {
      toast.message('Sending EMBR payment…');
      const tx = await submitChainTransaction({
        fromPrivateKey: activeWallet.privateKey,
        to: config.treasuryAddress,
        value: weiToHex(priceWei),
        gasLimit: gasLimit.toString(),
      });

      await waitForChainTransaction(tx.hash);

      toast.message('Registering ticket…');
      const ticket = await registerTicket({
        player: activeWallet.address,
        numbers: selected,
        txHash: tx.hash,
        referrer: effectiveReferrer,
      });

      toast.success(`Ticket #${ticket.id} entered for draw ${ticket.drawId}!`);
      setSelected([]);
      await loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not enter lotto');
    } finally {
      setEntering(false);
    }
  };

  const referralLink = activeWallet ? buildReferralLink(activeWallet.address) : null;

  const copyReferral = async () => {
    if (!referralLink) return;
    await navigator.clipboard.writeText(referralLink);
    toast.success('Referral link copied');
  };

  return (
    <Shell>
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        <section className="text-center space-y-3">
          <Badge variant="live" className="mb-1">Live on Emberchain</Badge>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Pick five numbers. Win the EMBR jackpot.
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Connect your Ember wallet, choose {config?.numbersPerTicket ?? 5} unique numbers from{' '}
            {config ? `${config.numberMin}–${config.numberMax}` : '1–49'}, and pay{' '}
            {config?.ticketPriceEmbr ?? 1} EMBR to enter the current draw.
            Share your referral link to earn bonuses when friends play.
          </p>
        </section>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Ticket className="w-5 h-5 text-primary" />
                    Number picker
                  </CardTitle>
                  <CardDescription>
                    Select {config?.numbersPerTicket ?? 5} numbers
                    {draw ? ` · Draw #${draw.drawId}` : ''}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleQuickPick} disabled={!!draw?.drawn}>
                    <Shuffle className="w-4 h-4" />
                    Quick pick
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleClear} disabled={!!draw?.drawn || selected.length === 0}>
                    Clear
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-wrap gap-2 justify-center min-h-[2.5rem]">
                {selected.length === 0 ? (
                  <span className="text-sm text-muted-foreground">No numbers selected yet</span>
                ) : (
                  selected.map((n) => (
                    <span key={n} className="lotto-ball lotto-ball-selected w-12 h-12 text-base">
                      {n}
                    </span>
                  ))
                )}
              </div>

              {loading ? (
                <div className="flex justify-center py-12 text-muted-foreground">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : (
                <div className="grid grid-cols-7 sm:grid-cols-10 gap-2">
                  {numberRange.map((n) => {
                    const isSelected = selected.includes(n);
                    const isWinning = draw?.winningNumbers?.includes(n);
                    return (
                      <button
                        key={n}
                        type="button"
                        disabled={!!draw?.drawn}
                        onClick={() => toggleNumber(n)}
                        className={cn(
                          'lotto-ball',
                          isWinning ? 'lotto-ball-winning' : isSelected ? 'lotto-ball-selected' : 'lotto-ball-default',
                        )}
                      >
                        {n}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2 border-t border-border">
                <div className="text-sm text-muted-foreground">
                  {activeWallet && balanceWei != null ? (
                    <>Balance: {formatEmbr(balanceWei)} EMBR</>
                  ) : (
                    <>Connect wallet at <a href="/wallet/setup" className="text-primary hover:underline">/wallet/setup</a></>
                  )}
                  {referrer && referrer !== activeWallet?.address.toLowerCase() && (
                    <span className="block mt-1">
                      Referred by {shortAddress(referrer)}
                    </span>
                  )}
                </div>
                <Button size="lg" disabled={!canEnter} onClick={() => void handleEnter()}>
                  {entering ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Entering…
                    </>
                  ) : (
                    <>Enter · {config?.ticketPriceEmbr ?? 1} EMBR</>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Current draw</CardTitle>
                <CardDescription>Jackpot grows with every ticket</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {draw ? (
                  <>
                    <div>
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Jackpot</p>
                      <p className="text-3xl font-bold text-primary">{draw.jackpotEmbr} EMBR</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-muted-foreground">Tickets</p>
                        <p className="font-semibold">{draw.ticketCount}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Closes</p>
                        <p className="font-semibold text-xs leading-snug">{formatClosesAt(draw.closesAt)}</p>
                      </div>
                    </div>
                    {draw.drawn && draw.winningNumbers ? (
                      <div>
                        <p className="text-xs text-muted-foreground mb-2">Winning numbers</p>
                        <div className="flex flex-wrap gap-2">
                          {draw.winningNumbers.map((n) => (
                            <span key={n} className="lotto-ball lotto-ball-winning w-10 h-10">{n}</span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Loading draw…</p>
                )}
                <Button variant="outline" size="sm" className="w-full" onClick={() => void loadAll()}>
                  <RefreshCw className="w-4 h-4" />
                  Refresh
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Gift className="w-4 h-4 text-primary" />
                  Referrals
                </CardTitle>
                <CardDescription>
                  Earn {config?.referralBonusPct ?? 10}% bonus when friends enter with your link
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {activeWallet && referralLink ? (
                  <>
                    <div className="rounded-md border border-border bg-secondary/40 p-3 text-xs font-mono break-all">
                      {referralLink}
                    </div>
                    <Button variant="secondary" size="sm" className="w-full" onClick={() => void copyReferral()}>
                      <Copy className="w-4 h-4" />
                      Copy referral link
                    </Button>
                    {referralStats ? (
                      <div className="grid grid-cols-2 gap-3 text-sm pt-2 border-t border-border">
                        <div>
                          <p className="text-muted-foreground">Referrals</p>
                          <p className="font-semibold">{referralStats.referralCount}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Bonus earned</p>
                          <p className="font-semibold">{referralStats.bonusEmbr} EMBR</p>
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Connect a wallet to get your personal referral link.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {activeWallet && tickets.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Your tickets · Draw #{draw?.drawId ?? '—'}</CardTitle>
              <CardDescription>Registered on-chain after EMBR payment</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b border-border">
                      <th className="py-2 pr-4">#</th>
                      <th className="py-2 pr-4">Numbers</th>
                      <th className="py-2 pr-4">Tx</th>
                      <th className="py-2">Matches</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tickets.map((t) => (
                      <tr key={t.id} className="border-b border-border/50">
                        <td className="py-3 pr-4 font-mono">{t.id}</td>
                        <td className="py-3 pr-4">
                          <span className="font-mono">{t.numbers.join(', ')}</span>
                        </td>
                        <td className="py-3 pr-4">
                          <a
                            href={`/ledger/transaction/${t.txHash}`}
                            className="text-primary hover:underline font-mono text-xs"
                          >
                            {shortAddress(t.txHash, 6)}
                          </a>
                        </td>
                        <td className="py-3">{t.matches ?? (draw?.drawn ? 0 : '—')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </Shell>
  );
}
