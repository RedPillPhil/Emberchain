import { createConfig, http } from 'wagmi';
import { base } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';
import type { Chain } from 'viem';

// Emberchain is EVM-compatible (chain ID 7773).
//
// IMPORTANT: MetaMask is a browser extension — it makes its own HTTP requests
// from its own origin, not from the page. A relative URL like /api-server/api/rpc
// is meaningless to MetaMask. We must pass an absolute URL so wallet_addEthereumChain
// works correctly and MetaMask can actually reach the Emberchain RPC.
const EMBR_RPC =
  import.meta.env.PROD
    ? 'https://emberchain.org/api/rpc'
    : `${typeof window !== 'undefined' ? window.location.origin : 'http://localhost'}/api/rpc`;

export const emberchain: Chain = {
  id: 7773,
  name: 'Emberchain',
  nativeCurrency: { name: 'EMBR', symbol: 'EMBR', decimals: 18 },
  rpcUrls: {
    default: { http: [EMBR_RPC] },
  },
  blockExplorers: {
    default: { name: 'Ember Explorer', url: 'https://emberchain.org' },
  },
};

export const wagmiConfig = createConfig({
  chains: [base, emberchain],
  connectors: [
    injected(), // MetaMask, Coinbase Wallet, Brave, etc.
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
