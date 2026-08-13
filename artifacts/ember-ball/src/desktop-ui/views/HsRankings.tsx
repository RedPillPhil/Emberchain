import { useEffect, useState } from "react";
import { toWorker } from "../util/toWorker.ts";
import { useDesktopStore } from "../store.ts";
import { formatRating, scoutPlayer } from "../util/scouting.ts";

export const HsRankings = () => {
	const revision = useDesktopStore((s) => s.revision);
	const lid = useDesktopStore((s) => s.lid);
	const scouting = useDesktopStore((s) => s.scouting);
	const setScouting = useDesktopStore((s) => s.setScouting);
	const readOnly = useDesktopStore((s) => s.readOnly);
	const setView = useDesktopStore((s) => s.setView);
	const setCollegeTid = useDesktopStore((s) => s.setCollegeTid);
	const openProspect = useDesktopStore((s) => s.openProspect);
	const pushToast = useDesktopStore((s) => s.pushToast);
	const [prospects, setProspects] = useState<any[]>([]);

	useEffect(() => {
		void toWorker("main", "getHsTop100", undefined)
			.then((rows: any) => setProspects(rows ?? []))
			.catch(console.error);
	}, [revision]);

	const committed = prospects.filter((p) => p.committedTid != null).length;

	return (
		<>
			<h1 className="page-title">HS Composite Rankings</h1>
			<p className="page-sub">
				247Sports-style national Top 100. Offers and commits update as you
				advance the season. Prestige schools land the top board.
			</p>

			<div className="college-banner">
				<div>
					<strong>
						{committed} / {prospects.length} committed
					</strong>
					<div className="muted">
						Sim days to watch the board move — new offers and signing-day flips
					</div>
				</div>
				<button
					type="button"
					className="btn btn-secondary"
					onClick={() => setView("college")}
				>
					College Hub
				</button>
			</div>

			<section className="panel">
				<div className="panel-header">National Top 100</div>
				<div className="panel-body" style={{ padding: 0 }}>
					<table className="data-table">
						<thead>
							<tr>
								<th>Rk</th>
								<th>Prospect</th>
								<th>Pos</th>
								<th>Hometown</th>
								<th className="num">Ovr</th>
								<th>Offers</th>
								<th>Commitment</th>
								<th></th>
							</tr>
						</thead>
						<tbody>
							{prospects.map((p) => (
								<tr key={p.pid}>
									<td>{p.rank}</td>
									<td>
										<button
											type="button"
											className="player-link"
											onClick={() => openProspect({ kind: "hs", pid: p.pid })}
										>
											{p.firstName} {p.lastName}
										</button>
									</td>
									<td>{p.pos}</td>
									<td>{p.hometown}</td>
									<td className="num">{formatRating(scouting, p.pid, p.ovr, "ovr")}</td>
									<td>
										{(p.offers ?? [])
											.slice(0, 4)
											.map((o: any) => o.abbrev)
											.join(", ")}
										{(p.offers?.length ?? 0) > 4
											? ` +${p.offers.length - 4}`
											: ""}
									</td>
									<td>
										{p.committedSchool ? (
											<button
												type="button"
												className="team-user"
												style={{ background: "none", border: "none", padding: 0 }}
												onClick={() => {
													if (p.committedTid != null) {
														setCollegeTid(p.committedTid);
														setView("collegeTeam");
													}
												}}
											>
												{p.committedSchool}
											</button>
										) : (
											<span className="muted">Undeclared</span>
										)}
									</td>
									<td>
										{!readOnly ? (
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
														"college",
													);
													setScouting(result.state);
													pushToast({
														text: result.message,
														type: result.ok ? "info" : "error",
													});
												}}
											>
												Scout
											</button>
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
