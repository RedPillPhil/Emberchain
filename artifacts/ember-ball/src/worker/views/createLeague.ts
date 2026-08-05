import type { UpdateEvents } from "../../common/types.ts";

const updateCreateLeague = async (
	_inputs: unknown,
	updateEvents: UpdateEvents,
) => {
	if (updateEvents.includes("firstRun")) {
		return {};
	}
};

export default updateCreateLeague;
