import { encodeFunctionData, parseAbi } from "viem";

const lockEmbrAbi = parseAbi([
  "function lockEMBR(address baseRecipient, uint256 nonce) payable",
]);

export function encLockEMBR(recipient: string, nonce: bigint): `0x${string}` {
  return encodeFunctionData({
    abi: lockEmbrAbi,
    functionName: "lockEMBR",
    args: [recipient as `0x${string}`, nonce],
  });
}
