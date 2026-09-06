// Market-scan probe: mirrors the importer's sitemap-based discovery to find which
// Singapore TCG stores are Shopify AND expose Riftbound SINGLES collections, and
// PROVES each shop really prices in SGD for a Singapore shopper so we only list
// genuine SG stores. Read-only (no DB) — run it in CI and read the log to decide
// the list.
//
// Why the currency proof (added 2026-08-13): products.json has no currency field,
// so a store whose Shopify Markets doesn't cover SG silently returns its default
// currency, which the importer would then file as SGD. The old homepage
// `Shopify.currency` sniff is NOT sufficient either — it reads the US-market
// render our US-hosted probe gets, and five genuine SG stores (GOAT, TEFUDA, The
// TCG Alchemists among them) look like USD stores that way while their SG market
// really does charge SGD. So we re-fetch one product PAGE under the same
// ?country=SG the importer scrapes with, read the currency out of its JSON-LD /
// og / Shopify globals, and confirm the page price matches the feed price.
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

async function provenCurrency(base: string, handle: string, feedPrice: string) {
  const html = (await fetchText(`${base}/products/${handle}?country=SG`)) ?? "";
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
  if (!d.isShopify) return `${name.padEnd(22)} ✗ not Shopify (no sitemap)`;
  if (!d.robotsOk) return `${name.padEnd(22)} ✗ robots.txt disallows the products.json feed`;
  if (!d.handles.length) return `${name.padEnd(22)} ~ Shopify; riftbound: ${d.anyRiftbound ? "sealed-only" : "none"}`;
  let inStock = 0, total = 0, sample = "", firstHandle = "", firstPrice = "";
  for (const h of d.handles.slice(0, 6)) {
    for (let page = 1; page <= 6; page++) {
      const j = await fetchText(`${base}/collections/${h}/products.json?country=SG&limit=250&page=${page}`);
      if (!j) break;
      let arr: any[]; try { arr = JSON.parse(j).products; } catch { break; }
      if (!arr || !arr.length) break;
      total += arr.length;
      for (const p of arr) {
        const v = (p.variants || []).find((v: any) => v.available);
        if (!v) continue;
        inStock++;
        if (!sample) { sample = `${p.title.slice(0, 30)} @ ${v.price}`; firstHandle = p.handle; firstPrice = v.price; }
      }
      if (arr.length < 250) break;
    }
  }
  const cur = firstHandle ? await provenCurrency(base, firstHandle, firstPrice) : null;
  const curTag = cur ? `cur=${cur.cur}${cur.agrees ? "" : "(page≠feed)"}` : "cur=n/a";
  const policy = (await fetchText(`${base}/policies/shipping-policy`)) != null;
  return `${name.padEnd(22)} ✓ ${curTag} policy=${policy ? "y" : "n"} inStock=${String(inStock).padStart(4)} (of ${String(total).padStart(4)})  [${d.handles.slice(0, 4).join(",")}]  e.g. ${sample}`;
}

// HOW THIS LIST WAS BUILT (round 5, 2026-08-13). Most Singapore shops trade over
// Instagram/Carousell rather than a website, so the official Riftbound Gaming
// Network registry (locator.riftbound.uvsgames.com's API, game_id=3 — all 113
// retailers within 60mi of Singapore) was mined THREE ways: the `website` field,
// the domain of each store's contact EMAIL (which is how Team Card Game surfaced),
// and name-derived domain guesses for the social-only ones — the only way The TCG
// Alchemists, now the largest SG catalogue on the site, was found at all.
const STORES: [string, string][] = [
  // Currently tracked SG stores
  ["Hideout", "https://hideoutcg.com"],
  ["FlagshipGames", "https://www.flagshipgames.sg"],
  ["SCCollection", "https://www.sc-collection.sg"],
  ["ActionPoint", "https://actionpoint.sg"],
  ["ManaPro", "https://sg-manapro.com"],
  ["OneMtg", "https://www.onemtg.com.sg"],
  ["CardArena", "https://cardarena.sg"],
  ["1CollectiblesTCG", "https://1collectiblestcg.com"],
  ["DuellersPoint", "https://www.duellerspoint.com"],
  ["GamesHaven", "https://www.gameshaventcg.com"],
  ["GreyOgreGames", "https://www.greyogregames.com"],
  ["AgoraHobby", "https://agorahobby.com"],
  ["GameAcademia", "https://www.game-academia.com"],
  ["CardsCitadel", "https://www.cardscitadel.com"],
  ["MoxAndLotus", "https://www.moxandlotus.sg"],
  ["DXCollection", "https://dxcollection.com.sg"],
  ["4elements", "https://www.4elements.sg"],
  ["Brints", "https://brintsco.com"],
  ["DimensionGaming", "https://dimension.gaming.sg"],
  ["TheTradingCardShop", "https://www.thetradingcardshop.com"],
  // Round 5, all added — live SGD singles (in-stock counts at probe time in the
  // retailers.ts comments).
  ["TheTCGAlchemists", "https://thetcgalchemists.com"],
  ["GOATTCG", "https://www.goattcg.com"],
  ["TeamCardGame", "https://teamcardgame.com"],
  ["TCGClubHouse", "https://tcgclubhouse.myshopify.com"],
  ["ApexPlayersGuild", "https://apgtcg.com"],
  ["TEFUDA", "https://tefudagames.com"],
  // Round 5, added as tracked-only: real SGD stores whose live Riftbound
  // collection is empty or wholly out of stock right now, so they price nothing
  // until they restock.
  ["ChonkyCollectibles", "https://chonkycollectibles.com"],
  ["TheAvidCollectors", "https://www.theavidcollectors.com"],
  ["KenkyoHobby", "https://www.kenkyohobby.com"],
  // Checked and NOT added — see the rejection notes in retailers.ts. Real SG
  // shops selling Riftbound singles but NOT on Shopify (nothing to scrape); these
  // are the biggest remaining SG opportunity and need platform support:
  ["CardsCentral", "https://cardscentral.com"],
  ["CardConnectSG", "https://www.cardconnectsg.com"],
  ["MetaGamesTCG", "https://metagamestcg.com"],
  // Shopify SG stores whose only Riftbound stock is sealed / none at probe time:
  ["SentinelGames", "https://sentinelgamessg.com"],
  ["PaintAndPlay", "https://paintandplay.sg"],
  ["LevelUpGames", "https://blitzandpeaces.com"],
  ["1Collectibles(main)", "https://www.1collectibles.com"],
  ["CardboardCollectible", "https://cardboardcollectible.com"],
  ["ShinyCardTraders", "https://shinycardtraders.com"],
  ["HumbleTCG", "https://humbletcg.com"],
  ["Huattoru", "https://huattoru.com"],
  ["KamiKekkai", "https://kamikekkai.com"],
  ["Hideyoshi", "https://hideyoshitcg.com"],
  ["Otterkizz", "https://www.otterkizz.com"],
  ["TheImaginarium", "https://www.theimaginariumsg.com"],
  ["NewtroGaming", "https://newtroshop.com"],
  ["CardsAndChatter", "https://cardsandchatter.com"],
  ["TeamBoardGame", "https://www.teamboardgame.com"],
  ["FyendalHobby", "https://www.fyendalhobby.com"],
  ["MTGAsia", "https://www.mtg-asia.com"],
  ["BattleBunker", "https://www.battlebunker.com.sg"],
  ["GamesPI", "https://www.gamespi.com"],
  ["RapidCulture", "https://rapidculture.sg"],
];

(async () => {
  for (const [n, b] of STORES) {
    try { console.log(await probe(n, b)); } catch (e) { console.log(`${n.padEnd(22)} ERR ${(e as Error).message}`); }
  }
})();
