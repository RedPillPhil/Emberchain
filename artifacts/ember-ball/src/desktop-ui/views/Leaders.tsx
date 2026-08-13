import { useEffect, useMemo, useState } from "react";
import { runBeforeView } from "../util/league.ts";
import { useDesktopStore } from "../store.ts";

/** NBA.com-style headline leaderboards (per game). */
const LEADER_ORDER = [
	{ stat: "pts", title: "Points Per Game" },
	{ stat: "trb", title: "Rebounds Per Game" },
	{ stat: "ast", title: "Assists Per Game" },
	{ stat: "stl", title: "Steals Per Game" },
	{ stat: "blk", title: "Blocks Per Game" },
	{ stat: "fgp", title: "Field Goal %" },
	{ stat: "tpp", title: "Three-Point %" },
	{ stat: "ftp", title: "Free Throw %" },
	{ stat: "tp", title: "3-Pointers Made" },
	{ stat: "min", title: "Minutes Per Game" },
] as const;

const formatStat = (stat: string, value: unknown) => {
	if (typeof value !== "number") {
		return String(value ?? "—");
	}
	if (stat === "fgp" || stat === "tpp" || stat === "ftp") {
		const pct = value <= 1 ? value * 100 : value;
		return `${pct.toFixed(1)}%`;
	}
	return value.toFixed(1);
};

export const Leaders = () => {
	const revision = useDesktopStore((s) => s.revision);
	const openPlayer = useDesktopStore((s) => s.openPlayer);
	const [data, setData] = useState<any>(null);

	useEffect(() => {
		void runBeforeView("leaders", {
			playoffs: "regularSeason",
			statType: "perGame",
		})
			.then(setData)
			.catch(console.error);
	}, [revision]);

	const categories = useMemo(() => {
		const raw: any[] = data?.categories ?? [];
		const byStat = new Map(raw.map((c) => [c.stat, c]));
		return LEADER_ORDER.map((def) => {
			const cat = byStat.get(def.stat);
			return {
				stat: def.stat,
				title: def.title,
				leaders: cat?.leaders ?? [],
			};
		}).filter((c) => c.leaders.length > 0 || raw.length === 0);
	}, [data]);

	const hasAny = categories.some((c) => c.leaders.length > 0);

	return (
		<>
			<h1 className="page-title">League Leaders</h1>
			<p className="page-sub">
				Per-game leaders — PPG, RPG, APG, steals, blocks, and shooting — the
				same categories you see on NBA.com.
			</p>
			{!hasAny ? (
				<div className="empty">No leader data yet — sim games first.</div>
			) : (
				<div className="grid-3">
					{categories.map((cat) => (
						<section className="panel" key={cat.stat}>
							<div className="panel-header">{cat.title}</div>
							<div className="panel-body" style={{ padding: 0 }}>
								<table className="data-table">
									<thead>
										<tr>
											<th>#</th>
											<th>Player</th>
											<th className="num">Stat</th>
										</tr>
									</thead>
									<tbody>
										{(cat.leaders ?? []).slice(0, 10).map((p: any, i: number) => (
											<tr key={p.pid ?? i}>
												<td>{i + 1}</td>
												<td>
													<button
														type="button"
														className="player-link"
														onClick={() => openPlayer(p.pid)}
													>
														{p.firstName} {p.lastName}
													</button>
													<span className="muted"> {p.abbrev}</span>
												</td>
												<td className="num">
													{formatStat(cat.stat, p.stat)}
												</td>
											</tr>
										))}
										{(cat.leaders ?? []).length === 0 ? (
											<tr>
												<td colSpan={3} className="empty">
													Qualifying minimum not met yet.
												</td>
											</tr>
										) : null}
									</tbody>
								</table>
							</div>
						</section>
					))}
				</div>
			)}
		</>
	);
};
