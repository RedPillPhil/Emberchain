/**
 * Rough FIBA / international basketball strength tiers.
 * Used to size "domestic FA" pools when clicking a prospect's country.
 * Even top countries produce mostly sub-NBA talent in this pool.
 */
export type CountryTier = "S" | "A" | "B" | "C";

const TIER_S = new Set([
	"Spain",
	"France",
	"Serbia",
	"Australia",
	"Argentina",
	"Lithuania",
	"Greece",
	"Germany",
	"Slovenia",
	"Canada",
]);

const TIER_A = new Set([
	"Croatia",
	"Turkey",
	"Italy",
	"Brazil",
	"Latvia",
	"Montenegro",
	"Poland",
	"Czech Republic",
	"Czechia",
	"New Zealand",
	"Nigeria",
	"Dominican Republic",
	"Puerto Rico",
	"Georgia",
	"Bosnia and Herzegovina",
	"Bosnia",
]);

const TIER_B = new Set([
	"Russia",
	"Ukraine",
	"Israel",
	"China",
	"Japan",
	"South Korea",
	"Mexico",
	"Venezuela",
	"Senegal",
	"Cameroon",
	"Angola",
	"Egypt",
	"Tunisia",
	"Philippines",
	"Finland",
	"Sweden",
	"Belgium",
	"Netherlands",
	"Hungary",
	"Romania",
	"Estonia",
	"North Macedonia",
	"Macedonia",
]);

export const countryTier = (country: string): CountryTier => {
	const c = country.trim();
	if (TIER_S.has(c)) {
		return "S";
	}
	if (TIER_A.has(c)) {
		return "A";
	}
	if (TIER_B.has(c)) {
		return "B";
	}
	return "C";
};

/** Typical ovr band for domestic free agents from that country (well below NBA). */
export const countryFaOvrRange = (country: string): [number, number] => {
	const t = countryTier(country);
	if (t === "S") {
		return [42, 56];
	}
	if (t === "A") {
		return [38, 50];
	}
	if (t === "B") {
		return [34, 46];
	}
	return [30, 40];
};

export const countryTierLabel = (country: string) => {
	const t = countryTier(country);
	return (
		{
			S: "FIBA elite (still below NBA/G League bar here)",
			A: "Strong national program",
			B: "Developing / mid FIBA",
			C: "Limited basketball depth",
		} as const
	)[t];
};
