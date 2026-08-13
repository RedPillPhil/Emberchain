import { useDesktopStore } from "../store.ts";
import {
	hireStaff,
	refreshCandidates,
	STAFF_ROLES,
} from "../util/scouting.ts";

const specialtyLabel = {
	ability: "Ability-focused",
	potential: "Potential-focused",
	balanced: "Balanced",
} as const;

export const Staff = () => {
	const lid = useDesktopStore((s) => s.lid);
	const scouting = useDesktopStore((s) => s.scouting);
	const setScouting = useDesktopStore((s) => s.setScouting);
	const pushToast = useDesktopStore((s) => s.pushToast);

	return (
		<>
			<h1 className="page-title">Front Office Staff</h1>
			<p className="page-sub">
				Your staff drives the scouting department. The Head Scout sets daily
				scouting-point income and overall report accuracy; area scouts sharpen
				reports on their turf. Higher-rated scouts file tighter reports — but no
				report is ever a guarantee.
			</p>

			<div className="college-banner">
				<div>
					<strong>Scouting points: {scouting.points}</strong>
					<div className="muted">
						Daily income scales with your Head Scout&apos;s rating (~1.0 to
						~1.5 pts/day)
					</div>
				</div>
				<button
					type="button"
					className="btn btn-secondary"
					onClick={() => {
						if (lid == null) {
							return;
						}
						setScouting(refreshCandidates(lid, scouting));
						pushToast({ text: "New candidate pool available", type: "info" });
					}}
				>
					Refresh Candidates
				</button>
			</div>

			{STAFF_ROLES.map(({ role, label, blurb }) => {
				const current = scouting.staff[role];
				const candidates = scouting.candidates[role] ?? [];
				return (
					<section className="panel" key={role} style={{ marginBottom: 14 }}>
						<div className="panel-header">
							<span>{label}</span>
							<span className="pill">{blurb}</span>
						</div>
						<div className="panel-body" style={{ padding: 0 }}>
							<table className="data-table">
								<thead>
									<tr>
										<th>Name</th>
										<th className="num">Rating</th>
										<th>Style</th>
										<th>Status</th>
										<th></th>
									</tr>
								</thead>
								<tbody>
									<tr>
										<td className="team-user">{current.name}</td>
										<td className="num">{current.rating}</td>
										<td>{specialtyLabel[current.specialty]}</td>
										<td>
											<span className="pill">On Staff</span>
										</td>
										<td></td>
									</tr>
									{candidates.map((c, i) => (
										<tr key={`${c.name}-${i}`}>
											<td>{c.name}</td>
											<td className="num">{c.rating}</td>
											<td>{specialtyLabel[c.specialty]}</td>
											<td className="muted">Candidate</td>
											<td>
												<button
													type="button"
													className="btn btn-ghost"
													style={{
														minHeight: 28,
														fontSize: 12,
														padding: "4px 8px",
													}}
													onClick={() => {
														if (lid == null) {
															return;
														}
														setScouting(hireStaff(lid, scouting, role, i));
														const isScoutRole =
															role === "headScout" ||
															role === "proScout" ||
															role === "collegeScout";
														pushToast({
															text: isScoutRole
																? `${c.name} hired as ${label} — fully scouted players can be re-evaluated`
																: `${c.name} hired as ${label}`,
															type: "info",
														});
													}}
												>
													Hire
												</button>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</section>
				);
			})}
		</>
	);
};
