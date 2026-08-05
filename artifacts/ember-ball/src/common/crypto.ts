/**
 * Ember Ball crypto platform config.
 * Contracts not deployed — client scaffolding + Emberchain fee quotes.
 */

import {
	EMBERCHAIN,
	feeFromSupply,
	fetchChainStatus,
	makeFeeQuote,
	type FeeQuote,
} from "./emberchain.ts";

export const DEV_ADDRESS =
	"0xa8f6efc25896c24ac6c9441f9f693c14517aa818" as const;

export const PRIZE_POOL_SHARE = 0.9;
export const DEV_FEE_SHARE = 0.1;
export const LEAGUE_TOKEN = "GMbucks";
export const PLATFORM_TOKEN = "EMBR";
export const OFFICIAL_LEAGUE_NAME = "Ember Ball League";
export const OFFICIAL_LEAGUE_KEY = "emberBallOfficialLid";

const FEE_DENOMINATOR_KEY = "embrFeeDenominator";
const WALLET_KEY = "embrConnectedWallet";

export const DEFAULT_FEE_DENOMINATOR = 1000;

export type LeagueAccess = "public" | "code";

export type CryptoLeagueListing = {
	id: string;
	name: string;
	commissioner: string;
	teamsFilled: number;
	teamsTotal: number;
	joinFeeEmbr: number;
	access: LeagueAccess;
	prizePoolEmbr: number;
	season: number;
	status: "open" | "in_season" | "completed";
	official?: boolean;
};

export const MOCK_PUBLIC_LEAGUES: CryptoLeagueListing[] = [];

/** @deprecated Demo listings removed — real leagues come from local meta */
export const getFeeDenominator = (): number => {
	try {
		const raw = localStorage.getItem(FEE_DENOMINATOR_KEY);
		if (raw !== null) {
			const n = Number.parseInt(raw, 10);
			if (Number.isFinite(n) && n >= 1) {
				return n;
			}
		}
	} catch {
		// ignore
	}
	return DEFAULT_FEE_DENOMINATOR;
};

export const setFeeDenominator = (value: number): number => {
	const next = Math.max(1, Math.floor(value));
	try {
		localStorage.setItem(FEE_DENOMINATOR_KEY, String(next));
	} catch {
		// ignore
	}
	return next;
};

export const increaseFeeDenominator = (): number =>
	setFeeDenominator(getFeeDenominator() * 2);

export const decreaseFeeDenominator = (): number => {
	const current = getFeeDenominator();
	return setFeeDenominator(Math.max(1, Math.floor(current / 2)));
};

export const formatFeeFraction = (denominator: number = getFeeDenominator()) =>
	`1/${denominator.toLocaleString()}`;

export const getConnectedWallet = (): string | null => {
	try {
		return localStorage.getItem(WALLET_KEY);
	} catch {
		return null;
	}
};

export const setConnectedWallet = (address: string | null) => {
	try {
		if (address) {
			localStorage.setItem(WALLET_KEY, address.toLowerCase());
		} else {
			localStorage.removeItem(WALLET_KEY);
		}
	} catch {
		// ignore
	}
	try {
		window.dispatchEvent(new Event("embr-wallet"));
	} catch {
		// ignore
	}
};

export const isDevWallet = (address: string | null | undefined): boolean => {
	if (!address) {
		return false;
	}
	return address.toLowerCase() === DEV_ADDRESS.toLowerCase();
};

export const shortenAddress = (address: string, chars = 4) => {
	if (address.length < chars * 2 + 2) {
		return address;
	}
	return `${address.slice(0, 2 + chars)}…${address.slice(-chars)}`;
};

export const splitJoinFee = (fee: number) => ({
	prizePool: fee * PRIZE_POOL_SHARE,
	dev: fee * DEV_FEE_SHARE,
});

/** Capture a creation-fee quote at the current Emberchain tip */
export const captureCreationFeeQuote = async (
	denominator: number = getFeeDenominator(),
): Promise<FeeQuote> => {
	const status = await fetchChainStatus();
	return makeFeeQuote(status, denominator);
};

export const liveFeeFromStatus = (
	totalSupplyEmbr: number,
	denominator: number = getFeeDenominator(),
) => feeFromSupply(totalSupplyEmbr, denominator);

export { EMBERCHAIN, fetchChainStatus, makeFeeQuote };
export type { FeeQuote };
