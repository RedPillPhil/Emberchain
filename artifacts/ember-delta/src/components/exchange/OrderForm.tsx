import React, { useState, useEffect, useCallback } from 'react';
import { formatNumber, cn } from '@/lib/utils';
import { chainNodeApi } from '@/lib/config';
import { TokenIcon } from '@/components/TokenIcon';
import { useWeb3 } from '@/lib/use-web3';
import {
  EMBER_DELTA_ADDRESS,
  EMBER_DELTA_ABI,
  EMBER_DELTA_DOMAIN,
  ORDER_TYPES,
  ERC20_ABI,
  BASE_CHAIN_ID,
} from '@/lib/contracts';
import { useWriteContract, useSignTypedData, usePublicClient, useAccount, useReadContract, useBalance } from 'wagmi';
import { parseEther, formatEther, hashTypedData } from 'viem';
import type { TradingPair } from '@/lib/custom-pairs';
import {
  computeReservedBalances,
  fetchRawOpenOrders,
  parseOpenOrders,
} from '@/lib/dex-orders';
import { useDexDeposited, useDexDepositEvents, ETH_ADDR } from '@/lib/dex-balances';

interface OrderFormProps {
  pair: TradingPair;
  className?: string;
  onOrdersChanged?: () => void;
}

const EXPIRES_BLOCKS = 43_200n;

export const OrderForm = React.memo(function OrderForm({ pair, className, onOrdersChanged }: OrderFormProps) {
  const {
    isConnected,
    isWrongNetwork,
    ethBalance,
    connectWallet,
    switchToBase,
    refetchBalances,
  } = useWeb3();

  const { address } = useAccount();
  const publicClient = usePublicClient();

  const {
    deposited: dexEthTotal,
    refetchDeposited: refetchEthDeposited,
  } = useDexDeposited(ETH_ADDR);
  const {
    deposited: dexTokenTotal,
    refetchDeposited: refetchTokenDeposited,
  } = useDexDeposited(pair.tokenAddress as `0x${string}`);

  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [price, setPrice] = useState('');
  const [amount, setAmount] = useState('');
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');
  const [depositToken, setDepositToken] = useState<'ETH' | 'TOKEN'>('ETH');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [txStatus, setTxStatus] = useState<string | null>(null);
  const [txError, setTxError] = useState(false);
  const [reservedEth, setReservedEth] = useState(0);
  const [reservedToken, setReservedToken] = useState(0);

  const { writeContractAsync } = useWriteContract();
  const { signTypedDataAsync } = useSignTypedData();

  const { data: pairWalletRaw, refetch: refetchPairWallet } = useReadContract({
    address: pair.tokenAddress as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: BASE_CHAIN_ID,
    query: { enabled: !!address && !isWrongNetwork },
  });
  const { refetch: refetchEthWallet } = useBalance({
    address,
    chainId: BASE_CHAIN_ID,
    query: { enabled: !!address && !isWrongNetwork },
  });

  const refreshAllBalances = useCallback(async () => {
    await Promise.all([
      refetchBalances(),
      refetchEthDeposited(),
      refetchTokenDeposited(),
      refetchPairWallet(),
      refetchEthWallet(),
    ]);
  }, [refetchBalances, refetchEthDeposited, refetchTokenDeposited, refetchPairWallet, refetchEthWallet]);

  useDexDepositEvents(refreshAllBalances);

  const loadReserved = useCallback(async () => {
    if (!address) {
      setReservedEth(0);
      setReservedToken(0);
      return;
    }
    try {
      const currentBlock = publicClient ? await publicClient.getBlockNumber() : 0n;
      const raw = await fetchRawOpenOrders(pair.tokenAddress);
      const orders = parseOpenOrders(raw, pair.tokenAddress, currentBlock);
      const { ethReserved, tokenReserved } = computeReservedBalances(orders, address);
      setReservedEth(ethReserved);
      setReservedToken(tokenReserved);
    } catch {
      /* keep previous reserved values */
    }
  }, [address, pair.tokenAddress, publicClient]);

  useEffect(() => {
    loadReserved();
    const id = setInterval(loadReserved, 15_000);
    return () => clearInterval(id);
  }, [loadReserved]);

  const priceNum = parseFloat(price) || 0;
  const amountNum = parseFloat(amount) || 0;
  const total = priceNum * amountNum;

  const dexEthAvailable = Math.max(0, dexEthTotal - reservedEth);
  const dexTokenAvailable = Math.max(0, dexTokenTotal - reservedToken);
  const walletEth = ethBalance ?? 0;
  const walletToken = pairWalletRaw != null ? parseFloat(formatEther(pairWalletRaw as bigint)) : 0;

  const handlePercClick = (perc: number) => {
    if (side === 'buy') {
      const ethToSpend = dexEthAvailable * perc;
      if (priceNum > 0) setAmount((ethToSpend / priceNum).toFixed(4));
    } else {
      setAmount((dexTokenAvailable * perc).toFixed(4));
    }
  };

  const toast = (msg: string, isError = false) => {
    setTxStatus(msg);
    setTxError(isError);
    setTimeout(() => { setTxStatus(null); setTxError(false); }, isError ? 8000 : 5000);
  };

  const waitForReceipt = async (hash: `0x${string}`) => {
    if (!publicClient) return;
    await publicClient.waitForTransactionReceipt({ hash });
    await refreshAllBalances();
    await loadReserved();
  };

  const handleAction = async () => {
    if (!isConnected) { connectWallet(); return; }
    if (isWrongNetwork) { switchToBase(); return; }
    if (!address) return;

    if (priceNum <= 0) { toast('Enter a price', true); return; }
    if (amountNum <= 0) { toast('Enter an amount', true); return; }

    if (side === 'sell' && amountNum > dexTokenAvailable + 1e-9) {
      toast(`You only have ${dexTokenAvailable.toFixed(4)} ${pair.symbol} available in the DEX (${reservedToken.toFixed(4)} in open orders).`, true);
      return;
    }
    if (side === 'buy' && total > dexEthAvailable + 1e-9) {
      toast(`You only have ${dexEthAvailable.toFixed(4)} ETH available in the DEX (${reservedEth.toFixed(4)} in open orders).`, true);
      return;
    }

    setIsSubmitting(true);
    toast('Check MetaMask — sign your order…');

    try {
      const currentBlock = publicClient ? await publicClient.getBlockNumber() : 0n;
      const expires = currentBlock + EXPIRES_BLOCKS;
      const nonce = BigInt(Date.now());

      const amountGetWei  = side === 'sell' ? parseEther((priceNum * amountNum).toFixed(18)) : parseEther(amountNum.toFixed(18));
      const amountGiveWei = side === 'sell' ? parseEther(amountNum.toFixed(18))              : parseEther((priceNum * amountNum).toFixed(18));
      const tokenGet  = side === 'sell' ? ETH_ADDR        : pair.tokenAddress;
      const tokenGive = side === 'sell' ? pair.tokenAddress : ETH_ADDR;

      const orderMessage = {
        tokenGet,
        amountGet:  amountGetWei,
        tokenGive,
        amountGive: amountGiveWei,
        expires,
        nonce,
        user: address,
      } as const;

      const sig = await signTypedDataAsync({
        domain: EMBER_DELTA_DOMAIN,
        types: ORDER_TYPES,
        primaryType: 'Order',
        message: orderMessage,
      });

      const hash = hashTypedData({
        domain: EMBER_DELTA_DOMAIN,
        types: ORDER_TYPES,
        primaryType: 'Order',
        message: orderMessage,
      });

      const r = sig.slice(0, 66) as `0x${string}`;
      const s = (`0x` + sig.slice(66, 130)) as `0x${string}`;
      const v = parseInt(sig.slice(130, 132), 16);

      const res = await fetch(chainNodeApi('/api/dex/orders'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hash,
          token_get:   tokenGet,
          amount_get:  amountGetWei.toString(),
          token_give:  tokenGive,
          amount_give: amountGiveWei.toString(),
          expires:     expires.toString(),
          nonce:       nonce.toString(),
          maker:       address,
          v,
          r,
          s,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error ?? 'Failed to submit order');
      }

      setPrice('');
      setAmount('');
      await loadReserved();
      onOrdersChanged?.();
      toast(`${side === 'sell' ? 'Sell' : 'Buy'} order placed — visible in the order book`);
    } catch (e: unknown) {
      const err = e as { code?: number; message?: string; shortMessage?: string };
      if (err?.code === 4001 || err?.message?.includes('rejected') || err?.message?.includes('denied')) {
        toast('Signature rejected', true);
      } else {
        toast(`Failed: ${err?.shortMessage ?? err?.message ?? 'unknown error'}`, true);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeposit = async () => {
    if (!isConnected) { connectWallet(); return; }
    if (!depositAmount || parseFloat(depositAmount) <= 0) return;
    try {
      toast('Check MetaMask…');
      if (depositToken === 'ETH') {
        const hash = await writeContractAsync({
          address: EMBER_DELTA_ADDRESS,
          abi: EMBER_DELTA_ABI,
          functionName: 'deposit',
          value: parseEther(depositAmount),
        });
        toast('Confirming deposit…');
        await waitForReceipt(hash);
        toast(`ETH deposited`);
      } else {
        await writeContractAsync({
          address: pair.tokenAddress,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [EMBER_DELTA_ADDRESS, parseEther(depositAmount)],
        });
        toast('Approving… waiting for confirmation');
        const hash = await writeContractAsync({
          address: EMBER_DELTA_ADDRESS,
          abi: EMBER_DELTA_ABI,
          functionName: 'depositToken',
          args: [pair.tokenAddress, parseEther(depositAmount)],
        });
        toast('Confirming deposit…');
        await waitForReceipt(hash);
        toast(`${pair.symbol} deposited`);
      }
      setIsDepositModalOpen(false);
      setDepositAmount('');
    } catch (e: unknown) {
      const err = e as { shortMessage?: string; message?: string };
      toast(`Error: ${err?.shortMessage ?? err?.message ?? 'Transaction failed'}`, true);
    }
  };

  const handleWithdraw = async () => {
    if (!isConnected) { connectWallet(); return; }
    if (!depositAmount || parseFloat(depositAmount) <= 0) return;
    try {
      toast('Check MetaMask…');
      if (depositToken === 'ETH') {
        const hash = await writeContractAsync({
          address: EMBER_DELTA_ADDRESS,
          abi: EMBER_DELTA_ABI,
          functionName: 'withdraw',
          args: [parseEther(depositAmount)],
        });
        toast('Confirming withdrawal…');
        await waitForReceipt(hash);
        toast('ETH withdrawn');
      } else {
        const hash = await writeContractAsync({
          address: EMBER_DELTA_ADDRESS,
          abi: EMBER_DELTA_ABI,
          functionName: 'withdrawToken',
          args: [pair.tokenAddress, parseEther(depositAmount)],
        });
        toast('Confirming withdrawal…');
        await waitForReceipt(hash);
        toast(`${pair.symbol} withdrawn`);
      }
      setIsDepositModalOpen(false);
      setDepositAmount('');
    } catch (e: unknown) {
      const err = e as { shortMessage?: string; message?: string };
      toast(`Error: ${err?.shortMessage ?? err?.message ?? 'Transaction failed'}`, true);
    }
  };

  const actionLabel = () => {
    if (!isConnected) return 'Connect Wallet to Trade';
    if (isWrongNetwork) return 'Switch to Base';
    if (isSubmitting) return 'Check MetaMask — sign order…';
    return `Place ${side === 'buy' ? 'Buy' : 'Sell'} Order`;
  };

  return (
    <div className={cn("flex flex-col bg-card h-full border-l border-border relative", className)}>

      <div className="p-3 border-b border-border shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-sans font-semibold text-muted-foreground uppercase text-[10px] tracking-wider">Balances</h3>
          <button
            onClick={() => setIsDepositModalOpen(true)}
            className="text-xs text-primary hover:underline font-medium"
          >
            Deposit / Withdraw
          </button>
        </div>

        <div className="space-y-1 font-mono text-sm mb-2">
          <div className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">In DEX (on-chain deposit)</div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-white/80">
              <TokenIcon symbol="ETH" size={14} /> ETH
            </div>
            <div className={cn("font-bold", isConnected ? "text-white" : "text-muted-foreground")}>
              {isConnected ? dexEthTotal.toFixed(4) : '—'}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-white/80">
              <TokenIcon symbol={pair.symbol} size={14} /> {pair.symbol}
            </div>
            <div className={cn("font-bold", isConnected ? "text-white" : "text-muted-foreground")}>
              {isConnected ? dexTokenTotal.toFixed(4) : '—'}
            </div>
          </div>
          {isConnected && (reservedEth > 0 || reservedToken > 0) && (
            <div className="text-[9px] text-muted-foreground pt-1 space-y-0.5">
              <div className="uppercase tracking-wider">Available to trade</div>
              <div>
                {dexEthAvailable.toFixed(4)} ETH
                {' · '}
                {dexTokenAvailable.toFixed(4)} {pair.symbol}
              </div>
              <div>
                {reservedEth > 0 && `${reservedEth.toFixed(4)} ETH in open orders`}
                {reservedEth > 0 && reservedToken > 0 && ' · '}
                {reservedToken > 0 && `${reservedToken.toFixed(4)} ${pair.symbol} in open orders`}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-1 font-mono text-xs pt-2 border-t border-border/40">
          <div className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">In Wallet (not deposited)</div>
          <div className="flex items-center justify-between text-muted-foreground">
            <span>ETH</span>
            <span>{isConnected ? walletEth.toFixed(4) : '—'}</span>
          </div>
          <div className="flex items-center justify-between text-muted-foreground">
            <span>{pair.symbol}</span>
            <span>{isConnected ? walletToken.toFixed(4) : '—'}</span>
          </div>
        </div>
      </div>

      <div className="flex border-b border-border shrink-0">
        <button
          className={cn(
            "flex-1 py-3 text-sm font-bold uppercase transition-colors text-center border-b-2",
            side === 'buy'
              ? "text-bid border-bid bg-success/5"
              : "text-muted-foreground border-transparent hover:text-white"
          )}
          onClick={() => setSide('buy')}
        >
          Buy {pair.symbol}
        </button>
        <button
          className={cn(
            "flex-1 py-3 text-sm font-bold uppercase transition-colors text-center border-b-2",
            side === 'sell'
              ? "text-ask border-ask bg-destructive/5"
              : "text-muted-foreground border-transparent hover:text-white"
          )}
          onClick={() => setSide('sell')}
        >
          Sell {pair.symbol}
        </button>
      </div>

      <div className="p-4 flex flex-col gap-4 flex-1">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-muted-foreground">Price (ETH per {pair.symbol})</label>
          <input
            type="number"
            value={price}
            onChange={e => setPrice(e.target.value)}
            className="w-full bg-input border border-border rounded px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
            step="0.000001"
            placeholder="0.000000"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-muted-foreground">Amount ({pair.symbol})</label>
          <input
            type="number"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="w-full bg-input border border-border rounded px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
            placeholder="0.00"
          />
        </div>

        <div className="flex gap-1">
          {[0.25, 0.5, 0.75, 1].map(perc => (
            <button
              key={perc}
              onClick={() => handlePercClick(perc)}
              className="flex-1 py-1 text-xs bg-secondary hover:bg-white/10 text-muted-foreground hover:text-white rounded transition-colors"
            >
              {perc === 1 ? 'MAX' : `${perc * 100}%`}
            </button>
          ))}
        </div>

        <div className="mt-2 pt-4 border-t border-border flex justify-between items-center font-mono">
          <span className="text-muted-foreground text-sm">Total (ETH)</span>
          <span className="text-white font-bold">{total > 0 ? formatNumber(total, 6) : '—'}</span>
        </div>

        <div className="text-[10px] text-muted-foreground text-center leading-relaxed">
          Orders are signed off-chain and matched on-chain by takers. No gas until filled.
        </div>

        <button
          disabled={isSubmitting}
          className={cn(
            "w-full py-3 rounded font-bold uppercase tracking-wider text-sm transition-all active:scale-[0.98]",
            isSubmitting
              ? "bg-secondary text-muted-foreground cursor-wait"
              : !isConnected || isWrongNetwork
              ? "bg-secondary text-white hover:bg-secondary/80"
              : side === 'buy'
              ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_15px_rgba(243,112,33,0.3)]"
              : "border-2 border-primary text-primary hover:bg-primary/10"
          )}
          onClick={handleAction}
        >
          {actionLabel()}
        </button>
      </div>

      {isDepositModalOpen && (
        <div className="absolute inset-0 bg-background/95 backdrop-blur-sm flex flex-col z-40">
          <div className="p-4 border-b border-border flex justify-between items-center bg-card">
            <h3 className="font-bold text-white">Deposit / Withdraw</h3>
            <button onClick={() => setIsDepositModalOpen(false)} className="text-muted-foreground hover:text-white text-lg leading-none">✕</button>
          </div>
          <div className="p-4 flex-1 flex flex-col gap-4 overflow-y-auto">
            <div className="flex gap-2">
              <button
                onClick={() => setDepositToken('ETH')}
                className={cn("flex-1 py-2 text-sm rounded font-bold transition-colors", depositToken === 'ETH' ? "bg-primary/20 text-primary border border-primary/50" : "bg-secondary text-muted-foreground border border-transparent")}
              >ETH</button>
              <button
                onClick={() => setDepositToken('TOKEN')}
                className={cn("flex-1 py-2 text-sm rounded font-bold transition-colors", depositToken === 'TOKEN' ? "bg-primary/20 text-primary border border-primary/50" : "bg-secondary text-muted-foreground border border-transparent")}
              >{pair.symbol}</button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-secondary/50 rounded p-2">
                <div className="text-muted-foreground mb-0.5">Wallet</div>
                <div className="font-mono font-bold text-white">
                  {depositToken === 'ETH' ? walletEth.toFixed(4) : walletToken.toFixed(4)}
                  {' '}{depositToken === 'ETH' ? 'ETH' : pair.symbol}
                </div>
              </div>
              <div className="bg-secondary/50 rounded p-2">
                <div className="text-muted-foreground mb-0.5">In DEX</div>
                <div className="font-mono font-bold text-white">
                  {depositToken === 'ETH' ? dexEthTotal.toFixed(4) : dexTokenTotal.toFixed(4)}
                  {' '}{depositToken === 'ETH' ? 'ETH' : pair.symbol}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">Amount ({depositToken === 'ETH' ? 'ETH' : pair.symbol})</label>
              <input
                type="number"
                value={depositAmount}
                onChange={e => setDepositAmount(e.target.value)}
                className="w-full bg-input border border-border rounded px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                placeholder="0.00"
              />
            </div>

            <div className="text-[10px] text-muted-foreground text-center px-2">
              Deposits are held in the EmberDelta smart contract and available for instant trades.
              {depositToken === 'TOKEN' && (
                <span className="block mt-1 text-yellow-400/70">Depositing {pair.symbol} requires two transactions: approve + deposit.</span>
              )}
            </div>

            <div className="flex gap-2 mt-auto">
              <button
                className="flex-1 py-3 bg-primary text-primary-foreground font-bold uppercase rounded hover:bg-primary/90"
                onClick={handleDeposit}
              >
                Deposit
              </button>
              <button
                className="flex-1 py-3 border border-border text-white font-bold uppercase rounded hover:bg-white/5"
                onClick={handleWithdraw}
              >
                Withdraw
              </button>
            </div>
          </div>
        </div>
      )}

      {txStatus && (
        <div className={cn(
          "fixed bottom-4 right-4 border-l-4 p-4 shadow-2xl z-50 text-sm font-medium max-w-xs",
          txError ? "bg-card border-destructive text-destructive" : "bg-card border-primary"
        )}>
          {txStatus}
        </div>
      )}
    </div>
  );
});
