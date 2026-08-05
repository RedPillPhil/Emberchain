import { useCallback, useEffect, useState } from "react";
import {
	PLATFORM_TOKEN,
	getConnectedWallet,
	shortenAddress,
} from "../../common/crypto.ts";
import type { PublicLeagueListing } from "../../common/multiplayer.ts";
import useTitleBar from "../hooks/useTitleBar.tsx";
import { logEvent } from "../util/logEvent.ts";
import { toWorker } from "../util/toWorker.ts";
import { realtimeUpdate } from "../util/realtimeUpdate.ts";
import { connectWallet } from "../util/wallet.ts";

const statusLabel = (status: PublicLeagueListing["status"]) => {
	if (status === "open") {
		return <span className="embr-badge embr-badge-open">Open</span>;
	}
	return <span className="embr-badge">In season</span>;
};

const PublicLeagues = () => {
	const [filter, setFilter] = useState<"all" | "public" | "code">("all");
	const [joinCode, setJoinCode] = useState("");
	const [leagues, setLeagues] = useState<PublicLeagueListing[]>([]);
	const [loading, setLoading] = useState(true);

	useTitleBar({ title: "Public Leagues" });

	const refresh = useCallback(async (code?: string) => {
		setLoading(true);
		try {
			const list = await toWorker("main", "listPublicCryptoLeagues", {
				joinCode: code || undefined,
			});
			setLeagues(list);
		} catch (error: any) {
			logEvent({
				type: "error",
				text: error?.message ?? "Could not load leagues",
				saveToDb: false,
			});
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	const visible = leagues.filter((l) => {
		if (filter === "all") {
			return true;
		}
		return l.access === filter;
	});

	const handleJoin = async (league: PublicLeagueListing) => {
		let wallet = getConnectedWallet();
		if (!wallet) {
			wallet = await connectWallet();
		}
		if (!wallet) {
			logEvent({
				type: "error",
				text: "Connect a wallet to join and claim a team.",
				saveToDb: false,
			});
			return;
		}
		logEvent({
			type: "info",
			text: `Opening "${league.name}". Claim an unowned team inside — no NFT mint yet; your address gets control.`,
			saveToDb: false,
			showNotification: true,
		});
		realtimeUpdate([], `/l/${league.lid}/multiplayer`);
	};

	return (
		<div className="embr-page embr-page-dark">
			<h2 className="embr-section-title">Public multiplayer leagues</h2>
			<p className="embr-section-lead">
				Only leagues created as <strong>public</strong> appear here. Code-gated
				leagues show up only when you enter the invite code. Contracts are not
				live — claiming assigns your wallet to a team locally (no mint).
			</p>

			<div className="d-flex flex-wrap gap-2 mb-4 align-items-center">
				{(["all", "public", "code"] as const).map((key) => (
					<button
						key={key}
						type="button"
						className={`embr-btn ${filter === key ? "embr-btn-primary" : "embr-btn-ghost"}`}
						style={
							filter !== key
								? { color: "inherit", borderColor: "currentColor" }
								: undefined
						}
						onClick={() => setFilter(key)}
					>
						{key === "all" ? "All" : key === "public" ? "Public" : "Code gated"}
					</button>
				))}
				<div className="ms-auto d-flex gap-2 align-items-center">
					<input
						className="form-control"
						style={{ maxWidth: 180, borderRadius: 0 }}
						placeholder="Have a code?"
						value={joinCode}
						onChange={(e) => setJoinCode(e.target.value)}
					/>
					<button
						type="button"
						className="btn btn-primary"
						onClick={() => void refresh(joinCode)}
					>
						Find by code
					</button>
				</div>
			</div>

			<div
				className="table-responsive"
				style={{ background: "var(--embr-ash)", padding: "1rem" }}
			>
				{loading ? (
					<p className="text-body-secondary mb-0">Loading…</p>
				) : visible.length === 0 ? (
					<p className="text-body-secondary mb-0">
						No public leagues yet.{" "}
						<a href="/create_league?mode=crypto">Create one</a> and set access
						to Publicly joinable.
					</p>
				) : (
					<table className="embr-league-table">
						<thead>
							<tr>
								<th>League</th>
								<th>Access</th>
								<th>Teams</th>
								<th>Join fee*</th>
								<th>Season</th>
								<th>Status</th>
								<th />
							</tr>
						</thead>
						<tbody>
							{visible.map((league) => (
								<tr key={league.lid}>
									<td>
										<div className="embr-league-name">{league.name}</div>
										<div
											style={{
												color: "var(--embr-muted)",
												fontSize: "0.8rem",
											}}
										>
											Commish {shortenAddress(league.commissioner)}
										</div>
									</td>
									<td>
										{league.access === "public" ? (
											<span className="embr-badge embr-badge-open">Public</span>
										) : (
											<span className="embr-badge embr-badge-code">Code</span>
										)}
									</td>
									<td>
										{league.teamsFilled}/{league.teamsTotal}
									</td>
									<td>
										{league.joinFeeEmbr.toLocaleString()} {PLATFORM_TOKEN}*
									</td>
									<td>{league.phaseText ?? league.season ?? "—"}</td>
									<td>{statusLabel(league.status)}</td>
									<td>
										<button
											type="button"
											className="btn btn-sm btn-primary"
											onClick={() => void handleJoin(league)}
										>
											Enter & claim
										</button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
			</div>

			<p className="mt-3 text-body-secondary small">
				*Join fees are not collected until contracts launch. Want to run your
				own? <a href="/create_league">Create a league</a>.
			</p>
		</div>
	);
};

export default PublicLeagues;
