import { POSITIONS } from "../../../common/constants.basketball.ts";
import type { CollegeTeam } from "../../../common/college/types.ts";
import name from "../player/name.ts";

export type CollegePlayerStatus = "active" | "declared" | "commit";

export type CollegePlayer = {
	pid: number;
	tid: number;
	firstName: string;
	lastName: string;
	pos: string;
	year: "FR" | "SO" | "JR" | "SR";
	height: number;
	weight: number;
	/** Classic attribute blend proxy used for sim strength */
	skill: number;
	/** 2K-style overall (fogged in UI until scouted) */
	ovr: number;
	awards: string[];
	stats: {
		gp: number;
		pts: number;
		reb: number;
		ast: number;
	};
	/** active = on roster; declared = left for draft but still listed; commit = signed HS, arrives next season */
	status?: CollegePlayerStatus;
	/** Linked BBGM undrafted/pro pid after draft declaration */
	proPid?: number;
	/** HS national rank if this player came from Top 100 */
	hsRank?: number;
	/** Original HS Top 100 pid (for prospect card links) */
	hsPid?: number;
	/** Pro season year this commit becomes a freshman */
	arrivesSeason?: number;
};

export type CollegeTeamState = {
	tid: number;
	prestige: number; // 0–100
	won: number;
	lost: number;
	players: CollegePlayer[];
	/** Signed HS commits for next season (also mirrored with status:"commit") */
	futureCommits: CollegePlayer[];
};

const YEARS: CollegePlayer["year"][] = ["FR", "SO", "JR", "SR"];

let nextPid = 1;
/** Full-name uniqueness across the D1 universe for a given generation pass */
const usedFullNames = new Set<string>();

export const resetCollegeNamePool = () => {
	usedFullNames.clear();
};

const rand = (min: number, max: number) =>
	min + Math.floor(Math.random() * (max - min + 1));

const pick = <T,>(arr: readonly T[]) => arr[rand(0, arr.length - 1)]!;

const uniqueBbGmName = async () => {
	for (let attempt = 0; attempt < 50; attempt++) {
		const n = await name(Math.random() < 0.08 ? undefined : "USA");
		const key = `${n.firstName}\0${n.lastName}`.toLowerCase();
		if (!usedFullNames.has(key)) {
			usedFullNames.add(key);
			return { firstName: n.firstName, lastName: n.lastName };
		}
	}
	const n = await name("USA");
	const firstName = n.firstName;
	const lastName = `${n.lastName}${String.fromCharCode(65 + rand(0, 25))}`;
	usedFullNames.add(`${firstName}\0${lastName}`.toLowerCase());
	return { firstName, lastName };
};

/** Prestige seed from brand recognition — power conferences start higher. */
export const seedPrestige = (team: CollegeTeam, confAbbrev: string): number => {
	const power = new Set([
		"ACC",
		"B12",
		"BE",
		"B1G",
		"SEC",
		"P12",
		"WCC",
	]);
	const mid = new Set(["AAC", "A10", "MWC", "WAC", "MVC", "CUSA", "SBC"]);
	let base = 42;
	if (power.has(confAbbrev)) {
		base = 72;
	} else if (mid.has(confAbbrev)) {
		base = 55;
	}
	// Brand bumps
	const brands: Record<string, number> = {
		DUKE: 96,
		KU: 95,
		UK: 94,
		UNC: 93,
		GONZ: 90,
		UCLA: 89,
		CONN: 88,
		HOU: 87,
		PUR: 86,
		AZ: 85,
		ARIZ: 85,
		BAY: 84,
		TENN: 83,
		AUB: 82,
		ALA: 81,
		MSU: 80,
		VILL: 80,
		NOVA: 80,
	};
	const bump = brands[team.abbrev] ?? 0;
	return Math.min(99, Math.max(25, bump || base + rand(-6, 8)));
};

/**
 * College overalls are on the SAME scale as pro players, so they read
 * correctly next to the pros: a college standout tops out around 85
 * (lottery-lock, best player in the country), Duke/Kansas-tier programs
 * roster stars in the high 70s to low 80s, and a bottom D1 program's best
 * player is a 50s-60s guy who would never sniff a pro roster.
 */
export const generateCollegeRoster = async (
	team: CollegeTeam,
	prestige: number,
): Promise<CollegePlayer[]> => {
	const rosterSize = rand(13, 15);
	const players: CollegePlayer[] = [];

	// Best player on the roster: prestige 96 (blue blood) => ~82-85,
	// prestige 55 (mid-major) => ~63-68, prestige 30 (bottom D1) => ~52-57
	const topTalent = Math.min(85, 38 + prestige * 0.47 + rand(-2, 3));

	for (let i = 0; i < rosterSize; i++) {
		const depthPenalty = i * 2.4;
		const ovr = Math.round(
			Math.max(42, Math.min(85, topTalent - depthPenalty + rand(-3, 3))),
		);
		const n = await uniqueBbGmName();
		players.push({
			pid: nextPid++,
			tid: team.tid,
			firstName: n.firstName,
			lastName: n.lastName,
			pos: POSITIONS[rand(0, POSITIONS.length - 1)]!,
			year: pick(YEARS),
			height: rand(72, 85),
			weight: rand(175, 265),
			skill: ovr,
			ovr,
			awards: [],
			stats: { gp: 0, pts: 0, reb: 0, ast: 0 },
			status: "active",
		});
	}
	players.sort((a, b) => b.ovr - a.ovr);

	// Accolades — only the real studs on good programs pick these up
	const star = players[0];
	if (star && prestige >= 70 && star.ovr >= 72) {
		star.awards.push(
			Math.random() < 0.35
				? "All-American"
				: prestige >= 85
					? "Conference Player of the Year"
					: "All-Conference First Team",
		);
		if (star.ovr >= 80 && Math.random() < 0.25) {
			star.awards.push("National Player of the Year Candidate");
		}
	}
	for (const p of players.slice(0, 3)) {
		if (p.ovr >= 68 && Math.random() < 0.4 && p.awards.length === 0) {
			p.awards.push(
				Math.random() < 0.5
					? "All-Conference Second Team"
					: "Conference All-Defense",
			);
		}
	}

	return players;
};

export const teamStrength = (players: CollegePlayer[]) => {
	const active = players.filter(
		(p) => (p.status ?? "active") === "active",
	);
	const top = active.slice(0, 8);
	if (top.length === 0) {
		return 50;
	}
	return top.reduce((sum, p) => sum + p.skill, 0) / top.length;
};

/**
 * Depth / walk-on fillers — intentionally below Top-100 HS talent so
 * McDonald's kids remain the stars of each incoming class.
 */
export const generateCollegeFillers = async (
	team: CollegeTeam,
	prestige: number,
	count: number,
): Promise<CollegePlayer[]> => {
	const out: CollegePlayer[] = [];
	// Cap well under typical Top-100 FR ovr so commits stay special
	const topFiller = Math.min(58, 30 + prestige * 0.28 + rand(-2, 2));
	for (let i = 0; i < count; i++) {
		const ovr = Math.round(
			Math.max(38, Math.min(58, topFiller - i * 1.6 + rand(-3, 2))),
		);
		const n = await uniqueBbGmName();
		out.push({
			pid: nextPid++,
			tid: team.tid,
			firstName: n.firstName,
			lastName: n.lastName,
			pos: POSITIONS[rand(0, POSITIONS.length - 1)]!,
			year: pick(["FR", "SO", "JR"] as const),
			height: rand(72, 84),
			weight: rand(170, 255),
			skill: ovr,
			ovr,
			awards: [],
			stats: { gp: 0, pts: 0, reb: 0, ast: 0 },
			status: "active",
		});
	}
	return out;
};

/** Re-roll tiny-pool names onto BBGM names (one-time migration). */
export const refreshCollegeRosterNames = async (
	teamStates: Map<number, CollegeTeamState>,
) => {
	resetCollegeNamePool();
	for (const ts of teamStates.values()) {
		for (const p of ts.players) {
			const n = await uniqueBbGmName();
			p.firstName = n.firstName;
			p.lastName = n.lastName;
		}
		for (const p of ts.futureCommits ?? []) {
			usedFullNames.add(`${p.firstName}\0${p.lastName}`.toLowerCase());
		}
	}
};

/** Add / return a declared college roster entry for a draft prospect. */
export const upsertDeclaredOnRoster = (
	state: CollegeTeamState,
	team: CollegeTeam,
	p: {
		firstName: string;
		lastName: string;
		pos?: string;
		ovr?: number;
		height?: number;
		weight?: number;
		year?: CollegePlayer["year"];
		proPid?: number;
	},
): CollegePlayer => {
	let cp = state.players.find(
		(c) =>
			c.firstName === p.firstName &&
			c.lastName === p.lastName &&
			(c.status === "declared" || c.proPid === p.proPid),
	);
	if (!cp) {
		cp = state.players.find(
			(c) => c.firstName === p.firstName && c.lastName === p.lastName,
		);
	}
	if (!cp) {
		const ovr = Math.max(42, Math.min(85, p.ovr ?? 58));
		cp = {
			pid: nextPid++,
			tid: team.tid,
			firstName: p.firstName,
			lastName: p.lastName,
			pos: p.pos ?? "GF",
			year: p.year ?? "JR",
			height: p.height ?? 78,
			weight: p.weight ?? 210,
			skill: ovr,
			ovr,
			awards: [],
			stats: { gp: 0, pts: 0, reb: 0, ast: 0 },
			status: "declared",
			proPid: p.proPid,
		};
		state.players.push(cp);
		state.players.sort((a, b) => b.ovr - a.ovr);
	} else {
		cp.status = "declared";
		if (p.proPid != null) {
			cp.proPid = p.proPid;
		}
	}
	usedFullNames.add(`${cp.firstName}\0${cp.lastName}`.toLowerCase());
	return cp;
};

export const hsCommitToCollegePlayer = (
	tid: number,
	p: {
		pid: number;
		firstName: string;
		lastName: string;
		pos: string;
		height: number;
		weight: number;
		ovr: number;
		rank: number;
		awards?: string[];
	},
	arrivesSeason: number,
): CollegePlayer => ({
	pid: nextPid++,
	tid,
	firstName: p.firstName,
	lastName: p.lastName,
	pos: p.pos,
	year: "FR",
	height: p.height,
	weight: p.weight,
	skill: p.ovr,
	ovr: p.ovr,
	awards: [...(p.awards ?? [])],
	stats: { gp: 0, pts: 0, reb: 0, ast: 0 },
	status: "commit",
	hsRank: p.rank,
	hsPid: p.pid,
	arrivesSeason,
});

const YEAR_UP: Record<CollegePlayer["year"], CollegePlayer["year"] | null> = {
	FR: "SO",
	SO: "JR",
	JR: "SR",
	SR: null,
};

/**
 * Roll a roster into the next season: graduate/declare leavers, activate
 * Top-100 commits as FR, then fill remaining slots with weaker walk-ons.
 */
export const rebuildRosterForNewSeason = async (
	team: CollegeTeam,
	state: CollegeTeamState,
	newSeason: number,
): Promise<CollegePlayer[]> => {
	const returning: CollegePlayer[] = [];
	for (const p of state.players) {
		const status = p.status ?? "active";
		if (status === "declared" || status === "commit") {
			continue;
		}
		const nextYear = YEAR_UP[p.year];
		if (nextYear == null) {
			continue; // graduated SR
		}
		returning.push({
			...p,
			year: nextYear,
			stats: { gp: 0, pts: 0, reb: 0, ast: 0 },
			awards: [],
			status: "active",
		});
		usedFullNames.add(`${p.firstName}\0${p.lastName}`.toLowerCase());
	}

	const incoming = (state.futureCommits ?? [])
		.filter(
			(c) => c.arrivesSeason == null || c.arrivesSeason <= newSeason,
		)
		.map((c) => {
			usedFullNames.add(`${c.firstName}\0${c.lastName}`.toLowerCase());
			return {
				...c,
				year: "FR" as const,
				status: "active" as const,
				arrivesSeason: undefined,
				stats: { gp: 0, pts: 0, reb: 0, ast: 0 },
			};
		});

	const target = rand(13, 15);
	const combined = [...returning, ...incoming];
	const need = Math.max(0, target - combined.length);
	const fillers = await generateCollegeFillers(team, state.prestige, need);
	const roster = [...combined, ...fillers];
	roster.sort((a, b) => b.ovr - a.ovr);
	return roster;
};
