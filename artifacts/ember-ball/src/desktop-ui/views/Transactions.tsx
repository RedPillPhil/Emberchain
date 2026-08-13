import { useEffect, useState } from "react";
import { runBeforeView } from "../util/league.ts";
import { useDesktopStore } from "../store.ts";
import { stripHtml } from "../util/format.ts";

const TYPES = [
	{ id: "all", label: "All" },
	{ id: "trade", label: "Trades" },
	{ id: "freeAgent", label: "Signings" },
	{ id: "reSigned", label: "Re-signs" },
	{ id: "release", label: "Releases" },
	{ id: "draft", label: "Draft" },
] as const;

export const Transactions = () => {
	const revision = useDesktopStore((s) => s.revision);
	const season = useDesktopStore((s) => s.local.season);
	const [eventType, setEventType] = useState<string>("all");
	const [data, setData] = useState<any>(null);

	useEffect(() => {
		void runBeforeView("transactions", {
			abbrev: "all",
			season: season != null ? String(season) : "all",
			eventType,
		})
			.then(setData)
			.catch(console.error);
	}, [revision, season, eventType]);

	const events: any[] = data?.events ?? [];

	return (
		<>
			<h1 className="page-title">Transactions</h1>
			<p className="page-sub">
				League-wide trades, signings, releases, and draft picks.
			</p>

			<div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
				{TYPES.map((t) => (
					<button
						key={t.id}
						type="button"
						className={`btn ${eventType === t.id ? "btn-primary" : "btn-secondary"}`}
						onClick={() => setEventType(t.id)}
					>
						{t.label}
					</button>
				))}
			</div>

			<section className="panel">
				<div className="panel-header">
					<span>Feed</span>
					<span className="pill">{events.length} events</span>
				</div>
				<div className="panel-body" style={{ padding: 0 }}>
					{events.length === 0 ? (
						<div className="empty" style={{ padding: 20 }}>
							No transactions yet this season.
						</div>
					) : (
						<table className="data-table">
							<thead>
								<tr>
									<th>Type</th>
									<th>Detail</th>
								</tr>
							</thead>
							<tbody>
								{events.map((e: any) => (
									<tr key={e.eid}>
										<td>
											<span className="pill">{e.type}</span>
										</td>
										<td>{stripHtml(e.text ?? "")}</td>
									</tr>
								))}
							</tbody>
						</table>
					)}
				</div>
			</section>
		</>
	);
};
