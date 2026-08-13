import { useEffect, useState } from "react";
import { toWorker } from "../util/toWorker.ts";
import { useDesktopStore } from "../store.ts";
import { formatRating, scoutPlayer } from "../util/scouting.ts";

export const CollegeTeam = () => {
	const collegeTid = useDesktopStore((s) => s.collegeTid);
	const revision = useDesktopStore((s) => s.revision);
	const setView = useDesktopStore((s) => s.setView);
	const openProspect = useDesktopStore((s) => s.openProspect);
	const openPlayer = useDesktopStore((s) => s.openPlayer);
	const lid = useDesktopStore((s) => s.lid);
	const scouting = useDesktopStore((s) => s.scouting);
	const setScouting = useDesktopStore((s) => s.setScouting);
	const pushToast = useDesktopStore((s) => s.pushToast);
	const readOnly = useDesktopStore((s) => s.readOnly);
	const [data, setData] = useState<any>();

	useEffect(() => {
		if (collegeTid == null) {
			return;
		}
		void toWorker("main", "getCollegeTeamDetail", collegeTid)
			.then(setData)
			.catch(console.error);
	}, [collegeTid, revision]);

	if (collegeTid == null) {
		return (
			<div className="empty">
				No school selected.{" "}
				<button
					type="button"
					className="btn btn-primary"
					onClick={() => setView("college")}
				>
					Back to College
				</button>
			</div>
		);
	}

	const team = data?.team;
	const players = data?.players ?? [];
	const futureCommits = data?.futureCommits ?? [];

	return (
		<>
			<button
				type="button"
				className="btn btn-ghost"
				style={{ marginBottom: 12 }}
				onClick={() => setView("college")}
			>
				← Conferences
			</button>
			<h1 className="page-title">
				{team ? `${team.region} ${team.name}` : "College Team"}
			</h1>
			<p className="page-sub">
				{data?.conf?.name ?? ""} · Team Overall {data?.teamOvr ?? "—"} ·
				Prestige {data?.prestige ?? "—"} · Record{" "}
				{data ? `${data.won}-${data.lost}` : "—"}
			</p>

			<section className="panel" style={{ marginBottom: 14 }}>
				<div className="panel-header">
					<span>Roster</span>
					<span className="pill">{players.length} listed</span>
				</div>
				<div className="panel-body" style={{ padding: 0 }}>
					<table className="data-table">
						<thead>
							<tr>
								<th>Yr</th>
								<th>Pos</th>
								<th>Player</th>
								<th className="num">Ovr</th>
								<th className="num">GP</th>
								<th className="num">PPG</th>
								<th className="num">RPG</th>
								<th className="num">APG</th>
								<th></th>
							</tr>
						</thead>
						<tbody>
							{players.map((p: any) => (
								<tr
									key={p.pid}
									style={
										p.status === "declared"
											? { opacity: 0.72 }
											: undefined
									}
								>
									<td>{p.year}</td>
									<td>{p.pos}</td>
									<td>
										<button
											type="button"
											className="player-link"
											onClick={() => {
												if (p.proPid != null) {
													openPlayer(p.proPid);
												} else {
													openProspect({
														kind: "college",
														pid: p.pid,
														tid: collegeTid,
													});
												}
											}}
										>
											{p.firstName} {p.lastName}
										</button>
										{p.status === "declared" ? (
											<span className="pill" style={{ marginLeft: 6 }}>
												Declared
											</span>
										) : null}
										{p.hsRank != null ? (
											<span className="pill" style={{ marginLeft: 6 }}>
												HS #{p.hsRank}
											</span>
										) : null}
									</td>
									<td className="num">
										{formatRating(scouting, p.pid, p.ovr, "ovr")}
									</td>
									<td className="num">{p.stats?.gp ?? 0}</td>
									<td className="num">{p.ppg}</td>
									<td className="num">{p.rpg}</td>
									<td className="num">{p.apg}</td>
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

			<section className="panel">
				<div className="panel-header">
					<span>Future Commits</span>
					<span className="pill">{futureCommits.length} signed</span>
				</div>
				<div className="panel-body" style={{ padding: 0 }}>
					{futureCommits.length === 0 ? (
						<div className="empty" style={{ padding: 20 }}>
							No high-school commits yet. As Top 100 prospects sign, they
							appear here and enroll as freshmen next season.
						</div>
					) : (
						<table className="data-table">
							<thead>
								<tr>
									<th className="num">HS#</th>
									<th>Pos</th>
									<th>Player</th>
									<th className="num">Ovr</th>
									<th>Arrives</th>
								</tr>
							</thead>
							<tbody>
								{futureCommits.map((p: any) => (
									<tr key={p.pid}>
										<td className="num">{p.hsRank ?? "—"}</td>
										<td>{p.pos}</td>
										<td>
											<button
												type="button"
												className="player-link"
												onClick={() =>
													openProspect({
														kind: "hs",
														pid: p.hsPid ?? p.pid,
													})
												}
											>
												{p.firstName} {p.lastName}
											</button>
										</td>
										<td className="num">
											{formatRating(scouting, p.pid, p.ovr, "ovr")}
										</td>
										<td>
											{p.arrivesSeason != null
												? `${p.arrivesSeason} FR`
												: "Next season"}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					)}
				</div>
			</section>
		</>
	);
};
