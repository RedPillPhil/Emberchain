function trimUrl(url: string | undefined): string {
  return url?.replace(/\/+$/, '') ?? '';
}

function isEmberchainSite(): boolean {
  if (typeof location === 'undefined') return false;
  return /^(www\.)?emberchain\.org$/i.test(location.hostname);
}

function isSelfHostedSite(): boolean {
  if (typeof location === 'undefined') return false;
  const h = location.hostname.toLowerCase();
  return isEmberchainSite() || h === 'emberchain.duckdns.org';
}

const DEFAULT_CHAIN_NODE = 'https://emberchain.duckdns.org';

export const CHAIN_NODE_URL =
  trimUrl(import.meta.env.VITE_CHAIN_NODE_URL) || DEFAULT_CHAIN_NODE;

export const API_SERVER = trimUrl(import.meta.env.VITE_API_URL);

export function resolveChainNodeUrl(): string {
  if (isSelfHostedSite()) return '';
  if (import.meta.env.DEV) return '';
  const explicit = trimUrl(import.meta.env.VITE_CHAIN_NODE_URL);
  if (explicit) return explicit;
  return DEFAULT_CHAIN_NODE;
}

function chainNodeOrigin(): string {
  const base = resolveChainNodeUrl();
  if (base) return base;
  if (typeof location !== 'undefined') return location.origin;
  return DEFAULT_CHAIN_NODE;
}

export function chainNodeApi(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${chainNodeOrigin()}${p}`;
}

export function resolveApiServer(): string {
  if (API_SERVER) return API_SERVER;
  if (isSelfHostedSite()) return chainNodeOrigin();
  const node = resolveChainNodeUrl();
  if (node) return node;
  return DEFAULT_CHAIN_NODE;
}
