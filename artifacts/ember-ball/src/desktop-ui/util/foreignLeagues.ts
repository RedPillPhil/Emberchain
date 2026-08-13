/**
 * Map a prospect's home country to the real league he would most likely be
 * playing in pre-draft, and synthesize a season stat line scaled the way real
 * international prospects produce (Dončić: 16.0/4.8/4.3 in ACB/EuroLeague at
 * 18; Wembanyama: 21.6/10.4 in LNB Betclic Élite at 19).
 */

const COUNTRY_LEAGUES: Record<string, { league: string }> = {
	Spain: { league: "Liga ACB" },
	France: { league: "LNB Betclic Élite" },
	Slovenia: { league: "ABA Adriatic League" },
	Serbia: { league: "ABA Adriatic League" },
	Croatia: { league: "ABA Adriatic League" },
	Montenegro: { league: "ABA Adriatic League" },
	"Bosnia and Herzegovina": { league: "ABA Adriatic League" },
	Greece: { league: "Greek Basket League" },
	Italy: { league: "Lega Basket Serie A" },
	Turkey: { league: "Turkish BSL" },
	Germany: { league: "easyCredit BBL" },
	Lithuania: { league: "LKL" },
	Latvia: { league: "Latvian-Estonian League" },
	Estonia: { league: "Latvian-Estonian League" },
	Australia: { league: "NBL (Australia)" },
	"New Zealand": { league: "NBL (Australia)" },
	China: { league: "CBA" },
	Japan: { league: "B.League" },
	"South Korea": { league: "KBL" },
	Philippines: { league: "PBA" },
	Argentina: { league: "Liga Nacional (Argentina)" },
	Brazil: { league: "NBB (Brazil)" },
	Mexico: { league: "LNBP (Mexico)" },
	"Puerto Rico": { league: "BSN (Puerto Rico)" },
	Israel: { league: "Israeli Premier League" },
	Russia: { league: "VTB United League" },
	Ukraine: { league: "Ukrainian SuperLeague" },
	Poland: { league: "PLK (Poland)" },
	"Czech Republic": { league: "Czech NBL" },
	Nigeria: { league: "Basketball Africa League" },
	Senegal: { league: "Basketball Africa League" },
	Angola: { league: "Basketball Africa League" },
	Egypt: { league: "Basketball Africa League" },
	Cameroon: { league: "Basketball Africa League" },
	Sudan: { league: "Basketball Africa League" },
	"South Sudan": { league: "Basketball Africa League" },
	Canada: { league: "CEBL" },
	"Dominican Republic": { league: "LNB (Dominican Republic)" },
	Georgia: { league: "Georgian Superliga" },
	Finland: { league: "Korisliiga" },
	Sweden: { league: "Basketligan" },
	Denmark: { league: "Basketligaen" },
	Belgium: { league: "BNXT League" },
	Netherlands: { league: "BNXT League" },
	Switzerland: { league: "SB League" },
	Austria: { league: "Basketball Superliga" },
	Portugal: { league: "LPB (Portugal)" },
	"United Kingdom": { league: "SLB (Britain)" },
	England: { league: "SLB (Britain)" },
	Scotland: { league: "SLB (Britain)" },
	Ireland: { league: "Super League (Ireland)" },
	Hungary: { league: "NB I/A (Hungary)" },
	Romania: { league: "Liga Națională (Romania)" },
	Bulgaria: { league: "NBL (Bulgaria)" },
	"North Macedonia": { league: "ABA Adriatic League" },
	Kosovo: { league: "ABA Adriatic League" },
	Albania: { league: "ABA Adriatic League" },
};

const DEFAULT_LEAGUE = "EuroCup";

/** Extract country from born.loc — handles "California, USA" and bare "France". */
export const countryFromLoc = (loc: string | undefined): string => {
	if (!loc) {
		return "";
	}
	const parts = loc.split(",").map((s) => s.trim());
	return parts.at(-1) ?? loc;
};

/** HARD REQUIREMENT: international = not USA. Canada counts as international. */
export const isForeign = (loc: string | undefined) => {
	const country = countryFromLoc(loc);
	if (!country) {
		return false;
	}
	const c = country.toUpperCase();
	return c !== "USA" && c !== "UNITED STATES" && c !== "U.S." && c !== "U.S.A.";
};

export const foreignLeagueFor = (loc: string | undefined): string => {
	const country = countryFromLoc(loc);
	if (!country) {
		return DEFAULT_LEAGUE;
	}
	return COUNTRY_LEAGUES[country]?.league ?? DEFAULT_LEAGUE;
};

/** Deterministic pseudo-random in [0,1) seeded by pid+salt, stable across renders */
const seeded = (pid: number, salt: number) => {
	let h = (pid * 2654435761 + salt * 40503) >>> 0;
	h ^= h >> 13;
	h = (h * 1274126177) >>> 0;
	h ^= h >> 16;
	return (h % 1000) / 1000;
};

export type ForeignStatLine = {
	gp: number;
	ppg: number;
	rpg: number;
	apg: number;
};

export const foreignStats = (
	pid: number,
	ovr: number,
	pos: string,
): ForeignStatLine => {
	const quality = Math.max(0, ovr - 45);
	const big = pos === "C" || pos === "FC" || pos === "PF";
	const guard = pos === "PG" || pos === "G" || pos === "SG";

	const ppg = 6 + quality * 0.5 + seeded(pid, 1) * 4;
	const rpg = (big ? 5.5 : 2.5) + quality * 0.16 + seeded(pid, 2) * 2;
	const apg = (guard ? 3 : 1) + quality * 0.09 + seeded(pid, 3) * 1.5;
	const gp = 24 + Math.floor(seeded(pid, 4) * 12);

	return {
		gp,
		ppg: Math.round(ppg * 10) / 10,
		rpg: Math.round(rpg * 10) / 10,
		apg: Math.round(apg * 10) / 10,
	};
};
