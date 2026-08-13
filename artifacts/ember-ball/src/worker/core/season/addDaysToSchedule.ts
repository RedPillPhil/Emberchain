import type { Game, ScheduleGameWithoutKey } from "../../../common/types.ts";
import { isSport } from "../../../common/sportFunctions.ts";
import { g } from "../../util/index.ts";

/**
 * Assign day numbers to schedule matchups.
 *
 * For basketball (NBA-length seasons), pace like the real NBA: roughly 5–10
 * games league-wide per night across ~170 calendar days (Opening Night through
 * mid-April), so teams get real rest — B2Bs, 1-day offs, and multi-day breaks —
 * instead of packing every available slot into ~80 consecutive days.
 */
const addDaysToSchedule = (
	games: {
		homeTid: number;
		awayTid: number;
	}[],
	existingGames?: Game[],
): ScheduleGameWithoutKey[] => {
	const dayTids = new Set<number>();
	let prevDayAllStarGame = false;
	let prevDayTradeDeadline = false;

	let day = 1;

	// If there are other games already played this season, start after that day
	if (existingGames) {
		const season = g.get("season");
		for (const game of existingGames) {
			if (
				game.season === season &&
				typeof game.day === "number" &&
				game.day >= day
			) {
				day = game.day + 1;
			}
		}
	}

	const numGames = g.get("numGames");
	const nbaPace =
		isSport("basketball") &&
		typeof numGames === "number" &&
		numGames >= 70 &&
		games.length >= 400;

	// Oct 20 (day 1) → Apr 11 (day ~173). Spread remaining games across the
	// remaining calendar so the season always ends mid-April, whether this is a
	// fresh schedule or a mid-season re-pace.
	const TARGET_SEASON_DAYS = 173;
	const remainingDays = Math.max(30, TARGET_SEASON_DAYS - day + 1);
	const maxGamesPerDay = nbaPace
		? Math.max(5, Math.ceil(games.length / remainingDays))
		: Number.POSITIVE_INFINITY;

	let gamesToday = 0;

	return games.map((game) => {
		const { awayTid, homeTid } = game;

		const allStarGame = awayTid === -2 && homeTid === -1;
		const tradeDeadline = awayTid === -3 && homeTid === -3;
		if (
			dayTids.has(homeTid) ||
			dayTids.has(awayTid) ||
			allStarGame ||
			prevDayAllStarGame ||
			tradeDeadline ||
			prevDayTradeDeadline ||
			gamesToday >= maxGamesPerDay
		) {
			day += 1;
			dayTids.clear();
			gamesToday = 0;
		}

		dayTids.add(homeTid);
		dayTids.add(awayTid);
		gamesToday += 1;

		prevDayAllStarGame = allStarGame;
		prevDayTradeDeadline = tradeDeadline;

		return {
			...game,
			day,
		};
	});
};

export default addDaysToSchedule;
