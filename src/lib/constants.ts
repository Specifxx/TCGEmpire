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

// Canada, same pattern as UK/SG/AU. It was the ONE tracked market with no
// TCGplayer row at all: refreshTcgplayerPrices() looped US/UK/SG/AU and simply
// omitted CA, so a Canadian visitor's card page had no CAD reference price and
// the Deal Finder could not use TCGplayer as a buy/sell source for Canada — even
// though CA is a full market everywhere else (its own eBay rotation, its own
// lowestPriceCentsCa column, its own FX rate).
//
// Fallback-only, like the others: a converted USD market price is a REFERENCE,
// not a Canadian retailer, so it must never be counted as a buyable store or
// undercut a real CAD listing. See computeMarket()'s FALLBACK filter.
export const TCGPLAYER_CA_RETAILER = "tcgplayer_ca";
export const CA_FALLBACK_RETAILERS: readonly string[] = [TCGPLAYER_CA_RETAILER];

// Registered but NOT produced — see the AU/NZ note below. No TCG_NZ market
// exists in tcgplayer.ts, and this exists so that if one is ever added it lands
// as a reference price rather than as a New Zealand "store".
export const TCGPLAYER_NZ_RETAILER = "tcgplayer_nz";
export const NZ_FALLBACK_RETAILERS: readonly string[] = [TCGPLAYER_NZ_RETAILER];

// ─────────────────────────────────────────────────────────────────────────────
// THE RULE: a converted reference price is never a row in the price comparison.
// ─────────────────────────────────────────────────────────────────────────────
// TCGplayer is a US marketplace. Its AU/NZ/UK/SG/CA figures are its USD market
// price run through an FX rate — useful as a "what is this worth?" reference,
// but NOT a local listing: nobody can buy from "TCGplayer Australia", the price
// excludes international postage and duty, and showing it as a store would let
// it undercut the real AU/NZ stores we exist to compare. Cardmarket is the same
// shape for the UK.
//
// So they are excluded ENTIRELY — not deprioritised — from:
//   • the comparison rows and store count      (computeMarket, market-rows.ts)
//   • the QuickView price list                 (components/QuickView.tsx)
//   • the marketplace "beat this price" query  (app/marketplace/page.tsx)
//   • the lowestPriceCents* columns            (price-import.ts)
// They survive only in the Deal Finder (arbitrage needs a sell-side reference)
// and in the card page's clearly-labelled TcgMarketPrice block.
//
// AUSTRALIA AND NEW ZEALAND, EXPLICITLY — a standing product rule, not an
// implementation detail: TCGplayer must never appear as a price-comparison row
// in either market.
//
// AU is covered by AU_FALLBACK_RETAILERS above. NZ has no TCGplayer row at all
// today (it is absent from TCG_MARKETS in tcgplayer.ts), which means the rule
// held only because nothing wrote the row — add a `TCG_NZ` and NZ would start
// showing TCGplayer as a buyable local store immediately, with no filter
// standing in the way. NZ_FALLBACK_RETAILERS closes that: the key is registered
// as a reference source in advance, so the guard is structural rather than
// incidental. It costs one array entry and removes a live footgun.
//
// Use this union rather than hand-listing the per-market arrays. Three call
// sites did the latter and every one of them was missing a market by the time CA
// was added — a hand-listed subset silently readmits a reference price as a
// buyable store the moment a new market appears.
export const ALL_FALLBACK_RETAILERS: readonly string[] = [
  ...AU_FALLBACK_RETAILERS,
  ...UK_FALLBACK_RETAILERS,
  ...SG_FALLBACK_RETAILERS,
  ...CA_FALLBACK_RETAILERS,
  ...NZ_FALLBACK_RETAILERS,
];

/** True when `retailer` is a converted reference price, not a buyable store. */
export function isFallbackRetailer(retailer: string): boolean {
  return ALL_FALLBACK_RETAILERS.includes(retailer);
}

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
// (/sets/<slug>). `recentlyReleased` = purely cosmetic "New" badge for a set that
// just went on sale (short-lived; drop it once the badge has run its course).
// `releasedOn` = the day the set's singles started trading (ISO yyyy-mm-dd).
//
// Its ONE job is to give a launch set first claim on the scarce eBay Browse
// quota, for PRICE_PRIORITY_WINDOW_DAYS and then never again. Deliberately a
// DATE rather than a boolean:
//
//   • It expires by itself. A boolean would sit there earning a permanent head
//     start long after the set stopped being new, because clearing it is exactly
//     the kind of chore nobody remembers — and the cost of forgetting is silent
//     (some other set's cards quietly go unpriced).
//   • It is a fact about the set, not a preference, so the next launch just
//     records its date and inherits the behaviour with no code change.
//
// Deliberately NOT a reuse of `recentlyReleased`, which is documented above as
// purely cosmetic (a "New" badge). Removing that badge must not silently
// reorder the price importer, and prioritising a set for pricing must not force
// a badge onto it. Two decisions, two fields.
//
// Why any of this is needed: refreshEbayMarkets orders cards by search demand,
// and a just-imported card has no demand recorded yet — zero searches, zero
// views, no price — so it sorts LAST, exactly when its price is most wanted. The
// quota cannot cover every market × every card daily, so the tail is what gets
// dropped.
export interface SetInfo { code: string; name: string; slug: string; comingSoon?: boolean; sealedAvailable?: boolean; totalCards?: number; recentlyReleased?: boolean; releasedOn?: string }
export const SETS: SetInfo[] = [
  { code: "OGN", name: "Origins", slug: "origins" },
  { code: "OGS", name: "Origins: Proving Grounds", slug: "proving-grounds" },
  { code: "SFD", name: "Spirit Forged", slug: "spiritforged" },
  { code: "UNL", name: "Unleashed", slug: "unleashed" },
  // Singles started trading (Pre-Rift launch events + early marketplace listings)
  // a few days ahead of the 31 Jul 2026 official street date — treated as released.
  { code: "VEN", name: "Vendetta", slug: "vendetta", totalCards: 166, recentlyReleased: true, releasedOn: "2026-07-31" },
];

// How long after release a set keeps first claim on the eBay quota. Two months:
// long enough to cover the window where a new set's prices move daily and the
// searches arrive before our own demand data does, short enough that it is over
// well before the next set lands.
export const PRICE_PRIORITY_WINDOW_DAYS = 60;

/**
 * Set codes that currently get first claim on the eBay refresh quota.
 *
 * A FUNCTION, not a constant, on purpose: a module-level constant is evaluated
 * once at import and would freeze the answer for the lifetime of a process, so a
 * long-running server would keep prioritising a set for as long as it stayed up.
 * Taking `now` also makes the expiry testable without waiting two months.
 *
 * Returns [] once every set's window has passed — which is the steady state, and
 * restores plain popularity-then-value ordering with no code change.
 */
export function pricePrioritySetCodes(now: Date = new Date()): string[] {
  const cutoff = now.getTime() - PRICE_PRIORITY_WINDOW_DAYS * 86_400_000;
  return SETS.filter((s) => {
    if (!s.releasedOn) return false;
    const released = Date.parse(`${s.releasedOn}T00:00:00Z`);
    // An unparseable date must not silently grant a permanent head start.
    if (Number.isNaN(released)) return false;
    return released >= cutoff;
  }).map((s) => s.code);
}
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

// Crystal Rose = Vendetta's 6 Wild Rift crossover alt-arts (Kai'Sa, Sona, Ahri,
// Sett, Ezreal, Lux), numbered SP1-SP6 instead of a normal "/NNN" — Riot's own
// wording reserves "Overnumber" for Riftbound-original art, so these get their
// own badge rather than showing as overnumbered.
export function isCrystalRose(setCode: string, collectorNumber: string): boolean {
  return setCode === "VEN" && /^sp\d/i.test(collectorNumber);
}

export function conditionInfo(key: string): ConditionInfo {
  return CONDITIONS[key] ?? CONDITIONS.NM;
}
