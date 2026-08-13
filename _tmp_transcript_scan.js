const fs = require("fs");
const p =
  "C:/Users/robth/.cursor/projects/c-Users-robth-Downloads-Emberchain-main-2-Emberchain-main/agent-transcripts/982f0bc3-381b-4d4d-892b-f1b964a07f5a/982f0bc3-381b-4d4d-892b-f1b964a07f5a.jsonl";
const lines = fs.readFileSync(p, "utf8").split(/\n/).filter(Boolean);
let i = 0;
for (const line of lines) {
  let o;
  try {
    o = JSON.parse(line);
  } catch {
    continue;
  }
  if (o.role !== "user") continue;
  const c = o.message?.content;
  let text = "";
  if (Array.isArray(c))
    text = c
      .filter((x) => x.type === "text")
      .map((x) => x.text)
      .join(" ");
  else if (typeof c === "string") text = c;
  const tm = text.match(/<timestamp>([^<]+)<\/timestamp>/);
  const qm = text.match(/<user_query>([\s\S]*?)<\/user_query>/);
  const ts = tm ? tm[1] : "";
  let query = (qm ? qm[1] : "").replace(/\s+/g, " ").trim();
  if (!query) continue;
  if (query.length > 240) query = query.slice(0, 240) + "...";
  i++;
  console.log(`${i}|${ts}|${query}`);
}
