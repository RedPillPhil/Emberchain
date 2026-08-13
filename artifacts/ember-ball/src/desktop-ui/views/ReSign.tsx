import { useEffect, useState } from "react";
import { runBeforeView } from "../util/league.ts";
import { toWorker } from "../util/toWorker.ts";
import { useDesktopStore } from "../store.ts";
import { formatRating } from "../util/scouting.ts";
import { fmtMoney } from "../util/format.ts";

/**
 * Re-signing period: your expiring contracts. Meet a player's asking price to
 * keep him, or let him walk into free agency.
 */
export const ReSign = () => {
	const revision = useDesktopStore((s) => s.revision);
	const scouting = useDesktopStore((s) => s.scouting);
	const setStatus = useDesktopStore((s) => s.setStatus);
	const pushToast = useDesktopStore((s) => s.pushToast);
	const openPlayer = useDesktopStore((s) => s.openPlayer);
	const setView = useDesktopStore((s) => s.setView);
	const readOnly = useDesktopStore((s) => s.readOnly);
	const [data, setData] = useState<any>(null);
	const [busy, setBusy] = useState(false);

	const refetch = async () => {
		const fresh = await runBeforeView("negotiationList", {}).catch(
			console.error,
		);
		if (fresh) {
			setData(fresh);
		}
	};

	useEffect(() => {
		void refetch();
	}, [revision]);

	const players = data?.players ?? [];

	/** Display in millions; mood amounts are BBGM thousands. */
	const askingMillions = (p: any): number => {
		const thousands = p.mood?.user?.contractAmount ?? p.contract?.amount ?? 0;
		return thousands / 1000;
	};

	/** acceptContractNegotiation expects thousands of dollars. */
	const askingThousands = (p: any): number =>
		p.mood?.user?.contractAmount ??
		Math.round((p.contract?.amount ?? 0) * 1000);

	const reSign = async (p: any) => {
		if (readOnly || busy) {
			return;
		}
		setBusy(true);
		setStatus("Negotiating...");
		try {
			const error = await toWorker("main", "acceptContractNegotiation", {
				pid: p.pid,
				amount: askingThousands(p),
				exp: p.contract?.exp,
			});
			if (typeof error === "string" && error) {
				pushToast({ text: error, type: "error" });
			} else {
				pushToast({
					text: `${p.firstName} ${p.lastName} re-signed for ${fmtMoney(askingMillions(p))}!`,
					type: "info",
				});
			}
			await refetch();
			useDesktopStore.getState().bumpRevision();
		} finally {
			setBusy(false);
			setStatus("Idle");
		}
	};

	const letGo = async (p: any) => {
		if (readOnly || busy) {
			return;
		}
		setBusy(true);
		try {
			await toWorker("main", "cancelContractNegotiation", p.pid);
			pushToast({
				text: `${p.firstName} ${p.lastName} will hit free agency`,
				type: "info",
			});
			await refetch();
		} finally {
			setBusy(false);
		}
	};

	return (
		<>
			<h1 className="page-title">Re-Sign Players</h1>
			<p className="page-sub">
				Your expiring contracts. Anyone you don&apos;t re-sign becomes an
				unrestricted free agent when free agency opens — and other teams will
				come calling. Cap space: {fmtMoney((data?.capSpace ?? 0) * 1000)} ·
				Roster spots open: {data?.numRosterSpots ?? "—"}
			</p>

			<section className="panel">
				<div className="panel-header">
					<span>Expiring Contracts</span>
					<button
						type="button"
						className="btn btn-primary"
						onClick={() => setView("dashboard")}
					>
						Done — back to Dashboard
					</button>
				</div>
				<div className="panel-body" style={{ padding: 0 }}>
					{players.length === 0 ? (
						<div className="empty" style={{ padding: 20 }}>
							No pending re-signings. Use the Play button to open free
							agency.
						</div>
					) : (
						<table className="data-table">
							<thead>
								<tr>
									<th>Pos</th>
									<th>Player</th>
									<th className="num">Age</th>
									<th className="num">Ovr</th>
									<th className="num">Pot</th>
									<th className="num">Last Salary</th>
									<th className="num">Asking</th>
									<th className="num">Thru</th>
									<th>Mood</th>
									<th></th>
								</tr>
							</thead>
							<tbody>
								{players.map((p: any) => {
									const willing = p.mood?.user?.willing !== false;
									return (
										<tr key={p.pid}>
											<td>{p.ratings?.pos}</td>
											<td>
												<button
													type="button"
													className="player-link"
													onClick={() => openPlayer(p.pid)}
												>
													{p.firstName} {p.lastName}
												</button>
											</td>
											<td className="num">{p.age}</td>
											<td className="num">
												{formatRating(scouting, p.pid, p.ratings?.ovr, "ovr")}
											</td>
											<td className="num">
												{formatRating(
													scouting,
													p.pid,
													p.ratings?.pot,
													"pot",
													p.ratings?.ovr,
												)}
											</td>
											<td className="num muted">
												{fmtMoney((p.lastSalary ?? 0) / 1000)}
											</td>
											<td className="num">{fmtMoney(askingMillions(p))}</td>
											<td className="num">{p.contract?.exp ?? "—"}</td>
											<td>
												{willing ? (
													<span style={{ color: "#2fd67b", fontSize: 12 }}>
														Open to it
													</span>
												) : (
													<span style={{ color: "#ef5b5b", fontSize: 12 }}>
														Wants out
													</span>
												)}
											</td>
											<td style={{ whiteSpace: "nowrap" }}>
												{!readOnly ? (
													<>
														<button
															type="button"
															className="btn btn-secondary"
															style={{
																minHeight: 26,
																fontSize: 12,
																padding: "2px 10px",
															}}
															disabled={busy || !willing}
															title={
																willing
																	? "Meet his asking price"
																	: "He won't re-sign with you"
															}
															onClick={() => void reSign(p)}
														>
															Re-Sign
														</button>{" "}
														<button
															type="button"
															className="btn btn-ghost"
															style={{
																minHeight: 26,
																fontSize: 12,
																padding: "2px 10px",
															}}
															disabled={busy}
															onClick={() => void letGo(p)}
														>
															Let Walk
														</button>
													</>
												) : (
													<span className="muted">Browse only</span>
												)}
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					)}
				</div>
			</section>
		</>
	);
};
