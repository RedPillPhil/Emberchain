import { helpers } from "../../util/helpers.ts";
import type { View } from "../../../common/types.ts";
import { bySport } from "../../../common/sportFunctions.ts";
import { PlayerNameLabels } from "../../components/PlayerNameLabels.tsx";

const Leader = ({
	abbrev,
	firstName,
	firstNameShort,
	lastName,
	pid,
	stat,
	tid,
	value,
}: {
	abbrev?: string;
	firstName: string;
	firstNameShort: string;
	lastName: string;
	pid: number;
	stat: string;
	tid?: number;
	value: number;
}) => {
	const numberToDisplay = bySport({
		baseball: helpers.numberWithCommas(value),
		basketball: helpers.roundStat(value, stat),
		football: helpers.numberWithCommas(value),
		hockey: helpers.numberWithCommas(value),
	});

	return (
		<>
			<PlayerNameLabels
				pid={pid}
				firstName={firstName}
				firstNameShort={firstNameShort}
				lastName={lastName}
			/>
			{abbrev && tid !== undefined ? (
				<>
					{" "}
					<a href={helpers.leagueUrl(["roster", `${abbrev}_${tid}`])}>
						{abbrev}
					</a>
				</>
			) : null}{" "}
			{numberToDisplay} {stat}
			<br />
		</>
	);
};

const Leaders = ({
	leagueLeaders,
	teamLeaders,
}: Pick<View<"leagueDashboard">, "leagueLeaders" | "teamLeaders">) => (
	<div className="nba-leaders">
		<div className="nba-leaders-block">
			<h3>Team</h3>
			{teamLeaders.map((leader) => (
				<div key={leader.stat} className="nba-leader-row">
					<Leader {...leader} />
				</div>
			))}
		</div>
		<div className="nba-leaders-block">
			<h3>League</h3>
			{leagueLeaders.map((leader) => (
				<div key={leader.stat} className="nba-leader-row">
					<Leader {...leader} />
				</div>
			))}
		</div>
	</div>
);

export default Leaders;
