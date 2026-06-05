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
};

export const RETAILER_LIST = Object.values(RETAILERS);

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
