import {
	EMBERCHAIN,
	setConnectedWallet,
	shortenAddress,
} from "../../common/crypto.ts";
import { logEvent } from "../util/logEvent.ts";

type EthereumProvider = {
	request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
	on?: (event: string, handler: (...args: any[]) => void) => void;
	removeListener?: (event: string, handler: (...args: any[]) => void) => void;
};

const getProvider = (): EthereumProvider | null => {
	const eth = (window as any).ethereum as EthereumProvider | undefined;
	return eth ?? null;
};

const ensureEmberchain = async (provider: EthereumProvider) => {
	const chainId = (await provider.request({
		method: "eth_chainId",
	})) as string;

	if (chainId.toLowerCase() === EMBERCHAIN.chainIdHex.toLowerCase()) {
		return;
	}

	try {
		await provider.request({
			method: "wallet_switchEthereumChain",
			params: [{ chainId: EMBERCHAIN.chainIdHex }],
		});
	} catch (error: any) {
		// 4902 = chain not added
		if (error?.code === 4902 || String(error?.message ?? "").includes("4902")) {
			await provider.request({
				method: "wallet_addEthereumChain",
				params: [
					{
						chainId: EMBERCHAIN.chainIdHex,
						chainName: EMBERCHAIN.name,
						nativeCurrency: {
							name: EMBERCHAIN.symbol,
							symbol: EMBERCHAIN.symbol,
							decimals: EMBERCHAIN.decimals,
						},
						rpcUrls: [EMBERCHAIN.rpcUrl],
						blockExplorerUrls: [EMBERCHAIN.explorerUrl],
					},
				],
			});
			return;
		}
		throw error;
	}
};

export const connectWallet = async (): Promise<string | null> => {
	const provider = getProvider();
	if (!provider) {
		logEvent({
			type: "error",
			text: "No crypto wallet found. Install MetaMask (or another injected wallet), then try again. Demo auto-connect has been removed.",
			saveToDb: false,
			showNotification: true,
		});
		return null;
	}

	try {
		await ensureEmberchain(provider);
		const accounts = (await provider.request({
			method: "eth_requestAccounts",
		})) as string[];
		const address = accounts[0];
		if (!address) {
			logEvent({
				type: "error",
				text: "Wallet returned no accounts.",
				saveToDb: false,
			});
			return null;
		}
		setConnectedWallet(address);
		logEvent({
			type: "success",
			text: `Connected ${shortenAddress(address, 6)} on Emberchain.`,
			saveToDb: false,
			showNotification: true,
		});
		return address;
	} catch (error: any) {
		logEvent({
			type: "error",
			text: error?.message ?? "Wallet connection failed.",
			saveToDb: false,
			showNotification: true,
		});
		return null;
	}
};

export const disconnectWallet = () => {
	setConnectedWallet(null);
};

export const hasInjectedWallet = () => getProvider() !== null;
