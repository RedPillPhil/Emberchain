import { create } from "zustand";
import type { LocalStateUI } from "../common/types.ts";
import { resolveCollegeTeam } from "../common/college/resolveCollege.ts";
import type { LocalClaim } from "./crypto/antiAbuse.ts";
import { setBrowseOnly } from "./util/browseGate.ts";
import {
	defaultScouting,
	loadScouting,
	type ScoutingState,
} from "./util/scouting.ts";

export type DesktopViewId =
	| "dashboard"
	| "roster"
	| "standings"
	| "schedule"
	| "boxScore"
	| "liveGame"
	| "playoffs"
	| "draftLottery"
	| "draftRoom"
	| "resign"
	| "playerStats"
	| "freeAgents"
	| "leaders"
	| "awards"
	| "finances"
	| "transactions"
	| "college"
	| "collegeTeam"
	| "hsRankings"
	| "player"
	| "prospect"
	| "staff"
	| "draft"
	| "trade"
	| "trainingCamp"
	| "progression"
	| "hallOfFame"
	| "countryFreeAgents"
	| "noTeamOwned";

/** Franchise-office views that require owning a claimed team in crypto mode. */
export const TEAM_OWNED_VIEWS = new Set<DesktopViewId>([
	"roster",
	"staff",
	"trade",
	"finances",
	"resign",
	"trainingCamp",
	"progression",
	"draftRoom",
	"draftLottery",
]);

export type ProgressionResult = {
	pid: number;
	firstName: string;
	lastName: string;
	age: number;
	pos: string;
	ovr: number;
	pot: number;
	ovrBefore: number;
	potBefore: number;
	ovrDelta: number;
	potDelta: number;
	trained?: boolean;
};

export type ProspectRef = {
	kind: "college" | "hs";
	pid: number;
	/** College team tid (college prospects only) */
	tid?: number;
};

type Toast = {
	id: number;
	text: string;
	type: string;
};

type DesktopState = {
	lid: number | undefined;
	view: DesktopViewId;
	collegeTid: number | undefined;
	/** Team whose roster is open (undefined = user's team) */
	rosterTid: number | undefined;
	playerPid: number | undefined;
	playerBack: DesktopViewId;
	prospectRef: ProspectRef | undefined;
	prospectBack: DesktopViewId;
	gameGid: number | undefined;
	/** Payload for the live play-by-play view (events + initial box score) */
	liveGame: { events: any[]; initialBoxScore: any } | undefined;
	progressionResults: ProgressionResult[] | undefined;
	/** Crypto / spectator league — browse only, no GM actions */
	readOnly: boolean;
	cryptoMode: boolean;
	/** Ember League wallet claim (undefined = spectator, no franchise) */
	claimedTeam: LocalClaim | undefined;
	countryFaFilter: string | undefined;
	revision: number;
	local: Partial<LocalStateUI> & {
		season?: number;
		phaseText?: string;
		leagueName?: string;
		leagueAbbrev?: string;
		commissioner?: string;
		userTid?: number;
		teamInfo?: { region?: string; name?: string; abbrev?: string };
		lastScores?: string[];
		dateString?: string;
		collegePhase?: string;
	};
	status: string;
	error: string | undefined;
	/** Inbox-style notifications (engine events + scouting toasts) */
	notifications: Toast[];
	notificationsOpen: boolean;
	unreadCount: number;
	scouting: ScoutingState;
	setView: (view: DesktopViewId) => void;
	setCollegeTid: (tid: number | undefined) => void;
	openPlayer: (pid: number) => void;
	openTeam: (tid: number) => void;
	openCollege: (tid: number) => void;
	openCollegeByName: (school: string) => void;
	openCountryFreeAgents: (country: string) => void;
	openProspect: (ref: ProspectRef) => void;
	openBoxScore: (gid: number) => void;
	setLiveGame: (
		payload: { events: any[]; initialBoxScore: any } | undefined,
	) => void;
	setProgressionResults: (results: ProgressionResult[] | undefined) => void;
	setReadOnly: (readOnly: boolean) => void;
	setCryptoMode: (cryptoMode: boolean) => void;
	setClaimedTeam: (claim: LocalClaim | undefined) => void;
	setLid: (lid: number | undefined) => void;
	setStatus: (status: string) => void;
	setError: (error: string | undefined) => void;
	patchLocal: (obj: DesktopState["local"]) => void;
	resetLeague: () => void;
	bumpRevision: () => void;
	pushToast: (toast: Omit<Toast, "id">) => void;
	toggleNotifications: () => void;
	markNotificationsRead: () => void;
	clearNotifications: () => void;
	setScouting: (scouting: ScoutingState) => void;
	loadScoutingForLeague: (lid: number) => void;
};

let toastId = 1;

export const useDesktopStore = create<DesktopState>((set) => ({
	lid: undefined,
	view: "dashboard",
	collegeTid: undefined,
	rosterTid: undefined,
	playerPid: undefined,
	playerBack: "dashboard",
	prospectRef: undefined,
	prospectBack: "college",
	gameGid: undefined,
	liveGame: undefined,
	progressionResults: undefined,
	readOnly: false,
	cryptoMode: false,
	claimedTeam: undefined,
	countryFaFilter: undefined,
	revision: 0,
	local: {},
	status: "Ready",
	error: undefined,
	notifications: [],
	notificationsOpen: false,
	unreadCount: 0,
	scouting: defaultScouting(),
	setView: (view) => {
		const state = useDesktopStore.getState();
		if (
			state.cryptoMode &&
			!state.claimedTeam &&
			TEAM_OWNED_VIEWS.has(view)
		) {
			set({ view: "noTeamOwned" });
			return;
		}
		set(view === "roster" ? { view, rosterTid: undefined } : { view });
	},
	setCollegeTid: (collegeTid) => set({ collegeTid }),
	openPlayer: (pid) =>
		set((state) => ({
			playerPid: pid,
			playerBack: state.view === "player" ? state.playerBack : state.view,
			view: "player",
		})),
	openTeam: (tid) => set({ rosterTid: tid, view: "roster" }),
	openCollege: (tid) => set({ collegeTid: tid, view: "collegeTeam" }),
	openCollegeByName: (school) => {
		const hit = resolveCollegeTeam(school);
		if (hit) {
			set({ collegeTid: hit.tid, view: "collegeTeam" });
		}
	},
	openCountryFreeAgents: (country) =>
		set({ countryFaFilter: country, view: "countryFreeAgents" }),
	openProspect: (prospectRef) =>
		set((state) => ({
			prospectRef,
			prospectBack: state.view === "prospect" ? state.prospectBack : state.view,
			view: "prospect",
		})),
	openBoxScore: (gameGid) => set({ gameGid, view: "boxScore" }),
	setLiveGame: (liveGame) =>
		set(liveGame ? { liveGame, view: "liveGame" } : { liveGame }),
	setProgressionResults: (progressionResults) => set({ progressionResults }),
	setReadOnly: (readOnly) => set({ readOnly }),
	setCryptoMode: (cryptoMode) => {
		setBrowseOnly(cryptoMode);
		set({ cryptoMode, readOnly: cryptoMode });
	},
	setClaimedTeam: (claimedTeam) => set({ claimedTeam }),
	setLid: (lid) => set({ lid }),
	setStatus: (status) => set({ status }),
	setError: (error) => set({ error }),
	patchLocal: (obj) =>
		set((state) => ({
			local: { ...state.local, ...obj },
		})),
	resetLeague: () =>
		set({
			lid: undefined,
			view: "dashboard",
			collegeTid: undefined,
			rosterTid: undefined,
			progressionResults: undefined,
			local: {},
			status: "Ready",
			notifications: [],
			notificationsOpen: false,
			unreadCount: 0,
			scouting: defaultScouting(),
		}),
	bumpRevision: () => set((state) => ({ revision: state.revision + 1 })),
	pushToast: (toast) =>
		set((state) => ({
			notifications: [
				{ ...toast, id: toastId++ },
				...state.notifications,
			].slice(0, 50),
			unreadCount: state.unreadCount + 1,
			// Keep panel closed — badge on the bell is the signal
		})),
	toggleNotifications: () =>
		set((state) => ({
			notificationsOpen: !state.notificationsOpen,
			unreadCount: state.notificationsOpen ? state.unreadCount : 0,
		})),
	markNotificationsRead: () => set({ unreadCount: 0 }),
	clearNotifications: () =>
		set({ notifications: [], unreadCount: 0, notificationsOpen: false }),
	setScouting: (scouting) => set({ scouting }),
	loadScoutingForLeague: (lid) => set({ scouting: loadScouting(lid) }),
}));
