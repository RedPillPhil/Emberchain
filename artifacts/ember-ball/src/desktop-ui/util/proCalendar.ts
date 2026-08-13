/**
 * Pro calendar helpers for Court Desk (NBA-style 2026–27 dates).
 * Day 0 / schedule day 1 = Opening Night (Oct 20 of season start year).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const MONTHS_SHORT = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
];

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

const utc = (year: number, month: number, dayOfMonth: number) =>
	Date.UTC(year, month, dayOfMonth);

export const proSeasonStart = (year: number) => new Date(utc(year, 9, 20));

export const dayToDate = (startYear: number, day: number): Date =>
	new Date(proSeasonStart(startYear).getTime() + day * DAY_MS);

export const formatDate = (d: Date): string =>
	`${WEEKDAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;

export const formatShortDate = (d: Date): string =>
	`${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}`;

/** Schedule day 1 = Opening Night */
export const scheduleDayLabel = (season: number, day: number | undefined) => {
	if (day == null || !Number.isFinite(day)) {
		return "—";
	}
	return formatShortDate(dayToDate(season, Math.max(0, day - 1)));
};

export type ProMilestone = {
	key: string;
	label: string;
	date: Date;
	day: number;
};

export const proMilestoneList = (startYear: number): ProMilestone[] => {
	const y2 = startYear + 1;
	const start = proSeasonStart(startYear).getTime();
	const entries: { key: string; label: string; ts: number }[] = [
		{ key: "trainingCamp", label: "Training Camp", ts: utc(startYear, 8, 28) },
		{ key: "preseason", label: "Preseason", ts: utc(startYear, 9, 5) },
		{ key: "openingNight", label: "Opening Night", ts: utc(startYear, 9, 20) },
		{ key: "gLeagueTip", label: "G League Tip-Off", ts: utc(startYear, 10, 8) },
		{ key: "christmas", label: "Christmas Day", ts: utc(startYear, 11, 25) },
		{ key: "tradeDeadline", label: "Trade Deadline", ts: utc(y2, 1, 11) },
		{ key: "allStarGame", label: "All-Star Game", ts: utc(y2, 1, 21) },
		{
			key: "regularSeasonEnd",
			label: "Regular Season Ends",
			ts: utc(y2, 3, 11),
		},
		{ key: "playIn", label: "Play-In Tournament", ts: utc(y2, 3, 13) },
		{ key: "playoffs", label: "Playoffs Begin", ts: utc(y2, 3, 17) },
		{ key: "draftLottery", label: "Draft Lottery", ts: utc(y2, 4, 11) },
		{ key: "finals", label: "NBA Finals", ts: utc(y2, 5, 3) },
		{
			key: "preDraftWorkouts",
			label: "Pre-Draft Workouts & Combine",
			ts: utc(y2, 5, 10),
		},
		{ key: "draft", label: "NBA Draft", ts: utc(y2, 5, 24) },
		{
			key: "freeAgencyTalks",
			label: "Free Agency Talks",
			ts: utc(y2, 5, 30),
		},
		{
			key: "freeAgencySign",
			label: "Free Agency Signings",
			ts: utc(y2, 6, 6),
		},
		{ key: "summerLeague", label: "Summer League", ts: utc(y2, 6, 9) },
	];
	return entries.map((e) => ({
		key: e.key,
		label: e.label,
		date: new Date(e.ts),
		day: Math.round((e.ts - start) / DAY_MS),
	}));
};
