import type {
	GameAttributesLeague,
	LocalStateUI,
	UpdateEvents,
} from "../../common/types.ts";
import { useDesktopStore } from "../store.ts";
import { stripHtml } from "../util/format.ts";
import { toWorker } from "../util/toWorker.ts";

const realtimeUpdate = async (
	updateEvents: UpdateEvents = [],
	_url?: string,
	raw?: Record<string, unknown>,
) => {
	// Live game sim: the worker sends the full play-by-play here
	if (raw?.playByPlay !== undefined && raw.gidOneGame !== undefined) {
		try {
			const payload: any = await toWorker("main", "runBefore", {
				viewId: "liveGame",
				params: {},
				ctxBBGM: {
					gidOneGame: raw.gidOneGame,
					playByPlay: raw.playByPlay,
					fromAction: true,
				},
				updateEvents: ["firstRun"],
				prevData: {},
			});
			if (payload?.events && payload?.initialBoxScore) {
				useDesktopStore.getState().setLiveGame({
					events: payload.events,
					initialBoxScore: payload.initialBoxScore,
				});
			}
		} catch (error) {
			console.error("Live game setup failed", error);
		}
		useDesktopStore.getState().bumpRevision();
		return;
	}

	// During multi-day sims the worker fires this every day. Refetching every
	// desktop view mid-sim floods IndexedDB and can trip Chrome into closing
	// the league connection. Skip pure game-day ticks; refresh when Idle.
	const onlySimTick =
		updateEvents.length > 0 &&
		updateEvents.every(
			(event) => event === "gameSim" || event === "playerMovement",
		);
	if (onlySimTick) {
		return;
	}

	useDesktopStore.getState().bumpRevision();
};

const updateLocal = (obj: Partial<LocalStateUI>) => {
	const prevStatus = (useDesktopStore.getState().local as any).statusText;
	useDesktopStore.getState().patchLocal(obj);
	if (obj.statusText !== undefined) {
		useDesktopStore.getState().setStatus(obj.statusText);
	}
	// Sim finished (or phase chrome changed) — safe to refresh views now
	if (
		(obj.statusText !== undefined &&
			obj.statusText === "Idle" &&
			prevStatus !== "Idle") ||
		obj.phaseText !== undefined
	) {
		useDesktopStore.getState().bumpRevision();
	}
};

const setGameAttributes = (
	gameAttributes: Partial<GameAttributesLeague>,
	_flagOverrides?: LocalStateUI["flagOverrides"],
) => {
	useDesktopStore.getState().patchLocal({ ...gameAttributes } as any);
};

const showNotification = (options: {
	extraClass?: string;
	persistent?: boolean;
	text: string;
	type?: string;
}) => {
	useDesktopStore.getState().pushToast({
		text: stripHtml(options.text),
		type: options.type ?? "info",
	});
};

const noop = async () => {};

export default {
	analyticsEvent: noop,
	autoPlayDialog: async () => ({}),
	confirm: async (message: string) => window.confirm(message),
	confirmDeleteAllLeagues: async () => window.confirm("Delete all leagues?"),
	crossTabEmit: noop,
	deleteGames: noop,
	initAds: noop,
	initGold: noop,
	mergeGames: noop,
	newLid: noop,
	realtimeUpdate,
	requestPersistentStorage: async () => true,
	resetLeague: () => {
		useDesktopStore.getState().resetLeague();
	},
	setGameAttributes,
	showNotification,
	showModal: noop,
	updateLocal,
	updateTeamOvrs: noop,
};
