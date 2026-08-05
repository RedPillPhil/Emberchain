import { useCallback, useEffect, useState } from "react";
import {
	DEV_ADDRESS,
	PLATFORM_TOKEN,
	decreaseFeeDenominator,
	fetchChainStatus,
	formatFeeFraction,
	getConnectedWallet,
	getFeeDenominator,
	increaseFeeDenominator,
	isDevWallet,
	shortenAddress,
} from "../../common/crypto.ts";
import { formatEmbr } from "../../common/emberchain.ts";
import useTitleBar from "../hooks/useTitleBar.tsx";
import { logEvent } from "../util/logEvent.ts";
import { connectWallet, disconnectWallet } from "../util/wallet.ts";

const CryptoAdmin = () => {
	const [wallet, setWallet] = useState<string | null>(null);
	const [denominator, setDenominator] = useState(getFeeDenominator());
	const [supply, setSupply] = useState<number | null>(null);
	const [height, setHeight] = useState<number | null>(null);

	useTitleBar({ title: "Platform Admin" });

	const refresh = useCallback(async () => {
		setDenominator(getFeeDenominator());
		setWallet(getConnectedWallet());
		try {
			const status = await fetchChainStatus();
			setSupply(status.totalSupplyEmbr);
			setHeight(status.height);
		} catch {
			// ignore
		}
	}, []);

	useEffect(() => {
		void refresh();
		const id = window.setInterval(() => void refresh(), 8000);
		return () => window.clearInterval(id);
	}, [refresh]);

	const fee = supply !== null ? supply / denominator : null;
	const isDev = isDevWallet(wallet);

	return (
		<div className="embr-page embr-page-dark">
			<h2 className="embr-section-title">Platform admin</h2>
			<p className="embr-section-lead">
				Creation fee = 1/N of live Emberchain supply. Increase doubles N
				(smaller fee). Decrease halves N (larger fee). Owner:{" "}
				<code>{shortenAddress(DEV_ADDRESS, 6)}</code>
			</p>

			<div className="mb-3 d-flex flex-wrap gap-2">
				{!wallet ? (
					<button
						type="button"
						className="embr-btn embr-btn-primary"
						onClick={async () => setWallet(await connectWallet())}
					>
						Connect wallet
					</button>
				) : (
					<>
						<span className="embr-wallet-pill">
							{shortenAddress(wallet, 6)}
							{isDev ? " · AUTHORIZED" : " · not admin"}
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
				)}
			</div>

			<div className="embr-admin-panel">
				<h2>Creation fee denominator</h2>
				<div className="embr-fee-display">
					1/<span>{denominator.toLocaleString()}</span>
				</div>
				<p className="mb-1">
					Live tip: block {height?.toLocaleString() ?? "…"} · supply{" "}
					{supply !== null ? formatEmbr(supply) : "…"} {PLATFORM_TOKEN}
				</p>
				<p className="mb-0">
					Current tip creation fee:{" "}
					<strong>
						{fee !== null ? `${formatEmbr(fee)} ${PLATFORM_TOKEN}` : "…"}
					</strong>
				</p>
				<div className="embr-admin-actions">
					<button
						type="button"
						className="embr-btn embr-btn-primary"
						disabled={!isDev}
						onClick={() => {
							const next = increaseFeeDenominator();
							setDenominator(next);
							logEvent({
								type: "success",
								text: `Fee → ${formatFeeFraction(next)}`,
								saveToDb: false,
								showNotification: true,
							});
						}}
					>
						Increase (÷2 fee)
					</button>
					<button
						type="button"
						className="embr-btn embr-btn-ghost"
						disabled={!isDev}
						onClick={() => {
							const next = decreaseFeeDenominator();
							setDenominator(next);
							logEvent({
								type: "success",
								text: `Fee → ${formatFeeFraction(next)}`,
								saveToDb: false,
								showNotification: true,
							});
						}}
					>
						Decrease (×2 fee)
					</button>
				</div>
				{!isDev ? (
					<p className="mt-3 mb-0 small" style={{ color: "var(--embr-muted)" }}>
						Connect the admin wallet on Emberchain to enable controls. Demo
						auto-fill removed — real wallet required.
					</p>
				) : null}
			</div>
		</div>
	);
};

export default CryptoAdmin;
