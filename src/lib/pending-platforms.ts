// Research artifact, NOT wired into scraping — nothing in this file is imported
// by price-import.ts, sealed-import.ts, or retailers.ts. Do not add these to
// RETAILERS: they are NOT Shopify, so discoverRiftboundCollections()/
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
