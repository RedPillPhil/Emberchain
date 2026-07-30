import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying EmberDelta with:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  // Fee account is the deployer — can be changed later via setFeeAccount
  const feeAccount = deployer.address;

  const EmberDelta = await ethers.getContractFactory("EmberDelta");
  const contract = await EmberDelta.deploy(feeAccount);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("EmberDelta deployed to:", address);

  // Save to mainnet addresses file
  const outPath = path.join(__dirname, "../deployed-addresses.mainnet.json");
  let existing: Record<string, unknown> = {};
  if (fs.existsSync(outPath)) {
    existing = JSON.parse(fs.readFileSync(outPath, "utf8"));
  }
  existing["EmberDelta"] = address;
  fs.writeFileSync(outPath, JSON.stringify(existing, null, 2));
  console.log("Saved to", outPath);

  // Export ABI
  const artifact = await ethers.getContractFactory("EmberDelta");
  const abiPath = path.join(__dirname, "../abis/EmberDelta.json");
  fs.mkdirSync(path.dirname(abiPath), { recursive: true });
  fs.writeFileSync(abiPath, JSON.stringify(artifact.interface.fragments, null, 2));
  console.log("ABI exported to", abiPath);
}

main().catch((e) => { console.error(e); process.exit(1); });
