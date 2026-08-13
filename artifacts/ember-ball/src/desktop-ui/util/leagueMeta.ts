export type LeagueMetaExtras = {
	abbrev: string;
	commissioner: string;
};

const key = (lid: number) => `courtDesk.leagueMeta.${lid}`;

export const loadLeagueMeta = (lid: number): LeagueMetaExtras => {
	try {
		const raw = localStorage.getItem(key(lid));
		if (raw) {
			const parsed = JSON.parse(raw) as Partial<LeagueMetaExtras>;
			return {
				abbrev: parsed.abbrev?.trim() || "PBL",
				commissioner: parsed.commissioner?.trim() || "Adam Silver",
			};
		}
	} catch {
		// ignore
	}
	return { abbrev: "PBL", commissioner: "Adam Silver" };
};

export const saveLeagueMeta = (lid: number, meta: LeagueMetaExtras) => {
	localStorage.setItem(
		key(lid),
		JSON.stringify({
			abbrev: meta.abbrev.trim() || "PBL",
			commissioner: meta.commissioner.trim() || "Adam Silver",
		}),
	);
};

/** NBA-style #1 overall odds (out of 1000). */
export const DESKTOP_LOTTERY_CHANCES = [
	140, 140, 140, 115, 115, 90, 68, 67, 45, 30, 20, 15, 10, 5,
];
