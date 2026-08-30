import { resolveApiServer } from '@/lib/config';

export interface LottoConfig {
  ticketPriceEmbr: number;
  ticketPriceWei: string;
  treasuryAddress: string | null;
  numberMin: number;
  numberMax: number;
  numbersPerTicket: number;
  referralBonusPct: number;
}

export interface LottoDrawStatus {
  drawId: number;
  ticketCount: number;
  jackpotEmbr: string;
  closesAt: string;
  winningNumbers: number[] | null;
  drawn: boolean;
}

export interface LottoTicket {
  id: number;
  drawId: number;
  player: string;
  numbers: number[];
  txHash: string;
  referrer: string | null;
  createdAt: string;
  matches: number | null;
}

export interface ReferralStats {
  address: string;
  referralCount: number;
  bonusEmbr: string;
}

function apiBase(): string {
  return resolveApiServer();
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.error ?? `HTTP ${res.status}`);
  }
  return json as T;
}

export async function fetchLottoConfig(): Promise<LottoConfig> {
  return apiJson('/api/lotto/config');
}

export async function fetchDrawStatus(drawId?: number): Promise<LottoDrawStatus> {
  const q = drawId != null ? `?drawId=${drawId}` : '';
  return apiJson(`/api/lotto/status${q}`);
}

export async function fetchMyTickets(address: string, drawId?: number): Promise<LottoTicket[]> {
  const q = new URLSearchParams({ address });
  if (drawId != null) q.set('drawId', String(drawId));
  const data = await apiJson<{ tickets: LottoTicket[] }>(`/api/lotto/tickets?${q}`);
  return data.tickets;
}

export async function registerTicket(input: {
  player: string;
  numbers: number[];
  txHash: string;
  referrer?: string | null;
}): Promise<LottoTicket> {
  return apiJson('/api/lotto/tickets', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function fetchReferralStats(address: string): Promise<ReferralStats> {
  return apiJson(`/api/lotto/referrals/${encodeURIComponent(address)}`);
}
