// Shared domain knowledge for Riftbound cards: domains, rarities, types and
// card conditions, plus the colors used to render them throughout the UI.

// Retailer key for the TCGplayer price surfaced in the UK market (USD market price
// converted to GBP). It's a fallback reference only: excluded from the UK "from"
// price and hidden from the UK listing breakdown whenever a real GBP listing
// exists, so the cheapest figure shown reflects a genuinely buyable UK price.
// Defined here (client-safe) so both server pricing and client UI agree on the key.
export const TCGPLAYER_UK_RETAILER = "tcgplayer_uk";

// Retailer key for the Cardmarket price surfaced in the UK market. Cardmarket's
// public price-guide is EUR-denominated and we convert it to GBP, so — exactly like
// TCGplayer-UK — it's a converted reference: a marketplace "from" aggregate, not a
// single verified in-stock UK listing. It's therefore treated as a fallback too.
export const CARDMARKET_RETAILER = "cardmarket";

// Converted, non-buyable-as-shown UK price sources. These are EXCLUDED from the UK
// "from" price and HIDDEN from the UK listing breakdown whenever a genuine GBP
// listing exists, and only used as a fallback when none does. Real UK stores and
// eBay UK are never in this set. One source of truth shared by the importer
// (headline computation) and the UI (breakdown filtering).
export const UK_FALLBACK_RETAILERS: readonly string[] = [TCGPLAYER_UK_RETAILER, CARDMARKET_RETAILER];

// Singapore mirrors the UK pattern: TCGplayer's USD market price converted to SGD is
// surfaced as a reference source, excluded from the SG "from" price whenever a real
// SGD listing (local store / eBay SG) exists.
export const TCGPLAYER_SG_RETAILER = "tcgplayer_sg";
export const SG_FALLBACK_RETAILERS: readonly string[] = [TCGPLAYER_SG_RETAILER];

// AU also gets a TCGplayer (converted to AUD) row — NOT because AU lacks real
// stores (it has plenty), but so the Deal Finder's arbitrage tools can treat
// TCGplayer as a normal buy/sell source in every market, not just US/UK/SG. It
// mirrors the UK/SG fallback pattern exactly: excluded from the AU "from" price
// and the AU listing breakdown whenever real AU listings exist, so it can never
// undercut or clutter the main price comparison — it only ever surfaces via the
// Deal Finder, or as a last-resort fallback if a card has no real AU price at all.
export const TCGPLAYER_AU_RETAILER = "tcgplayer_au";
export const AU_FALLBACK_RETAILERS: readonly string[] = [TCGPLAYER_AU_RETAILER];

export type DomainKey =
  | "Fury"
  | "Calm"
  | "Mind"
  | "Body"
  | "Chaos"
  | "Order"
  | "Colorless";

export interface DomainInfo {
  key: DomainKey;
  label: string;
  // Primary + secondary colors used for generated card art gradients.
  color: string;
  color2: string;
  text: string;
}

export const DOMAINS: Record<DomainKey, DomainInfo> = {
  Fury: { key: "Fury", label: "Fury", color: "#e5484d", color2: "#7a1f23", text: "#ffd9d9" },
  Calm: { key: "Calm", label: "Calm", color: "#30a46c", color2: "#10341f", text: "#d4f7e4" },
  Mind: { key: "Mind", label: "Mind", color: "#3b82f6", color2: "#16275c", text: "#d8e6ff" },
  Body: { key: "Body", label: "Body", color: "#f5a524", color2: "#5e3c08", text: "#ffeccd" },
  Chaos: { key: "Chaos", label: "Chaos", color: "#a855f7", color2: "#3b1063", text: "#eddbff" },
  Order: { key: "Order", label: "Order", color: "#cbd5e1", color2: "#4b5563", text: "#f8fafc" },
  Colorless: { key: "Colorless", label: "Colorless", color: "#8b8f9a", color2: "#2c3038", text: "#e8eaee" },
};

export const DOMAIN_KEYS = Object.keys(DOMAINS) as DomainKey[];

export const CARD_TYPES = [
  "Unit",
  "Spell",
  "Gear",
  "Rune",
  "Battlefield",
  "Legend",
] as const;
export type CardType = (typeof CARD_TYPES)[number];

// Riftbound sets. `comingSoon` = the set isn't officially ON SALE yet (singles
// aren't buyable in stores) — this keeps it out of the sitemap's fresh-content
// signal, movers, box-EV, pack-sim etc. It does NOT mean the set has no Card
// rows: the official-gallery pipeline (scripts/import-vendetta.ts) imports real,
// unpriced Card rows through spoiler season, well before release day — see
// /sets/<slug>'s own comingSoon-but-revealed branch. `sealedAvailable` = sealed
// products (booster boxes/packs) are already buyable and listed on /sealed even
// while the singles are still pending — Vendetta is exactly this state.
// `totalCards` = the official main-set card count once Riot confirms it — lets
// the set page state "all N cards revealed" precisely instead of just "revealed
// so far", and lets setFromTotal()-style price-import matching recognise the set
// from a bare "NNN/total" collector number. `slug` is the SEO landing-page path
// (/sets/<slug>).
export interface SetInfo { code: string; name: string; slug: string; comingSoon?: boolean; sealedAvailable?: boolean; totalCards?: number }
export const SETS: SetInfo[] = [
  { code: "OGN", name: "Origins", slug: "origins" },
  { code: "OGS", name: "Origins: Proving Grounds", slug: "proving-grounds" },
  { code: "SFD", name: "Spirit Forged", slug: "spiritforged" },
  { code: "UNL", name: "Unleashed", slug: "unleashed" },
  { code: "VEN", name: "Vendetta", slug: "vendetta", comingSoon: true, sealedAvailable: true, totalCards: 166 },
];
export const setBySlug = (slug: string): SetInfo | undefined => SETS.find((s) => s.slug === slug);
export const setByCode = (code: string): SetInfo | undefined => SETS.find((s) => s.code === code);

export interface RarityInfo {
  key: string;
  label: string;
  color: string;
}

export const RARITIES: Record<string, RarityInfo> = {
  Common: { key: "Common", label: "Common", color: "#9aa0aa" },
  Uncommon: { key: "Uncommon", label: "Uncommon", color: "#30a46c" },
  Rare: { key: "Rare", label: "Rare", color: "#3b82f6" },
  Epic: { key: "Epic", label: "Epic", color: "#a855f7" },
  Showcase: { key: "Showcase", label: "Showcase", color: "#f5a524" },
};

export const RARITY_KEYS = Object.keys(RARITIES);

export interface ConditionInfo {
  key: string;
  label: string;
  full: string;
  color: string;
}

// Card grading scale used across TCG marketplaces.
export const CONDITIONS: Record<string, ConditionInfo> = {
  NM: { key: "NM", label: "NM", full: "Near Mint", color: "#30a46c" },
  LP: { key: "LP", label: "LP", full: "Lightly Played", color: "#86b300" },
  MP: { key: "MP", label: "MP", full: "Moderately Played", color: "#f5a524" },
  HP: { key: "HP", label: "HP", full: "Heavily Played", color: "#f5793b" },
  DMG: { key: "DMG", label: "DMG", full: "Damaged", color: "#e5484d" },
};

export const CONDITION_KEYS = Object.keys(CONDITIONS);

// Relative value multipliers applied to a card's reference price per condition.
export const CONDITION_MULTIPLIER: Record<string, number> = {
  NM: 1.0,
  LP: 0.85,
  MP: 0.7,
  HP: 0.55,
  DMG: 0.4,
};

export function domainInfo(key: string): DomainInfo {
  return DOMAINS[(key as DomainKey)] ?? DOMAINS.Colorless;
}

// Normalise the lowercase faction/rarity strings from the RiftScribe API to the
// capitalised keys used across the app (e.g. "colorless" -> "Colorless").
export function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export function rarityInfo(key: string): RarityInfo {
  return RARITIES[key] ?? RARITIES.Common;
}

// Signature = a "*" in the collector number (e.g. 223*/221). Takes precedence
// over the plain overnumbered badge.
export function isSignature(collectorNumber: string): boolean {
  return collectorNumber.includes("*");
}

// Overnumbered = collector number beyond the set's base count (e.g. 238/219),
// EXCLUDING signatures (those show the Signature badge instead).
export function isOvernumbered(collectorNumber: string): boolean {
  if (collectorNumber.includes("*")) return false;
  const m = collectorNumber.match(/^(\d+)[a-z]?\/(\d+)/i);
  return m ? parseInt(m[1], 10) > parseInt(m[2], 10) : false;
}

export function conditionInfo(key: string): ConditionInfo {
  return CONDITIONS[key] ?? CONDITIONS.NM;
}
