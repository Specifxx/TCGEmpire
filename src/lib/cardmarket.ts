// Cardmarket as an EU/UK price source (singles) and an EU sealed source —
// fully automated, zero required configuration. Runs on the normal price-
// refresh schedule alongside every other source.
//
// ─────────────────────────────────────────────────────────────────────────────
// TWO THINGS USED TO GATE THIS, BOTH NOW RESOLVED.
// ─────────────────────────────────────────────────────────────────────────────
//
//   1. LEGAL GATE — RESOLVED 2026-09-04. Cardmarket's Terms require their prior
//      written agreement to present their price data, and this module stayed
//      off until that agreement existed. It now does: David, Cardmarket
//      Support Team Lead, in direct response to a request to use the public
//      price-guide and product-catalogue downloads for exactly this purpose —
//
//        "The price guide and product catalogue files are publicly available
//        (https://www.cardmarket.com/en/Riftbound/Data), so you do not need
//        access to our API to use them. You can download the data on demand
//        and use it however you see fit."
//
//      A partnership/affiliate arrangement is separately "subject to approval"
//      (contact Tracy Rutkowski, Head of Marketing, for that) — irrelevant to
//      this module, which only reads the public files.
//
//   2. THE DATA CONTRACT — VERIFIED 2026-09-04, LIVE, NOT FROM DOCUMENTATION.
//      www.cardmarket.com itself sits behind a Cloudflare WAF that hard-403s
//      every automated client, and that is UNCHANGED and NOT what this module
//      talks to. The actual download files are served from a SEPARATE, public,
//      unauthenticated CDN — no login, no API key, no browser impersonation:
//
//        https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_22.json
//        https://downloads.s3.cardmarket.com/productCatalog/productList/products_nonsingles_22.json
//        https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_22.json
//
//      (22 is Riftbound's Cardmarket game id.) Confirmed reachable with a
//      plain unauthenticated `fetch` (HTTP 200/206, `server: AmazonS3`, `via:
//      … CloudFront`) — every OTHER plausible path under this bucket
//      (expansions/games lists, alternate price-guide names, …) answers a
//      bucket-policy `AccessDenied`, so this is genuinely the full extent of
//      what is publicly reachable, not an incomplete guess. Both are JSON, not
//      CSV — the old CSV/dual-vocabulary handling in this file described a
//      format that does not exist and has been removed.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE REAL SCHEMA, AND THE ONE GENUINE LIMITATION IT HAS.
// ─────────────────────────────────────────────────────────────────────────────
// Product list: `{ version, createdAt, products: [{ idProduct, name,
// idCategory, categoryName, idExpansion, idMetacard, dateAdded }] }`. Price
// guide: `{ version, createdAt, priceGuides: [{ idProduct, idCategory, avg,
// low, trend, avg1, avg7, avg30, "avg-foil", "low-foil", "trend-foil", … }] }`
// — floats, already in EUR, joined on idProduct.
//
// NEITHER FILE CARRIES A COLLECTOR NUMBER. This is exactly what the support
// reply warned about ("not every piece of information you might expect in the
// files is included" — these downloads used to be richer API fields). Two
// consequences, both handled below rather than guessed past:
//
//   • idExpansion is a bare numeric id with NO name attached anywhere public
//     (every expansions/games-list URL guess 403s). inferExpansionSetCodes()
//     below discovers the idExpansion → our setCode mapping at RUN TIME by
//     matching each expansion's product names against our own card catalogue
//     — never a hardcoded guess. This is deliberate, not just cautious: a
//     hand-picked mapping was checked against the real chronological release
//     order (Origins, Origins: Proving Grounds, Spirit Forged, Unleashed,
//     Vendetta) and nearly got Spirit Forged and Unleashed backwards, because
//     Cardmarket's numeric ids are chronological but the raw product/print
//     counts per expansion don't line up cleanly with either set's total —
//     the two ARE distinguishable, but only by their actual card names, which
//     is exactly what this function checks instead of trusting a guess.
//   • A card with an alt-art / over-numbered / signature counterpart shares
//     its exact name with that counterpart (confirmed against our own data —
//     e.g. "Ahri, Nine-Tailed Fox" is one card family, several prints), and
//     Cardmarket lists each PRINT as a separate idProduct with nothing to
//     distinguish which is which. Matching by name can't tell them apart
//     either. buildCardmarketRows() skips these entirely — "understated,
//     never wrong", the same trade-off box-ev.ts makes for unpriced cards.
//
// ─────────────────────────────────────────────────────────────────────────────
// RECOVERING THE CHASE PRINTS: buildCardmarketRankedRows() (2026-09-04).
// ─────────────────────────────────────────────────────────────────────────────
// The strict pass above skips every print family with a sibling — which means
// it skips exactly the signature/over-numbered/alt-art cards this site's
// visitors most want a price for. That's a real gap, and it's closeable: for
// an ambiguous family, we independently know two orderings that SHOULD agree —
//   • OUR side: `poolOf()` (lib/box-ev.ts, the same classifier the box-EV
//     calculator trusts) ranks each of our candidate cards by real Riot pull
//     rate — base rarity, then Alt Art (1-in-12), then Over-numbered (1-in-72),
//     then Signature (1-in-720) — POOL_ORDER's own order.
//   • CARDMARKET'S side: sorting that family's products by LOW price ascending.
// Rarer print → pricier print is not a certainty for any ONE card, but real
// data backs it as a strong pattern: a genuine 3-print family pulled from the
// live catalogue during review priced at €0.02 / €37.99 / €380 — a ~1,900×
// then ~10× jump, not a close call. So this is a deliberate, narrow exception
// to "never guess", gated by THREE independent checks, ALL required:
//   1. GROUP SIZES MUST MATCH EXACTLY — our candidate count for (set, name)
//      must equal Cardmarket's product count for (expansion, name). A mismatch
//      means one side has catalogued something the other hasn't; abort rather
//      than force an uneven zip.
//   2. EVERY CANDIDATE MUST CLASSIFY — if poolOf() can't place one of our
//      candidates (a promo, an unparseable number), the whole family aborts
//      rather than rank around a hole.
//   3. EVERY ADJACENT PRICE STEP MUST CLEAR RANK_MIN_STEP — if any two
//      consecutive ranks are priced too close together, the ordering isn't
//      trustworthy for THIS family; abort that family specifically rather
//      than force a guess onto near-identical prices. A quiet, cheap chase
//      print (low demand keeping it near its neighbour) fails this check and
//      is correctly left unpriced, same as before.
// Rows built this way carry the SAME fallback treatment as every other
// Cardmarket row (never a headline "from" price, always labelled as a
// reference) PLUS an explicit provenance marker in `title` — ranked by price
// within its family, not matched against one specific verified listing — so
// the distinction survives into the data, not just this comment. Independent
// kill switch: CARDMARKET_RANKED_DISABLED turns off only this pass, leaving
// the strict, ambiguity-free matching above untouched.
//
// ─────────────────────────────────────────────────────────────────────────────
// HOW IT'S SURFACED.
// ─────────────────────────────────────────────────────────────────────────────
// Singles: writes one `cardmarket` (UK, EUR→GBP converted) and one
// `cardmarket_eu` (EU, native EUR) RetailerPrice row per matched card, from
// the LOW (lowest current non-foil listing) price. Both are MARKETPLACE
// aggregates across many EU sellers, not a single verified in-stock SKU — so
// both stay FALLBACK sources (UK_FALLBACK_RETAILERS / EU_FALLBACK_RETAILERS):
// neither ever undercuts a genuine local listing for the headline "from"
// price, and both are hidden from the breakdown whenever a real listing
// exists.
//
// Sealed (boosters/displays/champion decks/box sets): writes `cardmarket`
// SealedListing rows for the EU market only, native EUR, no UK conversion —
// unlike singles' fallback treatment, sealed products have no equivalent
// "never undercut a real listing" mechanism in SealedListing today, so this
// stays scoped to the one market where Cardmarket's figure needs no
// conversion at all rather than introducing that concept for a first pass.
// Cardmarket's own "RB Set" category (e.g. "Origins: Common Set") is
// deliberately EXCLUDED — those are marketplace bundles of loose singles a
// seller assembled, not a Riot-manufactured sealed product, and don't belong
// next to a real Booster Box or Champion Deck.
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { gunzipSync } from "node:zlib";
import { readFile } from "node:fs/promises";
import { CARDMARKET_EU_RETAILER, CARDMARKET_RETAILER } from "@/lib/constants";
import { classifySealed } from "@/lib/sealed-import";
import { poolOf, POOL_ORDER, type PoolCard } from "@/lib/box-ev";

// ---- configuration ----------------------------------------------------------
// Riftbound's Cardmarket game id — see the header for how these three URLs
// were found and verified. All three are overridable (a wrong id, a moved
// bucket path, or a local file for testing) without a code change.
//
// `|| `, NOT `??` — GitHub Actions sets an env var to the EMPTY STRING when
// the repo variable behind it (${{ vars.X }}) doesn't exist, rather than
// leaving it unset. `??` only falls through on null/undefined, so it doesn't
// catch that — the very first live run after this shipped hit exactly this:
// every CARDMARKET_*_URL resolved to "", readJson("") tried to open "" as a
// local file, and Cardmarket wrote zero rows in production. `||` treats ""
// the same as unset, which is what "optional override" is supposed to mean.
const CARDMARKET_GAME_ID = 22;
const PRODUCTLIST_SINGLES_URL =
  process.env.CARDMARKET_PRODUCTLIST_URL ||
  `https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_${CARDMARKET_GAME_ID}.json`;
const PRODUCTLIST_NONSINGLES_URL =
  process.env.CARDMARKET_PRODUCTLIST_NONSINGLES_URL ||
  `https://downloads.s3.cardmarket.com/productCatalog/productList/products_nonsingles_${CARDMARKET_GAME_ID}.json`;
const PRICEGUIDE_URL =
  process.env.CARDMARKET_PRICEGUIDE_URL ||
  `https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_${CARDMARKET_GAME_ID}.json`;

// ---- feature flag -------------------------------------------------------------
// Opt-OUT, not opt-in — unlike CARDTRADER_API_TOKEN, there is no credential to
// possess or withhold: the URLs above are public defaults that work with zero
// configuration. CARDMARKET_DISABLED is the kill switch if this source ever
// needs to be turned off without touching code (a data-quality problem, or if
// Cardmarket ever asks us to stop).
export function isCardmarketEnabled(): boolean {
  return process.env.CARDMARKET_DISABLED !== "true";
}

/** Independent kill switch for JUST the ranked/heuristic pass — see header. */
export function isCardmarketRankingEnabled(): boolean {
  return process.env.CARDMARKET_RANKED_DISABLED !== "true";
}

// EUR→GBP rate for the UK singles conversion. Like USD_TO_GBP in tcgplayer.ts
// this is a hand-set reference rate (exact FX isn't critical for a
// "from"/reference figure). Override with CARDMARKET_EUR_TO_GBP to refresh
// without a deploy. `||`, not `??` — see PRODUCTLIST_SINGLES_URL's comment
// above: an empty-string env var (Actions' shape for an unset repo variable)
// would otherwise make this Number("") === 0, silently zeroing every UK price.
export const EUR_TO_GBP = Number(process.env.CARDMARKET_EUR_TO_GBP || "0.86");

// ---- the wire schema, verified live 2026-09-04 (see header) -------------------
export interface CardmarketProduct {
  idProduct: number;
  name: string;
  idCategory: number;
  categoryName: string;
  idExpansion: number;
  /** Groups every PRINT of the same card family together — see header. */
  idMetacard: number;
  dateAdded: string;
}
export interface CardmarketPriceEntry {
  idProduct: number;
  idCategory: number;
  low: number | null;
  avg: number | null;
  trend: number | null;
}

// Category ids, read straight off the real files (categoryName is present per
// product too, but the numeric id is stable across a name Cardmarket could
// reword). SEALED_CATEGORIES deliberately excludes 1658 "RB Set" — see header.
const SINGLE_CATEGORY = 1655; // "Riftbound Single"
const SEALED_CATEGORIES = new Set([
  1656, // "Riftbound Booster"
  1657, // "Riftbound Display"
  1659, // "Riftbound Champion Decks"
  1660, // "Riftbound Riftbound Box Sets"
]);

// Normalise a card/product name for matching: lowercase, drop punctuation,
// collapse whitespace. Same spirit as every other importer's normaliser.
function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// ---- expansion → set-code inference (see header for why this exists) ---------

export interface ExpansionMapping {
  idExpansion: number;
  setCode: string;
  /** Fraction of the expansion's distinct product names found in this set. */
  confidence: number;
  /** How many distinct product names this expansion carries — for logging. */
  sampleSize: number;
}

// A mapping is only trusted when it is BOTH a strong absolute match and a
// clear winner over every other set — either alone would accept a coincidence
// (a small promo bucket sharing a few champion names with several sets, or a
// genuinely mixed bucket splitting close to evenly).
const CONFIDENCE_MIN = 0.8;
const MARGIN_MIN = 1.5;

export function inferExpansionSetCodes(
  products: readonly CardmarketProduct[],
  ourCardNamesBySet: ReadonlyMap<string, ReadonlySet<string>>,
): ExpansionMapping[] {
  const namesByExpansion = new Map<number, Set<string>>();
  for (const p of products) {
    if (p.idCategory !== SINGLE_CATEGORY) continue;
    const set = namesByExpansion.get(p.idExpansion) ?? new Set<string>();
    set.add(normName(p.name));
    namesByExpansion.set(p.idExpansion, set);
  }

  const mappings: ExpansionMapping[] = [];
  for (const [idExpansion, names] of namesByExpansion) {
    if (names.size === 0) continue;
    const scored = [...ourCardNamesBySet.entries()]
      .map(([setCode, ourNames]) => {
        let hits = 0;
        for (const n of names) if (ourNames.has(n)) hits++;
        return { setCode, hits };
      })
      .sort((a, b) => b.hits - a.hits);
    const [best, second] = scored;
    if (!best || best.hits === 0) continue;
    const confidence = best.hits / names.size;
    if (confidence < CONFIDENCE_MIN) continue;
    if (second && second.hits > 0 && best.hits < second.hits * MARGIN_MIN) continue;
    mappings.push({ idExpansion, setCode: best.setCode, confidence, sampleSize: names.size });
  }
  return mappings;
}

// ---- fetching -------------------------------------------------------------
// Plain, unauthenticated `fetch` — no browser impersonation, no headers meant
// to defeat a block. These URLs are a public CDN, not the Cloudflare-guarded
// www.cardmarket.com (see header); if that ever changes and one of them starts
// 403ing, the correct fix is to find the new real endpoint, never to disguise
// the client. A LOCAL FILE PATH also works (anything not starting with
// http(s):// is read from disk) for testing or a manual override.
async function readJson<T>(source: string): Promise<T> {
  const buf = /^https?:\/\//i.test(source)
    ? await fetchRemote(source)
    : await readFile(source);
  const isGzip = buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b;
  const text = (isGzip ? gunzipSync(buf) : buf).toString("utf8");
  return JSON.parse(text) as T;
}

async function fetchRemote(url: string): Promise<Buffer> {
  const res = await fetch(url, { headers: { Accept: "application/json,*/*" } });
  if (!res.ok) {
    throw new Error(`Cardmarket read ${res.status} for ${url}: ${(await res.text()).slice(0, 160)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

// ---- singles: RetailerPrice ----------------------------------------------

export type CardmarketMatch = {
  totalSingleProducts: number;
  expansionsMapped: number;
  matched: number;
  skippedAmbiguousName: number;
  skippedUnmappedExpansion: number;
  skippedNoPrice: number;
  rows: Prisma.RetailerPriceCreateManyInput[];
  unmatchedSamples: string[];
};

/**
 * Pure builder (no network, no DB writes) so it can be dry-run + unit-tested:
 * given the parsed product list, price guide and our own cards, produce the
 * singles RetailerPrice rows. See the file header for the matching rules.
 */
export function buildCardmarketRows(
  cards: { id: string; setCode: string; name: string; nameNormalized: string }[],
  products: readonly CardmarketProduct[],
  prices: readonly CardmarketPriceEntry[],
): CardmarketMatch {
  const ourNamesBySet = new Map<string, Set<string>>();
  const ourCountByKey = new Map<string, number>();
  const ourIdByKey = new Map<string, string>();
  for (const c of cards) {
    const nn = c.nameNormalized || normName(c.name);
    const namesSet = ourNamesBySet.get(c.setCode) ?? new Set<string>();
    namesSet.add(nn);
    ourNamesBySet.set(c.setCode, namesSet);
    const key = `${c.setCode}|${nn}`;
    ourCountByKey.set(key, (ourCountByKey.get(key) ?? 0) + 1);
    ourIdByKey.set(key, c.id);
  }

  const expansionSetCode = new Map(
    inferExpansionSetCodes(products, ourNamesBySet).map((m) => [m.idExpansion, m.setCode]),
  );

  const cmCountByKey = new Map<string, number>();
  for (const p of products) {
    if (p.idCategory !== SINGLE_CATEGORY) continue;
    const key = `${p.idExpansion}|${normName(p.name)}`;
    cmCountByKey.set(key, (cmCountByKey.get(key) ?? 0) + 1);
  }

  const priceByProduct = new Map<number, CardmarketPriceEntry>();
  for (const pr of prices) priceByProduct.set(pr.idProduct, pr);

  const rows: Prisma.RetailerPriceCreateManyInput[] = [];
  const seen = new Set<string>();
  const unmatchedSamples: string[] = [];
  let matched = 0;
  let skippedAmbiguousName = 0;
  let skippedUnmappedExpansion = 0;
  let skippedNoPrice = 0;
  let totalSingleProducts = 0;

  for (const p of products) {
    if (p.idCategory !== SINGLE_CATEGORY) continue;
    totalSingleProducts++;

    const setCode = expansionSetCode.get(p.idExpansion);
    if (!setCode) { skippedUnmappedExpansion++; continue; }

    const nn = normName(p.name);
    const cmKey = `${p.idExpansion}|${nn}`;
    const ourKey = `${setCode}|${nn}`;
    // Ambiguous on EITHER side (a print family, not a single unique card) —
    // see header for why this must be skipped rather than guessed.
    if ((cmCountByKey.get(cmKey) ?? 0) > 1 || (ourCountByKey.get(ourKey) ?? 0) !== 1) {
      skippedAmbiguousName++;
      continue;
    }

    const pg = priceByProduct.get(p.idProduct);
    const lowEur = pg?.low;
    if (lowEur == null || !(lowEur > 0)) {
      skippedNoPrice++;
      if (unmatchedSamples.length < 25) unmatchedSamples.push(`${p.name} (expansion ${p.idExpansion}) — no LOW price`);
      continue;
    }

    const cardId = ourIdByKey.get(ourKey)!;
    matched++;
    const dedupe = `${cardId}|false`;
    if (seen.has(dedupe)) continue; // one row per card (unique key)
    seen.add(dedupe);
    const url = cardmarketProductUrl(p.idProduct);
    const base = {
      cardId,
      retailerName: "Cardmarket",
      title: p.name,
      url,
      condition: "NM",
      isFoil: false,
      inStock: true,
    };
    // UK: an EUR→GBP CONVERSION of a European marketplace aggregate. A
    // reference, never a buyable UK listing — see UK_FALLBACK_RETAILERS.
    rows.push({ ...base, retailer: CARDMARKET_RETAILER, priceCents: Math.round(lowEur * EUR_TO_GBP * 100), currency: "GBP", country: "UK" });
    // EU: the SAME number, unconverted — Cardmarket quotes in euro and the EU
    // market prices in euro, so this is the one source with no FX rate in the
    // middle. Still a fallback (EU_FALLBACK_RETAILERS): a marketplace
    // aggregate must never undercut a real EU store's in-stock listing.
    rows.push({ ...base, retailer: CARDMARKET_EU_RETAILER, priceCents: Math.round(lowEur * 100), currency: "EUR", country: "EU" });
  }
  return { totalSingleProducts, expansionsMapped: expansionSetCode.size, matched, skippedAmbiguousName, skippedUnmappedExpansion, skippedNoPrice, rows, unmatchedSamples };
}

// The download files carry no canonical product URL; build one from the id.
function cardmarketProductUrl(idProduct: number): string {
  return `https://www.cardmarket.com/en/Riftbound/Products/Singles?idProduct=${idProduct}`;
}

// ---- singles, tier 2: ambiguous families recovered by price rank -----------
// See the file header ("RECOVERING THE CHASE PRINTS") for the full rationale
// and the three gates every family must clear.

export interface CardmarketRankableCard extends PoolCard {
  id: string;
  setCode: string;
  name: string;
  nameNormalized: string;
}

export type CardmarketRankedMatch = {
  /** Ambiguous families with matching group sizes on both sides — the candidate pool. */
  familiesConsidered: number;
  /** Of those, how many cleared every gate and got ranked. */
  familiesRanked: number;
  rows: Prisma.RetailerPriceCreateManyInput[];
};

// Every adjacent rank must be at least this many times pricier than the rank
// below it. €0.02/€37.99/€380 (a real family pulled during review) clears this
// with enormous room; the point is to reject the close calls, not this one.
const RANK_MIN_STEP = 2;

export function buildCardmarketRankedRows(
  cards: readonly CardmarketRankableCard[],
  products: readonly CardmarketProduct[],
  prices: readonly CardmarketPriceEntry[],
): CardmarketRankedMatch {
  const ourNamesBySet = new Map<string, Set<string>>();
  const ourGroups = new Map<string, CardmarketRankableCard[]>();
  for (const c of cards) {
    const nn = c.nameNormalized || normName(c.name);
    const namesSet = ourNamesBySet.get(c.setCode) ?? new Set<string>();
    namesSet.add(nn);
    ourNamesBySet.set(c.setCode, namesSet);
    const key = `${c.setCode}|${nn}`;
    const g = ourGroups.get(key) ?? [];
    g.push(c);
    ourGroups.set(key, g);
  }

  const expansionSetCode = new Map(
    inferExpansionSetCodes(products, ourNamesBySet).map((m) => [m.idExpansion, m.setCode]),
  );

  const cmGroups = new Map<string, CardmarketProduct[]>();
  for (const p of products) {
    if (p.idCategory !== SINGLE_CATEGORY) continue;
    const key = `${p.idExpansion}|${normName(p.name)}`;
    const g = cmGroups.get(key) ?? [];
    g.push(p);
    cmGroups.set(key, g);
  }

  const priceByProduct = new Map<number, CardmarketPriceEntry>();
  for (const pr of prices) priceByProduct.set(pr.idProduct, pr);

  const rows: Prisma.RetailerPriceCreateManyInput[] = [];
  let familiesConsidered = 0;
  let familiesRanked = 0;

  for (const [cmKey, cmProducts] of cmGroups) {
    if (cmProducts.length < 2) continue; // the unambiguous case is buildCardmarketRows()'s job
    const idExpansion = Number(cmKey.slice(0, cmKey.indexOf("|")));
    const setCode = expansionSetCode.get(idExpansion);
    if (!setCode) continue;

    const nn = normName(cmProducts[0].name);
    const ourCandidates = ourGroups.get(`${setCode}|${nn}`);
    // GATE 1: group sizes must match exactly.
    if (!ourCandidates || ourCandidates.length !== cmProducts.length) continue;
    familiesConsidered++;

    // GATE 2: every candidate must classify to a real pool.
    const ranked = ourCandidates
      .map((card) => ({ card, pool: poolOf(card) }))
      .sort((a, b) => (a.pool ? POOL_ORDER.indexOf(a.pool) : -1) - (b.pool ? POOL_ORDER.indexOf(b.pool) : -1));
    if (ranked.some((r) => r.pool == null)) continue;

    const priced = cmProducts
      .map((product) => ({ product, low: priceByProduct.get(product.idProduct)?.low ?? null }))
      .sort((a, b) => (a.low ?? Infinity) - (b.low ?? Infinity));
    if (priced.some((r) => r.low == null || !(r.low > 0))) continue; // every member needs a real price

    // GATE 3: every adjacent step must clear RANK_MIN_STEP.
    let stepsOk = true;
    for (let i = 1; i < priced.length; i++) {
      if (priced[i].low! < priced[i - 1].low! * RANK_MIN_STEP) { stepsOk = false; break; }
    }
    if (!stepsOk) continue;

    familiesRanked++;
    for (let i = 0; i < ranked.length; i++) {
      const cardId = ranked[i].card.id;
      const lowEur = priced[i].low!;
      const product = priced[i].product;
      const base = {
        cardId,
        retailerName: "Cardmarket",
        // Provenance stays in the data, not just this file's comments — see header.
        title: `${product.name} — ranked ${i + 1}/${cmProducts.length} by price within its print family (not matched to a specific listing)`,
        url: cardmarketProductUrl(product.idProduct),
        condition: "NM",
        isFoil: false,
        inStock: true,
      };
      rows.push({ ...base, retailer: CARDMARKET_RETAILER, priceCents: Math.round(lowEur * EUR_TO_GBP * 100), currency: "GBP", country: "UK" });
      rows.push({ ...base, retailer: CARDMARKET_EU_RETAILER, priceCents: Math.round(lowEur * 100), currency: "EUR", country: "EU" });
    }
  }

  return { familiesConsidered, familiesRanked, rows };
}

/** Replace all Cardmarket singles rows with a fresh pull. Isolated try/catch lives in the caller. */
export async function refreshCardmarketPrices(): Promise<{ skipped: boolean; written: number; reason?: string }> {
  if (!isCardmarketEnabled()) return { skipped: true, written: 0, reason: "CARDMARKET_DISABLED=true" };

  const [products, priceGuide] = await Promise.all([
    readJson<{ products: CardmarketProduct[] }>(PRODUCTLIST_SINGLES_URL),
    readJson<{ priceGuides: CardmarketPriceEntry[] }>(PRICEGUIDE_URL),
  ]);
  const cards = await prisma.card.findMany({
    select: {
      id: true, setCode: true, name: true, nameNormalized: true,
      collectorNumber: true, rarity: true, variant: true, isOvernumbered: true, isPromo: true,
    },
  });

  const m = buildCardmarketRows(cards, products.products, priceGuide.priceGuides);
  console.log(
    `Cardmarket singles: ${m.totalSingleProducts} products, ${m.expansionsMapped} expansions mapped, ` +
      `${m.matched} matched (${m.rows.length} rows), ${m.skippedAmbiguousName} ambiguous, ` +
      `${m.skippedUnmappedExpansion} unmapped-expansion, ${m.skippedNoPrice} no-price.`,
  );
  if (m.unmatchedSamples.length) console.log(`Cardmarket unmatched (sample): ${m.unmatchedSamples.slice(0, 8).join(" | ")}`);

  // Tier 2: recover chase prints the strict pass above had to skip — see the
  // "RECOVERING THE CHASE PRINTS" header section. Independently switchable.
  let rankedRows: Prisma.RetailerPriceCreateManyInput[] = [];
  if (isCardmarketRankingEnabled()) {
    const ranked = buildCardmarketRankedRows(cards, products.products, priceGuide.priceGuides);
    rankedRows = ranked.rows;
    console.log(`Cardmarket ranked (chase prints): ${ranked.familiesConsidered} ambiguous families sized-matched, ${ranked.familiesRanked} ranked (${ranked.rows.length} rows).`);
  }

  const allRows = [...m.rows, ...rankedRows];
  if (allRows.length === 0) {
    console.warn("Cardmarket singles: 0 rows built — keeping existing rows.");
    return { skipped: false, written: 0, reason: "0 rows built" };
  }

  await prisma.retailerPrice.deleteMany({ where: { retailer: { in: [CARDMARKET_RETAILER, CARDMARKET_EU_RETAILER] } } });
  await prisma.retailerPrice.createMany({ data: allRows });
  return { skipped: false, written: allRows.length };
}

// ---- sealed: SealedListing --------------------------------------------------

export type CardmarketSealedMatch = {
  total: number;
  matched: number;
  rows: Prisma.SealedListingCreateManyInput[];
};

/**
 * Pure builder for sealed products (boosters/displays/champion decks/box
 * sets) — same expansion mapping as singles, no ambiguity problem (sealed
 * products don't have alt-art siblings), so every mapped-expansion product
 * with a LOW price gets a row. "RB Set" (bulk rarity bundles, not a real
 * product) is excluded via SEALED_CATEGORIES before this ever sees them.
 */
export function buildCardmarketSealedRows(
  cardsForMapping: { id: string; setCode: string; name: string; nameNormalized: string }[],
  singleProducts: readonly CardmarketProduct[],
  sealedProducts: readonly CardmarketProduct[],
  prices: readonly CardmarketPriceEntry[],
): CardmarketSealedMatch {
  const ourNamesBySet = new Map<string, Set<string>>();
  for (const c of cardsForMapping) {
    const nn = c.nameNormalized || normName(c.name);
    const set = ourNamesBySet.get(c.setCode) ?? new Set<string>();
    set.add(nn);
    ourNamesBySet.set(c.setCode, set);
  }
  const expansionSetCode = new Map(
    inferExpansionSetCodes(singleProducts, ourNamesBySet).map((m) => [m.idExpansion, m.setCode]),
  );

  const priceByProduct = new Map<number, CardmarketPriceEntry>();
  for (const pr of prices) priceByProduct.set(pr.idProduct, pr);

  const rows: Prisma.SealedListingCreateManyInput[] = [];
  let total = 0;
  let matched = 0;
  for (const p of sealedProducts) {
    if (!SEALED_CATEGORIES.has(p.idCategory)) continue;
    total++;
    const lowEur = priceByProduct.get(p.idProduct)?.low;
    if (lowEur == null || !(lowEur > 0)) continue;
    const setCode = expansionSetCode.get(p.idExpansion) ?? null;
    const type = classifySealed(p.name);
    const groupKey = setCode ? `${setCode}|${type}` : normName(p.name).replace(/\s+/g, "").slice(0, 40);
    matched++;
    rows.push({
      groupKey,
      title: p.name,
      productType: type,
      setCode,
      retailer: CARDMARKET_RETAILER,
      retailerName: "Cardmarket",
      priceCents: Math.round(lowEur * 100),
      url: cardmarketProductUrl(p.idProduct),
      imageUrl: null,
      country: "EU",
      inStock: true,
    });
  }
  return { total, matched, rows };
}

/** Replace all Cardmarket sealed rows with a fresh pull. Isolated try/catch lives in the caller. */
export async function refreshCardmarketSealed(): Promise<{ skipped: boolean; written: number; reason?: string }> {
  if (!isCardmarketEnabled()) return { skipped: true, written: 0, reason: "CARDMARKET_DISABLED=true" };

  const [singles, nonsingles, priceGuide] = await Promise.all([
    readJson<{ products: CardmarketProduct[] }>(PRODUCTLIST_SINGLES_URL),
    readJson<{ products: CardmarketProduct[] }>(PRODUCTLIST_NONSINGLES_URL),
    readJson<{ priceGuides: CardmarketPriceEntry[] }>(PRICEGUIDE_URL),
  ]);
  const cards = await prisma.card.findMany({ select: { id: true, setCode: true, name: true, nameNormalized: true } });

  const m = buildCardmarketSealedRows(cards, singles.products, nonsingles.products, priceGuide.priceGuides);
  console.log(`Cardmarket sealed: ${m.total} products, ${m.matched} matched.`);
  if (m.rows.length === 0) {
    console.warn("Cardmarket sealed: 0 rows built — keeping existing rows.");
    return { skipped: false, written: 0, reason: "0 rows built" };
  }

  await prisma.sealedListing.deleteMany({ where: { retailer: CARDMARKET_RETAILER } });
  await prisma.sealedListing.createMany({ data: m.rows });
  return { skipped: false, written: m.rows.length };
}
