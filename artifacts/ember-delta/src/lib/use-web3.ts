import { useState, useEffect, useCallback } from 'react';
import { useAccount, useBalance, useReadContract, useChainId, useSwitchChain, useConnect, useDisconnect } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { formatEther } from 'viem';
import { chainNodeApi } from './config';
import { WEMBR_ADDRESS, ERC20_ABI, BASE_CHAIN_ID, EMBER_DELTA_ADDRESS } from './contracts';
import { DEX_TOKENS_ABI, ETH_ADDR } from './dex-balances';

export function useWeb3() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const [embrBalance, setEmbrBalance] = useState<number | null>(null);

  const isWrongNetwork = isConnected && chainId !== BASE_CHAIN_ID;
  const onBase = isConnected && chainId === BASE_CHAIN_ID;

  const { data: ethBalanceData, refetch: refetchEthBalance } = useBalance({
    address,
    chainId: BASE_CHAIN_ID,
    query: { enabled: !!address && onBase },
  });

  const { data: wembrWalletRaw, refetch: refetchWembrWallet } = useReadContract({
    address: WEMBR_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: BASE_CHAIN_ID,
    query: { enabled: !!address && onBase, refetchInterval: 30_000 },
  });

  const { data: ethDepositedRaw, refetch: refetchEthDeposited } = useReadContract({
    address: EMBER_DELTA_ADDRESS,
    abi: DEX_TOKENS_ABI,
    functionName: 'tokens',
    args: address && onBase ? [ETH_ADDR, address] : undefined,
    chainId: BASE_CHAIN_ID,
    query: { enabled: !!address && onBase, refetchInterval: 30_000 },
  });

  const { data: wembrDepositedRaw, refetch: refetchWembrDeposited } = useReadContract({
    address: EMBER_DELTA_ADDRESS,
    abi: DEX_TOKENS_ABI,
    functionName: 'tokens',
    args: address && onBase ? [WEMBR_ADDRESS, address] : undefined,
    chainId: BASE_CHAIN_ID,
    query: { enabled: !!address && onBase, refetchInterval: 30_000 },
  });

  const ethBalance = ethBalanceData ? parseFloat(formatEther(ethBalanceData.value)) : null;
  const wembrWalletBalance = wembrWalletRaw != null ? parseFloat(formatEther(wembrWalletRaw as bigint)) : null;
  const ethDeposited = ethDepositedRaw != null ? parseFloat(formatEther(ethDepositedRaw as bigint)) : null;
  const wembrDeposited = wembrDepositedRaw != null ? parseFloat(formatEther(wembrDepositedRaw as bigint)) : null;

  useEffect(() => {
    if (!address) { setEmbrBalance(null); return; }
    let cancelled = false;

    const fetchEmbrBalance = async () => {
      try {
        const res = await fetch(chainNodeApi(`/api/wallets/${address}`));
        if (!res.ok) { setEmbrBalance(null); return; }
        const data = await res.json();
        const raw: string = data?.balance ?? data?.data?.balance ?? '0';
        const wei = typeof raw === 'string' && raw.startsWith('0x')
          ? BigInt(raw)
          : BigInt(Math.floor(Number(raw)));
        if (!cancelled) setEmbrBalance(parseFloat(formatEther(wei)));
      } catch {
        if (!cancelled) setEmbrBalance(null);
      }
    };

    fetchEmbrBalance();
    const interval = setInterval(fetchEmbrBalance, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [address]);

  const refetchBalances = useCallback(async () => {
    await Promise.all([
      refetchEthBalance(),
      refetchWembrWallet(),
      refetchEthDeposited(),
      refetchWembrDeposited(),
    ]);
  }, [refetchEthBalance, refetchWembrWallet, refetchEthDeposited, refetchWembrDeposited]);

  const connectWallet = () => connect({ connector: injected() });
  const disconnectWallet = () => disconnect();
  const switchToBase = () => switchChain({ chainId: BASE_CHAIN_ID });

  return {
    address,
    isConnected,
    isWrongNetwork,
    ethBalance,
    wembrWalletBalance,
    ethDeposited,
    wembrDeposited,
    embrBalance,
    connectWallet,
    disconnectWallet,
    switchToBase,
    chainId,
    refetchBalances,
  };
}
