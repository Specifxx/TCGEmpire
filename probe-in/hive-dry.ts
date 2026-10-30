// Temporary: run the real Card Hive reader against the public card list. Removed before merge.
import fs from "node:fs";
import { fetchCardHiveProducts } from "../src/lib/cardhive";
const cards = JSON.parse(fs.readFileSync("data/public/cards.json", "utf8")).map((c: any) => ({ id: c.id, name: c.name, setCode: c.setCode, collectorNumber: c.collectorNumber, rarity: c.rarity, variant: c.variant, isPromo: c.isPromo, mkt: c.marketPriceCents }));
const byId = new Map(cards.map((c: any) => [c.id, c]));
async function main() {
const ps = await fetchCardHiveProducts("https://thecardhive.co.uk", cards);
const m = ps.filter((p) => p.cardId);
const lines = [`products ${ps.length} matched ${m.length} in-stock matched ${m.filter((p) => p.variants[0].available).length} distinct cards ${new Set(m.map((p) => p.cardId)).size}`];
lines.push("== unmatched", ...ps.filter((p) => !p.cardId).map((p) => "  " + p.title));
lines.push("== matched (title | our card | £ | TCGplayer US$)");
for (const p of m) { const c: any = byId.get(p.cardId!); lines.push(`  ${p.title} | ${c.name} ${c.setCode} ${c.collectorNumber} | ${p.variants[0].price} ${p.variants[0].available ? "" : "OOS"} | ${c.mkt != null ? (c.mkt / 100).toFixed(2) : "-"}`); }
fs.mkdirSync("probe-out", { recursive: true });
fs.writeFileSync("probe-out/hive-dry.txt", lines.join("\n"));
}
main().catch((e) => { console.error(e); process.exit(1); });
