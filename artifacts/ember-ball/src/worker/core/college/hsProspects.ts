import { POSITIONS } from "../../../common/constants.basketball.ts";
import type { CollegeTeam } from "../../../common/college/types.ts";
import type { CollegeTeamState } from "./generate.ts";
import name from "../player/name.ts";

export type HsOffer = {
	tid: number;
	school: string;
	abbrev: string;
	prestige: number;
};

export type HsProspect = {
	pid: number;
	rank: number;
	firstName: string;
	lastName: string;
	pos: string;
	height: number;
	weight: number;
	hometown: string;
	/** Classic skill for ranking */
	skill: number;
	ovr: number;
	awards: string[];
	offers: HsOffer[];
	committedTid: number | undefined;
	committedSchool: string | undefined;
	nationalRank: number;
};

const TOWNS = [
	"Chicago, IL",
	"Dallas, TX",
	"Atlanta, GA",
	"Los Angeles, CA",
	"New York, NY",
	"Houston, TX",
	"Phoenix, AZ",
	"Philadelphia, PA",
	"Miami, FL",
	"Detroit, MI",
	"Charlotte, NC",
	"Indianapolis, IN",
	"Columbus, OH",
	"Memphis, TN",
	"Louisville, KY",
	"Raleigh, NC",
	"Nashville, TN",
	"Seattle, WA",
	"Denver, CO",
	"Minneapolis, MN",
	"Brooklyn, NY",
	"Oakland, CA",
	"Baltimore, MD",
	"Cleveland, OH",
	"Milwaukee, WI",
	"Kansas City, MO",
	"San Antonio, TX",
	"Orlando, FL",
	"Portland, OR",
	"Las Vegas, NV",
];

const rand = (min: number, max: number) =>
	min + Math.floor(Math.random() * (max - min + 1));
const pick = <T,>(arr: readonly T[]) => arr[rand(0, arr.length - 1)]!;

let hsPid = 100000;

/** Mostly USA high-schoolers, with a small international sprinkle — BBGM name engine. */
const hsName = async () => {
	const international = Math.random() < 0.12;
	const n = await name(international ? undefined : "USA");
	return n;
};

export const generateHsTop100 = async (
	teams: CollegeTeam[],
	teamStates: Map<number, CollegeTeamState>,
): Promise<HsProspect[]> => {
	const prospects: HsProspect[] = [];
	for (let rank = 1; rank <= 100; rank++) {
		// HS overalls share the pro scale so they read correctly next to pros:
		// a once-in-a-generation #1 tops out ~75, typical top-10 kids sit in
		// the mid-60s, and the back of the Top 100 is in the 40s — projects.
		const base = 72 - (rank - 1) * 0.28 + rand(-2, 2);
		const prodigy = rank === 1 && Math.random() < 0.15 ? 3 : 0;
		const ovr = Math.round(Math.max(42, Math.min(75, base + prodigy)));
		const awards: string[] = [];
		if (rank <= 5) {
			awards.push("McDonald's All-American");
			awards.push("Gatorade National Player of the Year Finalist");
		} else if (rank <= 25) {
			awards.push("McDonald's All-American");
		} else if (rank <= 50 && Math.random() < 0.4) {
			awards.push("State Player of the Year");
		} else if (rank <= 100 && Math.random() < 0.25) {
			awards.push("All-State First Team");
		}

		const n = await hsName();
		prospects.push({
			pid: hsPid++,
			rank,
			nationalRank: rank,
			firstName: n.firstName,
			lastName: n.lastName,
			pos: POSITIONS[rand(0, POSITIONS.length - 1)]!,
			height: rand(72, 86),
			weight: rand(170, 250),
			hometown: pick(TOWNS),
			skill: ovr,
			ovr,
			awards,
			offers: [],
			committedTid: undefined,
			committedSchool: undefined,
		});
	}

	// Seed initial offers from prestige-appropriate schools
	const rankedTeams = [...teams]
		.map((t) => ({
			t,
			prestige: teamStates.get(t.tid)?.prestige ?? 50,
		}))
		.sort((a, b) => b.prestige - a.prestige);

	for (const p of prospects) {
		const offerCount =
			p.rank <= 25 ? rand(6, 12) : p.rank <= 60 ? rand(3, 7) : rand(1, 4);
		const pool =
			p.rank <= 30
				? rankedTeams.slice(0, 80)
				: p.rank <= 70
					? rankedTeams.slice(20, 160)
					: rankedTeams.slice(60);
		const chosen = new Set<number>();
		while (p.offers.length < offerCount && chosen.size < pool.length) {
			const entry = pool[rand(0, pool.length - 1)]!;
			if (chosen.has(entry.t.tid)) {
				continue;
			}
			chosen.add(entry.t.tid);
			p.offers.push({
				tid: entry.t.tid,
				school: `${entry.t.region} ${entry.t.name}`,
				abbrev: entry.t.abbrev,
				prestige: entry.prestige,
			});
		}
		p.offers.sort((a, b) => b.prestige - a.prestige);
	}

	return prospects;
};

/**
 * Generate the HS Junior class — 100 rising juniors who are 2 years from
 * draft eligibility. They are 17 vs the seniors' 18 — just a year younger,
 * not inherently weaker. A top junior class can rival or exceed the senior
 * class in long-run talent; they are only ~1-2 overall points behind right
 * now due to age/development lag.
 */
export const generateHsJuniorClass = async (): Promise<HsProspect[]> => {
	const juniors: HsProspect[] = [];
	for (let rank = 1; rank <= 100; rank++) {
		// Only ~1-2 points behind the equivalent senior rank — they're 17, not
		// lesser players. Top junior can absolutely be better than top senior long-term.
		const base = 70 - (rank - 1) * 0.28 + rand(-2, 2);
		const ovr = Math.round(Math.max(38, Math.min(74, base)));
		const awards: string[] = [];
		if (rank <= 10) {
			awards.push("All-Sophomore First Team");
		} else if (rank <= 30 && Math.random() < 0.5) {
			awards.push("State Sophomore of the Year");
		}
		const n = await hsName();
		juniors.push({
			pid: hsPid++,
			rank,
			nationalRank: rank,
			firstName: n.firstName,
			lastName: n.lastName,
			pos: POSITIONS[rand(0, POSITIONS.length - 1)]!,
			height: rand(72, 86),
			weight: rand(160, 240),
			hometown: pick(TOWNS),
			skill: ovr,
			ovr,
			awards,
			offers: [],
			committedTid: undefined,
			committedSchool: undefined,
		});
	}
	return juniors;
};
export const refreshHsProspectNames = async (prospects: HsProspect[]) => {
	for (const p of prospects) {
		const n = await hsName();
		p.firstName = n.firstName;
		p.lastName = n.lastName;
	}
};

/** Returns prospects that committed on this day (for future-commit boards). */
export const advanceRecruitingDay = (
	prospects: HsProspect[],
	_teams: CollegeTeam[],
	_teamStates: Map<number, CollegeTeamState>,
	day: number,
): HsProspect[] => {
	const newly: HsProspect[] = [];
	// Soft commit pressure as the year progresses — top kids decide earlier
	for (const p of prospects) {
		if (p.committedTid != null || p.offers.length === 0) {
			continue;
		}
		const commitChance =
			p.rank <= 10
				? 0.012 + day * 0.0004
				: p.rank <= 40
					? 0.008 + day * 0.0003
					: 0.005 + day * 0.0002;
		if (Math.random() > commitChance) {
			continue;
		}
		// Weighted toward prestige, with noise so it isn't always Duke/Kentucky
		const weights = p.offers.map(
			(o) => Math.max(1, o.prestige) ** 1.6 * (0.7 + Math.random() * 0.6),
		);
		const total = weights.reduce((a, b) => a + b, 0);
		let roll = Math.random() * total;
		let pickOffer = p.offers[0]!;
		for (let i = 0; i < p.offers.length; i++) {
			roll -= weights[i]!;
			if (roll <= 0) {
				pickOffer = p.offers[i]!;
				break;
			}
		}
		p.committedTid = pickOffer.tid;
		p.committedSchool = pickOffer.school;
		newly.push(p);
	}
	return newly;
};
