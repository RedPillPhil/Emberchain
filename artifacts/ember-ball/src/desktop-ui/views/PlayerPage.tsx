import { useEffect, useState } from "react";
import { phaseKindFromText, runBeforeView } from "../util/league.ts";
import { useDesktopStore } from "../store.ts";
import {
	formatRating,
	getConfidence,
	getReport,
	isFullyScouted,
	runWorkout,
	scoutPlayer,
	SCOUT_COSTS,
	WORKOUTS,
} from "../util/scouting.ts";
import {
	ConfidenceDot,
	ConfidenceLegend,
} from "../components/ConfidenceDot.tsx";
import { fmtMoney } from "../util/format.ts";
import { genBio, genPersonality } from "../util/personality.ts";
import {
	foreignLeagueFor,
	isForeign,
} from "../util/foreignLeagues.ts";

const RATING_GROUPS: { title: string; keys: [string, string][] }[] = [
	{
		title: "Physical",
		keys: [
			["hgt", "Height"],
			["stre", "Strength"],
			["spd", "Speed"],
			["jmp", "Jumping"],
			["endu", "Endurance"],
		],
	},
	{
		title: "Shooting",
		keys: [
			["ins", "Inside"],
			["dnk", "Dunks/Layups"],
			["ft", "Free Throws"],
			["fg", "Mid Range"],
			["tp", "Three Point"],
		],
	},
	{
		title: "Skill",
		keys: [
			["oiq", "Offensive IQ"],
			["diq", "Defensive IQ"],
			["drb", "Dribbling"],
			["pss", "Passing"],
			["reb", "Rebounding"],
		],
	},
];

const playerName = (p: any) => {
	if (!p) {
		return "Player";
	}
	if (p.name) {
		return p.name;
	}
	if (p.firstName || p.lastName) {
		return `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim();
	}
	return "Player";
};

export const PlayerPage = () => {
	const pid = useDesktopStore((s) => s.playerPid);
	const back = useDesktopStore((s) => s.playerBack);
	const setView = useDesktopStore((s) => s.setView);
	const revision = useDesktopStore((s) => s.revision);
	const lid = useDesktopStore((s) => s.lid);
	const scouting = useDesktopStore((s) => s.scouting);
	const setScouting = useDesktopStore((s) => s.setScouting);
	const readOnly = useDesktopStore((s) => s.readOnly);
	const pushToast = useDesktopStore((s) => s.pushToast);
	const local = useDesktopStore((s) => s.local);
	const [p, setP] = useState<any>(null);

	useEffect(() => {
		if (pid == null) {
			return;
		}
		void runBeforeView("player", { pid: String(pid) })
			.then((data: any) => setP(data?.player ?? null))
			.catch(console.error);
	}, [pid, revision]);

	if (pid == null) {
		return (
			<div className="empty">
				No player selected.{" "}
				<button
					type="button"
					className="btn btn-primary"
					onClick={() => setView(back)}
				>
					Go Back
				</button>
			</div>
		);
	}

	const report = getReport(scouting, pid);
	const ratings = p?.ratings?.at(-1) ?? {};
	const seasons = p?.stats ?? [];
	const fullyScouted = isFullyScouted(scouting, pid);
	const nextLevel = report ? Math.min(3, report.level + 1) : 1;
	const cost = SCOUT_COSTS[nextLevel as 1 | 2 | 3];
	const name = playerName(p);
	const personality = genPersonality(pid);
	const awards = (p?.awards ?? []).map((a: any) =>
		typeof a === "string" ? a : `${a.season} ${a.type}`,
	);
	const foreign = isForeign(p?.born?.loc);
	const bio = genBio({
		pid,
		name,
		pos: ratings.pos ?? "F",
		age: p?.age,
		height: p?.hgt,
		hometown: p?.born?.loc,
		college: p?.college,
		ovr: ratings.ovr,
		awards,
		kind: foreign ? "intl" : "pro",
		league: foreign ? foreignLeagueFor(p?.born?.loc) : undefined,
	});

	const heightStr =
		p?.hgt != null ? `${Math.floor(p.hgt / 12)}'${p.hgt % 12}"` : "—";

	// Draft prospects (undrafted, tid === -2) can be brought in for workouts,
	// but only during the pre-draft window (season over → draft night).
	const isDraftProspect = p?.tid === -2;
	const phaseKind = phaseKindFromText(local.phaseText);
	const workoutWindowOpen = phaseKind === "draftLottery" || phaseKind === "draft";
	const workoutsDone = report?.workouts ?? [];

	const onWorkout = (workoutId: (typeof WORKOUTS)[number]["id"]) => {
		if (lid == null) {
			return;
		}
		const result = runWorkout(lid, scouting, pid, workoutId);
		setScouting(result.state);
		pushToast({ text: result.message, type: result.ok ? "info" : "error" });
	};

	return (
		<>
			<button
				type="button"
				className="btn btn-ghost"
				style={{ marginBottom: 12 }}
				onClick={() => setView(back)}
			>
				&larr; Back
			</button>

			<h1 className="page-title">{name}</h1>
			<p className="page-sub">
				{ratings.pos ?? "—"} · {p?.abbrev ?? "FA"} · Age {p?.age ?? "—"} ·{" "}
				{heightStr}, {p?.weight ?? "—"} lbs
				{p?.born?.loc ? ` · ${p.born.loc}` : ""}
				{p?.contract?.amount != null && p.contract.amount >= 0.05
					? ` · ${fmtMoney(p.contract.amount)}/yr thru ${p.contract.exp}`
					: ""}
			</p>

			<div className="college-banner">
				<div>
					{report ? (
						<>
							<strong>
								Scouting report — {report.accuracy} accuracy (level{" "}
								{report.level}/3)
							</strong>
							<div className="muted">
								Filed by {report.scoutName}. Reports are opinions — numbers may
								be off from the player&apos;s true ability.
							</div>
						</>
					) : (
						<>
							<strong>Unscouted player</strong>
							<div className="muted">
								Spend scouting points to file a report and reveal ratings.
							</div>
						</>
					)}
				</div>
				{!readOnly ? (
					<button
						type="button"
						className="btn btn-primary"
						disabled={fullyScouted}
						onClick={() => {
							if (lid == null) {
								return;
							}
							const result = scoutPlayer(lid, scouting, pid, "pro");
							setScouting(result.state);
							pushToast({
								text: result.message,
								type: result.ok ? "info" : "error",
							});
						}}
					>
						{fullyScouted
							? "Fully Scouted"
							: report
								? `Re-Scout (${cost} pts)`
								: `Scout (${cost} pt)`}
					</button>
				) : (
					<span className="pill">Browse only</span>
				)}
			</div>

			<section className="panel" style={{ marginBottom: 14 }}>
				<div className="panel-header">
					<span>Bio</span>
					<span className="pill">{personality.archetype}</span>
				</div>
				<div className="panel-body">
					<p style={{ margin: 0, lineHeight: 1.5 }}>{bio}</p>
					{awards.length > 0 ? (
						<p style={{ margin: "10px 0 0" }}>
							{awards.slice(0, 8).map((a: string) => (
								<span key={a} className="pill" style={{ marginRight: 6 }}>
									{a}
								</span>
							))}
						</p>
					) : null}
				</div>
			</section>

			<div className="stat-cards">
				<div className="stat-card">
					<div className="label">Overall</div>
					<div className="value">
						{formatRating(scouting, pid, ratings.ovr, "ovr")}
						<ConfidenceDot tier={getConfidence(scouting, pid, "ovr")} />
					</div>
				</div>
				<div className="stat-card">
					<div className="label">Potential</div>
					<div className="value">
						{formatRating(scouting, pid, ratings.pot, "pot", ratings.ovr)}
						<ConfidenceDot tier={getConfidence(scouting, pid, "pot")} />
					</div>
				</div>
				<div className="stat-card">
					<div className="label">Position</div>
					<div className="value">{ratings.pos ?? "—"}</div>
				</div>
				<div className="stat-card">
					<div className="label">Experience</div>
					<div className="value">
						{p?.experience != null ? `${p.experience} yrs` : "—"}
					</div>
				</div>
			</div>

			<section className="panel" style={{ marginBottom: 14 }}>
				<div className="panel-header">Personality</div>
				<div className="panel-body" style={{ padding: 0 }}>
					<table className="data-table">
						<tbody>
							{(
								[
									["loyalty", "Loyalty"],
									["workEthic", "Work Ethic"],
									["ambition", "Ambition"],
									["competitiveness", "Competitiveness"],
									["leadership", "Leadership"],
									["ego", "Ego"],
									["teamFirst", "Team First"],
								] as const
							).map(([key, label]) => (
								<tr key={key}>
									<td>{label}</td>
									<td className="num">{personality[key]}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</section>

			{isDraftProspect && !readOnly ? (
				<section className="panel" style={{ marginBottom: 14 }}>
					<div className="panel-header">
						<span>Pre-Draft Workouts</span>
						<span className="pill">
							{workoutWindowOpen
								? `${workoutsDone.length}/${WORKOUTS.length} completed`
								: "Window closed"}
						</span>
					</div>
					<div className="panel-body">
						<p className="muted" style={{ margin: "0 0 10px" }}>
							{!workoutWindowOpen
								? "Pre-draft workouts open once the season ends — the window runs from the draft lottery through draft night. Until then you can only scout from film and games."
								: report
									? "Bring him in to firm up the report. Workouts tighten the error band and raise confidence in specific areas — they don't reveal true ratings. Athletic testing is hard measurement."
									: "File a scouting report first, then schedule workouts to firm up specific areas."}
						</p>
						<div
							style={{
								display: "grid",
								gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))",
								gap: 10,
							}}
						>
							{WORKOUTS.map((w) => {
								const done = workoutsDone.includes(w.id);
								return (
									<div
										key={w.id}
										style={{
											border: "1px solid var(--line)",
											borderRadius: "var(--radius)",
											padding: "10px 12px",
											display: "flex",
											flexDirection: "column",
											gap: 6,
										}}
									>
										<strong>{w.label}</strong>
										<span className="muted" style={{ fontSize: 12 }}>
											{w.blurb}
										</span>
										<button
											type="button"
											className={`btn ${done ? "btn-ghost" : "btn-secondary"}`}
											disabled={done || !report || !workoutWindowOpen}
											style={{ marginTop: "auto" }}
											onClick={() => onWorkout(w.id)}
										>
											{done
												? "✓ Completed"
												: workoutWindowOpen
													? `Run (${w.cost} pts)`
													: "Locked until pre-draft"}
										</button>
									</div>
								);
							})}
						</div>
					</div>
				</section>
			) : null}

			{report ? (
				<div style={{ margin: "0 0 10px" }}>
					<span className="muted" style={{ marginRight: 10, fontSize: 12 }}>
						Report confidence:
					</span>
					<ConfidenceLegend />
				</div>
			) : null}

			<div className="grid-3">
				{RATING_GROUPS.map((group) => (
					<section className="panel" key={group.title}>
						<div className="panel-header">{group.title}</div>
						<div className="panel-body" style={{ padding: 0 }}>
							<table className="data-table">
								<tbody>
									{group.keys.map(([key, label]) => (
										<tr key={key}>
											<td>{label}</td>
											<td className="num">
												{formatRating(scouting, pid, ratings[key], key)}
												<ConfidenceDot
													tier={getConfidence(scouting, pid, key)}
												/>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</section>
				))}
			</div>

			<section className="panel" style={{ marginTop: 14 }}>
				<div className="panel-header">Career Stats (Per Game)</div>
				<div className="panel-body" style={{ padding: 0 }}>
					<table className="data-table">
						<thead>
							<tr>
								<th>Season</th>
								<th>Team</th>
								<th className="num">GP</th>
								<th className="num">Min</th>
								<th className="num">Pts</th>
								<th className="num">Reb</th>
								<th className="num">Ast</th>
							</tr>
						</thead>
						<tbody>
							{seasons
								.filter((s: any) => !s.playoffs)
								.map((s: any, i: number) => (
									<tr key={i}>
										<td>{s.season}</td>
										<td>{s.abbrev}</td>
										<td className="num">{s.gp ?? 0}</td>
										<td className="num">
											{s.gp ? ((s.min ?? 0) / s.gp).toFixed(1) : "—"}
										</td>
										<td className="num">
											{s.gp ? ((s.pts ?? 0) / s.gp).toFixed(1) : "—"}
										</td>
										<td className="num">
											{s.gp ? ((s.trb ?? 0) / s.gp).toFixed(1) : "—"}
										</td>
										<td className="num">
											{s.gp ? ((s.ast ?? 0) / s.gp).toFixed(1) : "—"}
										</td>
									</tr>
								))}
							{seasons.filter((s: any) => !s.playoffs).length === 0 ? (
								<tr>
									<td colSpan={7} className="empty">
										No games played yet.
									</td>
								</tr>
							) : null}
						</tbody>
					</table>
				</div>
			</section>
		</>
	);
};
