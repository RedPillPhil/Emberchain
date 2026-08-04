/** Optional fields chain-node attaches once EVM logs / inner CALLs are indexed. */

export interface TxInternalTransfer {
  from: string;
  to: string;
  value: string;
}

export interface TxLog {
  address: string;
  topics: string[];
  data: string;
}

export type TxWithInternals = {
  value: string;
  internalTransfers?: TxInternalTransfer[] | null;
  logs?: TxLog[] | null;
};

export function internalMovedWei(tx: TxWithInternals): bigint {
  const rows = tx.internalTransfers ?? [];
  return rows.reduce((sum, t) => {
    try {
      return sum + BigInt(t.value);
    } catch {
      return sum;
    }
  }, 0n);
}
