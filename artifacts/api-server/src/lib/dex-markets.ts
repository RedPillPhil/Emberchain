/**
 * Ember Delta exchange market list — merges built-in, featured, and live launches.
 */

import { listFeaturedTokens, listHiddenAddresses, hideToken, deleteFeaturedToken } from "./dex-featured-db";
import {
  getLaunchByWrappedAddress,
  getLiveLaunches,
  updateLaunchFields,
  type TokenLaunch,
} from "./launch-db";

const WEMBR_ADDRESS = "0x9362587019ea0e4ef90fbd981c615d4441d9d2c4";

export interface DexMarketEntry {
  tokenAddress: string;
  symbol: string;
  name: string;
  source: "builtin" | "featured" | "launch";
  launchId?: string;
  canRemove: boolean;
}

export async function listDexMarkets(includeHidden = false): Promise<DexMarketEntry[]> {
  const hidden = includeHidden ? new Set<string>() : await listHiddenAddresses();
  const byAddr = new Map<string, DexMarketEntry>();

  if (!hidden.has(WEMBR_ADDRESS)) {
    byAddr.set(WEMBR_ADDRESS, {
      tokenAddress: WEMBR_ADDRESS,
      symbol: "wEMBR",
      name: "Wrapped Emberchain",
      source: "builtin",
      canRemove: false,
    });
  }

  for (const t of await listFeaturedTokens(!includeHidden)) {
    const addr = t.tokenAddress.toLowerCase();
    if (hidden.has(addr)) continue;
    byAddr.set(addr, {
      tokenAddress: addr,
      symbol: t.symbol,
      name: t.name,
      source: "featured",
      canRemove: addr !== WEMBR_ADDRESS,
    });
  }

  for (const launch of await getLiveLaunches()) {
    const addr = launch.wrapped_token_address?.toLowerCase();
    if (!addr || hidden.has(addr)) continue;
    byAddr.set(addr, {
      tokenAddress: addr,
      symbol: launch.wrapped_symbol,
      name: launch.token_name ? `Wrapped ${launch.token_name}` : launch.wrapped_symbol,
      source: "launch",
      launchId: launch.id,
      canRemove: addr !== WEMBR_ADDRESS,
    });
  }

  return [...byAddr.values()];
}

/** Operator delist — hides from exchange UI for all users. */
export async function delistDexMarket(address: string, reason?: string): Promise<{
  hidden: boolean;
  launchDelisted: boolean;
  featuredRemoved: boolean;
}> {
  const addr = address.toLowerCase();
  if (addr === WEMBR_ADDRESS) {
    throw new Error("wEMBR cannot be delisted");
  }

  const launch = await getLaunchByWrappedAddress(addr);
  await hideToken({
    address: addr,
    symbol: launch?.wrapped_symbol,
    reason: reason ?? "operator delist",
  });

  let launchDelisted = false;
  if (launch && launch.status === "live") {
    await updateLaunchFields(launch.id, {
      status: "delisted",
      admin_notes: reason ?? "Delisted from Ember Delta by operator",
    });
    launchDelisted = true;
  }

  const featuredRemoved = await deleteFeaturedToken(addr);

  return { hidden: true, launchDelisted, featuredRemoved };
}

export function filterLaunchesByHidden(
  launches: TokenLaunch[],
  hidden: Set<string>,
): TokenLaunch[] {
  return launches.filter((l) => {
    const addr = l.wrapped_token_address?.toLowerCase();
    return addr && !hidden.has(addr);
  });
}
