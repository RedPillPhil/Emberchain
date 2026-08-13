import type { IDBPDatabase } from "@dumbmatter/idb";
import connectLeague, { type LeagueDB } from "./connectLeague.ts";
import { idb } from "./index.ts";
import { g } from "../util/index.ts";

let leagueLid: number | undefined;
let reconnecting: Promise<IDBPDatabase<LeagueDB>> | undefined;
let connectionDead = false;

export const isIdbConnectionError = (error: unknown) => {
	const message =
		error instanceof Error
			? error.message
			: typeof error === "string"
				? error
				: "";
	return (
		message.includes("database connection is closing") ||
		message.includes("database connection is closed") ||
		message.includes("Connection to Indexed Database server lost") ||
		(error instanceof DOMException && error.name === "InvalidStateError")
	);
};

/**
 * Remember which league lid owns the open handle, and invalidate it if the
 * browser force-closes IndexedDB (Chrome/Electron does this under memory
 * pressure during long season sims).
 */
export const bindLeagueConnection = (
	db: IDBPDatabase<LeagueDB>,
	lid: number,
) => {
	leagueLid = lid;
	connectionDead = false;
	idb.league = db;

	const invalidate = () => {
		if (idb.league === db) {
			connectionDead = true;
		}
	};

	db.addEventListener("close", invalidate);
	db.addEventListener("versionchange", () => {
		try {
			db.close();
		} catch {
			// already closing
		}
		invalidate();
	});
};

export const clearLeagueConnection = () => {
	connectionDead = true;
	leagueLid = undefined;
	reconnecting = undefined;
};

/**
 * Make sure idb.league is a live connection. No-op if the current handle is
 * still good. Safe to call frequently (e.g. once per sim day).
 */
export const ensureLeagueDb = async (force = false) => {
	const lid = leagueLid ?? g.get("lid");
	if (typeof lid !== "number") {
		throw new Error("No league open");
	}
	leagueLid = lid;

	if (!force && idb.league && !connectionDead) {
		return idb.league;
	}

	if (!reconnecting) {
		reconnecting = (async () => {
			try {
				idb.league?.close();
			} catch {
				// ignore
			}

			const db = await connectLeague(lid);
			bindLeagueConnection(db, lid);
			return db;
		})().finally(() => {
			reconnecting = undefined;
		});
	}

	return reconnecting;
};

/** Run `fn`; on a closed-connection error, reconnect once and retry. */
export const withLeagueDb = async <T>(fn: () => Promise<T>): Promise<T> => {
	await ensureLeagueDb();
	try {
		return await fn();
	} catch (error) {
		if (!isIdbConnectionError(error)) {
			throw error;
		}
		await ensureLeagueDb(true);
		return await fn();
	}
};
