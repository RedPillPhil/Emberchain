import { useEffect, useState } from "react";
import { runBeforeView } from "../util/league.ts";
import { useDesktopStore } from "../store.ts";
import { fmtMoney } from "../util/format.ts";

export const Finances = () => {
	const revision = useDesktopStore((s) => s.revision);
	const openPlayer = useDesktopStore((s) => s.openPlayer);
	const [data, setData] = useState<any>(null);

	useEffect(() => {
		void runBeforeView("teamFinances", { show: "10" })
			.then(setData)
			.catch(console.error);
	}, [revision]);

	if (!data) {
		return (
			<>
				<h1 className="page-title">Finances</h1>
				<p className="page-sub">Loading cap sheet...</p>
			</>
		);
	}

	const t = data.t;
	const contracts: any[] = data.contracts ?? [];
	const seasons: number[] = data.salariesSeasons ?? [];

	return (
		<>
			<h1 className="page-title">Finances</h1>
			<p className="page-sub">
				Salary cap sheet, luxury tax exposure, and contract commitments.
			</p>

			<section className="panel" style={{ marginBottom: 14 }}>
				<div className="panel-body">
					<div
						style={{
							display: "grid",
							gridTemplateColumns: "repeat(4, minmax(120px, 1fr))",
							gap: 12,
						}}
					>
						<div>
							<div className="muted" style={{ fontSize: 11 }}>
								Payroll
							</div>
							<strong style={{ fontSize: 18 }}>
								{fmtMoney(data.payroll)}
							</strong>
						</div>
						<div>
							<div className="muted" style={{ fontSize: 11 }}>
								Luxury tax
							</div>
							<strong style={{ fontSize: 18 }}>
								{fmtMoney(data.luxuryTaxAmount)}
							</strong>
						</div>
						<div>
							<div className="muted" style={{ fontSize: 11 }}>
								Min payroll shortfall
							</div>
							<strong style={{ fontSize: 18 }}>
								{fmtMoney(data.minPayrollAmount)}
							</strong>
						</div>
						<div>
							<div className="muted" style={{ fontSize: 11 }}>
								Team
							</div>
							<strong style={{ fontSize: 18 }}>
								{t?.region} {t?.name}
							</strong>
						</div>
					</div>
				</div>
			</section>

			<section className="panel">
				<div className="panel-header">
					<span>Contracts</span>
					<span className="pill">{contracts.length} on books</span>
				</div>
				<div
					className="panel-body"
					style={{ padding: 0, overflowX: "auto" }}
				>
					<table className="data-table">
						<thead>
							<tr>
								<th>Pos</th>
								<th>Player</th>
								{seasons.map((y) => (
									<th key={y} className="num">
										{y}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{contracts.map((c: any) => (
								<tr key={`${c.pid}-${c.released ? "r" : "a"}`}>
									<td>{c.pos}</td>
									<td>
										{c.pid != null ? (
											<button
												type="button"
												className="player-link"
												onClick={() => openPlayer(c.pid)}
											>
												{c.firstName} {c.lastName}
												{c.released ? (
													<span className="muted"> (dead)</span>
												) : null}
											</button>
										) : (
											`${c.firstName} ${c.lastName}`
										)}
									</td>
									{(c.amounts ?? []).map((amt: number, i: number) => (
										<td key={i} className="num">
											{amt ? fmtMoney(amt) : "—"}
										</td>
									))}
								</tr>
							))}
							{contracts.length === 0 ? (
								<tr>
									<td colSpan={2 + seasons.length} className="empty">
										No contracts on the books.
									</td>
								</tr>
							) : null}
						</tbody>
					</table>
				</div>
			</section>
		</>
	);
};
