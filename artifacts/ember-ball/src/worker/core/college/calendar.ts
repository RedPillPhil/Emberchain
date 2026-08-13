/**
 * Real-calendar model for the 2026-27 style season.
 *
 * Day 0 of a universe = pro opening night. Every "Play" press advances one
 * real calendar day. Key dates follow the actual NBA/NCAA structure:
 *
 *   Pro opening night:      Tue Oct 20 (year N)
 *   College opening night:  Mon Nov 2 (year N)
 *   College regular ends:   Sun Mar 7 (year N+1) — ~31 games/team
 *   Conference tournaments: Mon Mar 8 – Sun Mar 14 (Selection Sunday)
 *   First Four:             Tue-Wed Mar 16-17
 *   Round of 64:            Thu-Fri Mar 18-19
 *   Round of 32:            Sat-Sun Mar 20-21
 *   Sweet 16:               Thu-Fri Mar 25-26
 *   Elite 8:                Sat-Sun Mar 27-28
 *   Final Four:             Sat Apr 3
 *   Championship:           Mon Apr 5
 */

export type CollegePhase =
	| "offseason"
	| "preseason"
	| "regular"
	| "confTournaments"
	| "selectionSunday"
	| "firstFour"
	| "round64"
	| "round32"
	| "sweet16"
	| "elite8"
	| "finalFour"
	| "championship"
	| "postTournament";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Pro opening night for a season starting in calendar year `year`. */
export const proSeasonStart = (year: number) => new Date(Date.UTC(year, 9, 20));

export const dayToDate = (startYear: number, day: number): Date =>
	new Date(proSeasonStart(startYear).getTime() + day * DAY_MS);

const WEEKDAYS = [
	"Sunday",
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
];
const MONTHS = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
];

export const formatDate = (d: Date): string =>
	`${WEEKDAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;

const utc = (year: number, month: number, dayOfMonth: number) =>
	Date.UTC(year, month, dayOfMonth);

export const collegeMilestones = (startYear: number) => {
	const y2 = startYear + 1;
	return {
		collegeOpener: utc(startYear, 10, 2), // Nov 2
		regularSeasonEnd: utc(y2, 2, 7), // Mar 7
		confTournamentsStart: utc(y2, 2, 8), // Mar 8
		selectionSunday: utc(y2, 2, 14), // Mar 14
		firstFour: utc(y2, 2, 16), // Mar 16-17
		round64: utc(y2, 2, 18), // Mar 18-19
		round32: utc(y2, 2, 20), // Mar 20-21
		sweet16: utc(y2, 2, 25), // Mar 25-26
		elite8: utc(y2, 2, 27), // Mar 27-28
		finalFour: utc(y2, 3, 3), // Apr 3
		championship: utc(y2, 3, 5), // Apr 5
	};
};

/**
 * Pro calendar milestones modeled on a 2026–27 NBA-style year.
 * `startYear` is the calendar year of Opening Night (e.g. 2026 for 2026-27).
 */
export const proMilestones = (startYear: number) => {
	const y2 = startYear + 1;
	return {
		trainingCamp: utc(startYear, 8, 28), // late Sep
		preseason: utc(startYear, 9, 5), // early Oct
		gLeagueTip: utc(startYear, 10, 8), // early Nov
		openingNight: utc(startYear, 9, 20), // Oct 20
		christmas: utc(startYear, 11, 25), // Dec 25
		tradeDeadline: utc(y2, 1, 11), // mid Feb
		allStarWeekend: utc(y2, 1, 19), // Fri All-Star Weekend
		allStarGame: utc(y2, 1, 21), // Sun All-Star Game
		regularSeasonEnd: utc(y2, 3, 11), // Apr 11
		playIn: utc(y2, 3, 13), // mid Apr
		playoffs: utc(y2, 3, 17), // mid/late Apr
		finals: utc(y2, 5, 3), // early June
		draft: utc(y2, 5, 24), // late June
		freeAgencyTalks: utc(y2, 5, 30), // Jun 30
		freeAgencySign: utc(y2, 6, 6), // Jul 6
		summerLeague: utc(y2, 6, 9), // mid Jul
	};
};

export type ProMilestone = {
	key: string;
	label: string;
	date: Date;
	day: number;
};

export const proMilestoneList = (startYear: number): ProMilestone[] => {
	const m = proMilestones(startYear);
	const start = proSeasonStart(startYear).getTime();
	const entries: { key: string; label: string; ts: number }[] = [
		{ key: "trainingCamp", label: "Training Camp", ts: m.trainingCamp },
		{ key: "preseason", label: "Preseason", ts: m.preseason },
		{ key: "openingNight", label: "Opening Night", ts: m.openingNight },
		{ key: "gLeagueTip", label: "G League Tip-Off", ts: m.gLeagueTip },
		{ key: "christmas", label: "Christmas Day", ts: m.christmas },
		{ key: "tradeDeadline", label: "Trade Deadline", ts: m.tradeDeadline },
		{ key: "allStarGame", label: "All-Star Game", ts: m.allStarGame },
		{
			key: "regularSeasonEnd",
			label: "Regular Season Ends",
			ts: m.regularSeasonEnd,
		},
		{ key: "playIn", label: "Play-In Tournament", ts: m.playIn },
		{ key: "playoffs", label: "Playoffs Begin", ts: m.playoffs },
		{ key: "finals", label: "NBA Finals", ts: m.finals },
		{ key: "draft", label: "NBA Draft", ts: m.draft },
		{ key: "freeAgencyTalks", label: "Free Agency Talks", ts: m.freeAgencyTalks },
		{ key: "freeAgencySign", label: "Free Agency Signings", ts: m.freeAgencySign },
		{ key: "summerLeague", label: "Summer League", ts: m.summerLeague },
	];
	return entries.map((e) => ({
		key: e.key,
		label: e.label,
		date: new Date(e.ts),
		day: Math.round((e.ts - start) / DAY_MS),
	}));
};

export const collegePhaseForDate = (
	startYear: number,
	date: Date,
): CollegePhase => {
	const t = date.getTime();
	const m = collegeMilestones(startYear);

	if (t < m.collegeOpener) {
		return "preseason";
	}
	if (t <= m.regularSeasonEnd) {
		return "regular";
	}
	if (t < m.selectionSunday) {
		return "confTournaments";
	}
	if (t < m.firstFour) {
		return "selectionSunday";
	}
	if (t < m.round64) {
		return "firstFour";
	}
	if (t < m.round32) {
		return "round64";
	}
	if (t < m.sweet16) {
		return "round32";
	}
	if (t < m.elite8) {
		return "sweet16";
	}
	if (t < m.finalFour) {
		return "elite8";
	}
	if (t < m.championship) {
		return "finalFour";
	}
	if (t === m.championship || t < m.championship + DAY_MS) {
		return "championship";
	}
	if (t < utc(startYear + 1, 5, 1)) {
		return "postTournament";
	}
	return "offseason";
};

export const COLLEGE_REGULAR_SEASON_GAMES = 31;

/**
 * Expected college games played by a date — linear pace from opener to the
 * end of the regular season (~18 weeks, ~1.7 games/week).
 */
export const expectedCollegeGames = (startYear: number, date: Date): number => {
	const m = collegeMilestones(startYear);
	const t = date.getTime();
	if (t < m.collegeOpener) {
		return 0;
	}
	if (t >= m.regularSeasonEnd) {
		return COLLEGE_REGULAR_SEASON_GAMES;
	}
	const frac = (t - m.collegeOpener) / (m.regularSeasonEnd - m.collegeOpener);
	return Math.floor(frac * COLLEGE_REGULAR_SEASON_GAMES);
};
