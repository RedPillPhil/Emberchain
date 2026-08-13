import { useEffect, useMemo, useState } from "react";
import { runBeforeView } from "../util/league.ts";
import { useDesktopStore } from "../store.ts";
import { TeamLink } from "../components/TeamLink.tsx";
import {
	formatShortDate,
	proMilestoneList,
	scheduleDayLabel,
} from "../util/proCalendar.ts";

const teamLabel = (t: any) => {
	if (!t) {
		return "???";
	}
	if (t.region && t.name) {
		return `${t.region} ${t.name}`;
	}
	return t.abbrev || t.region || t.name || `Team ${t.tid}`;
};

const OppLink = ({ t }: { t: any }) => (
	<TeamLink tid={t?.tid}>{teamLabel(t)}</TeamLink>
);

export const Schedule = () => {
	const revision = useDesktopStore((s) => s.revision);
	const openBoxScore = useDesktopStore((s) => s.openBoxScore);
	const userTid = useDesktopStore((s) => s.local.userTid);
	const [data, setData] = useState<any>(null);

	useEffect(() => {
		void runBeforeView("schedule", {})
			.then(setData)
			.catch(console.error);
	}, [revision]);

	const season = data?.season ?? new Date().getFullYear();
	const tid = data?.tid ?? userTid ?? 0;
	const upcoming = data?.upcoming ?? [];
	const completed = data?.completed ?? [];
	const milestones = useMemo(() => proMilestoneList(season), [season]);

	return (
		<>
			<h1 className="page-title">Team Schedule</h1>
			<p className="page-sub">
				Results and upcoming games on an NBA-style calendar (Opening Night Oct
				20 → mid-April). Click a final for the box score. Rest days between
				your games are normal — real NBA pacing, not one game every night.
			</p>

			<section className="panel" style={{ marginBottom: 16 }}>
				<div className="panel-header">
					<span>League Calendar</span>
					<span className="pill">Key dates · {season}-{season + 1}</span>
				</div>
				<div className="panel-body" style={{ padding: 0 }}>
					<table className="data-table">
						<thead>
							<tr>
								<th>Date</th>
								<th>Milestone</th>
							</tr>
						</thead>
						<tbody>
							{milestones.map((m) => (
								<tr key={m.key}>
									<td>{formatShortDate(m.date)}</td>
									<td>
										{m.label}
										{m.key === "allStarGame" ? (
											<span className="pill" style={{ marginLeft: 8 }}>
												midseason
											</span>
										) : null}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</section>

			<div className="grid-2">
				<section className="panel">
					<div className="panel-header">
						<span>Upcoming</span>
						<span className="pill">{upcoming.length} left</span>
					</div>
					<div className="panel-body" style={{ padding: 0 }}>
						<table className="data-table">
							<thead>
								<tr>
									<th>Date</th>
									<th>Matchup</th>
									<th>Loc</th>
									<th className="num">Rest</th>
								</tr>
							</thead>
							<tbody>
								{upcoming.length === 0 ? (
									<tr>
										<td colSpan={4} className="empty">
											No upcoming games — start the regular season with Play,
											or the season is over.
										</td>
									</tr>
								) : (
									upcoming.map((g: any, i: number) => {
										const home = g.teams?.[0];
										const away = g.teams?.[1];
										const isHome = home?.tid === tid;
										const opp = isHome ? away : home;
										const prevDay =
											i > 0 ? upcoming[i - 1]?.day : completed[0]?.day;
										const rest =
											typeof g.day === "number" && typeof prevDay === "number"
												? Math.max(0, g.day - prevDay - 1)
												: "—";
										return (
											<tr key={g.gid ?? i}>
												<td>{scheduleDayLabel(season, g.day)}</td>
												<td>
													{isHome ? "vs" : "@"} <OppLink t={opp} />
													{g.finals ? (
														<span className="pill" style={{ marginLeft: 6 }}>
															Finals
														</span>
													) : null}
												</td>
												<td>{isHome ? "Home" : "Away"}</td>
												<td className="num">
													{rest === 0
														? "B2B"
														: typeof rest === "number"
															? `${rest}d`
															: rest}
												</td>
											</tr>
										);
									})
								)}
							</tbody>
						</table>
					</div>
				</section>

				<section className="panel">
					<div className="panel-header">
						<span>Results</span>
						<span className="pill">{completed.length} played</span>
					</div>
					<div className="panel-body" style={{ padding: 0 }}>
						<table className="data-table">
							<thead>
								<tr>
									<th>Date</th>
									<th>Matchup</th>
									<th className="num">Score</th>
									<th></th>
								</tr>
							</thead>
							<tbody>
								{completed.length === 0 ? (
									<tr>
										<td colSpan={4} className="empty">
											No completed games yet. Hit Play to sim a game day.
										</td>
									</tr>
								) : (
									completed.map((g: any) => {
										const t0 = g.teams?.[0];
										const t1 = g.teams?.[1];
										const userIs0 = t0?.tid === tid;
										const userTeam = userIs0 ? t0 : t1;
										const opp = userIs0 ? t1 : t0;
										const userPts = userTeam?.pts ?? 0;
										const oppPts = opp?.pts ?? 0;
										const won = userPts > oppPts;
										// Stored games: teams[0] is home
										const loc = t0?.tid === tid ? "vs" : "@";
										return (
											<tr key={g.gid}>
												<td>{scheduleDayLabel(season, g.day)}</td>
												<td>
													{loc} <OppLink t={opp} />
													{g.teams?.[0]?.tid < 0 || g.teams?.[1]?.tid < 0 ? (
														<span className="pill" style={{ marginLeft: 6 }}>
															ASG
														</span>
													) : null}
												</td>
												<td className="num">
													<span
														style={{
															color: won ? "var(--green)" : "var(--red)",
															fontWeight: 700,
														}}
													>
														{won ? "W" : "L"}
													</span>{" "}
													{userPts}–{oppPts}
												</td>
												<td>
													<button
														type="button"
														className="btn btn-ghost"
														style={{
															minHeight: 26,
															fontSize: 12,
															padding: "2px 8px",
														}}
														onClick={() => openBoxScore(g.gid)}
													>
														Box
													</button>
												</td>
											</tr>
										);
									})
								)}
							</tbody>
						</table>
					</div>
				</section>
			</div>
		</>
	);
};
