/** Shared flag so scouting/actions can block without circular store imports. */
let browseOnly = false;

export const setBrowseOnly = (value: boolean) => {
	browseOnly = value;
};

export const isBrowseOnly = () => browseOnly;
