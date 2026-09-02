"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { emberchain } from "@/lib/chain";
import { useState, type ReactNode } from "react";

const config = createConfig({
  chains: [emberchain],
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    [emberchain.id]: http(emberchain.rpcUrls.default.http[0]),
  },
});

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
