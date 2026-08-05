import { Nav, Navbar } from "react-bootstrap";
import { useEffect, useState } from "react";
import { PHASE } from "../../../common/constants.ts";
import {
	getConnectedWallet,
	shortenAddress,
} from "../../../common/crypto.ts";
import { helpers } from "../../util/helpers.ts";
import { localActions, useLocal } from "../../util/local.ts";
import { useViewData } from "../../util/viewManager.tsx";
import DropdownLinks from "../DropdownLinks.tsx";
import LogoAndText from "../LogoAndText.tsx";
import PlayMenu from "../PlayMenu.tsx";
import { menuItems } from "../../util/menuItems.tsx";
import { connectWallet, disconnectWallet } from "../../util/wallet.ts";

const PhaseStatusBlock = () => {
	const { liveGameInProgress, phase, phaseText, statusText } = useLocal([
		"liveGameInProgress",
		"phase",
		"phaseText",
		"statusText",
	]);

	const text = (
		<>
			{liveGameInProgress ? "Live game" : phaseText}
			<br />
			{liveGameInProgress ? "in progress" : statusText}
		</>
	);

	const urls = {
		[PHASE.EXPANSION_DRAFT]: ["draft"],
		[PHASE.FANTASY_DRAFT]: ["draft"],
		[PHASE.PRESEASON]: ["roster"],
		[PHASE.REGULAR_SEASON]: ["roster"],
		[PHASE.AFTER_TRADE_DEADLINE]: ["roster"],
		[PHASE.PLAYOFFS]: ["playoffs"],
		[PHASE.DRAFT_LOTTERY]: phaseText.includes("after playoffs")
			? ["draft_scouting"]
			: ["draft_lottery"],
		[PHASE.DRAFT]: ["draft"],
		[PHASE.AFTER_DRAFT]: ["draft_history"],
		[PHASE.RESIGN_PLAYERS]: ["negotiation"],
		[PHASE.FREE_AGENCY]: ["free_agents"],
	};
	const urlParts = urls[phase];

	return (
		<div className="dropdown-links navbar-nav flex-shrink-1 overflow-hidden text-nowrap">
			<div className="nav-item">
				<a
					href={helpers.leagueUrl(urlParts)}
					className="nav-link"
					style={{
						lineHeight: 1.35,
						padding: "9px 0 8px 16px",
					}}
				>
					{text}
				</a>
			</div>
		</div>
	);
};

const WalletBlock = () => {
	const [wallet, setWallet] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		const sync = () => setWallet(getConnectedWallet());
		sync();
		window.addEventListener("storage", sync);
		window.addEventListener("embr-wallet", sync);
		return () => {
			window.removeEventListener("storage", sync);
			window.removeEventListener("embr-wallet", sync);
		};
	}, []);

	if (wallet) {
		return (
			<Nav.Link
				as="button"
				type="button"
				aria-label="Disconnect wallet"
				onClick={() => {
					disconnectWallet();
					setWallet(null);
				}}
				title="Disconnect wallet"
			>
				{shortenAddress(wallet)}
			</Nav.Link>
		);
	}

	return (
		<Nav.Link
			as="button"
			type="button"
			aria-label="Connect wallet"
			disabled={busy}
			onClick={async () => {
				setBusy(true);
				const addr = await connectWallet();
				setWallet(addr);
				setBusy(false);
			}}
		>
			{busy ? "Connecting…" : "Connect Wallet"}
		</Nav.Link>
	);
};

export const NavBar = ({ updating }: { updating: boolean }) => {
	const {
		lid,
		godMode,
		gold,
		spectator,
		playMenuOptions,
		popup,
	} = useLocal([
		"lid",
		"godMode",
		"gold",
		"spectator",
		"playMenuOptions",
		"popup",
	]);
	const viewInfo = useViewData();

	const inLeague = viewInfo?.inLeague && lid !== undefined;

	if (popup) {
		return <div />;
	}

	// Mobile: keep a slim menu toggle that opens top dropdowns only (no left sidebar)
	const [mobileOpen, setMobileOpen] = useState(false);

	return (
		<Navbar
			bg="dark"
			expand="lg"
			fixed="top"
			expanded={mobileOpen}
			onToggle={setMobileOpen}
			className="navbar-border navbar-embr flex-nowrap"
			variant="dark"
		>
			<div className="container-fluid">
				<button
					className="navbar-toggler me-2 d-lg-none"
					onClick={() => setMobileOpen((o) => !o)}
					type="button"
					aria-label="Toggle navigation"
				>
					<span className="navbar-toggler-icon" />
				</button>
				<LogoAndText gold={gold} inLeague={inLeague} updating={updating} />
				{inLeague ? (
					<Nav navbar>
						<PlayMenu
							lid={lid}
							spectator={spectator}
							options={playMenuOptions}
						/>
					</Nav>
				) : null}
				{inLeague ? <PhaseStatusBlock /> : null}
				<div className="flex-grow-1" />
				<Navbar.Collapse className="justify-content-end">
					<div className="d-flex flex-column flex-lg-row align-items-lg-center">
						<DropdownLinks
							godMode={godMode}
							inLeague={inLeague}
							lid={lid}
							menuItems={menuItems.filter(
								(menuItem) => !menuItem.commandPaletteOnly,
							)}
						/>
						<Nav id="top-user-block" navbar>
							<Nav.Item>
								<WalletBlock />
							</Nav.Item>
						</Nav>
					</div>
				</Navbar.Collapse>
			</div>
		</Navbar>
	);
};
