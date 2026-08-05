import type { UpdateEvents } from "../../common/types.ts";

const updateMultiplayer = async (
	_inputs: unknown,
	updateEvents: UpdateEvents,
) => {
	if (updateEvents.includes("firstRun") || updateEvents.includes("team")) {
		return {};
	}
};

export default updateMultiplayer;
