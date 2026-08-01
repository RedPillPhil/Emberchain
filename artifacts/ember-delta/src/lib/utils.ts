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

/** Strip spreadsheet/formula junk and validate a 0x-prefixed address. */
export function normalizeHexAddress(addr: string | null | undefined): string | null {
  if (addr == null || addr === "") return null;
  const cleaned = addr.trim().replace(/^=+/, "");
  if (!/^0x[0-9a-fA-F]{40}$/.test(cleaned)) {
    throw new Error(`Invalid address: ${addr}`);
  }
  return cleaned;
}
