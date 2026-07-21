/**
 * Privacy pool API calls — wraps the /api/privacy/* endpoints.
 * Uses the same nodeClient for node discovery + failover.
 */
import { nodeClient } from './nodeClient';
import { parseEMBR } from './format';

export interface PrivacyStatus {
  poolSize: number;
  noteCount: number;
  totalShielded: string;
}

export interface PrivateBalance {
  balance: string;          // wei
  noteCount: number;
  notes: Array<{ amount: string; nullifier: string }>;
}

export interface PrivacyRecord {
  id: number;
  type: 'shield' | 'send' | 'unshield';
  fromAddress?: string;
  toAddress?: string;
  amount: string;
  fee?: string;
  commitment: string;
  createdAt: string;
}

// Expose the raw api call via a small wrapper so we reuse nodeClient's failover
async function call<T>(path: string, opts: RequestInit = {}): Promise<T> {
  // @ts-ignore – access internal apiCall via the same pattern
  const node = (nodeClient as any).getActiveNode?.() ?? null;
  const base = node ?? 'http://localhost:3000'; // fallback for dev
  const res = await fetch(`${base}/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(body || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function nodeBase(): string {
  return (nodeClient as any).getActiveNode?.() ?? '';
}

async function apiPrivacy<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const base = nodeBase();
  if (!base) throw new Error('No node connected. Please wait for peer discovery.');
  const res = await fetch(`${base}/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    let msg = body;
    try { msg = JSON.parse(body).error ?? body; } catch {}
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const privacyClient = {
  getStatus: () => apiPrivacy<PrivacyStatus>('/privacy/status'),

  getBalance: (privateKey: string) =>
    apiPrivacy<PrivateBalance>('/privacy/balance', {
      method: 'POST',
      body: JSON.stringify({ privateKey }),
    }),

  shield: (fromPrivateKey: string, amountEmbr: string, toAddress?: string) =>
    apiPrivacy<PrivacyRecord>('/privacy/shield', {
      method: 'POST',
      body: JSON.stringify({
        fromPrivateKey,
        amount: parseEMBR(amountEmbr),
        ...(toAddress ? { toAddress } : {}),
      }),
    }),

  privateSend: (fromPrivateKey: string, toAddress: string, amountEmbr: string) =>
    apiPrivacy<PrivacyRecord>('/privacy/send', {
      method: 'POST',
      body: JSON.stringify({
        fromPrivateKey,
        toAddress,
        amount: parseEMBR(amountEmbr),
      }),
    }),

  unshield: (fromPrivateKey: string, toAddress: string, amountEmbr: string) =>
    apiPrivacy<PrivacyRecord>('/privacy/unshield', {
      method: 'POST',
      body: JSON.stringify({
        fromPrivateKey,
        toAddress,
        amount: parseEMBR(amountEmbr),
      }),
    }),

  listLedger: (limit = 20) =>
    apiPrivacy<PrivacyRecord[]>(`/privacy/transactions?limit=${limit}`),
};
