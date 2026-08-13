import { useEffect, useState } from "react";
import { runBeforeView } from "../util/league.ts";
import { useDesktopStore } from "../store.ts";
import { formatRating } from "../util/scouting.ts";

/**
 * League Hall of Fame + your franchise's retired jersey numbers.
 */
export const HallOfFame = () => {
	const revision = useDesktopStore((s) => s.revision);
	const scouting = useDesktopStore((s) => s.scouting);
	const openPlayer = useDesktopStore((s) => s.openPlayer);
	const userTid = useDesktopStore((s) => s.local.userTid);
	const [hof, setHof] = useState<any>(null);
	const [history, setHistory] = useState<any>(null);

	useEffect(() => {
		void runBeforeView("hallOfFame", {}).then(setHof).catch(console.error);
		const abbrev = userTid != null ? String(userTid) : undefined;
		void runBeforeView(
			"teamHistory",
			abbrev != null ? { abbrev, show: "10" } : { show: "10" },
		)
			.then(setHistory)
			.catch(console.error);
	}, [revision, userTid]);

	const players: any[] = hof?.players ?? [];
	const retired: any[] = history?.retiredJerseyNumbers ?? [];

	return (
		<>
			<h1 className="page-title">Hall of Fame</h1>
			<p className="page-sub">
				League immortals and your franchise&apos;s retired numbers.
			</p>

			<section className="panel" style={{ marginBottom: 14 }}>
				<div className="panel-header">
					<span>Retired Numbers</span>
					<span className="pill">
						{history?.team?.region ?? "Your"} franchise
					</span>
				</div>
				<div className="panel-body" style={{ padding: 0 }}>
					{retired.length === 0 ? (
						<div className="empty" style={{ padding: 20 }}>
							No retired numbers yet for this franchise.
						</div>
					) : (
						<table className="data-table">
							<thead>
								<tr>
									<th className="num">#</th>
									<th>Player</th>
									<th className="num">Retired</th>
									<th>Note</th>
								</tr>
							</thead>
							<tbody>
								{retired.map((r: any, i: number) => (
									<tr key={i}>
										<td className="num">
											<strong>{r.number}</strong>
										</td>
										<td>
											{r.pid != null ? (
												<button
													type="button"
													className="player-link"
													onClick={() => openPlayer(r.pid)}
												>
													{r.firstName} {r.lastName}
												</button>
											) : (
												r.text ?? "—"
											)}
										</td>
										<td className="num">{r.seasonRetired ?? "—"}</td>
										<td className="muted">{r.text ?? ""}</td>
									</tr>
								))}
							</tbody>
						</table>
					)}
				</div>
			</section>

			<section className="panel">
				<div className="panel-header">
					<span>Hall of Fame</span>
					<span className="pill">{players.length} inductees</span>
				</div>
				<div className="panel-body" style={{ padding: 0 }}>
					{players.length === 0 ? (
						<div className="empty" style={{ padding: 20 }}>
							No Hall of Famers yet — keep simming seasons.
						</div>
					) : (
						<table className="data-table">
							<thead>
								<tr>
									<th>Pos</th>
									<th>Player</th>
									<th className="num">Peak Ovr</th>
									<th className="num">Seasons</th>
								</tr>
							</thead>
							<tbody>
								{players.slice(0, 100).map((p: any) => (
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
												p.bestOvr ?? p.ratings?.ovr,
												"ovr",
											)}
										</td>
										<td className="num">
											{p.stats?.length ?? p.numSeasons ?? "—"}
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
