import { chainNodeApi, CHAIN_NODE_URL, resolveChainNodeUrl } from '@/lib/config';

export const CHAIN_GAS_PRICE = 1_000_000_000n;

export interface ChainTransaction {
  hash: string;
  status: string;
  error?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chainNodeUrls(path: string): string[] {
  const p = path.startsWith('/') ? path : `/${path}`;
  const primary = chainNodeApi(p);
  const urls = [primary];
  if (resolveChainNodeUrl() === '' && typeof location !== 'undefined') {
    const direct = `${CHAIN_NODE_URL}${p}`;
    if (direct !== primary) urls.push(direct);
  }
  return urls;
}

async function fetchChainNodeJson<T>(
  path: string,
  init?: RequestInit,
): Promise<{ res: Response; json: T }> {
  const urls = chainNodeUrls(path);
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 4; attempt++) {
    const url = urls[Math.min(attempt, urls.length - 1)]!;
    try {
      const res = await fetch(url, init);
      const ct = res.headers.get('content-type') ?? '';
      if (!ct.includes('application/json')) {
        if ((res.status >= 500 || res.status === 429) && attempt < 3) {
          lastError = new Error(`Expected JSON from chain node (HTTP ${res.status})`);
          await sleep(300 * (attempt + 1));
          continue;
        }
        throw new Error(`Expected JSON from chain node (HTTP ${res.status})`);
      }
      const json = (await res.json()) as T;
      if (!res.ok) {
        const msg = (json as { error?: string })?.error ?? `HTTP ${res.status}`;
        if ((res.status >= 500 || res.status === 429) && attempt < 3) {
          lastError = new Error(msg);
          await sleep(300 * (attempt + 1));
          continue;
        }
        throw new Error(msg);
      }
      return { res, json };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < 3) {
        await sleep(300 * (attempt + 1));
        continue;
      }
      throw lastError;
    }
  }

  throw lastError ?? new Error('Chain node request failed');
}

export async function fetchWalletBalance(address: string): Promise<bigint> {
  const path = `/api/wallets/${encodeURIComponent(address)}`;
  const { json } = await fetchChainNodeJson<{ balance?: string }>(path);
  return BigInt(json.balance ?? '0');
}

export async function submitChainTransaction(input: {
  fromPrivateKey: string;
  to: string;
  value: string;
  data?: string;
  gasLimit?: string;
}): Promise<ChainTransaction> {
  const body = {
    fromPrivateKey: input.fromPrivateKey,
    to: input.to,
    value: input.value,
    data: input.data ?? '0x',
    gasLimit: input.gasLimit ?? '3000000',
  };
  const { json } = await fetchChainNodeJson<ChainTransaction>('/api/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return json;
}

export async function getChainTransaction(hash: string): Promise<ChainTransaction | undefined> {
  const path = `/api/transactions/${encodeURIComponent(hash)}`;
  const urls = chainNodeUrls(path);

  for (let attempt = 0; attempt < 4; attempt++) {
    const url = urls[Math.min(attempt, urls.length - 1)]!;
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (res.status === 404) return undefined;
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      return json as ChainTransaction;
    } catch (err) {
      if (attempt < 3) {
        await sleep(300 * (attempt + 1));
        continue;
      }
      throw err;
    }
  }
  return undefined;
}

export async function waitForChainTransaction(
  hash: string,
  timeoutMs = 90_000,
  pollMs = 2_000,
): Promise<ChainTransaction> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const tx = await getChainTransaction(hash);
    if (tx && tx.status !== 'pending') {
      if (tx.status === 'failed') {
        throw new Error(tx.error ?? 'Transaction failed on-chain');
      }
      return tx;
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error(`Transaction ${hash} was not confirmed within ${timeoutMs / 1000}s`);
}

export function maxSpendableEmbr(balanceWei: bigint, gasLimit: bigint | string): bigint {
  const gasReserve = BigInt(gasLimit) * CHAIN_GAS_PRICE;
  return balanceWei > gasReserve ? balanceWei - gasReserve : 0n;
}

export function parseEmbrToWei(amount: number | string): bigint {
  const [whole, frac = ''] = String(amount).split('.');
  const fracPadded = frac.padEnd(18, '0').slice(0, 18);
  return BigInt(whole || '0') * 10n ** 18n + BigInt(fracPadded || '0');
}

export function weiToHex(wei: bigint): string {
  return `0x${wei.toString(16)}`;
}
