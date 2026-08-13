import { useEffect, useState } from "react";
import { runBeforeView } from "../util/league.ts";
import { useDesktopStore } from "../store.ts";
import { formatRating } from "../util/scouting.ts";

export const PlayerStats = () => {
	const revision = useDesktopStore((s) => s.revision);
	const scouting = useDesktopStore((s) => s.scouting);
	const openPlayer = useDesktopStore((s) => s.openPlayer);
	const [data, setData] = useState<any>(null);

	useEffect(() => {
		void runBeforeView("playerStats", {
			statType: "perGame",
			playoffs: "regularSeason",
		})
			.then(setData)
			.catch(console.error);
	}, [revision]);

	const players = (data?.players ?? [])
		.slice()
		.sort((a: any, b: any) => (b.stats?.pts ?? 0) - (a.stats?.pts ?? 0))
		.slice(0, 100);

	return (
		<>
			<h1 className="page-title">Player Stats</h1>
			<p className="page-sub">League scoring leaders this season (per game).</p>
			<section className="panel">
				<div className="panel-header">
					<span>Season Averages</span>
					<span className="pill">{players.length} shown</span>
				</div>
				<div className="panel-body" style={{ padding: 0 }}>
					<table className="data-table">
						<thead>
							<tr>
								<th>#</th>
								<th>Player</th>
								<th>Team</th>
								<th className="num">Ovr</th>
								<th className="num">GP</th>
								<th className="num">Min</th>
								<th className="num">Pts</th>
								<th className="num">Reb</th>
								<th className="num">Ast</th>
							</tr>
						</thead>
						<tbody>
							{players.map((p: any, i: number) => (
								<tr key={`${p.pid}-${p.stats?.tid ?? i}`}>
									<td>{i + 1}</td>
									<td>
										<button
											type="button"
											className="player-link"
											onClick={() => openPlayer(p.pid)}
										>
											{p.firstName} {p.lastName}
										</button>
									</td>
									<td>{p.stats?.abbrev ?? "—"}</td>
									<td className="num">
										{formatRating(scouting, p.pid, p.ratings?.ovr, "ovr")}
									</td>
									<td className="num">{p.stats?.gp ?? 0}</td>
									<td className="num">
										{p.stats?.min != null ? Number(p.stats.min).toFixed(1) : "—"}
									</td>
									<td className="num">
										{p.stats?.pts != null ? Number(p.stats.pts).toFixed(1) : "—"}
									</td>
									<td className="num">
										{p.stats?.trb != null ? Number(p.stats.trb).toFixed(1) : "—"}
									</td>
									<td className="num">
										{p.stats?.ast != null ? Number(p.stats.ast).toFixed(1) : "—"}
									</td>
								</tr>
							))}
							{players.length === 0 ? (
								<tr>
									<td colSpan={9} className="empty">
										No stats yet — sim some games first.
									</td>
								</tr>
							) : null}
						</tbody>
					</table>
				</div>
			</section>
		</>
	);
};
