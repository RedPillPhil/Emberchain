import { useEffect, useState } from "react";
import { runBeforeView } from "../util/league.ts";
import { useDesktopStore } from "../store.ts";
import { formatRating, scoutPlayer } from "../util/scouting.ts";

export const Dashboard = () => {
	const revision = useDesktopStore((s) => s.revision);
	const lid = useDesktopStore((s) => s.lid);
	const scouting = useDesktopStore((s) => s.scouting);
	const setScouting = useDesktopStore((s) => s.setScouting);
	const pushToast = useDesktopStore((s) => s.pushToast);
	const openPlayer = useDesktopStore((s) => s.openPlayer);
	const [data, setData] = useState<any>(null);
	const [error, setError] = useState<string>();

	useEffect(() => {
		let alive = true;
		void (async () => {
			try {
				const result = await runBeforeView("leagueDashboard");
				if (alive) {
					setData(result);
					setError(undefined);
				}
			} catch (err) {
				if (alive) {
					setError(err instanceof Error ? err.message : String(err));
				}
			}
		})();
		return () => {
			alive = false;
		};
	}, [revision]);

	const record = data
		? `${data.won ?? 0}-${data.lost ?? 0}${data.otl ? `-${data.otl}` : ""}`
		: "—";

	const starters = data?.starters ?? data?.players ?? [];

	const onScout = (pid: number) => {
		if (lid == null) {
			return;
		}
		const result = scoutPlayer(lid, scouting, pid, "pro");
		setScouting(result.state);
		pushToast({ text: result.message, type: result.ok ? "info" : "error" });
	};

	return (
		<>
			<h1 className="page-title">Franchise Dashboard</h1>
			<p className="page-sub">
				Hit Play/Sim to advance games. Ratings stay hidden until you spend
				scouting points (top-right). Overalls use a 2K-style 40–99 scale.
			</p>

			{error ? <div className="status-bar error">{error}</div> : null}

			<div className="stat-cards">
				<div className="stat-card">
					<div className="label">Record</div>
					<div className="value">{record}</div>
				</div>
				<div className="stat-card">
					<div className="label">Cash</div>
					<div className="value">
						{data?.cash != null ? `$${(data.cash / 1000).toFixed(1)}M` : "—"}
					</div>
				</div>
				<div className="stat-card">
					<div className="label">Payroll</div>
					<div className="value">
						{data?.payroll != null
							? `$${(data.payroll / 1000).toFixed(1)}M`
							: "—"}
					</div>
				</div>
				<div className="stat-card">
					<div className="label">Playoffs</div>
					<div className="value" style={{ fontSize: 18, paddingTop: 8 }}>
						{data?.roundsWonText || "—"}
					</div>
				</div>
			</div>

			<div className="grid-2">
				<section className="panel">
					<div className="panel-header">
						<span>Rotation Snapshot</span>
						<span className="pill">Scout to reveal OVR</span>
					</div>
					<div className="panel-body" style={{ padding: 0 }}>
						<table className="data-table">
							<thead>
								<tr>
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
								{starters.slice(0, 12).map((p: any) => (
									<tr key={p.pid}>
										<td>{p.ratings?.pos ?? p.pos}</td>
										<td>
											<button
												type="button"
												className="player-link"
												onClick={() => openPlayer(p.pid)}
											>
												{p.firstName} {p.lastName}
											</button>
										</td>
										<td className="num">
											{formatRating(
												scouting,
												p.pid,
												p.ratings?.ovr ?? p.ovr,
												"ovr",
											)}
										</td>
										<td className="num">{p.stats?.gp ?? 0}</td>
										<td className="num">
											{p.stats?.pts != null ? Number(p.stats.pts).toFixed(1) : "0.0"}
										</td>
										<td className="num">
											{p.stats?.trb != null ? Number(p.stats.trb).toFixed(1) : "0.0"}
										</td>
										<td className="num">
											{p.stats?.ast != null ? Number(p.stats.ast).toFixed(1) : "0.0"}
										</td>
										<td>
											<button
												type="button"
												className="btn btn-ghost"
												style={{ minHeight: 28, fontSize: 12, padding: "4px 8px" }}
												onClick={() => onScout(p.pid)}
											>
												Scout
											</button>
										</td>
									</tr>
								))}
								{starters.length === 0 ? (
									<tr>
										<td colSpan={8} className="empty">
											No roster data yet — try Play once the season is in
											regular season / playoffs.
										</td>
									</tr>
								) : null}
							</tbody>
						</table>
					</div>
				</section>

				<section className="panel">
					<div className="panel-header">How Sim Works</div>
					<div className="panel-body">
						<p>
							<strong>Play</strong> sims one day of the pro schedule (and a full
							college slate + HS recruiting tick).
						</p>
						<p>
							<strong>Sim</strong> advances about a week. Check Roster / Player
							Stats for box-score averages after games complete.
						</p>
						<p className="muted">
							If you are between phases (draft, resign, free agency), Play may
							advance the phase instead of games — watch the Calendar chip.
						</p>
					</div>
				</section>
			</div>
		</>
	);
};
