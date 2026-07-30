// Central config for the Australian retailers we compare. Used by both the price
// importer (scripts/import-prices.ts via src/lib/price-import.ts) and the UI.
//
// Shipping figures are ESTIMATES for the typical "single card" postage at each
// store (tracked/letter), with a free-shipping threshold. Adjust these to match
// each retailer's real published rates.

export interface RetailerInfo {
  key: string;
  name: string;
  base: string; // origin, no trailing slash
  collections: string[]; // Shopify collection handles holding Riftbound singles
  shippingFlatCents: number; // estimated postage for a single card
  freeOverCents: number; // order total at/above which shipping is free
  shippingNote: string;
  // Market the store serves. Omitted = "AU" (the original Australian stores).
  // NZ/US/UK/SG/CA stores are scraped with ?country=NZ/US/GB/SG/CA and priced in
  // NZD/USD/GBP/SGD/CAD. eBay runs for AU + US + UK + SG + CA.
  country?: "AU" | "NZ" | "US" | "UK" | "SG" | "CA";
}

export const RETAILERS: Record<string, RetailerInfo> = {
  cherry: {
    key: "cherry",
    name: "Cherry Collectables",
    base: "https://www.cherrycollectables.com.au",
    collections: ["riftbound-singles"],
    shippingFlatCents: 395,
    freeOverCents: 5000,
    shippingNote: "est. $3.95 tracked · free over $50",
  },
  ozzie: {
    key: "ozzie",
    name: "Ozzie Collectables",
    base: "https://www.ozziecollectables.com",
    collections: ["riftbound-singles"],
    shippingFlatCents: 350,
    freeOverCents: 6000,
    shippingNote: "est. $3.50 · free over $60",
  },
  finalboss: {
    key: "finalboss",
    name: "The Final Boss Collectables",
    base: "https://thefinalbosscollectables.com.au",
    collections: ["riftbound-tcg-singles"],
    shippingFlatCents: 199,
    freeOverCents: 3000,
    shippingNote: "est. $1.99 letter · free over $30",
  },
  plenty: {
    key: "plenty",
    name: "Plenty of Games",
    base: "https://plenty-of-games-au.myshopify.com",
    collections: ["riftbound-singles"],
    shippingFlatCents: 250,
    freeOverCents: 8000,
    shippingNote: "est. $2.50 · free over $80",
  },
  adventurers: {
    key: "adventurers",
    name: "The Adventurers Guild",
    base: "https://www.theadventurersguild.com.au",
    collections: ["riftbound-singles"],
    shippingFlatCents: 200,
    freeOverCents: 5000,
    shippingNote: "est. $2.00 · free over $50",
  },
  // NOTE: General Games' product feed reports every item as out-of-stock
  // (a platform quirk), so it's excluded to honour the "no out-of-stock" rule.
  // Re-add here if they expose reliable stock, or to show their prices anyway.
  manamarket: {
    key: "manamarket",
    name: "Mana Market",
    base: "https://manamarket.com.au",
    collections: ["riftbound-singles"],
    shippingFlatCents: 150,
    freeOverCents: 3000,
    shippingNote: "est. $1.50 · free over $30",
  },
  steelcity: {
    key: "steelcity",
    name: "Steel City Games",
    base: "https://www.steelcitygames.com.au",
    collections: ["riftbound-singles"],
    shippingFlatCents: 200,
    freeOverCents: 5000,
    shippingNote: "est. $2.00 · free over $50",
  },
  cardbot: {
    key: "cardbot",
    name: "Cardbot",
    base: "https://cardbot.com.au",
    collections: ["riftbound-origins-singles"],
    shippingFlatCents: 150,
    freeOverCents: 3000,
    shippingNote: "est. $1.50 · free over $30",
  },
  // Domain-only entries: collections are auto-discovered from each store's sitemap
  // (handles vary, e.g. "riftbound-singles-4-or-more", "riftbound-league-of-legends-tcg").
  ggadelaide: {
    key: "ggadelaide",
    name: "Good Games Adelaide",
    base: "https://ggadelaide.com.au",
    collections: [],
    shippingFlatCents: 200,
    freeOverCents: 5000,
    shippingNote: "est. $2.00 · free over $50",
  },
  goodgames: {
    key: "goodgames",
    name: "Good Games",
    base: "https://www.goodgames.com.au",
    collections: [],
    shippingFlatCents: 300,
    freeOverCents: 6000,
    shippingNote: "est. $3.00 · free over $60",
  },
  vaultgames: {
    key: "vaultgames",
    name: "Vault Games",
    base: "https://vaultgames.com.au",
    collections: [],
    shippingFlatCents: 200,
    freeOverCents: 5000,
    shippingNote: "est. $2.00 · free over $50",
  },
  mintcollectables: {
    key: "mintcollectables",
    name: "Mint Collectables",
    base: "https://mintcollectables.com.au",
    collections: [],
    shippingFlatCents: 150,
    freeOverCents: 3000,
    shippingNote: "est. $1.50 · free over $30",
  },
  cardhub: {
    key: "cardhub",
    name: "The Card Hub Australia",
    base: "https://thecardhubaustralia.com.au",
    collections: [],
    shippingFlatCents: 200,
    freeOverCents: 4000,
    shippingNote: "est. $2.00 · free over $40",
  },
  pokebox: {
    key: "pokebox",
    name: "PokéBox",
    base: "https://www.pokebox.com.au",
    collections: [],
    shippingFlatCents: 200,
    freeOverCents: 5000,
    shippingNote: "est. $2.00 · free over $50",
  },
  spellroo: {
    key: "spellroo",
    name: "Spellroo Gaming",
    base: "https://spellroogaming.com.au",
    collections: ["riftbound-league-of-legends-tcg-singles"],
    shippingFlatCents: 200,
    freeOverCents: 5000,
    shippingNote: "est. $2.00 · free over $50",
  },
  spindown: {
    key: "spindown",
    name: "Spindown",
    base: "https://spindown.com.au",
    collections: ["riftbound-league-of-legends"],
    shippingFlatCents: 200,
    freeOverCents: 5000,
    shippingNote: "est. $2.00 · free over $50",
  },
  gamesarena88: {
    key: "gamesarena88",
    name: "88 Games Arena",
    base: "https://www.88gamesarena.com.au",
    collections: ["riftbound-singles-australia-88-games-arena"],
    shippingFlatCents: 250,
    freeOverCents: 5000,
    shippingNote: "est. $2.50 · free over $50",
  },
  elementalarcade: {
    key: "elementalarcade",
    name: "Elemental Arcade",
    base: "https://elementalarcade.com.au",
    collections: ["riftbound-tcg-singles"],
    shippingFlatCents: 200,
    freeOverCents: 5000,
    shippingNote: "est. $2.00 · free over $50",
  },
  // Official Riftbound Gaming Network store (Springwood NSW); Shopify with a live
  // Riftbound singles + sealed collection.
  flukeandbox: {
    key: "flukeandbox",
    name: "Fluke & Box",
    base: "https://www.flukeandbox.com",
    collections: ["riftbound-tcg"],
    shippingFlatCents: 250,
    freeOverCents: 5000,
    shippingNote: "est. $2.50 · free over $50",
  },
  // Shuffled LGS (Adelaide, SA) — sells Riftbound sealed product; no dedicated
  // Riftbound singles collection found yet (only "Card Sleeves - Riftbound" /
  // "Playmats - Riftbound" accessory collections as of this add), so collections
  // is left empty and both the singles + sealed importers' sitemap
  // auto-discovery (discoverRiftboundCollections/discoverCollections) will pick
  // up a Riftbound singles collection automatically the moment one exists.
  // Shipping read from their published policy (a multi-tier table; using the
  // clearest complete pair — verify if it looks off): $10 standard, free over $150.
  shuffled: {
    key: "shuffled",
    name: "Shuffled LGS",
    base: "https://shuffled.com.au",
    collections: [],
    shippingFlatCents: 1000,
    freeOverCents: 15000,
    shippingNote: "est. $10 standard · free over $150",
  },

  // ---- New Zealand stores (country: "NZ"; prices in NZD; never use eBay) -------
  // Collections are mostly auto-discovered from each store's Shopify sitemap; a few
  // explicit handles are given as a fallback. Shipping figures are NZD estimates.
  cardmasters: {
    key: "cardmasters",
    name: "Card Masters",
    base: "https://cardmasters.co.nz",
    collections: ["riftbound-league-of-legends-singles"],
    shippingFlatCents: 350,
    freeOverCents: 6000,
    shippingNote: "est. NZ$3.50 · free over NZ$60",
    country: "NZ",
  },
  tcgcollectornz: {
    key: "tcgcollectornz",
    name: "TCG Collector NZ",
    base: "https://tcgcollectornz.com",
    collections: ["riftbound-all-singles"],
    shippingFlatCents: 300,
    freeOverCents: 5000,
    shippingNote: "est. NZ$3.00 · free over NZ$50",
    country: "NZ",
  },
  cardmerchant: {
    key: "cardmerchant",
    name: "Card Merchant NZ",
    base: "https://cardmerchant.co.nz",
    collections: ["riftbound-singles"],
    shippingFlatCents: 250,
    freeOverCents: 5000,
    shippingNote: "est. NZ$2.50 · free over NZ$50",
    country: "NZ",
  },
  ironknight: {
    key: "ironknight",
    name: "Iron Knight Gaming",
    base: "https://ironknightgaming.co.nz",
    collections: ["riftbound-singles-in-stock"],
    shippingFlatCents: 300,
    freeOverCents: 5000,
    shippingNote: "est. NZ$3.00 · free over NZ$50",
    country: "NZ",
  },
  calicokeep: {
    key: "calicokeep",
    name: "Calico Keep",
    base: "https://www.calicokeep.co.nz",
    collections: ["riftbound-single-in-stock"],
    shippingFlatCents: 350,
    freeOverCents: 6000,
    shippingNote: "est. NZ$3.50 · free over NZ$60",
    country: "NZ",
  },
  cardbotnz: {
    key: "cardbotnz",
    name: "Card Bot NZ",
    base: "https://cardbot.co.nz",
    collections: ["riftbound-origins-singles"],
    shippingFlatCents: 200,
    freeOverCents: 4000,
    shippingNote: "est. NZ$2.00 · free over NZ$40",
    country: "NZ",
  },
  gamingdna: {
    key: "gamingdna",
    name: "Gaming DNA",
    base: "https://gamingdna.co.nz",
    collections: ["riftbound-league-of-legends-tcg"],
    shippingFlatCents: 300,
    freeOverCents: 5000,
    shippingNote: "est. NZ$3.00 · free over NZ$50",
    country: "NZ",
  },
  beagames: {
    key: "beagames",
    name: "Bea Games",
    base: "https://www.beadndgames.co.nz",
    collections: ["riftbound-league-of-legends-singles"],
    shippingFlatCents: 300,
    freeOverCents: 5000,
    shippingNote: "est. NZ$3.00 · free over NZ$50",
    country: "NZ",
  },
  shuffleandcut: {
    key: "shuffleandcut",
    name: "Shuffle n Cut Games",
    base: "https://www.shuffleandcutgames.co.nz",
    collections: ["riftbound"],
    shippingFlatCents: 350,
    freeOverCents: 6000,
    shippingNote: "est. NZ$3.50 · free over NZ$60",
    country: "NZ",
  },
  gameroost: {
    key: "gameroost",
    name: "Game Roost",
    base: "https://www.gameroost.co.nz",
    collections: ["riftbound-league-of-legends-tcg-auckland"],
    shippingFlatCents: 350,
    freeOverCents: 6000,
    shippingNote: "est. NZ$3.50 · free over NZ$60",
    country: "NZ",
  },

  // ---- United States stores (country: "US"; prices in USD; uses eBay US) --------
  // The US market is much deeper — these carry thousands of in-stock singles between
  // them. Collections are mostly auto-discovered; an explicit singles handle is given
  // as a fallback. Shipping figures are USD estimates.
  bardsandcards: {
    key: "bardsandcards",
    name: "Bards & Cards",
    base: "https://singles.bardsandcards.com",
    collections: ["riftbound-singles"],
    shippingFlatCents: 100,
    freeOverCents: 3000,
    shippingNote: "est. US$1.00 · free over US$30",
    country: "US",
  },
  mythicstore: {
    key: "mythicstore",
    name: "The Mythic Store",
    base: "https://themythicstore.com",
    collections: ["riftbound-origins-singles"],
    shippingFlatCents: 199,
    freeOverCents: 5000,
    shippingNote: "est. US$1.99 · free over US$50",
    country: "US",
  },
  cgrealm: {
    key: "cgrealm",
    name: "The CG Realm",
    base: "https://thecgrealm.com",
    collections: ["riftbound"],
    shippingFlatCents: 200,
    freeOverCents: 5000,
    shippingNote: "est. US$2.00 · free over US$50",
    country: "US",
  },
  danireon: {
    key: "danireon",
    name: "Danireon Cards & Games",
    base: "https://www.danireon.com",
    collections: ["riftbound-tcg-singles"],
    shippingFlatCents: 499,
    freeOverCents: 10000,
    shippingNote: "est. US$4.99 · free over US$100",
    country: "US",
  },
  punkouter: {
    key: "punkouter",
    name: "PunkOuter Games",
    base: "https://punkouter.com",
    collections: ["riftbound-singles-in-stock"],
    shippingFlatCents: 150,
    freeOverCents: 4000,
    shippingNote: "est. US$1.50 · free over US$40",
    country: "US",
  },
  geargaming: {
    key: "geargaming",
    name: "Gear Gaming",
    base: "https://bentonville.geargamingstore.com",
    collections: ["riftbound-singles"],
    shippingFlatCents: 200,
    freeOverCents: 5000,
    shippingNote: "est. US$2.00 · free over US$50",
    country: "US",
  },
  // Also trades as "Game Grid Lehi" (Lehi, UT) — same store.gglehi.com storefront,
  // reconfirmed during the 2026-07 US batch research (which independently proposed
  // it as a "new" store under that name — same domain, so kept as one entry rather
  // than duplicated). Display name left as the original since it's already live;
  // the second singles handle found in that pass was added as an extra fallback.
  gglegends: {
    key: "gglegends",
    name: "GG Legends",
    base: "https://store.gglehi.com",
    collections: ["riftbound-singles", "riftbound-singles-2-4"],
    shippingFlatCents: 250,
    freeOverCents: 5000,
    shippingNote: "est. US$2.50 · free over US$50",
    country: "US",
  },
  stompinggrounds: {
    key: "stompinggrounds",
    name: "Stomping Grounds TCG",
    base: "https://singles.stompinggroundstcg.com",
    collections: ["riftbound-league-of-legends"],
    shippingFlatCents: 199,
    freeOverCents: 3500,
    shippingNote: "est. US$1.99 · free over US$35",
    country: "US",
  },
  cardboardanddie: {
    key: "cardboardanddie",
    name: "Cardboard and Die",
    base: "https://cardboardanddie.com",
    collections: ["riftbound-singles"],
    shippingFlatCents: 150,
    freeOverCents: 4000,
    shippingNote: "est. US$1.50 · free over US$40",
    country: "US",
  },
  mistymountain: {
    key: "mistymountain",
    name: "Misty Mountain Games",
    base: "https://www.mistymountaingames.com",
    collections: ["riftbound-singles"],
    shippingFlatCents: 200,
    freeOverCents: 5000,
    shippingNote: "est. US$2.00 · free over US$50",
    country: "US",
  },
  theboosterbox: {
    key: "theboosterbox",
    name: "The Booster Box",
    base: "https://theboosterbox.com",
    collections: ["riftbound-singles"],
    shippingFlatCents: 250,
    freeOverCents: 5000,
    shippingNote: "est. US$2.50 · free over US$50",
    country: "US",
  },
  npcollectibles: {
    key: "npcollectibles",
    name: "NP Collectibles",
    base: "https://npcollectibles.com",
    collections: ["riftbound-origin-singles"],
    shippingFlatCents: 200,
    freeOverCents: 5000,
    shippingNote: "est. US$2.00 · free over US$50",
    country: "US",
  },
  capefear: {
    key: "capefear",
    name: "Cape Fear Collectibles",
    base: "https://www.capefearcollectibles.com",
    collections: ["riftbound-singles"],
    shippingFlatCents: 200,
    freeOverCents: 5000,
    shippingNote: "est. US$2.00 · free over US$50",
    country: "US",
  },
  hobbiesville: {
    key: "hobbiesville",
    name: "Hobbiesville",
    base: "https://hobbiesville.com",
    collections: ["riftbound-singles-league-of-legends-tcg"],
    shippingFlatCents: 499,
    freeOverCents: 17500,
    shippingNote: "est. US$4.99 · free over US$175",
    country: "US",
  },
  mysterymtg: {
    key: "mysterymtg",
    name: "Mystery MTG",
    base: "https://mysterymtg.com",
    collections: ["riftbound-singles"],
    shippingFlatCents: 150,
    freeOverCents: 4000,
    shippingNote: "est. US$1.50 · free over US$40",
    country: "US",
  },
  // Verified real US LGS with a dedicated Riftbound singles collection, added to close
  // the AU-vs-US in-stock-listing gap — the US market is our biggest by revenue but
  // the deepest US Shopify stores had thinned out (several configured above turned out
  // to only carry sealed/accessories, matching zero singles).
  onestoptcg: {
    key: "onestoptcg",
    name: "OneStopTCG",
    base: "https://onestoptcg.com",
    collections: ["riftbound-singles"],
    shippingFlatCents: 200,
    freeOverCents: 5000,
    shippingNote: "est. US$2.00 · free over US$50",
    country: "US",
  },
  // Second verified batch (user-supplied leads, each confirmed real + US + a live
  // Riftbound collection before adding — several other leads from the same batch were
  // dropped: unverifiable domains, sealed/event-only collections, non-Shopify platforms
  // (CoolStuffInc, CardTrader), non-US (Universe TCG is Barcelona-based), or — despite
  // passing the initial verification — came back with a near-empty/all-unmatched
  // catalogue on the first live scrape (Common Ground Games, Riftgate, Alchemist's
  // Refuge, Unplugged Gaming all had real "Riftbound" collections that turned out to
  // be sealed/accessories, not singles) and were removed again.
  onboardgaming: {
    key: "onboardgaming",
    name: "On-Board Gaming",
    base: "https://on-boardgaming.com",
    collections: ["riftbound"],
    shippingFlatCents: 300,
    freeOverCents: 6000,
    shippingNote: "est. US$3.00 · free over US$60",
    country: "US",
  },
  pokeboxusa: {
    key: "pokeboxusa",
    name: "PokeBox USA",
    base: "https://www.pokeboxusa.com",
    collections: ["riftbound-league-of-legends-tcg-single-cards"],
    shippingFlatCents: 300,
    freeOverCents: 15000,
    shippingNote: "est. US$3.00 · free over US$150",
    country: "US",
  },
  // ---- Third verified batch (2026-07 US research pass, 12 stores) --------------
  // Confirmed real + US-based (physical address confirmed on the merchant's own
  // /policies/contact-information or equivalent — deliberately NOT Shopify's
  // window.Shopify.currency/country, which geolocates to the VISITOR and is
  // unreliable for market assignment) with live Riftbound listings in USD.
  // Collection handles are fallback hints only — discoverRiftboundCollections()
  // auto-discovers the real set from each store's sitemap at import time; these
  // just seed it in case discovery misses a handle (see price-import.ts).
  //
  // Shipping figures are UNVERIFIED PLACEHOLDER estimates (matching the file's
  // common US default of US$2.50 · free over US$50) — pulling each store's real
  // shipping-policy page requires live network access this pass didn't have.
  // None of these 12 are in STORES_WITH_POLICY below; add them there (with a real
  // number here) once someone confirms a policy page. Verify collections/stock via
  // `npx tsx scripts/probe-us-stores.ts` before trusting these figures further.
  knightandday: {
    key: "knightandday",
    name: "Knight and Day Games",
    base: "https://knightanddaygames.com",
    // UNRESOLVED location: the storefront's Shopify backend is
    // the-gaming-goat-schaumburg-il.myshopify.com and its in-store locator says
    // "Town Square" — real US business, but the exact current city/state couldn't
    // be confirmed without live network access. Flagging per the research brief
    // rather than guessing; re-verify before treating the name/location as final.
    collections: ["riftbound-singles"],
    shippingFlatCents: 250,
    freeOverCents: 5000,
    shippingNote: "est. US$2.50 · free over US$50",
    country: "US",
  },
  grognardgames: {
    key: "grognardgames",
    name: "Grognard Games",
    base: "https://grognardgames.com",
    collections: ["riftbound-singles"],
    shippingFlatCents: 250,
    freeOverCents: 5000,
    shippingNote: "est. US$2.50 · free over US$50",
    country: "US",
  },
  vegassingles: {
    key: "vegassingles",
    name: "Vegas Singles",
    base: "https://vegas.singles",
    collections: ["riftbound-singles"],
    shippingFlatCents: 250,
    freeOverCents: 5000,
    shippingNote: "est. US$2.50 · free over US$50",
    country: "US",
  },
  shippintexas: {
    key: "shippintexas",
    name: "Shippin Texas",
    base: "https://shippintexas.com",
    collections: ["riftbound-singles", "league-of-legends-riftbound"],
    shippingFlatCents: 250,
    freeOverCents: 5000,
    shippingNote: "est. US$2.50 · free over US$50",
    country: "US",
  },
  nerdmerchant: {
    key: "nerdmerchant",
    name: "The Nerd Merchant",
    base: "https://thenerdmerchant.com",
    collections: ["riftbound-singles"],
    shippingFlatCents: 250,
    freeOverCents: 5000,
    shippingNote: "est. US$2.50 · free over US$50",
    country: "US",
  },
  e4cards: {
    key: "e4cards",
    name: "E4 Cards & More",
    base: "https://e4cards.com",
    collections: ["riftbound-singles"],
    shippingFlatCents: 250,
    freeOverCents: 5000,
    shippingNote: "est. US$2.50 · free over US$50",
    country: "US",
  },
  foxandfable: {
    key: "foxandfable",
    name: "Fox and Fable Games",
    base: "https://foxandfablegames.com",
    collections: ["riftbound-singles"],
    shippingFlatCents: 250,
    freeOverCents: 5000,
    shippingNote: "est. US$2.50 · free over US$50",
    country: "US",
  },
  // Also carries several set-specific/sealed/accessory collections (boxes, champion
  // decks, packs, playmats, sleeves, a Vendetta-specific collection) — omitted below
  // since this field is singles-only fallback; sealed-import.ts discovers those
  // independently via its own sitemap scan.
  manyrealms: {
    key: "manyrealms",
    name: "Many Realms",
    base: "https://manyrealms.com",
    collections: ["riftbound-singles", "riftbound-league-of-legends"],
    shippingFlatCents: 250,
    freeOverCents: 5000,
    shippingNote: "est. US$2.50 · free over US$50",
    country: "US",
  },
  phantasma: {
    key: "phantasma",
    name: "Phantasma",
    base: "https://phantasmalv.com",
    collections: ["riftbound-singles", "riftbound"],
    shippingFlatCents: 250,
    freeOverCents: 5000,
    shippingNote: "est. US$2.50 · free over US$50",
    country: "US",
  },
  // Only a sealed collection (riftbound-tcg, 11 items) was located this pass — the
  // singles handle wasn't found. Left for auto-discovery to pick up, or verify with
  // scripts/probe-us-stores.ts and add it explicitly once confirmed.
  millenniumgames: {
    key: "millenniumgames",
    name: "Millennium Games",
    base: "https://shop.millenniumgames.com",
    collections: ["riftbound-tcg"],
    shippingFlatCents: 250,
    freeOverCents: 5000,
    shippingNote: "est. US$2.50 · free over US$50",
    country: "US",
  },
  // Very thin Riftbound stock (promos only at last check) — added rather than held
  // in a TODO: STORE_THIN_THRESHOLD (lib/store-pages.ts) already noindexes a store
  // page with fewer than 5 live listings automatically, so no separate "low
  // inventory" flag exists or is needed for this to be safe to list.
  "151collectables": {
    key: "151collectables",
    name: "151Collectables",
    base: "https://151collectables.com",
    collections: ["riftbound", "riftbound-1", "riftbound-2"],
    shippingFlatCents: 250,
    freeOverCents: 5000,
    shippingNote: "est. US$2.50 · free over US$50",
    country: "US",
  },
  // Thin (3 sealed items at last check) — see 151Collectables note above; relies on
  // the same automatic thin-store noindex rather than a bespoke flag.
  totalescape: {
    key: "totalescape",
    name: "Total Escape Games",
    base: "https://totalescapegames.com",
    collections: ["riftbound"],
    shippingFlatCents: 250,
    freeOverCents: 5000,
    shippingNote: "est. US$2.50 · free over US$50",
    country: "US",
  },

  // ---- Cloudflare-rate-limited candidates — pending, do NOT brute-force --------
  // Returned Cloudflare error 1015 (rate limited) on products.json during research.
  // Added as real registry entries anyway (there's no separate disabled/pending
  // boolean anywhere on RetailerInfo — see the duellerspoint/ttcs/onemtg precedent
  // in the SG section below) with the best-known collection handle as a fallback.
  // Expect 0 products scraped until Cloudflare stops blocking the importer's
  // requests — that's this importer's normal graceful-degradation path (0 products
  // → 0 priced, logged, never a fabricated price), NOT a bug to chase. Do not add
  // retries or shorten the inter-request delay to try to force these through — see
  // the robots.txt/backoff handling in lib/scrape-http.ts, which applies here too.
  cardboardhorde: {
    key: "cardboardhorde",
    name: "Cardboard Horde",
    base: "https://cardboardhorde.com",
    collections: ["riftbound-singles"],
    shippingFlatCents: 250,
    freeOverCents: 5000,
    shippingNote: "est. US$2.50 · free over US$50",
    country: "US",
  },
  dragonsvaultnj: {
    key: "dragonsvaultnj",
    name: "The Dragon's Vault of NJ",
    base: "https://thedragonsvaultofnj.com",
    collections: ["riftbound-singles-in-stock"],
    shippingFlatCents: 250,
    freeOverCents: 5000,
    shippingNote: "est. US$2.50 · free over US$50",
    country: "US",
  },
  cardquestlgs: {
    key: "cardquestlgs",
    name: "Card Quest LGS",
    base: "https://cardquestlgs.com",
    collections: ["riftbound-singles"],
    shippingFlatCents: 250,
    freeOverCents: 5000,
    shippingNote: "est. US$2.50 · free over US$50",
    country: "US",
  },
  // Reclassified out of the original "Step 3 — needs a custom adapter" bucket:
  // cardshq.com is actually a regular Shopify store (its own /collections/ and
  // /products/ URLs are Shopify's exact default route shapes, and its policy page
  // is at /policies/terms-of-service — Shopify's auto-generated path), not the
  // Next.js custom build originally assumed. Sealed-focused per the original
  // research (riftbound-boxes), so lower priority, but the existing Shopify
  // adapter already covers it — no bespoke code needed. Re-verify with
  // scripts/probe-us-stores.ts before fully trusting this (found via web search in
  // this sandbox, not a direct fetch — this sandbox can't reach the site itself).
  cardshq: {
    key: "cardshq",
    name: "CardsHQ",
    base: "https://www.cardshq.com",
    collections: ["riftbound-boxes"],
    shippingFlatCents: 250,
    freeOverCents: 5000,
    shippingNote: "est. US$2.50 · free over US$50",
    country: "US",
  },
  // ---- Researched and rejected (US) — do NOT re-add without new evidence -------
  // Consolidated here (instead of scattered per-batch) so this is one place to
  // check before re-researching any of these. From the 2026-07 US batch:
  //   - empiretradings.com          — Ottawa, Canada (not US).
  //   - toysnowman.com              — Montreal, Canada (not US).
  //   - screenfreegames.com         — BC/Alberta, Canada (not US).
  //   - shop.espercardsandgames.com — Toronto, Canada (not US).
  //   - cardboyz.com                — Shopify collection exists but zero products.
  //   - redsuncollectables.com      — UK company (VAT-registered) with a live
  //     Riftbound singles catalogue — a UK candidate, not US. Logged here as a UK
  //     lead for whoever next does a UK batch; not added to this file.
  //   - Card Kingdom (cardkingdom.com) — checked, MTG-only, no Riftbound. Listed so
  //     nobody re-checks it.
  //   - Star City Games (starcitygames.com) — checked via web search (this sandbox
  //     can't fetch the site directly): their Terms & Conditions explicitly
  //     prohibit "any computerized or automated program... to access, extract,
  //     download, scrape, data mine... materials, data, or information on any Star
  //     City website" without prior written consent. NOT permitted — do not build
  //     an adapter for this without written consent from Star City Games first,
  //     regardless of how valuable the catalogue is. Re-check
  //     help.starcitygames.com/terms-and-conditions directly if this needs
  //     revisiting.
  //   - Troll and Toad (trollandtoad.com) — confirmed via web search still down for
  //     a warehouse move/relaunch ("orders paused... soft-reopening phase") as of
  //     this pass; revisit later, not a rejection.
  //
  // ---- Non-Shopify custom-adapter candidates — NOT implemented this pass -------
  // CoolStuffInc and Trading Card Planet (bespoke platforms, no Shopify
  // products.json feed) plus a confirmed Crystal-Commerce long tail (Amazing
  // Discoveries Tucson, Brute Force Games, The Wasteland Gaming, Nerd Rage
  // Gaming, The Games Cube, Cardboard Castle Games, Darkhound Game Center, and
  // one unidentified-platform lead, Grand J Games) each need their own adapter
  // and a robots.txt/ToS check first — genuinely not done, not just deferred.
  // Full detail (confirmed URLs, locations, confidence per store) now lives in
  // src/lib/pending-platforms.ts as structured data instead of prose here —
  // see that file. Summary:
  //   - CoolStuffInc: the data is real and rich (confirmed category IDs,
  //     confirmed live pricing) but permission is what's missing, not
  //     feasibility — no ToS statement on scraping and no affiliate/data-feed
  //     program turned up after three separate searches. See
  //     PENDING_PERMISSION_UNRESOLVED in pending-platforms.ts. Do not scrape
  //     this on the strength of the data alone.
  //   - Trading Card Planet: confirmed a real, large live catalogue (830
  //     products, Foil-NM/LP/MP/HP/DM condition tiers) at the Shopify-shaped
  //     /collections/riftbound-singles URL — but that's the same URL shape
  //     the ORIGINAL research already saw and explicitly rejected as
  //     non-Shopify ("despite the /collections/ URL shape"), i.e. they likely
  //     already found products.json doesn't actually work here. Their
  //     firsthand check outranks this session's indirect search evidence —
  //     not added.
  //   - Crystal Commerce: confirmed real platform + URL shape + one live price
  //     (see pending-platforms.ts). Its documented JSON API reads as a
  //     merchant-facing REST/CRUD API, not confirmed as a public anonymous
  //     read feed like Shopify's — needs a live check on one store before
  //     building a generic adapter on that assumption. Deliberately not built
  //     yet: a "platform adapter" abstraction with zero verified
  //     implementations behind it would be pure guesswork risking wrong
  //     prices on a real comparison site, not genuine progress.
  // See the session summary for the full account of what's blocked and why.

  // ---- United Kingdom stores (country: "UK"; prices in GBP via ?country=GB; uses eBay UK) ----
  // Riftbound singles are still thin on UK Shopify shops — the biggest UK chains (Magic
  // Madhouse, Chaos Cards, Big Orbit, Element Games, Wayland) aren't Shopify so can't be
  // scraped — but these 15 carry real GBP singles. Collections auto-discover from each
  // store's sitemap; the handle below is a fallback. Shipping figures are GBP estimates.
  thistletavern: {
    key: "thistletavern",
    name: "Thistle Tavern",
    base: "https://thistletavern.com",
    collections: ["riftbound"],
    shippingFlatCents: 150,
    freeOverCents: 2500,
    shippingNote: "est. £1.50 · free over £25",
    country: "UK",
  },
  cardgoblin: {
    key: "cardgoblin",
    name: "Card Goblin",
    base: "https://www.cardgoblin.shop",
    collections: ["riftbound-league-of-legends-tcg-singles"],
    shippingFlatCents: 100,
    freeOverCents: 2000,
    shippingNote: "est. £1.00 · free over £20",
    country: "UK",
  },
  axionnow: {
    key: "axionnow",
    name: "Axion Now",
    base: "https://www.axionnow.com",
    collections: ["riftbound-all-singles"],
    shippingFlatCents: 110,
    freeOverCents: 2500,
    shippingNote: "est. £1.10 · free over £25",
    country: "UK",
  },
  spellboundgames: {
    key: "spellboundgames",
    name: "Spellbound Games",
    base: "https://spellboundgames.co.uk",
    collections: ["riftbound"],
    shippingFlatCents: 145,
    freeOverCents: 2000,
    shippingNote: "est. £1.45 · free over £20",
    country: "UK",
  },
  totalcards: {
    key: "totalcards",
    name: "Total Cards",
    base: "https://totalcards.net",
    collections: ["riftbound-league-of-legends-tcg"],
    shippingFlatCents: 145,
    freeOverCents: 2000,
    shippingNote: "est. £1.45 · free over £20",
    country: "UK",
  },
  boardsandswords: {
    key: "boardsandswords",
    name: "Boards & Swords",
    base: "https://boardsandswords.co.uk",
    collections: ["riftbound-tcg"],
    shippingFlatCents: 150,
    freeOverCents: 3000,
    shippingNote: "est. £1.50 · free over £30",
    country: "UK",
  },
  forbiddenplanet: {
    key: "forbiddenplanet",
    name: "Forbidden Planet",
    base: "https://shop.forbiddenplanet.co.uk",
    collections: ["riftbound-single"],
    shippingFlatCents: 195,
    freeOverCents: 2000,
    shippingNote: "est. £1.95 · free over £20",
    country: "UK",
  },
  zatugames: {
    key: "zatugames",
    name: "Zatu Games",
    base: "https://www.board-game.co.uk",
    collections: ["riftbound"],
    shippingFlatCents: 199,
    freeOverCents: 5000,
    shippingNote: "est. £1.99 · free over £50",
    country: "UK",
  },
  cardvault: {
    key: "cardvault",
    name: "The Card Vault",
    base: "https://thecardvault.co.uk",
    collections: ["riftbound-league-of-legends-tcg-set-1-origins"],
    shippingFlatCents: 150,
    freeOverCents: 2500,
    shippingNote: "est. £1.50 · free over £25",
    country: "UK",
  },
  goblingaming: {
    key: "goblingaming",
    name: "Goblin Gaming",
    base: "https://www.goblingaming.co.uk",
    collections: ["riftbound"],
    shippingFlatCents: 199,
    freeOverCents: 3000,
    shippingNote: "est. £1.99 · free over £30",
    country: "UK",
  },
  gatheringgames: {
    key: "gatheringgames",
    name: "Gathering Games",
    base: "https://gatheringgames.co.uk",
    collections: ["riftbound-league-of-legends-tcg"],
    shippingFlatCents: 150,
    freeOverCents: 10000,
    shippingNote: "est. £1.50 · free over £100",
    country: "UK",
  },
  harlequins: {
    key: "harlequins",
    name: "Harlequins Games",
    base: "https://harlequinsgames.com",
    collections: ["riftbound-single"],
    shippingFlatCents: 130,
    freeOverCents: 2000,
    shippingNote: "est. £1.30 · free over £20",
    country: "UK",
  },
  travellingman: {
    key: "travellingman",
    name: "Travelling Man",
    base: "https://travellingman.com",
    collections: ["riftbound"],
    shippingFlatCents: 199,
    freeOverCents: 3000,
    shippingNote: "est. £1.99 · free over £30",
    country: "UK",
  },
  monstercardcorner: {
    key: "monstercardcorner",
    name: "Monster Card Corner",
    base: "https://monstercardcorner.co.uk",
    collections: ["riftbound-league-of-legends-tcg"],
    shippingFlatCents: 120,
    freeOverCents: 2000,
    shippingNote: "est. £1.20 · free over £20",
    country: "UK",
  },

  // ---- Singapore stores (country: "SG"; prices in SGD; uses eBay SG) ------------
  // Verified real Singapore LGS/online shops with live Riftbound singles on Shopify
  // (legitimacy over quantity — a Riftbound distribution partner among them).
  // Collections auto-discover from each store's sitemap; the handle is a fallback.
  // Shipping figures are SGD estimates.
  hideoutsg: {
    key: "hideoutsg",
    name: "Hideout",
    base: "https://hideoutcg.com",
    collections: ["riftbound-singles"],
    shippingFlatCents: 200,
    freeOverCents: 8000,
    shippingNote: "est. S$2.00 · free over S$80",
    country: "SG",
  },
  flagshipgames: {
    key: "flagshipgames",
    name: "Flagship Games",
    base: "https://www.flagshipgames.sg",
    collections: ["riftbound-english"],
    shippingFlatCents: 250,
    freeOverCents: 6000,
    shippingNote: "est. S$2.50 · free over S$60",
    country: "SG",
  },
  sccollection: {
    key: "sccollection",
    name: "SC Collection",
    base: "https://www.sc-collection.sg",
    collections: ["riftbound"],
    shippingFlatCents: 200,
    freeOverCents: 5000,
    shippingNote: "est. S$2.00 · free over S$50",
    country: "SG",
  },
  actionpoint: {
    key: "actionpoint",
    name: "Action Point Games",
    base: "https://actionpoint.sg",
    collections: ["riftbound"],
    shippingFlatCents: 200,
    freeOverCents: 5000,
    shippingNote: "est. S$2.00 · free over S$50",
    country: "SG",
  },
  // CI market-scan verified 2026-07-10 (scripts/probe-sg-stores.ts): SGD storefront,
  // live Riftbound collection. Mostly sealed today — singles auto-populate via the
  // sitemap discovery as SEA distribution ramps up (official launch July 2026).
  manapro: {
    key: "manapro",
    name: "Mana Pro",
    base: "https://sg-manapro.com",
    collections: ["riftbound-league-of-legends-tcg"],
    shippingFlatCents: 250,
    freeOverCents: 6000,
    shippingNote: "est. S$2.50 · free over S$60",
    country: "SG",
  },
  // SGD Shopify store; Riftbound collection created but not yet stocked at the
  // 2026-07-10 scan — tracked so listings appear the moment they stock.
  onemtg: {
    key: "onemtg",
    name: "OneMtg",
    base: "https://www.onemtg.com.sg",
    collections: ["riftbound-league-of-legends-tcg"],
    shippingFlatCents: 250,
    freeOverCents: 8000,
    shippingNote: "est. S$2.50 · free over S$80",
    country: "SG",
  },
  // Official Riftbound Gaming Network retailer (Suntec City). SGD Shopify store;
  // no Riftbound web collection yet — sitemap auto-discovery picks it up when added.
  cardarena: {
    key: "cardarena",
    name: "Card Arena",
    base: "https://cardarena.sg",
    collections: [],
    shippingFlatCents: 250,
    freeOverCents: 8000,
    shippingNote: "est. S$2.50 · free over S$80",
    country: "SG",
  },
  // 1Collectibles' dedicated TCG storefront (SG business, 511 Guillemard Rd; SGD
  // Shopify). Its /collections/riftbound is Google-indexed but excluded from the
  // sitemap, so discovery misses it — the explicit handle below covers that.
  onecollectiblestcg: {
    key: "onecollectiblestcg",
    name: "1Collectibles TCG",
    base: "https://1collectiblestcg.com",
    collections: ["riftbound"],
    shippingFlatCents: 250,
    freeOverCents: 6000,
    shippingNote: "est. S$2.50 · free over S$60",
    country: "SG",
  },
  // Real SG store with live Riftbound stock (online + organized play), but NOT on
  // Shopify — no public products.json, so the importer finds nothing until we add
  // platform support. Listed for directory coverage; never yields fake prices.
  duellerspoint: {
    key: "duellerspoint",
    name: "Dueller's Point",
    base: "https://www.duellerspoint.com",
    collections: [],
    shippingFlatCents: 250,
    freeOverCents: 8000,
    shippingNote: "est. S$2.50 · free over S$80",
    country: "SG",
  },

  // Physical SG stores confirmed carrying Riftbound (no scrapeable webstore yet, so
  // directory-only — the moment either launches a Shopify store, discovery prices it).
  caesarcards: {
    key: "caesarcards",
    name: "Caesar Cards",
    base: "https://www.caesarcards.com",
    collections: [],
    shippingFlatCents: 250,
    freeOverCents: 8000,
    shippingNote: "in-store (Yishun) · webstore coming soon",
    country: "SG",
  },
  zoomiesgaming: {
    key: "zoomiesgaming",
    name: "Zoomies Gaming",
    base: "https://linktr.ee/ZoomiesGaming",
    collections: [],
    shippingFlatCents: 250,
    freeOverCents: 8000,
    shippingNote: "in-store (Bishan) · weekly Riftbound Nexus Nights",
    country: "SG",
  },
  // ---- More Singapore stores (round 3) ----------------------------------------
  // Established SG TCG/hobby stores on Shopify. Collections auto-discover from each
  // store's sitemap, so a Riftbound singles page is priced the moment it appears
  // (yields nothing until then — never fabricated). Verified as real SG businesses.
  gameshaven: {
    key: "gameshaven",
    name: "Games Haven",
    base: "https://www.gameshaventcg.com",
    collections: [],
    shippingFlatCents: 250,
    freeOverCents: 6000,
    shippingNote: "est. S$2.50 · free over S$60",
    country: "SG",
  },
  greyogre: {
    key: "greyogre",
    name: "Grey Ogre Games",
    base: "https://www.greyogregames.com",
    collections: [],
    shippingFlatCents: 250,
    freeOverCents: 6000,
    shippingNote: "est. S$2.50 · free over S$60",
    country: "SG",
  },
  agorahobby: {
    key: "agorahobby",
    name: "Agora Hobby",
    base: "https://agorahobby.com",
    collections: [],
    shippingFlatCents: 250,
    freeOverCents: 6000,
    shippingNote: "est. S$2.50 · free over S$60",
    country: "SG",
  },
  gameacademia: {
    key: "gameacademia",
    name: "Game Academia",
    base: "https://game-academia.myshopify.com",
    collections: [],
    shippingFlatCents: 250,
    freeOverCents: 6000,
    shippingNote: "est. S$2.50 · free over S$60",
    country: "SG",
  },
  cardscitadel: {
    key: "cardscitadel",
    name: "Cards Citadel",
    base: "https://www.cardscitadel.com",
    collections: [],
    shippingFlatCents: 250,
    freeOverCents: 6000,
    shippingNote: "est. S$2.50 · free over S$60",
    country: "SG",
  },
  moxandlotus: {
    key: "moxandlotus",
    name: "Mox & Lotus",
    base: "https://www.moxandlotus.sg",
    collections: [],
    shippingFlatCents: 250,
    freeOverCents: 6000,
    shippingNote: "est. S$2.50 · free over S$60",
    country: "SG",
  },
  dxcollection: {
    key: "dxcollection",
    name: "DX Collection",
    base: "https://dxcollection.com.sg",
    collections: [],
    shippingFlatCents: 250,
    freeOverCents: 6000,
    shippingNote: "est. S$2.50 · free over S$60",
    country: "SG",
  },
  // ---- More Singapore stores (round 4, user-supplied) -------------------------
  // 4elements has a confirmed live Riftbound collection; the others are verified
  // real SG stores. Shopify stores auto-discover their singles collection; the
  // brick-and-mortar ones are directory-only until they launch a scrapeable store.
  fourelements: {
    key: "fourelements",
    name: "4elements",
    base: "https://www.4elements.sg",
    collections: ["riftbound-tcg-unleashed"],
    shippingFlatCents: 250,
    freeOverCents: 6000,
    shippingNote: "est. S$2.50 · free over S$60",
    country: "SG",
  },
  brints: {
    key: "brints",
    name: "Brints Collectibles",
    base: "https://brintsco.com",
    collections: [],
    shippingFlatCents: 250,
    freeOverCents: 6000,
    shippingNote: "est. S$2.50 · free over S$60",
    country: "SG",
  },
  dimensiongaming: {
    key: "dimensiongaming",
    name: "Dimension Gaming",
    base: "https://dimension.gaming.sg",
    collections: [],
    shippingFlatCents: 250,
    freeOverCents: 6000,
    shippingNote: "est. S$2.50 · free over S$60",
    country: "SG",
  },
  // Real SG store (Woodlands), but its webstore isn't Shopify (no products.json),
  // so it's directory-only — never yields fabricated prices.
  ttcs: {
    key: "ttcs",
    name: "The Trading Card Shop",
    base: "https://www.thetradingcardshop.com",
    collections: [],
    shippingFlatCents: 250,
    freeOverCents: 8000,
    shippingNote: "in-store (Woodlands) · webstore not auto-priced",
    country: "SG",
  },

  // ---- Canada stores (country: "CA"; prices in CAD via ?country=CA) ------------
  // New market, added 2026-07-29. Canada is a genuinely deep Riftbound market —
  // every store below is a confirmed Canadian business (physical address or an
  // explicit "Canadian owned and operated"/.ca identity) with a confirmed live
  // Riftbound collection, verified via web search. NOTE this session could not
  // fetch these sites directly (sandbox egress policy blocks third-party
  // domains), so the handles below are best-known values, not directly-observed
  // ones — re-verify with `npx tsx scripts/probe-ca-stores.ts` before trusting
  // them. As everywhere else, the handle is only a FALLBACK: the importer's
  // sitemap auto-discovery finds the real live collections at scrape time.
  //
  // Shipping figures are UNVERIFIED PLACEHOLDER estimates (C$2.99 · free over
  // C$75) EXCEPT where a real published threshold was confirmed — Face to Face
  // (free over C$200) and Hobbiesville (free over C$175). None of these are in
  // STORES_WITH_POLICY below; add them there once someone confirms a real
  // /policies/shipping-policy page. Never present these as published rates.
  facetoface: {
    key: "facetoface",
    name: "Face to Face Games",
    base: "https://facetofacegames.com",
    collections: ["riftbound-singles", "riftbound"],
    shippingFlatCents: 299,
    freeOverCents: 20000, // confirmed: free shipping over C$200
    shippingNote: "est. C$2.99 · free over C$200",
    country: "CA",
  },
  games401: {
    key: "games401",
    name: "401 Games",
    base: "https://store.401games.ca",
    collections: ["riftbound-league-of-legends-singles", "all-riftbound-league-of-legends-tcg"],
    shippingFlatCents: 299,
    freeOverCents: 7500,
    shippingNote: "est. C$2.99 · free over C$75",
    country: "CA",
  },
  gtgames: {
    key: "gtgames",
    name: "GT Games",
    base: "https://gtgames.ca",
    collections: ["riftbound-singles"],
    shippingFlatCents: 299,
    freeOverCents: 7500,
    shippingNote: "est. C$2.99 · free over C$75",
    country: "CA",
  },
  invasioninc: {
    key: "invasioninc",
    name: "Invasion Inc",
    base: "https://invasioncnc.ca",
    collections: ["riftbound-singles"],
    shippingFlatCents: 299,
    freeOverCents: 7500,
    shippingNote: "est. C$2.99 · free over C$75",
    country: "CA",
  },
  obsidiangames: {
    key: "obsidiangames",
    name: "Obsidian Games",
    base: "https://obsidiangames.ca",
    // Handle really is "-1"-suffixed (a duplicated collection on their store) —
    // not a typo. Auto-discovery finds it either way.
    collections: ["riftbound-singles-1", "riftbound-singles"],
    shippingFlatCents: 299,
    freeOverCents: 7500,
    shippingNote: "est. C$2.99 · free over C$75",
    country: "CA",
  },
  enterthebattlefield: {
    key: "enterthebattlefield",
    name: "Enter the Battlefield",
    base: "https://enterthebattlefield.ca",
    collections: ["riftbound-singles"],
    shippingFlatCents: 299,
    freeOverCents: 7500,
    shippingNote: "est. C$2.99 · free over C$75",
    country: "CA",
  },
  blackknight: {
    key: "blackknight",
    name: "Black Knight Games",
    base: "https://blackknightgames.ca",
    // Files Riftbound under a "ccg-" prefix rather than a riftbound-singles handle.
    collections: ["ccg-riftbound"],
    shippingFlatCents: 299,
    freeOverCents: 7500,
    shippingNote: "est. C$2.99 · free over C$75",
    country: "CA",
  },
  bentogaming: {
    key: "bentogaming",
    name: "Bento Gaming",
    base: "https://bentogaming.com",
    collections: ["riftbound-league-of-legends-singles"],
    shippingFlatCents: 299,
    freeOverCents: 7500,
    shippingNote: "est. C$2.99 · free over C$75",
    country: "CA",
  },
  jacksonqueen: {
    key: "jacksonqueen",
    name: "Jack's On Queen",
    base: "https://jacksonqueen.ca",
    collections: ["riftbound"],
    shippingFlatCents: 299,
    freeOverCents: 7500,
    shippingNote: "est. C$2.99 · free over C$75",
    country: "CA",
  },
  bananagames: {
    key: "bananagames",
    name: "Banana Games & Hobby",
    base: "https://bananagames.ca",
    collections: ["riftbound-singles"],
    shippingFlatCents: 299,
    freeOverCents: 7500,
    shippingNote: "est. C$2.99 · free over C$75",
    country: "CA",
  },
  alwaysgames: {
    key: "alwaysgames",
    name: "Always Games",
    base: "https://alwaysgames.ca",
    collections: ["riftbound-singles"],
    shippingFlatCents: 299,
    freeOverCents: 7500,
    shippingNote: "est. C$2.99 · free over C$75",
    country: "CA",
  },
  derpycards: {
    key: "derpycards",
    name: "Derpy Cards",
    base: "https://derpycards.ca",
    collections: ["riftbound-singles"],
    shippingFlatCents: 299,
    freeOverCents: 7500,
    shippingNote: "est. C$2.99 · free over C$75",
    country: "CA",
  },
  // The four stores below were REJECTED from the 2026-07 US batch specifically
  // because they're Canadian (see the researched-and-rejected list in the US
  // section above) — they were never bad leads, just filed under the wrong
  // market. This is exactly what that list was for.
  empiretradings: {
    key: "empiretradings",
    name: "Empire Trading",
    base: "https://www.empiretradings.com",
    collections: ["riftbound-singles"],
    shippingFlatCents: 299,
    freeOverCents: 7500,
    shippingNote: "est. C$2.99 · free over C$75",
    country: "CA",
  },
  // Montreal, QC. CRITICAL: their Riftbound singles collection handle is
  // "magic-the-gathering-singles-copy" — a merchant copy-paste artifact, with the
  // page TITLED "Riftbound - League of Legends - TCG Singles". The handle contains
  // no "riftbound" string, so discoverRiftboundCollections() (which requires
  // /riftbound/i on the handle) will NEVER find it. The explicit handle below is
  // load-bearing, not a fallback — without it this store silently yields zero.
  toysnowman: {
    key: "toysnowman",
    name: "Toy Snowman",
    base: "https://toysnowman.com",
    collections: ["magic-the-gathering-singles-copy"],
    shippingFlatCents: 299,
    freeOverCents: 7500,
    shippingNote: "est. C$2.99 · free over C$75",
    country: "CA",
  },
  espercards: {
    key: "espercards",
    name: "Esper Cards & Games",
    base: "https://shop.espercardsandgames.com",
    collections: ["riftbound-singles"],
    shippingFlatCents: 299,
    freeOverCents: 7500,
    shippingNote: "est. C$2.99 · free over C$75",
    country: "CA",
  },
  // Riftbound surfaced only at /pages/riftbound-singles — a Shopify PAGE, not a
  // collection, so there's nothing for products.json to read at that URL. Left
  // for sitemap auto-discovery to pick up a real collection if one exists;
  // contributes zero listings until then rather than a fabricated price.
  redriotgames: {
    key: "redriotgames",
    name: "Red Riot Games",
    base: "https://redriotgames.ca",
    collections: [],
    shippingFlatCents: 299,
    freeOverCents: 7500,
    shippingNote: "est. C$2.99 · free over C$75",
    country: "CA",
  },
  // Same /pages/riftbound situation as Red Riot above.
  levelupgames: {
    key: "levelupgames",
    name: "Level Up Games",
    base: "https://levelupgames.ca",
    collections: [],
    shippingFlatCents: 299,
    freeOverCents: 7500,
    shippingNote: "est. C$2.99 · free over C$75",
    country: "CA",
  },
  // ---- Canadian stores that ALSO serve the US market --------------------------
  // Danireon (Ottawa, ON) and Hobbiesville (Toronto + Ottawa, ON) are Canadian
  // businesses that were already tracked as US stores — they run Shopify Markets
  // and genuinely ship to and price in USD for US buyers, so those US entries are
  // real and are deliberately KEPT (removing them would drop live US price data
  // for stores that do serve US shoppers). These CA-market twins scrape the SAME
  // domain with ?country=CA to get the real CAD price for Canadian shoppers.
  //
  // Two entries for one brand is an established pattern here — cf. cardbot/
  // cardbotnz and pokebox/pokeboxusa — the difference is those are separate
  // per-country domains while these are one domain served by Shopify Markets.
  // Distinct retailer keys keep their RetailerPrice rows from colliding on
  // @@unique([cardId, retailer, condition, isFoil]).
  danireonca: {
    key: "danireonca",
    name: "Danireon Cards & Games",
    base: "https://www.danireon.com",
    collections: ["riftbound-tcg-singles"],
    shippingFlatCents: 299,
    freeOverCents: 7500,
    shippingNote: "est. C$2.99 · free over C$75",
    country: "CA",
  },
  hobbiesvilleca: {
    key: "hobbiesvilleca",
    name: "Hobbiesville",
    base: "https://hobbiesville.com",
    collections: ["riftbound-singles-league-of-legends-tcg"],
    shippingFlatCents: 299,
    freeOverCents: 17500, // confirmed: free over $175 (stated as CAD/USD)
    shippingNote: "est. C$2.99 · free over C$175",
    country: "CA",
  },
  // ---- Canadian leads checked and NOT added ----------------------------------
  //   - screenfreegames.com (BC/Alberta) — confirmed Canadian in the US batch, but
  //     no live Riftbound collection could be confirmed this pass. Not added
  //     rather than added-on-a-guess; re-check and add if they stock it.
  //   - untouchables.ca, wizardstower.com, coretcg.com, threekingsloot.com,
  //     cartamagica.com, fusiongamingonline.com, vortexgames.ca, gauntletgames.ca
  //     — real Canadian TCG stores, but no Riftbound collection surfaced in
  //     search this pass. Worth a direct re-check when someone has live network
  //     access; absence of a search hit is not proof of absence of stock.
};

export const RETAILER_LIST = Object.values(RETAILERS);

// The market a store serves (defaults to AU for the original stores).
export function retailerCountry(retailerKey: string): "AU" | "NZ" | "US" | "UK" | "SG" | "CA" {
  return RETAILERS[retailerKey]?.country ?? "AU";
}

// Estimated flat postage for a single card. We always show a shipping estimate
// (never "free" — we can't confirm free shipping, and we don't want everything
// marked "unknown" either). null only if the retailer isn't configured.
export function shippingCents(retailerKey: string): number | null {
  const r = RETAILERS[retailerKey];
  if (!r) return null;
  return r.shippingFlatCents;
}

// Estimated delivered cost (item + estimated shipping).
export function deliveredCents(retailerKey: string, priceCents: number): number {
  return priceCents + (shippingCents(retailerKey) ?? 0);
}

// The shipping cost for a single listing — returned ONLY when we genuinely know it.
// eBay's Browse API gives a real per-listing figure (including 0 = seller states
// free post), so those are exact. Everywhere else (Shopify stores, TCGplayer)
// postage is calculated at checkout and we don't actually know it, so we return
// `null` = "unknown" rather than a fabricated flat estimate. Accuracy over
// exhaustiveness — wrong delivery prices erode trust (and drew user complaints).
export function effectiveShippingCents(rowShippingCents: number | null): number | null {
  return rowShippingCents;
}

// Stores with a verified Shopify shipping-policy page (all at /policies/shipping-policy).
// We can't reliably parse a flat rate from the free-text policy, so rather than
// fabricate a number we link customers straight to the policy for the real current
// rate. (Verified by probing every store; 42/45 have one.)
const STORES_WITH_POLICY = new Set([
  "cherry", "finalboss", "plenty", "adventurers", "manamarket", "cardbot", "ggadelaide",
  "goodgames", "vaultgames", "mintcollectables", "cardhub", "pokebox", "spellroo", "spindown",
  "gamesarena88",
  "cardmasters", "tcgcollectornz", "cardmerchant", "ironknight", "calicokeep", "cardbotnz",
  "gamingdna", "beagames", "shuffleandcut", "gameroost", "bardsandcards", "mythicstore",
  "cgrealm", "danireon", "punkouter", "gglegends", "stompinggrounds", "cardboardanddie",
  "mistymountain", "theboosterbox", "npcollectibles", "capefear", "hobbiesville", "mysterymtg",
  // Note: "gamersguildaz", "kanzengames", "hauntedgamecafe", "hobbyaddicts" were
  // removed from here — they'd been added, verified, then later dropped from
  // RETAILERS (like the Common Ground Games/Riftgate/etc. batch documented near
  // onboardgaming above), but this Set was never cleaned up to match. Harmless at
  // runtime (shippingPolicyUrl() guards on RETAILERS[key] existing) but stale, and
  // it's exactly the kind of drift that made the homepage/tracked-page store counts
  // disagree — see the count-consistency fix in src/app/page.tsx.
  // UK
  "thistletavern", "cardgoblin", "axionnow", "spellboundgames", "totalcards",
  "boardsandswords", "forbiddenplanet", "zatugames", "cardvault", "goblingaming",
  "gatheringgames", "harlequins", "travellingman", "monstercardcorner",
]);

// The store's shipping-policy page URL, or null if it doesn't have one / isn't a store.
export function shippingPolicyUrl(retailerKey: string): string | null {
  const r = RETAILERS[retailerKey];
  return r && STORES_WITH_POLICY.has(retailerKey) ? `${r.base}/policies/shipping-policy` : null;
}
