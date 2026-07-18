import { ethers } from "ethers";

const PROD_RPC = process.env["EMBR_RPC"] ?? "https://emberchain.org/api/rpc";
const TX_HASH = "0x409ad805ad98b790d4c18e33298f12e33f9e33f5edd8ed10d87ef2740ea34423";
const CONTRACT_ADDR = "0x4e8821099cC706d9C4e6E7C05923C2950E361459";

async function main() {
  const provider = new ethers.JsonRpcProvider(PROD_RPC, 7773);
  
  const block = await provider.getBlockNumber();
  console.log("Current block:", block);
  
  // Poll for up to 120s
  for (let i = 0; i < 24; i++) {
    const receipt = await provider.getTransactionReceipt(TX_HASH);
    if (receipt) {
      console.log("CONFIRMED! Status:", receipt.status, "Block:", receipt.blockNumber);
      const code = await provider.getCode(CONTRACT_ADDR);
      console.log("Contract code:", code.length > 4 ? `${code.length - 2} bytes ✓` : "NONE");
      console.log("CONTRACT_ADDRESS=" + CONTRACT_ADDR);
      return;
    }
    // Also check if tx exists in mempool
    const tx = await provider.getTransaction(TX_HASH);
    console.log(`Poll ${i + 1}/24: tx in mempool=${!!tx}, waiting...`);
    await new Promise(r => setTimeout(r, 5000));
  }
  console.log("TIMEOUT: tx not confirmed after 120s");
}

main().catch(e => { console.error("ERROR:", e.message); process.exit(1); });
