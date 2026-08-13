import { CONFIDENCE_META } from "../util/scouting.ts";

/** Small colored dot showing scouting confidence tier (0 red → 4 blue). */
export const ConfidenceDot = ({ tier }: { tier: number | undefined }) => {
	if (tier == null) {
		return null;
	}
	const meta = CONFIDENCE_META[Math.max(0, Math.min(4, Math.round(tier)))]!;
	return (
		<span
			title={meta.label}
			style={{
				color: meta.color,
				marginLeft: 6,
				fontSize: 9,
				verticalAlign: "middle",
				cursor: "help",
			}}
		>
			●
		</span>
	);
};

/** Inline legend for the confidence tiers. */
export const ConfidenceLegend = () => (
	<span style={{ display: "inline-flex", gap: 10, flexWrap: "wrap" }}>
		{CONFIDENCE_META.map((meta) => (
			<span key={meta.label} style={{ whiteSpace: "nowrap", fontSize: 12 }}>
				<span style={{ color: meta.color, fontSize: 9 }}>●</span>{" "}
				<span className="muted">{meta.label}</span>
			</span>
		))}
	</span>
);
