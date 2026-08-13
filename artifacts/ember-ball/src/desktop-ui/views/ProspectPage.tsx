import { useEffect, useState } from "react";
import { toWorker } from "../util/toWorker.ts";
import { useDesktopStore } from "../store.ts";
import {
	formatRating,
	getConfidence,
	getReport,
	isFullyScouted,
	scoutPlayer,
	SCOUT_COSTS,
} from "../util/scouting.ts";
import { ConfidenceDot } from "../components/ConfidenceDot.tsx";
import { genBio, genPersonality } from "../util/personality.ts";

const heightStr = (inches: number | undefined) =>
	inches != null ? `${Math.floor(inches / 12)}'${inches % 12}"` : "—";

export const ProspectPage = () => {
	const ref = useDesktopStore((s) => s.prospectRef);
	const back = useDesktopStore((s) => s.prospectBack);
	const setView = useDesktopStore((s) => s.setView);
	const setCollegeTid = useDesktopStore((s) => s.setCollegeTid);
	const revision = useDesktopStore((s) => s.revision);
	const lid = useDesktopStore((s) => s.lid);
	const scouting = useDesktopStore((s) => s.scouting);
	const setScouting = useDesktopStore((s) => s.setScouting);
	const readOnly = useDesktopStore((s) => s.readOnly);
	const pushToast = useDesktopStore((s) => s.pushToast);
	const [college, setCollege] = useState<any>();
	const [hs, setHs] = useState<any>();

	useEffect(() => {
		if (!ref) {
			return;
		}
		if (ref.kind === "college" && ref.tid != null) {
			void toWorker("main", "getCollegeTeamDetail", ref.tid)
				.then((detail: any) => {
					setCollege({
						detail,
						player: detail?.players?.find((p: any) => p.pid === ref.pid),
					});
				})
				.catch(console.error);
		} else if (ref.kind === "hs") {
			void toWorker("main", "getHsTop100", undefined)
				.then((rows: any) => {
					setHs((rows as any[])?.find((p: any) => p.pid === ref.pid));
				})
				.catch(console.error);
		}
	}, [ref, revision]);

	if (!ref) {
		return (
			<div className="empty">
				No prospect selected.{" "}
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

	const p = ref.kind === "college" ? college?.player : hs;
	const report = getReport(scouting, ref.pid);
	const fullyScouted = isFullyScouted(scouting, ref.pid);
	const nextLevel = report ? Math.min(3, report.level + 1) : 1;
	const cost = SCOUT_COSTS[nextLevel as 1 | 2 | 3];
	const name = p
		? `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() || "Prospect"
		: "Prospect";
	const school = college?.detail?.team
		? `${college.detail.team.region} ${college.detail.team.name}`
		: undefined;
	const awards: string[] = p?.awards ?? [];
	const personality = genPersonality(ref.pid);
	const bio = genBio({
		pid: ref.pid,
		name,
		pos: p?.pos ?? "F",
		height: p?.height,
		hometown: p?.hometown,
		college: school,
		year: p?.year,
		ovr: p?.ovr,
		awards,
		kind: ref.kind === "college" ? "college" : "hs",
	});

	const onScout = () => {
		if (lid == null) {
			return;
		}
		const result = scoutPlayer(lid, scouting, ref.pid, "college");
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
				{p?.pos ?? "—"} · {heightStr(p?.height)}
				{p?.weight != null ? `, ${p.weight} lbs` : ""}
				{ref.kind === "college" ? (
					<>
						{" · "}
						{p?.year ?? ""}{" "}
						<button
							type="button"
							className="player-link"
							onClick={() => {
								if (ref.tid != null) {
									setCollegeTid(ref.tid);
									setView("collegeTeam");
								}
							}}
						>
							{school ?? ""}
						</button>
						{college?.detail?.conf ? ` (${college.detail.conf.name})` : ""}
					</>
				) : (
					<>
						{" · "}HS Rank #{p?.rank ?? "—"} · {p?.hometown ?? ""}
					</>
				)}
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
							<strong>Unscouted prospect</strong>
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
						onClick={onScout}
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
							{awards.map((a) => (
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
						{formatRating(scouting, ref.pid, p?.ovr, "ovr")}
						<ConfidenceDot tier={getConfidence(scouting, ref.pid, "ovr")} />
					</div>
				</div>
				<div className="stat-card">
					<div className="label">{ref.kind === "college" ? "Class" : "Rank"}</div>
					<div className="value">
						{ref.kind === "college" ? (p?.year ?? "—") : `#${p?.rank ?? "—"}`}
					</div>
				</div>
				<div className="stat-card">
					<div className="label">Position</div>
					<div className="value">{p?.pos ?? "—"}</div>
				</div>
				<div className="stat-card">
					<div className="label">Height</div>
					<div className="value">{heightStr(p?.height)}</div>
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

			{ref.kind === "college" ? (
				<section className="panel">
					<div className="panel-header">Season Stats</div>
					<div className="panel-body" style={{ padding: 0 }}>
						<table className="data-table">
							<thead>
								<tr>
									<th className="num">GP</th>
									<th className="num">PPG</th>
									<th className="num">RPG</th>
									<th className="num">APG</th>
								</tr>
							</thead>
							<tbody>
								<tr>
									<td className="num">{p?.stats?.gp ?? 0}</td>
									<td className="num">{p?.ppg ?? "0.0"}</td>
									<td className="num">{p?.rpg ?? "0.0"}</td>
									<td className="num">{p?.apg ?? "0.0"}</td>
								</tr>
							</tbody>
						</table>
					</div>
				</section>
			) : (
				<section className="panel">
					<div className="panel-header">
						<span>Recruitment</span>
						<span className="pill">
							{p?.committedSchool ? "Committed" : "Undeclared"}
						</span>
					</div>
					<div className="panel-body" style={{ padding: 0 }}>
						<table className="data-table">
							<thead>
								<tr>
									<th>School</th>
									<th className="num">Prestige</th>
									<th>Status</th>
								</tr>
							</thead>
							<tbody>
								{(p?.offers ?? []).map((o: any) => (
									<tr key={o.tid}>
										<td>
											<button
												type="button"
												className="player-link"
												onClick={() => {
													setCollegeTid(o.tid);
													setView("collegeTeam");
												}}
											>
												{o.school}
											</button>
										</td>
										<td className="num">{Math.round(o.prestige)}</td>
										<td>
											{p?.committedTid === o.tid ? (
												<span className="pill">Committed</span>
											) : (
												<span className="muted">Offer</span>
											)}
										</td>
									</tr>
								))}
								{(p?.offers ?? []).length === 0 ? (
									<tr>
										<td colSpan={3} className="empty">
											No offers yet.
										</td>
									</tr>
								) : null}
							</tbody>
						</table>
					</div>
				</section>
			)}
		</>
	);
};
