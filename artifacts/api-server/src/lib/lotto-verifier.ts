/**
 * Verify native EMBR ticket payments on Emberchain via chain-node.
 */

const CHAIN_NODE_URL = (process.env.READ_NODE_URL ?? process.env.CHAIN_NODE_URL ?? 'http://localhost:8082').replace(/\/$/, '');

export interface VerifiedLottoPayment {
  from: string;
  to: string;
  value: bigint;
  status: string;
}

type ChainTx = {
  from?: string;
  to?: string;
  value?: string;
  status?: string;
};

export async function verifyLottoPayment(
  txHash: string,
  expectedTo: string,
  expectedValueWei: bigint,
): Promise<VerifiedLottoPayment> {
  const url = `${CHAIN_NODE_URL}/api/transactions/${encodeURIComponent(txHash)}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  });

  if (res.status === 404) {
    throw new Error('Transaction not found on Emberchain — wait for confirmation');
  }
  if (!res.ok) {
    throw new Error(`Chain node HTTP ${res.status} while verifying payment`);
  }

  const tx = (await res.json()) as ChainTx;
  if (!tx.from || !tx.to || tx.value == null) {
    throw new Error('Incomplete transaction data from chain node');
  }
  if (tx.status === 'pending') {
    throw new Error('Transaction still pending — wait for confirmation');
  }
  if (tx.status === 'failed') {
    throw new Error('Payment transaction failed on-chain');
  }

  const to = tx.to.toLowerCase();
  const from = tx.from.toLowerCase();
  const expected = expectedTo.toLowerCase();
  if (to !== expected) {
    throw new Error('Payment was not sent to the lotto treasury address');
  }

  const value = BigInt(tx.value);
  if (value < expectedValueWei) {
    throw new Error(`Insufficient payment — need at least ${expectedValueWei} wei`);
  }

  return { from, to, value, status: tx.status ?? 'confirmed' };
}
