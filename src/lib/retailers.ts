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
  // Market the store serves. Omitted = "AU" (the original Australian stores). NZ/US/UK
  // stores are scraped with ?country=NZ/US/GB and priced in NZD/USD/GBP. eBay runs for
  // AU + US + UK.
  country?: "AU" | "NZ" | "US" | "UK";
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
  gglegends: {
    key: "gglegends",
    name: "GG Legends",
    base: "https://store.gglehi.com",
    collections: ["riftbound-singles"],
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
  gamersguildaz: {
    key: "gamersguildaz",
    name: "Gamers Guild AZ",
    base: "https://gamersguildaz.com",
    collections: ["riftbound-league-of-legends-tcg"],
    shippingFlatCents: 300,
    freeOverCents: 5000,
    shippingNote: "est. US$3.00 · free over US$50",
    country: "US",
  },
  kanzengames: {
    key: "kanzengames",
    name: "KanZenGames",
    base: "https://kanzengames.com",
    collections: ["riftbound-tcg-singles-all"],
    shippingFlatCents: 150,
    freeOverCents: 5000,
    shippingNote: "est. US$1.50 · free over US$50",
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
  hauntedgamecafe: {
    key: "hauntedgamecafe",
    name: "The Haunted Game Cafe",
    base: "https://www.hauntedgamecafe.com",
    collections: ["riftbound-tcg"],
    shippingFlatCents: 200,
    freeOverCents: 5000,
    shippingNote: "est. US$2.00 · free over US$50",
    country: "US",
  },
  hobbyaddicts: {
    key: "hobbyaddicts",
    name: "Hobby Addicts",
    base: "https://www.hobby-addicts.com",
    collections: ["riftbound-1"],
    shippingFlatCents: 200,
    freeOverCents: 5000,
    shippingNote: "est. US$2.00 · free over US$50",
    country: "US",
  },
};

export const RETAILER_LIST = Object.values(RETAILERS);

// The market a store serves (defaults to AU for the original stores).
export function retailerCountry(retailerKey: string): "AU" | "NZ" | "US" | "UK" {
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
  "cardmasters", "tcgcollectornz", "cardmerchant", "ironknight", "calicokeep", "cardbotnz",
  "gamingdna", "beagames", "shuffleandcut", "gameroost", "bardsandcards", "mythicstore",
  "cgrealm", "danireon", "punkouter", "gglegends", "stompinggrounds", "cardboardanddie",
  "mistymountain", "theboosterbox", "npcollectibles", "capefear", "hobbiesville",
  "gamersguildaz", "kanzengames", "mysterymtg", "hauntedgamecafe", "hobbyaddicts",
]);

// The store's shipping-policy page URL, or null if it doesn't have one / isn't a store.
export function shippingPolicyUrl(retailerKey: string): string | null {
  const r = RETAILERS[retailerKey];
  return r && STORES_WITH_POLICY.has(retailerKey) ? `${r.base}/policies/shipping-policy` : null;
}
