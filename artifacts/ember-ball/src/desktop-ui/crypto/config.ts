/** EmberChain + Ember League claim configuration. */

export const EMBER_CHAIN = {
	chainId: 7773,
	chainIdHex: "0x1e5d",
	name: "Emberchain",
	rpcUrl: "https://emberchain.org/api/rpc",
	symbol: "EMBR",
	explorerUrl: "https://emberchain.org",
	decimals: 18,
} as const;

/** 10,000 EMBR claim fee (native coin, 18 decimals). */
export const CLAIM_FEE_EMBR = 10_000n;
export const CLAIM_FEE_WEI = CLAIM_FEE_EMBR * 10n ** 18n;

/** Set after deploy: localStorage.setItem("emberTeamClaimAddress", "0x…") */
export const getTeamClaimAddress = () =>
	(typeof localStorage !== "undefined" &&
		localStorage.getItem("emberTeamClaimAddress")) ||
	"";

/** Optional IP registry (run `npm run crypto:claim-api`). */
export const getClaimApiUrl = () =>
	(typeof localStorage !== "undefined" &&
		localStorage.getItem("emberClaimApiUrl")) ||
	"http://localhost:7790";

export const CLAIM_COOKIE = "ember_team_claimed";
export const CLAIM_STORAGE_KEY = "ember_league_claim";

/** claimTeam(uint256) */
export const CLAIM_TEAM_SELECTOR = "0xa9c8822a";
