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
  // NZ/US/UK/SG stores are scraped with ?country=NZ/US/GB/SG and priced in
  // NZD/USD/GBP/SGD. eBay runs for AU + US + UK + SG.
  country?: "AU" | "NZ" | "US" | "UK" | "SG";
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
};

export const RETAILER_LIST = Object.values(RETAILERS);

// The market a store serves (defaults to AU for the original stores).
export function retailerCountry(retailerKey: string): "AU" | "NZ" | "US" | "UK" | "SG" {
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
  "mistymountain", "theboosterbox", "npcollectibles", "capefear", "hobbiesville",
  "gamersguildaz", "kanzengames", "mysterymtg", "hauntedgamecafe", "hobbyaddicts",
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
