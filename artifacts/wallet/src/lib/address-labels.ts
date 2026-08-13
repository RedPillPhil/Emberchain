import { formatHash } from "@/lib/utils";
import { normalizeAddress } from "@/lib/explorer-links";

/** Public name tags for well-known addresses (Etherscan-style). Keys are lowercase. */
const ADDRESS_LABELS: Record<string, string> = {
  "0x4f318f481741fffeaa88fefa156930ad613240e6": "Fathom.cx Cold Wallet",
  "0x1cb88597d4db3f24123da587adf117a3056dc85b": "Fathom.cx Hot Wallet",
};

export function getAddressLabel(address: string): string | undefined {
  return ADDRESS_LABELS[normalizeAddress(address)];
}

/** Primary display text for an address in tables and links. */
export function addressDisplayText(address: string, shortChars = 6): string {
  return getAddressLabel(address) ?? formatHash(address, shortChars);
}
