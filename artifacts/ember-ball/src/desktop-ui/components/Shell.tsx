import { useState, type ReactNode } from "react";
import {
	getDefaultTeams,
	nextOffseasonEvent,
	phaseKindFromText,
	playLiveGame,
	SIM_TARGETS,
	simTarget,
} from "../util/league.ts";
import { useDesktopStore, type DesktopViewId } from "../store.ts";

const getDefaultTeamsForChip = () => getDefaultTeams() as { tid: number; region: string; name: string }[];

const leagueNav: { id: DesktopViewId; label: string; glyph: string }[] = [
	{ id: "standings", label: "Standings", glyph: "ST" },
	{ id: "schedule", label: "Schedule", glyph: "SC" },
	{ id: "playoffs", label: "Playoffs", glyph: "PO" },
	{ id: "playerStats", label: "Player Stats", glyph: "PS" },
	{ id: "leaders", label: "League Leaders", glyph: "LD" },
	{ id: "awards", label: "Awards", glyph: "AW" },
	{ id: "freeAgents", label: "Free Agents", glyph: "FA" },
	{ id: "finances", label: "Finances", glyph: "$" },
	{ id: "transactions", label: "Transactions", glyph: "TX" },
	{ id: "hallOfFame", label: "Hall of Fame", glyph: "HF" },
	{ id: "college", label: "College", glyph: "CL" },
	{ id: "hsRankings", label: "HS Top 100", glyph: "HS" },
	{ id: "draft", label: "Draft", glyph: "DR" },
];

const teamNav: { id: DesktopViewId; label: string; glyph: string }[] = [
	{ id: "dashboard", label: "Dashboard", glyph: "HM" },
	{ id: "roster", label: "Roster", glyph: "RO" },
	{ id: "staff", label: "Staff", glyph: "FO" },
	{ id: "trade", label: "Trade", glyph: "TR" },
];

/**
 * Play/Sim controls. In season: Play = live play-by-play of your game,
 * Sim = dropdown of spans (1 day … through playoffs). In the offseason the
 * Play button becomes the next calendar event (lottery → draft → FA → camp).
 */
const SimBlock = ({
	error,
	status,
	phaseText,
}: {
	error: string | undefined;
	status: string | undefined;
	phaseText: string;
}) => {
	const [simOpen, setSimOpen] = useState(false);
	const [busy, setBusy] = useState(false);

	const phase = phaseKindFromText(phaseText);
	const inSeason = phase === "regular" || phase === "playoffs";
	const offseasonEvent = inSeason ? undefined : nextOffseasonEvent(phase);

	const run = async (fn: () => Promise<unknown>) => {
		if (busy) {
			return;
		}
		setBusy(true);
		setSimOpen(false);
		try {
			await fn();
		} finally {
			setBusy(false);
		}
	};

	const targets = SIM_TARGETS.filter(
		(t) => !inSeason || t.phases.includes(phase as "regular" | "playoffs"),
	);

	return (
		<div className="sim-block">
			<h2>{inSeason ? "Season" : "Offseason"}</h2>
			<div className="sim-actions" style={{ position: "relative" }}>
				{inSeason || offseasonEvent === undefined ? (
					<button
						className="btn btn-primary"
						type="button"
						disabled={busy}
						title="Live play-by-play of your next game (sims the day if you're off)"
						onClick={() => void run(() => playLiveGame())}
					>
						{busy ? "..." : "Play"}
					</button>
				) : (
					<>
						<button
							className="btn btn-primary"
							type="button"
							disabled={busy}
							style={{ whiteSpace: "normal", lineHeight: 1.2 }}
							onClick={() => void run(() => offseasonEvent.action())}
						>
							{busy ? "..." : offseasonEvent.label}
						</button>
						{offseasonEvent.secondary ? (
							<button
								className="btn btn-secondary"
								type="button"
								disabled={busy}
								style={{ whiteSpace: "normal", lineHeight: 1.2 }}
								onClick={() =>
									void run(() => offseasonEvent.secondary!.action())
								}
							>
								{busy ? "..." : offseasonEvent.secondary.label}
							</button>
						) : null}
					</>
				)}
				{inSeason ? (
					<>
						<button
							className="btn btn-secondary"
							type="button"
							disabled={busy}
							onClick={() => setSimOpen((o) => !o)}
						>
							Sim ▾
						</button>
						{simOpen ? (
							<div
								style={{
									position: "absolute",
									top: "100%",
									left: 0,
									right: 0,
									zIndex: 30,
									marginTop: 4,
									background: "#141a24",
									border: "1px solid rgba(255,255,255,0.12)",
									borderRadius: 8,
									overflow: "hidden",
									boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
								}}
							>
								{targets.map((t) => (
									<button
										key={t.id}
										type="button"
										className="nav-item"
										style={{ width: "100%", borderRadius: 0 }}
										onClick={() => void run(() => simTarget(t.id))}
									>
										{t.label}
									</button>
								))}
							</div>
						) : null}
					</>
				) : null}
			</div>
			<div className={`status-bar ${error ? "error" : ""}`}>
				{error ?? status}
			</div>
		</div>
	);
};

export const Shell = ({ children }: { children: ReactNode }) => {
	const view = useDesktopStore((s) => s.view);
	const setView = useDesktopStore((s) => s.setView);
	const status = useDesktopStore((s) => s.status);
	const error = useDesktopStore((s) => s.error);
	const local = useDesktopStore((s) => s.local);
	const scouting = useDesktopStore((s) => s.scouting);
	const setLid = useDesktopStore((s) => s.setLid);
	const readOnly = useDesktopStore((s) => s.readOnly);
	const cryptoMode = useDesktopStore((s) => s.cryptoMode);
	const claimedTeam = useDesktopStore((s) => s.claimedTeam);
	const notifications = useDesktopStore((s) => s.notifications);
	const unreadCount = useDesktopStore((s) => s.unreadCount);
	const notificationsOpen = useDesktopStore((s) => s.notificationsOpen);
	const toggleNotifications = useDesktopStore((s) => s.toggleNotifications);
	const clearNotifications = useDesktopStore((s) => s.clearNotifications);

	const season = local.season ?? "—";
	const phaseText = local.phaseText ?? "";
	const leagueName = local.leagueName ?? "Pro Basketball League";
	const teams = getDefaultTeamsForChip();
	const claimedMeta =
		claimedTeam != null
			? teams.find((t) => t.tid === claimedTeam.tid)
			: undefined;
	const teamName = cryptoMode
		? claimedMeta
			? `${claimedMeta.region} ${claimedMeta.name}`
			: "No team claimed"
		: local.teamInfo?.region && local.teamInfo?.name
			? `${local.teamInfo.region} ${local.teamInfo.name}`
			: "Your Team";

	return (
		<div className="app-shell">
			<header className="topbar">
				<div className="topbar-brand">
					<span className="mark">Ember</span>
					<span className="rest">Ball</span>
					<span className="ver">{cryptoMode ? "LEAGUE" : "GM"}</span>
				</div>
				<div className="topbar-league">{leagueName}</div>
				<div className="topbar-meta">
					{!(cryptoMode && !claimedTeam) ? (
						<div className="meta-chip">
							<span className="label">Franchise</span>
							<span className="value">{teamName}</span>
						</div>
					) : (
						<div className="meta-chip">
							<span className="label">Franchise</span>
							<span className="value" style={{ color: "var(--text-3)" }}>
								Unclaimed
							</span>
						</div>
					)}
					<div className="meta-chip">
						<span className="label">
							{phaseText ? phaseText : `Season ${season}`}
						</span>
						<span className="value">{local.dateString ?? `${season}`}</span>
					</div>
					{!cryptoMode ? (
						<div className="meta-chip">
							<span className="label">Scout Pts</span>
							<span className="value">{Math.floor(scouting.points)}</span>
						</div>
					) : null}

					<div className="notif-wrap">
						<button
							className="icon-btn notif-bell"
							title="Notifications"
							type="button"
							onClick={() => toggleNotifications()}
						>
							<svg
								width="18"
								height="18"
								viewBox="0 0 24 24"
								fill="currentColor"
								aria-hidden
							>
								<path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22zm7-6V11a7 7 0 1 0-14 0v5l-2 2v1h18v-1l-2-2z" />
							</svg>
							{unreadCount > 0 ? (
								<span className="notif-badge">
									{unreadCount > 99 ? "99+" : unreadCount}
								</span>
							) : null}
						</button>
						{notificationsOpen ? (
							<div className="notif-panel">
								<div className="notif-panel-header">
									<span>Notifications</span>
									<button
										type="button"
										className="btn btn-ghost"
										style={{ minHeight: 26, fontSize: 12, padding: "2px 8px" }}
										onClick={() => clearNotifications()}
									>
										Clear
									</button>
								</div>
								{notifications.length === 0 ? (
									<div className="empty" style={{ padding: 16 }}>
										No notifications yet.
									</div>
								) : (
									<ul className="notif-list">
										{notifications.map((n) => (
											<li
												key={n.id}
												className={n.type === "error" ? "error" : undefined}
											>
												{n.text}
											</li>
										))}
									</ul>
								)}
							</div>
						) : null}
					</div>

					<button
						className="icon-btn"
						title="Exit league"
						type="button"
						onClick={() => setLid(undefined)}
					>
						X
					</button>
				</div>
			</header>

			<div className="workspace">
				<aside className="sidebar">
					{readOnly || cryptoMode ? (
						<div className="sim-block">
							<h2>Ember League</h2>
							<p className="muted" style={{ fontSize: 12, margin: "0 0 8px" }}>
								Browse-only preview. Claim a team for 10,000 EMBR on EmberChain
								(7773) from the home page.
							</p>
							<button
								type="button"
								className="btn btn-primary"
								onClick={() => setView("dashboard")}
							>
								League Home
							</button>
						</div>
					) : (
						<SimBlock error={error} status={status} phaseText={phaseText} />
					)}

					<nav className="nav-section">
						<div className="nav-section-title">League Menu</div>
						{leagueNav.map((item) => (
							<button
								key={item.id}
								type="button"
								className={`nav-item ${
									view === item.id ||
									(item.id === "college" && view === "collegeTeam") ||
									(item.id === "schedule" && view === "boxScore")
										? "active"
										: ""
								}`}
								onClick={() => setView(item.id)}
							>
								<span className="glyph">{item.glyph}</span>
								{item.label}
							</button>
						))}
					</nav>

					<nav className="nav-section">
						<div className="nav-section-title">
							{cryptoMode && !claimedTeam ? "Team Menu (claim required)" : "Team Menu"}
						</div>
						{teamNav.map((item) => (
							<button
								key={item.id}
								type="button"
								className={`nav-item ${view === item.id ? "active" : ""}`}
								onClick={() => setView(item.id)}
								title={
									cryptoMode && !claimedTeam
										? "You currently are not the owner of a team"
										: undefined
								}
							>
								<span className="glyph">{item.glyph}</span>
								{item.label}
							</button>
						))}
					</nav>
				</aside>

				<main className="main">{children}</main>
			</div>
		</div>
	);
};
