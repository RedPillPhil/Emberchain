export type CollegeConference = {
	cid: number;
	name: string;
	abbrev: string;
};

export type CollegeTeam = {
	tid: number;
	cid: number;
	region: string;
	name: string;
	abbrev: string;
};
