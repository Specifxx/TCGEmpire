// Market-scan probe: mirrors the importer's sitemap-based discovery to (re)verify
// which candidate US TCG stores are Shopify AND expose live Riftbound SINGLES
// collections (in USD), before trusting their configured collection handles in
// retailers.ts. Read-only (no DB) — run it somewhere with real internet access
// (CI, a dev machine) and read the log to decide/update the list; this sandbox's
// egress policy blocks the very domains below, so the 2026-07 batch was added
// from the research brief's own figures and needs re-verification here.
//
// Uses the same robots.txt/backoff-aware headers as the real importer
// (lib/scrape-http.ts) rather than a bare fetch, so probing never hammers a
// store harder than a real import run would.
export {}; // module scope — avoids global-name collisions with other probe scripts
import { SCRAPE_HEADERS as UA, sleep, REQUEST_DELAY_MS, isRateLimited, robotsAllows } from "../src/lib/scrape-http";

const NON_SINGLE = /sealed|booster|box|bundle|preorder|pre-order|accessor|playmat|sleeve|merch|deck-?box|gift|case|tin|blister|collection-box/i;

async function fetchText(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { headers: UA });
    return r.ok ? await r.text() : null;
  } catch {
    return null;
  }
}

async function discover(base: string) {
  const allowed = await robotsAllows(base);
  if (!allowed("/sitemap.xml")) return { isShopify: false, handles: [] as string[], anyRiftbound: false, robotsBlocked: true };
  const index = await fetchText(`${base}/sitemap.xml`);
  let sitemaps = index
    ? [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).filter((u) => /sitemap_collections/i.test(u))
    : [];
  if (!sitemaps.length) sitemaps = [`${base}/sitemap_collections_1.xml`];
  const handles = new Set<string>();
  let anyRiftbound = false;
  for (const [i, sm] of sitemaps.slice(0, 8).entries()) {
    if (i > 0) await sleep(REQUEST_DELAY_MS);
    const xml = await fetchText(sm);
    if (!xml) continue;
    for (const m of xml.matchAll(/\/collections\/([^<\/?#"]+)/g)) {
      const h = m[1];
      if (/riftbound/i.test(h) && !/\.(jpe?g|png|gif|webp|svg)$/i.test(h)) {
        anyRiftbound = true;
        if (!NON_SINGLE.test(h)) handles.add(h);
      }
    }
  }
  return { isShopify: index != null, handles: [...handles], anyRiftbound, robotsBlocked: false };
}

async function probe(name: string, base: string): Promise<string> {
  const d = await discover(base);
  if (d.robotsBlocked) return `${name.padEnd(20)} ~ robots.txt disallows the crawl — skipped (not scraped, not an error)`;
  if (!d.isShopify) return `${name.padEnd(20)} ✗ not Shopify (no sitemap) — needs a custom adapter, or is Cloudflare-blocked`;
  if (!d.handles.length) return `${name.padEnd(20)} ~ Shopify; riftbound: ${d.anyRiftbound ? "sealed-only" : "none found"}`;
  let inStock = 0, total = 0, sample = "";
  const allowed = await robotsAllows(base);
  for (const h of d.handles.slice(0, 4)) {
    if (!allowed(`/collections/${h}/products.json`)) continue;
    for (let page = 1; page <= 4; page++) {
      if (page > 1) await sleep(REQUEST_DELAY_MS);
      const url = `${base}/collections/${h}/products.json?country=US&limit=250&page=${page}`;
      let res: Response;
      try {
        res = await fetch(url, { headers: UA });
      } catch {
        break;
      }
      if (isRateLimited(res)) {
        console.warn(`  ${name}: rate-limited (429) on ${h} page ${page} — backing off, not retrying.`);
        break;
      }
      if (!res.ok) break;
      let arr: any[];
      try {
        arr = (await res.json()).products;
      } catch {
        break;
      }
      if (!arr || !arr.length) break;
      total += arr.length;
      for (const p of arr) {
        const v = (p.variants || []).find((v: any) => v.available);
        if (v) {
          inStock++;
          if (!sample) sample = `${p.title.slice(0, 30)} $${v.price}`;
        }
      }
      if (arr.length < 250) break;
    }
  }
  return `${name.padEnd(20)} ✓ inStock=${String(inStock).padStart(4)} (of ${total})  [${d.handles.join(",")}]  e.g. ${sample}`;
}

const STORES: [string, string][] = [
  // ---- 2026-07 US batch: 12 new Shopify stores (see retailers.ts) -------------
  ["GameGridLehi(GG)", "https://store.gglehi.com"],
  ["KnightAndDay", "https://knightanddaygames.com"],
  ["GrognardGames", "https://grognardgames.com"],
  ["VegasSingles", "https://vegas.singles"],
  ["ShippinTexas", "https://shippintexas.com"],
  ["TheNerdMerchant", "https://thenerdmerchant.com"],
  ["E4Cards", "https://e4cards.com"],
  ["FoxAndFable", "https://foxandfablegames.com"],
  ["ManyRealms", "https://manyrealms.com"],
  ["Phantasma", "https://phantasmalv.com"],
  ["MillenniumGames", "https://shop.millenniumgames.com"],
  ["151Collectables", "https://151collectables.com"],
  ["TotalEscapeGames", "https://totalescapegames.com"],
  // ---- Cloudflare-rate-limited candidates (see retailers.ts) — expect these to
  // report 0/blocked until Cloudflare stops rate-limiting; do NOT loop-retry them.
  ["CardboardHorde", "https://cardboardhorde.com"],
  ["DragonsVaultNJ", "https://thedragonsvaultofnj.com"],
  ["CardQuestLGS", "https://cardquestlgs.com"],
];

(async () => {
  for (const [n, b] of STORES) {
    try {
      console.log(await probe(n, b));
    } catch (e) {
      console.log(`${n.padEnd(20)} ERR ${(e as Error).message}`);
    }
  }
})();
