// Deciding which eBay listing, if any, IS the product. Pure; the importer
// (lib/pokemon/ebay.ts) calls the Browse API and hands the results here.
//
// The asymmetry everything below is built on: a missed listing costs nothing
// (the product page still offers an eBay search), a wrong one puts a false
// "cheapest" price on the page. So a listing is accepted only when its title
// names this product's own words, the right product type, no OTHER set, no
// lot/empty/foreign/graded signal, and a price that is plausible against
// TCGplayer's market price. Pinned in tests/pokemon-ebay.test.ts.

import { foldName, type PkKind } from "./kinds";

/** Kinds whose cheapest eBay listing the importer tracks; every other kind gets a search link only. */
export const EBAY_TRACKED_KINDS: ReadonlySet<PkKind> = new Set<PkKind>([
  "booster-box",
  "etb",
  "pc-etb",
  "booster-bundle",
  "upc",
  "spc",
]);

/** The smallest price (USD cents) a real one of these has any business selling at. */
export const KIND_FLOOR_USD_CENTS: Partial<Record<PkKind, number>> = {
  "booster-box": 6000,
  etb: 2500,
  "pc-etb": 3500,
  "booster-bundle": 1500,
  upc: 6000,
  spc: 5000,
};

export interface EbayItemLite {
  title: string;
  priceCents: number;
  currency: string;
  /** Stated postage (0 = free), null when the listing states none. */
  shippingCents: number | null;
  url: string;
  locationCountry: string | null;
}

/** Narrow one Browse API item_summary to what matching needs. */
export function parseBrowseItem(it: any): EbayItemLite | null {
  const value = parseFloat(it?.price?.value);
  if (!it?.title || !Number.isFinite(value) || value <= 0) return null;
  const ship = it?.shippingOptions?.[0]?.shippingCost?.value;
  const shipNum = ship == null ? null : parseFloat(ship);
  return {
    title: String(it.title),
    priceCents: Math.round(value * 100),
    currency: String(it.price.currency ?? ""),
    shippingCents: shipNum == null || !Number.isFinite(shipNum) ? null : Math.round(shipNum * 100),
    url: String(it.itemWebUrl ?? it.itemAffiliateWebUrl ?? ""),
    locationCountry: it?.itemLocation?.country ?? null,
  };
}

const STOP = new Set([
  "pokemon", "tcg", "the", "and", "of", "a", "trading", "card", "cards", "game", "english", "new", "sealed",
  "factory", "set", "series",
]);
// Words that name the product TYPE, not this product: the kind rules check those.
const KIND_WORDS = new Set([
  "booster", "box", "boxes", "elite", "trainer", "etb", "bundle", "ultra", "super", "premium", "collection", "center",
  "half", "sleeved", "pack", "packs", "exclusive", "international", "version", "display", "upc", "spc",
]);

export function tokens(s: string, minLen = 3): string[] {
  return foldName(s)
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t && !STOP.has(t) && (t.length >= minLen || /\d/.test(t)));
}

/**
 * The words that make this product THIS product: "phantasmal flames", "151",
 * "mega charizard". Two-letter words count only when nothing longer is left
 * ("Pokémon GO Elite Trainer Box" → "go"), so a name is never reduced to no
 * words at all — which would match every listing of its kind.
 */
export function distinctiveTokens(productName: string): string[] {
  const noNotes = productName.replace(/\([^)]*\)/g, " ");
  const strict = tokens(noNotes).filter((t) => !KIND_WORDS.has(t));
  if (strict.length) return [...new Set(strict)];
  return [...new Set(tokens(noNotes, 2).filter((t) => !KIND_WORDS.has(t)))];
}

const SERIES_NAMES = ["mega evolution", "scarlet violet", "sword shield"];

/**
 * Does the title name a DIFFERENT set from the product's? Series names are
 * skipped: sellers write "Mega Evolution Phantasmal Flames", and "Mega
 * Evolution" is also ME01's own name.
 */
export function mentionsOtherSet(
  title: string,
  productName: string,
  ownSetName: string | null,
  setNames: readonly string[],
): boolean {
  const titleTokens = new Set(tokens(title, 2));
  // The product's own words AND its set's: "151 Booster Bundle" is filed under
  // "Scarlet & Violet 151", which sellers write out in full.
  const own = new Set([...distinctiveTokens(productName), ...(ownSetName ? distinctiveTokens(ownSetName) : [])]);
  for (const name of setNames) {
    if (name === ownSetName) continue;
    // Strict words only: "Pokémon GO" reduces to "go", far too common a word
    // to call a title another set's.
    const st = tokens(name).filter((t) => !KIND_WORDS.has(t));
    if (!st.length) continue;
    if (SERIES_NAMES.includes(st.join(" "))) continue;
    if (st.every((t) => own.has(t))) continue; // contained in the product's own name or set
    if (st.every((t) => titleTokens.has(t))) return true;
  }
  return false;
}

const KIND_REQUIRE: Partial<Record<PkKind, RegExp>> = {
  "booster-box": /\bbooster (?:box|display)\b/,
  etb: /\belite trainer box\b|\betb\b/,
  "pc-etb": /\belite trainer box\b|\betb\b/,
  "booster-bundle": /\bbooster bundle\b/,
  upc: /\bultra ?premium\b|\bupc\b/,
  spc: /\bsuper ?premium\b|\bspc\b/,
};
const POKEMON_CENTER = /\bpokemon ?center\b|\bpokecenter\b|\bpc\b/;
const KIND_FORBID: Partial<Record<PkKind, RegExp>> = {
  "booster-box": /\belite trainer\b|\betb\b|\bbooster bundle\b|\bsleeved\b|\bblister\b|\bbuild battle\b/,
  etb: POKEMON_CENTER,
  "booster-bundle": /\belite trainer\b|\betb\b|\bbooster box\b/,
};

// A listing that is not one sealed unit of the product. Any word here that the
// product's own name contains is ignored (a "Binder Collection" may say binder).
const JUNK: [string, RegExp][] = [
  ["empty", /\bempty\b|\bopened\b|\bunsealed\b|\bresealed\b|\bbox only\b|\bpackaging only\b|\bno (?:packs?|cards?|boosters?)\b/],
  ["lot", /\blot\b|\bjob ?lot\b|\bbundle of \d|\bset of \d|\b\d+ ?x\b|\bx ?\d+\b|\b[2-9] (?:boxes|etbs|bundles|units)\b|\bcase\b/],
  ["accessory", /\bsleeves? only\b|\bdividers?\b|\bplaymat\b|\bbinder\b|\bportfolio\b|\bacrylic\b|\bprotector\b|\bmagnetic\b|\bstand\b|\bsticker\b|\bcode cards?\b|\bdigital\b|\bpromo only\b|\bsingles?\b/],
  ["fake", /\bproxy\b|\bcustom\b|\breplica\b|\bfake\b|\bread description\b/],
  ["condition", /\bdamaged\b|\bdented\b|\bcrushed\b|\btorn\b/],
  ["graded", /\bpsa\b|\bcgc\b|\bbgs\b|\bgraded\b|\bslab\b/],
  [
    "language",
    /japanese|\bjapan\b|\bjp\b|\bjpn\b|korean|\bkr\b|chinese|simplified|\bthai\b|indonesian|german|deutsch|french|francais|italian|italiano|spanish|espanol|portugues|dutch|polish/,
  ],
];
const CJK = /[぀-ヿ㐀-鿿가-힯]/;

export interface MatchContext {
  productName: string;
  kind: PkKind;
  /** The product's own set's name, or null for a product outside an expansion. */
  setName: string | null;
  /** Every set name in the catalogue, for the other-set check. */
  setNames: readonly string[];
  /** TCGplayer market price converted to the listing's currency, when known. */
  refCents: number | null;
  /** KIND_FLOOR_USD_CENTS converted to the listing's currency. */
  floorCents: number;
  currency: string;
}

export type RejectReason =
  | "currency"
  | "no-pokemon"
  | "foreign"
  | "kind"
  | "product"
  | "other-set"
  | "floor"
  | (typeof JUNK)[number][0];

export function rejectReason(it: EbayItemLite, ctx: MatchContext): RejectReason | null {
  if (it.currency && it.currency !== ctx.currency) return "currency";
  const t = foldName(it.title).replace(/&/g, " ").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ");
  if (!/\bpokemon\b/.test(t)) return "no-pokemon";
  if (CJK.test(it.title) || it.locationCountry === "CN") return "foreign";
  const own = foldName(ctx.productName);
  for (const [why, re] of JUNK) {
    const m = re.exec(t);
    if (m && !own.includes(m[0].trim())) return why;
  }
  const req = KIND_REQUIRE[ctx.kind];
  if (!req || !req.test(t)) return "kind";
  if (ctx.kind === "pc-etb" && !POKEMON_CENTER.test(t)) return "kind";
  const forbid = KIND_FORBID[ctx.kind];
  if (forbid && forbid.test(t)) return "kind";
  const isHalf = /\bhalf\b/.test(own);
  if (ctx.kind === "booster-box" && isHalf !== /\bhalf\b/.test(t)) return "kind";
  const titleTokens = new Set(tokens(it.title, 2));
  if (!distinctiveTokens(ctx.productName).every((tok) => titleTokens.has(tok))) return "product";
  if (mentionsOtherSet(it.title, ctx.productName, ctx.setName, ctx.setNames)) return "other-set";
  const floor = Math.max(ctx.floorCents, ctx.refCents ? Math.round(ctx.refCents * 0.5) : 0);
  if (it.priceCents < floor) return "floor";
  return null;
}

const delivered = (it: EbayItemLite) => it.priceCents + (it.shippingCents ?? 0);

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * The cheapest accepted listing (by item + stated postage, so a $1 box with
 * $200 "postage" never wins), after dropping gross low outliers the way
 * lib/ebay.ts's pruneCheapOutliers does for Riftbound.
 */
export function bestEbayMatch(items: readonly EbayItemLite[], ctx: MatchContext): EbayItemLite | null {
  let ok = items.filter((it) => rejectReason(it, ctx) === null).sort((a, b) => delivered(a) - delivered(b));
  while (ok.length >= 4) {
    const med = median(ok.map(delivered));
    if (delivered(ok[0]) / med < 0.4) ok = ok.slice(1);
    else break;
  }
  return ok[0] ?? null;
}

export interface EbayPair {
  productId: number;
  market: string;
  /** Epoch ms of the last search, null if never searched. */
  lastChecked: number | null;
  /** Lower = sooner when equally due (newer sets first). */
  priority: number;
}

/** The day's work: never-searched pairs first, then the stalest, `budget` of them. */
export function pickEbayWork(pairs: readonly EbayPair[], budget: number): EbayPair[] {
  if (budget <= 0) return [];
  return [...pairs]
    .sort(
      (a, b) =>
        (a.lastChecked ?? -1) - (b.lastChecked ?? -1) || a.priority - b.priority || a.productId - b.productId || a.market.localeCompare(b.market),
    )
    .slice(0, budget);
}

/**
 * How many Browse calls this run may make. Riftbound owns the shared 5,000/day
 * quota (lib/ebay.ts primeEbayBudget): Pokémon spends at most `cap`, and only
 * what is left above a reserve that covers Riftbound's own next run.
 */
export function pokemonEbayBudget(remaining: number | null, cap: number, reserve: number): number {
  if (remaining == null) return 0; // unknown quota: never guess against Riftbound's runs
  return Math.max(0, Math.min(cap, remaining - reserve));
}
