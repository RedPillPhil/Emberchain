import { useEffect, useState } from "react";
import { runBeforeView } from "../util/league.ts";
import { toWorker } from "../util/toWorker.ts";
import { useDesktopStore } from "../store.ts";

const pct = (v: number | undefined) =>
	v == null ? "—" : `${(v * 100).toFixed(1)}%`;

/**
 * NBA-method draft lottery (nba2019): each lottery team gets a share of 1000
 * four-ball combinations — the three worst records each get 140 (14%) — and
 * the top 4 picks are drawn. Everyone else picks in reverse record order.
 */
export const DraftLottery = () => {
	const revision = useDesktopStore((s) => s.revision);
	const local = useDesktopStore((s) => s.local);
	const setView = useDesktopStore((s) => s.setView);
	const setStatus = useDesktopStore((s) => s.setStatus);
	const pushToast = useDesktopStore((s) => s.pushToast);
	const [data, setData] = useState<any>(null);
	const [running, setRunning] = useState(false);

	useEffect(() => {
		void runBeforeView("draftLottery", {}).then(setData).catch(console.error);
	}, [revision]);

	const userTid = local.userTid;

	const runLottery = async () => {
		setRunning(true);
		setStatus("Drawing ping-pong balls...");
		try {
			await toWorker("main", "draftLottery", undefined);
			const fresh = await runBeforeView("draftLottery", {});
			setData(fresh);
			setStatus("Lottery complete");
			pushToast({ text: "Draft lottery results are in!", type: "info" });
		} catch (error) {
			console.error(error);
			pushToast({ text: "Lottery failed to run", type: "error" });
			setStatus("Error");
		} finally {
			setRunning(false);
		}
	};

	const goToDraft = async () => {
		setStatus("Heading to the draft...");
		try {
			await toWorker("playMenu", "untilDraft", undefined);
		} catch (error) {
			console.error(error);
		}
		useDesktopStore.getState().bumpRevision();
		setView("draftRoom");
	};

	if (!data) {
		return (
			<>
				<h1 className="page-title">Draft Lottery</h1>
				<p className="page-sub">Loading lottery odds...</p>
			</>
		);
	}

	const result: any[] = data.draftLotteryResult?.result ?? [];
	const probs: (number | undefined)[][] = data.probs ?? [];
	const teams: Record<string, any> = data.teams ?? {};
	const isCompleted = data.type === "completed";
	const readyToRun = data.type === "readyToRun";
	const numToPick = data.numToPick ?? 4;

	// Completed: order rows by final pick. Otherwise: pre-lottery order (worst first).
	const rows = isCompleted
		? [...result].sort((a, b) => (a.pick ?? 99) - (b.pick ?? 99))
		: result;

	const teamRecord = (tid: number) => {
		const t = teams[tid];
		if (!t?.seasonAttrs) {
			return "";
		}
		return `${t.seasonAttrs.won}-${t.seasonAttrs.lost}`;
	};

	const teamAbbrev = (tid: number) => teams[tid]?.seasonAttrs?.abbrev ?? `#${tid}`;

	return (
		<>
			<h1 className="page-title">Draft Lottery</h1>
			<p className="page-sub">
				Real NBA rules: 1,000 ping-pong ball combinations split among the 14
				lottery teams — the three worst records each get a 14.0% shot at #1 —
				and the top {numToPick} picks are drawn. Everyone else slots in by
				reverse record.
			</p>

			<section className="panel">
				<div className="panel-header">
					<span>
						{isCompleted
							? "Lottery Results"
							: readyToRun
								? "Lottery Odds — ready to draw"
								: "Projected Lottery Odds"}
					</span>
					{readyToRun ? (
						<button
							type="button"
							className="btn btn-primary"
							disabled={running}
							onClick={() => void runLottery()}
						>
							{running ? "Drawing..." : "Run Draft Lottery"}
						</button>
					) : null}
					{isCompleted ? (
						<button
							type="button"
							className="btn btn-primary"
							onClick={() => void goToDraft()}
						>
							Continue to NBA Draft →
						</button>
					) : null}
				</div>
				<div className="panel-body" style={{ padding: 0 }}>
					<table className="data-table">
						<thead>
							<tr>
								{isCompleted ? <th className="num">Pick</th> : null}
								<th className="num">{isCompleted ? "Pre" : "Rank"}</th>
								<th>Team</th>
								<th className="num">Record</th>
								<th className="num">Chances</th>
								<th className="num">#1 Odds</th>
								<th className="num">Top {numToPick}</th>
								{isCompleted ? <th>Move</th> : null}
							</tr>
						</thead>
						<tbody>
							{rows.map((row: any) => {
								const preIndex = result.indexOf(row);
								const p = probs[preIndex] ?? [];
								const topN = p
									.slice(0, numToPick)
									.reduce((s: number, v) => s + (v ?? 0), 0);
								const move =
									row.pick != null ? preIndex + 1 - row.pick : undefined;
								const isUser = row.tid === userTid;
								return (
									<tr
										key={`${row.tid}-${preIndex}`}
										style={
											isUser
												? { background: "rgba(94,155,255,0.10)" }
												: undefined
										}
									>
										{isCompleted ? (
											<td
												className="num"
												style={{ fontWeight: 700, fontSize: 15 }}
											>
												{row.pick ?? "—"}
											</td>
										) : null}
										<td className="num muted">{preIndex + 1}</td>
										<td>
											{teamAbbrev(row.tid)}
											{row.tid !== row.originalTid ? (
												<span
													className="muted"
													style={{ fontSize: 11, marginLeft: 5 }}
													title="Pick acquired via trade"
												>
													(via {teamAbbrev(row.originalTid)})
												</span>
											) : null}
											{isUser ? (
												<span className="pill" style={{ marginLeft: 6 }}>
													You
												</span>
											) : null}
										</td>
										<td className="num muted">{teamRecord(row.originalTid)}</td>
										<td className="num">
											{row.chances != null
												? `${((row.chances / 1000) * 100).toFixed(1)}%`
												: "—"}
										</td>
										<td className="num">{pct(p[0])}</td>
										<td className="num">{pct(topN > 0 ? topN : undefined)}</td>
										{isCompleted ? (
											<td>
												{move != null && move > 0 ? (
													<span style={{ color: "#2fd67b" }}>▲ {move}</span>
												) : move != null && move < 0 ? (
													<span style={{ color: "#ef5b5b" }}>▼ {-move}</span>
												) : (
													<span className="muted">—</span>
												)}
											</td>
										) : null}
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			</section>

			{!readyToRun && !isCompleted ? (
				<p className="muted" style={{ marginTop: 10, fontSize: 12 }}>
					The lottery is drawn after the season ends — these odds update with
					the standings.
				</p>
			) : null}
		</>
	);
};
