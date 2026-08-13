import { useEffect, useMemo, useState } from "react";
import {
	COLLEGE_CONFERENCES,
	COLLEGE_TEAMS,
	collegeTeamCount,
} from "../../common/college/d1Data.ts";
import { toWorker } from "../util/toWorker.ts";
import { useDesktopStore } from "../store.ts";

const phaseLabel = (phase: string) =>
	({
		preseason: "Preseason",
		regular: "Regular Season",
		confTournaments: "Conference Tournaments",
		selectionSunday: "Selection Sunday",
		firstFour: "First Four",
		round64: "Round of 64",
		round32: "Round of 32",
		sweet16: "Sweet 16",
		elite8: "Elite 8",
		finalFour: "Final Four",
		championship: "National Championship",
		postTournament: "Season Complete",
		offseason: "Offseason",
	})[phase] ?? phase;

const BRACKET_ROUNDS = [
	"Round of 64",
	"Round of 32",
	"Sweet 16",
	"Elite 8",
	"Final Four",
	"Championship",
] as const;

type BracketGame = {
	round: string;
	homeTid: number;
	awayTid: number;
	homeName: string;
	awayName: string;
	homeSeed: number;
	awaySeed: number;
	homeScore?: number;
	awayScore?: number;
	winnerTid?: number;
};

const BracketSlot = ({
	seed,
	name,
	score,
	won,
}: {
	seed?: number;
	name?: string;
	score?: number;
	won?: boolean;
}) => (
	<div
		className={`madness-slot${won ? " madness-slot-won" : ""}`}
		style={{ opacity: name ? 1 : 0.45 }}
	>
		<span className="madness-seed">{seed ?? "—"}</span>
		<span className="madness-name">{name ?? "TBD"}</span>
		<span className="madness-score">
			{score != null ? score : name ? "" : ""}
		</span>
	</div>
);

const MadnessBracket = ({
	games,
	champion,
}: {
	games: BracketGame[];
	champion?: string;
}) => {
	const byRound = useMemo(() => {
		const map = new Map<string, BracketGame[]>();
		for (const r of BRACKET_ROUNDS) {
			map.set(
				r,
				games.filter((g) => g.round === r),
			);
		}
		return map;
	}, [games]);

	const firstFour = games.filter((g) => g.round === "First Four");

	return (
		<div className="madness-wrap">
			{firstFour.length > 0 ? (
				<div className="madness-ff">
					<strong>First Four</strong>
					<div className="madness-ff-games">
						{firstFour.map((g, i) => (
							<div key={i} className="madness-matchup">
								<BracketSlot
									seed={g.awaySeed}
									name={g.awayName}
									score={g.awayScore}
									won={g.winnerTid === g.awayTid}
								/>
								<BracketSlot
									seed={g.homeSeed}
									name={g.homeName}
									score={g.homeScore}
									won={g.winnerTid === g.homeTid}
								/>
							</div>
						))}
					</div>
				</div>
			) : null}
			<div className="madness-bracket">
				{BRACKET_ROUNDS.map((round) => {
					const roundGames = byRound.get(round) ?? [];
					if (roundGames.length === 0 && round !== "Championship") {
						return null;
					}
					return (
						<div key={round} className="madness-round">
							<div className="madness-round-title">{round}</div>
							<div className="madness-round-games">
								{(roundGames.length > 0
									? roundGames
									: [undefined]
								).map((g, i) =>
									g ? (
										<div key={i} className="madness-matchup">
											<BracketSlot
												seed={g.awaySeed}
												name={g.awayName}
												score={g.awayScore}
												won={g.winnerTid === g.awayTid}
											/>
											<BracketSlot
												seed={g.homeSeed}
												name={g.homeName}
												score={g.homeScore}
												won={g.winnerTid === g.homeTid}
											/>
										</div>
									) : (
										<div key={i} className="madness-matchup">
											<BracketSlot />
											<BracketSlot />
										</div>
									),
								)}
							</div>
						</div>
					);
				})}
			</div>
			{champion ? (
				<div className="madness-champion">
					National Champion: <strong>{champion}</strong>
				</div>
			) : null}
		</div>
	);
};

export const College = () => {
	const revision = useDesktopStore((s) => s.revision);
	const setView = useDesktopStore((s) => s.setView);
	const setCollegeTid = useDesktopStore((s) => s.setCollegeTid);
	const [cid, setCid] = useState(COLLEGE_CONFERENCES[0]?.cid ?? 0);
	const [live, setLive] = useState<any>();

	const teams = useMemo(
		() => COLLEGE_TEAMS.filter((t) => t.cid === cid),
		[cid],
	);
	const conf = COLLEGE_CONFERENCES.find((c) => c.cid === cid);

	useEffect(() => {
		void toWorker("main", "getCollegeUniverse", undefined)
			.then(setLive)
			.catch(console.error);
	}, [revision]);

	return (
		<>
			<h1 className="page-title">College Universe</h1>
			<p className="page-sub">
				Full D1 footprint. Click a school to open its roster. Games sim
				alongside every pro Play/Sim day.
			</p>

			<div className="college-banner">
				<div>
					<strong>
						{live?.dateString ?? `${collegeTeamCount} D1 programs`}
					</strong>
					<div className="muted">
						{collegeTeamCount} programs · {COLLEGE_CONFERENCES.length}{" "}
						conferences
						{live
							? ` · ${phaseLabel(live.phase)} · ${live.committedCount ?? 0} HS commits`
							: ""}
						{live?.champion ? ` · National Champion: ${live.champion}` : ""}
					</div>
				</div>
				<button
					type="button"
					className="btn btn-primary"
					onClick={() => setView("hsRankings")}
				>
					HS Top 100
				</button>
			</div>

			{live?.bracket?.length || live?.bracketFieldSize ? (
				<section className="panel" style={{ marginBottom: 14 }}>
					<div className="panel-header">
						<span>March Madness Bracket</span>
						<span className="pill">
							{live.bracketFieldSize ?? 68}-team field
						</span>
					</div>
					<div className="panel-body" style={{ padding: 12 }}>
						{live.bracket?.length ? (
							<MadnessBracket
								games={live.bracket}
								champion={live.champion}
							/>
						) : (
							<div className="empty">
								Field is set — bracket games appear as the tournament
								advances.
							</div>
						)}
					</div>
				</section>
			) : null}

			{live?.recentResults?.length ? (
				<section className="panel" style={{ marginBottom: 14 }}>
					<div className="panel-header">Recent College Results</div>
					<div className="panel-body" style={{ padding: 0 }}>
						<table className="data-table">
							<thead>
								<tr>
									<th>Away</th>
									<th className="num">Score</th>
									<th>Home</th>
								</tr>
							</thead>
							<tbody>
								{live.recentResults.slice(0, 12).map((g: any, i: number) => (
									<tr key={i}>
										<td>{g.awayName}</td>
										<td className="num">
											{g.awayScore}-{g.homeScore}
										</td>
										<td>{g.homeName}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</section>
			) : null}

			<div className="grid-2">
				<section className="panel">
					<div className="panel-header">Conferences</div>
					<div
						className="panel-body"
						style={{ padding: 0, maxHeight: 520, overflow: "auto" }}
					>
						<table className="data-table">
							<thead>
								<tr>
									<th>Conference</th>
									<th className="num">Teams</th>
								</tr>
							</thead>
							<tbody>
								{COLLEGE_CONFERENCES.map((c) => (
									<tr
										key={c.cid}
										style={{
											cursor: "pointer",
											background:
												c.cid === cid ? "rgba(240,160,48,0.12)" : undefined,
										}}
										onClick={() => setCid(c.cid)}
									>
										<td>{c.name}</td>
										<td className="num">
											{COLLEGE_TEAMS.filter((t) => t.cid === c.cid).length}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</section>

				<section className="panel">
					<div className="panel-header">{conf?.name ?? "Teams"}</div>
					<div
						className="panel-body"
						style={{ padding: 0, maxHeight: 520, overflow: "auto" }}
					>
						<table className="data-table">
							<thead>
								<tr>
									<th>School</th>
									<th>Nickname</th>
									<th>Abbrev</th>
								</tr>
							</thead>
							<tbody>
								{teams.map((t) => (
									<tr
										key={t.tid}
										style={{ cursor: "pointer" }}
										onClick={() => {
											setCollegeTid(t.tid);
											setView("collegeTeam");
										}}
									>
										<td className="team-user">{t.region}</td>
										<td>{t.name}</td>
										<td>{t.abbrev}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</section>
			</div>
		</>
	);
};
