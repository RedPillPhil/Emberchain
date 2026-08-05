import { memo } from "react";
import {
	AD_DIVS,
	GAME_ACRONYM,
	VIDEO_ADS,
	VIDEO_AD_PADDING,
} from "../../../common/constants.ts";
import { LEAGUE_TOKEN, PLATFORM_TOKEN } from "../../../common/crypto.ts";
import { useLocal } from "../../util/local.ts";

const footerLinks = [
	{ url: "/create_league", title: "Create League", external: false },
	{ url: "/public_leagues", title: "Public Leagues", external: false },
	{ url: "/new_league", title: "Offline League", external: false },
	{ url: "/crypto_admin", title: "Admin", external: false },
];

export const Footer = memo(() => {
	const { gold } = useLocal(["gold"]);
	const video_ad_padding = VIDEO_ADS && !gold;

	return (
		<footer
			className={`footer-wrapper mt-auto${video_ad_padding ? "" : " mb-3"}`}
			id="main-footer"
			style={
				video_ad_padding
					? { paddingBottom: VIDEO_AD_PADDING }
					: undefined
			}
		>
			<p className="clearfix" />
			<div className="banner-ad" style={{ position: "relative" }}>
				<div
					id={`${AD_DIVS.rectangle1}_disabled`}
					style={{ display: "none" }}
				/>
				<div id="bbgm-ads-logo" style={{ display: "none" }} />
				<div
					id={`${AD_DIVS.rectangle2}_disabled`}
					style={{ display: "none" }}
				/>
			</div>
			<div className="clearfix" />
			<hr className="my-hr" />
			<div
				className="d-flex flex-wrap justify-content-between text-body-secondary"
				style={{ columnGap: "1rem" }}
			>
				<div>
					{footerLinks.map(({ url, title }, i) => (
						<span key={url}>
							{i > 0 ? " · " : null}
							<a href={url} className="link-secondary">
								{title}
							</a>
						</span>
					))}
					<span>
						{" · "}
						<span>
							{PLATFORM_TOKEN} · {LEAGUE_TOKEN}
						</span>
					</span>
				</div>
				<div>
					{GAME_ACRONYM} Ball{" "}
					<span className="link-secondary">v{window.bbgmVersion}</span>
				</div>
			</div>
		</footer>
	);
});
