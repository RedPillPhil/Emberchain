export const EMBER_BRIDGE_ADDRESS =
  import.meta.env.VITE_EMBER_BRIDGE_ADDRESS ??
  "0x9362587019ea0e4ef90fbd981c615d4441d9d2c4";

export const EMBERCHAIN_BRIDGE_ADDRESS =
  import.meta.env.VITE_EMBERCHAIN_BRIDGE_ADDRESS ??
  "0x1573EdF8F933601e6f37AC9B104cF62C7f85a0F4";

export const BASE_RPC_URL = import.meta.env.VITE_BASE_RPC_URL ?? "https://mainnet.base.org";

export const EMBR_BRIDGE_ABI = [
  "event BridgeOut(address indexed sender, address indexed baseRecipient, uint256 amount, uint256 indexed nonce)",
  "function lockEMBR(address baseRecipient, uint256 nonce) payable",
  "function usedNonces(uint256 nonce) view returns (bool)",
  "function releaseEMBR(address payable recipient, uint256 amount, uint256 nonce)",
  "function relayer() view returns (address)",
] as const;

export const BASE_BRIDGE_ABI = [
  "event BridgeOut(address indexed sender, string embrRecipient, uint256 amount, uint256 indexed nonce)",
  "function usedNonces(uint256 nonce) view returns (bool)",
  "function bridgeIn(address recipient, uint256 amount, uint256 nonce)",
  "function relayer() view returns (address)",
] as const;
