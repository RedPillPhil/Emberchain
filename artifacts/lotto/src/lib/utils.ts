import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function shortAddress(addr: string, chars = 4): string {
  if (!addr || addr.length < 10) return addr || '—';
  return `${addr.slice(0, 2 + chars)}…${addr.slice(-chars)}`;
}

export function formatEmbr(wei: string | bigint, decimals = 4): string {
  const value = typeof wei === 'bigint' ? wei : BigInt(wei || '0');
  const whole = value / 10n ** 18n;
  const frac = value % 10n ** 18n;
  const fracStr = frac.toString().padStart(18, '0').slice(0, decimals);
  return `${whole}.${fracStr.padEnd(decimals, '0')}`.replace(/\.?0+$/, '') || '0';
}
