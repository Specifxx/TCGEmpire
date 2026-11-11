// One-off CI check: run the real build step, then match against the committed Riftbound catalogue. Prints counts and prices
// of three cards only (public card names), never the feed.
import { readFileSync } from "node:fs";
import { fetchRowsFor } from "../src/lib/fetchtcg";
const cards = JSON.parse(readFileSync("data/public/cards.json", "utf8")) as { name: string; setName: string; collectorNumber: string; slug: string }[];
let hit = 0, both = 0; const miss: Record<string, number> = {}; const sample: string[] = [];
for (const c of cards) {
  const r = fetchRowsFor(c);
  if (r) { hit++; if (r.rows.length > 1) both++; if (sample.length < 4) sample.push(`${c.slug}: ` + r.rows.map((x) => `${x.finish} ${x.condition} ${x.priceCents}c`).join(", ")); }
  else miss[c.setName] = (miss[c.setName] || 0) + 1;
}
console.log("catalogue", cards.length, "matched", hit, "with both finishes", both, "unmatched by set", JSON.stringify(miss));
console.log(sample.join("\n"));
