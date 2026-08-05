import { helpers } from "../../util/helpers.ts";
import type { View } from "../../../common/types.ts";

const TeamStats = ({
	teamStats,
}: Pick<View<"leagueDashboard">, "teamStats">) => (
	<div className="nba-stat-list mb-3">
		{teamStats.map((teamStat) => (
			<div key={teamStat.stat} className="nba-stat-row">
				<span>{teamStat.name}</span>
				<strong>
					{helpers.roundStat(teamStat.value, teamStat.stat)}{" "}
					<em>({helpers.ordinal(teamStat.rank)})</em>
				</strong>
			</div>
		))}
	</div>
);

export default TeamStats;
