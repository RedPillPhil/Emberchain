import useTitleBar from "../../hooks/useTitleBar.tsx";
import { helpers } from "../../util/helpers.ts";
import { PlayoffMatchup } from "../../components/PlayoffMatchup.tsx";
import Leaders from "./Leaders.tsx";
import Standings from "./Standings.tsx";
import StartingLineup from "./StartingLineup.tsx";
import TeamStats from "./TeamStats.tsx";
import type { View } from "../../../common/types.ts";
import Headlines from "./Headlines.tsx";
import { useLocal } from "../../util/local.ts";
import {
	OFFICIAL_LAUNCH_HEADLINES,
	generateHeadlinesFromPlayers,
} from "../../../common/headlines.ts";
import { useMemo, useEffect } from "react";
import { toWorker } from "../../util/toWorker.ts";

const LeagueDashboard = ({
	att,
	cash,
	confOrAllTeams,
	events,
	leagueLeaders,
	lost,
	maxPlayoffSeed,
	maxPlayoffSeedNoPlayIn,
	messages,
	name,
	numGamesToWinSeries,
	numPlayersOnCourt,
	otl,
	payroll,
	playoffRoundsWon,
	playoffsByConf,
	pointsFormula,
	profit,
	rank,
	region,
	revenue,
	roundsWonText,
	series,
	seriesTitle,
	showPlayoffSeries,
	starters,
	startersStats,
	teamLeaders,
	teamStats,
	teams,
	tied,
	usePts,
	won,
}: View<"leagueDashboard">) => {
	useTitleBar({ title: `${region} ${name}` });

	const { luxuryPayroll, salaryCap, salaryCapType, season, userTid } = useLocal(
		["luxuryPayroll", "salaryCap", "salaryCapType", "season", "userTid"],
	);

	useEffect(() => {
		void toWorker("main", "syncTeamNicknamesFromInfos", undefined);
	}, []);

	const deskStories = useMemo(() => {
		const fromStarters = generateHeadlinesFromPlayers(
			(starters ?? []).map((p: any) => ({
				name: `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim(),
				pos: p.ratings?.pos,
				age: p.age,
				ovr: p.ratings?.ovr,
				pot: p.ratings?.pot,
				team: `${region} ${name}`,
			})),
			season,
			6,
		);
		return [...OFFICIAL_LAUNCH_HEADLINES.slice(0, 4), ...fromStarters].slice(
			0,
			12,
		);
	}, [starters, season, region, name]);

	const gp = won + lost + otl + tied;
	const winp = gp > 0 ? won / Math.max(1, won + lost) : 0;

	return (
		<div className="nba-dash">
			<header className="nba-dash-hero">
				<div className="nba-dash-hero-copy">
					<div className="nba-dash-kicker">{season} SEASON</div>
					<h1>
						{region} {name}
					</h1>
					<div className="nba-dash-record-row">
						<span className="nba-dash-record">
							{won}-{lost}
							{otl > 0 ? `-${otl}` : ""}
							{tied > 0 ? `-${tied}` : ""}
						</span>
						<span className="nba-dash-sep">·</span>
						<span>
							{winp.toFixed(3).replace(/^0/, "")} WIN%
						</span>
						<span className="nba-dash-sep">·</span>
						<span>
							{playoffRoundsWon < 0
								? `${helpers.ordinal(rank)} in ${playoffsByConf !== false ? "conference" : "league"}`
								: roundsWonText}
						</span>
					</div>
				</div>
				<div className="nba-dash-hero-stats">
					<div>
						<span>ATT</span>
						<strong>{helpers.numberWithCommas(Math.round(att))}</strong>
					</div>
					<div>
						<span>REV</span>
						<strong>{helpers.formatCurrency(revenue, "M")}</strong>
					</div>
					<div>
						<span>PAYROLL</span>
						<strong>{helpers.formatCurrency(payroll / 1000, "M")}</strong>
					</div>
					<div>
						<span>
							{salaryCapType === "none" ? "LUX TAX" : "CAP"}
						</span>
						<strong>
							{helpers.formatCurrency(
								(salaryCapType === "none" ? luxuryPayroll : salaryCap) / 1000,
								"M",
							)}
						</strong>
					</div>
				</div>
			</header>

			<div className="nba-dash-stories">
				{deskStories.slice(0, 4).map((story) => (
					<article key={story.id} className="nba-dash-story">
						<div className="nba-dash-story-tag">{story.tag}</div>
						<h3>{story.headline}</h3>
						<p>{story.byline}</p>
					</article>
				))}
			</div>

			<div className="nba-dash-grid">
				<div className="nba-dash-main">
					{showPlayoffSeries && series ? (
						<section className="nba-panel mb-3">
							<div className="nba-section-head">
								<h2>{seriesTitle}</h2>
								<a href={helpers.leagueUrl(["playoffs"])}>Playoffs →</a>
							</div>
							<PlayoffMatchup
								expandTeamNames
								numGamesToWinSeries={numGamesToWinSeries}
								season={season}
								// @ts-expect-error
								series={series}
								userTid={userTid}
							/>
						</section>
					) : null}

					<Standings
						confOrAllTeams={confOrAllTeams}
						maxPlayoffSeed={maxPlayoffSeed}
						maxPlayoffSeedNoPlayIn={maxPlayoffSeedNoPlayIn}
						playoffsByConf={playoffsByConf}
						pointsFormula={pointsFormula}
						usePts={usePts}
						userTid={userTid}
					/>

					<div className="nba-dash-widgets">
						<section className="nba-panel">
							<div className="nba-section-head">
								<h2>Leaders</h2>
								<a href={helpers.leagueUrl(["leaders"])}>All →</a>
							</div>
							<Leaders
								leagueLeaders={leagueLeaders}
								teamLeaders={teamLeaders}
							/>
						</section>

						<section className="nba-panel">
							<div className="nba-section-head">
								<h2>Team Snapshot</h2>
								<a href={helpers.leagueUrl(["team_stats"])}>Stats →</a>
							</div>
							<TeamStats teamStats={teamStats} />
							<div className="nba-finance-strip">
								<div>
									<span>Cash</span>
									<strong>{helpers.formatCurrency(cash / 1000, "M")}</strong>
								</div>
								<div>
									<span>Profit</span>
									<strong>{helpers.formatCurrency(profit, "M")}</strong>
								</div>
								<div>
									<span>Inbox</span>
									<strong>
										{messages.length === 0 ? (
											"Clear"
										) : (
											<a href={helpers.leagueUrl(["inbox"])}>
												{messages.length}
											</a>
										)}
									</strong>
								</div>
							</div>
						</section>
					</div>

					<StartingLineup
						numPlayersOnCourt={numPlayersOnCourt}
						starters={starters}
						startersStats={startersStats}
						teams={teams}
					/>
				</div>

				<aside className="nba-dash-rail">
					<section className="nba-panel nba-panel-rail">
						<div className="nba-section-head">
							<h2>Headlines</h2>
						</div>
						{deskStories.map((story) => (
							<div className="nba-rail-item" key={`rail-${story.id}`}>
								<div className="nba-rail-tag">{story.tag}</div>
								<div className="nba-rail-headline">{story.headline}</div>
								<div className="nba-rail-byline">{story.byline}</div>
							</div>
						))}
						<a className="nba-rail-more" href={helpers.leagueUrl(["news"])}>
							News Feed →
						</a>
					</section>

					<section className="nba-panel nba-panel-rail mt-3 d-none d-xl-block">
						<div className="nba-section-head">
							<h2>League Wire</h2>
						</div>
						<Headlines
							events={events}
							season={season}
							teams={teams}
							userTid={userTid}
						/>
					</section>
				</aside>
			</div>
		</div>
	);
};

export default LeagueDashboard;
