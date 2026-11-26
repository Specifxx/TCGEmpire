// Stores tracked for SEALED ONLY — not in lib/retailers.ts's RETAILERS.
// DECISIONS.md, "Sold-out pre-orders ranked as the cheapest", 2026-09-24.
//
// WHY A SEPARATE REGISTRY: RETAILERS drives the singles importer, store-health's
// "which tracked store has zero listings" alarm, the /stores/<slug> pages and
// the home page's store counts. A store that sells Riftbound boxes but no
// singles would show up in every one of those as a broken store with no
// prices. retailers.ts's own header warns about exactly that trap. The sealed
// importer reads both lists; nothing else reads this one.
//
// Three ways in:
//   - "shopify": the same collection read every Shopify store in RETAILERS
//     gets (sealed-import.ts), including pre-order collection discovery.
//   - "product-pages": a fixed list of product URLs, each read for its
//     schema.org price, currency and availability. For storefronts with no
//     public product feed (Game Nerdz is BigCommerce, Miniature Market is
//     Magento). Every URL was checked against the store's robots.txt, and both
//     stores ask for Crawl-delay: 10, which `crawlDelayMs` honours. Add a URL
//     here when the store lists a new product; there is no discovery.
//   - "feed": a store's own JSON stock feed (FEED_STORES), read whole each run.
//
// `currency` is REQUIRED here (optional in RETAILERS, where it defaults to the
// market's): it is what lib/offer-currency.ts checks before a price is shown in
// a market, and the Sky Fox Games bug (CAD shown as US$ for ten days) is why.
import type { RetailerInfo } from "./retailers";

export interface ProductPageStore {
  key: string;
  name: string;
  base: string;
  country: NonNullable<RetailerInfo["country"]>;
  currency: string;
  platform: "product-pages";
  productUrls: string[];
  crawlDelayMs: number;
}

export type ShopifySealedStore = RetailerInfo & {
  currency: string;
  country: NonNullable<RetailerInfo["country"]>;
  /** "bigcommerce" / "shopware": read from category pages (lib/storefront-html.ts), `sealedCollections` being the paths. */
  platform?: "shopify" | "bigcommerce" | "shopware";
  /** Pages of 250 to read per configured collection (default 10). Only for a
   *  store whose Riftbound products sit deep in a big general collection. */
  maxPages?: number;
  /** Titles from the configured collections must name Riftbound outright
   *  (STRICT_RIFTBOUND), as pre-order collections' do. Set it for a store whose
   *  configured collection is a general, every-game one. */
  strictTitles?: boolean;
};

// Shopify stores, sealed only. Probed 2026-09-24: storefront currency from
// /cart.js, collections from the store's own sitemap (discoverCollections).
export const SEALED_ONLY_SHOPIFY: ShopifySealedStore[] = [
  {
    // Miniature Market, St. Louis: one of the biggest US game retailers, on
    // Shopware 6 (no feed). Its Riftbound category is read from its listing
    // pages (lib/storefront-html.ts): 24 products, 17 in stock on 2026-11-04
    // (Radiance Booster Box US$114.99, Origins Booster Pack US$9.49), sealed only,
    // no singles. Prices are shown as "$4.99" with no code; the page is a US
    // store's and the probe read USD on the day.
    key: "miniaturemarket",
    name: "Miniature Market",
    base: "https://www.miniaturemarket.com",
    collections: [],
    sealedCollections: ["/trading-card/riftbound"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
    platform: "shopware",
  },
  {
    // No Riftbound collection at all: Radiance sits in the general "preorders"
    // collection (Booster Display US$159.99, Vault US$49.99 on 2026-09-24).
    // Read non-strict here, but every title still has to pass the importer's
    // Riftbound + sealed title gates, so another game's pre-order is dropped.
    key: "kollectkorner",
    name: "Kollect Korner",
    base: "https://kollectkorner.com",
    collections: ["preorders"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  },
  {
    // Fifteen Riftbound collections, found by sitemap discovery; the handle
    // below is the fallback. Radiance Booster Case and Showdown Deck Display
    // listed on 2026-09-24.
    key: "thecollectionrealm",
    name: "The Collection Realm",
    base: "https://thecollectionrealm.com",
    collections: ["lol-tcg-riftbound"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  },
  {
    key: "laboitemystere",
    name: "La Boîte Mystère",
    // Quebec LGS, CAD storefront (/cart.js, 2026-10-15), suggested by a visitor.
    // Sealed only: its Riftbound collections hold boxes, decks, sleeves,
    // playmats and event tickets, no singles. The title gates keep the English
    // sealed (Radiance Booster Display C$224.99, Showdown Decks C$32.99) and
    // drop the French prints, accessories and "avant-première" tickets.
    base: "https://laboitemystere.com",
    collections: ["riftbound-league-of-legends", "riftbound-radiance"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "CA",
    currency: "CAD",
  },
  {
    // Quebec store, CAD storefront — tracked in the CA market, never the US.
    // Its Radiance Showdown Decks pre-order is in "riftbound-precommandes".
    key: "cryptmtg",
    name: "Crypt MTG",
    base: "https://cryptmtg.com",
    collections: ["riftbound-sealed", "riftbound-precommandes"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "CA",
    currency: "CAD",
  },
  {
    // Mona Vale (Sydney's Northern Beaches) LGS, added at the owner's request,
    // 2026-10-19. AUD storefront that ships within Australia only (/meta.json).
    // Sealed only: its one Riftbound collection holds booster displays, a
    // booster pack and event tickets, no singles. The title gates keep the
    // displays and the pack and drop every ticket ("Pre-Rift 25th July @ 10am"
    // names a clock time; "Nexus Nights" and "Radience pre release" name no
    // sealed product). Postage is not published: no Shopify shipping policy,
    // and its terms say shipping costs "are provided at checkout".
    key: "beachestcg",
    name: "BeachesTCG",
    base: "https://beachestcg.com.au",
    collections: ["riftbound-tcg"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "AU",
    currency: "AUD",
  },
  {
    // The Games Corner (Parramatta, NSW, per its /meta.json), added at the owner's request, 2026-10-23.
    // AUD Shopify store, sealed and accessories only (no singles). It has no
    // Riftbound collection: its 43 Riftbound products (UVS/Riot boxes, packs,
    // Vaults, decks, sleeves, playmats) sit in the general "tcgs" collection of
    // ~3,750 products, sorted A–Z, so "Riftbound …" lands on page 12 of 15 at
    // 250 a page. maxPages 20 reads all of it with headroom; every title still
    // has to name Riftbound (strictTitles) and pass the sealed gates. Postage is quoted at checkout.
    key: "thegamescorner",
    name: "The Games Corner",
    base: "https://www.thegamescorner.com.au",
    collections: ["tcgs"],
    maxPages: 20,
    // "tcgs" holds every game: Magic's and Pokémon's "Origins" boxes pass the
    // loose Riftbound hint, so every title must say Riftbound.
    strictTitles: true,
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "AU",
    currency: "AUD",
  },
  {
    // Laval QC; asked to be listed by email, 2026-10-29. Not Shopify: its own
    // platform serves Shopify's feed format for its WHOLE catalogue at
    // /products.json (1,716 products of every game, CAD, a `url` linking its
    // own product page), so the collection is WHOLE_CATALOGUE ("*", read by
    // fetchProducts in sealed-import.ts) and every title must name Riftbound.
    // 22 Riftbound products that day (booster displays, vaults, champion and
    // showdown decks, accessories). Its second storefront, ccctcg.ca, is a copy
    // of the same stock at the same prices and is left out (DECISIONS.md).
    key: "ateliertcg",
    name: "L'Atelier TCG",
    base: "https://ateliertcg.com",
    collections: ["*"],
    maxPages: 12,
    strictTitles: true,
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "CA",
    currency: "CAD",
  },
  {
    // TokyoToys, Birmingham (UK mainland only, GBP storefront), added 2026-11-09 on Bill's ask. Its
    // riftbound-league-of-legends-tcg collection holds 14 products on 2026-11-09 (Radiance Booster Box
    // £120, Booster Pack £5, Vendetta Box £120, Origins Box £160, showdown decks), all with tracked
    // Shopify inventory; sealed only (singles are not a range). Titles are prefixed "RELEASE 23RD
    // OCTOBER 2026:", so the Riftbound title gate stays on.
    key: "tokyotoys",
    name: "TokyoToys",
    base: "https://tokyotoys.com",
    collections: ["riftbound-league-of-legends-tcg"],
    strictTitles: true,
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "UK",
    currency: "GBP",
  },
  // ── Moved here from RETAILERS, 2026-10-16 (store audit) ───────────────────
  // Each one's Riftbound collections hold sealed product, accessories and
  // event tickets, and few or no matchable singles, so as a singles store each
  // read as broken. Same keys, so their sealed rows carry on; their old card
  // rows are purged by SINGLES_RETIRED_RETAILERS (lib/retailers.ts).
  {
    // Live: 47 products, 23 in stock, none a single; never had a single row.
    key: "hobbycollectorsaustralia",
    name: "Hobby Collectors Australia",
    base: "https://hobbycollectorsaustralia.com.au",
    collections: ["riftbound-league-of-legends-tcg", "riftbound-league-of-legends-tcg-origins"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "AU",
    currency: "AUD",
  },
  {
    // Zatu (board-game.co.uk): 30 products, 7 in stock, all sealed.
    key: "zatugames",
    name: "Zatu Games",
    base: "https://www.board-game.co.uk",
    collections: ["riftbound"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "UK",
    currency: "GBP",
  },
  {
    // 28 products, 11 in stock, two of them singles (the rest sleeves and boxes).
    key: "goblingaming",
    name: "Goblin Gaming",
    base: "https://www.goblingaming.co.uk",
    collections: ["riftbound"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "UK",
    currency: "GBP",
  },
  {
    // Its `riftbound-single` collection has been empty since July; the general
    // one holds decks, boxes and playmats.
    key: "gamerslodge",
    name: "The Gamers Lodge",
    base: "https://thegamerslodge.com",
    collections: ["riftbound-league-of-legends-tcg"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "UK",
    currency: "GBP",
  },
  {
    // Its singles are titled "Riftbound: Single Card - Ambessa, Matriarch of
    // War (V.3 - Signed Showcase) 196*", with no set total, and never matched a
    // card (0 rows since it was added). Its sealed and event range is real.
    key: "rollnplay",
    name: "Roll N Play",
    base: "https://rollnplay.co.uk",
    collections: ["riftbound", "riftbound-booster-box", "riftbound-packs", "riftbound-starter-decks"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "UK",
    currency: "GBP",
  },
  // US sweep, 2026-11-25 (US-first: Rift had 3 sealed-only US shops against ~45 sealed
  // stores in all). scripts/store-candidates.ts read each of the 454 US shops TCG Prices
  // lists (data/store-vetting/rift-discovery.json): its own /collections.json for
  // Riftbound collections, then those collections through the SAME gates this importer
  // runs (Riftbound + sealed title, an in-stock variant over the type's floor), plus the
  // store-level vetting (domain age, banned list and denylist, robots.txt, USD). Each shop
  // below had 3+ in-stock Riftbound sealed products and no store-level flag; the shops
  // that also sell matching singles went into RETAILERS instead. Collections are the
  // discovered ones (events, supplies, playmats and other games' handles left out); the
  // importer's own sitemap discovery still runs first.
  {
    key: "4gsgames",
    name: "4GS Games",
    base: "https://4gsgames.com",
    collections: ["riftbound-tcg"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 4 in-stock Riftbound sealed, cur=USD
  {
    key: "alchemistsrefuge",
    name: "Alchemist's Refuge",
    base: "https://alchemistsrefuge.shop",
    collections: ["all-riftbound-products"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 9 in-stock Riftbound sealed, cur=USD
  {
    key: "animetcg",
    name: "Anime TCG.net",
    base: "https://animetcg.net",
    collections: ["riftbound-trading-card-game"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 7 in-stock Riftbound sealed, cur=USD
  {
    key: "atlantiscomics",
    name: "Atlantis Games & Comics Norfolk",
    base: "https://atlantis-comics.com",
    collections: ["riftbound-preorder", "riftbound-sealed"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 3 in-stock Riftbound sealed, cur=USD
  {
    key: "bluemistcollectibles",
    name: "Blue Mist",
    base: "https://bluemistcollectibles.com",
    collections: ["riftbound-league-of-legends-tcg", "league-of-legends-riftbound", "riftbound-league-of-legends-tcg-spiritforged", "riftbound-league-of-legends-tcg-unleashed"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 13 in-stock Riftbound sealed, cur=USD
  {
    key: "boosterpackcards",
    name: "Booster Pack Cards",
    base: "https://boosterpackcards.com",
    collections: ["riftbound-booster-boxes", "riftbound-booster-packs", "riftbound"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 12 in-stock Riftbound sealed, cur=USD
  {
    key: "brickandboardgames",
    name: "Brick & Board Games and Cards",
    base: "https://brickandboardgames.com",
    collections: ["riftbound"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 7 in-stock Riftbound sealed, cur=USD
  {
    key: "cadetstoys",
    name: "Cadets Toys and Comics",
    base: "https://cadetstoys.com",
    collections: ["riftbound"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 4 in-stock Riftbound sealed, cur=USD
  {
    key: "cardcooptcg",
    name: "The Card Coop",
    base: "https://cardcooptcg.com",
    collections: ["riftbound"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 4 in-stock Riftbound sealed, cur=USD
  {
    key: "cardshopnear",
    name: "Card Shop Near Me",
    base: "https://cardshopnear.me",
    collections: ["riftbound-sealed", "riftbound-singles"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 6 in-stock Riftbound sealed, cur=USD
  {
    key: "cardshq",
    name: "CardsHQ",
    base: "https://cardshq.com",
    collections: ["riftbound-boxes", "riftbound", "riftbound-raw", "riftbound-unleshed"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 10 in-stock Riftbound sealed, cur=USD
  {
    key: "ccgprime",
    name: "CCGPrime - Annex",
    base: "https://ccgprime.com",
    collections: ["riftbound"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 3 in-stock Riftbound sealed, cur=USD
  {
    key: "championcardcollector",
    name: "Champion Card Collector",
    base: "https://championcardcollector.com",
    collections: ["riftbound"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 11 in-stock Riftbound sealed, cur=USD
  {
    key: "championtcg",
    name: "ChampionTCG",
    base: "https://championtcg.com",
    collections: ["riftbound"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 8 in-stock Riftbound sealed, cur=USD
  {
    key: "cobbco",
    name: "Arena Games",
    base: "https://cobbco.store",
    collections: ["riftbound"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 7 in-stock Riftbound sealed, cur=USD
  {
    key: "colestreetgamevault",
    name: "Cole Street Game Vault",
    base: "https://colestreetgamevault.com",
    collections: ["radiance-riftbound", "riftbound-league-of-legends-tcg", "riftbound-spiritforged", "riftbound-vendetta"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 4 in-stock Riftbound sealed, cur=USD
  {
    key: "commonlands",
    name: "Common Lands",
    base: "https://common-lands.com",
    collections: ["riftbound"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 3 in-stock Riftbound sealed, cur=USD
  {
    key: "creatorpultgames",
    name: "Creatorpult Games",
    base: "https://creatorpultgames.com",
    collections: ["riftbound-tcg"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 3 in-stock Riftbound sealed, cur=USD
  {
    key: "cromatcg",
    name: "Croma TCG",
    base: "https://cromatcg.com",
    collections: ["riftbound-radiance", "riftbound", "riftbound-origins", "riftbound-spiritforged"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 8 in-stock Riftbound sealed, cur=USD
  {
    key: "dealsndragons",
    name: "Deals N Dragons",
    base: "https://dealsndragons.com",
    collections: ["riftbound-sealed"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 7 in-stock Riftbound sealed, cur=USD
  {
    key: "doubleinfinitygaming",
    name: "Double Infinity Gaming",
    base: "https://doubleinfinitygaming.com",
    collections: ["riftbound-tcg"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 7 in-stock Riftbound sealed, cur=USD
  {
    key: "envycardstore",
    name: "Envy Cards",
    base: "https://envycardstore.com",
    collections: ["league-of-legends-riftbound"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 3 in-stock Riftbound sealed, cur=USD
  {
    key: "epictradingcollectibles",
    name: "Epic Trading Collectibles",
    base: "https://epictradingcollectibles.com",
    collections: ["league-of-legends-riftbound-tcg"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 6 in-stock Riftbound sealed, cur=USD
  {
    key: "eternalgameschesterfield",
    name: "Eternal Games Chesterfield",
    base: "https://eternalgameschesterfield.com",
    collections: ["riftbound-1", "riftbound"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 4 in-stock Riftbound sealed, cur=USD
  {
    key: "evolvecardshop",
    name: "Evolve Card Shop",
    base: "https://evolvecardshop.com",
    collections: ["riftbound"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 7 in-stock Riftbound sealed, cur=USD
  {
    key: "fabfoundry",
    name: "FaB Foundry",
    base: "https://fabfoundry.co",
    collections: ["riftbound-league-of-legends-tcg"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 9 in-stock Riftbound sealed, cur=USD
  {
    key: "fabledtavern",
    name: "Fabled Tavern",
    base: "https://fabledtavern.com",
    collections: ["riftbound-booster-box", "riftbound-booster-packs", "riftbound-deck", "riftbound"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 10 in-stock Riftbound sealed, cur=USD
  {
    key: "galactictoys",
    name: "Galactic Toys & Collectibles",
    base: "https://galactictoys.com",
    collections: ["riftbound"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 28 in-stock Riftbound sealed, cur=USD
  {
    key: "gameostorus",
    name: "Game-O-Storus",
    base: "https://gameostorus.com",
    collections: ["riftbound-all"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 13 in-stock Riftbound sealed, cur=USD
  {
    key: "gamerealm",
    name: "Game Realm",
    base: "https://gamerealm.com",
    collections: ["riftbound"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 10 in-stock Riftbound sealed, cur=USD
  {
    key: "gamersgauntlet",
    name: "Gamer's Gauntlet",
    base: "https://gamersgauntlet.net",
    collections: ["radiance-riftbound", "riftbound-origins", "spiritforged-riftbound", "unleashed-riftbound"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 4 in-stock Riftbound sealed, cur=USD
  {
    key: "gamersguildusa",
    name: "Gamers Guild AZ",
    base: "https://gamersguildusa.com",
    collections: ["riftbound-league-of-legends-tcg"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 3 in-stock Riftbound sealed, cur=USD
  {
    key: "gamesandstuffonline",
    name: "Games and Stuff",
    base: "https://gamesandstuffonline.com",
    collections: ["riftbound-league-of-legends-trading-card-game"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 4 in-stock Riftbound sealed, cur=USD
  {
    key: "gatecitygames",
    name: "Gate City Games",
    base: "https://gatecitygames.us",
    collections: ["riftbound-sealed"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 3 in-stock Riftbound sealed, cur=USD
  {
    key: "geekerygames",
    name: "Geekery Games",
    base: "https://geekerygames.com",
    collections: ["riftbound-league-of-legends-tcg", "riftbound-league-of-legends-tcg-set-2-spiritforged", "riftbound-tcg-unleashed", "riftbound-league-of-legends-tcg-set-1-origins"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 3 in-stock Riftbound sealed, cur=USD
  {
    key: "glhfinc",
    name: "Good Luck Have Fun Games",
    base: "https://glhfinc.com",
    collections: ["riftbound-league-of-legends-tcg"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 5 in-stock Riftbound sealed, cur=USD
  {
    key: "guubuu",
    name: "GuuBuu Hobby",
    base: "https://guubuu.com",
    collections: ["riftbound-league-of-legends-tcg"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 3 in-stock Riftbound sealed, cur=USD
  {
    key: "haikupop",
    name: "Haiku Pop",
    base: "https://haikupop.com",
    collections: ["riftbound-league-of-legends-tcg"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 7 in-stock Riftbound sealed, cur=USD
  {
    key: "hauntedgamecafeus",
    name: "The Haunted Game Cafe",
    base: "https://hauntedgamecafe.com",
    collections: ["riftbound-tcg"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 6 in-stock Riftbound sealed, cur=USD
  {
    key: "hypercollectiblestcg",
    name: "Hyper Collectibles",
    base: "https://hypercollectiblestcg.com",
    collections: ["riftbound-league-of-legends"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 6 in-stock Riftbound sealed, cur=USD
  {
    key: "itstimecards",
    name: "IT'S TIME! Sports Cards, TCG and eSports",
    base: "https://itstimecards.com",
    collections: ["riftbound"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 6 in-stock Riftbound sealed, cur=USD
  {
    key: "j2games",
    name: "J2Games",
    base: "https://j2games.com",
    collections: ["league-of-legends-riftbound"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 3 in-stock Riftbound sealed, cur=USD
  {
    key: "jandjgamingfactory",
    name: "J and J Gaming Factory",
    base: "https://jandjgamingfactory.com",
    collections: ["riftbound-sealed", "riftbound", "riftbound-origins", "riftbound-radiance", "riftbound-unleashed"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 17 in-stock Riftbound sealed, cur=USD
  {
    key: "jawbreakers",
    name: "jawbreakers",
    base: "https://jawbreakers.cards",
    collections: ["riftbound-booster-boxes", "riftbound-collection-boxes", "riftbound-starter-decks", "riftbound-packs", "riftbound-tcg"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 22 in-stock Riftbound sealed, cur=USD
  {
    key: "jwwcards",
    name: "JWW Sports Cards & Gaming",
    base: "https://jwwcards.com",
    collections: ["riftbound", "riftbound-origins", "riftbound-spiritforged", "riftbound-unleashed"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 9 in-stock Riftbound sealed, cur=USD
  {
    key: "keystonegames",
    name: "Keystone Games LLC",
    base: "https://keystonegames.net",
    collections: ["riftbound-pre-orders", "riftbound-league-of-legends"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 13 in-stock Riftbound sealed, cur=USD
  {
    key: "kitchentabletcg",
    name: "Kitchen Table Cards and Games",
    base: "https://kitchentabletcg.com",
    collections: ["riftbound-league-of-legends-tcg"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 5 in-stock Riftbound sealed, cur=USD
  {
    key: "kwcollectibles",
    name: "Game Grid Key LLC",
    base: "https://kwcollectibles.com",
    collections: ["riftbound", "riftbound-unleashed", "riftbound-vendetta"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 14 in-stock Riftbound sealed, cur=USD
  {
    key: "lasportscards",
    name: "LA Sports Cards",
    base: "https://lasportscards.com",
    collections: ["riftbound"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 3 in-stock Riftbound sealed, cur=USD
  {
    key: "lingstergames",
    name: "LingSter Games",
    base: "https://lingstergames.com",
    collections: ["riftbound"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 8 in-stock Riftbound sealed, cur=USD
  {
    key: "lootcardshop",
    name: "Loot Card Shop",
    base: "https://lootcardshop.com",
    collections: ["riftbound-booster-boxes", "riftbound-starter-decks"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 3 in-stock Riftbound sealed, cur=USD
  {
    key: "lthobbies",
    name: "LTs Hobbies",
    base: "https://lthobbies.com",
    collections: ["riftbound"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 4 in-stock Riftbound sealed, cur=USD
  {
    key: "metagames",
    name: "MetaGames.toys",
    base: "https://metagames.toys",
    collections: ["riftbound-booster-boxes", "riftbound-booster-packs", "riftbound", "riftbound-origins", "riftbound-spiritforged", "riftbound-unleashed"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 17 in-stock Riftbound sealed, cur=USD
  {
    key: "mintedtcg",
    name: "Minted TCG",
    base: "https://mintedtcg.com",
    collections: ["riftbound", "riftbound-radiance"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 12 in-stock Riftbound sealed, cur=USD
  {
    key: "moonshotgamestore",
    name: "Moonshot Games",
    base: "https://moonshotgamestore.com",
    collections: ["riftbound-league-of-legends-trading-card-game", "riftbound-unleashed"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 10 in-stock Riftbound sealed, cur=USD
  {
    key: "mystictcg",
    name: "Mystic TCG",
    base: "https://mystictcg.com",
    collections: ["boxes-riftbound", "packs-riftbound", "riftbound", "riftbound-radiance", "riftbound-vendetta"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 23 in-stock Riftbound sealed, cur=USD
  {
    key: "nxtlegacigaming",
    name: "Nxt Legaci Gaming",
    base: "https://nxtlegacigaming.com",
    collections: ["riftbound"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 5 in-stock Riftbound sealed, cur=USD
  {
    key: "papajoeys",
    name: "Papa Joey's Collectibles",
    base: "https://papajoeys.com",
    collections: ["riftbound-booster-packs", "riftbound-sealed-product"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 7 in-stock Riftbound sealed, cur=USD
  {
    key: "phantomich",
    name: "Phantomich",
    base: "https://phantomich.com",
    collections: ["riftbound-league-of-legends"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 7 in-stock Riftbound sealed, cur=USD
  {
    key: "phatcatzgaming",
    name: "Phat Catz Gaming",
    base: "https://phatcatzgaming.com",
    collections: ["riftbound"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 7 in-stock Riftbound sealed, cur=USD
  {
    key: "phillytcg",
    name: "Philly TCG",
    base: "https://phillytcg.com",
    collections: ["riftbound"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 6 in-stock Riftbound sealed, cur=USD
  {
    key: "progressccg",
    name: "Progress CCG",
    base: "https://progressccg.com",
    collections: ["riftbound-sealed", "riftbound-league-of-legends"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 12 in-stock Riftbound sealed, cur=USD
  {
    key: "realgoodeal",
    name: "Realgoodeal",
    base: "https://realgoodeal.com",
    collections: ["riftbound-tcg"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 14 in-stock Riftbound sealed, cur=USD
  {
    key: "reapergamestore",
    name: "Reaper Game Store",
    base: "https://reapergamestore.com",
    collections: ["riftbound-tcg"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 3 in-stock Riftbound sealed, cur=USD
  {
    key: "retrofixgames",
    name: "Retrofix Games",
    base: "https://retrofixgames.com",
    collections: ["all-riftbound", "riftbound-radiance", "riftbound-unleashed", "riftbound-vendetta"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 6 in-stock Riftbound sealed, cur=USD
  {
    key: "revcollectibles",
    name: "R.E.V. Collectibles",
    base: "https://revcollectibles.com",
    collections: ["riftbound-trading-card-game"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 3 in-stock Riftbound sealed, cur=USD
  {
    key: "robohunters",
    name: "Robo Hunters",
    base: "https://robohunters.com",
    collections: ["riftbound"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 3 in-stock Riftbound sealed, cur=USD
  {
    key: "saltcitygames",
    name: "Salt City Games",
    base: "https://saltcitygames.shop",
    collections: ["riftbound"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 3 in-stock Riftbound sealed, cur=USD
  {
    key: "shufflenroll",
    name: "Shuffle N Roll",
    base: "https://shufflenroll.com",
    collections: ["riftbound"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 4 in-stock Riftbound sealed, cur=USD
  {
    key: "skyboxct",
    name: "Skybox Collectibles",
    base: "https://skyboxct.com",
    collections: ["riftbound"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 7 in-stock Riftbound sealed, cur=USD
  {
    key: "spankyslootstash",
    name: "Spanky's Loot Stash",
    base: "https://spankyslootstash.com",
    collections: ["riftbound-league-of-legends-tcg-sealed-products", "riftbound-league-of-legends-tcg", "riftbound-league-of-legends-tcg-singles"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 4 in-stock Riftbound sealed, cur=USD
  {
    key: "sparkstradingcards",
    name: "Sparks Trading Cards",
    base: "https://sparkstradingcards.com",
    collections: ["riftbound"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 3 in-stock Riftbound sealed, cur=USD
  {
    key: "spellcastersstash",
    name: "Spellcasters Stash",
    base: "https://spellcastersstash.com",
    collections: ["riftbound"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 5 in-stock Riftbound sealed, cur=USD
  {
    key: "thehobhub",
    name: "The Hobby Hub",
    base: "https://thehobhub.com",
    collections: ["riftbound-tcg"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 6 in-stock Riftbound sealed, cur=USD
  {
    key: "theperkcards",
    name: "The Perk",
    base: "https://theperkcards.com",
    collections: ["riftbound"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 4 in-stock Riftbound sealed, cur=USD
  {
    key: "thepokestops",
    name: "Pokestops",
    base: "https://thepokestops.com",
    collections: ["riftbound-products"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 5 in-stock Riftbound sealed, cur=USD
  {
    key: "topspot",
    name: "Topspot Cards",
    base: "https://topspot.cards",
    collections: ["riftbound-english-boosters", "riftbound-english-decks", "riftbound-english-specialty-products", "riftbound", "riftbound-copy"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 12 in-stock Riftbound sealed, cur=USD
  {
    key: "tradeshop",
    name: "Trade Shop",
    base: "https://tradeshop.com",
    collections: ["riftbound"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 4 in-stock Riftbound sealed, cur=USD
  {
    key: "tradingcardworld",
    name: "Trading Card World",
    base: "https://tradingcardworld.store",
    collections: ["riftbound-league-of-legends-trading-card-game"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 3 in-stock Riftbound sealed, cur=USD
  {
    key: "undiscoveredrealm",
    name: "Undiscovered Realm",
    base: "https://undiscoveredrealm.com",
    collections: ["riftbound-booster-box", "riftbound"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 5 in-stock Riftbound sealed, cur=USD
  {
    key: "unpluggedgamestore",
    name: "Unplugged Gaming",
    base: "https://unpluggedgamestore.com",
    collections: ["riftbound-league-of-legends-sealed", "riftbound", "riftbound-radiance", "spiritforged-riftbound-league-of-legends"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 8 in-stock Riftbound sealed, cur=USD
  {
    key: "uppercrust",
    name: "Upper Crust Games",
    base: "https://uppercrust.games",
    collections: ["riftbound"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 7 in-stock Riftbound sealed, cur=USD
  {
    key: "storedevastation",
    name: "Devastation Store Miami",
    base: "https://us.storedevastation.com",
    collections: ["sealed-riftbound"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 11 in-stock Riftbound sealed, cur=USD
  {
    key: "vgmx",
    name: "VGMX",
    base: "https://vgmx.com",
    collections: ["riftbound-league-of-legends-preorders", "riftbound-league-of-legends"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 4 in-stock Riftbound sealed, cur=USD
  {
    key: "wegeektogether",
    name: "We Geek Together",
    base: "https://wegeektogether.com",
    collections: ["riftbound", "riftbound-legacy", "riftbound-radiance"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 15 in-stock Riftbound sealed, cur=USD
  {
    key: "wolcowgaming",
    name: "wolcow gaming",
    base: "https://wolcowgaming.com",
    collections: ["riftbound-card-game"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 5 in-stock Riftbound sealed, cur=USD
  {
    key: "zulusgames",
    name: "Zulus Games",
    base: "https://zulusgames.com",
    collections: ["riftbound-league-of-legends-tcg"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "US",
    currency: "USD",
  }, // US sweep 2026-11-25: 3 in-stock Riftbound sealed, cur=USD
  // EU sweep, 2026-11-26 (owner: "a much bigger European scene"). scripts/store-candidates.ts read the
  // eurozone shops our sister sites already vet (data/store-vetting/rift-discovery.json): each one's
  // own Riftbound collections through the SAME gates this importer runs, plus the store-level
  // vetting (domain age, banned list and denylist, robots.txt, EUR at ?country=ES). Each shop below
  // had 3+ in-stock Riftbound sealed products and no store-level flag; the two that also sell
  // matching singles went into RETAILERS. Events, accessories and other-language handles left out.
  {
    key: "aiegames",
    name: "Aie Games",
    base: "https://aie-games.be",
    collections: ["riftbound", "riftbound-vault", "riftbound-booster-box", "riftbound-booster-packs", "riftbound-starter-decks"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "EU",
    currency: "EUR",
  }, // EU sweep 2026-11-26: 4 in-stock Riftbound sealed, cur=EUR
  {
    key: "allyoucanplay",
    name: "All You Can Play",
    base: "https://allyoucanplay.eu",
    collections: ["riftbound", "riftbound-legacy", "riftbound-origins", "riftbound-radiance"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "EU",
    currency: "EUR",
  }, // EU sweep 2026-11-26: 8 in-stock Riftbound sealed, cur=EUR
  {
    key: "azcardtrading",
    name: "AZ Card  & Games",
    base: "https://azcardtrading.it",
    collections: ["riftbound-league-of-legends-tcg"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "EU",
    currency: "EUR",
  }, // EU sweep 2026-11-26: 6 in-stock Riftbound sealed, cur=EUR
  {
    key: "cardcosmos",
    name: "CardCosmos",
    base: "https://cardcosmos.de",
    collections: ["riftbound-release-2026", "neu-eingetroffen-riftbound", "riftbound-radiance-set", "riftbound-league-of-legends-booster", "riftbound-league-of-legends-booster-displays", "riftbound-league-of-legends-champion-deck"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "EU",
    currency: "EUR",
  }, // EU sweep 2026-11-26: 11 in-stock Riftbound sealed, cur=EUR
  {
    key: "cardgazer",
    name: "Cardgazer TCG",
    base: "https://cardgazertcg.de",
    collections: ["riftbound-league-of-legends", "riftbound-league-of-legends-display", "riftbound-league-of-legends-booster", "riftbound-league-of-legends-decks"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "EU",
    currency: "EUR",
  }, // EU sweep 2026-11-26: 4 in-stock Riftbound sealed, cur=EUR
  {
    key: "cardhorizon",
    name: "Card Horizon",
    base: "https://cardhorizon.com",
    collections: ["riftbound"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "EU",
    currency: "EUR",
  }, // EU sweep 2026-11-26: 11 in-stock Riftbound sealed, cur=EUR
  {
    key: "cardsplace",
    name: "Cardsplace",
    base: "https://cardsplace.de",
    collections: ["riftbound-league-of-legends-trading-card-game", "riftbound-league-of-legends-trading-card-game-unleashed-unl", "riftbound-league-of-legends-trading-card-game-booster-displays", "riftbound-league-of-legends-trading-card-game-booster-packs", "riftbound-league-of-legends-trading-card-game-special-boxen-sets", "riftbound-league-of-legends-trading-card-game-starter-decks"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "EU",
    currency: "EUR",
  }, // EU sweep 2026-11-26: 24 in-stock Riftbound sealed, cur=EUR
  {
    key: "cardyx",
    name: "CardyX",
    base: "https://cardyx.sk",
    collections: ["riftbound-kusove-karty-1", "ostatne-riftbound-boxy", "riftbound-booster-boxy", "riftbound-booster-packs"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "EU",
    currency: "EUR",
  }, // EU sweep 2026-11-26: 9 in-stock Riftbound sealed, cur=EUR
  {
    key: "collgamers",
    name: "CollGamers",
    base: "https://collgamers.nl",
    collections: ["riftbound-league-of-legends-tcg"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "EU",
    currency: "EUR",
  }, // EU sweep 2026-11-26: 11 in-stock Riftbound sealed, cur=EUR
  {
    key: "dadiemattoncini",
    name: "Dadi e Mattoncini",
    base: "https://dadiemattoncini.it",
    collections: ["carte-riftbound"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "EU",
    currency: "EUR",
  }, // EU sweep 2026-11-26: 3 in-stock Riftbound sealed, cur=EUR
  {
    key: "dateacard",
    name: "Date A Card",
    base: "https://dateacard.fr",
    collections: ["coffret-riftbound", "display-riftbound", "riftbound", "booster-riftbound", "deck-de-structure-riftbound"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "EU",
    currency: "EUR",
  }, // EU sweep 2026-11-26: 4 in-stock Riftbound sealed, cur=EUR
  {
    key: "defconduezero",
    name: "DEFCON 2.0",
    base: "https://defconduezero.com",
    collections: ["riftbound", "riftbound-prodotto-sigillato", "riftbound-booster-box", "riftbound-starter-decks"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "EU",
    currency: "EUR",
  }, // EU sweep 2026-11-26: 22 in-stock Riftbound sealed, cur=EUR
  {
    key: "dracaugames",
    name: "DracauGames",
    base: "https://www.dracaugames.com",
    collections: ["coffrets-packs-riftbound-league-of-legends", "displays-riftbound-league-of-legends", "riftbound-league-of-legends-tcg", "boosters-riftbound-league-of-legends", "decks-riftbound-league-of-legends"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "EU",
    currency: "EUR",
  }, // EU sweep 2026-11-26: 8 in-stock Riftbound sealed, cur=EUR
  {
    key: "dragoncard",
    name: "The Dragoncard",
    base: "https://www.dragoncard.nl",
    collections: ["riftbound", "riftbound-expansion-origins", "riftbound-expansion-spiritforged", "riftbound-booster-display", "riftbound-booster-pack", "riftbound-box-sets", "riftbound-champion-deck"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "EU",
    currency: "EUR",
  }, // EU sweep 2026-11-26: 6 in-stock Riftbound sealed, cur=EUR
  {
    key: "dutchtcgcompany",
    name: "DutchTCGCompany",
    base: "https://dutchtcgcompany.com",
    collections: ["riftbound-tcg"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "EU",
    currency: "EUR",
  }, // EU sweep 2026-11-26: 4 in-stock Riftbound sealed, cur=EUR
  {
    key: "evlutcg",
    name: "Evolution TCG",
    base: "https://evlutcg.com",
    collections: ["riftbound-league-of-legends-tcg"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "EU",
    currency: "EUR",
  }, // EU sweep 2026-11-26: 9 in-stock Riftbound sealed, cur=EUR
  {
    key: "factorycardstcg",
    name: "Factory Cards",
    base: "https://factorycardstcg.com",
    collections: ["riftbound"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "EU",
    currency: "EUR",
  }, // EU sweep 2026-11-26: 3 in-stock Riftbound sealed, cur=EUR
  {
    key: "gamerzparadize",
    name: "GamerzParadize",
    base: "https://gamerzparadize.nl",
    collections: ["riftbound-league-of-legends", "riftbound-league-of-legends-special-editions", "riftbound-league-of-legends-booster-boxen", "riftbound-league-of-legends-booster-packs", "riftbound-league-of-legends-decks"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "EU",
    currency: "EUR",
  }, // EU sweep 2026-11-26: 22 in-stock Riftbound sealed, cur=EUR
  {
    key: "gamesalley",
    name: "Games Alley di Andrea Lancioni & Co SNC",
    base: "https://gamesalley.it",
    collections: ["riftbound-league-of-legends"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "EU",
    currency: "EUR",
  }, // EU sweep 2026-11-26: 3 in-stock Riftbound sealed, cur=EUR
  {
    key: "gamesavenue",
    name: "Games Avenue",
    base: "https://gamesavenue.fr",
    collections: ["cartes-a-lunite-riftbound", "display-riftbound-anglais", "display-riftbound-fr", "deck-riftbound-anglais", "deck-riftbound-fr", "riftbound-deck"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "EU",
    currency: "EUR",
  }, // EU sweep 2026-11-26: 3 in-stock Riftbound sealed, cur=EUR
  {
    key: "geeksheaven",
    name: "Geeksheaven",
    base: "https://geeksheaven.de",
    collections: ["riftbound-league-of-legends-tcg"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "EU",
    currency: "EUR",
  }, // EU sweep 2026-11-26: 13 in-stock Riftbound sealed, cur=EUR
  {
    key: "heartforcards",
    name: "Heartforcards",
    base: "https://heartforcards.com",
    collections: ["riftbound"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "EU",
    currency: "EUR",
  }, // EU sweep 2026-11-26: 9 in-stock Riftbound sealed, cur=EUR
  {
    key: "ikigaicomicstienda",
    name: "IKIGAI COMICS",
    base: "https://ikigaicomicstienda.com",
    collections: ["riftbound-lol"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "EU",
    currency: "EUR",
  }, // EU sweep 2026-11-26: 4 in-stock Riftbound sealed, cur=EUR
  {
    key: "laescotillajuegos",
    name: "La Escotilla",
    base: "https://laescotillajuegos.com",
    collections: ["riftbound-league-of-legends-tcg"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "EU",
    currency: "EUR",
  }, // EU sweep 2026-11-26: 6 in-stock Riftbound sealed, cur=EUR
  {
    key: "lagildastore",
    name: "La Gilda di Busto",
    base: "https://lagildastore.it",
    collections: ["riftbound-legacy", "riftbound-vendetta-copy", "riftbound-unleashed", "riftbound-vendetta"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "EU",
    currency: "EUR",
  }, // EU sweep 2026-11-26: 6 in-stock Riftbound sealed, cur=EUR
  {
    key: "laroccadelwargaming",
    name: "La Rocca Del Wargaming",
    base: "https://laroccadelwargaming.it",
    collections: ["riftbound"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "EU",
    currency: "EUR",
  }, // EU sweep 2026-11-26: 5 in-stock Riftbound sealed, cur=EUR
  {
    key: "luckydice",
    name: "Lucky Dice",
    base: "https://luckydice.it",
    collections: ["riftbound"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "EU",
    currency: "EUR",
  }, // EU sweep 2026-11-26: 3 in-stock Riftbound sealed, cur=EUR
  {
    key: "ludisphere",
    name: "Ludisphere",
    base: "https://ludisphere.fr",
    collections: ["riftbound-league-of-legends-tcg"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "EU",
    currency: "EUR",
  }, // EU sweep 2026-11-26: 5 in-stock Riftbound sealed, cur=EUR
  {
    key: "manatrust",
    name: "ManaTrust",
    base: "https://manatrust.com",
    collections: ["altri-prodotti-riftbound", "riftbound", "booster-box-riftbound", "booster-riftbound", "champion-deck"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "EU",
    currency: "EUR",
  }, // EU sweep 2026-11-26: 8 in-stock Riftbound sealed, cur=EUR
  {
    key: "mcgillicuddystoyshop",
    name: "McGillicuddy's Toy Shop",
    base: "https://mcgillicuddystoyshop.ie",
    collections: ["riftbound-lol-tcg"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "EU",
    currency: "EUR",
  }, // EU sweep 2026-11-26: 10 in-stock Riftbound sealed, cur=EUR
  {
    key: "miraicards",
    name: "Mirai Cards Portugal",
    base: "https://miraicards.pt",
    collections: ["riftbound-league-of-legends", "riftbound-booster-boxes", "riftbound-booster-packs", "riftbound-bundles", "riftbound-decks"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "EU",
    currency: "EUR",
  }, // EU sweep 2026-11-26: 4 in-stock Riftbound sealed, cur=EUR
  {
    key: "moonshadow",
    name: "Moon-Shadow Store",
    base: "https://moon-shadow.de",
    collections: ["riftbound"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "EU",
    currency: "EUR",
  }, // EU sweep 2026-11-26: 5 in-stock Riftbound sealed, cur=EUR
  {
    key: "mucollectibles",
    name: "MuCollectibles",
    base: "https://www.mucollectibles.de",
    collections: ["riftbound-league-of-legend"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "EU",
    currency: "EUR",
  }, // EU sweep 2026-11-26: 6 in-stock Riftbound sealed, cur=EUR
  {
    key: "mytradingcards",
    name: "Sit and Game by My-Tradingcards",
    base: "https://my-tradingcards.de",
    collections: ["riftbound", "weitere-riftbound-produkte", "riftbound-booster-displays"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "EU",
    currency: "EUR",
  }, // EU sweep 2026-11-26: 5 in-stock Riftbound sealed, cur=EUR
  {
    key: "otakura",
    name: "Otakura",
    base: "https://otakura.com",
    collections: ["carte-riftbound", "carte-riftbound-unleashed", "riftbound-origins", "riftbound-radiance", "riftbound-booster-box", "riftbound-starter-deck"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "EU",
    currency: "EUR",
  }, // EU sweep 2026-11-26: 8 in-stock Riftbound sealed, cur=EUR
  {
    key: "pelikrypta",
    name: "Ikamaan Pelikrypta/Ikamaa Oy",
    base: "https://pelikrypta.fi",
    collections: ["riftbound-1"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "EU",
    currency: "EUR",
  }, // EU sweep 2026-11-26: 7 in-stock Riftbound sealed, cur=EUR
  {
    key: "pokepower",
    name: "PokePower",
    base: "https://poke-power.eu",
    collections: ["riftbound-origins", "riftbound-radiance", "riftbound-spiritforged", "riftbound-league-of-legends-tcg", "riftbound-booster-display", "riftbound-booster-pack", "riftbound-deck"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "EU",
    currency: "EUR",
  }, // EU sweep 2026-11-26: 8 in-stock Riftbound sealed, cur=EUR
  {
    key: "pokemillon",
    name: "PokeMillon",
    base: "https://www.pokemillon.com",
    collections: ["league-of-legends"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "EU",
    currency: "EUR",
  }, // EU sweep 2026-11-26: 11 in-stock Riftbound sealed, cur=EUR
  {
    key: "poneglyphcards",
    name: "PoneglyphCards",
    base: "https://poneglyphcards.it",
    collections: ["box-riftbound-eng"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "EU",
    currency: "EUR",
  }, // EU sweep 2026-11-26: 3 in-stock Riftbound sealed, cur=EUR
  {
    key: "psydeck",
    name: "Psydeck TCG",
    base: "https://psydeck.com",
    collections: ["riftbound-legacy", "riftbound-league-of-legends-tcg-radiance", "riftbound-league-of-legends-tcg-vault", "riftbound-league-of-legends-tcg", "riftbound-league-of-legends-tcg-booster-boxes", "riftbound-league-of-legends-tcg-booster-packs", "riftbound-league-of-legends-tcg-decks", "riftbound-pre-orders"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "EU",
    currency: "EUR",
  }, // EU sweep 2026-11-26: 9 in-stock Riftbound sealed, cur=EUR
  {
    key: "skupisve",
    name: "Skupi sve",
    base: "https://skupisve.hr",
    collections: ["riftbound"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "EU",
    currency: "EUR",
  }, // EU sweep 2026-11-26: 4 in-stock Riftbound sealed, cur=EUR
  {
    key: "spielewelt",
    name: "Spielewelt Amberg",
    base: "https://spielewelt.de",
    collections: ["riftbound", "riftbound-sonstiges", "riftbound-booster-displays", "riftbound-starter-decks", "riftbound-booster"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "EU",
    currency: "EUR",
  }, // EU sweep 2026-11-26: 14 in-stock Riftbound sealed, cur=EUR
  {
    key: "superelfcards",
    name: "Superelf Cards",
    base: "https://superelf-cards.de",
    collections: ["riftbound-league-of-legends-tcg"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "EU",
    currency: "EUR",
  }, // EU sweep 2026-11-26: 6 in-stock Riftbound sealed, cur=EUR
  {
    key: "tcgstar",
    name: "TCG STAR",
    base: "https://tcgstar.eu",
    collections: ["riftbound"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "EU",
    currency: "EUR",
  }, // EU sweep 2026-11-26: 3 in-stock Riftbound sealed, cur=EUR
  {
    key: "tcgtavern",
    name: "TCG Tavern",
    base: "https://tcgtavern.de",
    collections: ["riftbound-league-of-legends-karten-produktubersicht"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "EU",
    currency: "EUR",
  }, // EU sweep 2026-11-26: 4 in-stock Riftbound sealed, cur=EUR
  {
    key: "thehouseofgames",
    name: "House of Games",
    base: "https://thehouseofgames.eu",
    collections: ["riftbound-spiritforged", "riftbound-league-of-legends-tcg"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "EU",
    currency: "EUR",
  }, // EU sweep 2026-11-26: 3 in-stock Riftbound sealed, cur=EUR
  {
    key: "threestonesgames",
    name: "Three Stones Games",
    base: "https://threestonesgames.com",
    collections: ["riftbound"],
    shippingFlatCents: 0,
    freeOverCents: 0,
    shippingNote: "shipping at checkout",
    country: "EU",
    currency: "EUR",
  }, // EU sweep 2026-11-26: 5 in-stock Riftbound sealed, cur=EUR
];

export const PRODUCT_PAGE_STORES: ProductPageStore[] = [
  {
    key: "gamenerdz",
    name: "Game Nerdz",
    base: "https://www.gamenerdz.com",
    country: "US",
    currency: "USD",
    platform: "product-pages",
    // Gift of the Rift Bundle added 2026-11-19 (releases 4 Dec): its own pre-order page, filed under the one
    // SET_LESS_GROUPS key. Game Nerdz listed no Legacy (Set 6) page that day; add one when it does.
    productUrls: [
      "https://www.gamenerdz.com/riftbound-league-of-legends-tcg-radiance-booster-box-preorder",
      "https://www.gamenerdz.com/riftbound-league-of-legends-tcg-gift-of-the-rift-bundle-preorder",
    ],
    crawlDelayMs: 10_000,
  },
  {
    key: "miniaturemarket",
    name: "Miniature Market",
    base: "https://www.miniaturemarket.com",
    country: "US",
    currency: "USD",
    platform: "product-pages",
    // Its whole Riftbound category is read too (SEALED_ONLY_SHOPIFY, shopware):
    // these pages only make sure the boxes buyers search for are read even on a
    // day the category read fails. Legacy (Set 6) pages added 2026-11-19, the
    // URLs from Miniature Market's own listing (UVSRB06…).
    productUrls: [
      "https://www.miniaturemarket.com/Riftbound-TCG-Radiance-Booster-Box-24-Preorder/UVSRB05BD01-BOX",
      "https://www.miniaturemarket.com/Riftbound-TCG-Legacy-Booster-Box-24-Preorder/UVSRB06BD01-BOX",
      "https://www.miniaturemarket.com/Riftbound-TCG-Legacy-Booster-Pack-Preorder/UVSRB06BD01-PACK",
      "https://www.miniaturemarket.com/Riftbound-TCG-Legacy-Vault-Bundle-Preorder/UVSRB06VB01",
    ],
    crawlDelayMs: 10_000,
  },
];

/**
 * What the product-page pass may delete before it writes a store's rows.
 *
 * Until 2026-11-19 it deleted EVERY row of the store. Miniature Market is read
 * twice, its whole Riftbound category (shopware, in importSealed) and then one
 * product page, and the second read wiped the first: the snapshot of 18 Nov had
 * one Miniature Market row (the Radiance box) where its category lists ~24, and
 * no Legacy pre-order. A store that also has a category read now only replaces
 * the products its pages read; a pages-only store (Game Nerdz) still replaces
 * all its rows, so a page it no longer lists drops out. Pure.
 */
export function productPageReplaceScope(
  storeKey: string,
  groupKeys: readonly string[],
  categoryKeys: ReadonlySet<string>,
): { retailer: string; groupKey?: { in: string[] } } {
  return categoryKeys.has(storeKey) ? { retailer: storeKey, groupKey: { in: [...groupKeys] } } : { retailer: storeKey };
}

// A store that publishes its own Riftbound stock feed: one JSON document of
// { game, currency, items: [{ type, name, set_name, language, price, quantity,
// url, preorder_ships_by? }] }, built from live stock. Read whole each run, so
// a new product appears without anyone adding a URL (unlike product-pages).
export interface FeedStore {
  key: string;
  name: string;
  base: string;
  country: NonNullable<RetailerInfo["country"]>;
  currency: string;
  platform: "feed";
  feedUrl: string;
}

export const FEED_STORES: FeedStore[] = [
  {
    // Suggested by the store itself, 2026-10-15 (/admin/messages): a new web
    // store from a seller with thousands of Cardmarket sales. Sealed only; the
    // feed refreshes from live stock at least every 15 minutes. robots.txt
    // allows it for every crawler except AI-training bots.
    key: "sephigames",
    name: "SephiGames",
    base: "https://sephigames.com",
    country: "EU",
    currency: "EUR",
    platform: "feed",
    feedUrl: "https://sephigames.com/feed/riftbound.json",
  },
];

export interface FeedItem {
  /** "Riftbound <name>": the feed's names omit the game, which every sealed title gate requires. */
  title: string;
  priceCents: number;
  url: string;
  inStock: boolean;
}

/**
 * The sealed, English items of a store feed, or null when the feed is not
 * what it claims (wrong game or currency, no items array) — a feed that
 * cannot be trusted must not replace the store's rows. Pure, for tests.
 */
export function parseSealedFeed(data: unknown, currency: string): FeedItem[] | null {
  const d = data as { game?: unknown; currency?: unknown; items?: unknown } | null;
  if (!d || d.game !== "riftbound" || d.currency !== currency || !Array.isArray(d.items)) return null;
  const out: FeedItem[] = [];
  for (const raw of d.items) {
    const it = raw as Record<string, unknown>;
    if (it.type !== "sealed" || it.language !== "en") continue; // English only, as everywhere (DECISIONS.md 2026-10-12)
    const price = typeof it.price === "number" ? it.price : NaN;
    const name = typeof it.name === "string" ? it.name.trim() : "";
    const url = typeof it.url === "string" ? it.url : "";
    if (!(price > 0) || !name || !/^https:\/\//.test(url)) continue;
    out.push({
      title: /riftbound/i.test(name) ? name : `Riftbound ${name}`,
      priceCents: Math.round(price * 100),
      url,
      inStock: typeof it.quantity === "number" && it.quantity > 0,
    });
  }
  return out;
}

export const SEALED_ONLY_STORES: readonly { key: string; name: string; country: string; currency: string }[] = [
  ...SEALED_ONLY_SHOPIFY,
  ...PRODUCT_PAGE_STORES,
  ...FEED_STORES,
];

export interface ParsedProductPage {
  title: string;
  priceCents: number;
  currency: string | null;
  /** true = orderable (InStock / PreOrder / BackOrder), false = OutOfStock / SoldOut, null = not stated. */
  available: boolean | null;
  imageUrl: string | null;
}

const decode = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();

function metaContent(html: string, prop: string): string | null {
  // Attribute order varies by platform (Magento puts content on the next line).
  const re = new RegExp(`<meta[^>]*(?:property|name|itemprop)=["']${prop}["'][^>]*>`, "i");
  const tag = html.match(re)?.[0];
  return tag?.match(/content=["']([^"']*)["']/i)?.[1] ?? null;
}

function availabilityFrom(v: string | null | undefined): boolean | null {
  if (!v) return null;
  if (/PreOrder|PreSale|InStock|BackOrder|LimitedAvailability|OnlineOnly/i.test(v)) return true;
  if (/OutOfStock|SoldOut|Discontinued/i.test(v)) return false;
  return null;
}

/**
 * BigCommerce's LIVE inventory for this page's product, or null when the page
 * carries none. Read from `var BCData = {"product_attributes":{...}}`, the object
 * the storefront's own theme JS reads to enable or disable the buy button.
 *
 * WHY THIS OUTRANKS schema.org (2026-10-15; DECISIONS.md "Game Nerdz: sold out
 * for a week, shown as open"). A BigCommerce product configured as a pre-order
 * emits `offers.availability: https://schema.org/PreOrder` in its JSON-LD for as
 * long as it is a pre-order product — that field describes the product's
 * PURCHASE MODE, not its stock. When Game Nerdz's Radiance box allocation sold
 * out, the JSON-LD still said PreOrder while the page said "Out of stock",
 * offered only "Set Restock Notification", and BCData read `"instock":false,
 * "available_to_sell":0`. We read the JSON-LD, so every daily read re-confirmed
 * "Pre-order open" and stamped a fresh "checked 2h ago" on a box nobody could buy
 * — for a week, at the top of the US list.
 *
 * Sellable = `instock`, or still taking backorders (`unlimited_backorder`, or a
 * positive `available_for_backorder` / `available_to_sell`); `purchasable: false`
 * vetoes all of it. `purchasable: true` is NOT stock — it was `true` on that same
 * sold-out page — so it can only ever say no.
 *
 * Brace-matched rather than regex-sliced, because the page also embeds other
 * products' attributes (HTML-escaped, for the related-products widget) and only
 * THIS object describes the product on the URL.
 */
type BigCommerceAttrs = {
  instock?: unknown;
  purchasable?: unknown;
  unlimited_backorder?: unknown;
  available_for_backorder?: unknown;
  available_to_sell?: unknown;
};

/**
 * "absent" when the page carries no BCData at all (not a BigCommerce page, or an
 * older theme) — schema.org then decides, as before. Otherwise what BCData
 * states, or null when it is present but unreadable: on a BigCommerce page the
 * JSON-LD PreOrder is exactly the field proven NOT to be stock, so it is not a
 * fallback here, and null is "not evidence of stock" to the importer.
 */
function readBigCommerceStock(html: string): boolean | null | "absent" {
  const at = html.search(/\bvar\s+BCData\s*=\s*\{/);
  if (at < 0) return "absent";
  const start = html.indexOf("{", at);
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) {
      let a: BigCommerceAttrs | undefined;
      try {
        a = (JSON.parse(html.slice(start, i + 1)) as { product_attributes?: BigCommerceAttrs }).product_attributes;
      } catch {
        return null;
      }
      if (!a || typeof a.instock !== "boolean") return null;
      // A product the store has switched off can't be bought whatever the count says.
      if (a.purchasable === false) return false;
      // BigCommerce's own sellability: on hand, OR still taking backorders (an
      // unlimited allowance, or units left in a capped one). Game Nerdz's
      // sold-out box: instock false, unlimited_backorder false, both counts 0.
      const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
      return a.instock || a.unlimited_backorder === true || n(a.available_for_backorder) > 0 || n(a.available_to_sell) > 0;
    }
  }
  return null; // an object that never closes: present, unreadable
}

/** BigCommerce's live stock for this page's product; null when absent or unreadable. */
export function bigCommerceInStock(html: string): boolean | null {
  const r = readBigCommerceStock(html);
  return r === "absent" ? null : r;
}

/**
 * True when a Shopify product page's MAIN product block is locked against
 * online purchase — Thistle Tavern's custom Dawn theme renders "In-store only"
 * and drops the buy button by putting `data-purchase-locked="true"` and
 * `data-instore-only="true"` on `<product-info id="MainProduct-…">`, while the
 * store's products.json says available=true and its schema.org says InStock
 * (2026-10-15; DECISIONS.md "Thistle Tavern: in-store only, shown as open").
 *
 * Scoped to the MainProduct element on purpose: a related-product or quick-add
 * card elsewhere on the page could carry the same attribute for a different
 * product. Tags span lines in that theme, so the whole tag is read, not a line.
 *
 * Keyed on data-purchase-locked ALONE. data-instore-only describes where the
 * product is sold, not whether it can be ordered: the store's in-store events
 * (the Aberdeen Pre-Rift tickets) are bookable online, and a theme that marked
 * them in-store-only must not turn a bookable ticket "sold out".
 */
export function isPurchaseLocked(html: string): boolean {
  for (const m of html.matchAll(/<product-info\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/\bid=["']MainProduct-/i.test(tag)) continue;
    return /\bdata-purchase-locked=["']true["']/i.test(tag);
  }
  return false;
}

/**
 * Price, currency and availability from a product page, schema.org first —
 * except that a platform's own live inventory (BigCommerce's BCData) overrides
 * schema.org's availability, which on pre-order products states the purchase
 * mode rather than the stock (see bigCommerceInStock).
 * Pure — exported for tests. Returns null when no price can be read, rather
 * than guessing: a wrong price is worse than a missing store.
 */
export function parseProductPage(html: string): ParsedProductPage | null {
  let title: string | null = null;
  let price: number | null = null;
  let currency: string | null = null;
  let available: boolean | null = null;
  let imageUrl: string | null = null;

  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let data: unknown;
    try {
      data = JSON.parse(m[1]);
    } catch {
      continue;
    }
    const nodes = (Array.isArray(data) ? data : [data]).flatMap((d) =>
      d && typeof d === "object" && Array.isArray((d as { "@graph"?: unknown[] })["@graph"])
        ? (d as { "@graph": unknown[] })["@graph"]
        : [d],
    ) as Record<string, unknown>[];
    for (const n of nodes) {
      if (!n || n["@type"] !== "Product") continue;
      if (typeof n.name === "string") title ??= decode(n.name);
      const img = Array.isArray(n.image) ? n.image[0] : n.image;
      if (typeof img === "string") imageUrl ??= img;
      const offers = (Array.isArray(n.offers) ? n.offers : [n.offers]).filter(Boolean) as Record<string, unknown>[];
      for (const o of offers) {
        const p = Number(o.price ?? o.lowPrice);
        if (Number.isFinite(p) && p > 0 && price == null) price = p;
        if (typeof o.priceCurrency === "string") currency ??= o.priceCurrency;
        available ??= availabilityFrom(typeof o.availability === "string" ? o.availability : null);
      }
    }
  }

  title ??= metaContent(html, "og:title");
  if (price == null) {
    const p = Number(metaContent(html, "product:price:amount"));
    if (Number.isFinite(p) && p > 0) price = p;
  }
  currency ??= metaContent(html, "product:price:currency");
  available ??= availabilityFrom(metaContent(html, "availability"));
  // Live inventory beats a schema type. Applied last, and unconditionally when
  // BCData is present, because a schema.org "PreOrder" is exactly the value it
  // must beat — including when BCData can't be read (null: not evidence of stock).
  const live = readBigCommerceStock(html);
  if (live !== "absent") available = live;
  imageUrl ??= metaContent(html, "og:image");

  if (price == null || !title) return null;
  return { title: decode(title), priceCents: Math.round(price * 100), currency, available, imageUrl };
}
