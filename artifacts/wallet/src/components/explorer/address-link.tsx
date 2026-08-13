import React from "react";
import { Link } from "wouter";
import { cn, formatHash } from "@/lib/utils";
import { decodedAddressLink, ledgerAddressUrl, normalizeAddress } from "@/lib/explorer-links";
import { getAddressLabel } from "@/lib/address-labels";

const linkClass =
  "bg-secondary/50 px-2 py-1 rounded-sm border border-border hover:border-primary/50 hover:bg-primary/10 transition-colors";

/** Etherscan-style label + optional shortened hex. */
export function AddressLabelContent({
  address,
  showHex = true,
  shortChars = 4,
  className,
}: {
  address: string;
  showHex?: boolean;
  shortChars?: number;
  className?: string;
}) {
  const normalized = normalizeAddress(address);
  const label = getAddressLabel(normalized);
  if (!label) {
    return <span className={className}>{showHex ? formatHash(normalized, shortChars * 2) : normalized}</span>;
  }
  return (
    <span className={cn("inline-flex items-center gap-1.5 flex-wrap", className)} title={normalized}>
      <span className="font-sans font-bold tracking-normal normal-case">{label}</span>
      {showHex && (
        <span className="text-muted-foreground text-[10px] font-mono font-normal">{formatHash(normalized, shortChars)}</span>
      )}
    </span>
  );
}

/** Emberchain ledger link for a plain address (From / To / contract). */
export function LedgerAddressLink({
  address,
  className,
  showHex = true,
}: {
  address: string;
  className?: string;
  showHex?: boolean;
}) {
  const normalized = address.replace(/^=+/, "");
  return (
    <Link
      href={ledgerAddressUrl(normalized)}
      className={cn(linkClass, "inline-block break-all", className)}
      title={normalizeAddress(normalized)}
    >
      <AddressLabelContent address={normalized} showHex={showHex} />
    </Link>
  );
}

/** Address from decoded calldata — Basescan for lockEMBR baseRecipient, ledger otherwise. */
export function DecodedAddressLink({
  functionName,
  paramName,
  address,
  selector,
  className,
}: {
  functionName: string;
  paramName: string;
  address: string;
  selector?: string;
  className?: string;
}) {
  const target = decodedAddressLink(functionName, paramName, address, selector);

  if (target.external) {
    return (
      <a
        href={target.href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(linkClass, "inline-flex items-center gap-1 break-all", className)}
      >
        {address}
        {target.badge && (
          <span className="text-[10px] text-muted-foreground uppercase tracking-widest">
            ↗ {target.badge}
          </span>
        )}
      </a>
    );
  }

  return (
    <Link href={target.href} className={cn(linkClass, "inline-block break-all", className)}>
      {address}
    </Link>
  );
}
