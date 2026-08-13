import { useEffect, useState } from "react";
import { runBeforeView } from "../util/league.ts";
import { useDesktopStore } from "../store.ts";
import { TeamLink } from "../components/TeamLink.tsx";

const ROUND_NAMES: Record<number, string[]> = {
	4: ["First Round", "Conf Semifinals", "Conf Finals", "Finals"],
	3: ["First Round", "Semifinals", "Finals"],
	2: ["Semifinals", "Finals"],
	1: ["Finals"],
};

const teamLine = (
	t: any,
	opts: {
		userTid: number | undefined;
		needed: number;
		opponentWon: number | undefined;
		decided: boolean;
	},
) => {
	if (!t) {
		return (
			<div className="muted" style={{ padding: "4px 8px", fontSize: 12 }}>
				TBD
			</div>
		);
	}
	const isChampionOfSeries = opts.decided && (t.won ?? 0) >= opts.needed;
	const eliminated = opts.decided && !isChampionOfSeries;
	return (
		<div
			style={{
				display: "flex",
				justifyContent: "space-between",
				alignItems: "center",
				padding: "5px 8px",
				fontSize: 13,
				opacity: eliminated ? 0.45 : 1,
				background:
					t.tid === opts.userTid ? "rgba(94,155,255,0.10)" : undefined,
				fontWeight: isChampionOfSeries ? 600 : 400,
			}}
		>
			<span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
				<span className="muted" style={{ fontSize: 11, marginRight: 5 }}>
					{t.seed}
				</span>
				{t.pendingPlayIn ? (
					<span className="muted">Play-In winner</span>
				) : (
					<TeamLink tid={t.tid}>{t.region ?? t.abbrev}</TeamLink>
				)}
				{t.regularSeason ? (
					<span className="muted" style={{ fontSize: 11, marginLeft: 5 }}>
						{t.regularSeason.won}-{t.regularSeason.lost}
					</span>
				) : null}
			</span>
			<strong
				style={{
					fontSize: 15,
					color: isChampionOfSeries ? "#2fd67b" : undefined,
					marginLeft: 8,
				}}
			>
				{t.won ?? 0}
			</strong>
		</div>
	);
};

export const Playoffs = () => {
	const revision = useDesktopStore((s) => s.revision);
	const local = useDesktopStore((s) => s.local);
	const [data, setData] = useState<any>(null);

	useEffect(() => {
		void runBeforeView("playoffs", {}).then(setData).catch(console.error);
	}, [revision]);

	if (!data) {
		return (
			<>
				<h1 className="page-title">Playoffs</h1>
				<p className="page-sub">Loading bracket...</p>
			</>
		);
	}

	const series: any[][] = data.series ?? [];
	const numRounds = series.length;
	const roundNames =
		ROUND_NAMES[numRounds] ??
		Array.from({ length: numRounds }, (_, i) => `Round ${i + 1}`);
	const needed: number[] = data.numGamesToWinSeries ?? [];
	const userTid = local.userTid;

	// Champion: final-round matchup with a team at the required win count
	let champion: any;
	const finalRound = series.at(-1);
	if (finalRound?.length === 1) {
		const m = finalRound[0];
		const need = needed[numRounds - 1] ?? 4;
		if ((m.home?.won ?? 0) >= need) {
			champion = m.home;
		} else if ((m.away?.won ?? 0) >= need) {
			champion = m.away;
		}
	}

	const playIns: any[] | undefined = data.playIns;

	return (
		<>
			<h1 className="page-title">Playoffs</h1>
			<p className="page-sub">
				{data.finalMatchups
					? "Best-of-7 series — first to 4 wins advances. Higher seed has home court."
					: "Projected bracket based on current standings — seeds lock when the regular season ends."}
			</p>

			{champion ? (
				<section
					className="panel"
					style={{ marginBottom: 14, borderColor: "#2fd67b" }}
				>
					<div className="panel-body" style={{ textAlign: "center" }}>
						<div style={{ fontSize: 13 }} className="muted">
							League Champions
						</div>
						<div style={{ fontSize: 24, fontWeight: 700, color: "#2fd67b" }}>
							{champion.region} {champion.abbrev ? `(${champion.abbrev})` : ""}
						</div>
					</div>
				</section>
			) : null}

			{playIns && playIns.length > 0 && data.finalMatchups ? (
				<section className="panel" style={{ marginBottom: 14 }}>
					<div className="panel-header">
						<span>Play-In Tournament</span>
						<span className="pill">7v8 winner → 7 seed · loser plays 9v10 winner for 8 seed</span>
					</div>
					<div className="panel-body">
						<div
							style={{
								display: "grid",
								gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
								gap: 10,
							}}
						>
							{playIns.map((conf: any[], ci: number) =>
								conf.map((m: any, mi: number) => {
									const label =
										mi === 0 ? "7 vs 8" : mi === 1 ? "9 vs 10" : "8th Seed Game";
									const homeWon =
										m.home?.pts != null &&
										m.away?.pts != null &&
										m.home.pts > m.away.pts;
									const awayWon =
										m.home?.pts != null &&
										m.away?.pts != null &&
										m.away.pts > m.home.pts;
									return (
										<div
											key={`${ci}-${mi}`}
											style={{
												border: "1px solid rgba(255,255,255,0.12)",
												borderRadius: 8,
												overflow: "hidden",
											}}
										>
											<div
												className="muted"
												style={{
													fontSize: 11,
													padding: "3px 8px",
													borderBottom: "1px solid rgba(255,255,255,0.08)",
												}}
											>
												{data.confNames?.[ci] ?? ""} {label}
											</div>
											{[m.away, m.home].map((t: any, i) => (
												<div
													key={i}
													style={{
														display: "flex",
														justifyContent: "space-between",
														padding: "4px 8px",
														fontSize: 13,
														opacity:
															(i === 0 && homeWon) || (i === 1 && awayWon)
																? 0.45
																: 1,
														fontWeight:
															(i === 0 && awayWon) || (i === 1 && homeWon)
																? 600
																: 400,
														background:
															t?.tid === userTid
																? "rgba(94,155,255,0.10)"
																: undefined,
													}}
												>
													<span>
														<span
															className="muted"
															style={{ fontSize: 11, marginRight: 5 }}
														>
															{t?.seed}
														</span>
														{t?.region ?? "TBD"}
													</span>
													<span>{t?.pts ?? ""}</span>
												</div>
											))}
										</div>
									);
								}),
							)}
						</div>
					</div>
				</section>
			) : null}

			<section className="panel">
				<div className="panel-header">
					<span>Bracket</span>
					<span className="pill">Season {data.season}</span>
				</div>
				<div className="panel-body" style={{ overflowX: "auto" }}>
					<div style={{ display: "flex", gap: 14, minWidth: numRounds * 240 }}>
						{series.map((round: any[], ri: number) => {
							const need = needed[ri] ?? 4;
							return (
								<div
									key={ri}
									style={{
										flex: 1,
										display: "flex",
										flexDirection: "column",
										justifyContent: "space-around",
										gap: 10,
									}}
								>
									<div
										className="muted"
										style={{
											fontSize: 12,
											textAlign: "center",
											textTransform: "uppercase",
											letterSpacing: 1,
										}}
									>
										{roundNames[ri]}
										<span style={{ marginLeft: 6 }}>(first to {need})</span>
									</div>
									{round.map((m: any, mi: number) => {
										const decided =
											(m.home?.won ?? 0) >= need || (m.away?.won ?? 0) >= need;
										return (
											<div
												key={mi}
												style={{
													border: "1px solid rgba(255,255,255,0.12)",
													borderRadius: 8,
													overflow: "hidden",
													background: "rgba(255,255,255,0.02)",
												}}
											>
												{teamLine(m.away, {
													userTid,
													needed: need,
													opponentWon: m.home?.won,
													decided,
												})}
												<div
													style={{
														borderTop: "1px solid rgba(255,255,255,0.08)",
													}}
												/>
												{teamLine(m.home, {
													userTid,
													needed: need,
													opponentWon: m.away?.won,
													decided,
												})}
											</div>
										);
									})}
								</div>
							);
						})}
					</div>
				</div>
			</section>
		</>
	);
};
