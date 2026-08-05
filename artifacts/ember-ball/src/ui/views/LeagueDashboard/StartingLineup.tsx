import { PlayerPicture } from "../../components/PlayerPicture.tsx";
import { helpers } from "../../util/helpers.ts";
import type { View } from "../../../common/types.ts";
import { DEPTH_CHART_NAME } from "../../../common/constants.ts";
import { isSport } from "../../../common/sportFunctions.ts";
import { useLocal } from "../../util/local.ts";
import { getHeightString } from "../../components/Height.tsx";
import { Weight } from "../../components/Weight.tsx";

const posLabel = (pos: string) => {
	const map: Record<string, string> = {
		G: "GUARD",
		PG: "POINT GUARD",
		SG: "SHOOTING GUARD",
		GF: "GUARD/FORWARD",
		F: "FORWARD",
		SF: "SMALL FORWARD",
		PF: "POWER FORWARD",
		FC: "FORWARD/CENTER",
		C: "CENTER",
	};
	return map[pos] ?? pos.toUpperCase();
};

const StartingLineup = ({
	numPlayersOnCourt,
	starters,
	teams,
}: Pick<
	View<"leagueDashboard">,
	"numPlayersOnCourt" | "starters" | "startersStats" | "teams"
>) => {
	const { season, units, userTid } = useLocal([
		"season",
		"units",
		"userTid",
	]);

	const team = teams.find((t: any) => t.tid === userTid);
	const colors = team?.colors;
	const jersey = team?.jersey;

	const title =
		(isSport("basketball") && numPlayersOnCourt >= starters.length) ||
		(isSport("hockey") && numPlayersOnCourt === starters.length)
			? "Starting Lineup"
			: "Top Players";

	return (
		<section className="nba-lineup">
			<div className="nba-section-head">
				<h2>{title}</h2>
				{DEPTH_CHART_NAME ? (
					<a href={helpers.leagueUrl(["depth"])}>{DEPTH_CHART_NAME} →</a>
				) : (
					<a href={helpers.leagueUrl(["roster"])}>Full Roster →</a>
				)}
			</div>

			<div className="nba-player-grid">
				{starters.map((p) => {
					const expYears = Math.max(
						0,
						season - (p.draft?.year ?? season),
					);
					const expLabel =
						expYears <= 0 ? "R" : `${expYears} YR${expYears === 1 ? "" : "S"}`;
					const number = p.jerseyNumber || "--";

					return (
						<a
							key={p.pid}
							href={helpers.leagueUrl(["player", p.pid])}
							className="nba-player-card"
						>
							<div className="nba-player-card-top">
								<div className="nba-player-number">{number}</div>
								<div className="nba-player-face">
									<PlayerPicture
										face={p.face}
										imgURL={p.imgURL}
										colors={colors}
										jersey={jersey}
										lazy
									/>
								</div>
							</div>
							<div className="nba-player-card-body">
								<div className="nba-player-meta">
									<div>
										<span>AGE</span>
										<strong>{p.age}</strong>
									</div>
									<div>
										<span>EXP</span>
										<strong>{expLabel}</strong>
									</div>
									<div>
										<span>HT</span>
										<strong>{getHeightString(p.hgt, units)}</strong>
									</div>
									<div>
										<span>WT</span>
										<strong>
											<Weight pounds={p.weight} />
										</strong>
									</div>
									<div>
										<span>OVR</span>
										<strong>{p.ratings.ovr}</strong>
									</div>
								</div>
								<div className="nba-player-id">
									<div className="nba-player-first">
										{p.firstName.toUpperCase()}
									</div>
									<div className="nba-player-last">
										{p.lastName.toUpperCase()}
									</div>
									<div className="nba-player-pos">
										{posLabel(p.ratings.pos)}
									</div>
								</div>
							</div>
						</a>
					);
				})}
			</div>
		</section>
	);
};

export default StartingLineup;
