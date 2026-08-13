import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { phaseKindFromText, runBeforeView } from "../util/league.ts";
import { toWorker } from "../util/toWorker.ts";
import { useDesktopStore } from "../store.ts";
import { formatRating, scoutPlayer } from "../util/scouting.ts";
import { TeamLink } from "../components/TeamLink.tsx";

const CLOCK_SECONDS = 90;

const pickOrdinal = (n: number) => {
	const j = n % 10;
	const k = n % 100;
	if (j === 1 && k !== 11) {
		return `${n}st`;
	}
	if (j === 2 && k !== 12) {
		return `${n}nd`;
	}
	if (j === 3 && k !== 13) {
		return `${n}rd`;
	}
	return `${n}th`;
};

/**
 * Pick-by-pick draft room with a 90s on-the-clock timer, pause, and
 * commissioner announcements. Available board follows big-board order
 * (valueFuzz rank from the draft view).
 */
export const DraftRoom = () => {
	const revision = useDesktopStore((s) => s.revision);
	const local = useDesktopStore((s) => s.local);
	const lid = useDesktopStore((s) => s.lid);
	const scouting = useDesktopStore((s) => s.scouting);
	const setScouting = useDesktopStore((s) => s.setScouting);
	const setView = useDesktopStore((s) => s.setView);
	const setStatus = useDesktopStore((s) => s.setStatus);
	const pushToast = useDesktopStore((s) => s.pushToast);
	const openPlayer = useDesktopStore((s) => s.openPlayer);
	const readOnly = useDesktopStore((s) => s.readOnly);
	const [data, setData] = useState<any>(null);
	const [busy, setBusy] = useState(false);
	const [secondsLeft, setSecondsLeft] = useState(CLOCK_SECONDS);
	const [clockRunning, setClockRunning] = useState(false);
	const [paused, setPaused] = useState(false);
	const [announcement, setAnnouncement] = useState<string | undefined>();
	const lastPickKey = useRef<string>("");
	const lastAnnouncedPid = useRef<number>(-1);
	const autoFired = useRef(false);

	const refetch = useCallback(async () => {
		const fresh = await runBeforeView("draft", {}).catch(console.error);
		if (fresh) {
			setData(fresh);
		}
	}, []);

	useEffect(() => {
		void refetch();
	}, [revision, refetch]);

	const userTid = local.userTid;
	const phaseKind = phaseKindFromText(local.phaseText);
	const drafted: any[] = data?.drafted ?? [];
	const undrafted: any[] = useMemo(() => {
		const list = [...(data?.undrafted ?? [])];
		list.sort(
			(a, b) =>
				(a.rank ?? 999) - (b.rank ?? 999) ||
				(b.valueFuzz ?? 0) - (a.valueFuzz ?? 0),
		);
		return list;
	}, [data]);
	const teamsByTid: Record<string, any> = data?.teamsByTid ?? {};

	const nextPick = drafted.find((p) => p.pid === -1);
	const usersTurn = nextPick != null && nextPick.draft?.tid === userTid;
	const draftOver = phaseKind !== "draft" || (data && nextPick == null);
	const picksMade = drafted.filter((p) => p.pid !== -1).length;
	const totalPicks = drafted.length;
	const overallPick = picksMade + 1;

	const teamLabel = (tid: number | undefined) => {
		if (tid == null) {
			return "?";
		}
		const t = teamsByTid[tid];
		return t ? `${t.region ?? ""} ${t.name ?? t.abbrev}`.trim() : `#${tid}`;
	};

	const abbrev = (tid: number | undefined) =>
		tid == null ? "?" : (teamsByTid[tid]?.abbrev ?? `#${tid}`);

	const leagueAbbrev = local.leagueAbbrev ?? "PBL";
	const commissioner = local.commissioner ?? "Adam Silver";

	const run = useCallback(
		async (fn: () => Promise<unknown>, status: string) => {
			if (readOnly || busy) {
				return;
			}
			setBusy(true);
			setStatus(status);
			try {
				await fn();
				await refetch();
			} catch (error) {
				console.error(error);
				pushToast({ text: "Draft action failed", type: "error" });
			} finally {
				setBusy(false);
			}
		},
		[busy, pushToast, readOnly, refetch, setStatus],
	);

	// Reset clock when the on-the-clock team changes
	useEffect(() => {
		if (!nextPick || draftOver) {
			setClockRunning(false);
			return;
		}
		const key = `${nextPick.draft?.round}-${nextPick.draft?.pick}-${nextPick.draft?.tid}-${picksMade}`;
		if (key !== lastPickKey.current) {
			lastPickKey.current = key;
			setSecondsLeft(CLOCK_SECONDS);
			setPaused(false);
			setClockRunning(!usersTurn);
			autoFired.current = false;
		}
	}, [nextPick, picksMade, draftOver, usersTurn]);

	// Announce most recent selection
	useEffect(() => {
		const made = drafted.filter((p) => p.pid !== -1);
		const last = made.at(-1);
		if (!last || last.pid === lastAnnouncedPid.current) {
			return;
		}
		lastAnnouncedPid.current = last.pid;
		const overall = made.length;
		setAnnouncement(
			`Commissioner ${commissioner}: With the ${pickOrdinal(overall)} pick in the ${leagueAbbrev} draft, the ${teamLabel(last.draft?.tid)} selects ${last.firstName} ${last.lastName}`,
		);
	}, [drafted, commissioner, leagueAbbrev, teamsByTid]);

	// Tick the clock
	useEffect(() => {
		if (!clockRunning || paused || busy || draftOver || usersTurn) {
			return;
		}
		const id = window.setInterval(() => {
			setSecondsLeft((s) => Math.max(0, s - 1));
		}, 1000);
		return () => window.clearInterval(id);
	}, [clockRunning, paused, busy, draftOver, usersTurn]);

	// Auto-sim CPU pick when clock hits 0
	useEffect(() => {
		if (
			readOnly ||
			secondsLeft > 0 ||
			usersTurn ||
			busy ||
			draftOver ||
			!nextPick ||
			autoFired.current
		) {
			return;
		}
		autoFired.current = true;
		void run(
			() => toWorker("playMenu", "onePick", undefined),
			"Pick is in...",
		);
	}, [secondsLeft, usersTurn, busy, draftOver, nextPick, run, readOnly]);

	const simOnePick = () =>
		run(() => toWorker("playMenu", "onePick", undefined), "On the clock...");
	const simToMyPick = () =>
		run(
			() => toWorker("playMenu", "untilYourNextPick", undefined),
			"Simming to your pick...",
		);
	const simRestOfDraft = () =>
		run(
			() => toWorker("playMenu", "untilEnd", undefined),
			"Finishing the draft...",
		);

	const draftPlayer = (pid: number, name: string) =>
		run(async () => {
			await toWorker("main", "draftUser", pid);
			pushToast({ text: `With the pick, you select ${name}!`, type: "info" });
		}, "Making the pick...");

	const onScout = (pid: number) => {
		if (lid == null) {
			return;
		}
		const result = scoutPlayer(lid, scouting, pid, "college");
		setScouting(result.state);
		pushToast({ text: result.message, type: result.ok ? "info" : "error" });
	};

	const clockDisplay = `${String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:${String(secondsLeft % 60).padStart(2, "0")}`;

	if (!data) {
		return (
			<>
				<h1 className="page-title">NBA Draft</h1>
				<p className="page-sub">Loading the draft board...</p>
			</>
		);
	}

	return (
		<>
			<h1 className="page-title">{leagueAbbrev} Draft</h1>
			<p className="page-sub">
				Two rounds, {totalPicks} picks. Prospects are ordered by the final
				draft big board. Let the clock run for realism, pause it, or advance
				manually.
			</p>

			{announcement ? (
				<section
					className="panel"
					style={{
						marginBottom: 10,
						borderColor: "rgba(240,160,48,0.45)",
					}}
				>
					<div className="panel-body" style={{ padding: "12px 16px" }}>
						<div style={{ fontSize: 15, lineHeight: 1.45 }}>{announcement}</div>
					</div>
				</section>
			) : null}

			<section
				className="panel"
				style={{
					marginBottom: 14,
					borderColor: usersTurn ? "#5e9bff" : undefined,
				}}
			>
				<div className="panel-body">
					<div
						style={{
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
							flexWrap: "wrap",
							gap: 10,
						}}
					>
						<div>
							{draftOver ? (
								<strong>Draft complete — {picksMade} picks made.</strong>
							) : usersTurn ? (
								<strong style={{ color: "#5e9bff", fontSize: 15 }}>
									You&apos;re on the clock — Round {nextPick.draft.round}, Pick{" "}
									{nextPick.draft.pick > 0
										? nextPick.draft.pick
										: overallPick}
								</strong>
							) : nextPick ? (
								<span>
									On the clock:{" "}
									<strong>
										<TeamLink tid={nextPick.draft?.tid}>
											{abbrev(nextPick.draft?.tid)}
										</TeamLink>
									</strong>{" "}
									<span className="muted">
										(Round {nextPick.draft.round} · {picksMade}/{totalPicks}{" "}
										picks made)
									</span>
								</span>
							) : null}
						</div>
						{!draftOver ? (
							<div
								style={{
									display: "flex",
									alignItems: "center",
									gap: 10,
								}}
							>
								<div
									className="draft-clock"
									style={{
										fontVariantNumeric: "tabular-nums",
										fontSize: 28,
										fontWeight: 700,
										letterSpacing: 1,
										color:
											secondsLeft <= 10
												? "#ef5b5b"
												: usersTurn
													? "#5e9bff"
													: "#e8ecf3",
										minWidth: 90,
										textAlign: "center",
									}}
									title="90-second draft clock"
								>
									{clockDisplay}
								</div>
								<button
									type="button"
									className="btn btn-ghost"
									disabled={busy || usersTurn || draftOver}
									onClick={() => {
										setPaused((p) => !p);
										setClockRunning(true);
									}}
								>
									{paused ? "Resume" : "Pause"}
								</button>
								<button
									type="button"
									className="btn btn-ghost"
									disabled={busy || draftOver}
									onClick={() => {
										setSecondsLeft(CLOCK_SECONDS);
										setPaused(false);
										setClockRunning(!usersTurn);
									}}
								>
									Reset 90s
								</button>
							</div>
						) : null}
						<div style={{ display: "flex", gap: 8 }}>
							{draftOver ? (
								<button
									type="button"
									className="btn btn-primary"
									onClick={() => setView("dashboard")}
								>
									Continue Offseason →
								</button>
							) : (
								<>
									<button
										type="button"
										className="btn btn-secondary"
										disabled={busy || usersTurn}
										onClick={() => void simOnePick()}
									>
										Sim 1 Pick
									</button>
									<button
										type="button"
										className="btn btn-secondary"
										disabled={busy || usersTurn}
										onClick={() => void simToMyPick()}
									>
										Sim to My Pick
									</button>
									<button
										type="button"
										className="btn btn-ghost"
										disabled={busy || usersTurn}
										title="Sims every remaining pick, including auto-drafting yours"
										onClick={() => void simRestOfDraft()}
									>
										Sim Rest
									</button>
								</>
							)}
						</div>
					</div>
				</div>
			</section>

			<div
				style={{
					display: "grid",
					gridTemplateColumns: "minmax(380px, 1.1fr) minmax(340px, 1fr)",
					gap: 14,
					alignItems: "start",
				}}
			>
				<section className="panel">
					<div className="panel-header">
						<span>Available Prospects</span>
						<span className="pill">Big board · {undrafted.length}</span>
					</div>
					<div
						className="panel-body"
						style={{ padding: 0, maxHeight: 560, overflowY: "auto" }}
					>
						<table className="data-table">
							<thead>
								<tr>
									<th className="num">Rk</th>
									<th>Name</th>
									<th>Pos</th>
									<th className="num">Age</th>
									<th className="num">Ovr</th>
									<th className="num">Pot</th>
									<th></th>
								</tr>
							</thead>
							<tbody>
								{undrafted.slice(0, 80).map((p: any, i: number) => (
									<tr key={p.pid}>
										<td className="num muted">{p.rank ?? i + 1}</td>
										<td>
											<button
												type="button"
												className="player-link"
												onClick={() => openPlayer(p.pid)}
											>
												{p.firstName} {p.lastName}
											</button>
										</td>
										<td>{p.ratings?.pos}</td>
										<td className="num">{p.age}</td>
										<td className="num">
											{formatRating(scouting, p.pid, p.ratings?.ovr, "ovr")}
										</td>
										<td className="num">
											{formatRating(
												scouting,
												p.pid,
												p.ratings?.pot,
												"pot",
												p.ratings?.ovr,
											)}
										</td>
										<td style={{ whiteSpace: "nowrap" }}>
											{!readOnly ? (
												<button
													type="button"
													className="btn btn-ghost"
													style={{
														minHeight: 26,
														fontSize: 12,
														padding: "2px 8px",
													}}
													onClick={() => onScout(p.pid)}
												>
													Scout
												</button>
											) : null}{" "}
											{usersTurn && !readOnly ? (
												<button
													type="button"
													className="btn btn-primary"
													style={{
														minHeight: 26,
														fontSize: 12,
														padding: "2px 10px",
													}}
													disabled={busy}
													onClick={() =>
														void draftPlayer(
															p.pid,
															`${p.firstName} ${p.lastName}`,
														)
													}
												>
													Draft
												</button>
											) : null}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</section>

				<section className="panel">
					<div className="panel-header">
						<span>Draft Board</span>
						<span className="pill">
							{picksMade}/{totalPicks} picks
						</span>
					</div>
					<div
						className="panel-body"
						style={{ padding: 0, maxHeight: 560, overflowY: "auto" }}
					>
						<table className="data-table">
							<thead>
								<tr>
									<th className="num">Pick</th>
									<th>Team</th>
									<th>Selection</th>
								</tr>
							</thead>
							<tbody>
								{drafted.map((p: any, i: number) => {
									const isUserPick = p.draft?.tid === userTid;
									const isNext = p === nextPick;
									return (
										<tr
											key={i}
											style={{
												background: isNext
													? "rgba(94,155,255,0.12)"
													: isUserPick
														? "rgba(94,155,255,0.05)"
														: undefined,
											}}
										>
											<td className="num">
												{p.draft?.round}.
												{p.draft?.pick > 0
													? String(p.draft.pick).padStart(2, "0")
													: "—"}
											</td>
											<td>
												<TeamLink tid={p.draft?.tid}>
													{abbrev(p.draft?.tid)}
												</TeamLink>
												{p.draft?.originalTid != null &&
												p.draft.originalTid !== p.draft.tid ? (
													<span
														className="muted"
														style={{ fontSize: 11, marginLeft: 4 }}
													>
														(via {abbrev(p.draft.originalTid)})
													</span>
												) : null}
												{isUserPick ? (
													<span className="pill" style={{ marginLeft: 5 }}>
														You
													</span>
												) : null}
											</td>
											<td>
												{p.pid !== -1 ? (
													<button
														type="button"
														className="player-link"
														onClick={() => openPlayer(p.pid)}
													>
														{p.firstName} {p.lastName}
													</button>
												) : isNext ? (
													<span style={{ color: "#5e9bff" }}>
														On the clock...
													</span>
												) : (
													<span className="muted">—</span>
												)}
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				</section>
			</div>
		</>
	);
};
