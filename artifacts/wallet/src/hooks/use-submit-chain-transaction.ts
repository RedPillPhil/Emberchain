import { useMutation } from "@tanstack/react-query";
import type { TransactionInput } from "@workspace/api-client-react";
import { submitChainTransaction } from "@/lib/chain-node";

export function useSubmitChainTransaction() {
  return useMutation({
    mutationFn: ({ data }: { data: TransactionInput }) => submitChainTransaction(data),
  });
}
