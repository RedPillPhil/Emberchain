/** Normalize a hex address for URLs and comparisons. */
export function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

/** Ledger explorer deep link for an Emberchain address or tx hash. */
export function ledgerLookupUrl(value: string): string {
  return `/ledger?q=${encodeURIComponent(value.trim())}`;
}

export function ledgerAddressUrl(address: string): string {
  return ledgerLookupUrl(normalizeAddress(address));
}

export function basescanAddressUrl(address: string): string {
  return `https://basescan.org/address/${normalizeAddress(address)}`;
}

/** Link target for an address decoded from contract calldata. */
export function decodedAddressLink(
  functionName: string,
  paramName: string,
  address: string,
  selector?: string,
): { href: string; external: boolean; badge?: string } {
  const fn = functionName.toLowerCase();
  const param = paramName.toLowerCase();
  const sel = selector?.toLowerCase();

  // lockEMBR(address baseRecipient, uint256 nonce) — recipient lives on Base
  if (
    param === "baserecipient" &&
    (fn === "lockembr" || sel === "0x7ea803f0")
  ) {
    return { href: basescanAddressUrl(address), external: true, badge: "Base" };
  }

  return { href: ledgerAddressUrl(address), external: false };
}
