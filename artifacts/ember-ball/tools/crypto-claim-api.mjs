/**
 * Lightweight claim registry: one team per wallet address + one claim per IP.
 * Sets an httpOnly cookie after a successful register.
 *
 *   node tools/crypto-claim-api.mjs
 *   → http://localhost:7790
 */
import http from "node:http";
import { URL } from "node:url";

const PORT = Number(process.env.CLAIM_API_PORT || 7790);
const COOKIE = "ember_team_claimed";

/** @type {Map<string, { tid: number, address: string, at: number, txHash?: string }>} */
const byIp = new Map();
/** @type {Map<string, { tid: number, address: string, at: number, txHash?: string }>} */
const byAddress = new Map();

const cors = {
	"Access-Control-Allow-Origin": true, // echoed
	"Access-Control-Allow-Credentials": "true",
	"Access-Control-Allow-Headers": "Content-Type",
	"Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

const clientIp = (req) => {
	const xf = req.headers["x-forwarded-for"];
	if (typeof xf === "string" && xf.length) {
		return xf.split(",")[0].trim();
	}
	return req.socket.remoteAddress || "unknown";
};

const parseCookies = (header) => {
	const out = {};
	if (!header) {
		return out;
	}
	for (const part of header.split(";")) {
		const [k, ...rest] = part.trim().split("=");
		out[k] = decodeURIComponent(rest.join("=") || "");
	}
	return out;
};

const send = (req, res, status, body, extraHeaders = {}) => {
	const origin = req.headers.origin || "*";
	const headers = {
		"Content-Type": "application/json",
		"Access-Control-Allow-Origin": origin,
		"Access-Control-Allow-Credentials": "true",
		"Access-Control-Allow-Headers": "Content-Type",
		"Access-Control-Allow-Methods": "GET,POST,OPTIONS",
		...extraHeaders,
	};
	res.writeHead(status, headers);
	res.end(JSON.stringify(body));
};

const server = http.createServer(async (req, res) => {
	if (req.method === "OPTIONS") {
		return send(req, res, 204, {});
	}

	const url = new URL(req.url || "/", `http://localhost:${PORT}`);
	const ip = clientIp(req);
	const cookies = parseCookies(req.headers.cookie);

	if (url.pathname === "/health") {
		return send(req, res, 200, { ok: true });
	}

	if (url.pathname === "/claim/check" && req.method === "GET") {
		const address = (url.searchParams.get("address") || "").toLowerCase();
		if (cookies[COOKIE]) {
			try {
				const c = JSON.parse(cookies[COOKIE]);
				return send(req, res, 200, {
					allowed: false,
					reason: "Cookie shows a prior claim on this browser.",
					tid: c.tid,
				});
			} catch {
				/* fall through */
			}
		}
		if (byIp.has(ip)) {
			const c = byIp.get(ip);
			return send(req, res, 200, {
				allowed: false,
				reason: "This IP address already claimed a team.",
				tid: c.tid,
			});
		}
		if (address && byAddress.has(address)) {
			const c = byAddress.get(address);
			return send(req, res, 200, {
				allowed: false,
				reason: "This wallet already claimed a team.",
				tid: c.tid,
			});
		}
		return send(req, res, 200, { allowed: true });
	}

	if (url.pathname === "/claim/register" && req.method === "POST") {
		const chunks = [];
		for await (const chunk of req) {
			chunks.push(chunk);
		}
		let body;
		try {
			body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
		} catch {
			return send(req, res, 400, { ok: false, reason: "bad json" });
		}
		const address = String(body.address || "").toLowerCase();
		const tid = Number(body.tid);
		const txHash = body.txHash ? String(body.txHash) : undefined;
		if (!address || !Number.isFinite(tid)) {
			return send(req, res, 400, { ok: false, reason: "address + tid required" });
		}
		if (byIp.has(ip)) {
			return send(req, res, 409, {
				ok: false,
				reason: "IP already claimed",
				tid: byIp.get(ip).tid,
			});
		}
		if (byAddress.has(address)) {
			return send(req, res, 409, {
				ok: false,
				reason: "Address already claimed",
				tid: byAddress.get(address).tid,
			});
		}
		const row = { tid, address, at: Date.now(), txHash };
		byIp.set(ip, row);
		byAddress.set(address, row);
		const cookieVal = encodeURIComponent(
			JSON.stringify({ tid, address, at: row.at }),
		);
		return send(
			req,
			res,
			200,
			{ ok: true, tid },
			{
				"Set-Cookie": `${COOKIE}=${cookieVal}; Path=/; Max-Age=315360000; SameSite=Lax`,
			},
		);
	}

	return send(req, res, 404, { ok: false, reason: "not found" });
});

server.listen(PORT, () => {
	console.log(`Ember claim API on http://localhost:${PORT}`);
	void cors;
});
