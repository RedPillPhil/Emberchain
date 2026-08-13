import { useEffect, useState } from "react";
import { runBeforeView } from "../util/league.ts";
import { toWorker } from "../util/toWorker.ts";
import { useDesktopStore } from "../store.ts";
import { formatRating } from "../util/scouting.ts";
import { countryFromLoc } from "../util/foreignLeagues.ts";
import {
	countryFaOvrRange,
	countryTierLabel,
} from "../util/countryBasketball.ts";
import { fmtMoney } from "../util/format.ts";

/**
 * Domestic free agents from a given country — generally well below NBA/G League
 * quality, scaled by FIBA strength of that country.
 */
export const CountryFreeAgents = () => {
	const revision = useDesktopStore((s) => s.revision);
	const country = useDesktopStore((s) => s.countryFaFilter) ?? "Spain";
	const scouting = useDesktopStore((s) => s.scouting);
	const openPlayer = useDesktopStore((s) => s.openPlayer);
	const setView = useDesktopStore((s) => s.setView);
	const readOnly = useDesktopStore((s) => s.readOnly);
	const pushToast = useDesktopStore((s) => s.pushToast);
	const [players, setPlayers] = useState<any[]>([]);
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		void (async () => {
			// Ensure a domestic pool exists for this country
			await toWorker("main", "ensureCountryFreeAgents", { country }).catch(
				console.error,
			);
			const data: any = await runBeforeView("freeAgents", {}).catch(
				console.error,
			);
			const all = data?.players ?? [];
			const filtered = all.filter(
				(p: any) =>
					countryFromLoc(p.born?.loc).toLowerCase() === country.toLowerCase(),
			);
			const [lo, hi] = countryFaOvrRange(country);
			setPlayers(
				filtered
					.filter((p: any) => {
						const ovr = p.ratings?.ovr ?? 0;
						return ovr >= lo - 5 && ovr <= hi + 8;
					})
					.sort(
						(a: any, b: any) => (b.ratings?.ovr ?? 0) - (a.ratings?.ovr ?? 0),
					),
			);
		})();
	}, [revision, country]);

	const [lo, hi] = countryFaOvrRange(country);

	const sign = async (p: any) => {
		if (readOnly || busy) {
			return;
		}
		setBusy(true);
		try {
			const amount =
				p.mood?.user?.contractAmount ??
				Math.round((p.contract?.amount ?? 1) * 1000);
			const error = await toWorker("main", "acceptContractNegotiation", {
				pid: p.pid,
				amount,
				exp: p.contract?.exp,
			});
			if (typeof error === "string" && error) {
				pushToast({ text: error, type: "error" });
			} else {
				pushToast({
					text: `Signed ${p.firstName} ${p.lastName}`,
					type: "info",
				});
				useDesktopStore.getState().bumpRevision();
			}
		} finally {
			setBusy(false);
		}
	};

	return (
		<>
			<h1 className="page-title">{country} Free Agents</h1>
			<p className="page-sub">
				Domestic pool from {country}. {countryTierLabel(country)}. Typical
				overalls land around {lo}–{hi} — well below NBA (and usually G League)
				talent.
			</p>

			<button
				type="button"
				className="btn btn-ghost"
				style={{ marginBottom: 12 }}
				onClick={() => setView("draft")}
			>
				← Draft Central
			</button>

			<section className="panel">
				<div className="panel-header">
					<span>Available</span>
					<span className="pill">{players.length} players</span>
				</div>
				<div className="panel-body" style={{ padding: 0 }}>
					{players.length === 0 ? (
						<div className="empty" style={{ padding: 20 }}>
							No free agents currently listed from {country}. A domestic pool
							is generated when you open this page — try again after a moment.
						</div>
					) : (
						<table className="data-table">
							<thead>
								<tr>
									<th>Pos</th>
									<th>Name</th>
									<th className="num">Age</th>
									<th className="num">Ovr</th>
									<th className="num">Asking</th>
									<th></th>
								</tr>
							</thead>
							<tbody>
								{players.map((p: any) => (
									<tr key={p.pid}>
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
											{fmtMoney(
												p.contract?.amount != null && p.contract.amount < 500
													? p.contract.amount
													: (p.mood?.user?.contractAmount ?? 0) / 1000,
											)}
										</td>
										<td>
											{!readOnly ? (
												<button
													type="button"
													className="btn btn-secondary"
													style={{
														minHeight: 26,
														fontSize: 12,
														padding: "2px 10px",
													}}
													disabled={busy}
													onClick={() => void sign(p)}
												>
													Sign
												</button>
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
