import { useCallback, useEffect, useState } from "react";
import {
	getConnectedWallet,
	shortenAddress,
} from "../../common/crypto.ts";
import useTitleBar from "../hooks/useTitleBar.tsx";
import { helpers } from "../util/helpers.ts";
import { logEvent } from "../util/logEvent.ts";
import { toWorker } from "../util/toWorker.ts";
import { connectWallet } from "../util/wallet.ts";

type MpTeam = {
	tid: number;
	abbrev: string;
	region: string;
	name: string;
	owner?: string;
};

type MpStatus =
	| { enabled: false }
	| {
			enabled: true;
			ember: {
				commissioner: string;
				access: string;
				joinCode?: string;
			};
			teams: MpTeam[];
			myTid?: number;
			isCommish: boolean;
			readyTids: number[];
			myGame?: { gid: number; homeTid: number; awayTid: number };
			pendingTrades: unknown[];
	  };

const Multiplayer = () => {
	const [wallet, setWallet] = useState<string | null>(getConnectedWallet());
	const [status, setStatus] = useState<MpStatus | null>(null);
	const [busy, setBusy] = useState(false);

	useTitleBar({ title: "Multiplayer" });

	const refresh = useCallback(async () => {
		const next = await toWorker("main", "getMultiplayerStatus", {
			wallet: getConnectedWallet(),
		});
		setStatus(next);
		await toWorker("main", "syncTeamNicknamesFromInfos", undefined);
	}, []);

	useEffect(() => {
		const sync = () => setWallet(getConnectedWallet());
		window.addEventListener("embr-wallet", sync);
		void refresh();
		return () => window.removeEventListener("embr-wallet", sync);
	}, [refresh]);

	if (!status) {
		return <p>Loading…</p>;
	}

	if (!status.enabled) {
		return (
			<div>
				<h2>Multiplayer</h2>
				<p>
					This league is not a crypto multiplayer league. Create one from{" "}
					<a href="/create_league?mode=crypto">Create League</a>, or play the
					offline sim as usual.
				</p>
			</div>
		);
	}

	const { ember, teams, myTid, isCommish, readyTids, myGame, pendingTrades } =
		status;

	const ensureWallet = async () => {
		let addr = getConnectedWallet();
		if (!addr) {
			addr = await connectWallet();
		}
		setWallet(addr);
		return addr;
	};

	const claim = async (tid: number) => {
		const addr = await ensureWallet();
		if (!addr) {
			return;
		}
		setBusy(true);
		try {
			await toWorker("main", "claimTeam", { tid, wallet: addr });
			await refresh();
		} catch (error: any) {
			logEvent({
				type: "error",
				text: error?.message ?? "Claim failed",
				saveToDb: false,
				showNotification: true,
			});
		} finally {
			setBusy(false);
		}
	};

	const markReady = async () => {
		const addr = await ensureWallet();
		if (!addr) {
			return;
		}
		setBusy(true);
		try {
			await toWorker("main", "markGameReady", { wallet: addr });
			await refresh();
		} catch (error: any) {
			logEvent({
				type: "error",
				text: error?.message ?? "Could not mark ready",
				saveToDb: false,
				showNotification: true,
			});
		} finally {
			setBusy(false);
		}
	};

	const simMine = async () => {
		const addr = await ensureWallet();
		if (!addr) {
			return;
		}
		setBusy(true);
		try {
			await toWorker("main", "simMyGameIfReady", { wallet: addr });
			await refresh();
		} catch (error: any) {
			logEvent({
				type: "error",
				text: error?.message ?? "Sim failed",
				saveToDb: false,
				showNotification: true,
			});
		} finally {
			setBusy(false);
		}
	};

	const advance = async () => {
		const addr = await ensureWallet();
		if (!addr) {
			return;
		}
		setBusy(true);
		try {
			await toWorker("main", "advanceDayAsCommish", { wallet: addr });
			await refresh();
		} catch (error: any) {
			logEvent({
				type: "error",
				text: error?.message ?? "Advance failed",
				saveToDb: false,
				showNotification: true,
			});
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="ember-league-mode">
			<h2>Multiplayer hub</h2>
			<p className="text-body-secondary">
				Claim a team with your wallet (no NFT mint yet). Edit depth chart on
				Roster. Mark Ready for today&apos;s game; if both clubs are human-owned,
				both must be ready before anyone sims. Only the commissioner advances
				the calendar. Human↔human trades stay as proposals until the other GM
				responds.
			</p>

			<div className="row g-3 mb-4">
				<div className="col-md-4">
					<div className="card p-3 h-100">
						<div className="text-uppercase small text-body-secondary">Wallet</div>
						<div className="fw-bold">
							{wallet ? shortenAddress(wallet) : "Not connected"}
						</div>
						{!wallet ? (
							<button
								type="button"
								className="btn btn-primary btn-sm mt-2"
								onClick={async () => {
									const addr = await connectWallet();
									setWallet(addr);
									await refresh();
								}}
							>
								Connect
							</button>
						) : null}
					</div>
				</div>
				<div className="col-md-4">
					<div className="card p-3 h-100">
						<div className="text-uppercase small text-body-secondary">
							Your team
						</div>
						<div className="fw-bold">
							{myTid !== undefined
								? (() => {
										const t = teams.find((x) => x.tid === myTid);
										return t ? `${t.region} ${t.name}` : `Team ${myTid}`;
									})()
								: "Unclaimed — pick below"}
						</div>
						{myGame ? (
							<div className="small mt-1">
								Next game gid {myGame.gid} · Ready tids:{" "}
								{readyTids.join(", ") || "none"}
							</div>
						) : null}
					</div>
				</div>
				<div className="col-md-4">
					<div className="card p-3 h-100">
						<div className="text-uppercase small text-body-secondary">
							Commissioner
						</div>
						<div className="fw-bold">{shortenAddress(ember.commissioner)}</div>
						<div className="small">
							Access: {ember.access}
							{ember.joinCode ? ` · code ${ember.joinCode}` : ""}
						</div>
					</div>
				</div>
			</div>

			<div className="d-flex flex-wrap gap-2 mb-4">
				<button
					type="button"
					className="btn btn-outline-primary"
					disabled={busy || myTid === undefined}
					onClick={() => void markReady()}
				>
					Mark ready
				</button>
				<button
					type="button"
					className="btn btn-primary"
					disabled={busy || myTid === undefined}
					onClick={() => void simMine()}
				>
					Sim my game (if ready)
				</button>
				{isCommish ? (
					<button
						type="button"
						className="btn btn-warning"
						disabled={busy}
						onClick={() => void advance()}
					>
						Advance day (commish)
					</button>
				) : null}
				<a className="btn btn-light" href={helpers.leagueUrl(["roster"])}>
					Depth chart / roster
				</a>
				<a className="btn btn-light" href={helpers.leagueUrl(["trade"])}>
					Trade
				</a>
			</div>

			{pendingTrades.length > 0 ? (
				<div className="alert alert-info">
					<strong>{pendingTrades.length}</strong> pending human trade proposal
					{pendingTrades.length === 1 ? "" : "s"} stored for review (accept UI
					coming with contracts — for now negotiate on Trade when both GMs are
					online).
				</div>
			) : null}

			<h3 className="mt-2">Teams</h3>
			<div className="table-responsive">
				<table className="table table-striped table-sm">
					<thead>
						<tr>
							<th>Team</th>
							<th>Owner</th>
							<th />
						</tr>
					</thead>
					<tbody>
						{teams.map((t) => (
							<tr key={t.tid}>
								<td>
									{t.region} {t.name}{" "}
									<span className="text-body-secondary">({t.abbrev})</span>
								</td>
								<td>
									{t.owner ? (
										<span title={t.owner}>{shortenAddress(t.owner)}</span>
									) : (
										<span className="text-body-secondary">AI / open</span>
									)}
								</td>
								<td className="text-end">
									{!t.owner ? (
										<button
											type="button"
											className="btn btn-sm btn-success"
											disabled={busy}
											onClick={() => void claim(t.tid)}
										>
											Claim
										</button>
									) : myTid === t.tid ? (
										<span className="badge text-bg-primary">Yours</span>
									) : null}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
};

export default Multiplayer;
