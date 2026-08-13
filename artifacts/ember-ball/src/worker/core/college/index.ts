import {
	COLLEGE_CONFERENCES,
	COLLEGE_TEAMS,
	collegeTeamCount,
} from "../../../common/college/d1Data.ts";
import type {
	CollegeConference,
	CollegeTeam,
} from "../../../common/college/types.ts";
import {
	generateCollegeRoster,
	hsCommitToCollegePlayer,
	rebuildRosterForNewSeason,
	refreshCollegeRosterNames,
	resetCollegeNamePool,
	seedPrestige,
	teamStrength,
	type CollegePlayer,
	type CollegeTeamState,
} from "./generate.ts";
import {
	advanceRecruitingDay,
	generateHsJuniorClass,
	generateHsTop100,
	refreshHsProspectNames,
	type HsProspect,
} from "./hsProspects.ts";
import {
	COLLEGE_REGULAR_SEASON_GAMES,
	collegePhaseForDate,
	dayToDate,
	expectedCollegeGames,
	formatDate,
	type CollegePhase,
} from "./calendar.ts";

export type BracketGame = {
	round: string;
	homeTid: number;
	awayTid: number;
	homeName: string;
	awayName: string;
	homeSeed: number;
	awaySeed: number;
	homeScore?: number;
	awayScore?: number;
	winnerTid?: number;
};

export type CollegeUniverseState = {
	enabled: boolean;
	season: number; // pro season year, e.g. 2026 => Oct 2026 tipoff
	phase: CollegePhase;
	day: number;
	conferences: CollegeConference[];
	teams: CollegeTeam[];
	teamStates: Map<number, CollegeTeamState>;
	hsProspects: HsProspect[];
	/** Junior class — the HS class 2 years from draft eligibility */
	hsJuniorClass: HsProspect[];
	/** One-time migration: HS names switched to BBGM name engine */
	hsNamesFromBbGm?: boolean;
	/** One-time migration: college roster names switched to BBGM engine */
	collegeNamesFromBbGm?: boolean;
	recentResults: {
		homeTid: number;
		awayTid: number;
		homeScore: number;
		awayScore: number;
		homeName: string;
		awayName: string;
		dateString: string;
	}[];
	confChampions: Map<number, number>; // cid -> tid
	bracket: BracketGame[];
	bracketField: { tid: number; seed: number; name: string }[];
	champion: string | undefined;
};

let collegeUniverse: CollegeUniverseState | undefined;

const confAbbrev = (cid: number) =>
	COLLEGE_CONFERENCES.find((c) => c.cid === cid)?.abbrev ?? "IND";

export const getCollegeUniverse = () => collegeUniverse;

const teamName = (uni: CollegeUniverseState, tid: number) => {
	const t = uni.teams.find((tt) => tt.tid === tid);
	return t ? `${t.region} ${t.name}` : `Team ${tid}`;
};

/** Sync accessor — all D1 teams are seeded in ensureCollegeUniverse. */
const getTeamState = (uni: CollegeUniverseState, tid: number) => {
	const ts = uni.teamStates.get(tid);
	if (!ts) {
		throw new Error(`College team state ${tid} missing`);
	}
	if (!ts.futureCommits) {
		ts.futureCommits = [];
	}
	return ts;
};

export const ensureCollegeUniverse = async (
	proSeason: number,
): Promise<CollegeUniverseState> => {
	if (!collegeUniverse) {
		resetCollegeNamePool();
		collegeUniverse = {
			enabled: true,
			season: proSeason,
			phase: "preseason",
			day: 0,
			conferences: COLLEGE_CONFERENCES,
			teams: COLLEGE_TEAMS,
			teamStates: new Map(),
			hsProspects: [],
			hsJuniorClass: [],
			recentResults: [],
			confChampions: new Map(),
			bracket: [],
			bracketField: [],
			champion: undefined,
			collegeNamesFromBbGm: true,
			hsNamesFromBbGm: true,
		};
		for (const t of COLLEGE_TEAMS) {
			const prestige = seedPrestige(t, confAbbrev(t.cid));
			collegeUniverse.teamStates.set(t.tid, {
				tid: t.tid,
				prestige,
				won: 0,
				lost: 0,
				players: await generateCollegeRoster(t, prestige),
				futureCommits: [],
			});
		}
		collegeUniverse.hsProspects = await generateHsTop100(
			COLLEGE_TEAMS,
			collegeUniverse.teamStates,
		);
		collegeUniverse.hsJuniorClass = await generateHsJuniorClass();
		console.log(
			`[college] D1 universe ready: ${collegeTeamCount} teams, HS Top 100 + Junior class generated`,
		);
	} else {
		// Backfill junior class if missing (existing save files)
		if (!collegeUniverse.hsJuniorClass?.length) {
			collegeUniverse.hsJuniorClass = await generateHsJuniorClass();
			console.log("[college] HS Junior class generated (backfill)");
		}
		if (
			!collegeUniverse.hsNamesFromBbGm &&
			collegeUniverse.hsProspects.length > 0
		) {
			await refreshHsProspectNames(collegeUniverse.hsProspects);
			collegeUniverse.hsNamesFromBbGm = true;
			console.log("[college] HS Top 100 names refreshed via BBGM name engine");
		}
		if (!collegeUniverse.collegeNamesFromBbGm) {
			await refreshCollegeRosterNames(collegeUniverse.teamStates);
			collegeUniverse.collegeNamesFromBbGm = true;
			console.log(
				"[college] D1 roster names refreshed via BBGM name engine (unique)",
			);
		}
	}
	return collegeUniverse;
};

/**
 * March Madness underdog "dice roll" — seed-sided die, boost table scaled
 * from the 16-seed chart, then faded as seeds get closer so 8/9 isn't chaos.
 *
 * Tuned conservatively so big first-round upsets stay rare (Madness-y, not chaos).
 * d16 table (underdog seed 16):
 *   1–8 → 0%, 9–11 → 3%, 12–13 → 6%, 14–15 → 10%, 16 → 13%
 */
const marchMadnessUpsetBoost = (
	underdogSeed: number,
	favoriteSeed: number,
): number => {
	if (underdogSeed <= favoriteSeed) {
		return 0;
	}
	const sides = Math.max(6, Math.min(16, underdogSeed));
	const roll = 1 + Math.floor(Math.random() * sides);
	const t = (n: number) => Math.max(1, Math.round((n / 16) * sides));
	let base = 0;
	if (roll <= t(8)) {
		base = 0;
	} else if (roll <= t(11)) {
		base = 0.03;
	} else if (roll <= t(13)) {
		base = 0.06;
	} else if (roll <= t(15)) {
		base = 0.1;
	} else {
		base = 0.13;
	}
	const gap = underdogSeed - favoriteSeed;
	const maxGap = Math.max(1, underdogSeed - 1);
	// Steeper than linear: close seeds barely get help; only true longshots do
	const gapScale = (gap / maxGap) ** 1.25;
	return base * gapScale;
};

const strengthWithBoost = (players: CollegePlayer[], boost: number) =>
	teamStrength(players) * (1 + boost);

const simOneGame = (
	uni: CollegeUniverseState,
	homeTid: number,
	awayTid: number,
	dateString: string,
	countRecord = true,
	opts?: {
		homeSeed?: number;
		awaySeed?: number;
		/** Apply March Madness underdog rating boost */
		madness?: boolean;
	},
) => {
	const home = getTeamState(uni, homeTid);
	const away = getTeamState(uni, awayTid);

	let homeBoost = 0;
	let awayBoost = 0;
	if (
		opts?.madness &&
		opts.homeSeed != null &&
		opts.awaySeed != null &&
		opts.homeSeed !== opts.awaySeed
	) {
		const homeIsUnderdog = opts.homeSeed > opts.awaySeed;
		const boost = marchMadnessUpsetBoost(
			homeIsUnderdog ? opts.homeSeed : opts.awaySeed,
			homeIsUnderdog ? opts.awaySeed : opts.homeSeed,
		);
		if (homeIsUnderdog) {
			homeBoost = boost;
		} else {
			awayBoost = boost;
		}
	}

	const homeStr = strengthWithBoost(home.players, homeBoost) + 2.5;
	const awayStr = strengthWithBoost(away.players, awayBoost);
	const homeExp = 68 + (homeStr - awayStr) * 0.55;
	const awayExp = 68 + (awayStr - homeStr) * 0.55;
	let homeScore = Math.max(48, Math.round(homeExp + (Math.random() - 0.5) * 22));
	let awayScore = Math.max(48, Math.round(awayExp + (Math.random() - 0.5) * 22));
	if (homeScore === awayScore) {
		homeScore += Math.random() < 0.5 ? 1 : 2; // overtime
	}

	const winner = homeScore > awayScore ? home : away;
	const loser = homeScore > awayScore ? away : home;
	if (countRecord) {
		winner.won += 1;
		loser.lost += 1;
	}

	winner.prestige = Math.min(
		99,
		winner.prestige + (winner.prestige < 85 ? 0.12 : 0.04),
	);
	loser.prestige = Math.max(
		20,
		loser.prestige - (loser.prestige > 40 ? 0.1 : 0.03),
	);

	const applyStats = (ts: CollegeTeamState, teamPts: number) => {
		for (const [i, p] of ts.players.slice(0, 8).entries()) {
			p.stats.gp += 1;
			const share = Math.max(0.04, 0.22 - i * 0.02);
			p.stats.pts += Math.round(teamPts * share * (0.85 + Math.random() * 0.3));
			p.stats.reb += Math.round(6 * (0.6 + Math.random()) * (1 - i * 0.05));
			p.stats.ast += Math.round(3.6 * (0.5 + Math.random()) * (1 - i * 0.06));
		}
	};
	applyStats(home, homeScore);
	applyStats(away, awayScore);

	uni.recentResults.unshift({
		homeTid,
		awayTid,
		homeScore,
		awayScore,
		homeName: teamName(uni, homeTid),
		awayName: teamName(uni, awayTid),
		dateString,
	});
	uni.recentResults = uni.recentResults.slice(0, 50);

	return homeScore > awayScore ? homeTid : awayTid;
};

/** Regular-season slate: teams behind their games-played pace get a game. */
const simRegularSeasonDay = (
	uni: CollegeUniverseState,
	date: Date,
	dateString: string,
) => {
	const expected = expectedCollegeGames(uni.season, date);
	const byConf = new Map<number, CollegeTeamState[]>();
	for (const t of uni.teams) {
		const ts = getTeamState(uni, t.tid);
		const played = ts.won + ts.lost;
		if (played < expected && played < COLLEGE_REGULAR_SEASON_GAMES) {
			const list = byConf.get(t.cid) ?? [];
			list.push(ts);
			byConf.set(t.cid, list);
		}
	}
	for (const [, group] of byConf) {
		const shuffled = [...group].sort(() => Math.random() - 0.5);
		for (let i = 0; i + 1 < shuffled.length; i += 2) {
			simOneGame(uni, shuffled[i]!.tid, shuffled[i + 1]!.tid, dateString);
		}
	}
};

/** One-shot conference tournaments — top seeds by record, single elim to a champion per conference. */
const runConferenceTournaments = (
	uni: CollegeUniverseState,
	dateString: string,
) => {
	if (uni.confChampions.size > 0) {
		return;
	}
	for (const conf of uni.conferences) {
		const teams = uni.teams
			.filter((t) => t.cid === conf.cid)
			.map((t) => getTeamState(uni, t.tid))
			.sort(
				(a, b) =>
					b.won / Math.max(1, b.won + b.lost) -
					a.won / Math.max(1, a.won + a.lost),
			)
			.slice(0, 8);
		if (teams.length === 0) {
			continue;
		}
		let field = teams.map((t) => t.tid);
		while (field.length > 1) {
			const next: number[] = [];
			for (let i = 0; i + 1 < field.length; i += 2) {
				next.push(simOneGame(uni, field[i]!, field[i + 1]!, dateString, false));
			}
			if (field.length % 2 === 1) {
				next.push(field.at(-1)!);
			}
			field = next;
		}
		uni.confChampions.set(conf.cid, field[0]!);
	}
	console.log(`[college] Conference tournaments complete: ${uni.confChampions.size} champions`);
};

/** Selection Sunday — 32 auto bids + at-large to 68, seeded by record*prestige. */
const runSelection = (uni: CollegeUniverseState) => {
	if (uni.bracketField.length > 0) {
		return;
	}
	const autoBids = new Set(uni.confChampions.values());
	const rated = uni.teams
		.map((t) => {
			const ts = getTeamState(uni, t.tid);
			const winp = ts.won / Math.max(1, ts.won + ts.lost);
			return {
				tid: t.tid,
				score: winp * 70 + ts.prestige * 0.5,
				auto: autoBids.has(t.tid),
			};
		})
		.sort((a, b) => b.score - a.score);

	const field: number[] = [];
	for (const r of rated) {
		if (r.auto) {
			field.push(r.tid);
		}
	}
	for (const r of rated) {
		if (field.length >= 68) {
			break;
		}
		if (!r.auto && !field.includes(r.tid)) {
			field.push(r.tid);
		}
	}
	const ranked = rated.filter((r) => field.includes(r.tid));
	uni.bracketField = ranked.slice(0, 68).map((r, i) => ({
		tid: r.tid,
		seed: Math.floor(i / 4) + 1,
		name: teamName(uni, r.tid),
	}));
	console.log("[college] Selection Sunday: 68-team field set");
};

const simBracketRound = (
	uni: CollegeUniverseState,
	round: string,
	dateString: string,
) => {
	const played = uni.bracket.filter((b) => b.round === round);
	if (played.length > 0) {
		return;
	}

	let entrants: { tid: number; seed: number; name: string }[];
	if (round === "First Four") {
		entrants = uni.bracketField.slice(60, 68);
	} else if (round === "Round of 64") {
		const ffWinners = uni.bracket
			.filter((b) => b.round === "First Four" && b.winnerTid != null)
			.map((b) => uni.bracketField.find((f) => f.tid === b.winnerTid)!)
			.filter(Boolean);
		entrants = [...uni.bracketField.slice(0, 60), ...ffWinners];
	} else {
		const prevRound = {
			"Round of 32": "Round of 64",
			"Sweet 16": "Round of 32",
			"Elite 8": "Sweet 16",
			"Final Four": "Elite 8",
			Championship: "Final Four",
		}[round];
		entrants = uni.bracket
			.filter((b) => b.round === prevRound && b.winnerTid != null)
			.map((b) => uni.bracketField.find((f) => f.tid === b.winnerTid)!)
			.filter(Boolean);
	}

	// Seed pairing: best vs worst
	const sorted = [...entrants].sort((a, b) => a.seed - b.seed);
	while (sorted.length > 1) {
		const high = sorted.shift()!;
		const low = sorted.pop()!;
		const winnerTid = simOneGame(uni, high.tid, low.tid, dateString, false, {
			homeSeed: high.seed,
			awaySeed: low.seed,
			madness: true,
		});
		uni.bracket.push({
			round,
			homeTid: high.tid,
			awayTid: low.tid,
			homeName: high.name,
			awayName: low.name,
			homeSeed: high.seed,
			awaySeed: low.seed,
			homeScore: uni.recentResults[0]!.homeScore,
			awayScore: uni.recentResults[0]!.awayScore,
			winnerTid,
		});
		if (round === "Championship") {
			uni.champion = teamName(uni, winnerTid);
			const champState = getTeamState(uni, winnerTid);
			champState.prestige = Math.min(99, champState.prestige + 6);
			console.log(`[college] National Champion: ${uni.champion}`);
		}
	}
};

export const advanceCollegeWithPro = async (proSeason: number) => {
	const uni = await ensureCollegeUniverse(proSeason);

	if (uni.season !== proSeason) {
		// Promote Top-100 commits onto rosters, age returners, fill with
		// weaker walk-ons — before wiping the HS board for the new class.
		resetCollegeNamePool();
		for (const ts of uni.teamStates.values()) {
			if (!ts.futureCommits) {
				ts.futureCommits = [];
			}
			const team = uni.teams.find((t) => t.tid === ts.tid)!;
			ts.players = await rebuildRosterForNewSeason(team, ts, proSeason);
			ts.futureCommits = [];
			ts.won = 0;
			ts.lost = 0;
		}
		uni.season = proSeason;
		uni.day = 0;
		uni.phase = "preseason";
		uni.confChampions = new Map();
		uni.bracket = [];
		uni.bracketField = [];
		uni.champion = undefined;
		// Last year's Junior class is now the Senior class; generate a new Junior class
		uni.hsProspects = uni.hsJuniorClass?.length
			? uni.hsJuniorClass
			: await generateHsTop100(uni.teams, uni.teamStates);
		uni.hsJuniorClass = await generateHsJuniorClass();
		uni.hsNamesFromBbGm = true;
		console.log(
			`[college] Season ${proSeason}: Top-100 commits enrolled, depth filled`,
		);
	}

	uni.day += 1;
	const date = dayToDate(uni.season, uni.day);
	const dateString = formatDate(date);
	uni.phase = collegePhaseForDate(uni.season, date);

	switch (uni.phase) {
		case "regular":
			simRegularSeasonDay(uni, date, dateString);
			break;
		case "confTournaments":
			runConferenceTournaments(uni, dateString);
			break;
		case "selectionSunday":
			runSelection(uni);
			break;
		case "firstFour":
			runSelection(uni); // safety if days were skipped
			simBracketRound(uni, "First Four", dateString);
			break;
		case "round64":
			simBracketRound(uni, "Round of 64", dateString);
			break;
		case "round32":
			simBracketRound(uni, "Round of 32", dateString);
			break;
		case "sweet16":
			simBracketRound(uni, "Sweet 16", dateString);
			break;
		case "elite8":
			simBracketRound(uni, "Elite 8", dateString);
			break;
		case "finalFour":
			simBracketRound(uni, "Final Four", dateString);
			break;
		case "championship":
			simBracketRound(uni, "Championship", dateString);
			break;
		default:
			break;
	}

	const newlyCommitted = advanceRecruitingDay(
		uni.hsProspects,
		uni.teams,
		uni.teamStates,
		uni.day,
	);
	// Mirror each new commit onto that school's "future commits" board
	for (const p of newlyCommitted) {
		if (p.committedTid == null) {
			continue;
		}
		const ts = getTeamState(uni, p.committedTid);
		const already = ts.futureCommits.some(
			(c) =>
				c.hsRank === p.rank &&
				c.firstName === p.firstName &&
				c.lastName === p.lastName,
		);
		if (already) {
			continue;
		}
		ts.futureCommits.push(
			hsCommitToCollegePlayer(
				p.committedTid,
				p,
				uni.season + 1,
			),
		);
	}
	return uni;
};

export const getCollegeTeamDetail = (tid: number) => {
	const uni = collegeUniverse;
	if (!uni) {
		return undefined;
	}
	const team = uni.teams.find((t) => t.tid === tid);
	if (!team) {
		return undefined;
	}
	const state = getTeamState(uni, tid);
	const conf = uni.conferences.find((c) => c.cid === team.cid);
	const active = state.players.filter(
		(p) => (p.status ?? "active") === "active",
	);
	const declared = state.players.filter((p) => p.status === "declared");
	const top8 = active.slice(0, 8);
	const teamOvr =
		top8.length > 0
			? Math.round(top8.reduce((sum, p) => sum + p.ovr, 0) / top8.length)
			: 0;
	const mapPlayer = (p: CollegePlayer) => ({
		pid: p.pid,
		tid: p.tid,
		firstName: p.firstName,
		lastName: p.lastName,
		pos: p.pos,
		year: p.year,
		height: p.height,
		weight: p.weight ?? 200,
		ovr: p.ovr,
		awards: p.awards ?? [],
		stats: p.stats,
		status: p.status ?? "active",
		proPid: p.proPid,
		hsRank: p.hsRank,
		hsPid: p.hsPid,
		arrivesSeason: p.arrivesSeason,
		ppg: p.stats.gp ? +(p.stats.pts / p.stats.gp).toFixed(1) : 0,
		rpg: p.stats.gp ? +(p.stats.reb / p.stats.gp).toFixed(1) : 0,
		apg: p.stats.gp ? +(p.stats.ast / p.stats.gp).toFixed(1) : 0,
	});
	return {
		team,
		conf,
		prestige: Math.round(state.prestige),
		teamOvr,
		won: state.won,
		lost: state.lost,
		players: [...active, ...declared].map(mapPlayer),
		futureCommits: (state.futureCommits ?? []).map(mapPlayer),
	};
};

export const getHsTop100 = () => {
	const uni = collegeUniverse;
	if (!uni) {
		return [];
	}
	return uni.hsProspects.map((p) => ({
		pid: p.pid,
		rank: p.rank,
		firstName: p.firstName,
		lastName: p.lastName,
		pos: p.pos,
		height: p.height,
		weight: p.weight ?? 200,
		hometown: p.hometown,
		ovr: p.ovr,
		awards: p.awards ?? [],
		offers: p.offers,
		committedTid: p.committedTid,
		committedSchool: p.committedSchool,
	}));
};

export const getHsJuniorClass = () => {
	const uni = collegeUniverse;
	if (!uni) {
		return [];
	}
	return (uni.hsJuniorClass ?? []).map((p) => ({
		pid: p.pid,
		rank: p.rank,
		firstName: p.firstName,
		lastName: p.lastName,
		pos: p.pos,
		height: p.height,
		weight: p.weight ?? 200,
		hometown: p.hometown,
		ovr: p.ovr,
		awards: p.awards ?? [],
	}));
};

export const getCollegeSnapshot = () => {
	const uni = collegeUniverse;
	if (!uni) {
		return undefined;
	}
	const date = dayToDate(uni.season, uni.day);
	return {
		enabled: uni.enabled,
		season: uni.season,
		phase: uni.phase,
		day: uni.day,
		dateString: formatDate(date),
		teamCount: uni.teams.length,
		recentResults: uni.recentResults,
		committedCount: uni.hsProspects.filter((p) => p.committedTid != null)
			.length,
		bracket: uni.bracket,
		bracketField: uni.bracketField,
		bracketFieldSize: uni.bracketField.length,
		champion: uni.champion,
	};
};

export const resetCollegeUniverse = () => {
	collegeUniverse = undefined;
};

export type { CollegePlayer, HsProspect };
