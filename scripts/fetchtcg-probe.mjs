// One-off: describe the shape of Fetch TCG's partner feed. Prints structure and counts only, never the data.
const key = process.env.FETCH_TCG_API_KEY;
if (!key) { console.log("no key"); process.exit(0); }
const res = await fetch("https://api.fetchtcg.com/partner-feed/au.json", { headers: { Authorization: `Bearer ${key}` } });
console.log("status", res.status, "type", res.headers.get("content-type"), "length", res.headers.get("content-length"), "encoding", res.headers.get("content-encoding"));
const text = await res.text();
console.log("bytes", text.length);
let j; try { j = JSON.parse(text); } catch { console.log("not json"); process.exit(0); }
const shape = (v, d = 0) => v === null ? "null" : Array.isArray(v) ? `array(${v.length})` + (d < 4 && v.length ? "<" + shape(v[0], d + 1) + ">" : "") : typeof v === "object" ? "{" + Object.entries(v).slice(0, 40).map(([k, x]) => k + ":" + (d < 4 ? shape(x, d + 1) : typeof x)).join(", ") + "}" : typeof v;
console.log("shape", shape(j));
const arr = Array.isArray(j) ? j : Object.values(j).find((x) => Array.isArray(x));
if (arr) {
  const keys = {}; for (const p of arr) for (const k of Object.keys(p)) keys[k] = (keys[k] || 0) + 1;
  console.log("product keys", JSON.stringify(keys));
  for (const k of ["game", "tcg", "category", "stock", "inStock", "currency", "condition", "language", "rarity", "finish", "type", "productType"]) {
    const c = {}; for (const p of arr) { const v = p[k]; if (v !== undefined && typeof v !== "object") c[v] = (c[v] || 0) + 1; }
    const e = Object.entries(c); if (e.length && e.length < 60) console.log("values of", k, JSON.stringify(Object.fromEntries(e)));
  }
}
// Part 2: games, and number/set/finish formats per game (identifiers only, no prices).
const arr2 = j.products;
const games = {}; for (const p of arr2) { const g = `${p.gameId}|${p.gameName}`; games[g] = (games[g] || 0) + 1; }
console.log("games", JSON.stringify(games));
const stock = {}; for (const p of arr2) { const k = `${p.availability}|${p.stock > 0 ? "pos" : p.stock}`; stock[k] = (stock[k] || 0) + 1; }
console.log("availability", JSON.stringify(stock));
const conds = {}; for (const p of arr2) for (const c of p.conditions) conds[c.condition] = (conds[c.condition] || 0) + 1;
console.log("conditions", JSON.stringify(conds));
const want = /riftbound|one piece|gundam|lorcana|cyberpunk|pokemon|pok.mon/i;
const seen = {};
for (const p of arr2) {
  if (!want.test(p.gameName)) continue;
  const g = p.gameName; seen[g] ??= { n: 0, sets: {}, ex: [] };
  seen[g].n++; seen[g].sets[p.set] = (seen[g].sets[p.set] || 0) + 1;
  if (seen[g].ex.length < 4) seen[g].ex.push({ name: p.name, title: p.title, number: p.number, set: p.set, finish: p.finish, rarity: p.rarity, urlHost: p.url.split("/").slice(0, 4).join("/"), urlTail: p.url.split("/").slice(4).join("/").slice(0, 40), ncond: p.conditions.length, imgs: p.images.length });
}
for (const [g, v] of Object.entries(seen)) console.log("GAME", g, v.n, "sets", Object.keys(v.sets).length, JSON.stringify(Object.entries(v.sets).sort((a, b) => b[1] - a[1]).slice(0, 12)), JSON.stringify(v.ex));
const q = {}; for (const p of arr2) { const u = new URL(p.url); for (const k of u.searchParams.keys()) q[k] = (q[k] || 0) + 1; }
console.log("url params", JSON.stringify(q));
