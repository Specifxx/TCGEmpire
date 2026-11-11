// temporary diagnostics: identifiers and raw price shape for Riftbound only
import { readFileSync } from "node:fs";
async function main() {
const key = process.env.FETCH_TCG_API_KEY!;
const res = await fetch("https://api.fetchtcg.com/partner-feed/au.json", { headers: { Authorization: `Bearer ${key}` } });
const f = (await res.json()) as { products: any[] };
const rift = f.products.filter((p) => p.gameId === "rift");
const bySet: Record<string, any[]> = {};
for (const p of rift) (bySet[p.set] ||= []).push(p);
for (const [s, ps] of Object.entries(bySet)) console.log("FETCH", s, ps.length, ps.slice(0, 3).map((p) => `${p.number}|${p.name}|${p.finish}|${p.rarity}`).join(" ;; "));
const cards = JSON.parse(readFileSync("data/public/cards.json", "utf8")) as any[];
const ours: Record<string, any[]> = {};
for (const c of cards) (ours[c.setName] ||= []).push(c);
for (const [s, cs] of Object.entries(ours)) console.log("OURS", s, cs.length, cs.slice(0, 3).map((c) => `${c.collectorNumber}|${c.name}|${c.rarity}|promo=${c.isPromo}`).join(" ;; "));
const withPrices = rift.slice(0, 6).map((p) => `${p.name}: price=${p.price} conds=${JSON.stringify(p.conditions)} stock=${p.stock}`);
console.log(withPrices.join("\n"));
const aa = rift.filter((p) => /Ahri/.test(p.name)).slice(0, 6).map((p) => `${p.set}|${p.number}|${p.name}|${p.finish}|price=${p.price}|${JSON.stringify(p.conditions)}`);
console.log(aa.join("\n"));
}
main();
