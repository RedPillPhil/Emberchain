/**
 * Positional fit for the desktop lineup system (basketball).
 *
 * Each lineup slot has a ratings profile. A player's fit at a slot is his
 * profile score relative to his BEST slot — so playing a guy at his natural
 * spot costs nothing, while playing him out of position degrades his in-game
 * composite ratings (a plodding 7'3" rim protector at point guard will
 * struggle, unless he genuinely has the speed/handle/passing to pull it off).
 */

export type LineupSlot = "pg" | "sg" | "sf" | "pf" | "c";

export type DesktopLineup = {
	pg?: number;
	sg?: number;
	sf?: number;
	pf?: number;
	c?: number;
	sixth?: number;
};

export const LINEUP_SLOTS: { id: LineupSlot | "sixth"; label: string }[] = [
	{ id: "pg", label: "PG" },
	{ id: "sg", label: "SG" },
	{ id: "sf", label: "SF" },
	{ id: "pf", label: "PF" },
	{ id: "c", label: "C" },
	{ id: "sixth", label: "6TH" },
];

type Profile = Record<string, number>;

/** Weights sum to 1 per slot. Rating keys are raw BBGM basketball ratings. */
const PROFILES: Record<LineupSlot, Profile> = {
	pg: {
		pss: 0.26,
		drb: 0.24,
		spd: 0.18,
		oiq: 0.14,
		tp: 0.08,
		diq: 0.06,
		endu: 0.04,
	},
	sg: {
		tp: 0.2,
		fg: 0.15,
		drb: 0.15,
		spd: 0.15,
		oiq: 0.1,
		diq: 0.1,
		dnk: 0.08,
		jmp: 0.07,
	},
	sf: {
		fg: 0.13,
		tp: 0.13,
		spd: 0.11,
		dnk: 0.11,
		stre: 0.1,
		diq: 0.12,
		oiq: 0.08,
		reb: 0.09,
		hgt: 0.08,
		jmp: 0.05,
	},
	pf: {
		stre: 0.19,
		reb: 0.19,
		ins: 0.13,
		dnk: 0.12,
		hgt: 0.14,
		diq: 0.11,
		fg: 0.07,
		jmp: 0.05,
	},
	c: {
		hgt: 0.28,
		stre: 0.21,
		reb: 0.19,
		ins: 0.12,
		diq: 0.1,
		dnk: 0.06,
		jmp: 0.04,
	},
};

const SLOTS: LineupSlot[] = ["pg", "sg", "sf", "pf", "c"];

/** Weighted profile score 0-100 for one slot. */
export const positionFitScore = (
	ratings: Record<string, number | undefined>,
	slot: LineupSlot,
): number => {
	let score = 0;
	for (const [key, weight] of Object.entries(PROFILES[slot])) {
		score += (ratings[key] ?? 50) * weight;
	}
	return score;
};

/**
 * Composite-rating multiplier for playing this slot: 1.0 at the player's best
 * position, sliding down toward 0.75 for a total mismatch.
 */
export const positionFitFactor = (
	ratings: Record<string, number | undefined>,
	slot: LineupSlot,
): number => {
	const scores = SLOTS.map((s) => positionFitScore(ratings, s));
	const best = Math.max(...scores);
	if (best <= 0) {
		return 1;
	}
	const rel = positionFitScore(ratings, slot) / best;
	return Math.max(0.75, Math.min(1, 0.75 + 0.25 * rel));
};

/** Letter grade for the UI. */
export const positionFitGrade = (
	factor: number,
): { grade: string; color: string } => {
	if (factor >= 0.99) {
		return { grade: "A+", color: "#2fd67b" };
	}
	if (factor >= 0.97) {
		return { grade: "A", color: "#2fd67b" };
	}
	if (factor >= 0.95) {
		return { grade: "B", color: "#a4d65e" };
	}
	if (factor >= 0.92) {
		return { grade: "C", color: "#f5d76e" };
	}
	if (factor >= 0.88) {
		return { grade: "D", color: "#ff9f1a" };
	}
	return { grade: "F", color: "#ef5b5b" };
};

export const SLOT_TO_POS: Record<LineupSlot, string> = {
	pg: "PG",
	sg: "SG",
	sf: "SF",
	pf: "PF",
	c: "C",
};
