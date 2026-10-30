// Temporary: map how thecardhive.co.uk loads stock. Removed before merge.
import fs from "node:fs";
const BASE = "https://thecardhive.co.uk";
const out = [];
const log = (...a) => out.push(a.join(" "));
const get = async (u) => { const r = await fetch(u, { headers: { "user-agent": "Mozilla/5.0 RiftCompare-probe" } }); return { status: r.status, text: await r.text() }; };
const home = await get(BASE + "/");
const scripts = [...home.text.matchAll(/src="(\/assets\/[^"]+\.js)"/g)].map((m) => m[1]);
log("scripts", scripts.join(","));
const seen = new Set(); const queue = [...scripts]; let all = "";
while (queue.length && seen.size < 60) {
  const s = queue.shift(); if (seen.has(s)) continue; seen.add(s);
  const r = await get(BASE + s); all += "\n/*FILE " + s + "*/\n" + r.text;
  for (const m of r.text.matchAll(/["'`](?:\.\/|\/assets\/)?([A-Za-z0-9_.-]+\.js)["'`]/g)) { const p = "/assets/" + m[1]; if (!seen.has(p)) queue.push(p); }
}
log("files", seen.size, "bytes", all.length);
const uniq = (re, g = 0) => [...new Set([...all.matchAll(re)].map((m) => m[g]))];
log("== firebase config");
for (const k of ["apiKey", "authDomain", "projectId", "storageBucket", "appId", "databaseURL"]) log(k, uniq(new RegExp(k + ':\\s*"([^"]+)"', "g"), 1).join(" | "));
log("== collection names (le/je/collection calls)");
log(uniq(/\b[A-Za-z$_]{1,3}\(\s*[A-Za-z$_]{1,3}\s*,\s*"([a-zA-Z_][a-zA-Z0-9_-]{2,40})"/g, 1).join(", "));
log("== /api endpoints");
log(uniq(/["'`](\/api\/[A-Za-z0-9_/-]+)/g, 1).join(", "));
log("== windows");
for (const kw of ["inventory", "\"products\"", "\"singles\"", "\"stock\"", "priceGBP", "\"listings\"", "\"cards\"", "sellPrice", "condition"]) {
  let i = all.indexOf(kw), n = 0;
  while (i !== -1 && n < 4) { log("--", kw, "@", i, all.slice(Math.max(0, i - 250), i + 250).replace(/\s+/g, " ")); i = all.indexOf(kw, i + 1); n++; }
}
fs.mkdirSync("probe-out", { recursive: true });
fs.writeFileSync("probe-out/hive-discover.txt", out.join("\n"));
fs.writeFileSync("probe-out/hive-bundle.js.txt", all);
