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
