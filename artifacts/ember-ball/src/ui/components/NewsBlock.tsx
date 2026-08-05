import { PlayerPicture } from "./PlayerPicture.tsx";
import { SafeHtml } from "./SafeHtml.tsx";
import clsx from "clsx";
import { helpers } from "../util/helpers.ts";
import type { View, LogEventType } from "../../common/types.ts";
import { categories, types } from "../../common/transactionInfo.ts";

const Badge = ({ type }: { type: LogEventType }) => {
	let text;
	let className;
	const typeInfo = types[type];
	if (typeInfo) {
		text = typeInfo.text;
		className = categories[typeInfo.category].className;
	} else {
		text = type;
		className = "bg-secondary";
	}
	return (
		<span className={`badge badge-news news-card-badge ${className}`}>
			{text}
		</span>
	);
};

const logoStyle = { maxHeight: 28, maxWidth: 28 };

export const NewsBlock = ({
	event,
	season,
	userTid,
	teams,
}: {
	event: View<"news">["events"][number];
	season: number;
	userTid: number;
	teams: View<"news">["teams"];
}) => {
	let teamName = null;
	let teamInfo;
	if (event.tid !== undefined) {
		teamInfo = teams[event.tid];

		if (teamInfo) {
			const rosterURL = helpers.leagueUrl([
				"roster",
				`${teamInfo.abbrev}_${event.tid}`,
				season,
			]);

			teamName = (
				<>
					{teamInfo.imgURL || teamInfo.imgURLSmall ? (
						<a href={rosterURL} className="p-1 flex-shrink-0">
							<img
								src={teamInfo.imgURLSmall ?? teamInfo.imgURL}
								alt=""
								style={logoStyle}
							/>
						</a>
					) : null}
					<a href={rosterURL} className="ps-1 text-truncate">
						{teamInfo.region}
					</a>
				</>
			);
		}
	} else if (event.tids && event.tids.length <= 3) {
		teamName = event.tids.map((tid) => {
			teamInfo = teams[tid];

			if (!teamInfo) {
				return null;
			}
			const rosterURL = helpers.leagueUrl([
				"roster",
				`${teamInfo.abbrev}_${tid}`,
				season,
			]);

			return (
				<a key={tid} href={rosterURL} className="p-1 flex-shrink-0">
					{teamInfo.imgURL || teamInfo.imgURLSmall ? (
						<img
							src={teamInfo.imgURLSmall ?? teamInfo.imgURL}
							alt=""
							style={logoStyle}
						/>
					) : (
						teamInfo.abbrev
					)}
				</a>
			);
		});
	}

	const userInvolved = event.tids && event.tids.includes(userTid);

	return (
		<div className={clsx("card news-card", { "news-card-user": userInvolved })}>
			<div className="news-card-header d-flex align-items-center">
				<div className="news-card-teams d-flex align-items-center min-w-0 flex-grow-1">
					{teamName}
				</div>
				<Badge type={event.type} />
			</div>
			<div className="d-flex news-card-body">
				{event.p && event.p.imgURL !== "/img/blank-face.png" ? (
					<div className="news-card-face flex-shrink-0">
						<PlayerPicture
							face={event.p.face}
							imgURL={event.p.imgURL}
							colors={teamInfo?.colors}
							jersey={teamInfo?.jersey}
							lazy
						/>
					</div>
				) : null}
				<div className="p-2 news-card-text min-w-0">
					<SafeHtml dirty={event.text} />
				</div>
			</div>
		</div>
	);
};
