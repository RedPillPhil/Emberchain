import { LazyMotion } from "framer-motion";
import { memo, useCallback, useEffect } from "react";
import { localActions, useLocal } from "../../util/local.ts";
import { CommandPalette } from "../CommandPalette/index.tsx";
import { Footer } from "./Footer.tsx";
import { Header } from "./Header.tsx";
import { LeagueTopBar } from "./LeagueTopBar.tsx";
import { MultiTeamMenu } from "./MultiTeamMenu.tsx";
import { NagModal } from "./NagModal.tsx";
import { NavBar } from "./NavBar.tsx";
import { Notifications } from "./Notifications.tsx";
import { Skyscraper } from "./Skyscraper.tsx";
import { TitleBar } from "./TitleBar.tsx";
import { useViewData } from "../../util/viewManager.tsx";
import api from "../../api/index.ts";
import { ErrorBoundary } from "../ErrorBoundary.tsx";

const loadFramerMotionFeatures = () =>
	import("../../util/framerMotionFeatures.ts").then((res) => res.default);

const minHeight100 = {
	minHeight: "100%",
};

const minWidth0 = {
	minWidth: 0,
};

type KeepPreviousRenderWhileUpdatingProps = {
	children: any;
	updating: boolean;
};
const KeepPreviousRenderWhileUpdating = memo(
	(props: KeepPreviousRenderWhileUpdatingProps) => {
		return props.children;
	},
	(
		prevProps: KeepPreviousRenderWhileUpdatingProps,
		nextProps: KeepPreviousRenderWhileUpdatingProps,
	) => {
		return nextProps.updating;
	},
);

export const Controller = () => {
	const state = useViewData();

	const { popup, showNagModal } = useLocal(["popup", "showNagModal"]);

	const closeNagModal = useCallback(() => {
		localActions.update({
			showNagModal: false,
		});
	}, []);

	useEffect(() => {
		if (popup) {
			document.body.style.paddingTop = "8px";
			const css = document.createElement("style");
			css.innerHTML = ".new_window { display: none }";
			document.body.append(css);
		}
	}, [popup]);

	useEffect(() => {
		api.initAds("uiRendered");
	}, []);

	const {
		Component,
		data,
		idLoaded,
		inLeague,
		loading: updating,
		scrollToTop,
	} = state;

	useEffect(() => {
		document.body.classList.toggle("ember-league-body", !!inLeague);
		return () => {
			document.body.classList.remove("ember-league-body");
		};
	}, [inLeague]);

	useEffect(() => {
		if (scrollToTop) {
			window.scrollTo(window.pageXOffset, 0);
		}
	}, [idLoaded, scrollToTop]);

	return (
		<LazyMotion strict features={loadFramerMotionFeatures}>
			<NavBar updating={updating} />
			<div
				className={`h-100 d-flex ember-shell${inLeague ? " ember-league-mode" : ""}`}
			>
				<div className="h-100 w-100 d-flex flex-column" style={minWidth0}>
					{popup ? null : <LeagueTopBar />}
					{inLeague ? <TitleBar /> : null}
					<div
						className={`position-relative flex-grow-1 h-100 ${inLeague ? "container-fluid mt-2 ember-league-content" : "ember-content-flush"}`}
					>
						<div className="d-flex" style={minHeight100}>
							<div className="w-100 d-flex flex-column" style={minWidth0}>
								<Header />
								<main id="actual-actual-content" className="clearfix">
									<ErrorBoundary key={idLoaded}>
										{Component ? (
											<KeepPreviousRenderWhileUpdating updating={updating}>
												<Component {...data} />
											</KeepPreviousRenderWhileUpdating>
										) : null}
										{inLeague ? <MultiTeamMenu /> : null}
									</ErrorBoundary>
								</main>
								<Footer />
							</div>
							{inLeague ? <Skyscraper /> : null}
						</div>
						<CommandPalette />
						<NagModal close={closeNagModal} show={showNagModal} />
					</div>
				</div>
			</div>
			<Notifications />
		</LazyMotion>
	);
};
