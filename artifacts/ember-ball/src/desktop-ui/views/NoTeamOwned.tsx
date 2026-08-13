import { useDesktopStore } from "../store.ts";

/** Shown when a crypto spectator opens a franchise-only page without a claim. */
export const NoTeamOwned = () => {
	const setView = useDesktopStore((s) => s.setView);

	return (
		<>
			<h1 className="page-title">No Team Owned</h1>
			<p className="page-sub">
				You currently are not the owner of a team. Claim a franchise from League
				Home (10,000 EMBR on EmberChain) to unlock your roster, staff, and trade
				desk. League pages stay open for browsing.
			</p>
			<button
				type="button"
				className="btn btn-primary"
				onClick={() => setView("dashboard")}
			>
				League Home — Claim a Team
			</button>
		</>
	);
};
