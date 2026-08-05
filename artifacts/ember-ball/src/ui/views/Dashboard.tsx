import clsx from "clsx";
import { useCallback, useState, type CSSProperties } from "react";
import { Dropdown } from "react-bootstrap";
import { DIFFICULTY } from "../../common/constants.ts";
import {
	LEAGUE_TOKEN,
	OFFICIAL_LEAGUE_NAME,
	PLATFORM_TOKEN,
} from "../../common/crypto.ts";
import { DataTable } from "../components/DataTable/index.tsx";
import useTitleBar from "../hooks/useTitleBar.tsx";
import { logEvent } from "../util/logEvent.ts";
import { toWorker } from "../util/toWorker.ts";
import { getCols } from "../../common/getCols.ts";
import type { View } from "../../common/types.ts";
import { TeamLogoInline } from "../components/TeamLogoInline.tsx";
import { confirm } from "../util/confirm.tsx";
import { relativeTime } from "../util/relativeTime.ts";
import { realtimeUpdate } from "../util/realtimeUpdate.ts";

const difficultyText = (difficulty: number | undefined) => {
	let prevText: string | undefined;
	if (difficulty === undefined) {
		return "???";
	}
	for (const [text, numeric] of Object.entries(DIFFICULTY)) {
		if (typeof numeric !== "number") {
			throw new Error("Should never happen");
		}
		if (difficulty === numeric) {
			return text;
		}
		if (difficulty < numeric) {
			if (prevText !== undefined) {
				return `${prevText}+`;
			}
			return `${text}-`;
		}
		prevText = text;
	}
	if (prevText !== undefined) {
		return `${prevText}+`;
	}
	return "???";
};

const DifficultyText = ({
	children: difficulty,
}: {
	children: number | undefined;
}) => {
	if (difficulty === undefined) {
		return null;
	}
	return (
		<span
			className={clsx({
				"fw-bold": difficulty > DIFFICULTY.Insane,
				"text-danger": difficulty >= DIFFICULTY.Insane,
			})}
		>
			{difficultyText(difficulty)}
		</span>
	);
};

const PlayButton = ({
	lid,
	disabled,
	throbbing,
	onClick,
}: {
	lid: number;
	disabled: boolean;
	throbbing: boolean;
	onClick: () => void;
}) => {
	if (!disabled && !throbbing) {
		return (
			<a
				className="btn btn-lg btn-success"
				href={`/l/${lid}`}
				onClick={onClick}
			>
				Play
			</a>
		);
	}
	if (throbbing) {
		return (
			<button className="btn btn-lg btn-success dashboard-play-loading">
				Play
			</button>
		);
	}
	return (
		<button className="btn btn-lg btn-success" disabled>
			Play
		</button>
	);
};

const glyphiconStyle = { cursor: "pointer", fontSize: "larger" };

const Star = ({ lid, starred }: { lid: number; starred?: boolean }) => {
	const [actuallyStarred, setActuallyStarred] = useState<boolean>(!!starred);
	const toggle = useCallback(async () => {
		setActuallyStarred(!actuallyStarred);
		await toWorker("main", "updateLeague", {
			lid,
			obj: { starred: !actuallyStarred },
		});
	}, [actuallyStarred, lid]);

	if (actuallyStarred) {
		return (
			<span
				className="glyphicon glyphicon-star p-1 text-primary"
				data-no-row-highlight="true"
				onClick={toggle}
				style={glyphiconStyle}
			/>
		);
	}
	return (
		<span
			className="glyphicon glyphicon-star-empty p-1 text-body-secondary"
			data-no-row-highlight="true"
			onClick={toggle}
			style={glyphiconStyle}
			title="Star"
		/>
	);
};

const LeagueName = ({
	lid,
	children: name,
	starred,
	disabled,
	onClick,
}: {
	lid: number;
	children: string;
	starred?: boolean;
	disabled: boolean;
	onClick: () => void;
}) => (
	<div className="d-flex align-items-center">
		<div className="me-1">
			{!disabled ? (
				<a href={`/l/${lid}`} onClick={onClick}>
					{name}
				</a>
			) : (
				name
			)}
		</div>
		<Star lid={lid} starred={starred} />
	</div>
);

const Ago = ({ date }: { date?: Date }) => {
	if (date) {
		return <span title={date.toLocaleString()}>{relativeTime(date)}</span>;
	}
	return null;
};

const dropdownStyle: CSSProperties = { position: "static" };

const Dashboard = ({ leagues }: View<"dashboard">) => {
	const [loadingLID, setLoadingLID] = useState<number | undefined>();
	const [deletingLID, setDeletingLID] = useState<number | undefined>();
	const [cloningLID, setCloningLID] = useState<number | undefined>();
	const [officialBusy, setOfficialBusy] = useState(false);
	useTitleBar();

	const officialLocal = leagues.find((l) => l.name === OFFICIAL_LEAGUE_NAME);

	const enterOfficial = async () => {
		if (officialLocal) {
			realtimeUpdate([], `/l/${officialLocal.lid}`);
			return;
		}
		setOfficialBusy(true);
		try {
			logEvent({
				type: "info",
				text: `Creating ${OFFICIAL_LEAGUE_NAME} placeholder (fictional players — no contracts, no fee)…`,
				saveToDb: false,
				showNotification: true,
			});
			const { lid } = await toWorker(
				"main",
				"ensureOfficialEmberLeague",
				undefined,
			);
			realtimeUpdate([], `/l/${lid}`);
		} catch (error: any) {
			logEvent({
				type: "error",
				text: error?.message ?? "Could not open official league",
				saveToDb: false,
				showNotification: true,
			});
		} finally {
			setOfficialBusy(false);
		}
	};

	const cols = getCols([
		"",
		"League",
		"Team",
		"Phase",
		"# Seasons",
		"Difficulty",
		"Created",
		"Last Played",
		"",
	]);
	cols[0]!.width = "1%";
	cols[8]!.width = "1%";

	const rows = leagues.map((l) => {
		const disabled =
			deletingLID !== undefined ||
			loadingLID !== undefined ||
			cloningLID !== undefined;
		return {
			key: l.lid,
			data: [
				{
					value: (
						<PlayButton
							lid={l.lid}
							disabled={disabled}
							throbbing={loadingLID === l.lid}
							onClick={() => setLoadingLID(l.lid)}
						/>
					),
					searchValue: undefined,
					sortValue: l.lid,
				},
				{
					value: (
						<LeagueName
							lid={l.lid}
							starred={l.starred}
							disabled={disabled}
							onClick={() => setLoadingLID(l.lid)}
						>
							{l.name}
						</LeagueName>
					),
					searchValue: l.name,
					sortValue: l.name,
				},
				{
					value: (
						<div className="d-flex align-items-center">
							<TeamLogoInline
								imgURL={l.imgURL}
								size={28}
								className="me-1"
								includePlaceholderIfNoLogo
							/>
							{l.teamRegion} {l.teamName}
						</div>
					),
					searchValue: `${l.teamRegion} ${l.teamName}`,
					sortValue: `${l.teamRegion} ${l.teamName}`,
				},
				l.phaseText,
				l.season !== undefined && l.startingSeason !== undefined
					? l.season - l.startingSeason + 1
					: undefined,
				{
					value: <DifficultyText>{l.difficulty}</DifficultyText>,
					sortValue: l.difficulty,
				},
				{
					value: <Ago date={l.created} />,
					sortValue: l.created ? l.created.getTime() : 0,
				},
				{
					value: <Ago date={l.lastPlayed} />,
					sortValue: l.lastPlayed ? l.lastPlayed.getTime() : 0,
				},
				{
					value: (
						<Dropdown style={dropdownStyle} align="end">
							<Dropdown.Toggle
								as="span"
								bsPrefix="dashboard-edit"
								id={`dashboard-edit-${l.lid}`}
								disabled={disabled}
							>
								<span
									className="glyphicon glyphicon-option-vertical"
									data-no-row-highlight="true"
								/>
							</Dropdown.Toggle>
							<Dropdown.Menu>
								<Dropdown.Item
									onClick={async () => {
										const newName = await confirm("New name?", {
											defaultValue: l.name,
											okText: "Rename",
										});
										if (typeof newName === "string" && newName) {
											await toWorker("main", "updateLeague", {
												lid: l.lid,
												obj: { name: newName },
											});
										}
									}}
								>
									Rename
								</Dropdown.Item>
								<Dropdown.Item
									onClick={async () => {
										setCloningLID(l.lid);
										try {
											await toWorker("main", "cloneLeague", l.lid);
										} finally {
											setCloningLID(undefined);
										}
									}}
								>
									Clone
								</Dropdown.Item>
								<Dropdown.Item
									onClick={async () => {
										const proceed = await confirm(
											`Are you sure you want to delete "${l.name}"?`,
											{ okText: "Delete" },
										);
										if (!proceed) {
											return;
										}
										setDeletingLID(l.lid);
										try {
											await toWorker("main", "removeLeague", l.lid);
										} finally {
											setDeletingLID(undefined);
										}
									}}
								>
									Delete
								</Dropdown.Item>
							</Dropdown.Menu>
						</Dropdown>
					),
					searchValue: undefined,
					sortValue: undefined,
				},
			],
		};
	});

	return (
		<div className="embr-landing">
			<div className="embr-bleed">
				<section className="embr-hero embr-hero-about">
					<div className="embr-hero-inner">
						<img
							src="/img/ember-ball-logo.png"
							alt="Ember Ball"
							className="embr-hero-logo"
						/>
						<h1 className="embr-brand-mark">
							EMBER <span>BALL</span>
						</h1>
						<p className="embr-hero-tagline">
							A basketball franchise simulation under construction on Emberchain.
							Run the front office. Claim a team. Sim your night. More is coming.
						</p>
						<div className="embr-cta-row">
							<button
								type="button"
								className="embr-btn embr-btn-primary"
								disabled={officialBusy}
								onClick={() => void enterOfficial()}
							>
								{officialBusy
									? "Opening…"
									: officialLocal
										? `Enter ${OFFICIAL_LEAGUE_NAME}`
										: `Try ${OFFICIAL_LEAGUE_NAME}`}
							</button>
							<a href="/create_league" className="embr-btn embr-btn-ghost">
								Create league
							</a>
							<a href="/public_leagues" className="embr-btn embr-btn-ghost">
								Public leagues
							</a>
						</div>
					</div>
				</section>

				<section className="embr-section embr-section-dark embr-about">
					<div className="embr-section">
						<h2 className="embr-section-title">What is Ember Ball?</h2>
						<p className="embr-section-lead">
							Ember Ball is a deep basketball GM sim — draft, trade, set the
							depth chart, and live with the results — built to run on{" "}
							<strong>Emberchain</strong>. We are in the early days of
							development. Nothing on-chain is live yet.
						</p>

						<div className="embr-feature-grid embr-about-grid">
							<div className="embr-feature">
								<h3>Under construction</h3>
								<p>
									No smart contracts are deployed. Creation fees, prize pools,
									and NFT mints are scaffolding only. The official league is a{" "}
									<strong>placeholder</strong> so you can play the sim today.
								</p>
							</div>
							<div className="embr-feature">
								<h3>Teams as NFTs (coming)</h3>
								<p>
									Every franchise will be an NFT on Emberchain. Until minting
									ships, public leagues let you <strong>claim a team</strong>{" "}
									with your wallet address — the server assigns control to that
									address only (no mint yet).
								</p>
							</div>
							<div className="embr-feature">
								<h3>AI in the booth</h3>
								<p>
									Play-by-play, color commentary, and news will be driven by
									algorithms plus personality models — stats, ratings, and
									traits feeding an Ember Ball desk that grows with the league.
								</p>
							</div>
							<div className="embr-feature">
								<h3>Multiplayer today</h3>
								<p>
									In a public league, claim a club, edit your depth chart, and
									sim <em>your</em> game for the day. Only the commissioner
									advances the calendar. Human vs human needs both sides Ready.
									Trade AI clubs freely; human clubs trade by proposal.
								</p>
							</div>
						</div>

						<p className="embr-about-footnote">
							{PLATFORM_TOKEN} fees and {LEAGUE_TOKEN} rewards are planned for
							launch — not active. Offline leagues stay free forever for solo
							play.
						</p>
					</div>
				</section>
			</div>

			<div className="embr-section">
				<h2 className="embr-section-title">Your leagues</h2>
				<p className="text-body-secondary mb-3">
					Saves on this device. Official league is a local placeholder until
					contracts go live.
				</p>
				{rows.length > 0 ? (
					<div className="embr-leagues-table">
						<DataTable
							cols={cols}
							disableSettingsCache
							defaultSort={[7, "desc"]}
							defaultStickyCols={1}
							name="Dashboard"
							pagination={rows.length > 100}
							small={false}
							rows={rows}
						/>
					</div>
				) : (
					<p className="text-body-secondary">
						No leagues yet.{" "}
						<button
							type="button"
							className="btn btn-link p-0 align-baseline"
							onClick={() => void enterOfficial()}
						>
							Open the official placeholder
						</button>{" "}
						or <a href="/create_league">create your own</a>.
					</p>
				)}

				<p className="mt-4 mb-0">
					<a href="/public_leagues">Browse public multiplayer leagues →</a>
				</p>
			</div>
		</div>
	);
};

export default Dashboard;
