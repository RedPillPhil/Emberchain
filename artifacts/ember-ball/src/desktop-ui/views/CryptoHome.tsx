import { useEffect, useMemo, useState } from "react";
import {
	checkClaimEligibility,
	readLocalClaim,
	registerClaimWithApi,
} from "../crypto/antiAbuse.ts";
import {
	CLAIM_FEE_EMBR,
	EMBER_CHAIN,
	getTeamClaimAddress,
} from "../crypto/config.ts";
import {
	connectWallet,
	isWalletAvailable,
	sendClaimTeamTx,
} from "../crypto/wallet.ts";
import { useDesktopStore } from "../store.ts";
import {
	createDefaultLeague,
	getDefaultTeams,
	loadLeagueList,
	openLeague,
} from "../util/league.ts";

type TeamRow = {
	tid: number;
	region: string;
	name: string;
	abbrev: string;
};

const CRYPTO_LEAGUE_NAME = "Ember League";

/**
 * Browse-only Ember League home. Users can claim one franchise for 10,000 EMBR.
 * No GM actions until a later season unlock.
 */
export const CryptoHome = () => {
	const lid = useDesktopStore((s) => s.lid);
	const setCryptoMode = useDesktopStore((s) => s.setCryptoMode);
	const setClaimedTeam = useDesktopStore((s) => s.setClaimedTeam);
	const setView = useDesktopStore((s) => s.setView);
	const openTeam = useDesktopStore((s) => s.openTeam);
	const pushToast = useDesktopStore((s) => s.pushToast);
	const patchLocal = useDesktopStore((s) => s.patchLocal);
	const local = useDesktopStore((s) => s.local);
	const storeClaim = useDesktopStore((s) => s.claimedTeam);

	const teams = useMemo(() => getDefaultTeams() as TeamRow[], []);
	const [address, setAddress] = useState<string>();
	const [selectedTid, setSelectedTid] = useState(0);
	const [busy, setBusy] = useState(false);
	const [booting, setBooting] = useState(false);
	const [claim, setClaim] = useState(readLocalClaim);
	const [status, setStatus] = useState<string>();

	useEffect(() => {
		setCryptoMode(true);
		const existing = readLocalClaim();
		if (existing) {
			setClaim(existing);
			setClaimedTeam(existing);
		}
	}, [setCryptoMode, setClaimedTeam]);

	const applyClaim = (next: NonNullable<typeof claim>) => {
		setClaim(next);
		setClaimedTeam(next);
		const t = teams.find((x) => x.tid === next.tid);
		if (t) {
			patchLocal({
				userTid: next.tid,
				teamInfo: { region: t.region, name: t.name, abbrev: t.abbrev },
			});
		}
	};

	// Auto-open a shared spectator league so users can browse pages.
	useEffect(() => {
		if (lid != null) {
			return;
		}
		let cancelled = false;
		setBooting(true);
		void (async () => {
			try {
				const list = (await loadLeagueList()) as any[];
				const existing = list?.find(
					(l) =>
						String(l.name).toLowerCase() === CRYPTO_LEAGUE_NAME.toLowerCase(),
				);
				if (cancelled) {
					return;
				}
				if (existing) {
					await openLeague(existing.lid);
				} else {
					await createDefaultLeague(CRYPTO_LEAGUE_NAME, 0, {
						abbrev: "EMBR",
						commissioner: "Ember Desk",
					});
				}
				useDesktopStore.getState().setView("dashboard");
			} catch (err) {
				if (!cancelled) {
					setStatus(err instanceof Error ? err.message : String(err));
				}
			} finally {
				if (!cancelled) {
					setBooting(false);
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [lid]);

	const onConnect = async () => {
		setBusy(true);
		setStatus(undefined);
		try {
			const addr = await connectWallet();
			setAddress(addr);
			pushToast({ text: `Connected ${addr.slice(0, 6)}…${addr.slice(-4)}`, type: "info" });
		} catch (err) {
			setStatus(err instanceof Error ? err.message : String(err));
		} finally {
			setBusy(false);
		}
	};

	const onClaim = async () => {
		if (busy) {
			return;
		}
		setBusy(true);
		setStatus(undefined);
		try {
			const eligibility = await checkClaimEligibility(address);
			if (!eligibility.ok) {
				throw new Error(eligibility.reason ?? "Claim not allowed");
			}
			const addr = address ?? (await connectWallet());
			setAddress(addr);
			const again = await checkClaimEligibility(addr);
			if (!again.ok) {
				throw new Error(again.reason ?? "Claim not allowed");
			}
			if (!getTeamClaimAddress()) {
				// Preview mode: record local claim without chain until contract is live
				const localOnly = {
					address: addr,
					tid: selectedTid,
					at: Date.now(),
				};
				await registerClaimWithApi(localOnly);
				applyClaim(localOnly);
				pushToast({
					text: `Team reserved locally (contract not set). Deploy TeamClaim and set emberTeamClaimAddress.`,
					type: "info",
				});
				return;
			}
			const txHash = await sendClaimTeamTx(selectedTid, addr);
			const next = {
				address: addr,
				tid: selectedTid,
				txHash,
				at: Date.now(),
			};
			await registerClaimWithApi(next);
			applyClaim(next);
			pushToast({
				text: `Claimed ${teams[selectedTid]?.region} ${teams[selectedTid]?.name} — 10,000 EMBR`,
				type: "info",
			});
		} catch (err) {
			setStatus(err instanceof Error ? err.message : String(err));
		} finally {
			setBusy(false);
		}
	};

	const team = teams[selectedTid];
	const already = claim != null || storeClaim != null;
	const activeClaim = claim ?? storeClaim;

	return (
		<div className="crypto-home">
			<section className="crypto-hero">
				<div className="crypto-hero-copy">
					<p className="crypto-eyebrow">Emberchain · Chain {EMBER_CHAIN.chainId}</p>
					<h1>
						Ember <em>Ball</em> Crypto League
					</h1>
					<p className="crypto-lede">
						Draft Day-style GM basketball on Emberchain — browse the league now.
						Claim one franchise for{" "}
						<strong>{CLAIM_FEE_EMBR.toString()} EMBR</strong>. Full GM controls
						unlock after you own a team.
					</p>
					<div className="crypto-cta-row">
						{!isWalletAvailable() ? (
							<span className="pill">Wallet required to claim</span>
						) : null}
						<button
							type="button"
							className="btn btn-secondary"
							disabled={busy}
							onClick={() => void onConnect()}
						>
							{address
								? `${address.slice(0, 6)}…${address.slice(-4)}`
								: "Connect wallet"}
						</button>
						{lid != null ? (
							<button
								type="button"
								className="btn btn-primary"
								onClick={() => setView("standings")}
							>
								Browse league
							</button>
						) : null}
					</div>
					{status ? <div className="status-bar error">{status}</div> : null}
					{booting ? (
						<p className="muted">Loading spectator league…</p>
					) : null}
				</div>

				<div className="crypto-claim-panel panel">
					<div className="panel-header">
						<span>Claim a team</span>
						<span className="pill">{CLAIM_FEE_EMBR.toString()} EMBR</span>
					</div>
					<div className="panel-body">
						{already && activeClaim ? (
							<p>
								This browser already claimed{" "}
								<strong>
									{teams[activeClaim.tid]?.region}{" "}
									{teams[activeClaim.tid]?.name}
								</strong>
								. One team per address, IP, and device. Wallet ownership (NFT /
								claim receipt) is the login.
							</p>
						) : (
							<>
								<div className="field">
									<label htmlFor="claim-team">Franchise</label>
									<select
										id="claim-team"
										value={selectedTid}
										onChange={(e) => setSelectedTid(Number(e.target.value))}
									>
										{teams.map((t) => (
											<option key={t.tid} value={t.tid}>
												{t.region} {t.name} ({t.abbrev})
											</option>
										))}
									</select>
								</div>
								<p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
									Paying claims {team?.region} {team?.name}. On-chain: one team
									per wallet. Off-chain: one claim per IP + cookie/cache.
									{!getTeamClaimAddress()
										? " Contract address not set yet — local reservation only."
										: ""}
								</p>
								<button
									type="button"
									className="btn btn-primary"
									disabled={busy || already}
									onClick={() => void onClaim()}
								>
									{busy ? "…" : `Claim for ${CLAIM_FEE_EMBR.toString()} EMBR`}
								</button>
							</>
						)}
						{activeClaim?.txHash ? (
							<p className="muted" style={{ fontSize: 11, marginTop: 10 }}>
								Tx {activeClaim.txHash.slice(0, 10)}…
							</p>
						) : null}
					</div>
				</div>
			</section>

			{lid != null ? (
				<section className="panel" style={{ marginTop: 18 }}>
					<div className="panel-header">
						<span>League desk</span>
						<span className="pill">
							{local.season ?? "—"} · {local.phaseText ?? "Browse"}
						</span>
					</div>
					<div className="panel-body">
						<p className="muted" style={{ marginTop: 0 }}>
							Scroll the sidebar — standings, rosters, college, draft classes,
							finances, transactions, hall of fame. Actions are locked.
						</p>
						<div className="crypto-team-grid">
							{teams.map((t) => (
								<button
									key={t.tid}
									type="button"
									className="crypto-team-chip"
									onClick={() => openTeam(t.tid)}
								>
									<span className="abbrev">{t.abbrev}</span>
									<span>
										{t.region} {t.name}
									</span>
								</button>
							))}
						</div>
					</div>
				</section>
			) : null}
		</div>
	);
};
