/**
 * Algorithmic + seeded sports-media headlines for Ember Ball.
 * Parody desk voices generate copy from player ratings / traits.
 */

export type DeskVoice =
	| "stephen_a"
	| "skip"
	| "woj"
	| "shams"
	| "local_beat"
	| "insider";

export type HeadlineStory = {
	id: string;
	headline: string;
	blurb: string;
	voice: DeskVoice;
	byline: string;
	tag: string;
	priority: number;
};

const VOICE_BYLINES: Record<DeskVoice, string> = {
	stephen_a: "Stephen Ember Smith — First Take Desk",
	skip: "Skip Flay — Undisputed Hardwood",
	woj: "Adrian Wojember — League Insider",
	shams: "Shams Emberani — Front Office Wire",
	local_beat: "Ember Ball Beat Writer",
	insider: "League Insider Desk",
};

type PlayerSnapshot = {
	name: string;
	pos?: string;
	age?: number;
	ovr?: number;
	pot?: number;
	team?: string;
	traits?: string[];
};

const pick = <T,>(arr: T[], i: number) => arr[i % arr.length]!;

export const bylineFor = (voice: DeskVoice) => VOICE_BYLINES[voice];

/** Seed headlines for the official Ember Ball League launch */
export const OFFICIAL_LAUNCH_HEADLINES: HeadlineStory[] = [
	{
		id: "launch-1",
		headline:
			"OFFICIAL: Ember Ball League tip-off — 30 NFT franchises, one hardwood crown",
		blurb:
			"The flagship crypto league is live with fictional rosters. Ownership on-chain, drama off the charts.",
		voice: "woj",
		byline: VOICE_BYLINES.woj,
		tag: "League",
		priority: 100,
	},
	{
		id: "launch-2",
		headline:
			"STEPHEN A: That rookie outta nowhere? He's about to COOK this league, my man!",
		blurb:
			"Sources say a top prospect is already demanding minutes — and the film backs up the swagger.",
		voice: "stephen_a",
		byline: VOICE_BYLINES.stephen_a,
		tag: "Hot Take",
		priority: 95,
	},
	{
		id: "launch-3",
		headline:
			"Trade winds: All-star guard 'unhappy' with direction, wants out before tip",
		blurb:
			"Front offices are buzzing. A star is quietly shopping for a better supporting cast.",
		voice: "shams",
		byline: VOICE_BYLINES.shams,
		tag: "Trade Rumors",
		priority: 90,
	},
	{
		id: "launch-4",
		headline:
			"SKIP: You can't build a dynasty on vibes! That big man ain't a #1 option!",
		blurb:
			"Classic Skip heat — questioning whether a franchise center can carry a title push.",
		voice: "skip",
		byline: VOICE_BYLINES.skip,
		tag: "Debate",
		priority: 85,
	},
	{
		id: "launch-5",
		headline:
			"Breakout watch: Second-year wing averaging practice-court buckets, coaches rave",
		blurb:
			"Coaching staffs are whispering about a leap. Efficiency + defensive versatility.",
		voice: "local_beat",
		byline: VOICE_BYLINES.local_beat,
		tag: "Prospects",
		priority: 80,
	},
	{
		id: "launch-6",
		headline:
			"INSIDER: Veteran PG seeking extension talk — or else free agency fireworks",
		blurb:
			"Contract year energy. The floor general wants to get paid before the market opens.",
		voice: "insider",
		byline: VOICE_BYLINES.insider,
		tag: "Business",
		priority: 75,
	},
	{
		id: "launch-7",
		headline:
			"Ember Ball Cup format set: Midseason tournament with GMbucks on the line",
		blurb:
			"Commissioner's office locks in the midseason trophy — pride, brackets, and prize pool juice.",
		voice: "woj",
		byline: VOICE_BYLINES.woj,
		tag: "League",
		priority: 70,
	},
	{
		id: "launch-8",
		headline:
			"STEPHEN A: Don't sleep on that defensive stopper — he changes SERIES!",
		blurb:
			"Perimeter defense and chaos creation. Film rats already clipping the highlights.",
		voice: "stephen_a",
		byline: VOICE_BYLINES.stephen_a,
		tag: "Hot Take",
		priority: 65,
	},
];

/**
 * Generate a headline from a player snapshot.
 * Pure / deterministic enough to run client or worker without LLM.
 */
export const generatePlayerHeadline = (
	player: PlayerSnapshot,
	seasonSeed: number,
): HeadlineStory => {
	const ovr = player.ovr ?? 50;
	const pot = player.pot ?? ovr;
	const age = player.age ?? 24;
	const name = player.name;
	const team = player.team ?? "his club";
	const hash =
		(name.length * 17 + ovr * 3 + pot * 5 + age * 7 + seasonSeed) % 97;

	if (ovr >= 85 && age <= 26) {
		return {
			id: `gen-${hash}`,
			headline: pick(
				[
					`STEPHEN A: ${name} is HIM — put some RESPECT on that name!`,
					`BREAKING: ${name} entering MVP chatter after another torch job`,
					`${name} putting the league on notice — superstar ascent continues`,
				],
				hash,
			),
			blurb: `${name} (${ovr} OVR) is cooking for ${team}. The eye test and the numbers agree.`,
			voice: "stephen_a",
			byline: VOICE_BYLINES.stephen_a,
			tag: "Stars",
			priority: 90,
		};
	}

	if (pot - ovr >= 10 && age <= 22) {
		return {
			id: `gen-${hash}`,
			headline: pick(
				[
					`Rookie report: ${name} primed for a leap — scouts buzzing`,
					`Don't sleep: ${name} has star upside written all over the film`,
					`Development watch: ${name} closing the gap on his ceiling fast`,
				],
				hash,
			),
			blurb: `Potential ${pot} with room to grow. ${team} may have struck gold.`,
			voice: "local_beat",
			byline: VOICE_BYLINES.local_beat,
			tag: "Prospects",
			priority: 80,
		};
	}

	if (ovr >= 78 && age >= 30) {
		return {
			id: `gen-${hash}`,
			headline: pick(
				[
					`INSIDER: ${name} open to a move if ${team} pivots to youth`,
					`Trade chatter: Contenders calling about ${name}`,
					`${name} still elite — but the clock is ticking on a title window`,
				],
				hash,
			),
			blurb: `A ${age}-year-old ${ovr} OVR piece. Front offices are weighing win-now vs. future.`,
			voice: "shams",
			byline: VOICE_BYLINES.shams,
			tag: "Trade Rumors",
			priority: 85,
		};
	}

	if (player.traits?.some((t) => /moody|selfish|controversial/i.test(t))) {
		return {
			id: `gen-${hash}`,
			headline: `SKIP: ${name}'s attitude will COST that franchise a banner!`,
			blurb: `Locker-room noise around ${name} has the debate shows locked and loaded.`,
			voice: "skip",
			byline: VOICE_BYLINES.skip,
			tag: "Debate",
			priority: 70,
		};
	}

	return {
		id: `gen-${hash}`,
		headline: pick(
			[
				`${name} grinding — coaches praise two-way commitment`,
				`Film room: Why ${name} is quietly impacting winning for ${team}`,
				`${team}'s ${name} earning trust as the schedule toughens`,
			],
			hash,
		),
		blurb: `Solid contributor energy. Stay tuned as the season narrative writes itself.`,
		voice: "insider",
		byline: VOICE_BYLINES.insider,
		tag: "Notes",
		priority: 50,
	};
};

export const generateHeadlinesFromPlayers = (
	players: PlayerSnapshot[],
	season: number,
	limit = 12,
): HeadlineStory[] => {
	const sorted = [...players].sort(
		(a, b) => (b.ovr ?? 0) - (a.ovr ?? 0) || (b.pot ?? 0) - (a.pot ?? 0),
	);
	const stories = sorted
		.slice(0, Math.max(limit, 8))
		.map((p, i) => generatePlayerHeadline(p, season + i * 13));
	return [...OFFICIAL_LAUNCH_HEADLINES, ...stories]
		.sort((a, b) => b.priority - a.priority)
		.slice(0, limit);
};
