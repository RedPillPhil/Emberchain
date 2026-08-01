import { useCallback } from "react";
import { useAccount, useReadContract, useWatchContractEvent } from "wagmi";
import { formatEther } from "viem";
import { BASE_CHAIN_ID, EMBER_DELTA_ABI, EMBER_DELTA_ADDRESS, ETH_ADDR } from "@/lib/contracts";

/**
 * Read EmberDelta.tokens(token, user) — the canonical on-chain deposit balance.
 * Uses a minimal ABI so wagmi never confuses this with ERC-20 balanceOf(owner).
 */
export const DEX_TOKENS_ABI = [
  {
    name: "tokens",
    type: "function",
    inputs: [
      { name: "token", type: "address" },
      { name: "user", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

export function useDexDeposited(token: `0x${string}`) {
  const { address, chainId } = useAccount();
  const onBase = chainId === BASE_CHAIN_ID;

  const { data, refetch, isLoading, isFetching } = useReadContract({
    address: EMBER_DELTA_ADDRESS,
    abi: DEX_TOKENS_ABI,
    functionName: "tokens",
    args: address && onBase ? [token, address] : undefined,
    chainId: BASE_CHAIN_ID,
    query: { enabled: !!address && onBase },
  });

  const refetchDeposited = useCallback(async () => {
    const result = await refetch();
    return result.data ?? 0n;
  }, [refetch]);

  const depositedWei = typeof data === "bigint" ? data : 0n;
  const deposited = parseFloat(formatEther(depositedWei));

  return {
    depositedWei,
    deposited,
    isLoading: isLoading || isFetching,
    refetchDeposited,
  };
}

/** Refetch DEX balances when the user deposits or withdraws on EmberDelta. */
export function useDexDepositEvents(onChange: () => void) {
  const { address } = useAccount();

  const args = address ? { user: address as `0x${string}` } : undefined;

  useWatchContractEvent({
    address: EMBER_DELTA_ADDRESS,
    abi: EMBER_DELTA_ABI,
    eventName: "Deposit",
    args,
    onLogs: onChange,
  });

  useWatchContractEvent({
    address: EMBER_DELTA_ADDRESS,
    abi: EMBER_DELTA_ABI,
    eventName: "Withdraw",
    args,
    onLogs: onChange,
  });
}

export { ETH_ADDR };
