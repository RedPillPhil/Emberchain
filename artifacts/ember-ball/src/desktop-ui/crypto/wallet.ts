import {
	CLAIM_FEE_WEI,
	CLAIM_TEAM_SELECTOR,
	EMBER_CHAIN,
	getTeamClaimAddress,
} from "./config.ts";

type EthProvider = {
	request: (args: { method: string; params?: unknown[] }) => Promise<any>;
};

const ethereum = (): EthProvider | undefined =>
	(window as any).ethereum as EthProvider | undefined;

const padUint = (n: number | bigint) =>
	BigInt(n).toString(16).padStart(64, "0");

export const isWalletAvailable = () => !!ethereum();

export const ensureEmberChain = async () => {
	const eth = ethereum();
	if (!eth) {
		throw new Error("No wallet found. Install MetaMask or an EVM wallet.");
	}
	const chainId = await eth.request({ method: "eth_chainId" });
	if (String(chainId).toLowerCase() === EMBER_CHAIN.chainIdHex) {
		return;
	}
	try {
		await eth.request({
			method: "wallet_switchEthereumChain",
			params: [{ chainId: EMBER_CHAIN.chainIdHex }],
		});
	} catch (err: any) {
		if (err?.code === 4902 || /unrecognized|unknown chain/i.test(String(err))) {
			await eth.request({
				method: "wallet_addEthereumChain",
				params: [
					{
						chainId: EMBER_CHAIN.chainIdHex,
						chainName: EMBER_CHAIN.name,
						nativeCurrency: {
							name: EMBER_CHAIN.symbol,
							symbol: EMBER_CHAIN.symbol,
							decimals: EMBER_CHAIN.decimals,
						},
						rpcUrls: [EMBER_CHAIN.rpcUrl],
						blockExplorerUrls: [EMBER_CHAIN.explorerUrl],
					},
				],
			});
		} else {
			throw err;
		}
	}
};

export const connectWallet = async (): Promise<string> => {
	const eth = ethereum();
	if (!eth) {
		throw new Error("No wallet found. Install MetaMask or an EVM wallet.");
	}
	await ensureEmberChain();
	const accounts: string[] = await eth.request({
		method: "eth_requestAccounts",
	});
	if (!accounts?.[0]) {
		throw new Error("Wallet connection rejected.");
	}
	return accounts[0];
};

export const getTeamOwnerOnChain = async (
	tid: number,
): Promise<string | undefined> => {
	const addr = getTeamClaimAddress();
	if (!addr) {
		return undefined;
	}
	// teamOwner(uint256)
	const selector = "0x04b7391a";
	const data = `${selector}${padUint(tid)}`;
	const eth = ethereum();
	if (!eth) {
		return undefined;
	}
	const result: string = await eth.request({
		method: "eth_call",
		params: [{ to: addr, data }, "latest"],
	});
	if (!result || /^0x0+$/.test(result.replace(/^0x/, "0x"))) {
		return undefined;
	}
	const owner = `0x${result.slice(-40)}`;
	if (/^0x0{40}$/i.test(owner)) {
		return undefined;
	}
	return owner;
};

export const getClaimedTeamOnChain = async (
	address: string,
): Promise<number | undefined> => {
	const addr = getTeamClaimAddress();
	if (!addr) {
		return undefined;
	}
	// claimedTeam(address) — returns tid+1 or 0
	const selector = "0x22e3a231";
	const data = `${selector}${address
		.replace(/^0x/i, "")
		.toLowerCase()
		.padStart(64, "0")}`;
	const eth = ethereum();
	if (!eth) {
		return undefined;
	}
	try {
		const result: string = await eth.request({
			method: "eth_call",
			params: [{ to: addr, data }, "latest"],
		});
		const n = Number(BigInt(result || "0x0"));
		if (!n) {
			return undefined;
		}
		return n - 1;
	} catch {
		return undefined;
	}
};

export const sendClaimTeamTx = async (
	tid: number,
	from: string,
): Promise<string> => {
	const eth = ethereum();
	if (!eth) {
		throw new Error("No wallet found.");
	}
	const contract = getTeamClaimAddress();
	if (!contract) {
		throw new Error(
			"Team claim contract not deployed yet. Set localStorage emberTeamClaimAddress after deploy.",
		);
	}
	await ensureEmberChain();
	const data = `${CLAIM_TEAM_SELECTOR}${padUint(tid)}`;
	const txHash: string = await eth.request({
		method: "eth_sendTransaction",
		params: [
			{
				from,
				to: contract,
				value: `0x${CLAIM_FEE_WEI.toString(16)}`,
				data,
			},
		],
	});
	return txHash;
};
