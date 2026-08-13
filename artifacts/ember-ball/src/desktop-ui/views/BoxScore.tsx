import { useEffect, useState } from "react";
import { runBeforeView } from "../util/league.ts";
import { useDesktopStore } from "../store.ts";
import { TeamLink } from "../components/TeamLink.tsx";

type StatCol = { key: string; label: string; pair?: string };

const STAT_COLS: StatCol[] = [
	{ key: "min", label: "MIN" },
	{ key: "fg", label: "FGM", pair: "fga" },
	{ key: "tp", label: "3PM", pair: "tpa" },
	{ key: "ft", label: "FTM", pair: "fta" },
	{ key: "orb", label: "ORB" },
	{ key: "drb", label: "DRB" },
	{ key: "trb", label: "REB" },
	{ key: "ast", label: "AST" },
	{ key: "stl", label: "STL" },
	{ key: "blk", label: "BLK" },
	{ key: "tov", label: "TO" },
	{ key: "pf", label: "PF" },
	{ key: "pts", label: "PTS" },
];

const fmt = (p: any, col: StatCol) => {
	const v = p[col.key];
	if (col.pair) {
		return `${v ?? 0}-${p[col.pair] ?? 0}`;
	}
	if (typeof v === "number") {
		return col.key === "min" ? v.toFixed(1) : String(v);
	}
	return v ?? "—";
};

export const BoxScore = () => {
	const revision = useDesktopStore((s) => s.revision);
	const gid = useDesktopStore((s) => s.gameGid);
	const season = useDesktopStore((s) => s.local.season);
	const setView = useDesktopStore((s) => s.setView);
	const openPlayer = useDesktopStore((s) => s.openPlayer);
	const [data, setData] = useState<any>(null);

	useEffect(() => {
		if (gid == null) {
			return;
		}
		void runBeforeView("gameLog", {
			gid: String(gid),
			season: season != null ? String(season) : undefined,
		})
			.then(setData)
			.catch(console.error);
	}, [revision, gid, season]);

	const box = data?.boxScore;
	const teams = box?.teams ?? [];

	return (
		<>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 12,
					marginBottom: 8,
				}}
			>
				<button
					type="button"
					className="btn btn-secondary"
					onClick={() => setView("schedule")}
				>
					← Schedule
				</button>
				<h1 className="page-title" style={{ margin: 0 }}>
					Box Score
				</h1>
			</div>
			<p className="page-sub">
				{box?.won?.region
					? `${box.won.region} ${box.won.name} ${box.won.pts} — ${box.lost.region} ${box.lost.name} ${box.lost.pts}${box.overtime ? ` ${box.overtime}` : ""}`
					: gid == null
						? "No game selected."
						: "Loading…"}
			</p>

			{teams.map((t: any) => (
				<section className="panel" key={t.tid} style={{ marginBottom: 16 }}>
					<div className="panel-header">
						<span>
							<TeamLink tid={t.tid}>
								{t.region} {t.name}
							</TeamLink>{" "}
							<span className="pill">{t.pts} pts</span>
						</span>
						<span className="pill">{t.abbrev}</span>
					</div>
					<div className="panel-body" style={{ padding: 0, overflowX: "auto" }}>
						<table className="data-table">
							<thead>
								<tr>
									<th>Player</th>
									<th>Pos</th>
									{STAT_COLS.map((c) => (
										<th key={c.key} className="num">
											{c.label}
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{(t.players ?? [])
									.filter((p: any) => (p.min ?? 0) > 0 || p.injury)
									.map((p: any) => (
										<tr key={p.pid}>
											<td>
												<button
													type="button"
													className="player-link"
													onClick={() => openPlayer(p.pid)}
												>
													{p.name ?? `${p.firstName} ${p.lastName}`}
												</button>
											</td>
											<td>{p.pos ?? "—"}</td>
											{STAT_COLS.map((c) => (
												<td key={c.key} className="num">
													{fmt(p, c)}
												</td>
											))}
										</tr>
									))}
							</tbody>
						</table>
					</div>
				</section>
			))}

			{!box || box.gid === -1 ? (
				<div className="empty">Box score not available for this game.</div>
			) : null}
		</>
	);
};
