import { useEffect, useMemo, useState } from "react";
import { toWorker } from "../util/toWorker.ts";
import { useDesktopStore } from "../store.ts";
import { formatRating } from "../util/scouting.ts";

const MAX_PER_PLAYER = 3;

/**
 * Offseason training camp — spend focus points on young players (≤24) so they
 * get a small skills bump before annual player progression runs.
 */
export const TrainingCamp = () => {
	const lid = useDesktopStore((s) => s.lid);
	const scouting = useDesktopStore((s) => s.scouting);
	const setView = useDesktopStore((s) => s.setView);
	const setStatus = useDesktopStore((s) => s.setStatus);
	const pushToast = useDesktopStore((s) => s.pushToast);
	const setProgressionResults = useDesktopStore((s) => s.setProgressionResults);
	const [players, setPlayers] = useState<any[]>([]);
	const [invest, setInvest] = useState<Record<number, number>>({});
	const [busy, setBusy] = useState(false);

	const pool = useMemo(() => {
		const asst = scouting.staff.assistantCoach?.rating ?? 50;
		const head = scouting.staff.headCoach?.rating ?? 50;
		return 8 + Math.floor(asst / 15) + Math.floor(head / 25);
	}, [scouting]);

	const spent = Object.values(invest).reduce((a, b) => a + b, 0);
	const remaining = pool - spent;

	useEffect(() => {
		void toWorker("main", "getTrainingCampRoster", undefined)
			.then((data: any) => setPlayers(data?.players ?? []))
			.catch(console.error);
	}, [lid]);

	const setPoints = (pid: number, pts: number) => {
		const next = Math.max(0, Math.min(MAX_PER_PLAYER, pts));
		const current = invest[pid] ?? 0;
		const delta = next - current;
		if (delta > remaining) {
			return;
		}
		setInvest((prev) => {
			const copy = { ...prev };
			if (next === 0) {
				delete copy[pid];
			} else {
				copy[pid] = next;
			}
			return copy;
		});
	};

	const runCampAndProgression = async () => {
		if (busy) {
			return;
		}
		setBusy(true);
		setStatus("Running training camp...");
		try {
			const investments = Object.entries(invest)
				.filter(([, pts]) => pts > 0)
				.map(([pid, points]) => ({ pid: Number(pid), points }));

			if (investments.length > 0) {
				await toWorker("main", "applyTrainingCampBoosts", investments);
			}

			const before = (await toWorker(
				"main",
				"snapshotUserRosterRatings",
				undefined,
			)) as any[];

			const phaseText = String(
				(await toWorker("main", "getLocal", "phaseText").catch(
					() => "",
				)) ?? "",
			).toLowerCase();
			const alreadyPreseason = phaseText.includes("preseason");

			if (!alreadyPreseason) {
				setStatus("Player progression...");
				await toWorker("playMenu", "untilPreseason", undefined);
			}

			const after = (await toWorker(
				"main",
				"snapshotUserRosterRatings",
				undefined,
			)) as any[];

			const beforeByPid = new Map(before.map((p) => [p.pid, p]));
			const results = after
				.map((a) => {
					const b = beforeByPid.get(a.pid);
					if (!b) {
						return {
							...a,
							ovrBefore: a.ovr,
							potBefore: a.pot,
							ovrDelta: 0,
							potDelta: 0,
							trained: !!invest[a.pid],
						};
					}
					return {
						...a,
						ovrBefore: b.ovr,
						potBefore: b.pot,
						ovrDelta: a.ovr - b.ovr,
						potDelta: a.pot - b.pot,
						trained: !!invest[a.pid],
					};
				})
				.sort(
					(x, y) =>
						Math.abs(y.ovrDelta) - Math.abs(x.ovrDelta) ||
						y.pot - x.pot,
				);

			setProgressionResults(results);
			pushToast({
				text:
					investments.length > 0
						? `Camp wrapped — ${investments.length} player(s) trained, progression complete`
						: "Player progression complete",
				type: "info",
			});
			useDesktopStore.getState().bumpRevision();
			setView("progression");
		} catch (error) {
			console.error(error);
			pushToast({ text: "Training camp failed", type: "error" });
		} finally {
			setBusy(false);
			setStatus("Idle");
		}
	};

	return (
		<>
			<h1 className="page-title">Training Camp</h1>
			<p className="page-sub">
				Spend focus points on players 24 and under. Each point gives a small
				skills bump before annual progression. Your coaching staff sets the
				pool size.
			</p>

			<section className="panel" style={{ marginBottom: 14 }}>
				<div className="panel-body">
					<div
						style={{
							display: "flex",
							justifyContent: "space-between",
							alignItems: "center",
							flexWrap: "wrap",
							gap: 10,
						}}
					>
						<div>
							<strong>
								Focus points: {remaining} / {pool} remaining
							</strong>
							<div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
								Assistant coach {scouting.staff.assistantCoach?.rating ?? "—"} ·
								Head coach {scouting.staff.headCoach?.rating ?? "—"} · max{" "}
								{MAX_PER_PLAYER} per player
							</div>
						</div>
						<div style={{ display: "flex", gap: 8 }}>
							<button
								type="button"
								className="btn btn-ghost"
								disabled={busy}
								onClick={() => setView("freeAgents")}
							>
								← Free Agency
							</button>
							<button
								type="button"
								className="btn btn-primary"
								disabled={busy}
								onClick={() => void runCampAndProgression()}
							>
								{busy
									? "Working..."
									: spent > 0
										? "Apply Camp → Progression"
										: "Skip Camp → Progression"}
							</button>
						</div>
					</div>
				</div>
			</section>

			<section className="panel">
				<div className="panel-header">
					<span>Young Players</span>
					<span className="pill">{players.length} eligible</span>
				</div>
				<div className="panel-body" style={{ padding: 0 }}>
					{players.length === 0 ? (
						<div className="empty" style={{ padding: 20 }}>
							No players 24 or under on the roster. You can still run
							progression.
						</div>
					) : (
						<table className="data-table">
							<thead>
								<tr>
									<th>Pos</th>
									<th>Player</th>
									<th className="num">Age</th>
									<th className="num">Ovr</th>
									<th className="num">Pot</th>
									<th className="num">Focus</th>
								</tr>
							</thead>
							<tbody>
								{players.map((p: any) => {
									const pts = invest[p.pid] ?? 0;
									return (
										<tr key={p.pid}>
											<td>{p.ratings?.pos}</td>
											<td>
												<button
													type="button"
													className="player-link"
													onClick={() =>
														useDesktopStore.getState().openPlayer(p.pid)
													}
												>
													{p.firstName} {p.lastName}
												</button>
											</td>
											<td className="num">{p.age}</td>
											<td className="num">
												{formatRating(
													scouting,
													p.pid,
													p.ratings?.ovr,
													"ovr",
												)}
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
											<td className="num">
												<div
													style={{
														display: "inline-flex",
														gap: 4,
														alignItems: "center",
													}}
												>
													<button
														type="button"
														className="btn btn-ghost"
														style={{
															minHeight: 26,
															padding: "0 8px",
															fontSize: 14,
														}}
														disabled={busy || pts <= 0}
														onClick={() => setPoints(p.pid, pts - 1)}
													>
														−
													</button>
													<strong style={{ minWidth: 16 }}>{pts}</strong>
													<button
														type="button"
														className="btn btn-ghost"
														style={{
															minHeight: 26,
															padding: "0 8px",
															fontSize: 14,
														}}
														disabled={
															busy ||
															pts >= MAX_PER_PLAYER ||
															remaining <= 0
														}
														onClick={() => setPoints(p.pid, pts + 1)}
													>
														+
													</button>
												</div>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					)}
				</div>
			</section>
		</>
	);
};
