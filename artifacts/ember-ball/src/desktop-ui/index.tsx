import "../common/polyfills.ts";
import { createRoot } from "react-dom/client";
import api from "./api/index.ts";
import { App } from "./App.tsx";
import { promiseWorker } from "./util/promiseWorker.ts";
import { initWorkerEnv } from "./util/league.ts";
import { injectDesktopStyles } from "./styles.ts";
import { readLocalClaim } from "./crypto/antiAbuse.ts";
import { useDesktopStore } from "./store.ts";

window.bbgm = {
	api,
	toWorker: undefined,
};

injectDesktopStyles();

const bootCryptoMode = () => {
	const params = new URLSearchParams(window.location.search);
	const path = window.location.pathname.toLowerCase();
	const flagged =
		params.get("mode") === "crypto" ||
		params.get("league") === "ember" ||
		path.includes("crypto.html") ||
		(window as any).emberLeague === true;
	if (flagged) {
		const store = useDesktopStore.getState();
		store.setCryptoMode(true);
		const claim = readLocalClaim();
		if (claim) {
			store.setClaimedTeam(claim);
		}
	}
};

(async () => {
	promiseWorker.register(([name, ...params]) => {
		if (!Object.hasOwn(api, name)) {
			throw new Error(
				`API call to nonexistent UI function "${name}" with params ${JSON.stringify(params)}`,
			);
		}
		// @ts-expect-error dynamic dispatch
		return api[name](...params);
	});

	await initWorkerEnv();
	bootCryptoMode();

	const root = document.getElementById("root");
	if (!root) {
		throw new Error("#root missing");
	}
	createRoot(root).render(<App />);
})();
