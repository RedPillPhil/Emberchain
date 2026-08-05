/**
 * Contract stubs — Ember Ball league factory fee quote rules.
 * Not deployed.
 */

export const CONTRACT_ADDRESSES = {
	leagueFactory: null as `0x${string}` | null,
	teamNft: null as `0x${string}` | null,
	prizePool: null as `0x${string}` | null,
	embrToken: null as `0x${string}` | null,
	devTreasury: "0xa8f6efc25896c24ac6c9441f9f693c14517aa818" as const,
} as const;

/**
 * createLeague(name, joinFee, access, numTeams, quoteHeight, feeAmount)
 *
 * Fee quote anti-fraud:
 * 1. Client records quoteHeight when user opens Create League.
 * 2. feeAmount MUST equal totalSupply(quoteHeight) / feeDenominator.
 * 3. On submit, require tipHeight - quoteHeight <= 100 (QUOTE_MAX_AGE_BLOCKS).
 * 4. Reject if feeAmount does not match supply-at-quoteHeight / N.
 *
 * This lets the UI show a climbing "live" fee while the payable amount stays
 * locked to the page-entry height — without reverting on tip movement inside
 * the 100-block window.
 */
export const LEAGUE_FACTORY_FUNCTIONS = [
	"createLeague(string name, uint256 joinFee, uint8 access, uint256 numTeams, uint256 quoteHeight, uint256 feeAmount)",
	"joinLeague(uint256 leagueId, bytes32 inviteCode)",
	"getFeeDenominator() view returns (uint256)",
	"increaseFeeDenominator() onlyOwner",
	"decreaseFeeDenominator() onlyOwner",
	"getCreationFeeAt(uint256 height) view returns (uint256)",
	"QUOTE_MAX_AGE_BLOCKS() view returns (uint256) // 100",
] as const;

export const contractsReady = () =>
	CONTRACT_ADDRESSES.leagueFactory !== null &&
	CONTRACT_ADDRESSES.teamNft !== null &&
	CONTRACT_ADDRESSES.embrToken !== null;
