import { useEffect, useMemo, useState } from "react";
import { runBeforeView } from "../util/league.ts";
import { toWorker } from "../util/toWorker.ts";
import { useDesktopStore } from "../store.ts";
import { formatRating, getConfidence } from "../util/scouting.ts";
import { ConfidenceDot } from "../components/ConfidenceDot.tsx";
import {
	countryFromLoc,
	foreignLeagueFor,
	foreignStats,
	isForeign,
} from "../util/foreignLeagues.ts";

/** Deterministic per-player "season narrative" in [-1, 1] */
const seasonDelta = (pid: number, draftYear: number) => {
	let h = (pid * 2654435761 + draftYear * 97) >>> 0;
	h ^= h >> 13;
	h = (h * 1274126177) >>> 0;
	h ^= h >> 16;
	return ((h % 2001) - 1000) / 1000;
};

const YEAR_BADGE: Record<string, { label: string; color: string }> = {
	FR: { label: "FR", color: "#3b82f6" },
	SO: { label: "SO", color: "#10b981" },
	JR: { label: "JR", color: "#f59e0b" },
	SR: { label: "SR", color: "#ef4444" },
};

const CollegeYearBadge = ({ year }: { year?: string }) => {
	const info = year ? YEAR_BADGE[year] : undefined;
	if (!info) {
		return null;
	}
	return (
		<span
			style={{
				display: "inline-block",
				fontSize: "0.68em",
				fontWeight: 700,
				padding: "1px 5px",
				borderRadius: 4,
				background: info.color,
				color: "#fff",
				marginLeft: 5,
				verticalAlign: "middle",
				letterSpacing: "0.04em",
			}}
		>
			{info.label}
		</span>
	);
};

/** Projected ovr for an HS prospect after one college season */
const projectedOvr = (hsOvr: number) =>
	Math.round(Math.max(38, Math.min(70, hsOvr * 0.88)));

export const DraftClasses = () => {
	const revision = useDesktopStore((s) => s.revision);
	const scouting = useDesktopStore((s) => s.scouting);
	const openPlayer = useDesktopStore((s) => s.openPlayer);
	const openCollege = useDesktopStore((s) => s.openCollege);
	const openCollegeByName = useDesktopStore((s) => s.openCollegeByName);
	const openCountryFreeAgents = useDesktopStore(
		(s) => s.openCountryFreeAgents,
	);

	const openFromCollege = (p: any) => {
		if (typeof p.collegeTid === "number") {
			openCollege(p.collegeTid);
		} else if (p.college) {
			openCollegeByName(String(p.college));
		}
	};

	const [data, setData] = useState<any>(null);
	const [collegeDay, setCollegeDay] = useState(0);
	// hsTop100 = current HS seniors → 2027 projected class
	const [hsTop100, setHsTop100] = useState<any[]>([]);
	// hsJuniors = HS junior class → 2028 projected class
	const [hsJuniors, setHsJuniors] = useState<any[]>([]);
	const [tab, setTab] = useState<"college" | "hs27" | "hs28" | "intl">(
		"college",
	);

	useEffect(() => {
		void (async () => {
			// Ensure draft prospects appear on their college rosters as Declared
			await toWorker("main", "syncDraftCollegePipeline", undefined).catch(
				console.error,
			);
			const result = await runBeforeView("draftScouting", {}).catch(
				console.error,
			);
			if (result) {
				setData(result);
			}
			const uni: any = await toWorker(
				"main",
				"getCollegeUniverse",
				undefined,
			).catch(() => undefined);
			setCollegeDay(uni?.day ?? 0);

			const top100 = await toWorker("main", "getHsTop100", undefined).catch(
				() => [],
			);
			setHsTop100(top100 ?? []);

			const juniors = await toWorker(
				"main",
				"getHsJuniorClass",
				undefined,
			).catch(() => []);
			setHsJuniors(juniors ?? []);
		})();
	}, [revision]);

	// 0 at Opening Night → 1 by end of the college regular season (~day 140)
	const seasonProgress = Math.min(1, Math.max(0, collegeDay / 140));

	// Tab 0: current year college declarers (real BBGM players, seasons[0])
	const seasons: any[] = (data?.seasons ?? []).slice(0, 1);
	const currentSeason = seasons[0];

	/** Board ranking with in-season movement */
	const boardOrder = (players: any[], draftYear: number) =>
		players
			.map((p) => ({
				...p,
				boardScore:
					(p.valueFuzz ?? 0) +
					seasonDelta(p.pid, draftYear) * 9 * seasonProgress,
			}))
			.sort((a, b) => b.boardScore - a.boardScore)
			.map((p, i) => ({
				...p,
				boardRank: i + 1,
				trend: (p.rank ?? i + 1) - (i + 1),
			}));

	const collegeDeclarers = currentSeason
		? boardOrder(
				(currentSeason.players ?? []).filter(
					(p: any) => !isForeign(p.born?.loc),
				),
				currentSeason.season,
			)
		: [];

	const intlPlayers = useMemo(
		() =>
			boardOrder(
				(currentSeason?.players ?? []).map((p: any) => ({
					...p,
					draftYear: currentSeason?.season,
				})),
				0,
			).filter((p: any) => isForeign(p.born?.loc)),
		[data, seasonProgress],
	);

	const currentYear = currentSeason?.season ?? new Date().getFullYear();

	return (
		<>
			<h1 className="page-title">Draft Central</h1>
			<p className="page-sub">
				Three draft classes. The current class shows college players declaring
				now — SRs are out, elite JRs/SOs/FRs go early. Future classes project
				from the HS recruiting pipeline: the senior class commits to college and
				enters next year's draft; the junior class follows a year later.
			</p>

			{/* Tab bar */}
			<div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
				<button
					type="button"
					className={`btn ${tab === "college" ? "btn-primary" : "btn-secondary"}`}
					onClick={() => setTab("college")}
				>
					Class of {currentYear} — College
					{collegeDeclarers.length > 0
						? ` (${collegeDeclarers.length})`
						: ""}
				</button>
				<button
					type="button"
					className={`btn ${tab === "hs27" ? "btn-primary" : "btn-secondary"}`}
					onClick={() => setTab("hs27")}
				>
					Class of {currentYear + 1} — HS Seniors
					{hsTop100.length > 0 ? ` (${hsTop100.length})` : ""}
				</button>
				<button
					type="button"
					className={`btn ${tab === "hs28" ? "btn-primary" : "btn-secondary"}`}
					onClick={() => setTab("hs28")}
				>
					Class of {currentYear + 2} — HS Juniors
					{hsJuniors.length > 0 ? ` (${hsJuniors.length})` : ""}
				</button>
				<button
					type="button"
					className={`btn ${tab === "intl" ? "btn-primary" : "btn-secondary"}`}
					onClick={() => setTab("intl")}
				>
					International ({intlPlayers.length})
				</button>
			</div>

			{/* ===== TAB 0: College Declarers ===== */}
			{tab === "college" ? (
				<section className="panel">
					<div className="panel-header">
						<span>Class of {currentYear} Big Board — College Declarers</span>
						<span className="pill">{collegeDeclarers.length} prospects</span>
					</div>
					<div
						className="panel-sub"
						style={{
							padding: "6px 14px",
							fontSize: "0.82em",
							color: "var(--muted)",
						}}
					>
						All seniors are out. Elite juniors, sophs, and 1-and-done freshmen
						who declared early appear here.{" "}
						<CollegeYearBadge year="FR" /> one year in college,{" "}
						<CollegeYearBadge year="SR" /> used all four years.
					</div>
					<div className="panel-body" style={{ padding: 0 }}>
						<table className="data-table">
							<thead>
								<tr>
									<th>Rk</th>
									<th>Trend</th>
									<th>Prospect</th>
									<th>Yr</th>
									<th>Pos</th>
									<th className="num">Age</th>
									<th>College</th>
									<th className="num">Ovr</th>
									<th className="num">Pot</th>
								</tr>
							</thead>
							<tbody>
								{collegeDeclarers.map((p: any) => (
									<tr key={p.pid}>
										<td>{p.boardRank}</td>
										<td>
											{p.trend > 0 ? (
												<span style={{ color: "var(--green)" }}>
													▲{p.trend}
												</span>
											) : p.trend < 0 ? (
												<span style={{ color: "var(--red)" }}>
													▼{-p.trend}
												</span>
											) : (
												<span className="muted">—</span>
											)}
										</td>
										<td>
											<button
												type="button"
												className="player-link"
												onClick={() => openPlayer(p.pid)}
											>
												{p.firstName} {p.lastName}
											</button>
										</td>
										<td>
											<CollegeYearBadge year={p.collegeYear} />
										</td>
										<td>{p.pos}</td>
										<td className="num">{p.age}</td>
										<td>
											{p.college && String(p.college).trim() ? (
												<button
													type="button"
													className="team-link"
													onClick={() => openFromCollege(p)}
												>
													{p.college}
												</button>
											) : (
												"—"
											)}
										</td>
										<td className="num">
											{formatRating(scouting, p.pid, p.ovr, "ovr")}
											<ConfidenceDot
												tier={getConfidence(scouting, p.pid, "ovr")}
											/>
										</td>
										<td className="num">
											{formatRating(
												scouting,
												p.pid,
												p.pot,
												"pot",
												p.ovr,
											)}
											<ConfidenceDot
												tier={getConfidence(scouting, p.pid, "pot")}
											/>
										</td>
									</tr>
								))}
								{collegeDeclarers.length === 0 ? (
									<tr>
										<td colSpan={9} className="empty">
											College class not yet generated — advance past
											pre-season.
										</td>
									</tr>
								) : null}
							</tbody>
						</table>
					</div>
				</section>
			) : null}

			{/* ===== TAB 1: HS Seniors → Class of +1 ===== */}
			{tab === "hs27" ? (
				<section className="panel">
					<div className="panel-header">
						<span>
							Projected Class of {currentYear + 1} — HS Senior Recruits
						</span>
						<span className="pill pill-warning">Projected · not yet in draft</span>
					</div>
					<div
						className="panel-sub"
						style={{
							padding: "6px 14px",
							fontSize: "0.82em",
							color: "var(--muted)",
						}}
					>
						Current HS senior recruits committing to college. The top 5-15
						prospects are almost certain 1-and-dones — they play one year then
						declare. Mid-Top 100 (ranks 16-50) typically stay 2-3 years.
						Back-end prospects often go 3-4 years. Numbers show projected pro
						ratings after one college season.
					</div>
					<div className="panel-body" style={{ padding: 0 }}>
						<table className="data-table">
							<thead>
								<tr>
									<th>Nat'l Rk</th>
									<th>Prospect</th>
									<th>Pos</th>
									<th>Hometown</th>
									<th>Committed To</th>
									<th className="num">Proj Ovr</th>
									<th>Awards</th>
								</tr>
							</thead>
							<tbody>
								{hsTop100.map((p: any) => (
									<tr key={p.pid}>
										<td>#{p.rank}</td>
										<td>
											<span style={{ fontWeight: 600 }}>
												{p.firstName} {p.lastName}
											</span>
										</td>
										<td>{p.pos}</td>
										<td style={{ fontSize: "0.88em", color: "var(--muted)" }}>
											{p.hometown}
										</td>
										<td>
											{p.committedSchool ? (
												<button
													type="button"
													className="team-link"
													onClick={() =>
														openCollegeByName(p.committedSchool)
													}
												>
													{p.committedSchool}
												</button>
											) : (
												<span
													style={{
														color: "var(--muted)",
														fontStyle: "italic",
													}}
												>
													Uncommitted
												</span>
											)}
										</td>
										<td className="num">
											{projectedOvr(p.ovr)}
										</td>
										<td style={{ fontSize: "0.82em", color: "var(--muted)" }}>
											{(p.awards ?? []).join(", ") || "—"}
										</td>
									</tr>
								))}
								{hsTop100.length === 0 ? (
									<tr>
										<td colSpan={7} className="empty">
											HS Top 100 not yet generated.
										</td>
									</tr>
								) : null}
							</tbody>
						</table>
					</div>
				</section>
			) : null}

			{/* ===== TAB 2: HS Juniors → Class of +2 ===== */}
			{tab === "hs28" ? (
				<section className="panel">
					<div className="panel-header">
						<span>
							Projected Class of {currentYear + 2} — HS Junior Class
						</span>
						<span className="pill pill-warning">2 years out · early projection</span>
					</div>
					<div
						className="panel-sub"
						style={{
							padding: "6px 14px",
							fontSize: "0.82em",
							color: "var(--muted)",
						}}
					>
						Rising juniors — 17 years old, one year behind the seniors. Not
						inherently weaker: a strong junior class can rival or surpass the
						senior class in long-term talent. Current ratings are ~1-2 points
						behind their senior equivalents due to age, but these players still
						have a full development year ahead. Use as a long-range talent board.
					</div>
					<div className="panel-body" style={{ padding: 0 }}>
						<table className="data-table">
							<thead>
								<tr>
									<th>Rk</th>
									<th>Prospect</th>
									<th>Pos</th>
									<th>Hometown</th>
									<th className="num">Early Proj Ovr</th>
									<th>Awards</th>
								</tr>
							</thead>
							<tbody>
								{hsJuniors.map((p: any) => (
									<tr key={p.pid}>
										<td>#{p.rank}</td>
										<td>
											<span style={{ fontWeight: 600 }}>
												{p.firstName} {p.lastName}
											</span>
										</td>
										<td>{p.pos}</td>
										<td style={{ fontSize: "0.88em", color: "var(--muted)" }}>
											{p.hometown}
										</td>
										<td className="num">{projectedOvr(p.ovr)}</td>
										<td style={{ fontSize: "0.82em", color: "var(--muted)" }}>
											{(p.awards ?? []).join(", ") || "—"}
										</td>
									</tr>
								))}
								{hsJuniors.length === 0 ? (
									<tr>
										<td colSpan={6} className="empty">
											Junior class not yet generated.
										</td>
									</tr>
								) : null}
							</tbody>
						</table>
					</div>
				</section>
			) : null}

			{/* ===== TAB 3: International ===== */}
			{tab === "intl" ? (
				<section className="panel">
					<div className="panel-header">
						<span>International Prospect Board</span>
						<span className="pill">Real leagues · current season stats</span>
					</div>
					<div className="panel-body" style={{ padding: 0 }}>
						<table className="data-table">
							<thead>
								<tr>
									<th>Rk</th>
									<th>Prospect</th>
									<th>Pos</th>
									<th className="num">Age</th>
									<th>Country</th>
									<th>League</th>
									<th className="num">Draft</th>
									<th className="num">GP</th>
									<th className="num">PPG</th>
									<th className="num">RPG</th>
									<th className="num">APG</th>
									<th className="num">Ovr</th>
								</tr>
							</thead>
							<tbody>
								{intlPlayers.map((p: any, i: number) => {
									const stats = foreignStats(p.pid, p.ovr ?? 55, p.pos);
									return (
										<tr key={p.pid}>
											<td>{i + 1}</td>
											<td>
												<button
													type="button"
													className="player-link"
													onClick={() => openPlayer(p.pid)}
												>
													{p.firstName} {p.lastName}
												</button>
											</td>
											<td>{p.pos}</td>
											<td className="num">{p.age}</td>
											<td>
												<button
													type="button"
													className="team-link"
													onClick={() =>
														openCountryFreeAgents(
															countryFromLoc(p.born?.loc),
														)
													}
												>
													{countryFromLoc(p.born?.loc)}
												</button>
											</td>
											<td>{foreignLeagueFor(p.born?.loc)}</td>
											<td className="num">{p.draftYear}</td>
											<td className="num">{stats.gp}</td>
											<td className="num">{stats.ppg}</td>
											<td className="num">{stats.rpg}</td>
											<td className="num">{stats.apg}</td>
											<td className="num">
												{formatRating(scouting, p.pid, p.ovr, "ovr")}
												<ConfidenceDot
													tier={getConfidence(scouting, p.pid, "ovr")}
												/>
											</td>
										</tr>
									);
								})}
								{intlPlayers.length === 0 ? (
									<tr>
										<td colSpan={12} className="empty">
											No international prospects in the current class.
										</td>
									</tr>
								) : null}
							</tbody>
						</table>
					</div>
				</section>
			) : null}
		</>
	);
};
