// Shared domain knowledge for Riftbound cards: domains, rarities, types and
// card conditions, plus the colors used to render them throughout the UI.

// Retailer key for the TCGplayer price surfaced in the UK market (USD market price
// converted to GBP). It's a fallback reference only: excluded from the UK "from"
// price and hidden from the UK listing breakdown whenever a real GBP listing
// exists, so the cheapest figure shown reflects a genuinely buyable UK price.
// Defined here (client-safe) so both server pricing and client UI agree on the key.
export const TCGPLAYER_UK_RETAILER = "tcgplayer_uk";

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

// Riftbound sets. `comingSoon` sets aren't released yet (no cards/prices). `slug`
// is the SEO landing-page path (/sets/<slug>).
export interface SetInfo { code: string; name: string; slug: string; comingSoon?: boolean }
export const SETS: SetInfo[] = [
  { code: "OGN", name: "Origins", slug: "origins" },
  { code: "OGS", name: "Origins: Proving Grounds", slug: "proving-grounds" },
  { code: "SFD", name: "Spirit Forged", slug: "spiritforged" },
  { code: "UNL", name: "Unleashed", slug: "unleashed" },
  { code: "VEN", name: "Vendetta", slug: "vendetta", comingSoon: true },
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
