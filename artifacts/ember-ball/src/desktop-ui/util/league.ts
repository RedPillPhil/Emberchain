import { helpers } from "../../common/helpers.ts";
import { applyDesktopNicknames } from "../../common/desktopTeamNames.ts";
import { toWorker } from "./toWorker.ts";
import { useDesktopStore } from "../store.ts";
import { absorbGameKnowledge, grantSimScoutingPoints } from "./scouting.ts";

export type PhaseKind =
	| "preseason"
	| "regular"
	| "playoffs"
	| "draftLottery"
	| "draft"
	| "afterDraft"
	| "resign"
	| "freeAgency"
	| "other";

export const phaseKindFromText = (phaseText: string | undefined): PhaseKind => {
	const t = (phaseText ?? "").toLowerCase();
	if (t.includes("preseason")) {
		return "preseason";
	}
	if (t.includes("playoff")) {
		return "playoffs";
	}
	if (t.includes("draft lottery") || t.includes("lottery")) {
		return "draftLottery";
	}
	if (t.includes("after draft")) {
		return "afterDraft";
	}
	if (t.includes("re-sign") || t.includes("resign")) {
		return "resign";
	}
	if (t.includes("free agency")) {
		return "freeAgency";
	}
	if (t.includes("draft") && !t.includes("lottery")) {
		return "draft";
	}
	if (t.includes("regular") || t.includes("trade deadline")) {
		return "regular";
	}
	return "other";
};

const getPhaseKind = async (): Promise<PhaseKind> => {
	const store = useDesktopStore.getState();
	const phaseText =
		(await toWorker("main", "getLocal", "phaseText").catch(() => undefined)) ??
		store.local.phaseText;
	return phaseKindFromText(
		typeof phaseText === "string" ? phaseText : undefined,
	);
};

export const initWorkerEnv = async () => {
	let heartbeatID = sessionStorage.getItem("heartbeatID");
	if (!heartbeatID) {
		heartbeatID = Math.random().toString(16).slice(2);
		sessionStorage.setItem("heartbeatID", heartbeatID);
	}

	await toWorker("main", "init", {
		bbgmVersion: window.bbgmVersion,
		enableLogging: false,
		heartbeatID,
		mobile: false,
		useSharedWorker: window.useSharedWorker,
	});
};

export const loadLeagueList = async () => {
	return toWorker("main", "getLeagues", undefined);
};

export const runBeforeView = async (
	viewId: string,
	params: Record<string, unknown> = {},
) => {
	return toWorker("main", "runBefore", {
		viewId,
		params,
		ctxBBGM: {},
		updateEvents: ["firstRun", "gameSim", "playerMovement", "newPhase"],
		prevData: {},
	});
};

export const refreshLeagueChrome = async () => {
	const store = useDesktopStore.getState();
	const [dash, phaseText, leagues, college] = await Promise.all([
		runBeforeView("leagueDashboard").catch(() => undefined),
		toWorker("main", "getLocal", "phaseText").catch(() => undefined),
		loadLeagueList() as Promise<any[]>,
		toWorker("main", "getCollegeUniverse", undefined).catch(() => undefined),
	]);
	const meta = leagues.find((l) => l.lid === store.lid);

	store.patchLocal({
		season: (dash as any)?.season ?? meta?.season ?? store.local.season,
		phaseText:
			(typeof phaseText === "string" && phaseText) ||
			meta?.phaseText ||
			store.local.phaseText,
		userTid: meta?.tid ?? store.local.userTid,
		leagueName: meta?.name ?? store.local.leagueName ?? "Pro Basketball League",
		teamInfo: {
			region:
				(dash as any)?.region ?? meta?.teamRegion ?? store.local.teamInfo?.region,
			name: (dash as any)?.name ?? meta?.teamName ?? store.local.teamInfo?.name,
		},
		dateString: (college as any)?.dateString ?? store.local.dateString,
		collegePhase: (college as any)?.phase ?? store.local.collegePhase,
	});
};

export const openLeague = async (lid: number) => {
	const store = useDesktopStore.getState();
	store.setStatus("Loading league...");
	store.setError(undefined);

	await toWorker("main", "beforeView", {
		inLeague: true,
		lidCurrent: undefined,
		lidUrl: lid,
	});

	// Re-pace any old dense schedule onto the full NBA calendar (idempotent)
	await toWorker("main", "fixScheduleDays", undefined).catch(() => undefined);

	store.setLid(lid);
	store.loadScoutingForLeague(lid);

	const { DESKTOP_LOTTERY_CHANCES, loadLeagueMeta } = await import(
		"./leagueMeta.ts"
	);
	const metaExtras = loadLeagueMeta(lid);
	store.patchLocal({
		leagueAbbrev: metaExtras.abbrev,
		commissioner: metaExtras.commissioner,
	});

	// Existing saves may still use nba2027 (near-flat odds). Force classic weights.
	await toWorker("main", "updateGameAttributes", {
		draftType: "custom",
		draftLotteryCustomNumPicks: 4,
		draftLotteryCustomChances: DESKTOP_LOTTERY_CHANCES,
	}).catch(() => undefined);

	await refreshLeagueChrome();
	store.setView("dashboard");
	store.bumpRevision();
	store.setStatus("League loaded");
};

export const createDefaultLeague = async (
	name: string,
	tid: number,
	extras?: { abbrev?: string; commissioner?: string },
) => {
	const store = useDesktopStore.getState();
	store.setStatus("Creating NBA-style league...");
	store.setError(undefined);

	const lid = await toWorker("main", "createDesktopLeague", {
		name,
		tid,
		startingSeason: String(new Date().getFullYear()),
	});

	const { saveLeagueMeta } = await import("./leagueMeta.ts");
	saveLeagueMeta(lid, {
		abbrev: extras?.abbrev?.trim() || "PBL",
		commissioner: extras?.commissioner?.trim() || "Adam Silver",
	});

	await openLeague(lid);
	return lid;
};

export const getDefaultTeams = () =>
	applyDesktopNicknames(helpers.addPopRank(helpers.getTeamsDefault()));

const afterSim = async (days: number) => {
	const store = useDesktopStore.getState();
	if (store.lid != null) {
		store.setScouting(grantSimScoutingPoints(store.lid, store.scouting, days));
	}
	await refreshLeagueChrome();

	// Playing against a team teaches you about their players ("game film")
	if (days > 0) {
		try {
			const store2 = useDesktopStore.getState();
			if (store2.lid != null) {
				const data: any = await runBeforeView("schedule", {});
				const { state, notes } = absorbGameKnowledge(
					store2.lid,
					store2.scouting,
					data?.completed ?? [],
					store2.local.userTid,
				);
				store2.setScouting(state);
				if (notes.length > 0) {
					const shown = notes.slice(0, 3).join(", ");
					const extra = notes.length > 3 ? ` +${notes.length - 3} more` : "";
					store2.pushToast({
						text: `Game film: your staff picked up intel on ${shown}${extra}`,
						type: "info",
					});
				}
			}
		} catch (error) {
			console.error(error);
		}
	}

	store.bumpRevision();
};

/**
 * Live-sim the user's next game if it's on today's slate; otherwise sim the
 * day (rest days happen — it's an NBA calendar). Returns true if a live game
 * started (the play-by-play arrives via the realtimeUpdate bridge).
 */
export const playLiveGame = async (): Promise<boolean> => {
	const store = useDesktopStore.getState();
	if (store.readOnly) {
		store.pushToast({
			text: "Browse-only Ember League — sim is locked until season unlock.",
			type: "error",
		});
		return false;
	}
	const phase = await getPhaseKind();

	if (phase === "preseason") {
		await toWorker("playMenu", "untilRegularSeason", undefined);
		await toWorker("main", "fixScheduleDays", undefined).catch(
			() => undefined,
		);
		await afterSim(0);
		store.setStatus("Regular season started — hit Play for tip-off");
		return false;
	}

	if (phase !== "regular" && phase !== "playoffs") {
		await advanceDay();
		return false;
	}

	try {
		const data: any = await runBeforeView("schedule", {});
		const first = data?.upcoming?.[0];
		if (first?.gid != null && data?.canLiveSimFirstGame) {
			store.setStatus("Tip-off — live play-by-play");
			await toWorker("actions", "liveGame", first.gid);
			// Scouting/refresh happen when the user finishes the game
			return true;
		}
	} catch (error) {
		console.error(error);
	}

	// No user game today — just sim the day
	await advanceDay();
	return false;
};

export type SimTarget =
	| "day"
	| "twoDays"
	| "week"
	| "month"
	| "untilAllStarGame"
	| "untilTradeDeadline"
	| "untilPlayoffs"
	| "throughPlayoffs";

export const SIM_TARGETS: {
	id: SimTarget;
	label: string;
	phases: ("regular" | "playoffs")[];
}[] = [
	{ id: "day", label: "1 Day", phases: ["regular", "playoffs"] },
	{ id: "twoDays", label: "2 Days", phases: ["regular", "playoffs"] },
	{ id: "week", label: "1 Week", phases: ["regular", "playoffs"] },
	{ id: "month", label: "1 Month", phases: ["regular"] },
	{ id: "untilAllStarGame", label: "Until All-Star Break", phases: ["regular"] },
	{
		id: "untilTradeDeadline",
		label: "Until Trade Deadline (Feb 11)",
		phases: ["regular"],
	},
	{ id: "untilPlayoffs", label: "Until Playoffs", phases: ["regular"] },
	{ id: "throughPlayoffs", label: "Through Playoffs", phases: ["playoffs"] },
];

/** Sim a named span of the season (regular season / playoffs only). */
export const simTarget = async (target: SimTarget) => {
	const store = useDesktopStore.getState();
	if (store.readOnly) {
		store.pushToast({
			text: "Browse-only Ember League — sim is locked until season unlock.",
			type: "error",
		});
		return;
	}
	store.setStatus("Simulating...");
	store.setError(undefined);
	try {
		const phase = await getPhaseKind();

		if (phase === "preseason") {
			await toWorker("playMenu", "untilRegularSeason", undefined);
			await toWorker("main", "fixScheduleDays", undefined).catch(
				() => undefined,
			);
			await afterSim(0);
			store.setStatus("Regular season started");
			return;
		}

		if (phase !== "regular" && phase !== "playoffs") {
			await advanceDay();
			return;
		}

		const days: Record<SimTarget, number> = {
			day: 1,
			twoDays: 2,
			week: 7,
			month: 30,
			untilAllStarGame: 30,
			untilTradeDeadline: 60,
			untilPlayoffs: 120,
			throughPlayoffs: 40,
		};

		if (target === "twoDays") {
			await toWorker("playMenu", "day", undefined);
			await toWorker("playMenu", "day", undefined);
		} else {
			await toWorker("playMenu", target === "day" ? "day" : target, undefined);
		}

		await afterSim(days[target]);
		store.setStatus("Sim complete");
	} catch (error) {
		store.setError(error instanceof Error ? error.message : String(error));
		store.setStatus("Sim error");
	}
};

/** The next offseason event for the Play button ladder. */
export const nextOffseasonEvent = (
	phase: PhaseKind,
):
	| {
			label: string;
			action: () => Promise<void>;
			secondary?: { label: string; action: () => Promise<void> };
	  }
	| undefined => {
	const advance = async (
		fn: () => Promise<unknown>,
		status: string,
		days = 0,
	) => {
		const store = useDesktopStore.getState();
		store.setStatus("Advancing...");
		store.setError(undefined);
		try {
			await fn();
			await afterSim(days);
			store.setStatus(status);
		} catch (error) {
			store.setError(error instanceof Error ? error.message : String(error));
			store.setStatus("Error");
		}
	};

	switch (phase) {
		case "draftLottery":
			return {
				label: "Draft Lottery",
				action: async () => {
					useDesktopStore.getState().setView("draftLottery");
				},
			};
		case "draft":
			return {
				label: "Enter Draft Room",
				action: async () => {
					useDesktopStore.getState().setView("draftRoom");
				},
			};
		case "afterDraft":
			return {
				label: "Proceed to Re-Signings",
				action: () =>
					advance(
						() => toWorker("playMenu", "untilResignPlayers", undefined),
						"Re-signing period open",
					),
			};
		case "resign":
			return {
				label: "Review Re-Signings",
				action: async () => {
					useDesktopStore.getState().setView("resign");
				},
				secondary: {
					label: "Open Free Agency (Jun 30)",
					action: () =>
						advance(
							() => toWorker("playMenu", "untilFreeAgency", undefined),
							"Free agency open — signings begin",
						),
				},
			};
		case "freeAgency":
			return {
				label: "Sim Free Agency Day",
				action: () =>
					advance(
						() => toWorker("playMenu", "day", undefined),
						"Free agency day complete",
						1,
					),
				secondary: {
					label: "Enter Training Camp",
					action: async () => {
						useDesktopStore.getState().setView("trainingCamp");
					},
				},
			};
		case "preseason":
			return {
				label: "Player Progression / Opening Night",
				action: async () => {
					const store = useDesktopStore.getState();
					if (store.progressionResults?.length) {
						store.setView("progression");
						return;
					}
					// Preseason without running camp — open camp so they can progress
					store.setView("trainingCamp");
				},
				secondary: {
					label: "Opening Night (Oct 20)",
					action: () =>
						advance(async () => {
							await toWorker("playMenu", "untilRegularSeason", undefined);
							await toWorker("main", "fixScheduleDays", undefined).catch(
								() => undefined,
							);
						}, "Opening Night — hit Play for tip-off"),
				},
			};
		default:
			return undefined;
	}
};

/**
 * Advance the league one logical step based on the current phase.
 * Never jump from preseason (empty schedule) into the playoffs.
 */
export const advanceDay = async () => {
	const store = useDesktopStore.getState();
	store.setStatus("Advancing...");
	store.setError(undefined);
	try {
		const phase = await getPhaseKind();

		if (phase === "preseason") {
			await toWorker("playMenu", "untilRegularSeason", undefined);
			await toWorker("main", "fixScheduleDays", undefined).catch(
				() => undefined,
			);
			await afterSim(0);
			store.setStatus("Regular season started — Play to sim game days");
			return;
		}

		if (phase === "regular" || phase === "playoffs") {
			await toWorker("playMenu", "day", undefined);
			await afterSim(1);
			store.setStatus(
				phase === "playoffs"
					? "Playoff day complete"
					: "Game day complete — check Standings / Schedule",
			);
			return;
		}

		if (phase === "draftLottery") {
			await toWorker("playMenu", "untilDraft", undefined);
			await afterSim(0);
			store.setStatus("Draft lottery complete — draft begins");
			return;
		}

		if (phase === "draft") {
			await toWorker("playMenu", "onePick", undefined);
			await afterSim(0);
			store.setStatus("One draft pick made");
			return;
		}

		if (phase === "afterDraft") {
			await toWorker("playMenu", "untilResignPlayers", undefined);
			await afterSim(0);
			store.setStatus("Moved to re-signing");
			return;
		}

		if (phase === "resign") {
			await toWorker("playMenu", "untilFreeAgency", undefined);
			await afterSim(0);
			store.setStatus("Moved to free agency");
			return;
		}

		if (phase === "freeAgency") {
			await toWorker("playMenu", "day", undefined);
			await afterSim(1);
			store.setStatus("Free agency day advanced");
			return;
		}

		store.setStatus(`Play not available in this phase (${store.local.phaseText ?? "unknown"})`);
	} catch (error) {
		store.setError(error instanceof Error ? error.message : String(error));
		store.setStatus("Sim error");
	}
};

/** Advance ~1 week of game days — never more than remaining schedule, and
 *  always phase-aware so we don't leap into the finals from preseason. */
export const advanceWeek = async () => {
	const store = useDesktopStore.getState();
	store.setStatus("Simulating week...");
	store.setError(undefined);
	try {
		const phase = await getPhaseKind();

		if (phase === "preseason") {
			await toWorker("playMenu", "untilRegularSeason", undefined);
			await toWorker("main", "fixScheduleDays", undefined).catch(
				() => undefined,
			);
			await afterSim(0);
			store.setStatus("Regular season started");
			return;
		}

		if (phase === "regular") {
			await toWorker("playMenu", "week", undefined);
			await afterSim(7);
			store.setStatus("Week complete — standings updated");
			return;
		}

		if (phase === "playoffs") {
			// One playoff day only — never blow through an entire series with Sim
			await toWorker("playMenu", "day", undefined);
			await afterSim(1);
			store.setStatus("Playoff day complete (Sim = 1 day in playoffs)");
			return;
		}

		// Offseason phases: fall through to single-step advance
		await advanceDay();
	} catch (error) {
		store.setError(error instanceof Error ? error.message : String(error));
		store.setStatus("Sim error");
	}
};
