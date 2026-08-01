import { createConfig, http } from 'wagmi';
import { base } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';
import type { Chain } from 'viem';
import { CHAIN_NODE_URL } from '@/lib/config';

// Emberchain is EVM-compatible (chain ID 7773).
//
// MetaMask makes HTTP requests from its own origin — use an absolute RPC URL in prod,
// and same-origin /api/rpc in dev (Vite proxy → chain node).
const EMBR_RPC =
  import.meta.env.PROD
    ? `${CHAIN_NODE_URL}/api/rpc`
    : `${typeof window !== 'undefined' ? window.location.origin : 'http://localhost:18912'}/api/rpc`;

export const emberchain: Chain = {
  id: 7773,
  name: 'Emberchain',
  nativeCurrency: { name: 'EMBR', symbol: 'EMBR', decimals: 18 },
  rpcUrls: {
    default: { http: [EMBR_RPC] },
  },
  blockExplorers: {
    default: { name: 'Ember Explorer', url: CHAIN_NODE_URL },
  },
};

export const wagmiConfig = createConfig({
  chains: [base, emberchain],
  connectors: [
    injected(),
  ],
  transports: {
    [base.id]: http(),
    [emberchain.id]: http(EMBR_RPC),
  },
});

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig;
  }
}
