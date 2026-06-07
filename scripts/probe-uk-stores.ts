// Market-scan probe: mirrors the importer's sitemap-based discovery to find which UK
// TCG stores are Shopify AND expose Riftbound SINGLES collections (in GBP).
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36", Accept: "*/*" };
const NON_SINGLE = /sealed|booster|box|bundle|preorder|pre-order|accessor|playmat|sleeve|merch|deck-?box|gift|case|tin|blister|collection-box/i;

async function fetchText(url: string): Promise<string | null> {
  try { const r = await fetch(url, { headers: UA }); return r.ok ? await r.text() : null; } catch { return null; }
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

async function probe(name: string, base: string): Promise<string> {
  const d = await discover(base);
  if (!d.isShopify) return `${name.padEnd(18)} ✗ not Shopify`;
  if (!d.handles.length) return `${name.padEnd(18)} ~ Shopify; riftbound: ${d.anyRiftbound ? "sealed-only" : "none"}`;
  let inStock = 0, total = 0, sample = "";
  for (const h of d.handles.slice(0, 4)) {
    for (let page = 1; page <= 4; page++) {
      const j = await fetchText(`${base}/collections/${h}/products.json?country=GB&limit=250&page=${page}`);
      if (!j) break;
      let arr: any[]; try { arr = JSON.parse(j).products; } catch { break; }
      if (!arr || !arr.length) break;
      total += arr.length;
      for (const p of arr) { const v = (p.variants || []).find((v: any) => v.available); if (v) { inStock++; if (!sample) sample = `${p.title.slice(0, 26)} £${v.price}`; } }
      if (arr.length < 250) break;
    }
  }
  return `${name.padEnd(18)} ✓ inStock=${String(inStock).padStart(4)} (of ${total})  [${d.handles[0]}]  e.g. ${sample}`;
}

const STORES: [string, string][] = [
  ["MagicMadhouse", "https://magicmadhouse.co.uk"],
  ["TotalCards", "https://totalcards.net"],
  ["ChaosCards", "https://www.chaoscards.co.uk"],
  ["BigOrbitCards", "https://www.bigorbitcards.co.uk"],
  ["ElementGames", "https://elementgames.co.uk"],
  ["WaylandGames", "https://www.waylandgames.co.uk"],
  ["DarkSphere", "https://darksphere.co.uk"],
  ["ZatuGames", "https://www.board-game.co.uk"],
  ["Manaleak", "https://www.manaleak.com"],
  ["PatriotGames", "https://www.patriotgames.co.uk"],
  ["GatheringGames", "https://gatheringgames.co.uk"],
  ["Harlequins", "https://harlequinsgames.com"],
  ["CardGoblin", "https://www.cardgoblin.shop"],
  ["TheCardVault", "https://thecardvault.co.uk"],
  ["GoblinGaming", "https://www.goblingaming.co.uk"],
  ["AxionNow", "https://www.axionnow.com"],
  ["CardXchange", "https://www.cardxchange.uk"],
  ["FirestormGames", "https://www.firestormgames.co.uk"],
  ["TravellingMan", "https://travellingman.com"],
  ["LeisureGames", "https://www.leisuregames.com"],
  ["FanBoyThree", "https://fanboythree.co.uk"],
  ["SpiralGalaxy", "https://www.spiralgalaxygames.co.uk"],
  ["GeekRetreat", "https://geekretreat.com"],
  ["HairyGoblin", "https://www.hairygoblin.co.uk"],
  ["TCGRepublic", "https://tcgrepublic.com"],
  ["ThatCardShop", "https://thatcardshop.co.uk"],
  ["CardGuardian", "https://cardguardian.co.uk"],
  ["TheRedDragon", "https://thereddragoncards.com"],
  ["Spotlight", "https://spotlightcardshop.co.uk"],
  ["MtgMadness", "https://www.mtgmadness.co.uk"],
];

(async () => {
  for (const [n, b] of STORES) {
    try { console.log(await probe(n, b)); } catch (e) { console.log(`${n.padEnd(18)} ERR ${(e as Error).message}`); }
  }
})();
