import fs from "node:fs/promises";

export const reset = async () => {
	await fs.rm("build", { recursive: true, force: true });
	await fs.mkdir("build/gen", { recursive: true });
};
