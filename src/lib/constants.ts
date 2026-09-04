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
// The EU market's Cardmarket row. A SEPARATE retailer key from the UK one above
// because RetailerPrice is uniquely keyed on [cardId, retailer, condition,
// isFoil] with no country in the key — one key serving two markets would collide
// and silently keep whichever row was written last. Same reason eBay has
// ebay/ebay_us/ebay_uk and the marketplace has marketplace_*.
export const CARDMARKET_EU_RETAILER = "cardmarket_eu";

// Retailer key for CardTrader, the EU market's price source (lib/cardtrader.ts).
// UNLIKE the two above, this is NOT a converted fallback: each row is one real,
// in-stock listing from one identified EU seller, quoted in EUR, so it can carry
// the EU "from" price on its own the way a genuine Shopify store listing carries
// the UK's. Kept out of UK_FALLBACK_RETAILERS deliberately for that reason.
export const CARDTRADER_RETAILER = "cardtrader";

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

// eBay CA. For SINGLES this key is written by price-import.ts's US pass (CA rows
// are FX-derived from the US Browse results, not a separate ~1,400-card search —
// see the note at that write site); for SEALED (sealed-import.ts) it's a real,
// separate Browse search, since sealed is only ~30 product groups per market and
// a native search there is cheap. Defined here (constants.ts imports nothing) so
// both files can share the one key without creating an import cycle between them
// — price-import.ts already imports sealed-import.ts's importSealed().
export const EBAY_CA_RETAILER = "ebay_ca";

// ─────────────────────────────────────────────────────────────────────────────
// THE RULE: a converted reference price is never a row in the price comparison.
// ─────────────────────────────────────────────────────────────────────────────
// TCGplayer is a US marketplace. Its AU/UK/SG/CA figures are its USD market
// price run through an FX rate — useful as a "what is this worth?" reference,
// but NOT a local listing: nobody can buy from "TCGplayer Australia", the price
// excludes international postage and duty, and showing it as a store would let
// it undercut the real AU stores we exist to compare. Cardmarket is the same
// shape for the UK.
//
// So they are excluded ENTIRELY — not deprioritised — from:
//   • the comparison rows and store count      (computeMarket, market-rows.ts)
//   • the QuickView price list                 (components/QuickView.tsx)
//   • the lowestPriceCents* columns            (price-import.ts)
// They survive only in the Deal Finder (arbitrage needs a sell-side reference)
// and in the card page's clearly-labelled TcgMarketPrice block.
//
// AUSTRALIA, EXPLICITLY — a standing product rule, not an implementation
// detail: TCGplayer must never appear as a price-comparison row there, covered
// by AU_FALLBACK_RETAILERS above.
//
// Use this union rather than hand-listing the per-market arrays. Three call
// sites did the latter and every one of them was missing a market by the time CA
// was added — a hand-listed subset silently readmits a reference price as a
// buyable store the moment a new market appears.
// The day predicted in this comment arrived on 2026-08-23: Cardmarket now writes
// a native-EUR row for the EU market (lib/cardmarket.ts), so the list is no
// longer empty. It is still gated OFF at the source until someone configures
// CARDMARKET_PRODUCTLIST_URL/CARDMARKET_PRICEGUIDE_URL, and registering the key
// here regardless is the point — the exclusion has to be in place BEFORE that
// first configured run, not after, or it lets a marketplace aggregate set
// lowestPriceCentsEu and outrank real EU stores.
export const EU_FALLBACK_RETAILERS: readonly string[] = [CARDMARKET_EU_RETAILER];
export const ALL_FALLBACK_RETAILERS: readonly string[] = [
  ...AU_FALLBACK_RETAILERS,
  ...UK_FALLBACK_RETAILERS,
  ...SG_FALLBACK_RETAILERS,
  ...CA_FALLBACK_RETAILERS,
  ...EU_FALLBACK_RETAILERS,
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
  // Set 5, announced in Riot's 4 Aug 2026 product rundown (written up in
  // /blog/riftbound-2027-set-roadmap): 23 Oct 2026, ~180 cards. comingSoon with no
  // sealedAvailable, so it renders as a disabled "Coming soon" tile on the homepage
  // and under "Upcoming & unreleased" on /sets, and is excluded from the eBay quota,
  // the box-EV calculator, movers and the pack game until cards actually import.
  //
  // "RAD" IS A PLACEHOLDER. Riot has published the name and date but not the
  // three-letter set code; this is our guess. Changing it later is a one-line edit
  // here PLUS a Card.setCode backfill if any cards have been imported under it —
  // check before importing the official gallery.
  { code: "RAD", name: "Radiance", slug: "radiance", totalCards: 180, comingSoon: true, releasedOn: "2026-10-23" },
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
 *
 * The window is CLOSED AT BOTH ENDS. A set whose release date is still in the
 * future has not released, so it gets nothing: announced-but-unshipped sets now
 * carry a real `releasedOn` (Radiance, 23 Oct 2026), and a one-sided "released >=
 * cutoff" test would have handed the quota to a set with zero cards in the
 * database for months before its street date. Both ends being dated means the
 * window opens and closes entirely on its own.
 */
export function pricePrioritySetCodes(now: Date = new Date()): string[] {
  const at = now.getTime();
  const cutoff = at - PRICE_PRIORITY_WINDOW_DAYS * 86_400_000;
  return SETS.filter((s) => {
    if (!s.releasedOn) return false;
    const released = Date.parse(`${s.releasedOn}T00:00:00Z`);
    // An unparseable date must not silently grant a permanent head start.
    if (Number.isNaN(released)) return false;
    return released >= cutoff && released <= at;
  }).map((s) => s.code);
}
/**
 * The most recently RELEASED set — latest `releasedOn` that is not in the future.
 *
 * Exists so a surface can point at "the current set" without naming one. The
 * homepage used to hard-code Vendetta (a launch band, plus a link to its card
 * gallery); the band is gone, and the gallery link stays but follows whichever
 * set is current, so it moves to Radiance on 23 Oct 2026 with no edit.
 *
 * Takes `now` for the same reason pricePrioritySetCodes() does: a module-level
 * constant would freeze the answer for the lifetime of the process, and it makes
 * the rollover testable without waiting for the date.
 */
export function newestReleasedSet(now: Date = new Date()): SetInfo | undefined {
  const at = now.getTime();
  return SETS.filter((s) => {
    if (!s.releasedOn) return false;
    const released = Date.parse(`${s.releasedOn}T00:00:00Z`);
    return !Number.isNaN(released) && released <= at;
  }).sort((a, b) => (a.releasedOn! < b.releasedOn! ? 1 : -1))[0];
}

export const setBySlug = (slug: string): SetInfo | undefined => SETS.find((s) => s.slug === slug);
export const setByCode = (code: string): SetInfo | undefined => SETS.find((s) => s.code === code);

/**
 * The next set that hasn't released yet — symmetric with newestReleasedSet()
 * above. Lets a surface (the homepage's release-hype card) point at "the next
 * set" without naming one, so it rolls from Radiance to Legacy on its own once
 * Radiance ships, with no code change.
 *
 * Prefers the earliest dated `comingSoon` entry; an undated one (announced but
 * no release date yet) sorts after any dated entry, since "no date" is further
 * from certain than "has a date, just further out."
 */
export function nextUpcomingSet(now: Date = new Date()): SetInfo | undefined {
  const at = now.getTime();
  return SETS.filter((s) => {
    if (!s.comingSoon) return false;
    if (!s.releasedOn) return true;
    const released = Date.parse(`${s.releasedOn}T00:00:00Z`);
    return Number.isNaN(released) || released > at;
  }).sort((a, b) => {
    if (!a.releasedOn && !b.releasedOn) return 0;
    if (!a.releasedOn) return 1;
    if (!b.releasedOn) return -1;
    return a.releasedOn < b.releasedOn ? -1 : 1;
  })[0];
}

/**
 * Has this set code NOT shipped yet? — i.e. anything a store sells for it today is
 * a PRE-ORDER, not stock it can post you.
 *
 * Date-driven like every other helper here, so it needs no edit on release day:
 * Radiance stops being a pre-order set the moment 23 Oct 2026 passes, and its
 * listings graduate into the normal sealed pages on their own.
 *
 * An unknown code reads as released. That is the safe default: the only thing
 * this flag suppresses is a "pre-order" label and separate treatment, so guessing
 * "released" for a code we don't recognise shows a real listing plainly rather
 * than hiding it behind a badge that might be wrong.
 */
export function isPreorderSetCode(code: string | null | undefined, now: Date = new Date()): boolean {
  if (!code) return false;
  const set = setByCode(code);
  if (!set?.comingSoon) return false;
  if (!set.releasedOn) return true; // announced, no date — still unreleased
  const released = Date.parse(`${set.releasedOn}T00:00:00Z`);
  return Number.isNaN(released) || released > now.getTime();
}

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

// Normalise a RAW condition string from any of the four writers into one of our
// five grades, or null when it genuinely can't be told. Four incompatible source
// vocabularies feed RetailerPrice.condition (see prisma/schema.prisma) with no
// mapping between them today:
//   • Shopify stores — the store's own variant title verbatim ("Near Mint", "NM",
//     "Lightly Played", or a non-condition title like "Default Title")
//   • eBay Browse API — eBay's OWN condition vocabulary ("New", "Used", "Brand
//     New", "Very Good", "Good", "Acceptable" — not a TCG grading scale at all)
//   • TCGplayer — always the literal string "NM", stamped onto an algorithmic
//     ALL-CONDITION market price (see the note at price-import.ts's TCGplayer import)
//   • Cardmarket — same shape, always "NM" over a converted low price
//
// price-import.ts's private conditionRank() solves a DIFFERENT problem — picking
// the best-condition Shopify variant to price — and its `return 0` default quietly
// treats anything unrecognised as Near Mint. That default is fine for its actual
// job (Shopify variant titles are rarely enigmatic) but would be actively wrong
// applied to eBay's condition vocabulary: an eBay "Used" listing is not NM, and
// mapping it there is worse than showing nothing. This function is stricter —
// eBay's non-TCG conditions map explicitly, and anything neither writer's shape
// matches returns null rather than guessing.
export function normaliseCondition(raw: string | null | undefined): keyof typeof CONDITIONS | null {
  const t = (raw ?? "").trim().toLowerCase();
  if (!t || t === "default title") return null;
  // TCG-grading-scale phrasing (Shopify variant titles, and our own labels).
  if (/near\s*mint|\bnm\b|\bmint\b/.test(t)) return "NM";
  if (/light(ly)?\s*play|\blp\b/.test(t)) return "LP";
  if (/moderate(ly)?\s*play|\bmp\b/.test(t)) return "MP";
  if (/heav(ily)?\s*play|\bhp\b/.test(t)) return "HP";
  if (/damaged|\bdmg\b|\bdamage\b/.test(t)) return "DMG";
  // eBay's raw-card condition vocabulary is its OWN 4-tier scale for the trading
  // cards category — "Near Mint or Better / Excellent / Very Good / Poor" — not a
  // TCG grading scale and not the generic New/Used item condition. Mapped by
  // relative rank onto our 5-tier scale (best → worst), since guessing a mapping
  // for anything eBay actually returns is worse than getting the order wrong.
  // Checked AFTER the TCG-scale patterns above but deliberately BEFORE any bare
  // "poor" could be mistaken for the TCG-tradition "poor = damaged" — eBay's own
  // "Poor" means the worst of ITS four tiers, not a synonym for actually damaged:
  if (/near\s*mint\s*or\s*better/.test(t)) return "NM";
  if (/^excellent$/.test(t)) return "LP";
  if (/very\s*good/.test(t)) return "MP";
  if (/^poor$/.test(t)) return "HP";
  // Generic eBay item-condition strings (used outside the raw-card scale, e.g.
  // sealed product listings): "New"/"Brand New" is the closest real equivalent of
  // Near Mint for an unopened item.
  if (/^(brand\s*new|new(\s+other)?)$/.test(t)) return "NM";
  return null;
}

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

// ─────────────────────────────────────────────────────────────────────────────
// A CHASE PRINT DOES NOT SIT IN A BASE RARITY TIER.
// ─────────────────────────────────────────────────────────────────────────────
// Reported live: filtering /browse by "Rare" returned a wall of A$165–172
// Vendetta chase cards — Ambessa 196/166, Swain 173/166, Draven 172/166, Leona
// 184/166. The filter was correct; the DATA said those cards were Rare. The
// official Vendetta gallery labels an overnumbered print by the rarity of the
// card it re-prints, so `import-vendetta.ts` faithfully stored "Rare", and they
// sorted to the top of the Rare filter because they are the most expensive
// things in it.
//
// This is the same bug alt-arts had. scripts/fix-altart-rarity.ts already
// reclassifies those to Showcase precisely so they stop "cluttering that rarity
// filter with the base art" — overnumbered and Signature prints were simply
// never included in it.
//
// The rule: a print that is a SPECIAL TREATMENT of another card belongs in
// Showcase, not in the tier of the card it re-prints. Someone filtering "Rare"
// wants the rare cards of the base set.
//
// PROMOS ARE DELIBERATELY EXCLUDED and keep their base rarity — that is the
// existing convention (they carry their own PROMO badge and their own filter),
// and it is not this change's business to alter it.
//
// Crystal Rose (VEN SP1–SP6) is also untouched: its collector numbers are not
// numeric-over-total, so isOvernumbered() is false for them by construction and
// they keep their genuine Epic tier alongside their own Crystal Rose badge.
export function chasePrintRarity(c: {
  collectorNumber: string;
  variant?: string | null;
  isPromo?: boolean;
  rarity: string;
}): string {
  if (c.isPromo) return c.rarity;
  if (c.variant != null) return "Showcase"; // alt-art (already enforced elsewhere)
  if (isSignature(c.collectorNumber)) return "Showcase";
  if (isOvernumbered(c.collectorNumber)) return "Showcase";
  return c.rarity;
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

// ─── The one exception: printings with NO RETAIL CHANNEL ─────────────────────
// "No listing anywhere" is a signal because almost every printing is SOLD by the
// stores we scrape, so an absent listing means something. For a printing Riot
// never sells through retail at all, it means nothing — the page can never earn
// its way out of the empty bucket no matter how sought-after the card is.
//
// The Riftbound × T1 2025 Worlds Champion Collection (T1S) is the first of these:
// distributed by lottery on the Riot Merch Store, 10,125 copies per language,
// never stocked by a shop. Its six printings carry full card data, self-hosted
// art, rules text, our own editorial coverage and — via the name-matched
// "other printings" block — a live-priced retail sibling for four of the five
// champions. That is not a thin page; it is a page with no price, which is a
// different thing, and the page says so in its own words.
//
// WHY THIS ONE IS A HAND-MAINTAINED LIST when nothing else here is: "does a shop
// sell this" is a fact about the world, not about our data. No query we can run
// derives it, so it cannot be inferred — it has to be asserted, once, per
// collector product. Keep this list short and keep the bar high: a set belongs
// here only when it has NO retail distribution at all.
//
// The bar has two parts: a set code here is necessary but not sufficient —
// cardIsSubstantial() in card-price-state.ts also requires real rules text and real art, so a
// half-entered manual card still stays out of the index.
export interface NoRetailChannelProduct {
  /** The product as Riot names it. */
  product: string;
  /** How you get one, in a clause that reads inside a sentence. */
  distribution: string;
  /** Published print run per language edition. */
  copiesPerLanguage: number;
  /** Language editions produced, each with its own print run and numbering. */
  languages: string[];
  /** Top of the serial range printed on the one serialised card per box. */
  serialTop: number;
  /** Distinct champions sharing that serial range — copies-per-champion is the quotient. */
  cardsInSet: number;
  /** Published price of the headline edition, formatted. */
  price: string;
  /** Our own coverage, for the card page to link to. */
  articleSlug: string;
}

// The facts a card page needs to explain itself when it has no price. Kept here
// beside the predicate so "this set has no retail channel" and "here is why"
// cannot drift apart, and deliberately small: published figures only, no
// analysis (that lives in the article this points at).
export const NO_RETAIL_CHANNEL: Record<string, NoRetailChannelProduct> = {
  T1S: {
    product: "Riftbound × T1 2025 Worlds Champion Collection",
    distribution: "a drawing on the Riot Merch Store",
    copiesPerLanguage: 10_125,
    languages: ["English", "Chinese", "Korean"],
    serialTop: 2025,
    cardsInSet: 5,
    price: "US$360",
    articleSlug: "riftbound-t1-worlds-champion-collection",
  },
};

export const NO_RETAIL_CHANNEL_SETS: ReadonlySet<string> = new Set(Object.keys(NO_RETAIL_CHANNEL));

export function hasNoRetailChannel(setCode: string | null | undefined): boolean {
  return setCode != null && setCode in NO_RETAIL_CHANNEL;
}

export function noRetailChannelProduct(setCode: string | null | undefined): NoRetailChannelProduct | null {
  return setCode != null ? NO_RETAIL_CHANNEL[setCode] ?? null : null;
}

