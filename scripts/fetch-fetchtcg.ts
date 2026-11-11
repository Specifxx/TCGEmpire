/**
 * First in every build (after fetch-awin): pull Fetch TCG's Australian partner feed and keep this site's game only,
 * in data/fetch-live/au.json (git-ignored: Fetch's terms forbid passing the feed on, and data/ is public with the
 * source). Never fatal: with no key or on any error the old file (or none) stays and the card page shows no Fetch row.
 * FETCH_TCG_API_KEY is a Vercel Production variable and a GitHub Actions secret; never printed.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { cents, pickCondition } from "../src/lib/fetchtcg";

const GAME_ID = "rift";
const OUT_DIR = "data/fetch-live";

interface Product {
  gameId: string; name: string; number: string; set: string; finish: string; url: string; price: number;
  conditions: { condition: string; price: number }[]; stock: number; availability: string;
}

async function main() {
  const key = process.env.FETCH_TCG_API_KEY;
  if (!key) { console.log("Fetch TCG: no FETCH_TCG_API_KEY; no Fetch row this build."); return; }
  const res = await fetch("https://api.fetchtcg.com/partner-feed/au.json", {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const f = (await res.json()) as { country?: string; currency?: string; generatedAt?: string; products?: Product[] };
  if (f.currency !== "AUD" || !Array.isArray(f.products)) throw new Error("unexpected shape");
  const cards = [];
  for (const p of f.products) {
    if (p.gameId !== GAME_ID || p.availability !== "in_stock" || !(p.stock > 0) || !/^https:\/\/www\.fetchtcg\.com\//.test(p.url)) continue;
    if (p.finish !== "Normal" && p.finish !== "Foil") continue;
    const c = pickCondition(p.conditions ?? []);
    if (!c) continue;
    cards.push({ s: p.set, no: p.number, n: p.name, f: p.finish, c: c.condition, p: cents(c.price), u: p.url });
  }
  if (!cards.length) throw new Error("no cards for this game");
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(`${OUT_DIR}/au.json`, JSON.stringify({ fetchedAt: new Date().toISOString(), cards }));
  console.log(`Fetch TCG: ${cards.length} in-stock ${GAME_ID} listings kept (feed of ${f.products.length}).`);
}

main().catch((e) => console.warn(`Fetch TCG feed not read (${(e as Error).message}); no Fetch row this build.`));
