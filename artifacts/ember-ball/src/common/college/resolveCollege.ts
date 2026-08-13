import { COLLEGE_TEAMS } from "./d1Data.ts";
import type { CollegeTeam } from "./types.ts";

/**
 * Resolve a college school string / abbrev to a D1 team.
 * Exact matches only — never substring includes (e.g. "Kansas" must not
 * hit "Arkansas" / "Central Arkansas").
 */
export const resolveCollegeTeam = (
	school: string | undefined | null,
): CollegeTeam | undefined => {
	if (!school) {
		return undefined;
	}
	let q = school.trim().toLowerCase().replace(/\s+/g, " ");
	if (!q) {
		return undefined;
	}
	// Normalize common BBGM / news forms
	q = q
		.replace(/^university of /, "")
		.replace(/ university$/, "")
		.replace(/ college$/, "")
		.replace(/\bst\./g, "st")
		.trim();

	const full = (t: CollegeTeam) => `${t.region} ${t.name}`.toLowerCase();

	// 1) Exact "Region Name"
	let hit = COLLEGE_TEAMS.find((t) => full(t) === q);
	if (hit) {
		return hit;
	}

	// 2) Exact region (e.g. "Kansas", "North Carolina") — NOT substring
	hit = COLLEGE_TEAMS.find((t) => t.region.toLowerCase() === q);
	if (hit) {
		return hit;
	}

	// 3) Exact abbrev
	hit = COLLEGE_TEAMS.find((t) => t.abbrev.toLowerCase() === q);
	if (hit) {
		return hit;
	}

	// 4) Exact nickname only when unique among D1 (e.g. "Jayhawks")
	const nickHits = COLLEGE_TEAMS.filter((t) => t.name.toLowerCase() === q);
	if (nickHits.length === 1) {
		return nickHits[0];
	}

	return undefined;
};

export const collegeDisplayName = (t: CollegeTeam) => `${t.region} ${t.name}`;
