import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "/airdrop";
export const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? "https://emberchain.org";

export function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_ORIGIN}/api/airdrop${p}`;
}

export function siteUrl(path: string): string {
  if (path.startsWith("http")) return path;
  return `${SITE_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
}

export function appUrl(path = ""): string {
  const base = `${SITE_ORIGIN}${BASE_PATH}`.replace(/\/$/, "");
  if (!path) return `${base}/`;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
