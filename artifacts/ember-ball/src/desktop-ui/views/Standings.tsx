import { useEffect, useState } from "react";
import { runBeforeView } from "../util/league.ts";
import { useDesktopStore } from "../store.ts";
import { TeamLink } from "../components/TeamLink.tsx";

export const Standings = () => {
	const revision = useDesktopStore((s) => s.revision);
	const local = useDesktopStore((s) => s.local);
	const [data, setData] = useState<any>(null);

	useEffect(() => {
		void runBeforeView("standings", {}).then(setData).catch(console.error);
	}, [revision]);

	const confs = data?.confs ?? [];
	const confGroups: any[][] = data?.rankingGroups?.conf ?? [];
	const userTid = local.userTid;

	return (
		<>
			<h1 className="page-title">League Standings</h1>
			<p className="page-sub">
				Conference races update after every simmed game day.
			</p>

			<div className="grid-2">
				{confs.map((conf: any, ci: number) => (
					<section className="panel" key={conf.cid ?? conf.name}>
						<div className="panel-header">{conf.name}</div>
						<div className="panel-body" style={{ padding: 0 }}>
							<table className="data-table">
								<thead>
									<tr>
										<th>#</th>
										<th>Team</th>
										<th className="num">W</th>
										<th className="num">L</th>
										<th className="num">PCT</th>
										<th className="num">GB</th>
										<th className="num">L10</th>
										<th className="num">Strk</th>
									</tr>
								</thead>
								<tbody>
									{(confGroups[ci] ?? []).map((t: any, i: number) => (
										<tr key={t.tid}>
											<td>{i + 1}</td>
											<td
												className={t.tid === userTid ? "team-user" : undefined}
											>
												<TeamLink tid={t.tid}>
													{t.seasonAttrs?.region} {t.seasonAttrs?.name}
												</TeamLink>
											</td>
											<td className="num">{t.seasonAttrs?.won ?? 0}</td>
											<td className="num">{t.seasonAttrs?.lost ?? 0}</td>
											<td className="num">
												{(t.seasonAttrs?.winp ?? 0).toFixed(3)}
											</td>
											<td className="num">
												{t.gb?.conf === 0 ? "—" : (t.gb?.conf ?? "—")}
											</td>
											<td className="num">{t.seasonAttrs?.lastTen ?? "—"}</td>
											<td className="num">{t.seasonAttrs?.streak ?? "—"}</td>
										</tr>
									))}
									{(confGroups[ci] ?? []).length === 0 ? (
										<tr>
											<td colSpan={8} className="empty">
												No standings yet — sim a game day first.
											</td>
										</tr>
									) : null}
								</tbody>
							</table>
						</div>
					</section>
				))}
			</div>
			{confs.length === 0 ? (
				<div className="empty">Loading standings…</div>
			) : null}
		</>
	);
};
