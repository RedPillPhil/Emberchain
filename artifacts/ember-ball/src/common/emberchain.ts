/**
 * Emberchain live chain reads + league-creation fee quotes.
 * Supply formula: height × 5 EMBR (wei = height × 5e18).
 */

export const EMBERCHAIN = {
	chainId: 7773,
	chainIdHex: "0x1E5D",
	name: "Emberchain",
	symbol: "EMBR",
	decimals: 18,
	rpcUrl: "https://emberchain.duckdns.org/api/rpc",
	statusUrl: "https://emberchain.duckdns.org/api/chain/status",
	explorerUrl: "https://emberchain.org/ledger",
	blockRewardEmbr: 5,
	/** Quote must be within this many blocks of chain tip on submit */
	quoteMaxAgeBlocks: 100,
} as const;

export type ChainStatus = {
	height: number;
	totalSupplyWei: string;
	totalSupplyEmbr: number;
	blockRewardEmbr: number;
};

export type FeeQuote = {
	quotedAtHeight: number;
	totalSupplyEmbr: number;
	feeEmbr: number;
	denominator: number;
	quotedAtMs: number;
	expiresAtHeight: number;
};

const weiToEmbr = (wei: string | bigint): number => {
	const w = typeof wei === "bigint" ? wei : BigInt(wei);
	return Number(w) / 1e18;
};

export const supplyFromHeight = (height: number): number =>
	Math.max(0, height) * EMBERCHAIN.blockRewardEmbr;

export const fetchChainStatus = async (): Promise<ChainStatus> => {
	const res = await fetch(EMBERCHAIN.statusUrl, {
		cache: "no-store",
	});
	if (!res.ok) {
		throw new Error(`Emberchain status HTTP ${res.status}`);
	}
	const data = (await res.json()) as {
		height: number;
		totalSupply: string;
		blockReward?: string;
	};
	const height = Number(data.height) || 0;
	const totalSupplyWei = data.totalSupply ?? "0";
	const totalSupplyEmbr = weiToEmbr(totalSupplyWei);
	const blockRewardEmbr = data.blockReward
		? weiToEmbr(data.blockReward)
		: EMBERCHAIN.blockRewardEmbr;
	return {
		height,
		totalSupplyWei,
		totalSupplyEmbr,
		blockRewardEmbr,
	};
};

export const feeFromSupply = (totalSupplyEmbr: number, denominator: number) =>
	totalSupplyEmbr / Math.max(1, denominator);

export const makeFeeQuote = (
	status: ChainStatus,
	denominator: number,
): FeeQuote => ({
	quotedAtHeight: status.height,
	totalSupplyEmbr: status.totalSupplyEmbr,
	feeEmbr: feeFromSupply(status.totalSupplyEmbr, denominator),
	denominator,
	quotedAtMs: Date.now(),
	expiresAtHeight: status.height + EMBERCHAIN.quoteMaxAgeBlocks,
});

export const isQuoteValid = (quote: FeeQuote, currentHeight: number) =>
	currentHeight - quote.quotedAtHeight <= EMBERCHAIN.quoteMaxAgeBlocks &&
	currentHeight >= quote.quotedAtHeight;

export const formatEmbr = (amount: number, digits = 4) => {
	if (!Number.isFinite(amount)) {
		return "—";
	}
	if (amount >= 1_000_000) {
		return `${(amount / 1_000_000).toFixed(2)}M`;
	}
	if (amount >= 10_000) {
		return amount.toLocaleString(undefined, { maximumFractionDigits: 2 });
	}
	return amount.toLocaleString(undefined, {
		minimumFractionDigits: 0,
		maximumFractionDigits: digits,
	});
};
