import { useEffect, useState } from "react";
import { runBeforeView } from "../util/league.ts";
import { toWorker } from "../util/toWorker.ts";
import { useDesktopStore } from "../store.ts";
import { formatRating, scoutPlayer } from "../util/scouting.ts";
import { fmtMoney } from "../util/format.ts";

export const FreeAgents = () => {
	const revision = useDesktopStore((s) => s.revision);
	const lid = useDesktopStore((s) => s.lid);
	const scouting = useDesktopStore((s) => s.scouting);
	const setScouting = useDesktopStore((s) => s.setScouting);
	const pushToast = useDesktopStore((s) => s.pushToast);
	const openPlayer = useDesktopStore((s) => s.openPlayer);
	const readOnly = useDesktopStore((s) => s.readOnly);
	const [data, setData] = useState<any>(null);
	const [busy, setBusy] = useState(false);

	const refetch = () =>
		runBeforeView("freeAgents", { type: "available" })
			.then(setData)
			.catch(console.error);

	useEffect(() => {
		void refetch();
	}, [revision]);

	const players = data?.players ?? [];

	/**
	 * Display amount in millions. freeAgents view already converts
	 * p.contract.amount to millions; mood.user.contractAmount is still in
	 * BBGM thousands-of-dollars and must be divided.
	 */
	const askingMillions = (p: any): number => {
		if (p.contract?.amount != null && p.contract.amount < 500) {
			// Already converted to millions by the freeAgents view
			return p.contract.amount;
		}
		const thousands = p.mood?.user?.contractAmount ?? p.contract?.amount ?? 0;
		return thousands / 1000;
	};

	/** acceptContractNegotiation expects thousands of dollars */
	const askingThousands = (p: any): number => {
		if (p.mood?.user?.contractAmount != null) {
			return p.mood.user.contractAmount;
		}
		const millions = p.contract?.amount ?? 0;
		return millions < 500 ? Math.round(millions * 1000) : millions;
	};

	const signPlayer = async (p: any) => {
		if (readOnly || busy) {
			return;
		}
		setBusy(true);
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
					text: `${p.firstName} ${p.lastName} signed for ${fmtMoney(askingMillions(p))}!`,
					type: "info",
				});
				useDesktopStore.getState().bumpRevision();
			}
			await refetch();
		} finally {
			setBusy(false);
		}
	};

	return (
		<>
			<h1 className="page-title">Free Agents</h1>
			<p className="page-sub">
				Available free agents. Cap space: {fmtMoney(data?.capSpace)} · Payroll:{" "}
				{fmtMoney(data?.payroll)}
			</p>
			<section className="panel">
				<div className="panel-header">
					<span>Market</span>
					<span className="pill">{players.length}</span>
				</div>
				<div className="panel-body" style={{ padding: 0 }}>
					<table className="data-table">
						<thead>
							<tr>
								<th>Pos</th>
								<th>Player</th>
								<th className="num">Age</th>
								<th className="num">Ovr</th>
								<th className="num">Pot</th>
								<th className="num">Asking</th>
								<th></th>
							</tr>
						</thead>
						<tbody>
							{players.slice(0, 80).map((p: any) => (
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
									<td className="num">{fmtMoney(askingMillions(p))}</td>
									<td style={{ whiteSpace: "nowrap" }}>
										{!readOnly ? (
											<>
												<button
													type="button"
													className="btn btn-ghost"
													style={{
														minHeight: 28,
														fontSize: 12,
														padding: "4px 8px",
													}}
													onClick={() => {
														if (lid == null) {
															return;
														}
														const result = scoutPlayer(
															lid,
															scouting,
															p.pid,
															"pro",
														);
														setScouting(result.state);
														pushToast({
															text: result.message,
															type: result.ok ? "info" : "error",
														});
													}}
												>
													Scout
												</button>{" "}
												<button
													type="button"
													className="btn btn-secondary"
													style={{
														minHeight: 28,
														fontSize: 12,
														padding: "4px 10px",
													}}
													disabled={busy || p.mood?.user?.willing === false}
													title={
														p.mood?.user?.willing === false
															? "Not interested in your team"
															: "Sign at his asking price"
													}
													onClick={() => void signPlayer(p)}
												>
													Sign
												</button>
											</>
										) : null}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</section>
		</>
	);
};
