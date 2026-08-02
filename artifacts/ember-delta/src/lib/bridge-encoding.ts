import { encodeFunctionData, parseAbi } from "viem";

const embrBridgeAbi = parseAbi([
  "function lockEMBR(address baseRecipient, uint256 nonce) payable",
]);

const baseBridgeAbi = parseAbi([
  "function bridgeOut(uint256 amount, string embrRecipient, uint256 nonce)",
]);

const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
]);

export function encLockEMBR(recipient: string, nonce: bigint): `0x${string}` {
  return encodeFunctionData({
    abi: embrBridgeAbi,
    functionName: "lockEMBR",
    args: [recipient as `0x${string}`, nonce],
  });
}

export function encBridgeOut(
  amount: bigint,
  embrRecipient: string,
  nonce: bigint,
): `0x${string}` {
  return encodeFunctionData({
    abi: baseBridgeAbi,
    functionName: "bridgeOut",
    args: [amount, embrRecipient, nonce],
  });
}

export function encApprove(spender: string, amount: bigint): `0x${string}` {
  return encodeFunctionData({
    abi: erc20Abi,
    functionName: "approve",
    args: [spender as `0x${string}`, amount],
  });
}

export function encAllowance(owner: string, spender: string): `0x${string}` {
  return encodeFunctionData({
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner as `0x${string}`, spender as `0x${string}`],
  });
}

export function encBalanceOf(owner: string): `0x${string}` {
  return encodeFunctionData({
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [owner as `0x${string}`],
  });
}

export function decodeUint256(hex: string): bigint {
  if (!hex || hex === "0x") return 0n;
  return BigInt(hex);
}
