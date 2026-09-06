// Market-scan probe: mirrors the importer's sitemap-based discovery to find which UK
// TCG stores are Shopify AND expose Riftbound SINGLES collections (in GBP).
//
// It also PROVES the currency rather than assuming it. products.json carries no
// currency field, so a store whose Shopify Markets doesn't cover GB silently
// returns its default currency and the importer would file those numbers as GBP.
// The homepage currency sniff can't settle it either — several genuine UK stores
// render a USD homepage to our US-hosted probe while their GB market really does
// price in GBP. So for any store with stock we re-fetch one product PAGE under the
// same ?country=GB and read the currency back out of its JSON-LD / og / Shopify
// globals, and check the page price matches the feed price.
// Read-only (no DB) — run it in CI and read the log to decide the list.
export {}; // module scope — avoids global-name collisions with other probe scripts
import { SCRAPE_HEADERS as UA, robotsAllows } from "../src/lib/scrape-http";

const NON_SINGLE = /sealed|booster|box|bundle|preorder|pre-order|accessor|playmat|sleeve|merch|deck-?box|gift|case|tin|blister|collection-box/i;

async function fetchText(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(25000) });
    return r.ok ? await r.text() : null;
  } catch { return null; }
}

async function discover(base: string) {
  const allowed = await robotsAllows(base);
  const robotsOk = allowed("/collections/riftbound/products.json");
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
  return { isShopify: index != null, handles: [...handles], anyRiftbound, robotsOk };
}

// The currency the store REALLY charges a GB shopper for `handle`, read off the
// product page served under the same ?country= the importer scrapes with.
async function provenCurrency(base: string, handle: string, feedPrice: string) {
  const html = (await fetchText(`${base}/products/${handle}?country=GB`)) ?? "";
  const cur =
    html.match(/"priceCurrency"\s*:\s*"([A-Z]{3})"/)?.[1] ??
    html.match(/property="og:price:currency"\s+content="([A-Z]{3})"/)?.[1] ??
    html.match(/Shopify\.currency\s*=\s*\{"active":"([A-Z]{3})"/)?.[1] ??
    "?";
  const prices = [...html.matchAll(/"price"\s*:\s*"?([0-9]+(?:\.[0-9]+)?)"?/g)].map((m) => m[1]);
  return { cur, agrees: prices.includes(feedPrice) || prices.includes(String(Number(feedPrice))) };
}

async function probe(name: string, base: string): Promise<string> {
  const d = await discover(base);
  if (!d.isShopify) return `${name.padEnd(22)} ✗ not Shopify`;
  if (!d.robotsOk) return `${name.padEnd(22)} ✗ robots.txt disallows the products.json feed`;
  if (!d.handles.length) return `${name.padEnd(22)} ~ Shopify; riftbound: ${d.anyRiftbound ? "sealed-only" : "none"}`;
  let inStock = 0, total = 0, sample = "", firstHandle = "", firstPrice = "";
  for (const h of d.handles.slice(0, 6)) {
    for (let page = 1; page <= 6; page++) {
      const j = await fetchText(`${base}/collections/${h}/products.json?country=GB&limit=250&page=${page}`);
      if (!j) break;
      let arr: any[]; try { arr = JSON.parse(j).products; } catch { break; }
      if (!arr || !arr.length) break;
      total += arr.length;
      for (const p of arr) {
        const v = (p.variants || []).find((v: any) => v.available);
        if (!v) continue;
        inStock++;
        if (!sample) { sample = `${p.title.slice(0, 26)} £${v.price}`; firstHandle = p.handle; firstPrice = v.price; }
      }
      if (arr.length < 250) break;
    }
  }
  const cur = firstHandle ? await provenCurrency(base, firstHandle, firstPrice) : null;
  const curTag = cur ? `cur=${cur.cur}${cur.agrees ? "" : "(page≠feed)"}` : "cur=n/a";
  const policy = (await fetchText(`${base}/policies/shipping-policy`)) != null;
  return `${name.padEnd(22)} ✓ ${curTag} policy=${policy ? "y" : "n"} inStock=${String(inStock).padStart(4)} (of ${String(total).padStart(4)})  [${d.handles.slice(0, 3).join(",")}]  e.g. ${sample}`;
}

const STORES: [string, string][] = [
  // Currently tracked UK stores (re-verify before trusting a run)
  ["ThistleTavern", "https://thistletavern.com"],
  ["CardGoblin", "https://www.cardgoblin.shop"],
  ["AxionNow", "https://www.axionnow.com"],
  ["SpellboundGames", "https://spellboundgames.co.uk"],
  ["TotalCards", "https://totalcards.net"],
  ["BoardsAndSwords", "https://boardsandswords.co.uk"],
  ["ForbiddenPlanet", "https://shop.forbiddenplanet.co.uk"],
  ["ZatuGames", "https://www.board-game.co.uk"],
  ["TheCardVault", "https://thecardvault.co.uk"],
  ["GoblinGaming", "https://www.goblingaming.co.uk"],
  ["GatheringGames", "https://gatheringgames.co.uk"],
  ["Harlequins", "https://harlequinsgames.com"],
  ["TravellingMan", "https://travellingman.com"],
  ["MonsterCardCorner", "https://monstercardcorner.co.uk"],
  // Round 2 (2026-08-13), all added: found by sweeping the OFFICIAL Riftbound
  // Gaming Network store registry (the API behind locator.riftbound.uvsgames.com,
  // game_id=3) across 13 UK population centres — 300 registered UK retailers, of
  // which these carry live GBP singles.
  ["YardsGames", "https://yardsgames.com"],
  ["RedSunCollectables", "https://redsuncollectables.com"],
  ["EvolutionTradingCards", "https://evolutiontradingcards.co.uk"],
  ["DiceSaloon(singles)", "https://dicesaloonsingles.co.uk"],
  ["ImpactLeagueTCG", "https://impactleaguetcg.co.uk"],
  ["BulwarkGames", "https://bulwarkgames.co.uk"],
  ["UnionCountyGames", "https://unioncountygames.co.uk"],
  ["LivingRealms", "https://livingrealms.co.uk"],
  ["MoxInTheHole", "https://moxinthehole.co.uk"],
  ["RollNPlay", "https://rollnplay.co.uk"],
  ["NostalgiaTCG", "https://nostalgiatcg.com"],
  ["TheGamersLodge", "https://thegamerslodge.com"],
  ["KnightlyGaming", "https://knightlygaming.co.uk"],
  ["7thCityCollectables", "https://7thcitycollectables.com"],
  // Checked and NOT added — kept here so a re-run re-checks them rather than
  // someone re-researching from scratch. See the rejection notes in retailers.ts.
  // Not Shopify (nothing to scrape), despite being the biggest UK stockists:
  ["MagicMadhouse", "https://magicmadhouse.co.uk"],
  ["ChaosCards", "https://www.chaoscards.co.uk"],
  ["BigOrbitCards", "https://www.bigorbitcards.co.uk"],
  ["ElementGames", "https://elementgames.co.uk"],
  ["WaylandGames", "https://www.waylandgames.co.uk"],
  // Live Riftbound collections, but event tickets / sealed only at probe time:
  ["BristolIndependent", "https://bristolindependentgaming.co.uk"],
  ["DiceAndDumplings", "https://diceanddumplings.co.uk"],
  ["HullPops", "https://hullpops.co.uk"],
  ["TheDiceCup", "https://dicecupcafe.co.uk"],
  ["OffworldOutpost", "https://offworldoutpost.co.uk"],
  ["UltimateTCG", "https://ultimatetcg.co.uk"],
  ["RetroGamerBros", "https://retrogamerbros.co.uk"],
  ["PixelAndBlock", "https://pixelandblock.co.uk"],
  ["Collecteebles", "https://collecteebles.co.uk"],
  ["Redcaps", "https://redcapgames.co.uk"],
  ["OnyxDawnGames", "https://onyxdawngames.com"],
  ["IncomGaming", "https://incomgaming.co.uk"],
  ["TokyoToys", "https://tokyotoys.com"],
  ["ChesterLeGeek", "https://chesterlegeek.com"],
  ["Entoyment", "https://entoyment.co.uk"],
  ["JustPlayGames", "https://justplaygames.uk"],
  ["SarahsShinies", "https://sarahs-shinies.co.uk"],
  ["BadWolfGaming", "https://badwolfgaming.co.uk"],
  ["HexLabsGames", "https://hexlabsgames.com"],
  ["TheLudoquist", "https://theludoquist.com"],
  ["SnapsGames", "https://snapsgames.co.uk"],
  ["TridentCards", "https://tridentcards.co.uk"],
  ["ElementalCards", "https://elemental.cards"],
];

(async () => {
  for (const [n, b] of STORES) {
    try { console.log(await probe(n, b)); } catch (e) { console.log(`${n.padEnd(22)} ERR ${(e as Error).message}`); }
  }
})();
