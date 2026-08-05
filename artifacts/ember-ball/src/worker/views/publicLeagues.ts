import type { UpdateEvents } from "../../common/types.ts";

const updatePublicLeagues = async (
	_inputs: unknown,
	updateEvents: UpdateEvents,
) => {
	if (updateEvents.includes("firstRun")) {
		return {};
	}
};

export default updatePublicLeagues;
