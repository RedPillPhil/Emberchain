import { ethers } from "ethers";

const PROD_RPC = process.env["EMBR_RPC"] ?? "https://emberchain.org/api/rpc";
const TX_HASH = "0x409ad805ad98b790d4c18e33298f12e33f9e33f5edd8ed10d87ef2740ea34423";
const CONTRACT_ADDR = "0x4e8821099cC706d9C4e6E7C05923C2950E361459";

async function main() {
  const provider = new ethers.JsonRpcProvider(PROD_RPC, 7773);
  
  // Check tx receipt
  const receipt = await provider.getTransactionReceipt(TX_HASH);
  console.log("TX Receipt:", receipt ? JSON.stringify({ status: receipt.status, blockNumber: receipt.blockNumber, contractAddress: receipt.contractAddress }, null, 2) : "null (not mined yet)");
  
  // Check code at expected address
  const code = await provider.getCode(CONTRACT_ADDR);
  console.log("Code at", CONTRACT_ADDR, ":", code.length > 4 ? `${code.length - 2} bytes ✓` : "NONE");
}

main().catch(e => { console.error("ERROR:", e.message); process.exit(1); });
