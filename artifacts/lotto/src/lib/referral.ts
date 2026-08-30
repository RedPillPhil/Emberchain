const REF_KEY = 'ember_lotto_referrer';

export function captureReferralFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const ref = params.get('ref')?.trim();
  if (!ref || !/^0x[0-9a-fA-F]{40}$/.test(ref)) return null;
  const normalized = ref.toLowerCase();
  localStorage.setItem(REF_KEY, normalized);
  return normalized;
}

export function getStoredReferrer(): string | null {
  try {
    const ref = localStorage.getItem(REF_KEY);
    if (!ref || !/^0x[0-9a-fA-F]{40}$/.test(ref)) return null;
    return ref.toLowerCase();
  } catch {
    return null;
  }
}

export function buildReferralLink(address: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://emberchain.org';
  return `${origin}/lotto/?ref=${address}`;
}
