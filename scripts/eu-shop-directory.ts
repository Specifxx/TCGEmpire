// Eurozone shop directory (2026-11-26, owner: "a much bigger European scene").
// Reads UVS Games' public Riftbound retailer registry (the locator's own API, see
// scripts/probe-eu-stores.ts), keeps eurozone shops with a real website, and asks
// each one's /meta.json whether it is a Shopify shop charging EUR. A shop's
// robots.txt is read first and a disallowed /meta.json is skipped. Prints one
// "SHOP<TAB>host<TAB>name<TAB>country<TAB>currency" line per Shopify shop, so the
// list can seed every site's store probe (most of these shops sell several games).
// Read-only: it writes eu-shop-directory.json and changes nothing.
//   npx tsx scripts/eu-shop-directory.ts
import { writeFileSync, appendFileSync, readFileSync } from "node:fs";
import { SCRAPE_HEADERS, robotsAllows, sleep } from "../src/lib/scrape-http";

const EUROZONE = new Set(["AT", "BE", "HR", "CY", "EE", "FI", "FR", "DE", "GR", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PT", "SK", "SI", "ES"]);
const REGISTRY = "https://api.riftbound.uvsgames.com/api/v2/game-stores/?game_id=3&page_size=200&page=";
// Which games a shop's collections name (handle or title), so one pass seeds every site.
const GAMES: [string, RegExp][] = [
  ["riftbound", /riftbound/i],
  ["pokemon", /pok[eé]mon/i],
  ["onepiece", /one-?piece/i],
  ["lorcana", /lorcana/i],
  ["mtg", /magic|\bmtg\b|mtg-/i],
  ["yugioh", /yu-?gi-?oh|yugioh/i],
  ["gundam", /gundam/i],
  ["cyberpunk", /cyberpunk/i],
  ["digimon", /digimon/i],
  ["unionarena", /union-?arena/i],
  ["fusionworld", /fusion-?world|dragon-?ball/i],
  ["starwars", /star-?wars-?unlimited|\bswu\b/i],
  ["fab", /flesh-?and-?blood|\bfab\b/i],
  ["sports", /topps|panini|sports-?cards?/i],
];
const NOT_A_SHOP = /facebook|instagram|linktr|whatsapp|tiktok|twitter|youtube|discord|google\.|maps\.app|wa\.me|cardmarket|ebay\.|amazon\./i;

async function getJson(url: string, ms = 20_000): Promise<any> {
  try {
    const r = await fetch(url, { headers: { ...SCRAPE_HEADERS, Accept: "application/json" }, signal: AbortSignal.timeout(ms) });
    return r.ok ? await r.json().catch(() => null) : null;
  } catch {
    return null;
  }
}

(async () => {
  const first = await getJson(REGISTRY + "1", 45_000);
  if (!first) throw new Error("registry unreachable");
  const pages = Math.ceil(first.total / 200);
  const rows: any[] = [...first.results];
  for (let p = 2; p <= pages; p++) {
    const r = await getJson(REGISTRY + p, 45_000);
    if (r?.results) rows.push(...r.results);
  }
  const byHost = new Map<string, { host: string; name: string; country: string }>();
  for (const row of rows) {
    const s = row?.store ?? {};
    const country = String(s.country ?? "").toUpperCase();
    if (!EUROZONE.has(country)) continue;
    const w = String(s.website ?? "").trim();
    if (!w || NOT_A_SHOP.test(w)) continue;
    const host = w.replace(/^https?:\/\//i, "").replace(/[/?#].*$/, "").toLowerCase().replace(/^www\./, "");
    if (!host.includes(".")) continue;
    if (!byHost.has(host)) byHost.set(host, { host, name: String(s.name ?? host).trim(), country });
  }
  // Plus the eurozone shops our sister sites already list (the Rift discovery pool).
  try {
    for (const p of JSON.parse(readFileSync("data/store-vetting/rift-discovery.json", "utf8")).stores as { name: string; base: string; country: string }[]) {
      const host = new URL(p.base).host.toLowerCase().replace(/^www\./, "");
      if (p.country === "EU" && !byHost.has(host)) byHost.set(host, { host, name: p.name, country: "EU" });
    }
  } catch {}
  const list = [...byHost.values()];
  console.log(`registry: ${rows.length} stores, ${list.length} eurozone shop domains`);
  const out: any[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      while (next < list.length) {
        const s = list[next++];
        const base = `https://${s.host}`;
        let allowed: (p: string) => boolean;
        try {
          allowed = await robotsAllows(base);
        } catch {
          continue;
        }
        if (!allowed("/meta.json")) continue;
        await sleep(500);
        const meta = await getJson(`${base}/meta.json`);
        if (!meta?.currency) continue;
        const games: Record<string, string[]> = {};
        if (meta.currency === "EUR" && allowed("/collections.json")) {
          for (let page = 1; page <= 3; page++) {
            await sleep(1000);
            const d = await getJson(`${base}/collections.json?limit=250&page=${page}`);
            const arr = (d?.collections ?? []) as { handle: string; title?: string; products_count?: number }[];
            for (const c of arr) {
              if (c.products_count === 0) continue;
              const text = `${c.handle} ${c.title ?? ""}`;
              for (const [g, re] of GAMES) if (re.test(text)) (games[g] ??= []).length < 12 && games[g].push(c.handle);
            }
            if (arr.length < 250) break;
          }
        }
        out.push({ ...s, base, currency: meta.currency, shopName: meta.name ?? null, games });
      }
    }),
  );
  out.sort((a, b) => a.host.localeCompare(b.host));
  for (const s of out) console.log(`SHOP\t${s.host}\t${s.name}\t${s.country}\t${s.currency}\t${Object.entries(s.games).map(([g, h]) => `${g}:${(h as string[]).join(",")}`).join(" ")}`);
  console.log(`${out.length} Shopify shops, ${out.filter((s) => s.currency === "EUR").length} charging EUR`);
  writeFileSync("eu-shop-directory.json", JSON.stringify(out, null, 1));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${list.length} eurozone shop domains, ${out.length} Shopify\n`);
})();
