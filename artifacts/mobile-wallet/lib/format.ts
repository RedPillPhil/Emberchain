const DECIMALS = 18n;
const DIVISOR = 10n ** DECIMALS;

/** Convert wei (emb) string → human-readable EMBR string. */
export function formatEMBR(wei: string, maxDecimals = 6): string {
  if (!wei || wei === '0') return '0';
  try {
    const big = BigInt(wei);
    const neg = big < 0n;
    const abs = neg ? -big : big;
    const whole = abs / DIVISOR;
    const frac = abs % DIVISOR;
    const fracStr = frac.toString().padStart(18, '0').slice(0, maxDecimals).replace(/0+$/, '');
    const result = fracStr ? `${whole}.${fracStr}` : whole.toString();
    return neg ? `-${result}` : result;
  } catch {
    return '0';
  }
}

/** Parse human-readable EMBR → wei string. */
export function parseEMBR(embr: string): string {
  if (!embr || embr === '0') return '0';
  const clean = embr.replace(/[^0-9.]/g, '');
  const [whole = '0', frac = ''] = clean.split('.');
  const fracPadded = frac.slice(0, 18).padEnd(18, '0');
  try {
    return (BigInt(whole || '0') * DIVISOR + BigInt(fracPadded)).toString();
  } catch {
    return '0';
  }
}

/** Truncate an address: 0x1234…5678 */
export function shortAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr ?? '';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** Human-readable relative time. */
export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Validate 0x hex address (basic). */
export function isValidAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(addr);
}
