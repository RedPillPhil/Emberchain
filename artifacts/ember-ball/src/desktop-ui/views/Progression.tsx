import { useDesktopStore } from "../store.ts";
import { toWorker } from "../util/toWorker.ts";

/**
 * Post-camp annual progression report — who went up, who slid, who you trained.
 */
export const Progression = () => {
	const results = useDesktopStore((s) => s.progressionResults);
	const setView = useDesktopStore((s) => s.setView);
	const setStatus = useDesktopStore((s) => s.setStatus);
	const bumpRevision = useDesktopStore((s) => s.bumpRevision);
	const openPlayer = useDesktopStore((s) => s.openPlayer);
	const pushToast = useDesktopStore((s) => s.pushToast);

	const gainers = (results ?? []).filter((p) => p.ovrDelta > 0).length;
	const decliners = (results ?? []).filter((p) => p.ovrDelta < 0).length;

	const openingNight = async () => {
		setStatus("Advancing to Opening Night...");
		try {
			await toWorker("playMenu", "untilRegularSeason", undefined);
			await toWorker("main", "fixScheduleDays", undefined).catch(
				() => undefined,
			);
			bumpRevision();
			pushToast({
				text: "Opening Night — hit Play for tip-off",
				type: "info",
			});
			setView("dashboard");
			setStatus("Opening Night ready");
		} catch (error) {
			console.error(error);
			pushToast({ text: "Could not start regular season", type: "error" });
			setStatus("Error");
		}
	};

	return (
		<>
			<h1 className="page-title">Player Progression</h1>
			<p className="page-sub">
				Offseason development results for your roster. Green means growth;
				red means decline. Trained players got camp focus before these progs.
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
								{gainers} improved · {decliners} declined ·{" "}
								{(results ?? []).length} on roster
							</strong>
						</div>
						<button
							type="button"
							className="btn btn-primary"
							onClick={() => void openingNight()}
						>
							Opening Night (Oct 20) →
						</button>
					</div>
				</div>
			</section>

			<section className="panel">
				<div className="panel-header">
					<span>Development Report</span>
				</div>
				<div className="panel-body" style={{ padding: 0 }}>
					{!results?.length ? (
						<div className="empty" style={{ padding: 20 }}>
							No progression data yet — run Training Camp first.
						</div>
					) : (
						<table className="data-table">
							<thead>
								<tr>
									<th>Pos</th>
									<th>Player</th>
									<th className="num">Age</th>
									<th className="num">Ovr</th>
									<th className="num">Δ</th>
									<th className="num">Pot</th>
									<th className="num">Δ Pot</th>
									<th></th>
								</tr>
							</thead>
							<tbody>
								{results.map((p) => (
									<tr key={p.pid}>
										<td>{p.pos}</td>
										<td>
											<button
												type="button"
												className="player-link"
												onClick={() => openPlayer(p.pid)}
											>
												{p.firstName} {p.lastName}
											</button>
										</td>
										<td className="num">{p.age}</td>
										<td className="num">
											{p.ovrBefore}
											<span className="muted"> → </span>
											{p.ovr}
										</td>
										<td
											className="num"
											style={{
												color:
													p.ovrDelta > 0
														? "#2fd67b"
														: p.ovrDelta < 0
															? "#ef5b5b"
															: undefined,
												fontWeight: p.ovrDelta !== 0 ? 700 : 400,
											}}
										>
											{p.ovrDelta > 0 ? `+${p.ovrDelta}` : p.ovrDelta}
										</td>
										<td className="num">
											{p.potBefore}
											<span className="muted"> → </span>
											{p.pot}
										</td>
										<td
											className="num"
											style={{
												color:
													p.potDelta > 0
														? "#2fd67b"
														: p.potDelta < 0
															? "#ef5b5b"
															: undefined,
											}}
										>
											{p.potDelta > 0 ? `+${p.potDelta}` : p.potDelta}
										</td>
										<td>
											{p.trained ? (
												<span className="pill">Camp</span>
											) : null}
										</td>
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
