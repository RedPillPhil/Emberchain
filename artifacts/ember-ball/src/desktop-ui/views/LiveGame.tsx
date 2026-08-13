import { useEffect, useRef, useState, type ReactNode } from "react";
import processLiveGameEvents from "../../ui/util/processLiveGameEvents.basketball.tsx";
import { useDesktopStore } from "../store.ts";
import {
	advanceDay,
	refreshLeagueChrome,
	runBeforeView,
} from "../util/league.ts";

type LogEntry = {
	key: number;
	quarter: string;
	time: string;
	text: ReactNode;
	score: string;
	t: 0 | 1 | undefined;
};

type SimState = {
	overtimes: number;
	quarters: string[];
	playLog: LogEntry[];
	logKey: number;
	done: boolean;
};

const SPEEDS: { label: string; ms: number }[] = [
	{ label: "Slow", ms: 900 },
	{ label: "Normal", ms: 400 },
	{ label: "Fast", ms: 140 },
	{ label: "Blazing", ms: 40 },
];

const teamHeader = (t: any) => `${t.region ?? ""} ${t.name ?? t.abbrev ?? ""}`;

const num = (v: any) => (typeof v === "number" ? v : 0);

const PlayerRows = ({ t }: { t: any }) => (
	<tbody>
		{t.players
			.filter((p: any) => num(p.min) > 0 || p.inGame)
			.map((p: any) => (
				<tr key={p.pid} style={p.inGame ? { background: "rgba(94, 155, 255, 0.08)" } : undefined}>
					<td>
						{p.inGame ? <span style={{ color: "#5e9bff" }}>●</span> : null}{" "}
						{p.name}
					</td>
					<td className="num">{Math.round(num(p.min))}</td>
					<td className="num">{num(p.pts)}</td>
					<td className="num">
						{num(p.orb) + num(p.drb)}
					</td>
					<td className="num">{num(p.ast)}</td>
					<td className="num">
						{num(p.fg)}/{num(p.fga)}
					</td>
					<td className="num">
						{num(p.tp)}/{num(p.tpa)}
					</td>
					<td className="num">
						{num(p.ft)}/{num(p.fta)}
					</td>
					<td className="num">{num(p.pm) > 0 ? `+${num(p.pm)}` : num(p.pm)}</td>
				</tr>
			))}
	</tbody>
);

export const LiveGame = () => {
	const liveGame = useDesktopStore((s) => s.liveGame);
	const setLiveGame = useDesktopStore((s) => s.setLiveGame);
	const setView = useDesktopStore((s) => s.setView);
	const setStatus = useDesktopStore((s) => s.setStatus);

	const [, setTick] = useState(0);
	const [paused, setPaused] = useState(false);
	const [speedIdx, setSpeedIdx] = useState(1);
	const [finishing, setFinishing] = useState(false);

	// Mutable sim state lives on the payload itself so leaving the view and
	// coming back resumes where the game left off.
	const payload: any = liveGame;
	if (payload && !payload.simState) {
		payload.simState = {
			overtimes: 0,
			quarters: [],
			playLog: [],
			logKey: 0,
			done: false,
		} satisfies SimState;
	}
	const sim: SimState | undefined = payload?.simState;
	const boxScore = payload?.initialBoxScore;

	const pausedRef = useRef(paused);
	pausedRef.current = paused;

	useEffect(() => {
		if (!payload || !sim || sim.done) {
			return;
		}
		let timeout: ReturnType<typeof setTimeout>;
		const step = () => {
			if (pausedRef.current) {
				return;
			}
			if (payload.events.length === 0) {
				sim.done = true;
				setTick((n) => n + 1);
				return;
			}
			const result = processLiveGameEvents({
				events: payload.events,
				boxScore,
				overtimes: sim.overtimes,
				quarters: sim.quarters,
			});
			sim.overtimes = result.overtimes;
			sim.quarters = result.quarters;
			if (result.text !== undefined) {
				sim.playLog.unshift({
					key: sim.logKey++,
					quarter: boxScore.quarterShort,
					time: boxScore.time,
					text: result.text,
					score: `${boxScore.teams[1].pts}-${boxScore.teams[0].pts}`,
					t: result.t,
				});
				if (sim.playLog.length > 250) {
					sim.playLog.length = 250;
				}
			}
			if (boxScore.gameOver || payload.events.length === 0) {
				sim.done = true;
			}
			setTick((n) => n + 1);
			if (!sim.done) {
				timeout = setTimeout(step, SPEEDS[speedIdx]!.ms);
			}
		};
		timeout = setTimeout(step, SPEEDS[speedIdx]!.ms);
		return () => clearTimeout(timeout);
	}, [payload, paused, speedIdx, sim?.done]);

	if (!payload || !boxScore || !sim) {
		return (
			<>
				<h1 className="page-title">Live Game</h1>
				<p className="page-sub">
					No live game in progress. Use the Play button on a game day to
					tip off in play-by-play mode.
				</p>
			</>
		);
	}

	const skipToEnd = () => {
		while (payload.events.length > 0) {
			const result = processLiveGameEvents({
				events: payload.events,
				boxScore,
				overtimes: sim.overtimes,
				quarters: sim.quarters,
			});
			sim.overtimes = result.overtimes;
			sim.quarters = result.quarters;
			if (result.text !== undefined) {
				sim.playLog.unshift({
					key: sim.logKey++,
					quarter: boxScore.quarterShort,
					time: boxScore.time,
					text: result.text,
					score: `${boxScore.teams[1].pts}-${boxScore.teams[0].pts}`,
					t: result.t,
				});
				if (sim.playLog.length > 250) {
					sim.playLog.length = 250;
				}
			}
		}
		sim.done = true;
		setTick((n) => n + 1);
	};

	const finishDay = async () => {
		setFinishing(true);
		setStatus("Finishing the day...");
		setLiveGame(undefined);
		try {
			// If your next game is first up on the schedule, don't auto-sim it —
			// leave it for the next Play press. Otherwise sim out the rest of
			// the slate.
			const data: any = await runBeforeView("schedule", {});
			if (data?.canLiveSimFirstGame) {
				await refreshLeagueChrome();
				useDesktopStore.getState().bumpRevision();
				setStatus("Day complete — Play when you're ready for tip-off");
			} else {
				await advanceDay();
			}
		} catch {
			await advanceDay();
		}
		setView("schedule");
	};

	const away = boxScore.teams[0];
	const home = boxScore.teams[1];

	return (
		<>
			<h1 className="page-title">Live Game</h1>
			<p className="page-sub">
				Coach from the sideline — pause anytime, change the pace, or skip to
				the final buzzer. Substitutions run off your rotation minutes (set
				them on the Roster page before tip-off).
			</p>

			<section className="panel" style={{ marginBottom: 16 }}>
				<div className="panel-body">
					<div
						style={{
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
							flexWrap: "wrap",
							gap: 16,
						}}
					>
						<div style={{ textAlign: "center", minWidth: 160 }}>
							<div className="muted" style={{ fontSize: 12 }}>
								{teamHeader(away)}
							</div>
							<div style={{ fontSize: 34, fontWeight: 700 }}>{away.pts}</div>
						</div>
						<div style={{ textAlign: "center" }}>
							<div style={{ fontSize: 20, fontWeight: 600 }}>
								{sim.done ? "FINAL" : boxScore.time}
							</div>
							<div className="muted" style={{ fontSize: 12 }}>
								{sim.done
									? boxScore.overtime || "Game over"
									: boxScore.quarter || "Pregame"}
							</div>
						</div>
						<div style={{ textAlign: "center", minWidth: 160 }}>
							<div className="muted" style={{ fontSize: 12 }}>
								{teamHeader(home)}
							</div>
							<div style={{ fontSize: 34, fontWeight: 700 }}>{home.pts}</div>
						</div>
					</div>

					{/* Quarter-by-quarter */}
					<table
						className="data-table"
						style={{ marginTop: 12, maxWidth: 420, marginLeft: "auto", marginRight: "auto" }}
					>
						<thead>
							<tr>
								<th></th>
								{sim.quarters.map((q) => (
									<th className="num" key={q}>
										{q}
									</th>
								))}
								<th className="num">T</th>
							</tr>
						</thead>
						<tbody>
							{[away, home].map((t: any) => (
								<tr key={t.abbrev}>
									<td>{t.abbrev}</td>
									{t.ptsQtrs.map((pts: number, i: number) => (
										<td className="num" key={i}>
											{pts}
										</td>
									))}
									<td className="num" style={{ fontWeight: 600 }}>
										{t.pts}
									</td>
								</tr>
							))}
						</tbody>
					</table>

					{/* Controls */}
					<div
						style={{
							display: "flex",
							gap: 8,
							justifyContent: "center",
							marginTop: 12,
							flexWrap: "wrap",
						}}
					>
						{!sim.done ? (
							<>
								<button
									type="button"
									className="btn"
									onClick={() => setPaused((p) => !p)}
								>
									{paused ? "Resume" : "Pause"}
								</button>
								{SPEEDS.map((s, i) => (
									<button
										key={s.label}
										type="button"
										className={`btn btn-ghost${i === speedIdx ? " active" : ""}`}
										style={
											i === speedIdx
												? { borderColor: "#5e9bff", color: "#5e9bff" }
												: undefined
										}
										onClick={() => setSpeedIdx(i)}
									>
										{s.label}
									</button>
								))}
								<button type="button" className="btn btn-ghost" onClick={skipToEnd}>
									Skip to End
								</button>
							</>
						) : (
							<button
								type="button"
								className="btn"
								disabled={finishing}
								onClick={() => void finishDay()}
							>
								{finishing ? "Finishing..." : "Finish Day & Continue"}
							</button>
						)}
					</div>
				</div>
			</section>

			<div
				style={{
					display: "grid",
					gridTemplateColumns: "minmax(320px, 1fr) minmax(420px, 1.2fr)",
					gap: 16,
					alignItems: "start",
				}}
			>
				{/* Play-by-play */}
				<section className="panel">
					<div className="panel-header">
						<span>Play-by-Play</span>
						{paused && !sim.done ? <span className="pill">Paused</span> : null}
					</div>
					<div
						className="panel-body"
						style={{ maxHeight: 520, overflowY: "auto", padding: 0 }}
					>
						<table className="data-table">
							<tbody>
								{sim.playLog.map((entry) => (
									<tr key={entry.key}>
										<td className="muted" style={{ whiteSpace: "nowrap", width: 70 }}>
											{entry.quarter} {entry.time}
										</td>
										<td className="muted num" style={{ width: 60 }}>
											{entry.score}
										</td>
										<td>{entry.text}</td>
									</tr>
								))}
								{sim.playLog.length === 0 ? (
									<tr>
										<td className="muted">Waiting for tip-off...</td>
									</tr>
								) : null}
							</tbody>
						</table>
					</div>
				</section>

				{/* Box score */}
				<section className="panel">
					<div className="panel-header">
						<span>Box Score</span>
						<span className="pill">● = on the floor</span>
					</div>
					<div className="panel-body" style={{ padding: 0, maxHeight: 520, overflowY: "auto" }}>
						{[away, home].map((t: any) => (
							<div key={t.abbrev}>
								<div
									style={{
										padding: "8px 12px",
										fontWeight: 600,
										borderBottom: "1px solid rgba(255,255,255,0.08)",
									}}
								>
									{teamHeader(t)}
								</div>
								<table className="data-table">
									<thead>
										<tr>
											<th>Player</th>
											<th className="num">Min</th>
											<th className="num">Pts</th>
											<th className="num">Reb</th>
											<th className="num">Ast</th>
											<th className="num">FG</th>
											<th className="num">3P</th>
											<th className="num">FT</th>
											<th className="num">+/-</th>
										</tr>
									</thead>
									<PlayerRows t={t} />
								</table>
							</div>
						))}
					</div>
				</section>
			</div>
		</>
	);
};
