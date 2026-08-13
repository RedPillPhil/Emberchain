/**
 * Court Desk scouting — OOTP/FM-inspired fog of war.
 *
 * - All ratings display "?" until a scouting report exists for the player.
 * - Scouting costs points; points accrue daily, faster with a better staff.
 * - Reports are NEVER exact: each report stores per-category error offsets.
 *   Better scouts => smaller error. Re-scouting (higher report level) tightens
 *   the error band but it never reaches zero.
 */

import { isBrowseOnly } from "./browseGate.ts";

export type StaffRole =
	| "headScout"
	| "proScout"
	| "collegeScout"
	| "headCoach"
	| "assistantCoach";

export type StaffMember = {
	name: string;
	rating: number; // 40-95
	specialty: "ability" | "potential" | "balanced";
};

export type ScoutingReport = {
	level: 1 | 2 | 3; // times scouted
	/** Error offsets per rating key, applied to true/fuzzed values at display */
	noise: Record<string, number>;
	scoutName: string;
	accuracy: "Low" | "Medium" | "High";
	/** Scouting-staff generation this report was filed under */
	gen: number;
	/** Per-rating-key confidence tier 0-4 (red → blue) */
	conf?: Record<string, number>;
	/** Pre-draft workouts completed for this player */
	workouts?: WorkoutId[];
};

/** 0 🔴 very unsure · 1 🟠 unsure · 2 🟡 moderate · 3 🟢 high · 4 🔵 certain */
export const CONFIDENCE_META = [
	{ color: "#ef5b5b", label: "Very unsure" },
	{ color: "#ff9f1a", label: "Unsure" },
	{ color: "#f5d76e", label: "Moderate confidence" },
	{ color: "#2fd67b", label: "High confidence" },
	{ color: "#4aa3ff", label: "Extremely confident" },
] as const;

export type WorkoutId =
	| "shooting"
	| "ballhandling"
	| "playmaking"
	| "athletic"
	| "defensive";

export type Workout = {
	id: WorkoutId;
	label: string;
	cost: number;
	keys: string[];
	blurb: string;
};

export const WORKOUTS: Workout[] = [
	{
		id: "shooting",
		label: "Shooting Workout",
		cost: 2,
		keys: ["fg", "tp", "ft", "ins"],
		blurb: "Spot-ups, off-the-dribble, FT mechanics",
	},
	{
		id: "ballhandling",
		label: "Ball-Handling Workout",
		cost: 2,
		keys: ["drb", "oiq"],
		blurb: "Dribble combos, ball security, change of pace",
	},
	{
		id: "playmaking",
		label: "Playmaking Workout",
		cost: 2,
		keys: ["pss", "oiq"],
		blurb: "Pick-and-roll reads, vision, decision-making",
	},
	{
		id: "athletic",
		label: "Athletic Testing",
		cost: 2,
		keys: ["hgt", "stre", "spd", "jmp", "endu", "dnk"],
		blurb: "Combine measurements: sprint, vert, strength — hard data",
	},
	{
		id: "defensive",
		label: "Defensive Workout",
		cost: 2,
		keys: ["diq", "reb"],
		blurb: "Lateral slides, closeouts, positioning drills",
	},
];

export type ScoutingState = {
	points: number;
	reports: Record<number, ScoutingReport>;
	staff: Record<StaffRole, StaffMember>;
	candidates: Record<StaffRole, StaffMember[]>;
	/** Bumped when a new scout is hired — lets fully-scouted players be re-scouted */
	scoutGen: number;
	/** Highest gid already mined for in-game scouting knowledge */
	lastCrumbGid?: number;
};

const KEY = "courtDeskScoutingV2";

const FIRST = ["Sam", "Rick", "Doug", "Maurice", "Pat", "Terry", "Gene", "Hal", "Vince", "Cal", "Roy", "Bill", "Eddie", "Frank", "Gus"];
const LAST = ["Bertka", "Colangelo", "Weiss", "McCombs", "Fitch", "Sloan", "Karl", "Nelson", "Ramsey", "Holzman", "Sharman", "Motta", "Harris", "Fratello", "Winter"];

const rand = (min: number, max: number) =>
	min + Math.floor(Math.random() * (max - min + 1));
const pick = <T,>(arr: readonly T[]) => arr[rand(0, arr.length - 1)]!;

const genStaff = (quality: "low" | "mid" | "high" = "mid"): StaffMember => {
	const range =
		quality === "low" ? [40, 62] : quality === "high" ? [70, 95] : [50, 80];
	return {
		name: `${pick(FIRST)} ${pick(LAST)}`,
		rating: rand(range[0]!, range[1]!),
		specialty: pick(["ability", "potential", "balanced"] as const),
	};
};

const genCandidates = (): StaffMember[] => [
	genStaff("low"),
	genStaff("mid"),
	genStaff("mid"),
	genStaff("high"),
];

export const STAFF_ROLES: { role: StaffRole; label: string; blurb: string }[] = [
	{ role: "headScout", label: "Head Scout", blurb: "Report accuracy + daily scouting points" },
	{ role: "proScout", label: "Pro Scout", blurb: "Accuracy on pro players" },
	{ role: "collegeScout", label: "College Scout", blurb: "Accuracy on college + HS prospects" },
	{ role: "headCoach", label: "Head Coach", blurb: "On-court results + training camp points" },
	{ role: "assistantCoach", label: "Assistant Coach", blurb: "Training camp focus pool size" },
];

export const defaultScouting = (): ScoutingState => ({
	points: 10,
	reports: {},
	staff: {
		headScout: genStaff("low"),
		proScout: genStaff("low"),
		collegeScout: genStaff("low"),
		headCoach: genStaff("mid"),
		assistantCoach: genStaff("low"),
	},
	candidates: {
		headScout: genCandidates(),
		proScout: genCandidates(),
		collegeScout: genCandidates(),
		headCoach: genCandidates(),
		assistantCoach: genCandidates(),
	},
	scoutGen: 0,
});

export const loadScouting = (lid: number | undefined): ScoutingState => {
	if (lid === undefined) {
		return defaultScouting();
	}
	try {
		const raw = localStorage.getItem(`${KEY}:${lid}`);
		if (!raw) {
			const fresh = defaultScouting();
			saveScouting(lid, fresh);
			return fresh;
		}
		return { ...defaultScouting(), ...JSON.parse(raw) };
	} catch {
		return defaultScouting();
	}
};

export const saveScouting = (lid: number, state: ScoutingState) => {
	localStorage.setItem(`${KEY}:${lid}`, JSON.stringify(state));
};

export const getReport = (
	state: ScoutingState,
	pid: number | undefined,
): ScoutingReport | undefined =>
	pid === undefined ? undefined : state.reports[pid];

export const isScouted = (state: ScoutingState, pid: number | undefined) =>
	!!getReport(state, pid);

/** Confidence tier (0-4) for one rating key, or undefined if unscouted. */
export const getConfidence = (
	state: ScoutingState,
	pid: number | undefined,
	key: string,
): number | undefined => {
	const report = getReport(state, pid);
	if (!report) {
		return undefined;
	}
	if (report.conf?.[key] != null) {
		return report.conf[key];
	}
	// Legacy reports (pre-confidence): derive from report level
	return Math.max(0, Math.min(3, (report.level ?? 1) - 1));
};

/** Level 3 AND filed by the current scouting staff — a new hire resets this. */
export const isFullyScouted = (
	state: ScoutingState,
	pid: number | undefined,
) => {
	const report = getReport(state, pid);
	return !!report && report.level >= 3 && (report.gen ?? 0) >= state.scoutGen;
};

/** Display a rating through the fog: "?" unless scouted, then value + report noise. */
export const formatRating = (
	state: ScoutingState,
	pid: number | undefined,
	value: number | string | undefined,
	noiseKey = "ovr",
	/** When formatting pot, pass the (true) ovr so we never show pot < ovr */
	floorValue?: number,
): string => {
	const report = getReport(state, pid);
	if (!report) {
		return "?";
	}
	if (value === undefined || value === null || typeof value === "string") {
		return value == null ? "—" : String(value);
	}
	const offset = report.noise[noiseKey] ?? 0;
	let shown = Math.max(25, Math.min(99, Math.round(value + offset)));
	if (floorValue != null) {
		const floorOffset = report.noise.ovr ?? 0;
		const floorShown = Math.max(
			25,
			Math.min(99, Math.round(floorValue + floorOffset)),
		);
		shown = Math.max(shown, floorShown);
	}
	return String(shown);
};

const gaussian = () => {
	let u = 0;
	let v = 0;
	while (u === 0) u = Math.random();
	while (v === 0) v = Math.random();
	return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

export const RATING_KEYS = [
	"ovr",
	"pot",
	"hgt",
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
];

export const SCOUT_COSTS: Record<1 | 2 | 3, number> = { 1: 1, 2: 2, 3: 3 };

/** Tighten noise and raise confidence for a completed workout's rating keys.
 *  Athletic testing is objective measurement — near-truth, max confidence. */
const applyWorkoutEffect = (
	noise: Record<string, number>,
	conf: Record<string, number>,
	workoutId: WorkoutId,
) => {
	const workout = WORKOUTS.find((w) => w.id === workoutId);
	if (!workout) {
		return;
	}
	for (const key of workout.keys) {
		if (workoutId === "athletic") {
			noise[key] = Math.round((noise[key] ?? 0) * 0.15 * 10) / 10;
			conf[key] = 4;
		} else {
			noise[key] = Math.round((noise[key] ?? 0) * 0.5 * 10) / 10;
			conf[key] = Math.min(4, (conf[key] ?? 0) + 1);
		}
	}
};

/**
 * Scout (or re-scout) a player. Error stddev shrinks with scout rating and
 * report level, but never hits zero — reports are opinions, not truth.
 */
export const scoutPlayer = (
	lid: number,
	state: ScoutingState,
	pid: number,
	kind: "pro" | "college" = "pro",
): { state: ScoutingState; ok: boolean; message: string } => {
	if (isBrowseOnly()) {
		return {
			state,
			ok: false,
			message: "Scouting is locked — browse-only Ember League",
		};
	}
	const existing = state.reports[pid];
	const staleGen = existing && (existing.gen ?? 0) < state.scoutGen;
	if (existing && existing.level >= 3 && !staleGen) {
		return {
			state,
			ok: false,
			message: "Fully scouted — hire a new scout for a fresh evaluation",
		};
	}
	// A newly hired scout re-evaluates at the same level with fresh eyes
	const nextLevel = (
		existing ? (staleGen ? existing.level : Math.min(3, existing.level + 1)) : 1
	) as 1 | 2 | 3;
	const cost = SCOUT_COSTS[nextLevel];
	if (state.points < cost) {
		return { state, ok: false, message: `Need ${cost} scouting points` };
	}

	const areaScout =
		kind === "pro" ? state.staff.proScout : state.staff.collegeScout;
	const effRating = 0.6 * state.staff.headScout.rating + 0.4 * areaScout.rating;

	// stddev: rating 40 => ~6.5, rating 95 => ~2.0; level shrinks it further
	const baseStd = Math.max(1.5, 8.5 - effRating / 15);
	const std = baseStd / (1 + 0.45 * (nextLevel - 1));

	const noise: Record<string, number> = {};
	const conf: Record<string, number> = {};
	const baseTier = std < 2.2 ? 2 : std < 3.5 ? 1 : 0;
	for (const key of RATING_KEYS) {
		let n = gaussian() * std;
		// Specialty bias: potential scouts skew pot optimistic, ability scouts tighten ovr
		if (key === "pot" && areaScout.specialty === "potential") {
			n = n * 0.7 + 1;
		}
		if (key === "ovr" && areaScout.specialty === "ability") {
			n = n * 0.7;
		}
		noise[key] = Math.round(n * 10) / 10;

		// Per-key confidence: more looks = more certainty, but the scout didn't
		// see every skill equally, and potential is never a sure thing
		let tier = Math.min(3, baseTier + (nextLevel - 1));
		if (Math.random() < 0.3) {
			tier = Math.max(0, tier - 1);
		}
		if (key === "pot") {
			tier = Math.min(tier, 2);
		}
		conf[key] = tier;
	}

	// Completed workouts are hard data — they survive a re-scout
	const prevWorkouts = existing?.workouts ?? [];
	for (const workoutId of prevWorkouts) {
		applyWorkoutEffect(noise, conf, workoutId);
	}

	const accuracy: ScoutingReport["accuracy"] =
		std < 2.4 ? "High" : std < 4 ? "Medium" : "Low";

	const next: ScoutingState = {
		...state,
		points: state.points - cost,
		reports: {
			...state.reports,
			[pid]: {
				level: nextLevel,
				noise,
				conf,
				workouts: prevWorkouts,
				scoutName: areaScout.name,
				accuracy,
				gen: state.scoutGen,
			},
		},
	};
	saveScouting(lid, next);
	return {
		state: next,
		ok: true,
		message: `Report filed (${accuracy} accuracy, level ${nextLevel})`,
	};
};

/**
 * Run a pre-draft workout for a prospect. Requires an existing scouting
 * report. Improves confidence (and tightens the error band) on the workout's
 * rating areas — it does NOT reveal true ratings.
 */
export const runWorkout = (
	lid: number,
	state: ScoutingState,
	pid: number,
	workoutId: WorkoutId,
): { state: ScoutingState; ok: boolean; message: string } => {
	if (isBrowseOnly()) {
		return {
			state,
			ok: false,
			message: "Workouts are locked — browse-only Ember League",
		};
	}
	const report = state.reports[pid];
	if (!report) {
		return {
			state,
			ok: false,
			message: "File a scouting report before scheduling a workout",
		};
	}
	const workout = WORKOUTS.find((w) => w.id === workoutId);
	if (!workout) {
		return { state, ok: false, message: "Unknown workout" };
	}
	const done = report.workouts ?? [];
	if (done.includes(workoutId)) {
		return { state, ok: false, message: `${workout.label} already completed` };
	}
	if (state.points < workout.cost) {
		return {
			state,
			ok: false,
			message: `Need ${workout.cost} scouting points`,
		};
	}

	const noise = { ...report.noise };
	const conf = { ...(report.conf ?? {}) };
	applyWorkoutEffect(noise, conf, workoutId);

	const next: ScoutingState = {
		...state,
		points: state.points - workout.cost,
		reports: {
			...state.reports,
			[pid]: {
				...report,
				noise,
				conf,
				workouts: [...done, workoutId],
			},
		},
	};
	saveScouting(lid, next);
	return {
		state: next,
		ok: true,
		message:
			workoutId === "athletic"
				? "Athletic testing complete — measurements locked in"
				: `${workout.label} complete — confidence improved`,
	};
};

const SCOUT_ROLES_SET: StaffRole[] = ["headScout", "proScout", "collegeScout"];

export const hireStaff = (
	lid: number,
	state: ScoutingState,
	role: StaffRole,
	candidateIndex: number,
): ScoutingState => {
	const candidate = state.candidates[role][candidateIndex];
	if (!candidate) {
		return state;
	}
	// New scout = new set of eyes: fully-scouted players open up for re-evaluation
	const isScoutHire = SCOUT_ROLES_SET.includes(role);
	const next: ScoutingState = {
		...state,
		staff: { ...state.staff, [role]: candidate },
		candidates: {
			...state.candidates,
			[role]: state.candidates[role].filter((_, i) => i !== candidateIndex),
		},
		scoutGen: isScoutHire ? state.scoutGen + 1 : state.scoutGen,
	};
	saveScouting(lid, next);
	return next;
};

export const refreshCandidates = (
	lid: number,
	state: ScoutingState,
): ScoutingState => {
	const next: ScoutingState = {
		...state,
		candidates: {
			headScout: genCandidates(),
			proScout: genCandidates(),
			collegeScout: genCandidates(),
			headCoach: genCandidates(),
			assistantCoach: genCandidates(),
		},
	};
	saveScouting(lid, next);
	return next;
};

/**
 * Mine completed games for scouting crumbs. Playing against a guy IS
 * scouting him: opponents who log heavy minutes against you have a chance to
 * generate free "game film" notes — a coarse report if he's unknown, or a
 * sharpened read on one rating area if he's already in the book. Your
 * coaching staff quality raises the odds.
 */
export const absorbGameKnowledge = (
	lid: number,
	state: ScoutingState,
	games: any[],
	userTid: number | undefined,
): { state: ScoutingState; notes: string[] } => {
	if (userTid == null || !Array.isArray(games) || games.length === 0) {
		return { state, notes: [] };
	}

	// First run after this feature ships: baseline to the newest game so we
	// only mine games played from now on (not a whole season's backlog).
	if (state.lastCrumbGid === undefined) {
		let newest = -1;
		for (const game of games) {
			if (typeof game?.gid === "number" && game.gid > newest) {
				newest = game.gid;
			}
		}
		const baselined: ScoutingState = { ...state, lastCrumbGid: newest };
		saveScouting(lid, baselined);
		return { state: baselined, notes: [] };
	}

	const lastGid = state.lastCrumbGid;
	let maxGid = lastGid;
	const reports = { ...state.reports };
	const notes: string[] = [];

	// Head coach + assistant drive how much the staff picks up from film
	const staffFactor =
		(state.staff.headCoach.rating + state.staff.assistantCoach.rating) / 160;

	for (const game of games) {
		if (typeof game?.gid !== "number" || game.gid <= lastGid) {
			continue;
		}
		maxGid = Math.max(maxGid, game.gid);

		for (const t of game.teams ?? []) {
			if (t?.tid === userTid || t?.tid == null || t.tid < 0) {
				continue;
			}
			for (const p of t.players ?? []) {
				const min = typeof p?.min === "number" ? p.min : 0;
				if (min <= 0 || typeof p.pid !== "number") {
					continue;
				}
				// ~8% at 12 min up to ~35% at 40 min, scaled by staff quality
				const chance = Math.min(0.4, (min / 48) * 0.42) * (0.6 + staffFactor);
				if (Math.random() > chance) {
					continue;
				}

				const name = p.name ?? `Player #${p.pid}`;
				const existing = reports[p.pid];

				if (!existing) {
					// Coarse game-film report — wide error band, low confidence
					const noise: Record<string, number> = {};
					const conf: Record<string, number> = {};
					for (const key of RATING_KEYS) {
						noise[key] = Math.round(gaussian() * 5.5 * 10) / 10;
						conf[key] = Math.random() < 0.25 ? 1 : 0;
					}
					reports[p.pid] = {
						level: 1,
						noise,
						conf,
						workouts: [],
						scoutName: "Game film",
						accuracy: "Low",
						gen: state.scoutGen,
					};
					notes.push(name);
				} else {
					// Sharpen one random rating area from the matchup
					const key = pick(RATING_KEYS);
					const noise = { ...existing.noise };
					const conf = { ...(existing.conf ?? {}) };
					noise[key] = Math.round((noise[key] ?? 0) * 0.75 * 10) / 10;
					conf[key] = Math.min(3, (conf[key] ?? 0) + 1);
					reports[p.pid] = { ...existing, noise, conf };
					notes.push(name);
				}
			}
		}
	}

	if (maxGid === lastGid) {
		return { state, notes: [] };
	}

	const next: ScoutingState = { ...state, reports, lastCrumbGid: maxGid };
	saveScouting(lid, next);
	return { state: next, notes };
};

/** Daily point accrual — better head scout, more points. */
export const grantSimScoutingPoints = (
	lid: number,
	state: ScoutingState,
	days = 1,
) => {
	const perDay = 0.5 + state.staff.headScout.rating / 90; // ~1.0 to ~1.5
	const next = {
		...state,
		points: Math.round((state.points + perDay * days) * 10) / 10,
	};
	saveScouting(lid, next);
	return next;
};
