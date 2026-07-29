// Market-scan probe for the CANADA launch: mirrors the importer's sitemap-based
// discovery to confirm which candidate Canadian TCG stores are Shopify AND expose
// live Riftbound SINGLES collections priced in CAD. Read-only (no DB) — run it
// somewhere with real internet access (CI, a dev machine) and read the log.
//
// WHY THIS MATTERS FOR CA SPECIFICALLY: the stores in retailers.ts's CA block were
// confirmed via web search, NOT a direct fetch (the sandbox they were added from
// blocks third-party domains), so their collection handles are best-known values.
// Two known traps this probe is designed to surface:
//   1. Toy Snowman files Riftbound singles under the handle
//      "magic-the-gathering-singles-copy" — a merchant copy-paste artifact. The
//      handle has no "riftbound" in it, so auto-discovery CANNOT find it; only the
//      explicit handle in retailers.ts works. Expect discovery to report 0 handles
//      for that store while the configured handle still returns products.
//   2. Red Riot and Level Up surface Riftbound at /pages/... (a Shopify PAGE, not a
//      collection) — nothing for products.json to read. Expect "riftbound: none".
//
// Also sniffs the storefront currency, because CA is the market most likely to be
// mis-assigned: several Canadian stores (Danireon, Hobbiesville) run Shopify Markets
// and will happily serve USD to a US-looking visitor. `?country=CA` forces CAD, and
// cur= below reports what the storefront's own theme advertises — a store showing
// cur=USD with a .ca domain is Shopify Markets doing geolocation, NOT evidence the
// store is American. Physical address is the only market-assignment authority.
export {}; // module scope — avoids global-name collisions with other probe scripts
import { SCRAPE_HEADERS as UA, sleep, REQUEST_DELAY_MS, isRateLimited, robotsAllows } from "../src/lib/scrape-http";
import { RETAILER_LIST } from "../src/lib/retailers";

const NON_SINGLE = /sealed|booster|box|bundle|preorder|pre-order|accessor|playmat|sleeve|merch|deck-?box|gift|case|tin|blister|collection-box/i;

async function fetchText(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { headers: UA, redirect: "follow" });
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

// Currency the storefront theme advertises. See the header note: for CA this is a
// corroborating signal only, never the market-assignment authority.
async function sniffCurrency(base: string): Promise<string> {
  const html = (await fetchText(base)) ?? "";
  return (
    html.match(/Shopify\.currency\s*=\s*\{"active":"([A-Z]{3})"/)?.[1] ??
    html.match(/"currencyCode"\s*:\s*"([A-Z]{3})"/)?.[1] ??
    html.match(/shop_currency['"]?\s*[:=]\s*['"]([A-Z]{3})['"]/)?.[1] ??
    "?"
  );
}

async function countStock(base: string, handles: string[]): Promise<{ inStock: number; total: number; sample: string }> {
  let inStock = 0, total = 0, sample = "";
  const allowed = await robotsAllows(base);
  for (const h of handles.slice(0, 4)) {
    if (!allowed(`/collections/${h}/products.json`)) continue;
    for (let page = 1; page <= 4; page++) {
      if (page > 1) await sleep(REQUEST_DELAY_MS);
      let res: Response;
      try {
        res = await fetch(`${base}/collections/${h}/products.json?country=CA&limit=250&page=${page}`, { headers: UA });
      } catch {
        break;
      }
      if (isRateLimited(res)) {
        console.warn(`    rate-limited (429) on ${h} p${page} — backing off, not retrying.`);
        break;
      }
      if (!res.ok) break;
      let arr: any[];
      try {
        arr = (await res.json()).products;
      } catch {
        break;
      }
      if (!arr?.length) break;
      total += arr.length;
      for (const p of arr) {
        const v = (p.variants || []).find((x: any) => x.available);
        if (v) {
          inStock++;
          if (!sample) sample = `${p.title.slice(0, 30)} @ ${v.price}`;
        }
      }
      if (arr.length < 250) break;
    }
  }
  return { inStock, total, sample };
}

async function probe(name: string, base: string, configured: string[]): Promise<string> {
  const d = await discover(base);
  if (d.robotsBlocked) return `${name.padEnd(22)} ~ robots.txt disallows the crawl — skipped`;
  if (!d.isShopify) return `${name.padEnd(22)} ✗ not Shopify (no sitemap)`;
  const cur = await sniffCurrency(base);
  // Probe the SAME union the importer uses: discovered handles ∪ configured ones.
  // That's what proves a configured-only handle (e.g. Toy Snowman's) still works
  // even when discovery finds nothing.
  const union = [...new Set([...d.handles, ...configured])];
  if (!union.length) return `${name.padEnd(22)} ~ Shopify (cur=${cur}); riftbound: ${d.anyRiftbound ? "sealed-only" : "none found"}`;
  const { inStock, total, sample } = await countStock(base, union);
  const onlyConfigured = configured.filter((h) => !d.handles.includes(h));
  const note = onlyConfigured.length ? `  [config-only: ${onlyConfigured.join(",")}]` : "";
  return `${name.padEnd(22)} ✓ cur=${cur} inStock=${String(inStock).padStart(4)} (of ${total})  [${union.join(",")}]${note}  e.g. ${sample}`;
}

(async () => {
  // Drive straight off the registry so this can never drift from what's configured.
  const caStores = RETAILER_LIST.filter((r) => r.country === "CA");
  console.log(`Probing ${caStores.length} configured CA stores (?country=CA)…\n`);
  for (const s of caStores) {
    try {
      console.log(await probe(s.name, s.base, s.collections ?? []));
    } catch (e) {
      console.log(`${s.name.padEnd(22)} ERR ${(e as Error).message}`);
    }
    await sleep(REQUEST_DELAY_MS);
  }
})();
