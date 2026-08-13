/**
 * Personality + short bio generation for any player/prospect.
 * Deterministic from pid so it never flickers across reloads.
 */

export type Personality = {
	loyalty: number;
	workEthic: number;
	ambition: number;
	competitiveness: number;
	leadership: number;
	ego: number;
	teamFirst: number;
	archetype: string;
};

const clamp = (n: number) => Math.max(25, Math.min(99, Math.round(n)));

const seeded = (pid: number, salt: number) => {
	let h = (pid * 2654435761 + salt * 97411) >>> 0;
	h ^= h >> 13;
	h = (h * 1274126177) >>> 0;
	return (h % 1000) / 1000;
};

const roll = (pid: number, salt: number) =>
	clamp(40 + seeded(pid, salt) * 55);

export const genPersonality = (pid: number): Personality => {
	const loyalty = roll(pid, 1);
	const workEthic = roll(pid, 2);
	const ambition = roll(pid, 3);
	const competitiveness = roll(pid, 4);
	const leadership = roll(pid, 5);
	const ego = roll(pid, 6);
	const teamFirst = clamp(100 - ego * 0.55 + (loyalty - 50) * 0.2);

	let archetype = "Competitor";
	if (loyalty > 80 && teamFirst > 75) {
		archetype = "Franchise Pillar";
	} else if (ambition > 82 && ego > 70) {
		archetype = "Alpha Star";
	} else if (workEthic > 85 && competitiveness > 75) {
		archetype = "Gym Rat";
	} else if (leadership > 80 && teamFirst > 70) {
		archetype = "Floor General";
	} else if (ego > 85) {
		archetype = "Me-First Talent";
	} else if (loyalty < 45 && ambition > 70) {
		archetype = "Mercenary";
	} else if (workEthic < 45) {
		archetype = "Gifted Coasting";
	}

	return {
		loyalty,
		workEthic,
		ambition,
		competitiveness,
		leadership,
		ego,
		teamFirst,
		archetype,
	};
};

const FACTS = [
	"collects vintage sneakers and owns over 200 pairs",
	"taught himself piano during the pandemic lockdown",
	"is fluent in three languages",
	"grew up playing soccer before switching to basketball at 13",
	"has a black belt in taekwondo",
	"volunteers at a local youth basketball camp every summer",
	"once scored 62 points in a high school state tournament game",
	"is a serious chess player and streams online blitz games",
	"comes from a family of five siblings who all played college sports",
	"has a fear of flying and listens to audiobooks on every road trip",
	"spent a summer working construction with his uncle",
	"is known for film-room sessions that run past midnight",
	"keeps a handwritten journal of every game he plays",
	"modeled his footwork after watching tape of Tim Duncan",
	"once went viral for a mid-game alley-oop dunk in AAU",
];

export type BioInput = {
	pid: number;
	name: string;
	pos: string;
	age?: number;
	height?: number;
	hometown?: string;
	college?: string;
	year?: string;
	ovr?: number;
	awards?: string[];
	kind?: "pro" | "college" | "hs" | "intl";
	league?: string;
};

export const genBio = (input: BioInput): string => {
	const p = genPersonality(input.pid);
	const fact = FACTS[Math.floor(seeded(input.pid, 99) * FACTS.length)]!;
	const height =
		input.height != null
			? `${Math.floor(input.height / 12)}'${input.height % 12}"`
			: undefined;

	const bits: string[] = [];

	if (input.kind === "hs") {
		bits.push(
			`${input.name} is a ${input.pos}${height ? ` (${height})` : ""} prospect out of ${input.hometown ?? "the United States"}.`,
		);
	} else if (input.kind === "college") {
		bits.push(
			`${input.name} is a ${input.year ?? ""} ${input.pos} for ${input.college ?? "his school"}${height ? `, listed at ${height}` : ""}.`,
		);
	} else if (input.kind === "intl") {
		bits.push(
			`${input.name} is an international ${input.pos} currently playing in the ${input.league ?? "European ranks"}, born in ${input.hometown ?? "abroad"}.`,
		);
	} else {
		bits.push(
			`${input.name} is a ${input.age != null ? `${input.age}-year-old ` : ""}${input.pos}${height ? ` (${height})` : ""}${input.college ? ` out of ${input.college}` : ""}.`,
		);
	}

	bits.push(
		`Scouts describe him as a ${p.archetype.toLowerCase()} — loyalty ${p.loyalty}, work ethic ${p.workEthic}, ambition ${p.ambition}.`,
	);

	if (input.awards && input.awards.length > 0) {
		bits.push(`Accolades include ${input.awards.slice(0, 3).join(", ")}.`);
	}

	bits.push(`Off the court, he ${fact}.`);

	return bits.join(" ");
};
