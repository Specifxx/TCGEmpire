// Market-scan probe: mirrors the importer's sitemap-based discovery to find which
// Singapore TCG stores are Shopify AND expose Riftbound SINGLES collections, and
// sniffs each shop's currency + location markers so we only list genuine SGD/SG
// stores. Read-only (no DB) — run it in CI and read the log to decide the list.
export {}; // module scope — avoids global-name collisions with other probe scripts
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36", Accept: "*/*" };
const NON_SINGLE = /sealed|booster|box|bundle|preorder|pre-order|accessor|playmat|sleeve|merch|deck-?box|gift|case|tin|blister|collection-box/i;

async function fetchText(url: string): Promise<string | null> {
  try { const r = await fetch(url, { headers: UA, redirect: "follow" }); return r.ok ? await r.text() : null; } catch { return null; }
}

async function discover(base: string) {
  const index = await fetchText(`${base}/sitemap.xml`);
  let sitemaps = index ? [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).filter((u) => /sitemap_collections/i.test(u)) : [];
  if (!sitemaps.length) sitemaps = [`${base}/sitemap_collections_1.xml`];
  const handles = new Set<string>();
  let anyRiftbound = false;
  for (const sm of sitemaps.slice(0, 8)) {
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
  return { isShopify: index != null, handles: [...handles], anyRiftbound };
}

// Currency + location sniff from the storefront HTML. Shopify themes reliably embed
// the shop currency (Shopify.currency / currencyCode); "Singapore" in the page is a
// weaker location hint but useful corroboration for .com domains.
async function sniff(base: string): Promise<{ currency: string; sg: boolean }> {
  const html = (await fetchText(base)) ?? "";
  const cur =
    html.match(/Shopify\.currency\s*=\s*\{"active":"([A-Z]{3})"/)?.[1] ??
    html.match(/"currencyCode"\s*:\s*"([A-Z]{3})"/)?.[1] ??
    html.match(/shop_currency['"]?\s*[:=]\s*['"]([A-Z]{3})['"]/)?.[1] ??
    "?";
  return { currency: cur, sg: /singapore/i.test(html) };
}

async function probe(name: string, base: string): Promise<string> {
  const d = await discover(base);
  if (!d.isShopify) return `${name.padEnd(20)} ✗ not Shopify (no sitemap)`;
  const s = await sniff(base);
  const tag = `cur=${s.currency} sg-mention=${s.sg ? "y" : "n"}`;
  if (!d.handles.length) return `${name.padEnd(20)} ~ Shopify (${tag}); riftbound: ${d.anyRiftbound ? "sealed-only" : "none"}`;
  let inStock = 0, total = 0, sample = "";
  for (const h of d.handles.slice(0, 4)) {
    for (let page = 1; page <= 4; page++) {
      const j = await fetchText(`${base}/collections/${h}/products.json?country=SG&limit=250&page=${page}`);
      if (!j) break;
      let arr: any[]; try { arr = JSON.parse(j).products; } catch { break; }
      if (!arr || !arr.length) break;
      total += arr.length;
      for (const p of arr) { const v = (p.variants || []).find((v: any) => v.available); if (v) { inStock++; if (!sample) sample = `${p.title.slice(0, 30)} @ ${v.price}`; } }
      if (arr.length < 250) break;
    }
  }
  return `${name.padEnd(20)} ✓ ${tag}  inStock=${String(inStock).padStart(4)} (of ${total})  [${d.handles.join(",")}]  e.g. ${sample}`;
}

const STORES: [string, string][] = [
  // Existing tracked SG stores (re-verify before the first SG import)
  ["Hideout", "https://hideoutcg.com"],
  ["FlagshipGames", "https://www.flagshipgames.sg"],
  ["SCCollection", "https://www.sc-collection.sg"],
  ["ActionPoint", "https://actionpoint.sg"],
  // Candidates (search-sourced; verify before listing)
  ["ManaPro", "https://sg-manapro.com"],
  ["ShinyCardTraders", "https://shinycardtraders.com"],
  ["ChonkyCollectibles", "https://chonkycollectibles.com"],
  ["GamesHaven", "https://www.gameshaventcg.com"],
  ["OneMtg", "https://www.onemtg.com.sg"],
  ["GreyOgreGames", "https://www.greyogregames.com"],
  ["CardsCitadel", "https://www.cardscitadel.com"],
  ["MoxAndLotus", "https://www.moxandlotus.sg"],
  ["DXCollection", "https://dxcollection.com.sg"],
  ["CardboardCollect.", "https://cardboardcollectible.com"],
  ["1Collectibles", "https://www.1collectibles.com"],
  ["DuellersPoint", "https://www.duellerspoint.com"],
  ["AgoraHobby", "https://agorahobby.com"],
  ["MTGAsia", "https://www.mtg-asia.com"],
  ["TCGMarketplaceSG", "https://www.tcgmarketplace.sg"],
  ["CaesarCards", "https://caesarcards.sg"],
  ["ZoomiesGaming", "https://zoomiesgaming.com"],
  ["CardArena", "https://cardarena.sg"],
  // Round 2 (2026-07-10): 1Collectibles runs a SEPARATE TCG storefront with a live
  // riftbound collection (missed on round 1, which probed their main domain).
  ["1CollectiblesTCG", "https://1collectiblestcg.com"],
  ["BattleBunker", "https://www.battlebunker.com.sg"],
  ["GamesPI", "https://www.gamespi.com"],
  ["RapidCulture", "https://rapidculture.sg"],
];

(async () => {
  for (const [n, b] of STORES) {
    try { console.log(await probe(n, b)); } catch (e) { console.log(`${n.padEnd(20)} ERR ${(e as Error).message}`); }
  }
})();
