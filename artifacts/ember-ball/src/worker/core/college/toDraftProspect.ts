import { PLAYER } from "../../../common/constants.ts";
import { POSITIONS } from "../../../common/constants.basketball.ts";
import type { PlayerWithoutKey } from "../../../common/types.ts";
import { player } from "../index.ts";
import { g } from "../../util/index.ts";
import { ensureCollegeUniverse, getCollegeUniverse } from "./index.ts";
import {
	upsertDeclaredOnRoster,
	type CollegePlayer,
} from "./generate.ts";
import { COLLEGE_TEAMS } from "../../../common/college/d1Data.ts";
import {
	collegeDisplayName,
	resolveCollegeTeam,
} from "../../../common/college/resolveCollege.ts";

/**
 * Pull the best draft-eligible college players into a BBGM undrafted class
 * so Draft Central / the draft room reflect our D1 universe.
 * Source college players stay on the roster marked `declared`.
 */
export const injectCollegeDraftProspects = async (
	draftYear: number,
	existingCount: number,
	targetCollegeSlots = 250,
): Promise<PlayerWithoutKey[]> => {
	await ensureCollegeUniverse(g.get("season"));
	const uni = getCollegeUniverse();
	if (!uni) {
		return [];
	}

	// Don't fill slots that already have college-injected players, but allow
	// a generous ceiling so ALL declaring players make it in.
	const slots = Math.max(0, targetCollegeSlots - existingCount);
	if (slots === 0) {
		return [];
	}

	type Ranked = {
		cp: CollegePlayer;
		school: string;
		collegeTid: number;
		score: number;
	};

	const pool: Ranked[] = [];
	for (const team of COLLEGE_TEAMS) {
		const state = uni.teamStates.get(team.tid);
		if (!state) {
			continue;
		}
		const school = `${team.region} ${team.name}`;
		for (const cp of state.players) {
			if ((cp.status ?? "active") !== "active") {
				continue;
			}
		// Real basketball declare rates:
		//
		// SR:  always declares — out of eligibility
		// JR:  elite JRs (ovr 70+) go ~70%; solid JRs (65+) ~40%; below rarely
		// SO:  only the truly special (ovr 72+) leave after 2 years (~25%)
		// FR:  tiered 1-and-done logic:
		//   rank 1-5 (ovr ~70+)  → ~90% (Anthony Davis, Zion types — can't stay)
		//   rank 6-15 (ovr 67+)  → ~65% (great freshman season, mid-lottery lock)
		//   rank 16-30 (ovr 63+) → ~22% (talented but need more seasoning)
		//   below rank 30 (<63)  → ~3%  (occasionally a guy blows up)
		const declares =
			cp.year === "SR" ||
			(cp.year === "JR" &&
				(cp.ovr >= 70
					? Math.random() < 0.70
					: cp.ovr >= 65
						? Math.random() < 0.40
						: cp.ovr >= 60
							? Math.random() < 0.14
							: false)) ||
			(cp.year === "SO" && cp.ovr >= 72 && Math.random() < 0.25) ||
			(cp.year === "FR" &&
				(cp.ovr >= 70
					? Math.random() < 0.90
					: cp.ovr >= 67
						? Math.random() < 0.65
						: cp.ovr >= 63
							? Math.random() < 0.22
							: Math.random() < 0.03));
			if (!declares) {
				continue;
			}
			pool.push({
				cp,
				school,
				collegeTid: team.tid,
				score: cp.ovr * 1.15 + cp.skill * 0.1 + (cp.year === "SR" ? 1 : 0),
			});
		}
	}

	pool.sort((a, b) => b.score - a.score);
	const chosen = pool.slice(0, slots);
	const out: PlayerWithoutKey[] = [];

	for (const { cp, school, collegeTid } of chosen) {
		const age =
			cp.year === "FR" ? 19 : cp.year === "SO" ? 20 : cp.year === "JR" ? 21 : 22;
		const p = player.generate(PLAYER.UNDRAFTED, age, draftYear, false, 24, {
			college: school,
			country: "USA",
			firstName: cp.firstName,
			lastName: cp.lastName,
			race: "black",
		});
		p.born = { year: draftYear - age, loc: "USA" };
		p.draft.year = draftYear;
		p.tid = PLAYER.UNDRAFTED;
		p.college = school;

		const r = p.ratings.at(-1)!;
		const base = Math.max(38, Math.min(72, Math.round(cp.ovr * 0.82)));
		const pot = Math.min(
			88,
			base +
				(cp.year === "FR" ? 14 : cp.year === "SO" ? 11 : cp.year === "JR" ? 8 : 5),
		);
		r.ovr = base;
		r.pot = Math.max(base, pot);
		r.pos = (POSITIONS.includes(cp.pos as any) ? cp.pos : "GF") as any;
		r.hgt = Math.min(99, Math.max(20, Math.round((cp.height - 70) * 3.2)));
		for (const key of [
			"stre",
			"spd",
			"jmp",
			"endu",
			"ins",
			"dnk",
			"ft",
			"fg",
			"tp",
			"oiq",
			"diq",
			"drb",
			"pss",
			"reb",
		] as const) {
			(r as any)[key] = Math.max(
				20,
				Math.min(90, base + Math.round((Math.random() - 0.45) * 12)),
			);
		}

		await player.develop(p, 0);
		p.college = school;
		(p as any).collegeTid = collegeTid;
		(p as any).collegePid = cp.pid;

		// Keep him on the college roster so From → college still shows him
		cp.status = "declared";
		// Stamp college year so the draft board can show FR/SO/JR/SR badge
		(p as any).collegeYear = cp.year;

		out.push(p);
	}

	console.log(
		`[college→draft] Injected ${out.length} D1 prospects into ${draftYear} class (kept on college rosters as declared)`,
	);
	return out;
};

/** After idb assigns pids, stamp proPid back onto college source players. */
export const linkDeclaredCollegeProspects = (
	prospects: { pid?: number; collegePid?: number; collegeTid?: number }[],
) => {
	const uni = getCollegeUniverse();
	if (!uni) {
		return;
	}
	for (const p of prospects) {
		if (p.pid == null || p.collegePid == null || p.collegeTid == null) {
			continue;
		}
		const state = uni.teamStates.get(p.collegeTid);
		const cp = state?.players.find((c) => c.pid === p.collegePid);
		if (cp) {
			cp.proPid = p.pid;
			cp.status = "declared";
		}
	}
};

/**
 * Every undrafted prospect with a resolvable US college gets a matching
 * Declared entry on that D1 roster (and collegeTid stamped on the prospect).
 * Fixes draft-board → college continuity for BBGM filler prospects too.
 */
export const syncUndraftedOntoCollegeRosters = async (
	prospects: {
		pid: number;
		firstName: string;
		lastName: string;
		college?: string;
		ratings?: { pos?: string; ovr?: number; hgt?: number }[];
		hgt?: number;
		weight?: number;
		draft?: { year?: number };
	}[],
) => {
	await ensureCollegeUniverse(g.get("season"));
	const uni = getCollegeUniverse();
	if (!uni) {
		return { linked: 0 };
	}

	let linked = 0;
	for (const p of prospects) {
		const anyP = p as any;
		const team =
			(typeof anyP.collegeTid === "number"
				? COLLEGE_TEAMS.find((t) => t.tid === anyP.collegeTid)
				: undefined) ?? resolveCollegeTeam(p.college);
		if (!team) {
			continue;
		}
		const state = uni.teamStates.get(team.tid);
		if (!state) {
			continue;
		}
		const r = p.ratings?.at(-1);
		const yearGuess =
			(p as any).age != null
				? (p as any).age <= 19
					? "FR"
					: (p as any).age === 20
						? "SO"
						: (p as any).age === 21
							? "JR"
							: "SR"
				: "JR";
		const cp = upsertDeclaredOnRoster(state, team, {
			firstName: p.firstName,
			lastName: p.lastName,
			pos:
				r?.pos && POSITIONS.includes(r.pos as any) ? r.pos : "GF",
			ovr: r?.ovr != null ? Math.round(r.ovr / 0.82) : 60,
			height: p.hgt ?? 78,
			weight: p.weight ?? 210,
			year: yearGuess as CollegePlayer["year"],
			proPid: p.pid,
		});
		anyP.collegeTid = team.tid;
		anyP.collegePid = cp.pid;
		anyP.college = collegeDisplayName(team);
		linked++;
	}
	console.log(
		`[college→draft] Synced ${linked} undrafted prospects onto D1 rosters`,
	);
	return { linked };
};
