import { useCallback, useEffect, useState } from "react";
import { runBeforeView } from "../util/league.ts";
import { toWorker } from "../util/toWorker.ts";
import { useDesktopStore } from "../store.ts";
import { formatRating } from "../util/scouting.ts";
import { TeamLink } from "../components/TeamLink.tsx";

type Side = {
	tid: number;
	pids: number[];
	pidsExcluded: number[];
	dpids: number[];
	dpidsExcluded: number[];
};
type TradeTeams = [Side, Side];

export const Trade = () => {
	const revision = useDesktopStore((s) => s.revision);
	const userTid = useDesktopStore((s) => s.local.userTid) ?? 0;
	const scouting = useDesktopStore((s) => s.scouting);
	const readOnly = useDesktopStore((s) => s.readOnly);
	const openPlayer = useDesktopStore((s) => s.openPlayer);
	const pushToast = useDesktopStore((s) => s.pushToast);
	const bumpRevision = useDesktopStore((s) => s.bumpRevision);
	const [data, setData] = useState<any>(null);
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState<string | null>(null);

	const refetch = useCallback(async () => {
		const fresh = await runBeforeView("trade", {}).catch(console.error);
		if (fresh) {
			setData(fresh);
		}
	}, []);

	useEffect(() => {
		void refetch();
	}, [revision, refetch]);

	if (!data) {
		return (
			<>
				<h1 className="page-title">Trade Desk</h1>
				<p className="page-sub">Loading trade board...</p>
			</>
		);
	}

	const summary = data.summary;
	const teams: any[] = data.teams ?? [];

	const buildTeams = (): TradeTeams => [
		{
			tid: userTid,
			pids: [...(data.userPids ?? [])],
			pidsExcluded: [...(data.userPidsExcluded ?? [])],
			dpids: [...(data.userDpids ?? [])],
			dpidsExcluded: [...(data.userDpidsExcluded ?? [])],
		},
		{
			tid: data.otherTid,
			pids: [...(data.otherPids ?? [])],
			pidsExcluded: [...(data.otherPidsExcluded ?? [])],
			dpids: [...(data.otherDpids ?? [])],
			dpidsExcluded: [...(data.otherDpidsExcluded ?? [])],
		},
	];

	const togglePid = async (side: "user" | "other", pid: number) => {
		if (readOnly || busy) {
			return;
		}
		const teams2 = buildTeams();
		const idx = side === "user" ? 0 : 1;
		const list = teams2[idx]!.pids;
		teams2[idx]!.pids = list.includes(pid)
			? list.filter((x) => x !== pid)
			: [...list, pid];
		setBusy(true);
		try {
			await toWorker("main", "updateTrade", teams2);
			await refetch();
			setMessage(null);
		} finally {
			setBusy(false);
		}
	};

	const toggleDpid = async (side: "user" | "other", dpid: number) => {
		if (readOnly || busy) {
			return;
		}
		const teams2 = buildTeams();
		const idx = side === "user" ? 0 : 1;
		const list = teams2[idx]!.dpids;
		teams2[idx]!.dpids = list.includes(dpid)
			? list.filter((x) => x !== dpid)
			: [...list, dpid];
		setBusy(true);
		try {
			await toWorker("main", "updateTrade", teams2);
			await refetch();
			setMessage(null);
		} finally {
			setBusy(false);
		}
	};

	const changePartner = async (tid: number) => {
		if (readOnly || busy) {
			return;
		}
		setBusy(true);
		try {
			await toWorker("main", "createTrade", [
				{
					tid: userTid,
					pids: [],
					pidsExcluded: [],
					dpids: [],
					dpidsExcluded: [],
				},
				{
					tid,
					pids: [],
					pidsExcluded: [],
					dpids: [],
					dpidsExcluded: [],
				},
			] as TradeTeams);
			await refetch();
			setMessage(null);
		} finally {
			setBusy(false);
		}
	};

	const propose = async () => {
		if (readOnly || busy) {
			return;
		}
		setBusy(true);
		try {
			const result: any = await toWorker("main", "proposeTrade", false);
			setMessage(result?.message ?? null);
			if (result?.accepted) {
				pushToast({ text: "Trade accepted!", type: "info" });
				bumpRevision();
			} else if (result?.message) {
				pushToast({ text: result.message, type: "error" });
			}
			await refetch();
		} finally {
			setBusy(false);
		}
	};

	const askAi = async () => {
		if (readOnly || busy) {
			return;
		}
		setBusy(true);
		try {
			const msg = await toWorker("main", "tradeCounterOffer", undefined);
			setMessage(typeof msg === "string" ? msg : "AI adjusted the offer");
			await refetch();
		} finally {
			setBusy(false);
		}
	};

	const clear = async () => {
		if (readOnly || busy) {
			return;
		}
		setBusy(true);
		try {
			await toWorker("main", "clearTrade", "all");
			await refetch();
			setMessage(null);
		} finally {
			setBusy(false);
		}
	};

	const renderRoster = (
		side: "user" | "other",
		roster: any[],
		selected: number[],
	) => (
		<table className="data-table">
			<thead>
				<tr>
					<th></th>
					<th>Pos</th>
					<th>Name</th>
					<th className="num">Ovr</th>
					<th className="num">Age</th>
					<th className="num">$</th>
				</tr>
			</thead>
			<tbody>
				{(roster ?? []).map((p: any) => {
					const on = selected.includes(p.pid);
					return (
						<tr
							key={p.pid}
							style={{
								background: on ? "rgba(94,155,255,0.12)" : undefined,
								opacity: p.untradable ? 0.45 : 1,
							}}
						>
							<td>
								<input
									type="checkbox"
									checked={on}
									disabled={readOnly || !!p.untradable || busy}
									onChange={() => void togglePid(side, p.pid)}
								/>
							</td>
							<td>{p.ratings?.pos}</td>
							<td>
								<button
									type="button"
									className="player-link"
									onClick={() => openPlayer(p.pid)}
								>
									{p.firstName} {p.lastName}
								</button>
							</td>
							<td className="num">
								{formatRating(scouting, p.pid, p.ratings?.ovr, "ovr")}
							</td>
							<td className="num">{p.age}</td>
							<td className="num">
								{p.contract?.amount != null
									? `$${Number(p.contract.amount).toFixed(1)}M`
									: "—"}
							</td>
						</tr>
					);
				})}
			</tbody>
		</table>
	);

	const renderPicks = (
		side: "user" | "other",
		picks: any[],
		selected: number[],
	) => (
		<div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: 10 }}>
			{(picks ?? []).map((dp: any) => {
				const on = selected.includes(dp.dpid);
				const label = `${dp.season} R${dp.round}${
					dp.pick > 0 ? `.${dp.pick}` : ""
				}`;
				return (
					<button
						key={dp.dpid}
						type="button"
						className={`btn ${on ? "btn-primary" : "btn-ghost"}`}
						style={{ minHeight: 28, fontSize: 12, padding: "2px 10px" }}
						disabled={readOnly || busy}
						onClick={() => void toggleDpid(side, dp.dpid)}
					>
						{label}
					</button>
				);
			})}
			{(picks ?? []).length === 0 ? (
				<span className="muted">No tradable picks</span>
			) : null}
		</div>
	);

	const partner = teams.find((t) => t.tid === data.otherTid);

	return (
		<>
			<h1 className="page-title">Trade Desk</h1>
			<p className="page-sub">
				Build a package with another club. Check players and picks on both
				sides, then propose — or ask the AI for a counter that works.
			</p>

			<section className="panel" style={{ marginBottom: 14 }}>
				<div className="panel-body">
					<label className="muted" style={{ marginRight: 8 }}>
						Trade with
					</label>
					<select
						value={data.otherTid}
						disabled={readOnly || busy}
						onChange={(e) => void changePartner(Number(e.target.value))}
						style={{
							background: "#141a24",
							color: "#e8ecf3",
							border: "1px solid rgba(255,255,255,0.18)",
							borderRadius: 6,
							padding: "4px 8px",
						}}
					>
						{teams.map((t: any) => (
							<option key={t.tid} value={t.tid}>
								{t.region} {t.name}
							</option>
						))}
					</select>
					{!readOnly ? (
						<span style={{ marginLeft: 12, display: "inline-flex", gap: 8 }}>
							<button
								type="button"
								className="btn btn-primary"
								disabled={busy || !summary?.enablePropose}
								onClick={() => void propose()}
							>
								Propose Trade
							</button>
							<button
								type="button"
								className="btn btn-secondary"
								disabled={busy}
								onClick={() => void askAi()}
							>
								What would make this work?
							</button>
							<button
								type="button"
								className="btn btn-ghost"
								disabled={busy}
								onClick={() => void clear()}
							>
								Clear
							</button>
						</span>
					) : (
						<span className="pill" style={{ marginLeft: 12 }}>
							Read only
						</span>
					)}
					{message ? (
						<div style={{ marginTop: 10, color: "#ffb454" }}>{message}</div>
					) : null}
					{summary?.warning ? (
						<div style={{ marginTop: 8, color: "#ef5b5b", fontSize: 13 }}>
							{summary.warning}
						</div>
					) : null}
				</div>
			</section>

			<div className="grid-2">
				<section className="panel">
					<div className="panel-header">
						<span>You give</span>
						<span className="pill">{data.userTeamName ?? "Your team"}</span>
					</div>
					<div className="panel-body" style={{ padding: 0 }}>
						{renderRoster("user", data.userRoster, data.userPids ?? [])}
						<div className="panel-header" style={{ borderRadius: 0 }}>
							Draft picks
						</div>
						{renderPicks("user", data.userPicks, data.userDpids ?? [])}
					</div>
				</section>

				<section className="panel">
					<div className="panel-header">
						<span>You get</span>
						<span className="pill">
							<TeamLink tid={data.otherTid}>
								{partner
									? `${partner.region} ${partner.name}`
									: "Partner"}
							</TeamLink>
						</span>
					</div>
					<div className="panel-body" style={{ padding: 0 }}>
						{renderRoster("other", data.otherRoster, data.otherPids ?? [])}
						<div className="panel-header" style={{ borderRadius: 0 }}>
							Draft picks
						</div>
						{renderPicks("other", data.otherPicks, data.otherDpids ?? [])}
					</div>
				</section>
			</div>

			{summary?.teams ? (
				<section className="panel" style={{ marginTop: 14 }}>
					<div className="panel-header">Cap / OVR impact</div>
					<div className="panel-body">
						<div className="grid-2">
							{summary.teams.map((t: any, i: number) => (
								<div key={i}>
									<strong>{t.name}</strong>
									<div className="muted" style={{ fontSize: 13 }}>
										OVR {t.ovrBefore} → {t.ovrAfter} · Payroll after{" "}
										{t.payrollAfterTrade != null
											? `$${Number(t.payrollAfterTrade).toFixed(1)}M`
											: "—"}
									</div>
								</div>
							))}
						</div>
					</div>
				</section>
			) : null}
		</>
	);
};
