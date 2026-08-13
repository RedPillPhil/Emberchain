import { Shell } from "./components/Shell.tsx";
import { useDesktopStore } from "./store.ts";
import { Home } from "./views/Home.tsx";
import { Dashboard } from "./views/Dashboard.tsx";
import { Roster } from "./views/Roster.tsx";
import { Standings } from "./views/Standings.tsx";
import { Schedule } from "./views/Schedule.tsx";
import { BoxScore } from "./views/BoxScore.tsx";
import { LiveGame } from "./views/LiveGame.tsx";
import { Playoffs } from "./views/Playoffs.tsx";
import { DraftLottery } from "./views/DraftLottery.tsx";
import { DraftRoom } from "./views/DraftRoom.tsx";
import { ReSign } from "./views/ReSign.tsx";
import { College } from "./views/College.tsx";
import { CollegeTeam } from "./views/CollegeTeam.tsx";
import { HsRankings } from "./views/HsRankings.tsx";
import { PlayerStats } from "./views/PlayerStats.tsx";
import { FreeAgents } from "./views/FreeAgents.tsx";
import { Leaders } from "./views/Leaders.tsx";
import { Awards } from "./views/Awards.tsx";
import { PlayerPage } from "./views/PlayerPage.tsx";
import { ProspectPage } from "./views/ProspectPage.tsx";
import { DraftClasses } from "./views/DraftClasses.tsx";
import { Staff } from "./views/Staff.tsx";
import { TrainingCamp } from "./views/TrainingCamp.tsx";
import { Progression } from "./views/Progression.tsx";
import { Trade } from "./views/Trade.tsx";
import { Finances } from "./views/Finances.tsx";
import { Transactions } from "./views/Transactions.tsx";
import { HallOfFame } from "./views/HallOfFame.tsx";
import { CountryFreeAgents } from "./views/CountryFreeAgents.tsx";
import { CryptoHome } from "./views/CryptoHome.tsx";
import { NoTeamOwned } from "./views/NoTeamOwned.tsx";
import { TEAM_OWNED_VIEWS } from "./store.ts";

export const App = () => {
	const lid = useDesktopStore((s) => s.lid);
	const view = useDesktopStore((s) => s.view);
	const cryptoMode = useDesktopStore((s) => s.cryptoMode);
	const claimedTeam = useDesktopStore((s) => s.claimedTeam);
	const rosterTid = useDesktopStore((s) => s.rosterTid);

	if (lid === undefined) {
		return cryptoMode ? <CryptoHome /> : <Home />;
	}

	// Team Menu pages need a claim. Public roster peek (openTeam) still allowed.
	const blockTeamOffice =
		cryptoMode &&
		!claimedTeam &&
		TEAM_OWNED_VIEWS.has(view) &&
		!(view === "roster" && rosterTid != null);
	if (blockTeamOffice) {
		return (
			<Shell>
				<NoTeamOwned />
			</Shell>
		);
	}

	let body;
	switch (view) {
		case "dashboard":
			body = cryptoMode ? <CryptoHome /> : <Dashboard />;
			break;
		case "noTeamOwned":
			body = <NoTeamOwned />;
			break;
		case "roster":
			body = <Roster />;
			break;
		case "standings":
			body = <Standings />;
			break;
		case "schedule":
			body = <Schedule />;
			break;
		case "boxScore":
			body = <BoxScore />;
			break;
		case "liveGame":
			body = <LiveGame />;
			break;
		case "playoffs":
			body = <Playoffs />;
			break;
		case "draftLottery":
			body = <DraftLottery />;
			break;
		case "draftRoom":
			body = <DraftRoom />;
			break;
		case "resign":
			body = <ReSign />;
			break;
		case "playerStats":
			body = <PlayerStats />;
			break;
		case "freeAgents":
			body = <FreeAgents />;
			break;
		case "leaders":
			body = <Leaders />;
			break;
		case "awards":
			body = <Awards />;
			break;
		case "college":
			body = <College />;
			break;
		case "collegeTeam":
			body = <CollegeTeam />;
			break;
		case "hsRankings":
			body = <HsRankings />;
			break;
		case "player":
			body = <PlayerPage />;
			break;
		case "prospect":
			body = <ProspectPage />;
			break;
		case "staff":
			body = <Staff />;
			break;
		case "trainingCamp":
			body = <TrainingCamp />;
			break;
		case "progression":
			body = <Progression />;
			break;
		case "finances":
			body = <Finances />;
			break;
		case "transactions":
			body = <Transactions />;
			break;
		case "hallOfFame":
			body = <HallOfFame />;
			break;
		case "countryFreeAgents":
			body = <CountryFreeAgents />;
			break;
		case "draft":
			body = <DraftClasses />;
			break;
		case "trade":
			body = <Trade />;
			break;
		default:
			body = cryptoMode ? <CryptoHome /> : <Dashboard />;
	}

	return <Shell>{body}</Shell>;
};
