import clsx from "clsx";
import { helpers } from "../../util/helpers.ts";
import { TeamLogoInline } from "../../components/TeamLogoInline.tsx";
import type { View } from "../../../common/types.ts";

const Standings = ({
	confOrAllTeams,
	maxPlayoffSeed,
	maxPlayoffSeedNoPlayIn,
	playoffsByConf,
	usePts,
	userTid,
}: Pick<
	View<"leagueDashboard">,
	| "confOrAllTeams"
	| "maxPlayoffSeed"
	| "maxPlayoffSeedNoPlayIn"
	| "playoffsByConf"
	| "pointsFormula"
	| "usePts"
> & {
	userTid: number;
}) => {
	return (
		<section className="nba-standings-panel">
			<div className="nba-section-head">
				<h2>{playoffsByConf ? "Eastern / Conference" : "Standings"}</h2>
				<a href={helpers.leagueUrl(["standings"])}>Full Standings →</a>
			</div>
			<div className="nba-standings-scroll">
				<table className="nba-standings-table">
					<thead>
						<tr>
							<th className="nba-standings-team">Team</th>
							<th>W</th>
							<th>L</th>
							<th>WIN%</th>
							<th>{usePts ? "PTS" : "GB"}</th>
						</tr>
					</thead>
					<tbody>
						{confOrAllTeams.map((t, i) => {
							const won = t.seasonAttrs.won;
							const lost = t.seasonAttrs.lost;
							const gp = won + lost + (t.seasonAttrs.tied ?? 0) + (t.seasonAttrs.otl ?? 0);
							const winp =
								gp > 0
									? (t.seasonAttrs.winp ?? won / Math.max(1, won + lost))
									: 0;

							return (
								<tr
									key={t.tid}
									className={clsx({
										"nba-standings-user": t.tid === userTid,
										"nba-standings-playin":
											i === maxPlayoffSeedNoPlayIn - 1 &&
											i < confOrAllTeams.length - 1,
										"nba-standings-cutoff":
											i === maxPlayoffSeed - 1 &&
											i < confOrAllTeams.length - 1,
									})}
								>
									<td className="nba-standings-team">
									<div className="nba-standings-team-inner">
										<span className="nba-standings-rank">{t.rank}</span>
										<TeamLogoInline
											imgURL={t.seasonAttrs.imgURL}
											imgURLSmall={t.seasonAttrs.imgURLSmall}
											size={22}
										/>
										<a
											href={helpers.leagueUrl([
												"roster",
												`${t.seasonAttrs.abbrev}_${t.tid}`,
											])}
										>
											{t.seasonAttrs.region}
										</a>
										{t.seasonAttrs.clinchedPlayoffs ? (
											<span className="nba-standings-clinch">
												{" "}
												- {t.seasonAttrs.clinchedPlayoffs}
											</span>
										) : null}
									</div>
								</td>
									<td>{won}</td>
									<td>{lost}</td>
									<td>{winp.toFixed(3).replace(/^0/, "")}</td>
									<td>
										{usePts
											? Math.round(t.seasonAttrs.pts)
											: t.gb === 0
												? "—"
												: t.gb}
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
		</section>
	);
};

export default Standings;
