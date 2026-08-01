import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ExchangeListing } from "@workspace/api-client-react";
import {
  fetchExchangeListings,
  reserveListing,
  buyListing,
  createListing,
  cancelListing,
} from "@/lib/exchange-api";

export function exchangeListingsQueryKey(status?: string) {
  return ["exchange-listings", status ?? "all"] as const;
}

export function useExchangeListings(status?: string, options?: { refetchInterval?: number | false }) {
  return useQuery({
    queryKey: exchangeListingsQueryKey(status),
    queryFn: () => fetchExchangeListings(status),
    staleTime: 30_000,
    refetchInterval: options?.refetchInterval ?? 60_000,
  });
}

export function useExchangeReserve() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, buyerAddress }: { id: string; buyerAddress: string }) =>
      reserveListing(id, buyerAddress),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["exchange-listings"] }),
  });
}

export function useExchangeBuy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: { buyerAddress: string; paymentTxHash: string; selectedNetwork?: string };
    }) => buyListing(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["exchange-listings"] }),
  });
}

export function useExchangeCreate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ data }: { data: Record<string, unknown> }) => createListing(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["exchange-listings"] }),
  });
}

export function useExchangeCancel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, sellerPrivateKey }: { id: string; sellerPrivateKey: string }) =>
      cancelListing(id, sellerPrivateKey),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["exchange-listings"] }),
  });
}

export type { ExchangeListing };
