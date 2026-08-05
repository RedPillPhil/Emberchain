import { useCallback, useEffect, useMemo, useState } from "react";
import {
	EMBERCHAIN,
	LEAGUE_TOKEN,
	PLATFORM_TOKEN,
	captureCreationFeeQuote,
	fetchChainStatus,
	formatFeeFraction,
	getConnectedWallet,
	getFeeDenominator,
	isDevWallet,
	shortenAddress,
	splitJoinFee,
	type FeeQuote,
} from "../../common/crypto.ts";
import { formatEmbr, isQuoteValid } from "../../common/emberchain.ts";
import useTitleBar from "../hooks/useTitleBar.tsx";
import { logEvent } from "../util/logEvent.ts";
import { connectWallet, disconnectWallet } from "../util/wallet.ts";
import { toWorker } from "../util/toWorker.ts";
import { realtimeUpdate } from "../util/realtimeUpdate.ts";

type Mode = "pick" | "crypto";

const CreateLeague = () => {
	const params = useMemo(
		() => new URLSearchParams(window.location.search),
		[],
	);
	const initialMode: Mode =
		params.get("mode") === "crypto" ? "crypto" : "pick";

	const [mode, setMode] = useState<Mode>(initialMode);
	const [wallet, setWallet] = useState<string | null>(null);
	const [name, setName] = useState("My Crypto League");
	const [access, setAccess] = useState<"public" | "code">("public");
	const [joinFee, setJoinFee] = useState(250);
	const [numTeams, setNumTeams] = useState(30);

	const [quote, setQuote] = useState<FeeQuote | null>(null);
	const [liveSupply, setLiveSupply] = useState<number | null>(null);
	const [liveHeight, setLiveHeight] = useState<number | null>(null);
	const [statusError, setStatusError] = useState<string | null>(null);
	const [loadingQuote, setLoadingQuote] = useState(false);

	useTitleBar({ title: "Create League" });

	useEffect(() => {
		setWallet(getConnectedWallet());
		const sync = () => setWallet(getConnectedWallet());
		window.addEventListener("embr-wallet", sync);
		return () => window.removeEventListener("embr-wallet", sync);
	}, []);

	const refreshLive = useCallback(async () => {
		try {
			const status = await fetchChainStatus();
			setLiveSupply(status.totalSupplyEmbr);
			setLiveHeight(status.height);
			setStatusError(null);
			return status;
		} catch (error: any) {
			setStatusError(error?.message ?? "Could not reach Emberchain");
			return null;
		}
	}, []);

	const lockQuote = useCallback(async () => {
		setLoadingQuote(true);
		try {
			const q = await captureCreationFeeQuote(getFeeDenominator());
			setQuote(q);
			setLiveSupply(q.totalSupplyEmbr);
			setLiveHeight(q.quotedAtHeight);
			setStatusError(null);
		} catch (error: any) {
			setStatusError(error?.message ?? "Failed to quote creation fee");
		} finally {
			setLoadingQuote(false);
		}
	}, []);

	useEffect(() => {
		if (mode !== "crypto") {
			return;
		}
		void lockQuote();
		const id = window.setInterval(() => {
			void refreshLive();
		}, 4000);
		return () => window.clearInterval(id);
	}, [mode, lockQuote, refreshLive]);

	const feeSplit = splitJoinFee(joinFee);
	const liveFee =
		liveSupply !== null
			? liveSupply / Math.max(1, getFeeDenominator())
			: null;
	const quoteExpired =
		quote && liveHeight !== null
			? !isQuoteValid(quote, liveHeight)
			: false;

	const createCryptoLeague = async () => {
		if (!wallet) {
			logEvent({
				type: "error",
				text: "Connect your Emberchain wallet before creating a crypto league.",
				saveToDb: false,
			});
			return;
		}
		if (!quote) {
			logEvent({
				type: "error",
				text: "Fee quote not ready — wait for Emberchain status.",
				saveToDb: false,
			});
			return;
		}

		const tip = await refreshLive();
		if (!tip || !isQuoteValid(quote, tip.height)) {
			logEvent({
				type: "error",
				text: `Quote expired (must be within ${EMBERCHAIN.quoteMaxAgeBlocks} blocks of tip). Refreshing quote…`,
				saveToDb: false,
				showNotification: true,
			});
			await lockQuote();
			return;
		}

		try {
			const { lid, joinCode } = await toWorker(
				"main",
				"createCryptoLeagueLocal",
				{
					name,
					access,
					joinFeeEmbr: joinFee,
					numTeams,
					wallet,
				},
			);

			logEvent({
				type: "success",
				text:
					access === "public"
						? `League created and listed as public. No on-chain fee charged yet (contracts not live). Open Multiplayer to claim teams.`
						: `Private/code league created. Invite code: ${joinCode}. It will not appear in the public list.`,
				saveToDb: false,
				showNotification: true,
				persistent: true,
			});
			realtimeUpdate([], `/l/${lid}/multiplayer`);
		} catch (error: any) {
			logEvent({
				type: "error",
				text: error?.message ?? "Could not create league",
				saveToDb: false,
				showNotification: true,
			});
		}
	};

	if (mode === "pick") {
		return (
			<div className="embr-page embr-page-dark">
				<h2 className="embr-section-title">Create a league</h2>
				<p className="embr-section-lead">
					Commissioners set the rules. Crypto leagues settle creation fees in
					live EMBR against Emberchain supply. Offline leagues stay free.
				</p>
				<div className="embr-mode-grid">
					<button
						type="button"
						className="embr-mode text-start"
						onClick={() => setMode("crypto")}
						style={{ cursor: "pointer", width: "100%" }}
					>
						<h3>Crypto league</h3>
						<p>
							Pay {formatFeeFraction()} of Emberchain total supply at the block
							height when you open this form. Teams mint as NFTs. League play
							runs on {LEAGUE_TOKEN}.
						</p>
						<div className="embr-mode-meta">Continue →</div>
					</button>
					<a href="/new_league" className="embr-mode embr-mode-offline">
						<h3>Offline league</h3>
						<p>
							No fees, no wallet. Full sim with fictional or real players —
							classic GM tools, Ember Ball skin.
						</p>
						<div className="embr-mode-meta">Open wizard →</div>
					</a>
				</div>
			</div>
		);
	}

	return (
		<div className="embr-page embr-page-dark">
			<button
				type="button"
				className="btn btn-link px-0 mb-2 text-white"
				onClick={() => setMode("pick")}
			>
				← Back
			</button>
			<h2 className="embr-section-title">Crypto league settings</h2>
			<p className="embr-section-lead">
				You become commissioner on create. Your creation fee is locked to the
				Emberchain height when you entered this page — live supply keeps
				climbing on screen so you can see the market move, but you pay the
				quoted amount if you submit within {EMBERCHAIN.quoteMaxAgeBlocks}{" "}
				blocks.
			</p>

			<div className="embr-create-form">
				<div className="mb-3 d-flex flex-wrap gap-2 align-items-center">
					{wallet ? (
						<>
							<span className="embr-wallet-pill">
								{shortenAddress(wallet, 6)}
								{isDevWallet(wallet) ? " · DEV" : ""}
							</span>
							<button
								type="button"
								className="btn btn-sm btn-outline-light"
								onClick={() => {
									disconnectWallet();
									setWallet(null);
								}}
							>
								Disconnect
							</button>
						</>
					) : (
						<button
							type="button"
							className="embr-btn embr-btn-primary"
							onClick={async () => {
								const addr = await connectWallet();
								setWallet(addr);
							}}
						>
							Connect wallet
						</button>
					)}
				</div>

				<div className="embr-fee-box">
					<div className="embr-fee-label">
						Locked creation fee ({PLATFORM_TOKEN}) · quote @ block{" "}
						{quote?.quotedAtHeight?.toLocaleString() ?? "…"}
					</div>
					<div className="embr-fee-locked">
						{loadingQuote
							? "Fetching Emberchain…"
							: quote
								? `${formatEmbr(quote.feeEmbr)} ${PLATFORM_TOKEN}`
								: "—"}
					</div>
					{liveFee !== null ? (
						<div className="embr-fee-live">
							Live tip fee now: {formatEmbr(liveFee)} {PLATFORM_TOKEN} (block{" "}
							{liveHeight?.toLocaleString()}) — climbing as new blocks mint EMBR
						</div>
					) : null}
					<div className="embr-fee-meta">
						{formatFeeFraction()} of supply · expires at block{" "}
						{quote?.expiresAtHeight?.toLocaleString() ?? "—"} · window{" "}
						{EMBERCHAIN.quoteMaxAgeBlocks} blocks
						{quoteExpired ? (
							<span className="text-danger"> · QUOTE EXPIRED — refresh</span>
						) : null}
						{statusError ? (
							<span className="text-warning"> · {statusError}</span>
						) : null}
					</div>
					<button
						type="button"
						className="btn btn-sm btn-outline-light mt-2"
						onClick={() => void lockQuote()}
						disabled={loadingQuote}
					>
						Refresh quote
					</button>
				</div>

				<div className="mb-3">
					<label className="form-label" htmlFor="league-name">
						League name
					</label>
					<input
						id="league-name"
						className="form-control"
						value={name}
						onChange={(e) => setName(e.target.value)}
					/>
				</div>

				<div className="mb-3">
					<label className="form-label" htmlFor="access">
						Join access
					</label>
					<select
						id="access"
						className="form-select"
						value={access}
						onChange={(e) =>
							setAccess(e.target.value === "code" ? "code" : "public")
						}
					>
						<option value="public">Publicly joinable (listed for everyone)</option>
						<option value="code">Private — join with code (not listed)</option>
					</select>
				</div>

				<div className="row g-3 mb-3">
					<div className="col-sm-6">
						<label className="form-label" htmlFor="join-fee">
							Team join fee ({PLATFORM_TOKEN})
						</label>
						<input
							id="join-fee"
							type="number"
							min={0}
							className="form-control"
							value={joinFee}
							onChange={(e) => setJoinFee(Number(e.target.value) || 0)}
						/>
						<div className="embr-hint">
							{feeSplit.prizePool.toLocaleString()} → prize pool (90%) ·{" "}
							{feeSplit.dev.toLocaleString()} → platform (10%)
						</div>
					</div>
					<div className="col-sm-6">
						<label className="form-label" htmlFor="num-teams">
							Number of teams
						</label>
						<input
							id="num-teams"
							type="number"
							min={2}
							max={64}
							className="form-control"
							value={numTeams}
							onChange={(e) => setNumTeams(Number(e.target.value) || 2)}
						/>
					</div>
				</div>

				<button
					type="button"
					className="embr-btn embr-btn-primary"
					onClick={() => void createCryptoLeague()}
					disabled={!quote || quoteExpired}
				>
					Create crypto league
				</button>
				<p className="embr-hint mt-2 text-white-50">
					Submit sends your locked quote (height + fee). Contract rejects stale
					quotes (&gt;{EMBERCHAIN.quoteMaxAgeBlocks} blocks) and mismatched
					amounts. Use <a href="/new_league">offline league</a> to play the sim
					today.
				</p>
			</div>
		</div>
	);
};

export default CreateLeague;
