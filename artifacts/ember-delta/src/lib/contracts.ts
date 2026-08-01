// artifacts/ember-delta/src/lib/contracts.ts

export const BASE_CHAIN_ID = 8453;
export const EMBERCHAIN_CHAIN_ID = 7773;

// Bridge contract on Emberchain (for EMBR → wEMBR direction)
// Deployed alongside the relayer — set VITE_EMBER_BRIDGE_ADDRESS to activate.
export const EMBER_BRIDGE_ADDRESS = (
  import.meta.env.VITE_EMBER_BRIDGE_ADDRESS ??
  '0x9362587019ea0e4ef90fbd981c615d4441d9d2c4'
) as `0x${string}`;

export const WEMBR_ADDRESS = '0x9362587019Ea0e4ef90fbd981c615d4441D9D2c4' as const;
export const BRIDGE_ADDRESS = '0x1573EdF8F933601e6f37AC9B104cF62C7f85a0F4' as const;
// EmberDelta orderbook contract — being deployed, update when available
export const EMBER_DELTA_ADDRESS = '0x365f70E546e3D4D35745e7C91Cf189956E2fBEFA' as const;

export const ERC20_ABI = [
  { name: 'balanceOf', type: 'function', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { name: 'decimals', type: 'function', inputs: [], outputs: [{ name: '', type: 'uint8' }], stateMutability: 'view' },
  { name: 'symbol', type: 'function', inputs: [], outputs: [{ name: '', type: 'string' }], stateMutability: 'view' },
  { name: 'name', type: 'function', inputs: [], outputs: [{ name: '', type: 'string' }], stateMutability: 'view' },
  { name: 'totalSupply', type: 'function', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { name: 'allowance', type: 'function', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { name: 'approve', type: 'function', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }], stateMutability: 'nonpayable' },
] as const;

export const EMBER_DELTA_ABI = [
  { name: 'tokens', type: 'function', inputs: [{ name: 'token', type: 'address' }, { name: 'user', type: 'address' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { name: 'balanceOf', type: 'function', inputs: [{ name: 'token', type: 'address' }, { name: 'user', type: 'address' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { name: 'deposit', type: 'function', inputs: [], outputs: [], stateMutability: 'payable' },
  { name: 'withdraw', type: 'function', inputs: [{ name: 'amount', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { name: 'depositToken', type: 'function', inputs: [{ name: 'token', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { name: 'withdrawToken', type: 'function', inputs: [{ name: 'token', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { name: 'orderFills', type: 'function', inputs: [{ name: 'hash', type: 'bytes32' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { name: 'cancelledOrders', type: 'function', inputs: [{ name: 'hash', type: 'bytes32' }], outputs: [{ name: '', type: 'bool' }], stateMutability: 'view' },
  { name: 'feeBps', type: 'function', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  {
    name: 'availableVolume',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'tokenGet', type: 'address' },
      { name: 'amountGet', type: 'uint256' },
      { name: 'tokenGive', type: 'address' },
      { name: 'amountGive', type: 'uint256' },
      { name: 'expires', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'user', type: 'address' },
      { name: 'v', type: 'uint8' },
      { name: 'r', type: 'bytes32' },
      { name: 's', type: 'bytes32' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  { name: 'launchFee', type: 'function', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { name: 'submitLaunchRequest', type: 'function', inputs: [{ name: 'tokenName', type: 'string' }, { name: 'nativeChain', type: 'string' }, { name: 'chainType', type: 'string' }, { name: 'rpcUrl', type: 'string' }, { name: 'description', type: 'string' }], outputs: [], stateMutability: 'payable' },
  { name: 'getLaunchRequestCount', type: 'function', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  {
    name: 'trade', type: 'function', stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenGet',   type: 'address' },
      { name: 'amountGet',  type: 'uint256' },
      { name: 'tokenGive',  type: 'address' },
      { name: 'amountGive', type: 'uint256' },
      { name: 'expires',    type: 'uint256' },
      { name: 'nonce',      type: 'uint256' },
      { name: 'user',       type: 'address' },
      { name: 'v',          type: 'uint8'   },
      { name: 'r',          type: 'bytes32' },
      { name: 's',          type: 'bytes32' },
      { name: 'amount',     type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'cancelOrder', type: 'function', stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenGet',   type: 'address' },
      { name: 'amountGet',  type: 'uint256' },
      { name: 'tokenGive',  type: 'address' },
      { name: 'amountGive', type: 'uint256' },
      { name: 'expires',    type: 'uint256' },
      { name: 'nonce',      type: 'uint256' },
      { name: 'v',          type: 'uint8'   },
      { name: 'r',          type: 'bytes32' },
      { name: 's',          type: 'bytes32' },
    ],
    outputs: [],
  },
  { name: 'LaunchRequestSubmitted', type: 'event', inputs: [{ name: 'id', type: 'uint256', indexed: true }, { name: 'requester', type: 'address', indexed: true }, { name: 'tokenName', type: 'string', indexed: false }, { name: 'nativeChain', type: 'string', indexed: false }] },
  { name: 'Trade', type: 'event', inputs: [{ name: 'tokenGet', type: 'address', indexed: true }, { name: 'amountGet', type: 'uint256', indexed: false }, { name: 'tokenGive', type: 'address', indexed: true }, { name: 'amountGive', type: 'uint256', indexed: false }, { name: 'taker', type: 'address', indexed: true }, { name: 'maker', type: 'address', indexed: false }, { name: 'orderHash', type: 'bytes32', indexed: false }] },
  { name: 'Deposit', type: 'event', inputs: [{ name: 'token', type: 'address', indexed: true }, { name: 'user', type: 'address', indexed: true }, { name: 'amount', type: 'uint256', indexed: false }, { name: 'balance', type: 'uint256', indexed: false }] },
] as const;

// EIP-712 domain for EmberDelta (Base mainnet, chainId 8453)
export const EMBER_DELTA_DOMAIN = {
  name: 'EmberDelta',
  version: '1',
  chainId: BASE_CHAIN_ID,
  verifyingContract: EMBER_DELTA_ADDRESS,
} as const;

export const ORDER_TYPES = {
  Order: [
    { name: 'tokenGet',   type: 'address' },
    { name: 'amountGet',  type: 'uint256' },
    { name: 'tokenGive',  type: 'address' },
    { name: 'amountGive', type: 'uint256' },
    { name: 'expires',    type: 'uint256' },
    { name: 'nonce',      type: 'uint256' },
    { name: 'user',       type: 'address' },
  ],
} as const;

// ETH is represented as address(0) inside EmberDelta
export const ETH_ADDR = '0x0000000000000000000000000000000000000000' as const;

export const BRIDGE_ABI = [
  { name: 'bridgeOut', type: 'function', inputs: [{ name: 'amount', type: 'uint256' }, { name: 'embrRecipient', type: 'string' }, { name: 'nonce', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { name: 'wEMBR', type: 'function', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { name: 'relayer', type: 'function', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { name: 'usedNonces', type: 'function', inputs: [{ name: 'nonce', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }], stateMutability: 'view' },
  { name: 'BridgeOut', type: 'event', inputs: [{ name: 'sender', type: 'address', indexed: true }, { name: 'amount', type: 'uint256', indexed: false }, { name: 'embrRecipient', type: 'string', indexed: false }, { name: 'nonce', type: 'uint256', indexed: true }] },
  { name: 'BridgeIn', type: 'event', inputs: [{ name: 'recipient', type: 'address', indexed: true }, { name: 'amount', type: 'uint256', indexed: false }, { name: 'nonce', type: 'uint256', indexed: true }] },
] as const;

/** NativeBridge on the token's native EVM chain — locks native coin to bridge to Base. */
export const NATIVE_BRIDGE_ABI = [
  { name: 'lockNative', type: 'function', inputs: [{ name: 'baseRecipient', type: 'address' }, { name: 'nonce', type: 'uint256' }], outputs: [], stateMutability: 'payable' },
] as const;

/**
 * UniversalBridge on Base — handles all launched-token bridging.
 * bridgeOut burns wrapped tokens and emits an event; relayer releases native coins.
 * No ERC20 approve needed — the UniversalBridge is a trusted burner of WrappedTokens.
 */
export const UNIVERSAL_BRIDGE_ABI = [
  { name: 'bridgeOut', type: 'function', inputs: [{ name: 'token', type: 'address' }, { name: 'grossAmount', type: 'uint256' }, { name: 'nativeRecipient', type: 'string' }, { name: 'nonce', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
] as const;
