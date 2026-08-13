import { useEffect, useState } from "react";
import { runBeforeView } from "../util/league.ts";
import { useDesktopStore } from "../store.ts";
import { formatShortDate, proMilestoneList } from "../util/proCalendar.ts";

const MIN_GAMES_HINT = 15;

export const Awards = () => {
	const revision = useDesktopStore((s) => s.revision);
	const openPlayer = useDesktopStore((s) => s.openPlayer);
	const season = useDesktopStore((s) => s.local.season);
	const [data, setData] = useState<any>(null);

	useEffect(() => {
		void runBeforeView("awardRaces", {
			season: season != null ? String(season) : undefined,
		})
			.then(setData)
			.catch(console.error);
	}, [revision, season]);

	const candidates = data?.awardCandidates ?? [];
	const teams = data?.teams ?? [];
	const yr = data?.season ?? season ?? new Date().getFullYear();
	const allStar = proMilestoneList(yr).find((m) => m.key === "allStarGame");

	// Rough games played from best team record
	const maxGp = teams.reduce(
		(n: number, t: any) =>
			Math.max(n, (t.seasonAttrs?.won ?? 0) + (t.seasonAttrs?.lost ?? 0)),
		0,
	);
	const early = maxGp > 0 && maxGp < MIN_GAMES_HINT;

	return (
		<>
			<h1 className="page-title">Award Races</h1>
			<p className="page-sub">
				MVP, Rookie of the Year, Defensive Player of the Year, Sixth Man, and
				Most Improved — live standings. Meaningful after ~{MIN_GAMES_HINT}{" "}
				games. All-Star Game is midseason
				{allStar ? ` (${formatShortDate(allStar.date)})` : ""}; the engine
				inserts it at ~70% of the schedule.
			</p>

			{early ? (
				<div className="status-bar" style={{ marginBottom: 14 }}>
					Only {maxGp} games into the season — races will stabilize after ~
					{MIN_GAMES_HINT} games. Early leaders can swing hard.
				</div>
			) : null}

			{candidates.length === 0 ? (
				<div className="empty">
					No award candidates yet. Start the regular season and sim some games.
				</div>
			) : (
				<div className="grid-2">
					{candidates.map((race: any) => (
						<section className="panel" key={race.name}>
							<div className="panel-header">
								<span>{race.name}</span>
								{race.asterisk ? (
									<span className="pill" title={race.asterisk}>
										*
									</span>
								) : null}
							</div>
							<div className="panel-body" style={{ padding: 0 }}>
								<table className="data-table">
									<thead>
										<tr>
											<th>#</th>
											<th>Player</th>
											<th>Team</th>
											{(race.stats ?? []).map((s: string) => (
												<th key={s} className="num">
													{s.toUpperCase()}
												</th>
											))}
										</tr>
									</thead>
									<tbody>
										{(race.players ?? []).slice(0, 10).map((p: any, i: number) => {
											const ps = p.currentStats ?? {};
											const abbrev = ps.abbrev ?? "—";
											return (
												<tr key={p.pid ?? i}>
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
													<td>{abbrev}</td>
													{(race.stats ?? []).map((s: string) => (
														<td key={s} className="num">
															{typeof ps[s] === "number"
																? Number(ps[s]).toFixed(1)
																: (ps[s] ?? "—")}
														</td>
													))}
												</tr>
											);
										})}
										{(race.players ?? []).length === 0 ? (
											<tr>
												<td
													colSpan={3 + (race.stats?.length ?? 0)}
													className="empty"
												>
													No candidates yet.
												</td>
											</tr>
										) : null}
									</tbody>
								</table>
							</div>
						</section>
					))}
				</div>
			)}
		</>
	);
};
