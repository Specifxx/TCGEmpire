// Temporary: read The Card Hive's public `shop` collection the way its own page does. Removed before merge.
import fs from "node:fs";
const KEY = "AIzaSyDVHxlVwOVjmwTiZhCq2KwXUyMoOgzuIjg";
const URL0 = "https://firestore.googleapis.com/v1/projects/cardhive-c9eed/databases/(default)/documents/shop";
const out = []; const log = (...a) => out.push(a.join(" "));
const robots = await (await fetch("https://thecardhive.co.uk/robots.txt")).text();
log("== robots.txt\n" + robots.slice(0, 1500));
const plain = (v) => v == null ? null : "stringValue" in v ? v.stringValue : "integerValue" in v ? Number(v.integerValue) : "doubleValue" in v ? v.doubleValue : "booleanValue" in v ? v.booleanValue : "nullValue" in v ? null : "timestampValue" in v ? v.timestampValue : "mapValue" in v ? Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, plain(x)])) : "arrayValue" in v ? (v.arrayValue.values ?? []).map(plain) : JSON.stringify(v);
const docs = []; let token = ""; let pages = 0;
do {
  const r = await fetch(`${URL0}?pageSize=300&key=${KEY}${token ? "&pageToken=" + encodeURIComponent(token) : ""}`);
  log("page", pages, "status", r.status);
  const j = await r.json(); if (!r.ok) { log(JSON.stringify(j).slice(0, 800)); break; }
  for (const d of j.documents ?? []) docs.push({ id: d.name.split("/").pop(), ...Object.fromEntries(Object.entries(d.fields ?? {}).map(([k, v]) => [k, plain(v)])) });
  token = j.nextPageToken; pages++;
} while (token && pages < 50);
log("docs", docs.length);
const fieldCount = {}; for (const d of docs) for (const k of Object.keys(d)) fieldCount[k] = (fieldCount[k] ?? 0) + 1;
log("== fields", JSON.stringify(fieldCount));
const by = (k) => { const c = {}; for (const d of docs) { const v = String(d[k]); c[v] = (c[v] ?? 0) + 1; } return JSON.stringify(Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 30)); };
for (const k of ["game", "category", "condition", "set", "set_id", "rarity", "foil", "printing", "language", "currency"]) log("by", k, by(k));
log("in stock", docs.filter((d) => (d.stock ?? 0) > 0).length);
log("== samples");
const singles = docs.filter((d) => d.game === "riftbound" && (d.category === "Single" || d.cardId || d.rarity));
log("riftbound singles", singles.length, "in stock", singles.filter((d) => (d.stock ?? 0) > 0).length);
for (const d of singles.slice(0, 25)) log(JSON.stringify(d).slice(0, 700));
log("== non-single riftbound");
for (const d of docs.filter((d) => d.game === "riftbound" && !singles.includes(d)).slice(0, 10)) log(JSON.stringify(d).slice(0, 700));
fs.mkdirSync("probe-out", { recursive: true });
fs.writeFileSync("probe-out/hive-discover.txt", out.join("\n"));
fs.writeFileSync("probe-out/hive-shop.json", JSON.stringify(docs));
fs.rmSync("probe-out/hive-bundle.js.txt", { force: true });
