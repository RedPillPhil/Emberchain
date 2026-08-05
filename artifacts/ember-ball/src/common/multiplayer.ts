/**
 * Local multiplayer (pre-contract) helpers for Ember Ball crypto leagues.
 * Ownership is wallet→tid assignment in league meta — no NFT mint yet.
 */

import type { LeagueAccess } from "./crypto.ts";

export type EmberTeamOwners = Record<string, string>; // tid → lowercase address

export type EmberPendingTrade = {
	id: string;
	fromTid: number;
	toTid: number;
	fromAddress: string;
	createdAt: number;
	pids: number[];
	dpids: number[];
	pidsOther: number[];
	dpidsOther: number[];
	status: "pending" | "accepted" | "rejected";
};

export type EmberLeagueMeta = {
	mode: "crypto-mp";
	access: LeagueAccess;
	joinCode?: string;
	commissioner: string;
	joinFeeEmbr: number;
	teamsTotal: number;
	/** tid → wallet that claimed (no NFT yet) */
	teamOwners: EmberTeamOwners;
	/** `${season}-${day}` → tids that marked ready */
	readyByDay: Record<string, number[]>;
	pendingTrades: EmberPendingTrade[];
	createdAt: number;
};

export type PublicLeagueListing = {
	lid: number;
	name: string;
	commissioner: string;
	teamsFilled: number;
	teamsTotal: number;
	joinFeeEmbr: number;
	access: LeagueAccess;
	joinCode?: string;
	status: "open" | "in_season";
	season?: number;
	phaseText?: string;
};

export const dayReadyKey = (season: number, day: number) => `${season}-${day}`;

export const countFilledTeams = (owners: EmberTeamOwners) =>
	Object.keys(owners).length;

export const ownerOfTid = (
	owners: EmberTeamOwners,
	tid: number,
): string | undefined => owners[String(tid)];

export const isHumanOwned = (owners: EmberTeamOwners, tid: number) =>
	Boolean(ownerOfTid(owners, tid));

export const tidOwnedBy = (
	owners: EmberTeamOwners,
	address: string | null | undefined,
): number | undefined => {
	if (!address) {
		return undefined;
	}
	const want = address.toLowerCase();
	for (const [tid, addr] of Object.entries(owners)) {
		if (addr === want) {
			return Number(tid);
		}
	}
	return undefined;
};

export const generateJoinCode = () =>
	Math.random().toString(36).slice(2, 8).toUpperCase();
