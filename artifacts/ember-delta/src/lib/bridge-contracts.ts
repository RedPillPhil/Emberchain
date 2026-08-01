function envAddress(value: string | undefined, fallback: string): string {
  return (value ?? fallback).trim().replace(/^=+/, "");
}

export const EMBER_BRIDGE_ADDRESS = envAddress(
  import.meta.env.VITE_EMBER_BRIDGE_ADDRESS,
  "0x9362587019ea0e4ef90fbd981c615d4441d9d2c4",
);

export const EMBERCHAIN_BRIDGE_ADDRESS = envAddress(
  import.meta.env.VITE_EMBERCHAIN_BRIDGE_ADDRESS,
  "0x1573EdF8F933601e6f37AC9B104cF62C7f85a0F4",
);

export const WEMBR_ADDRESS = envAddress(
  import.meta.env.VITE_WEMBR_ADDRESS,
  "0x9362587019Ea0e4ef90fbd981c615d4441D9D2c4",
);

export const BASE_RPC_URL =
  import.meta.env.VITE_BASE_RPC_URL ?? "https://mainnet.base.org";
