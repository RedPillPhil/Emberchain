import type { PlayerRatings } from "../../../common/types.basketball.ts";
import { classicOvrToTwoK } from "../../../common/twoKScale.ts";

/**
 * Calculates the overall rating by averaging together all the other ratings,
 * then remaps onto an NBA 2K-style 40–99 scale (elites land in the mid/high 90s).
 *
 * @memberOf core.player
 * @param {Object.<string, number>} ratings Player's ratings object.
 * @return {number} Overall rating (2K-style).
 */
const ovr = (ratings: PlayerRatings): number => {
	// See analysis/player-ovr-basketball — classic linear blend (~0–100)
	const r =
		0.159 * (ratings.hgt - 47.5) +
		0.0777 * (ratings.stre - 50.2) +
		0.123 * (ratings.spd - 50.8) +
		0.051 * (ratings.jmp - 48.7) +
		0.0632 * (ratings.endu - 39.9) +
		0.0126 * (ratings.ins - 42.4) +
		0.0286 * (ratings.dnk - 49.5) +
		0.0202 * (ratings.ft - 47.0) +
		0.0726 * (ratings.tp - 47.1) +
		0.133 * (ratings.oiq - 46.8) +
		0.159 * (ratings.diq - 46.7) +
		0.059 * (ratings.drb - 54.8) +
		0.062 * (ratings.pss - 51.3) +
		0.01 * (ratings.fg - 47.0) +
		0.01 * (ratings.reb - 51.4) +
		48.5;

	// Legacy fudge (pre-2K remap) keeps relative ordering of the classic scale
	let fudgeFactor = 0;
	if (r >= 68) {
		fudgeFactor = 8;
	} else if (r >= 50) {
		fudgeFactor = 4 + (r - 50) * (4 / 18);
	} else if (r >= 42) {
		fudgeFactor = -5 + (r - 42) * (9 / 8);
	} else if (r >= 31) {
		fudgeFactor = -5 - (42 - r) * (5 / 11);
	} else {
		fudgeFactor = -10;
	}

	const classic = Math.round(r + fudgeFactor);
	return classicOvrToTwoK(classic);
};

export default ovr;
