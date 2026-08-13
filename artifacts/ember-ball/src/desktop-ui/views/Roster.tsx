import { useEffect, useState, type DragEvent } from "react";
import { runBeforeView } from "../util/league.ts";
import { toWorker } from "../util/toWorker.ts";
import { useDesktopStore } from "../store.ts";
import { formatRating, scoutPlayer } from "../util/scouting.ts";
import { fmtMoney } from "../util/format.ts";
import {
	LINEUP_SLOTS,
	positionFitFactor,
	positionFitGrade,
	type DesktopLineup,
	type LineupSlot,
} from "../../common/positionalFit.ts";

/**
 * Intended minutes are a soft target: they scale the engine's ptModifier
 * (target / 24 min baseline). The coach still reacts to foul trouble,
 * blowouts, and matchups, so actual minutes will vary night to night.
 */
const BASELINE_MIN = 24;

const ptToMinutes = (pt: number | undefined) =>
	Math.round((typeof pt === "number" ? pt : 1) * BASELINE_MIN);

const minutesToPt = (min: number) =>
	Math.max(0, Math.min(1.75, min / BASELINE_MIN));

const MINUTE_CHOICES = [0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40];

const DROPDOWN_BG = "#141a24";

const selectStyle = {
	background: DROPDOWN_BG,
	color: "#e8ecf3",
	border: "1px solid rgba(255,255,255,0.18)",
	borderRadius: 6,
	padding: "2px 6px",
} as const;

const optionStyle = { background: DROPDOWN_BG, color: "#e8ecf3" } as const;

const playerName = (p: any) => `${p.firstName} ${p.lastName}`;

/** Fit grade for a player in a slot ("sixth" has no positional penalty). */
const slotFit = (p: any, slotId: LineupSlot | "sixth") => {
	if (!p?.ratings || slotId === "sixth") {
		return undefined;
	}
	return positionFitFactor(p.ratings, slotId);
};

export const Roster = () => {
	const revision = useDesktopStore((s) => s.revision);
	const lid = useDesktopStore((s) => s.lid);
	const rosterTid = useDesktopStore((s) => s.rosterTid);
	const userTid = useDesktopStore((s) => s.local.userTid);
	const scouting = useDesktopStore((s) => s.scouting);
	const setScouting = useDesktopStore((s) => s.setScouting);
	const pushToast = useDesktopStore((s) => s.pushToast);
	const openPlayer = useDesktopStore((s) => s.openPlayer);
	const readOnly = useDesktopStore((s) => s.readOnly);
	const [data, setData] = useState<any>(null);
	const [lineup, setLineup] = useState<DesktopLineup>({});
	const [dragOverSlot, setDragOverSlot] = useState<string | undefined>();
	const [minuteOverrides, setMinuteOverrides] = useState<
		Record<number, number>
	>({});

	const viewingTid = rosterTid ?? userTid;
	const canEdit =
		!readOnly &&
		data?.editable === true &&
		(viewingTid == null || viewingTid === userTid);

	useEffect(() => {
		const params =
			viewingTid != null ? { abbrev: String(viewingTid) } : {};
		void runBeforeView("roster", params).then(setData).catch(console.error);
		if (viewingTid == null || viewingTid === userTid) {
			void toWorker("main", "getDesktopLineup", undefined)
				.then((saved: any) => setLineup(saved ?? {}))
				.catch(console.error);
		} else {
			setLineup({});
		}
	}, [revision, viewingTid, userTid]);

	const players = data?.players ?? [];
	const t = data?.t;

	const byPid = (pid: number | undefined) =>
		pid == null ? undefined : players.find((p: any) => p.pid === pid);

	const targetMinutes = (p: any): number =>
		minuteOverrides[p.pid] ?? ptToMinutes(p.ptModifier);

	const totalTarget = players.reduce(
		(sum: number, p: any) => sum + targetMinutes(p),
		0,
	);

	const saveLineup = (next: DesktopLineup) => {
		if (!canEdit) {
			return;
		}
		setLineup(next);
		void toWorker("main", "setDesktopLineup", next).catch((error) => {
			console.error(error);
			pushToast({ text: "Could not save lineup", type: "error" });
		});
	};

	const assignSlot = (slotId: string, pid: number) => {
		if (!canEdit) {
			return;
		}
		const next: DesktopLineup = { ...lineup };
		// A player can only fill one slot: if he's elsewhere, swap with the
		// current occupant of the target slot
		const from = (Object.keys(next) as (keyof DesktopLineup)[]).find(
			(k) => next[k] === pid,
		);
		const displaced = next[slotId as keyof DesktopLineup];
		if (from && from !== slotId) {
			next[from] = displaced;
		}
		next[slotId as keyof DesktopLineup] = pid;
		saveLineup(next);
	};

	const clearSlot = (slotId: string) => {
		const next: DesktopLineup = { ...lineup };
		delete next[slotId as keyof DesktopLineup];
		saveLineup(next);
	};

	const onDropSlot = (event: DragEvent, slotId: string) => {
		event.preventDefault();
		setDragOverSlot(undefined);
		const pid = Number(event.dataTransfer.getData("text/plain"));
		if (Number.isFinite(pid) && byPid(pid)) {
			assignSlot(slotId, pid);
		}
	};

	const onSetMinutes = (pid: number, min: number) => {
		if (!canEdit) {
			return;
		}
		setMinuteOverrides((prev) => ({ ...prev, [pid]: min }));
		void toWorker("main", "updatePlayingTime", {
			pid,
			ptModifier: minutesToPt(min),
		}).catch((error) => {
			console.error(error);
			pushToast({ text: "Could not save minutes", type: "error" });
		});
	};

	/** Proportionally rescale everyone's target so the team sums to 240. */
	const balanceMinutes = () => {
		const current = players.map((p: any) => ({
			pid: p.pid,
			min: targetMinutes(p),
		}));
		const total = current.reduce((s: number, c: any) => s + c.min, 0);
		if (total === 0) {
			pushToast({ text: "Set some minutes first", type: "error" });
			return;
		}
		// Largest-remainder rounding so the result is exactly 240
		const exact = current.map((c: any) => ({
			pid: c.pid,
			raw: (c.min * 240) / total,
		}));
		const floored = exact.map((e: any) => ({
			pid: e.pid,
			min: Math.min(42, Math.floor(e.raw)),
			frac: e.raw - Math.floor(e.raw),
		}));
		let remainder = 240 - floored.reduce((s: number, f: any) => s + f.min, 0);
		const byFrac = [...floored].sort((a, b) => b.frac - a.frac);
		for (const f of byFrac) {
			if (remainder <= 0) {
				break;
			}
			if (f.min < 42) {
				f.min += 1;
				remainder -= 1;
			}
		}

		const overrides: Record<number, number> = {};
		for (const f of floored) {
			overrides[f.pid] = f.min;
			void toWorker("main", "updatePlayingTime", {
				pid: f.pid,
				ptModifier: minutesToPt(f.min),
			}).catch(console.error);
		}
		setMinuteOverrides(overrides);
		pushToast({ text: "Rotation balanced to 240 minutes", type: "info" });
	};

	const onScout = (pid: number) => {
		if (lid == null) {
			return;
		}
		const result = scoutPlayer(lid, scouting, pid, "pro");
		setScouting(result.state);
		pushToast({ text: result.message, type: result.ok ? "info" : "error" });
	};

	const slotPid = (slotId: string) => lineup[slotId as keyof DesktopLineup];

	return (
		<>
			<h1 className="page-title">
				{t ? `${t.region} ${t.name}` : "Roster"}
			</h1>
			<p className="page-sub">
				{canEdit
					? "Drag players into the lineup card to set your starters and 6th man. Fit grades show how well a player's skill set matches the role."
					: "Viewing another team's roster — you can scout players, but only your own club is editable."}
			</p>

			<section className="panel" style={{ marginBottom: 14 }}>
				<div className="panel-header">
					<span>Starting Lineup</span>
					<span className="pill">
						{canEdit ? "Drag & drop from the roster below" : "Read only"}
					</span>
				</div>
				<div className="panel-body">
					<div
						style={{
							display: "grid",
							gridTemplateColumns: "repeat(6, minmax(120px, 1fr))",
							gap: 10,
						}}
					>
						{LINEUP_SLOTS.map((slot) => {
							const pid = slotPid(slot.id);
							const p = byPid(pid);
							const fit = p ? slotFit(p, slot.id) : undefined;
							const grade = fit != null ? positionFitGrade(fit) : undefined;
							const isOver = dragOverSlot === slot.id;
							return (
								<div
									key={slot.id}
									onDragOver={(event) => {
										event.preventDefault();
										setDragOverSlot(slot.id);
									}}
									onDragLeave={() =>
										setDragOverSlot((s) => (s === slot.id ? undefined : s))
									}
									onDrop={(event) => onDropSlot(event, slot.id)}
									style={{
										border: `1px ${p ? "solid" : "dashed"} ${
											isOver ? "#5e9bff" : "rgba(255,255,255,0.18)"
										}`,
										borderRadius: 10,
										padding: "10px 10px 8px",
										minHeight: 92,
										background: isOver
											? "rgba(94,155,255,0.08)"
											: "rgba(255,255,255,0.02)",
										display: "flex",
										flexDirection: "column",
										gap: 4,
									}}
								>
									<div
										style={{
											display: "flex",
											justifyContent: "space-between",
											alignItems: "center",
										}}
									>
										<strong style={{ fontSize: 13 }}>
											{slot.label}
											{slot.id === "sixth" ? (
												<span className="muted" style={{ fontWeight: 400 }}>
													{" "}
													man
												</span>
											) : null}
										</strong>
										{p && canEdit ? (
											<button
												type="button"
												title="Remove from slot"
												onClick={() => clearSlot(slot.id)}
												style={{
													background: "none",
													border: "none",
													color: "rgba(255,255,255,0.45)",
													cursor: "pointer",
													fontSize: 14,
													lineHeight: 1,
													padding: 0,
												}}
											>
												×
											</button>
										) : null}
									</div>
									{p ? (
										<div
											draggable={canEdit}
											onDragStart={(event) => {
												if (!canEdit) {
													return;
												}
												event.dataTransfer.setData(
													"text/plain",
													String(p.pid),
												);
											}}
											style={{ cursor: canEdit ? "grab" : "default" }}
										>
											<button
												type="button"
												className="player-link"
												style={{ fontSize: 13 }}
												onClick={() => openPlayer(p.pid)}
											>
												{playerName(p)}
											</button>
											<div className="muted" style={{ fontSize: 11 }}>
												Natural {p.ratings?.pos} ·{" "}
												{formatRating(scouting, p.pid, p.ratings?.ovr, "ovr")}{" "}
												ovr
											</div>
											{grade ? (
												<div style={{ fontSize: 12, marginTop: 2 }}>
													Fit:{" "}
													<strong style={{ color: grade.color }}>
														{grade.grade}
													</strong>
												</div>
											) : slot.id === "sixth" ? (
												<div
													className="muted"
													style={{ fontSize: 11, marginTop: 2 }}
												>
													First off the bench
												</div>
											) : null}
										</div>
									) : (
										<div
											className="muted"
											style={{ fontSize: 11, margin: "auto 0" }}
										>
											Drop a player here
										</div>
									)}
								</div>
							);
						})}
					</div>
					<p className="muted" style={{ margin: "10px 0 0", fontSize: 12 }}>
						Fit is based on the role&apos;s demands vs the player&apos;s
						ratings — a 7&apos;3&quot; bruiser is an A+ center, but he&apos;ll
						only survive at point guard if he genuinely has the speed,
						handle, and passing for it.
					</p>
				</div>
			</section>

			<section className="panel">
				<div className="panel-header">
					<span>Players &amp; Rotation</span>
					<span style={{ display: "flex", alignItems: "center", gap: 8 }}>
						{canEdit && totalTarget !== 240 ? (
							<button
								type="button"
								className="btn btn-ghost"
								style={{ minHeight: 26, fontSize: 12, padding: "2px 10px" }}
								title="Proportionally rescale everyone's target minutes to total exactly 240"
								onClick={balanceMinutes}
							>
								Balance to 240
							</button>
						) : null}
						<span
							className="pill"
							title="Sum of your intended minutes vs the 240 available per game (48 min × 5 spots)"
							style={
								totalTarget !== 240
									? { color: "#ffb454" }
									: { color: "#2fd67b" }
							}
						>
							Target {totalTarget} / 240 min
						</span>
					</span>
				</div>
				<div className="panel-body" style={{ padding: 0 }}>
					<table className="data-table">
						<thead>
							<tr>
								<th></th>
								<th>Pos</th>
								<th>Role</th>
								<th>Name</th>
								<th className="num">Age</th>
								<th className="num">Ovr</th>
								<th className="num">Pot</th>
								<th className="num" title="Intended minutes per game (soft target)">
									Target Min
								</th>
								<th className="num">GP</th>
								<th className="num">Min</th>
								<th className="num">Pts</th>
								<th className="num">Reb</th>
								<th className="num">Ast</th>
								<th className="num">Contract</th>
								<th></th>
							</tr>
						</thead>
						<tbody>
							{players.map((p: any) => {
								const assignedSlot = LINEUP_SLOTS.find(
									(slot) => slotPid(slot.id) === p.pid,
								);
								return (
									<tr key={p.pid}>
										<td
											draggable={canEdit}
											title={
												canEdit ? "Drag into a lineup slot" : "Read only"
											}
											onDragStart={(event) => {
												if (!canEdit) {
													return;
												}
												event.dataTransfer.setData(
													"text/plain",
													String(p.pid),
												);
											}}
											style={{
												cursor: canEdit ? "grab" : "default",
												color: "rgba(255,255,255,0.35)",
												width: 24,
												textAlign: "center",
											}}
										>
											{canEdit ? "⠿" : ""}
										</td>
										<td>{p.ratings?.pos}</td>
										<td>
											{assignedSlot ? (
												<span
													className="pill"
													style={{ fontSize: 11 }}
													title={
														assignedSlot.id === "sixth"
															? "6th man"
															: `Starting ${assignedSlot.label}`
													}
												>
													{assignedSlot.label}
												</span>
											) : (
												<span className="muted" style={{ fontSize: 11 }}>
													Bench
												</span>
											)}
										</td>
										<td>
											<button
												type="button"
												className="player-link"
												onClick={() => openPlayer(p.pid)}
											>
												{playerName(p)}
											</button>
										</td>
										<td className="num">{p.age}</td>
										<td className="num">
											{formatRating(scouting, p.pid, p.ratings?.ovr, "ovr")}
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
											{canEdit ? (
												<select
													value={targetMinutes(p)}
													onChange={(event) =>
														onSetMinutes(p.pid, Number(event.target.value))
													}
													style={selectStyle}
												>
													{[...new Set([...MINUTE_CHOICES, targetMinutes(p)])]
														.sort((a, b) => a - b)
														.map((min) => (
															<option
																key={min}
																value={min}
																style={optionStyle}
															>
																{min}
															</option>
														))}
												</select>
											) : (
												targetMinutes(p)
											)}
										</td>
										<td className="num">{p.stats?.gp ?? 0}</td>
										<td className="num">
											{p.stats?.min != null
												? Number(p.stats.min).toFixed(1)
												: "0.0"}
										</td>
										<td className="num">
											{p.stats?.pts != null
												? Number(p.stats.pts).toFixed(1)
												: "0.0"}
										</td>
										<td className="num">
											{p.stats?.trb != null
												? Number(p.stats.trb).toFixed(1)
												: "0.0"}
										</td>
										<td className="num">
											{p.stats?.ast != null
												? Number(p.stats.ast).toFixed(1)
												: "0.0"}
										</td>
										<td className="num">
											{p.contract?.amount != null
												? `${fmtMoney(p.contract.amount)} thru ${p.contract.exp}`
												: "—"}
										</td>
										<td>
											{!readOnly ? (
												<button
													type="button"
													className="btn btn-ghost"
													style={{
														minHeight: 28,
														fontSize: 12,
														padding: "4px 8px",
													}}
													onClick={() => onScout(p.pid)}
												>
													Scout
												</button>
											) : null}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			</section>
		</>
	);
};
