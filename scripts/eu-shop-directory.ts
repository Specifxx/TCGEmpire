// Eurozone shop directory (2026-11-26, owner: "a much bigger European scene").
// Reads UVS Games' public Riftbound retailer registry (the locator's own API, see
// scripts/probe-eu-stores.ts), keeps eurozone shops with a real website, and asks
// each one's /meta.json whether it is a Shopify shop charging EUR. A shop's
// robots.txt is read first and a disallowed /meta.json is skipped. Prints one
// "SHOP<TAB>host<TAB>name<TAB>country<TAB>currency" line per Shopify shop, so the
// list can seed every site's store probe (most of these shops sell several games).
// Read-only: it writes eu-shop-directory.json and changes nothing.
//   npx tsx scripts/eu-shop-directory.ts
import { writeFileSync, appendFileSync } from "node:fs";
import { SCRAPE_HEADERS, robotsAllows, sleep } from "../src/lib/scrape-http";

const EUROZONE = new Set(["AT", "BE", "HR", "CY", "EE", "FI", "FR", "DE", "GR", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PT", "SK", "SI", "ES"]);
const REGISTRY = "https://api.riftbound.uvsgames.com/api/v2/game-stores/?game_id=3&page_size=200&page=";
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
        out.push({ ...s, base, currency: meta.currency, shopName: meta.name ?? null });
      }
    }),
  );
  out.sort((a, b) => a.host.localeCompare(b.host));
  for (const s of out) console.log(`SHOP\t${s.host}\t${s.name}\t${s.country}\t${s.currency}`);
  console.log(`${out.length} Shopify shops, ${out.filter((s) => s.currency === "EUR").length} charging EUR`);
  writeFileSync("eu-shop-directory.json", JSON.stringify(out, null, 1));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${list.length} eurozone shop domains, ${out.length} Shopify\n`);
})();
