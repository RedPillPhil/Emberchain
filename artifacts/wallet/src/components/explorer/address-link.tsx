import React from "react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { decodedAddressLink, ledgerAddressUrl } from "@/lib/explorer-links";

const linkClass =
  "bg-secondary/50 px-2 py-1 rounded-sm border border-border hover:border-primary/50 hover:bg-primary/10 transition-colors";

/** Emberchain ledger link for a plain address (From / To / contract). */
export function LedgerAddressLink({
  address,
  className,
}: {
  address: string;
  className?: string;
}) {
  const normalized = address.replace(/^=+/, "");
  return (
    <Link
      href={ledgerAddressUrl(normalized)}
      className={cn(linkClass, "inline-block break-all", className)}
    >
      {normalized}
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
