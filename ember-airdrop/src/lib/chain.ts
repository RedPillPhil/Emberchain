import { defineChain } from "viem";

export const EMBERCHAIN_ID = 7773;

export const emberchain = defineChain({
  id: EMBERCHAIN_ID,
  name: "Emberchain",
  nativeCurrency: { name: "Ember", symbol: "EMBR", decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_EMBER_RPC ?? "https://emberchain.org/api/rpc"],
    },
  },
  blockExplorers: {
    default: { name: "Emberchain", url: "https://emberchain.org" },
  },
});

export function checkinMessage(wallet: string, dayKey: string): string {
  return `Ember Airdrop daily check-in\nwallet:${wallet.toLowerCase()}\nday:${dayKey}\nchain:7773`;
}

export function utcDayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}
