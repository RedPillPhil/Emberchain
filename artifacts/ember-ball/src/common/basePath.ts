declare global {
	interface Window {
		bbgmBasePath?: string;
	}
}

/** Base path when hosted under a subpath (e.g. /ember-ball on emberchain.org). */
export const getBasePath = (): string => {
	if (typeof window !== "undefined") {
		if (window.bbgmBasePath) {
			return window.bbgmBasePath;
		}

		if (window.location.pathname.startsWith("/ember-ball")) {
			return "/ember-ball";
		}
	}

	if (typeof self !== "undefined" && self.location?.pathname.includes("/ember-ball/")) {
		return "/ember-ball";
	}

	return process.env.BBGM_BASE_PATH ?? "";
};

export const assetPath = (path: string): string => {
	const base = getBasePath();
	const normalized = path.startsWith("/") ? path : `/${path}`;
	if (!base) {
		return normalized;
	}
	if (normalized === base || normalized.startsWith(`${base}/`)) {
		return normalized;
	}
	return `${base}${normalized}`;
};

/** Strip subpath prefix before route matching (e.g. /ember-ball/l/1 → /l/1). */
export const stripBasePath = (pathname: string): string => {
	const base = getBasePath();
	if (!base) {
		return pathname || "/";
	}

	if (pathname === base || pathname === `${base}/`) {
		return "/";
	}

	if (pathname.startsWith(`${base}/`)) {
		return pathname.slice(base.length) || "/";
	}

	return pathname;
};

/** Prefix app routes for history URLs and links (e.g. / → /ember-ball/). */
export const withBasePath = (pathname: string): string => {
	const base = getBasePath();
	if (!base) {
		return pathname;
	}

	if (pathname === base || pathname.startsWith(`${base}/`)) {
		return pathname;
	}

	if (pathname === "/") {
		return `${base}/`;
	}

	return `${base}${pathname}`;
};
