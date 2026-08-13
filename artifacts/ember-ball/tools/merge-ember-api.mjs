/**
 * One-shot merge: inject Ember Ball crypto multiplayer APIs into worker api/index.ts
 * after copying the desktop league version from zengm-master.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const apiPath = path.join(root, "src/worker/api/index.ts");
let src = fs.readFileSync(apiPath, "utf8");

const importBlock = `import { OFFICIAL_LEAGUE_NAME } from "../../common/crypto.ts";
import {
\tcountFilledTeams,
\tdayReadyKey,
\tgenerateJoinCode,
\tisHumanOwned,
\townerOfTid,
\ttidOwnedBy,
\ttype EmberLeagueMeta,
\ttype PublicLeagueListing,
} from "../../common/multiplayer.ts";
import getTeamInfos from "../../common/getTeamInfos.ts";
`;

if (!src.includes("OFFICIAL_LEAGUE_NAME")) {
  src = src.replace(
    'import {\n\tgetDefaultSettings,\n\ttype NewLeagueSettings,\n} from "../views/newLeague.ts";',
    `import {\n\tgetDefaultSettings,\n\ttype NewLeagueSettings,\n} from "../views/newLeague.ts";\n${importBlock}`,
  );
}

const emberFunctions = fs.readFileSync(
  path.join(root, "tools/merge-ember-api-snippet.ts"),
  "utf8",
);

if (!src.includes("ensureOfficialEmberLeague")) {
  src = src.replace(
    "\nexport default {",
    `\n${emberFunctions}\n\nexport default {`,
  );
}

const exportBlock = `\t\tensureOfficialEmberLeague,
\t\tcreateCryptoLeagueLocal,
\t\tlistPublicCryptoLeagues,
\t\tgetMultiplayerStatus,
\t\tclaimTeam,
\t\tmarkGameReady,
\t\tsimMyGameIfReady,
\t\tadvanceDayAsCommish,
\t\tsyncTeamNicknamesFromInfos,`;

if (!src.includes("ensureOfficialEmberLeague,")) {
  src = src.replace("\t\tdunkUser,", `\t\tdunkUser,\n${exportBlock}`);
}

fs.writeFileSync(apiPath, src);
console.log("Merged ember crypto APIs into", apiPath);
