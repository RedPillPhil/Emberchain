const ensureOfficialEmberLeague = async (
	_input: unknown,
	conditions: Conditions,
): Promise<{ lid: number; created: boolean }> => {
	const leagues = await idb.meta.getAll("leagues");
	const existing = leagues.find((l) => l.name === OFFICIAL_LEAGUE_NAME);
	if (existing) {
		return { lid: existing.lid, created: false };
	}

	const rawTeams = helpers.getTeamsDefault();
	const sortedByPop = [...rawTeams].sort((a, b) => b.pop - a.pop);
	const teamsFromInput = rawTeams.map((t) => ({
		...t,
		popRank: sortedByPop.findIndex((x) => x.tid === t.tid) + 1,
	}));

	const settings = getDefaultSettings();
	const lid = await createLeague(
		{
			name: OFFICIAL_LEAGUE_NAME,
			tid: 0,
			file: undefined,
			url: undefined,
			shuffleRosters: false,
			importLid: undefined,
			getLeagueOptions: undefined,
			keptKeys: [],
			confs: helpers.deepCopy(DEFAULT_CONFS),
			divs: helpers.deepCopy(DEFAULT_DIVS),
			teamsFromInput,
			settings,
			fromFile: {
				gameAttributes: undefined,
				hasRookieContracts: false,
				maxGid: undefined,
				startingSeason: undefined,
				teams: undefined,
				version: undefined,
			},
			startingSeasonFromInput: undefined,
			leagueCreationID: `ember-official-${Date.now()}`,
		},
		conditions,
	);

	const meta = await idb.meta.get("leagues", lid);
	if (meta) {
		meta.starred = true;
		await idb.meta.put("leagues", meta);
	}

	return { lid, created: true };
};

const getEmberMeta = async (
	lid?: number,
): Promise<EmberLeagueMeta | undefined> => {
	const actualLid = lid ?? g.get("lid");
	if (actualLid === undefined) {
		return undefined;
	}
	const meta = await idb.meta.get("leagues", actualLid);
	return meta?.ember;
};

const putEmberMeta = async (lid: number, ember: EmberLeagueMeta) => {
	const meta = await idb.meta.get("leagues", lid);
	if (!meta) {
		throw new Error("League not found");
	}
	meta.ember = ember;
	await idb.meta.put("leagues", meta);
};

const createCryptoLeagueLocal = async (
	{
		name,
		access,
		joinFeeEmbr,
		numTeams,
		wallet,
		tid,
	}: {
		name: string;
		access: "public" | "code";
		joinFeeEmbr: number;
		numTeams: number;
		wallet: string;
		tid?: number;
	},
	conditions: Conditions,
): Promise<{ lid: number; joinCode?: string }> => {
	const address = wallet.toLowerCase();
	let rawTeams = helpers.getTeamsDefault();
	if (numTeams > 0 && numTeams < rawTeams.length) {
		rawTeams = rawTeams.slice(0, numTeams);
	}

	const sortedByPop = [...rawTeams].sort((a, b) => b.pop - a.pop);
	const teamsFromInput = rawTeams.map((t) => ({
		...t,
		popRank: sortedByPop.findIndex((x) => x.tid === t.tid) + 1,
	}));

	const joinCode = access === "code" ? generateJoinCode() : undefined;
	const settings = getDefaultSettings();
	const lid = await createLeague(
		{
			name: name.trim() || "Crypto League",
			tid: tid ?? 0,
			file: undefined,
			url: undefined,
			shuffleRosters: false,
			importLid: undefined,
			getLeagueOptions: undefined,
			keptKeys: [],
			confs: helpers.deepCopy(DEFAULT_CONFS),
			divs: helpers.deepCopy(DEFAULT_DIVS),
			teamsFromInput,
			settings,
			fromFile: {
				gameAttributes: undefined,
				hasRookieContracts: false,
				maxGid: undefined,
				startingSeason: undefined,
				teams: undefined,
				version: undefined,
			},
			startingSeasonFromInput: undefined,
			leagueCreationID: `ember-crypto-${Date.now()}`,
		},
		conditions,
	);

	const ember: EmberLeagueMeta = {
		mode: "crypto-mp",
		access,
		joinCode,
		commissioner: address,
		joinFeeEmbr,
		teamsTotal: teamsFromInput.length,
		teamOwners: {},
		readyByDay: {},
		pendingTrades: [],
		createdAt: Date.now(),
	};
	await putEmberMeta(lid, ember);

	return { lid, joinCode };
};

const listPublicCryptoLeagues = async ({
	joinCode,
}: {
	joinCode?: string;
} = {}): Promise<PublicLeagueListing[]> => {
	const leagues = await idb.meta.getAll("leagues");
	const out: PublicLeagueListing[] = [];
	const code = joinCode?.trim().toUpperCase();

	for (const l of leagues) {
		if (!l.ember) {
			continue;
		}
		const ember = l.ember;
		const filled = countFilledTeams(ember.teamOwners);
		const listing: PublicLeagueListing = {
			lid: l.lid,
			name: l.name,
			commissioner: ember.commissioner,
			teamsFilled: filled,
			teamsTotal: ember.teamsTotal,
			joinFeeEmbr: ember.joinFeeEmbr,
			access: ember.access,
			joinCode: ember.joinCode,
			status: filled >= ember.teamsTotal ? "in_season" : "open",
			season: l.season,
			phaseText: l.phaseText,
		};

		if (ember.access === "public") {
			out.push(listing);
		} else if (
			ember.access === "code" &&
			code &&
			ember.joinCode &&
			ember.joinCode.toUpperCase() === code
		) {
			out.push(listing);
		}
	}

	return out.sort((a, b) => b.lid - a.lid);
};

const getMultiplayerStatus = async ({
	wallet,
}: {
	wallet?: string | null;
} = {}) => {
	const lid = g.get("lid");
	const ember = await getEmberMeta(lid);
	if (!ember) {
		return { enabled: false as const };
	}

	const teams = (await idb.cache.teams.getAll()).filter((t) => !t.disabled);
	const dayKey = dayReadyKey(g.get("season"), g.get("phase"));
	const readyTids = ember.readyByDay[dayKey] ?? [];
	const myTid = wallet ? tidOwnedBy(ember.teamOwners, wallet) : undefined;
	const isCommish =
		!!wallet && wallet.toLowerCase() === ember.commissioner.toLowerCase();

	const upcoming = await season.getSchedule();
	const myGame =
		myTid !== undefined
			? upcoming.find(
					(game) => game.homeTid === myTid || game.awayTid === myTid,
				)
			: undefined;

	return {
		enabled: true as const,
		ember,
		teams: teams.map((t) => ({
			tid: t.tid,
			abbrev: t.abbrev,
			region: t.region,
			name: t.name,
			owner: ownerOfTid(ember.teamOwners, t.tid),
		})),
		myTid,
		isCommish,
		dayKey,
		readyTids,
		myGame: myGame
			? {
					gid: myGame.gid,
					homeTid: myGame.homeTid,
					awayTid: myGame.awayTid,
				}
			: undefined,
		pendingTrades: ember.pendingTrades.filter((t) => t.status === "pending"),
	};
};

const claimTeam = async (
	{
		tid,
		wallet,
	}: {
		tid: number;
		wallet: string;
	},
	conditions: Conditions,
) => {
	const lid = g.get("lid");
	const ember = await getEmberMeta(lid);
	if (!ember) {
		throw new Error("This league is not a crypto multiplayer league.");
	}
	const address = wallet.toLowerCase();
	const existing = tidOwnedBy(ember.teamOwners, address);
	if (existing !== undefined && existing !== tid) {
		throw new Error(
			`Your wallet already controls team ${existing}. One team per address for now.`,
		);
	}
	const currentOwner = ownerOfTid(ember.teamOwners, tid);
	if (currentOwner && currentOwner !== address) {
		throw new Error("That team is already claimed by another wallet.");
	}

	ember.teamOwners[String(tid)] = address;
	await putEmberMeta(lid, ember);
	await team.switchTo(tid);
	await toUI("realtimeUpdate", [["team"]]);
	logEvent(
		{
			type: "info",
			text: `Team claimed for ${address.slice(0, 6)}…${address.slice(-4)}. No NFT minted yet — control is address-assigned only.`,
			showNotification: true,
			persistent: false,
			saveToDb: false,
		},
		conditions,
	);
	return { tid };
};

const markGameReady = async (
	{
		wallet,
	}: {
		wallet: string;
	},
	conditions: Conditions,
) => {
	const lid = g.get("lid");
	const ember = await getEmberMeta(lid);
	if (!ember) {
		throw new Error("Not a multiplayer league");
	}
	const address = wallet.toLowerCase();
	const myTid = tidOwnedBy(ember.teamOwners, address);
	if (myTid === undefined) {
		throw new Error("Claim a team first.");
	}

	const dayKey = dayReadyKey(g.get("season"), g.get("phase"));
	const ready = new Set(ember.readyByDay[dayKey] ?? []);
	ready.add(myTid);
	ember.readyByDay[dayKey] = [...ready];
	await putEmberMeta(lid, ember);

	const upcoming = await season.getSchedule();
	const myGame = upcoming.find(
		(game) => game.homeTid === myTid || game.awayTid === myTid,
	);
	if (!myGame) {
		logEvent(
			{
				type: "info",
				text: "Marked ready — no upcoming game found on the schedule yet.",
				showNotification: true,
				saveToDb: false,
			},
			conditions,
		);
		return { ready: true, canSim: false };
	}

	const otherTid = myGame.homeTid === myTid ? myGame.awayTid : myGame.homeTid;
	const otherHuman = isHumanOwned(ember.teamOwners, otherTid);
	const otherReady = ready.has(otherTid);
	const canSim = !otherHuman || otherReady;

	logEvent(
		{
			type: "info",
			text: canSim
				? otherHuman
					? "Both teams ready — either GM can sim. One watches live; the other gets the box score."
					: "Ready. Opponent is AI — you can sim your game."
				: "Ready recorded. Waiting for the other human GM before this game can be simmed.",
			showNotification: true,
			saveToDb: false,
		},
		conditions,
	);

	return { ready: true, canSim, gid: myGame.gid, otherHuman };
};

const simMyGameIfReady = async (
	{
		wallet,
	}: {
		wallet: string;
	},
	conditions: Conditions,
) => {
	const status = await markGameReady({ wallet }, conditions);
	if (!status.canSim) {
		return status;
	}
	await playMenu.day(undefined, conditions);
	return { ...status, simmed: true };
};

const advanceDayAsCommish = async (
	{
		wallet,
	}: {
		wallet: string;
	},
	conditions: Conditions,
) => {
	const ember = await getEmberMeta();
	if (!ember) {
		throw new Error("Not a multiplayer league");
	}
	if (wallet.toLowerCase() !== ember.commissioner.toLowerCase()) {
		throw new Error("Only the commissioner can advance the day.");
	}
	await playMenu.day(undefined, conditions);
};

const syncTeamNicknamesFromInfos = async () => {
	const teams = await idb.cache.teams.getAll();
	const infos = getTeamInfos(
		teams.map((t) => ({
			tid: t.tid,
			cid: t.cid,
			did: t.did,
			abbrev: t.abbrev,
		})),
	);
	const byTid = new Map(infos.map((t) => [t.tid, t]));
	for (const t of teams) {
		const info = byTid.get(t.tid);
		if (info && (t.name !== info.name || t.region !== info.region)) {
			t.name = info.name;
			t.region = info.region;
			await idb.cache.teams.put(t);
		}
	}
	await league.updateMeta();
	await toUI("realtimeUpdate", [["team"]]);
};
