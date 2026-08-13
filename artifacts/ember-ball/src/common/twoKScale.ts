/**
 * Map classic BBGM overall (~30–85 typical, 100 max) onto an NBA 2K-like
 * display/engine overall band, with a heavily compressed top end:
 *
 *   ~75–82  solid starter
 *   ~85–90  All-Star
 *   ~91–94  MVP candidate
 *   ~95–96  best player of his era
 *   97–99   all-time legend (Jordan / prime LeBron tier) — extremely rare
 *
 * Attribute ratings (spd, shooting, etc.) stay on the classic 0–100 scale used
 * by GameSim composites; only overall/potential are remapped.
 */
export const classicOvrToTwoK = (classic: number): number => {
	const v = Math.max(0, Math.min(100, classic));
	let mapped: number;
	if (v <= 31) {
		mapped = 50 + (v / 31) * 10; // 50–60 deep bench / fringe
	} else if (v <= 47) {
		mapped = 60 + ((v - 31) / 16) * 10; // 60–70 bench
	} else if (v <= 60) {
		mapped = 70 + ((v - 47) / 13) * 8; // 70–78 rotation/starter
	} else if (v <= 70) {
		mapped = 78 + ((v - 60) / 10) * 8; // 78–86 quality starter / fringe All-Star
	} else if (v <= 78) {
		mapped = 86 + ((v - 70) / 8) * 6; // 86–92 All-Star / All-NBA
	} else if (v <= 85) {
		mapped = 92 + ((v - 78) / 7) * 4; // 92–96 MVP tier
	} else {
		// Classic 85+ almost never happens; 97–99 reserved for all-timers
		mapped = 96 + ((v - 85) / 15) * 3;
	}
	return Math.max(40, Math.min(99, Math.round(mapped)));
};
