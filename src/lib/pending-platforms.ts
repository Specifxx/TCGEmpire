// Research artifact, NOT wired into scraping — nothing in this file is imported
// by price-import.ts, sealed-import.ts, or retailers.ts.
//
// DECISION (2026-07-29): CrystalCommerce's own platform Terms of Service
// restricts "unauthorized data access, scraping, and sharing" for anyone using
// their Services — ambiguous whether that reaches third parties reading a
// public storefront rather than the merchant-facing platform itself, but a
// real caution flag with no clean per-store resolution either way (unlike
// Shopify's products.json, which has a long-established, widely-practiced
// norm behind it — the same norm every other store in RETAILERS relies on).
// Given that ambiguity, explicitly decided to hold the strict line: nothing
// below gets scraped or added as a live store until someone gets a clean,
// confirmed answer for that specific store (its own ToS/robots.txt, or
// explicit permission) — not "not clearly prohibited," but affirmatively
// confirmed. This was a deliberate choice, not an oversight — don't read the
// absence of these stores from RETAILERS as unfinished work to pick back up
// without that confirmation first.
//
// Do not add these to RETAILERS: they are NOT Shopify, so discoverRiftboundCollections()/
// fetchCollection() (which only know how to build /collections/<handle>/
// products.json URLs) would silently find nothing — not "blocked", just the
// wrong endpoint shape entirely. That's a materially different situation from
// the Cloudflare-rate-limited Shopify stores in retailers.ts (those ARE the
// right endpoint, just currently refused).
//
// This is the structured version of "Step 4 — Crystal Commerce bulk
// opportunity" from the 2026-07 US research brief. This sandbox can't fetch
// these sites directly (egress policy blocks all third-party domains), so
// everything below came from WebSearch result synthesis, not a direct fetch —
// treat every field as "found via search, not independently verified" until
// scripts/probe-crystal-commerce.ts (or a live network check) confirms it.
//
// What's still missing before a real adapter can be written (this is the
// actual blocker, not just "nobody got to it"): the exact price/condition/
// stock data shape on a Crystal Commerce PRODUCT page. We have confirmed real
// category URLs and one confirmed real price (via search synthesis, not a
// direct fetch), but not the underlying HTML/JSON structure to parse reliably
// across stores with different themes. Crystal Commerce does publish a JSON
// API (docs.crystalcommerce.com/json_api.html) with condition/price_cents/
// msrp_cents fields, but it reads as a REST/CRUD API (GET/POST/PUT/DELETE) —
// the shape of a merchant-authenticated management API, not confirmed as a
// public anonymous read feed the way Shopify's products.json is. Confirm that
// distinction on ONE real store before generalizing to the rest.

export interface PendingPlatformCandidate {
  name: string;
  base: string; // origin, no trailing slash
  // Confirmed via web search to be real category/product URLs on this domain —
  // NOT necessarily the full current catalog (search only surfaces what's
  // indexed). Useful as a starting point for scripts/probe-crystal-commerce.ts.
  confirmedPaths: string[];
  location: string | null; // city, state — null if not confirmed
  platform: "crystal-commerce" | "unknown";
  confidence: "high" | "medium";
  note: string;
}

export const PENDING_US_STORES: PendingPlatformCandidate[] = [
  {
    name: "Amazing Discoveries Tucson",
    base: "https://www.amazingmtg.com",
    confirmedPaths: [
      "/catalog/more_tcgs-riftbound_league_of_legends_trading_card_game-riftbound_singles-riftbound_singles_spiritforged/14842",
      "/catalog/more_tcgs-riftbound_league_of_legends_trading_card_game-riftbound_singles-riftbound_singles_origins/14790",
      "/catalog/more_tcgs-riftbound/14786",
      "/catalog/riftbound_singles_promotional_cards/14792",
      "/catalog/riftbound_singles_origins_proving_grounds/14791",
    ],
    location: "Tucson, AZ (multi-location southern Arizona chain)",
    platform: "crystal-commerce",
    confidence: "high",
    note: "Confirmed live singles across Spiritforged, Origins, Origins: Proving Grounds, and Promotional Cards categories.",
  },
  {
    name: "Brute Force Games",
    base: "https://www.bruteforcemtg.com",
    confirmedPaths: [
      "/catalog/riftbound_origin_singles/3240",
      "/catalog/riftbound_singles-riftbound_spiritforged_singles",
      "/catalog/riftbound_tcg_sealed_products-riftbound_tcg_booster_packs/3168",
      "/catalog/riftbound_tcg_starter_decks/3169",
      "/catalog/riftbound_origin_singles/aspirants_climb__276298__uncommon/509320",
    ],
    location: "San Diego, CA",
    platform: "crystal-commerce",
    confidence: "high",
    note: "Highest-confidence candidate: search synthesis actually surfaced a real price ($0.25 for Aspirant's Climb 276/298 Uncommon) from the live product page, not just a title.",
  },
  {
    name: "The Wasteland Gaming",
    base: "https://www.thewastelandgaming.com",
    confirmedPaths: ["/catalog/riftbound_singles/7812"],
    location: "3650 Satellite Blvd Unit B, Duluth, GA 30096",
    platform: "crystal-commerce",
    confidence: "high",
    note: "Confirmed live riftbound_singles category page and a real US storefront address.",
  },
  {
    name: "Nerd Rage Gaming",
    base: "https://www.nerdragegaming.com",
    confirmedPaths: ["/catalog/riftbound_singles-riftbound_promos/4569"],
    location: "1361 W. Dundee Rd, Buffalo Grove, IL 60089",
    platform: "crystal-commerce",
    confidence: "high",
    note: "Confirmed a riftbound_singles-riftbound_promos subcategory exists — implies a parent riftbound_singles category (not directly confirmed by URL yet).",
  },
  {
    name: "The Games Cube",
    base: "https://www.thegamescube.com",
    confirmedPaths: ["/catalog/all_other_tcgs-riftbound/6173", "/catalog/riftbound-riftbound_starter_decks/6197"],
    location: null,
    platform: "crystal-commerce",
    confidence: "medium",
    note: "Confirmed real Riftbound category + starter decks; singles-specific category and US location not yet confirmed.",
  },
  {
    name: "Cardboard Castle Games",
    base: "https://www.cardboardcastlegames.com",
    confirmedPaths: ["/catalog/riftbound_sealed_products-riftbound_boxes/7307"],
    location: null,
    platform: "crystal-commerce",
    confidence: "medium",
    note: "Only sealed (boxes) confirmed so far — singles category and US location not yet confirmed.",
  },
  {
    name: "Darkhound Game Center",
    base: "https://www.darkhoundgamecenter.com",
    confirmedPaths: ["/catalog/events/12713"],
    location: "800 SW Green Oaks Blvd, Arlington, TX 76017",
    platform: "crystal-commerce",
    confidence: "medium",
    note: "Confirmed as an Online Retailer on the official Riftbound Gaming Network locator, and the generic /catalog/ URL shape matches Crystal Commerce — but no Riftbound-specific catalog path confirmed yet (only a /catalog/events/ page was found).",
  },
  {
    name: "Grand J Games",
    base: "https://grandjgames.com",
    confirmedPaths: ["/tcgs/riftbound/", "/tcgs/riftbound/riftbound-singles/", "/tcgs/riftbound/riftbound-preorder/"],
    location: null,
    platform: "unknown",
    confidence: "medium",
    note: "Confirmed real riftbound-singles section, but the /tcgs/<game>/<category>/ URL shape matches neither Shopify nor Crystal Commerce — a third, unidentified platform. Needs its own investigation before assuming either adapter fits.",
  },
];

// ── Permission-blocked, NOT technically-blocked — a categorically different
// situation from PENDING_US_STORES above. For these, the data is confirmed
// real and plausibly fetchable; what's missing is confirmed permission to
// fetch it, not adapter code. Do not scrape these without resolving that
// first, no matter how good the data looks.
export interface PermissionBlockedCandidate {
  name: string;
  base: string;
  confirmedPaths: string[];
  note: string;
}

export const PENDING_PERMISSION_UNRESOLVED: PermissionBlockedCandidate[] = [
  {
    name: "CoolStuffInc",
    base: "https://www.coolstuffinc.com",
    confirmedPaths: [
      "/page/8996", // Riftbound: League of Legends — main category
      "/page/9253", // Common Singles
      "/page/9254", // Uncommon Singles
      "/page/9256", // Epic Singles
      "/page/9257", // Alternate Art Singles
    ],
    note:
      "Confirmed via web search: a large, genuinely live catalogue (Common Singles alone: 249 results across 10 pages; " +
      "Uncommon $0.49–$4.99, Alternate Art $2.99–$71.99, Epic from $14.99 — matching the original research's own category " +
      "8996 exactly). This is real, valuable data. It is NOT added or scraped because permission is still unresolved, not " +
      "because the data is hard to get: three separate searches found no ToS statement on scraping and no affiliate/data-" +
      "feed program. Check coolstuffinc.com/robots.txt and their actual Terms of Service directly before writing anything — " +
      "the value of the data is not a reason to skip that check.",
  },
  {
    name: "Fetch TCG (AU/NZ marketplace)",
    base: "https://www.fetchtcg.com",
    confirmedPaths: [
      "/marketplace/games/rift", // Riftbound category
      "/marketplace/listings",
      "/cards/rift_o-026:298_R_standard_normal/riftbound-brynhir-thundersong-origins-foil",
      "/cards/rift_unl-r-036:219_C_standard_normal/riftbound-mutated-mouser-unleashed-normal",
    ],
    note:
      "Requested as an AU store; it is NOT one, and must not be added to RETAILERS. Three reasons, in order of how " +
      "badly each would bite. (1) NOT SHOPIFY — the URL shape above is a bespoke app, so the Shopify importer would " +
      "build /collections/<handle>/products.json against it, get nothing, and leave a store on /stores/tracked with " +
      "its own store page that never shows a single price. Same trap as the Crystal Commerce entries above. " +
      "(2) IT'S A MARKETPLACE, NOT A RETAILER — self-described as 'Oceania's dedicated TCG marketplace ... for buyers " +
      "and sellers across Australia and New Zealand', with seller profiles and auctions. That's the eBay/TCGplayer/" +
      "Cardmarket shape, and this repo deliberately keeps those OUT of RETAILERS with their own per-market keys (see " +
      "the warning in lib/store-pages.ts about non-stores rendering store pages). It also spans TWO markets, so it'd " +
      "need fetchtcg_au + fetchtcg_nz keys, not a single AU entry. (3) DOUBLE-COUNTING — Fetch ships a Shopify plugin " +
      "that syncs partner stores' inventory INTO Fetch, so its listings can be the SAME physical stock as AU stores " +
      "already tracked directly (Cherry, Spellroo, …). Surfacing both would show one card twice at two prices; that's " +
      "exactly why TCGplayer/Cardmarket are treated as excluded reference sources (AU/UK/SG_FALLBACK_RETAILERS) " +
      "rather than local retailers. " +
      "PERMISSION: unresolved — no public API, developer docs or affiliate program found, and no ToS statement either " +
      "way. Same bar as CoolStuffInc above: confirm before writing anything. " +
      "IF IT GOES AHEAD: it's a src/lib/fetch-tcg.ts marketplace adapter alongside ebay.ts/tcgplayer.ts, NOT a " +
      "retailers.ts row. Their card URLs encode a parseable id — rift_<set>-<num>:<total>_<rarity>_<finish> " +
      "(e.g. rift_o-026:298_R, rift_unl-r-036:219_C) — which maps cleanly onto the existing setFromTotal/numKey " +
      "matching, so the matching half is mostly free. The blocker is access, not parsing.",
  },
];

// Checked via web search and NOT added anywhere (no Riftbound stock confirmed,
// or the store itself couldn't be confirmed at all) — recorded so the next pass
// doesn't re-spend a search on them without new evidence:
//   - Card Titan / Team Card Titan — no Riftbound confirmation found.
//   - Taitan Game Shop (Coraopolis) — real store, no Riftbound/platform signal.
//   - Collector Legion — not found.
//   - Boar's Hat Gaming (Elgin, IL) — real store, no Riftbound confirmation.
//   - Super Games Inc — not found.
//   - Top Cut Collectibles, The Pug Gaming, The People's Card Shop — not found.
//   - House Rules Gaming — found (Kissimmee, FL), no Riftbound confirmation.
//   - Collector's Connection (Duluth, MN, Miller Hill Mall) — real store,
//     confirmed sports cards/comics/MTG/Pokémon focus, no Riftbound mention.
//   - Collector's Cache — not found.
//   - Victory Point (victorypointjc.com, Jersey City NJ) — real store with a
//     confirmed Riftbound prerelease product, but its URL shape
//     (/product/slug/LONG-ALPHANUMERIC-ID, plus a /s/shop path) reads as
//     Squarespace Commerce, not Shopify or Crystal Commerce — a fourth
//     platform, and Squarespace doesn't expose a public unauthenticated
//     product feed the way Shopify does. Not added anywhere pending a real
//     look at what's actually fetchable.
//   - Home Town Cards (hometown.cards, Austin TX) — confirmed real store with
//     confirmed Riftbound Unleashed singles + sealed stock, but no /catalog/
//     or /collections/ URL surfaced — platform unconfirmed, not added.

// ── EU: the eurozone market's platform gap (2026-08-23) ──────────────────────
// Added with the EU market. Same shape as PENDING_US_STORES above and subject to
// the same rule as everything else in this file: a store lands here because its
// PLATFORM has no public product feed the importer can read, not because
// permission is unresolved (that is PENDING_PERMISSION_UNRESOLVED's category, and
// the two must not be merged — one is fixed by writing an adapter, the other can
// never be fixed by writing anything).
//
// THE HEADLINE FINDING, and the reason this section is worth reading before the
// next EU pass: Spain's Riftbound retail is overwhelmingly NOT on Shopify. A
// 354-domain eurozone sweep surfaced ~150 Spanish shops; the live probe
// (scripts/probe-eu-stores.ts) could use 8 of them. That is why RETAILERS' EU
// block is 8 Spanish stores out of 30 despite Spain being the market this whole
// thing was requested for. Everywhere else in the eurozone the trade is far more
// Shopify-native — DE, AT, IT, PT, NL and BE are all represented there.
//
// ── THE WOOCOMMERCE HALF OF THIS IS DONE (2026-08-23, same day) ──────────────
// This section previously said a WooCommerce adapter was the highest-value
// unblock in this market. It was, and it was built: lib/woocommerce.ts reads the
// WordPress Store API (/wp-json/wc/store/v1), both importers understand a
// `platform: "woocommerce"` store, and 36 eurozone Woo shops — 30 of them
// Spanish — are now in RETAILERS. What follows is what the adapter did NOT
// resolve, kept because the next pass should not re-derive it:
//
//   * PRESTASHOP IS STILL BLOCKED. It has no equivalent public read surface, and
//     it is the platform of the shop that asked to be listed (below). ~27 of the
//     Spanish shops found are on it.
//   * OF THE 224 NON-SHOPIFY DOMAINS PROBED, 153 SERVED NO STORE API AT ALL —
//     either not WooCommerce, or WooCommerce with the Store API disabled. A shop
//     being "WooCommerce" per a page-source sniff does not mean it is readable.
//   * THE WOO SHOPS CARRY NO SINGLES. Measured, not assumed: across all 41
//     eurozone Woo stores with a Riftbound category, exactly ONE had a singles
//     category and it held ONE card. So the adapter bought a real EUR sealed
//     market and almost nothing for the singles comparison — which is the honest
//     answer to "will an adapter get those shops in", and the reason the entries
//     below are still worth keeping rather than deleting as solved.
export interface PendingEuStoreCandidate {
  name: string;
  base: string; // origin, no trailing slash
  country: string; // ISO alpha-2 of the business
  platform: "woocommerce" | "prestashop" | "shopware" | "unknown";
  // "direct" = this domain was fetched and its platform read off the response.
  // "search" = reported from web-search synthesis and NOTHING was independently
  // confirmed, INCLUDING whether it stocks Riftbound at all. Never present a
  // "search" entry as verified — same distinction PENDING_US_STORES (all search)
  // and PENDING_DE_STORES (all direct) drew before it.
  evidence: "direct" | "search";
  note?: string;
}

// The store that ASKED. Not a lead — an inbound request (2026-08-23) from a
// Spanish shop saying the Spanish market was worth covering. They were right, and
// the EU market in retailers.ts is the direct result. It is a genuine shame that
// the shop which prompted the market is the one that cannot be onboarded into it;
// if a PrestaShop or WooCommerce adapter is ever written, this is the first domain
// to point it at.
export const PENDING_EU_INBOUND: PendingEuStoreCandidate[] = [
  {
    name: "La Tienda Scum",
    base: "https://latiendascum.com",
    country: "ES",
    platform: "prestashop",
    evidence: "direct",
    note:
      "Fetched directly 2026-08-23. PrestaShop, not Shopify: /products.json and " +
      "/collections.json both return its own Spanish 404 template, and /sitemap.xml " +
      "404s (Shopify always serves one) — its real sitemap is /1_index_sitemap.xml, " +
      "named in its robots.txt. PERMISSION IS NOT THE BLOCKER: that robots.txt " +
      "grants `User-agent: * / Allow: /`, and the Disallow rules it does carry name " +
      "AI crawlers (ClaudeBot, GPTBot, CCBot, Bytespider, Google-Extended and " +
      "others), not product/price readers. Platform support is the only thing missing.",
  },
];

// EVERY ENTRY BELOW IS `evidence: "search"` — found by research agents
// synthesising web results. None was fetched, none had its Riftbound stock
// confirmed, and the platform guesses are exactly that. This is a starting list
// for a probe run, not a list of stores to add.
export const PENDING_ES_STORES: PendingEuStoreCandidate[] = [
  { name: "Goblin Trader", base: "https://www.goblintrader.es", country: "ES", platform: "prestashop", evidence: "search", note: "Multi-store Spanish chain — the largest single name on this list." },
  { name: "Dungeon Marvels", base: "https://dungeonmarvels.com", country: "ES", platform: "prestashop", evidence: "search" },
  { name: "Last Level", base: "https://www.lastlevel.es", country: "ES", platform: "prestashop", evidence: "search", note: "Distributor as well as retailer; reported sealed-only." },
  { name: "La Cueva Roja", base: "https://lacuevaroja.com", country: "ES", platform: "prestashop", evidence: "search" },
  { name: "Nakama Games", base: "https://www.nakamagames.com", country: "ES", platform: "prestashop", evidence: "search" },
  { name: "La Torre Mágica", base: "https://www.latorremagica.com", country: "ES", platform: "prestashop", evidence: "search" },
  { name: "Ocio Central", base: "https://ociocentral.com", country: "ES", platform: "prestashop", evidence: "search" },
  { name: "War Lotus", base: "https://warlotus.com", country: "ES", platform: "prestashop", evidence: "search" },
  { name: "Empire Games", base: "https://www.empiregames.es", country: "ES", platform: "woocommerce", evidence: "search" },
  { name: "Kaburi Rol & Games", base: "https://www.kaburi.es", country: "ES", platform: "woocommerce", evidence: "search" },
  { name: "Gigamesh", base: "https://gigamesh.com", country: "ES", platform: "woocommerce", evidence: "search" },
  { name: "TopDeck", base: "https://topdeck.es", country: "ES", platform: "woocommerce", evidence: "search" },
  { name: "CardCrack", base: "https://cardcrack.com", country: "ES", platform: "woocommerce", evidence: "search" },
  { name: "City Of Cards", base: "https://cityof.cards", country: "ES", platform: "woocommerce", evidence: "search" },
  { name: "HoloPlaza", base: "https://holoplazatcg.com", country: "ES", platform: "woocommerce", evidence: "search" },
  { name: "Homelands", base: "https://www.homelands.es", country: "ES", platform: "woocommerce", evidence: "search" },
  { name: "Mana Vortex Shop", base: "https://manavortex.es", country: "ES", platform: "woocommerce", evidence: "search" },
  { name: "Monster Factory", base: "https://monsterfactory.es", country: "ES", platform: "woocommerce", evidence: "search" },
  { name: "Only-Cards", base: "https://www.only-cards.com", country: "ES", platform: "woocommerce", evidence: "search" },
  { name: "Sharkcards", base: "https://sharkcards.es", country: "ES", platform: "woocommerce", evidence: "search" },
  { name: "Zacatrus", base: "https://zacatrus.es", country: "ES", platform: "unknown", evidence: "search" },
  { name: "Generación X", base: "https://generacionx.es", country: "ES", platform: "unknown", evidence: "search", note: "Well-known Madrid chain." },
  { name: "Kurogami Trading Card Store", base: "https://kurogami.com", country: "ES", platform: "unknown", evidence: "search" },
  { name: "Ítaca", base: "https://itaca.gg", country: "ES", platform: "unknown", evidence: "direct", note: "The one DIRECT entry in this list: probed 2026-08-23 and rejected — reachable, but serves no Shopify sitemap, so its platform is something else." },
];

// Non-Shopify elsewhere in the eurozone. The German entries were already found —
// and rejected for this same reason — during the one-day Germany market on
// 2026-08-20, when they lived in a PENDING_DE_STORES list that the revert deleted.
// Recorded again so a third pass doesn't re-research them.
// ── The eurozone stores that were ADDED and then REMOVED (2026-08-23) ────────
// 85 of them, in one afternoon, and the reason is worth stating plainly because
// the mistake is easy to repeat: they were ranked on RAW in-stock product count
// inside their Riftbound collections, which counts booster boxes, playmats,
// sleeves and tournament tickets. Re-measured on in-stock listings carrying a
// COLLECTOR NUMBER — the only ones the singles importer can turn into a price —
// 60 Shopify stores yielded five clearing ten singles, and all 36 WooCommerce
// stores yielded zero.
//
// They are NOT listed individually here, deliberately. They are not leads: they
// were probed, they are on readable platforms, and they were found to stock no
// singles. Re-adding any of them is a matter of re-running
// `npx tsx scripts/probe-eu-stores.ts` against a candidate file — the tool that
// removed them is the tool that puts them back the day their stock changes.
// Copying 85 names into this file would only make that look like research.
//
// The WooCommerce adapter (lib/woocommerce.ts) STAYS. It is how the Woo half of
// that measurement was possible at all, it is correct, and it is what makes any
// of those shops a one-line addition the day one lists singles. It is currently
// used by no store in RETAILERS, and that is an honest state, not dead code.

export const PENDING_EU_STORES: PendingEuStoreCandidate[] = [
  { name: "Amzicards (Amziverse)", base: "https://amzicards.de", country: "DE", platform: "woocommerce", evidence: "search", note: "Sealed-heavy and mostly out of stock when checked on 2026-08-20." },
  { name: "Gate to the Games", base: "https://www.gate-to-the-games.de", country: "DE", platform: "unknown", evidence: "search", note: "/products.json 404s; underlying platform never identified." },
  { name: "BB-Spiele", base: "https://www.bb-spiele.de", country: "DE", platform: "shopware", evidence: "search", note: "Shopware is the other large German bucket; no public product feed." },
  { name: "Collect-it.de", base: "https://www.collect-it.de", country: "DE", platform: "unknown", evidence: "search", note: "Has an 'Einzelkarten' (singles) subcategory under Riftbound — never confirmed populated." },
  { name: "Mayener Fantasyland", base: "https://mayener-fantasyland.de", country: "DE", platform: "unknown", evidence: "search" },
];
