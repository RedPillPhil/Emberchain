import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatNumber(num: number, decimals: number = 2): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}

export function formatUsd(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return "—";
  if (amount >= 10_000) return `$${formatNumber(amount, 0)}`;
  if (amount >= 100) return `$${formatNumber(amount, 0)}`;
  if (amount >= 1) return `$${formatNumber(amount, 2)}`;
  if (amount >= 0.01) return `$${formatNumber(amount, 2)}`;
  return `$${formatNumber(amount, 4)}`;
}

export function shortAddress(addr: string, chars = 4): string {
  if (!addr || addr.length < 10) return addr || "—";
  return `${addr.slice(0, 2 + chars)}…${addr.slice(-chars)}`;
}

/** Strip spreadsheet/formula junk and validate a 0x-prefixed address. */
export function normalizeHexAddress(addr: string | null | undefined): string | null {
  if (addr == null || addr === "") return null;
  const cleaned = addr.trim().replace(/^=+/, "");
  if (!/^0x[0-9a-fA-F]{40}$/.test(cleaned)) {
    throw new Error(`Invalid address: ${addr}`);
  }
  return cleaned;
}
