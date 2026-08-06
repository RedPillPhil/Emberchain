import Bugsnag from "@bugsnag/browser";
import { PWBHost } from "promise-worker-bi";
import { assetPath, getBasePath } from "../../common/basePath.ts";

const workerPath =
	process.env.NODE_ENV === "production"
		? assetPath(`/gen/worker-${window.bbgmVersion}.js`)
		: assetPath("/gen/worker.js");
const useSharedWorker = window.useSharedWorker && !getBasePath();
const worker = useSharedWorker
	? new SharedWorker(workerPath, { type: "module" })
	: new Worker(workerPath, { type: "module" });

export const promiseWorker = new PWBHost(worker);
promiseWorker.registerError((error) => {
	Bugsnag.notify(error);

	console.error("Error from worker:");
	console.error(error);
});
