import type { ReactNode } from "react";
import { useDesktopStore } from "../store.ts";

type Props = {
	tid: number | undefined;
	children: ReactNode;
	className?: string;
};

/** Clickable team name → that team's roster (read-only unless it's yours). */
export const TeamLink = ({ tid, children, className }: Props) => {
	const openTeam = useDesktopStore((s) => s.openTeam);

	if (tid == null || tid < 0) {
		return <span className={className}>{children}</span>;
	}

	return (
		<button
			type="button"
			className={className ? `team-link ${className}` : "team-link"}
			onClick={() => openTeam(tid)}
		>
			{children}
		</button>
	);
};
