/**
 * Desktop pro-league nicknames — each references its city obliquely, not the
 * obvious first-choice animal/mascot. Mapped by abbrev so order never matters.
 */
export const DESKTOP_NICKNAMES_BY_ABBREV: Record<string, string> = {
	/** Original railroad terminus; Atlanta grew from a rail junction named Terminus */
	ATL: "Terminus",
	/** Baltimore clipper ships — fast 19th-century sailing vessels built on the Patapsco */
	BAL: "Clippers",
	/** Oliver Wendell Holmes called Boston "the Hub of the Solar System" */
	BOS: "Hub",
	/** Union Stock Yards — once the world's meatpacking capital */
	CHI: "Stockyards",
	/** Cincinnati's 19th-century nickname when it led the nation in pork processing */
	CIN: "Porkopolis",
	/** The Flats — riverfront warehouse district along the Cuyahoga */
	CLE: "Flats",
	/** Flying red Pegasus atop the old Mobil Oil building, a Dallas skyline icon */
	DAL: "Pegasus",
	/** Mile High City — elevation in feet above sea level */
	DEN: "5280",
	/** FDR dubbed Detroit the "arsenal of democracy" during WWII production */
	DET: "Arsenal",
	/** Houston's nickname — city built on bayous and swampy coastal plain */
	HOU: "Bayou",
	/** Neon signs and the Strip — Vegas without naming casinos */
	LV: "Neon",
	/** San Andreas fault line runs through the LA basin */
	LA: "Faultline",
	/** Plaza de la Constitución — the heart of Mexico City, one of the largest squares on earth */
	MXC: "Zocalo",
	/** Miami's nickname from its rapid early-1900s growth */
	MIA: "Magic",
	/** Minneapolis was the flour-milling capital of the world */
	MIN: "Mill City",
	/** RÉSO — the underground pedestrian network beneath downtown Montreal */
	MON: "Underground",
	/** Washington Irving's nickname for New York in Salmagundi */
	NYC: "Gotham",
	/** Mummers Parade — Philadelphia's centuries-old New Year's folk tradition */
	PHI: "Mummers",
	/** Valley of the Sun — greater Phoenix metro in the Sonoran Desert */
	PHO: "Valley",
	/** Iron City — steel town nickname and the local beer brand */
	PIT: "Iron City",
	/** Portland's logging-era nickname — stumps left after clearing forests */
	POR: "Stumptown",
	/** Sacramento sits at the confluence of the Sacramento–San Joaquin Delta */
	SAC: "Delta",
	/** San Diego Bay — home to the Pacific Fleet and largest naval base on the West Coast */
	SD: "Harbor",
	/** Karl the Fog — the marine layer that rolls through the Golden Gate daily */
	SF: "Fog",
	/** Emerald City — Seattle's nickname for its evergreen surroundings */
	SEA: "Emerald",
	/** Gateway Arch — the 630-foot monument to westward expansion */
	STL: "Gateway",
	/** Ybor City cigar industry — Tampa was once the cigar capital of the world */
	TPA: "Cigar City",
	/** Toronto's early nickname when it was Canada's hog-slaughtering center */
	TOR: "Hogtown",
	/** Terminal City — western terminus of the Canadian Pacific Railway */
	VAN: "Terminal",
	/** Inside-the-Beltway — the Capital Beltway encircling DC */
	WAS: "Beltway",
};

export const applyDesktopNicknames = <T extends { name: string; abbrev?: string }>(
	teams: T[],
): T[] =>
	teams.map((t) => {
		const nick =
			t.abbrev != null ? DESKTOP_NICKNAMES_BY_ABBREV[t.abbrev] : undefined;
		return nick != null ? { ...t, name: nick } : t;
	});
