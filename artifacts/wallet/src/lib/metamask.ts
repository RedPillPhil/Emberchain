import { chainNodeRpcUrl } from "@/lib/config";

const EMBER_CHAIN_ID = "0x1E5D";
const BASE_CHAIN_ID = "0x2105";
const WEMBR_ADDRESS = "0x9362587019Ea0e4ef90fbd981c615d4441D9D2c4";

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  isMetaMask?: boolean;
};

function getProvider(): EthereumProvider | null {
  if (typeof window === "undefined") return null;
  const eth = (window as Window & { ethereum?: EthereumProvider }).ethereum;
  return eth ?? null;
}

function siteOrigin(): string {
  if (typeof location !== "undefined") return location.origin;
  return "https://emberchain.org";
}

function emberRpcUrl(): string {
  const rpc = chainNodeRpcUrl();
  if (rpc.startsWith("http")) return rpc;
  return `${siteOrigin()}/api/rpc`;
}

function emberLogoUrls(): string[] {
  const origin = siteOrigin();
  // MetaMask reliably shows PNG for custom-chain native currency; SVG often shows "?".
  return [`${origin}/ember-coin.png`, `${origin}/ember-coin.svg`];
}

function emberLogoUrl(): string {
  return emberLogoUrls()[0];
}

export async function addEmberToMetaMask(): Promise<{ ok: boolean; message: string }> {
  const provider = getProvider();
  if (!provider) {
    return { ok: false, message: "MetaMask not detected. Install MetaMask to continue." };
  }

  const logo = emberLogoUrl();

  try {
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: EMBER_CHAIN_ID,
          chainName: "Emberchain",
          nativeCurrency: { name: "EMBR", symbol: "EMBR", decimals: 18 },
          rpcUrls: [emberRpcUrl()],
          blockExplorerUrls: [`${siteOrigin()}/ledger`],
          iconUrls: emberLogoUrls(),
        },
      ],
    });
  } catch (err: unknown) {
    const code = (err as { code?: number })?.code;
    // 4902 = already added — try switching so MetaMask refreshes network context
    if (code === 4902) {
      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: EMBER_CHAIN_ID }],
        });
      } catch { /* continue to wEMBR step */ }
    } else if (code !== 4001 && code !== -32603) {
      return { ok: false, message: "Could not add Emberchain network to MetaMask." };
    }
  }

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: BASE_CHAIN_ID }],
    });
  } catch (err: unknown) {
    const code = (err as { code?: number })?.code;
    if (code === 4902) {
      try {
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: BASE_CHAIN_ID,
              chainName: "Base",
              nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
              rpcUrls: ["https://mainnet.base.org"],
              blockExplorerUrls: ["https://basescan.org"],
            },
          ],
        });
      } catch {
        return { ok: false, message: "Added Emberchain, but could not switch to Base for wEMBR." };
      }
    } else if (code === 4001) {
      return { ok: false, message: "Network add cancelled." };
    }
  }

  try {
    await provider.request({
      method: "wallet_watchAsset",
      params: {
        type: "ERC20",
        options: {
          address: WEMBR_ADDRESS,
          symbol: "wEMBR",
          decimals: 18,
          image: logo,
        },
      },
    });
  } catch (err: unknown) {
    const code = (err as { code?: number })?.code;
    if (code === 4001) {
      return { ok: true, message: "Emberchain added. wEMBR import was cancelled." };
    }
    return { ok: true, message: "Emberchain added. wEMBR may already be in your wallet." };
  }

  return {
    ok: true,
    message:
      "Emberchain network and wEMBR token added. wEMBR shows a logo via token import; native EMBR logo in MetaMask requires Chainlist approval (ethereum-lists/chains) — iconUrls from sites is usually ignored. To remove/re-add Emberchain: switch to Base or Ethereum first, then Settings → Networks → Delete.",
  };
}
