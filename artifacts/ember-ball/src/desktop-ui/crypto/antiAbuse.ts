import {
	CLAIM_COOKIE,
	CLAIM_STORAGE_KEY,
	getClaimApiUrl,
} from "./config.ts";

export type LocalClaim = {
	address: string;
	tid: number;
	txHash?: string;
	at: number;
};

const setCookie = (name: string, value: string, days = 3650) => {
	const maxAge = days * 24 * 60 * 60;
	document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax`;
};

const getCookie = (name: string): string | undefined => {
	const parts = document.cookie.split(";").map((p) => p.trim());
	const hit = parts.find((p) => p.startsWith(`${name}=`));
	if (!hit) {
		return undefined;
	}
	return decodeURIComponent(hit.slice(name.length + 1));
};

export const readLocalClaim = (): LocalClaim | undefined => {
	try {
		const raw =
			localStorage.getItem(CLAIM_STORAGE_KEY) ?? getCookie(CLAIM_COOKIE);
		if (!raw) {
			return undefined;
		}
		const parsed = JSON.parse(raw) as LocalClaim;
		if (
			parsed &&
			typeof parsed.address === "string" &&
			typeof parsed.tid === "number"
		) {
			return parsed;
		}
	} catch {
		/* ignore */
	}
	return undefined;
};

export const writeLocalClaim = (claim: LocalClaim) => {
	const raw = JSON.stringify(claim);
	localStorage.setItem(CLAIM_STORAGE_KEY, raw);
	sessionStorage.setItem(CLAIM_STORAGE_KEY, raw);
	setCookie(CLAIM_COOKIE, raw);
};

export const hasLocalClaimBlock = (): boolean => readLocalClaim() != null;

/** Ask the claim API whether this IP (or address) already claimed. */
export const checkClaimEligibility = async (
	address?: string,
): Promise<{ ok: boolean; reason?: string; claimedTid?: number }> => {
	if (hasLocalClaimBlock()) {
		const c = readLocalClaim()!;
		return {
			ok: false,
			reason: `This browser already claimed team #${c.tid}. One team per device.`,
			claimedTid: c.tid,
		};
	}

	try {
		const qs = address ? `?address=${encodeURIComponent(address)}` : "";
		const res = await fetch(`${getClaimApiUrl()}/claim/check${qs}`, {
			credentials: "include",
		});
		if (!res.ok) {
			// API down — still enforce cookie/localStorage client-side
			return { ok: true };
		}
		const data = (await res.json()) as {
			allowed: boolean;
			reason?: string;
			tid?: number;
		};
		if (!data.allowed) {
			return {
				ok: false,
				reason: data.reason ?? "Claim blocked (IP or address already used).",
				claimedTid: data.tid,
			};
		}
		return { ok: true };
	} catch {
		return { ok: true };
	}
};

/** Register a successful claim with the IP/cookie registry. */
export const registerClaimWithApi = async (claim: LocalClaim) => {
	writeLocalClaim(claim);
	try {
		await fetch(`${getClaimApiUrl()}/claim/register`, {
			method: "POST",
			credentials: "include",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				address: claim.address,
				tid: claim.tid,
				txHash: claim.txHash,
			}),
		});
	} catch {
		/* client markers already written */
	}
};
