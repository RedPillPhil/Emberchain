/** Strip HTML tags from engine notification text (keeps link labels). */
export const stripHtml = (html: string): string =>
	html
		.replace(/<a\b[^>]*>(.*?)<\/a>/gi, "$1")
		.replace(/<[^>]+>/g, "")
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.trim();

/**
 * Format money from playersPlus / freeAgents views — those already convert
 * BBGM's thousands-of-dollars unit into millions. So 33 → "$33.0M", 1.2 → "$1.2M".
 */
export const fmtMoney = (millions: number | undefined | null): string => {
	if (millions == null || Number.isNaN(millions)) {
		return "—";
	}
	const abs = Math.abs(millions);
	if (abs === 0) {
		return "$0";
	}
	// Tiny values are almost always undrafted placeholder contracts — show as —
	if (abs < 0.05) {
		return "—";
	}
	if (abs < 1) {
		return `$${Math.round(millions * 1000)}K`;
	}
	return `$${millions.toFixed(1)}M`;
};

/** @deprecated alias — use fmtMoney; playersPlus amounts are already in millions */
export const fmtMillions = fmtMoney;
export const fmtThousands = fmtMoney;
