import { useEffect, useMemo, useState } from "react";
import {
	createDefaultLeague,
	getDefaultTeams,
	loadLeagueList,
	openLeague,
} from "../util/league.ts";
import { useDesktopStore } from "../store.ts";

type LeagueRow = {
	lid: number;
	name: string;
	teamName?: string;
	teamRegion?: string;
	season?: number;
	phaseText?: string;
};

export const Home = () => {
	const [leagues, setLeagues] = useState<LeagueRow[]>([]);
	const [name, setName] = useState("Pro Basketball League");
	const [abbrev, setAbbrev] = useState("PBL");
	const [commissioner, setCommissioner] = useState("Adam Silver");
	const [tid, setTid] = useState(0);
	const [busy, setBusy] = useState(false);
	const status = useDesktopStore((s) => s.status);
	const error = useDesktopStore((s) => s.error);
	const setError = useDesktopStore((s) => s.setError);

	const teams = useMemo(() => getDefaultTeams(), []);

	const refresh = async () => {
		const rows = (await loadLeagueList()) as LeagueRow[];
		setLeagues(rows ?? []);
	};

	useEffect(() => {
		void refresh().catch((err) => {
			setError(err instanceof Error ? err.message : String(err));
		});
	}, [setError]);

	const onCreate = async () => {
		setBusy(true);
		setError(undefined);
		try {
			await createDefaultLeague(name.trim() || "Pro Basketball League", tid, {
				abbrev: abbrev.trim() || "PBL",
				commissioner: commissioner.trim() || "Adam Silver",
			});
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="home-hero">
			<div className="home-card">
				<div className="home-card-header">
					<h1>
						Court <em>Desk</em>
					</h1>
					<p>
						Desktop franchise office — NBA-style league by default, dense
						management screens, and a full D1 college universe scouting
						alongside your season.
					</p>
				</div>
				<div className="home-card-body">
					<section>
						<div className="panel-header" style={{ margin: "-4px 0 12px" }}>
							Create New Universe
						</div>
						<div className="field">
							<label htmlFor="league-name">League name</label>
							<input
								id="league-name"
								value={name}
								onChange={(e) => setName(e.target.value)}
							/>
						</div>
						<div className="grid-2" style={{ gap: 12 }}>
							<div className="field">
								<label htmlFor="league-abbrev">League abbreviation</label>
								<input
									id="league-abbrev"
									value={abbrev}
									maxLength={8}
									onChange={(e) => setAbbrev(e.target.value.toUpperCase())}
								/>
							</div>
							<div className="field">
								<label htmlFor="commissioner">Commissioner</label>
								<input
									id="commissioner"
									value={commissioner}
									onChange={(e) => setCommissioner(e.target.value)}
								/>
							</div>
						</div>
						<div className="field">
							<label htmlFor="team-select">Your team</label>
							<select
								id="team-select"
								value={tid}
								onChange={(e) => setTid(Number(e.target.value))}
							>
								{teams.map((t) => (
									<option key={t.tid} value={t.tid}>
										{t.region} {t.name}
									</option>
								))}
							</select>
						</div>
						<p className="muted" style={{ marginTop: 0 }}>
							Defaults: NBA-style conferences/divisions, 82-game season, soft
							cap. College D1 (360) attaches as a parallel universe.
						</p>
						<button
							className="btn btn-primary"
							type="button"
							disabled={busy}
							onClick={() => void onCreate()}
						>
							{busy ? "Creating..." : "Start Franchise"}
						</button>
						{status ? <div className="status-bar">{status}</div> : null}
						{error ? <div className="status-bar error">{error}</div> : null}
					</section>

					<section>
						<div className="panel-header" style={{ margin: "-4px 0 12px" }}>
							Continue Career
						</div>
						{leagues.length === 0 ? (
							<div className="empty">No saved leagues yet.</div>
						) : (
							<div className="league-list">
								{leagues.map((l) => (
									<button
										key={l.lid}
										type="button"
										className="league-row"
										onClick={() => void openLeague(l.lid)}
									>
										<div>
											<strong>{l.name}</strong>
											<small>
												{l.teamRegion} {l.teamName}
												{l.season != null ? ` · ${l.season}` : ""}
												{l.phaseText ? ` · ${l.phaseText}` : ""}
											</small>
										</div>
										<span className="pill">Load</span>
									</button>
								))}
							</div>
						)}
					</section>
				</div>
			</div>
		</div>
	);
};
