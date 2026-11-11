// temporary: match rate of the real feed against the committed Riftbound catalogue
import { readFileSync } from "node:fs";
import { fetchRowsFor } from "../src/lib/fetchtcg";
const cards = JSON.parse(readFileSync("data/public/cards.json", "utf8")) as { name: string; setName: string; collectorNumber: string; slug: string; isPromo: boolean }[];
let hit = 0, both = 0, promo = 0; const miss: Record<string, string[]> = {}; const sample: string[] = [];
for (const c of cards) {
  if (c.isPromo) { promo++; continue; }
  const r = fetchRowsFor(c);
  if (r) { hit++; if (r.rows.length > 1) both++; if (sample.length < 3) sample.push(`${c.slug}: ` + r.rows.map((x) => `${x.finish} ${x.condition} ${x.priceCents}c`).join(", ")); }
  else (miss[c.setName] ||= []).push(`${c.collectorNumber} ${c.name}`);
}
console.log("catalogue", cards.length, "promos skipped", promo, "matched", hit, "both finishes", both);
for (const [s, m] of Object.entries(miss)) console.log("MISS", s, m.length, m.slice(0, 6).join(" ;; "));
console.log(sample.join("\n"));
