// TCGplayer as a US price source.
//
// TCGplayer is the dominant US marketplace, so its prices belong in the US (and a
// GBP-converted UK reference) comparison. We record each product's MARKET PRICE — the
// English fair-market value TCGplayer headlines — NOT the lowest listing. The lowest
// listing is frequently a foreign-language (Simplified Chinese) copy that a seller
// listed under the English product; TCGplayer's search preview tags every listing
// with the product LINE's language (English), so they can't be filtered per-listing,
// and that cheap Chinese listing was leaking in as our "cheapest" (the Dazzling Aurora
// bug). Market price sidesteps that entirely. On top of it we drop obviously foreign
// products and, when an English + Chinese print share a collector number, keep the one
// with the higher market price (the English print).
//
// Data comes from TCGplayer's public search API (the same endpoint the website
// uses). Products are matched to our cards by collector number + set, reusing
// the importer's exact numKey/setFromTotal logic so a Signature/alt-art print is
// never collapsed onto its base card.
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { TCGPLAYER_AU_RETAILER,
  TCGPLAYER_CA_RETAILER, TCGPLAYER_SG_RETAILER, TCGPLAYER_UK_RETAILER } from "@/lib/constants";
import { USD_TO } from "@/lib/fx";
import { isForeignLanguageTitle } from "@/lib/scrape-http";

const SEARCH_URL = "https://mp-search-api.tcgplayer.com/v1/search/request?q=&isList=false";
const PRODUCT_LINE = "riftbound-league-of-legends-trading-card-game";
const PAGE_SIZE = 50;

// Mirror of price-import.ts numKey: strip leading zeros, lowercase any letter
// suffix, and mark a Signature print ("*") with a trailing "s" so 223*/221 and
// 223/221 stay distinct. Exported so scripts share ONE implementation — private
// copies in scripts/ silently drifted (that's how VEN went missing from the
// script's setFromTotal and Vendetta variants stopped being created).
export function numKey(seg: string): string {
  const m = seg.match(/^0*(\d+)([a-z]*)/i);
  const base = m ? m[1] + m[2].toLowerCase() : seg.toLowerCase();
  return seg.includes("*") ? `${base}s` : base;
}

// Set code from the "/NNN" denominator (authoritative, prevents cross-set bleed).
export function setFromTotal(total?: string): string | null {
  switch (parseInt(total ?? "", 10)) {
    case 298: return "OGN";
    case 221: return "SFD";
    case 219: return "UNL";
    case 24: return "OGS";
    case 166: return "VEN";
    default: return null;
  }
}

// Set code from a TCGplayer setName — the ONLY set signal for printings whose
// collector number doesn't carry a "/NNN" denominator. That's the whole rune
// cycle from SFD onward: they're numbered "R01".."R06" (plus "a"/"b" Showcase
// variants like "R04a"/"R06b") with no set in the number, and the same R-number
// is reused by every set, so the number alone is ambiguous and name alone is too
// ("Mind Rune" exists in every set). setName disambiguates both.
export function setCodeFromSetName(setName?: string): string | null {
  const s = (setName ?? "").toLowerCase();
  if (/proving\s*grounds/.test(s)) return "OGS";
  if (/spiritforged|spirit\s*forged/.test(s)) return "SFD";
  if (/unleashed/.test(s)) return "UNL";
  if (/vendetta/.test(s)) return "VEN";
  // Pokémon's "Astral Radiance" reaches this function too (the sealed importer
  // shares it), and it must never be typed as Riftbound's Radiance — see
  // FOREIGN_RADIANCE in lib/sealed-import.ts, which drops those titles outright.
  // Excluded here as well so the set signal is wrong in neither layer.
  if (/radiance/.test(s) && !/astral/.test(s)) return "RAD";
  if (/origins/.test(s)) return "OGN";
  return null;
}

// True for a collector number that carries no set information of its own — i.e.
// anything without a "/NNN" denominator we recognise ("R04a", "NN1", "WB25").
// These can only be placed with an external set signal (see setCodeFromSetName).
export function isSetlessNumber(collectorNumber: string): boolean {
  const total = collectorNumber.split("/")[1];
  return setFromTotal(total) == null;
}

// A single marketplace listing from the search response's per-product preview.
export type TcgListing = {
  price: number; // item price (excludes shipping)
  languageId: number; // 1 = English
  quantity: number;
  condition?: string;
};

export type TcgProduct = {
  productId: number;
  productName: string;
  productUrlName: string;
  setUrlName: string;
  productLineUrlName: string;
  setName: string;
  marketPrice: number | null;
  lowestPrice: number | null;
  foilOnly: boolean;
  sealed: boolean;
  customAttributes?: { number?: string };
  listings?: TcgListing[];
};

// The cheapest in-stock ENGLISH Near-Mint listing in the search preview, or null if
// none. Listings come back cheapest-first, and the preview is already English-only
// (see searchBody), so this is the actual lowest price a buyer pays for a clean
// English copy — far better than the all-language lowest (Chinese etc.) and more
// useful than the algorithmic market price. Near-Mint keeps it comparable + honest
// (our TCGplayer rows are labelled NM).
export function englishNmLowest(p: TcgProduct): number | null {
  const ls = (p.listings ?? []).filter(
    (l) => l.languageId === 1 && (l.quantity ?? 0) > 0 && /near mint/i.test(l.condition ?? "")
  );
  return ls.length ? Math.min(...ls.map((l) => l.price)) : null;
}

// Lowest English listing of ANY condition — used only when the preview has no English
// Near-Mint copy. English-only (languageId 1), so a foreign-language listing can never
// count. Returns null when the product has NO in-stock English listing at all, which
// is the signal we use to skip non-English / unavailable products entirely.
export function englishAnyLowest(p: TcgProduct): number | null {
  const ls = (p.listings ?? []).filter((l) => l.languageId === 1 && (l.quantity ?? 0) > 0);
  return ls.length ? Math.min(...ls.map((l) => l.price)) : null;
}

// A non-English (e.g. Simplified Chinese / Japanese / Korean) printing. It shares our
// cards' collector numbers but is a different product, so it must never be priced as
// our card. CJK characters in the product/set name, or an explicit language word, are
// dead giveaways. (Defence-in-depth: the English-listing requirement below already
// drops these, since their English-filtered listing preview is empty.)
//
// Shared with every other price source (see FOREIGN_LANG's own comment for why
// this file's own copy — CJK range only, a narrower word list, no short region
// codes like "cht"/"jp" — had already drifted from eBay's before this import
// existed, and price-import.ts's ~100 general store feeds had no check of their
// own at all).
export function isNonEnglishProduct(p: TcgProduct): boolean {
  return isForeignLanguageTitle(`${p.productName ?? ""} ${p.setName ?? ""}`);
}

// TCGplayer's "Riftbound Organized Play Promotional Cards" set \u2014 event-exclusive
// metal reprints (Prize Wall, Best Of, \u2026) that Riot gives out at tournaments, NOT
// a booster-pack pull. Its products reuse the SAME collector number as the real
// card they depict (a metal "Ahri, Nine-Tailed Fox" is still numbered 255/298),
// so byKey/setFromTotal matching below can't tell a promo apart from the base
// card by number alone \u2014 and once matched to the same cardId, the "when two
// products collide, keep the higher market price" rule (built for the English-
// vs-Chinese-duplicate case) picked the promo's four-figure metal-card price
// over the real card's every time, turning e.g. a $0.34 common into a "$4,400
// rare" on /tools/box-ev. Detected by setName, not productName: the SET carries
// the signal ("Riftbound Organized Play Promotional Cards"), not the card name.
const PROMO_SET_RE = /organized\s*play|promotional\s*cards?/i;
export function isPromoProduct(p: TcgProduct): boolean {
  return PROMO_SET_RE.test(p.setName ?? "");
}

function searchBody(from: number, productTypeName?: string[]) {
  const term: Record<string, string[]> = { productLineName: [PRODUCT_LINE] };
  if (productTypeName) term.productTypeName = productTypeName;
  return {
    algorithm: "sales_synonym_v2",
    from,
    size: PAGE_SIZE,
    filters: { term, range: {}, match: {} },
    listingSearch: {
      context: { cart: {} },
      // language:["English"] makes the per-product `listings` preview English-only, so
      // we can take the actual lowest ENGLISH price without foreign-language (e.g.
      // Chinese) listings corrupting it.
      filters: { term: { sellerStatus: "Live", channelId: 0, language: ["English"] }, range: { quantity: { gte: 1 } }, exclude: { channelExclusion: 0 } },
    },
    context: { cart: {}, shippingCountry: "US", userProfile: {} },
    settings: { useFuzzySearch: true, didYouMean: {} },
    sort: {},
  };
}

async function fetchPage(from: number, productTypeName?: string[]): Promise<{ items: TcgProduct[]; total: number }> {
  const res = await fetch(SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Origin: "https://www.tcgplayer.com",
      Referer: "https://www.tcgplayer.com/",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
    },
    body: JSON.stringify(searchBody(from, productTypeName)),
  });
  if (!res.ok) throw new Error(`TCGplayer search ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data: any = await res.json();
  const r = data?.results?.[0];
  return { items: (r?.results ?? []) as TcgProduct[], total: r?.totalResults ?? 0 };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// A single page failure (403/502/a transient network blip — all observed in
// production, e.g. workflow run 33685886911 dying on page 0 with a 403, and
// run 33636059799 dying on page 10 with a 502) used to be immediately fatal to
// that page: page 0 had no retry at all, and the pagination loop below gave up
// on the WHOLE fetch the instant any later page errored once. Both are common
// on TCGplayer's public search endpoint and neither is a "the catalogue is
// this small" signal — retrying the SAME page a few times, with backoff,
// resolves the transient case without losing any coverage. What retries still
// can't fix — a sustained block for the rest of a run — is caught downstream:
// refreshTcgplayerPrices() compares the resulting row count against what is
// already in the database and refuses to overwrite a complete prior catalogue
// with a truncated one (see its own comment), so a bad run degrades to "stale
// but complete", never "silently missing most of the catalogue".
async function fetchPageRetrying(
  from: number,
  productTypeName?: string[],
  attempts = 4,
): Promise<{ items: TcgProduct[]; total: number }> {
  for (let i = 0; ; i++) {
    try {
      return await fetchPage(from, productTypeName);
    } catch (e) {
      if (i >= attempts - 1) throw e;
      console.warn(`TCGplayer page from=${from} attempt ${i + 1}/${attempts} failed:`, (e as Error).message);
      await sleep(1000 * 2 ** i); // 1s, 2s, 4s
    }
  }
}

// Fetch every Riftbound card product (paginated), excluding sealed products.
//
// A page that still fails after fetchPageRetrying()'s own retries stops the
// fetch here and returns whatever was collected so far. This function does NOT
// know or claim that is the full catalogue — the caller that WRITES the result
// (refreshTcgplayerPrices) is the one responsible for not treating a short
// list as if the catalogue actually shrank; see that function's own guard.
export async function fetchTcgplayerProducts(): Promise<TcgProduct[]> {
  const first = await fetchPageRetrying(0);
  const out: TcgProduct[] = [...first.items];
  for (let from = PAGE_SIZE; from < first.total; from += PAGE_SIZE) {
    await sleep(250);
    try {
      const pg = await fetchPageRetrying(from);
      if (pg.items.length === 0) break;
      out.push(...pg.items);
    } catch (e) {
      console.warn(`TCGplayer page from=${from} gave up after retries:`, (e as Error).message);
      break;
    }
  }
  return out.filter((p) => !p.sealed);
}

// Fetch the SEALED product catalogue (booster boxes/cases, packs, Champion Decks,
// Nexus Night promo packs, Pre-Rift kits, …) — a separate product type from cards.
// Same retry-then-give-up shape as fetchTcgplayerProducts() above, same reason.
export async function fetchTcgplayerSealed(): Promise<TcgProduct[]> {
  const PT = ["Sealed Products"];
  const first = await fetchPageRetrying(0, PT);
  const out: TcgProduct[] = [...first.items];
  for (let from = PAGE_SIZE; from < first.total; from += PAGE_SIZE) {
    await sleep(250);
    try {
      const pg = await fetchPageRetrying(from, PT);
      if (pg.items.length === 0) break;
      out.push(...pg.items);
    } catch (e) {
      console.warn(`TCGplayer sealed page from=${from} gave up after retries:`, (e as Error).message);
      break;
    }
  }
  return out;
}

export function tcgProductUrl(p: TcgProduct): string {
  const slug = `${p.productLineUrlName ?? "riftbound-league-of-legends-trading-card-game"}-${p.setUrlName ?? ""}-${p.productUrlName ?? ""}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `https://www.tcgplayer.com/product/${p.productId}/${slug}`;
}

// TCGplayer product image CDN.
export function tcgImageUrl(productId: number): string {
  return `https://tcgplayer-cdn.tcgplayer.com/product/${productId}_in_1000x1000.jpg`;
}

export type TcgMatchResult = {
  total: number;
  matched: number;
  rows: Prisma.RetailerPriceCreateManyInput[];
  unmatchedSamples: string[];
};

// TCGplayer is a US marketplace priced in USD. We surface it as a source in both the
// US market (as-is) and the UK market (converted to GBP — the user explicitly wants
// TCGplayer there). UK rows use a separate retailer key so they never collide with US
// rows on the unique [cardId, retailer, condition, isFoil] key.
export interface TcgMarket {
  retailer: string;
  country: string;
  currency: string;
  fx: number; // multiplier applied to the USD market price
}
// Approximate USD→GBP rate for the UK conversion, from the shared FX table
// (lib/fx.ts). Exact FX isn't critical for a "reference price" comparison.
export const USD_TO_GBP = USD_TO.GBP;
export const TCG_US: TcgMarket = { retailer: "tcgplayer", country: "US", currency: "USD", fx: 1 };
export const TCG_UK: TcgMarket = { retailer: TCGPLAYER_UK_RETAILER, country: "UK", currency: "GBP", fx: USD_TO_GBP };
// Singapore reference price (TCGplayer ships internationally; SGD-converted).
export const TCG_SG: TcgMarket = { retailer: TCGPLAYER_SG_RETAILER, country: "SG", currency: "SGD", fx: USD_TO.SGD };
// AU reference price (AUD-converted) — a fallback-only source for the main price
// comparison (see AU_FALLBACK_RETAILERS), but a real buy source for the Deal Finder.
export const TCG_AU: TcgMarket = { retailer: TCGPLAYER_AU_RETAILER, country: "AU", currency: "AUD", fx: USD_TO.AUD };
// Canada reference price (CAD-converted). CA was the only tracked market with no
// TCGplayer row — see the note on CA_FALLBACK_RETAILERS in constants.ts.
export const TCG_CA: TcgMarket = { retailer: TCGPLAYER_CA_RETAILER, country: "CA", currency: "CAD", fx: USD_TO.CAD };

// Match products to cards and build RetailerPrice rows (no DB writes — caller
// decides). Exported separately so a dry-run can inspect the match quality.
export async function buildTcgplayerRows(mkt: TcgMarket = TCG_US, products?: TcgProduct[]): Promise<TcgMatchResult> {
  const items = products ?? (await fetchTcgplayerProducts());
  const cards = await prisma.card.findMany({ select: { id: true, setCode: true, collectorNumber: true, externalId: true } });
  const byKey = new Map<string, string>();
  const byExternal = new Map<string, string>();
  // Set-less numbers (the "R04a"-style rune printings, "NN1", "WB25"…) keyed by the
  // card's OWN setCode. Their number can't yield a set, so they never land in byKey
  // and used to be priceable only via externalId — which works for cards we created
  // from TCGplayer but silently missed every rune added any other way (manual-cards
  // .json, the official-gallery importer). Matched below against the product's setName.
  const bySetlessNum = new Map<string, string>();
  for (const c of cards) {
    const [num, total] = c.collectorNumber.split("/");
    const sc = setFromTotal(total);
    if (sc) byKey.set(`${sc}|${numKey(num)}`, c.id);
    else bySetlessNum.set(`${c.setCode}|${numKey(num)}`, c.id);
    // Cards we created FROM TCGplayer carry externalId "tcg-<productId>" — price them
    // directly by that link (their numbers, e.g. promo runes "R03a", don't parse to a set).
    if (c.externalId) byExternal.set(c.externalId, c.id);
  }

  const unmatchedSamples: string[] = [];

  // Best (English) product per card+printing. Several products can share a collector
  // number — crucially an English print AND a Simplified-Chinese print. We keep the one
  // with the higher MARKET price (the English print — a Chinese print's market is far
  // lower) and record that MARKET price, NOT the lowest listing.
  //
  // Why market price, not lowest listing: the cheapest listing is frequently a
  // foreign-language (Chinese) copy that a seller listed UNDER the English product, and
  // TCGplayer's search preview tags every listing with the product LINE's language
  // (English), so we cannot filter those out per-listing — `languageId` is 1 for the
  // Chinese listing too. Market price is the English fair-market value TCGplayer itself
  // headlines, so it's the only Chinese-proof figure. (This was the Dazzling Aurora bug.)
  const best = new Map<string, { market: number; price: number; p: TcgProduct }>();

  for (const p of items) {
    if (isNonEnglishProduct(p)) continue; // drop obvious foreign-language products
    const numStr = p.customAttributes?.number;
    const [num, total] = (numStr ?? "").split("/");
    // Organized Play promo reprints reuse a real card's collector number but are
    // a different physical product (see isPromoProduct's doc comment) — never
    // resolve them via number+set, only via an explicit externalId link, exactly
    // like the set-less runes a few lines below.
    const sc = isPromoProduct(p) ? null : setFromTotal(total);
    // Match by set+number first; then by externalId (our TCGplayer-created cards);
    // finally, for set-less numbers ("R04a" runes), by the product's own setName —
    // the only set signal such a printing has.
    const setlessSet = sc ? null : setCodeFromSetName(p.setName);
    const cardId =
      (sc ? byKey.get(`${sc}|${numKey(num)}`) : undefined) ??
      byExternal.get(`tcg-${p.productId}`) ??
      (setlessSet && num ? bySetlessNum.get(`${setlessSet}|${numKey(num)}`) : undefined);
    // English MARKET price; fall back to lowest English NM listing only when a
    // (usually brand-new) product has no market price yet.
    const market = p.marketPrice && p.marketPrice > 0 ? p.marketPrice : null;
    const price = market ?? englishNmLowest(p);
    if (!cardId) {
      if (price && price > 0 && unmatchedSamples.length < 25) {
        unmatchedSamples.push(`${p.productName} ${numStr ?? "?"} $${price}`);
      }
      continue;
    }
    if (price == null || price <= 0) continue;
    const key = `${cardId}|${p.foilOnly ? "true" : "false"}`;
    const prev = best.get(key);
    // When collector numbers collide, the higher market price is the English print.
    const marketForCompare = market ?? price;
    if (!prev || marketForCompare > prev.market) best.set(key, { market: marketForCompare, price, p });
  }

  const rows: Prisma.RetailerPriceCreateManyInput[] = [];
  for (const [key, b] of best) {
    const isFoil = key.endsWith("|true");
    const cardId = key.slice(0, key.lastIndexOf("|"));
    rows.push({
      cardId,
      retailer: mkt.retailer,
      retailerName: "TCGplayer",
      title: b.p.productName,
      url: tcgProductUrl(b.p),
      condition: "NM",
      isFoil,
      priceCents: Math.round(b.price * 100 * mkt.fx),
      currency: mkt.currency,
      country: mkt.country,
      inStock: true,
    });
  }
  return { total: items.length, matched: rows.length, rows, unmatchedSamples };
}

// A write that would shrink one market's row count by more than this is refused
// rather than trusted (see the guard below). TCGplayer's real catalogue only
// grows between refresh cycles — sets don't get de-listed — so any drop this
// large is far more likely a fetch cut short by fetchPageRetrying() giving up
// (a sustained block) than a genuine catalogue change. 0.85 leaves headroom for
// ordinary noise (a handful of products delisted/relisted) without masking the
// failure this exists to catch: production was observed at 431 rows against a
// prior 1,244 (35%) the day this guard was added.
const COVERAGE_DROP_FLOOR = 0.85;

// Replace all TCGplayer rows with a fresh pull, for the US (USD), UK (GBP), SG
// (SGD), AU (AUD) and CA (CAD) markets. Products are fetched ONCE and reused
// for all, so a fetch that was cut short (see fetchTcgplayerProducts's own
// comment) degrades every market identically, not just one.
//
// UNCONDITIONALLY DELETING AND REPLACING USED TO BE "SUCCESS" as long as
// rows.length > 0 — so a run that only reached page 9 of the catalogue before
// a transient block would happily DELETE a complete prior catalogue and
// replace it with ~30% of it. That is exactly how /tools/box-ev's coverage
// silently collapsed: it reads ONLY this table (see box-ev.ts's own header for
// why), so a degraded TCGplayer refresh shows up there as most pools going
// "understated" — CI never sees it, nothing errors, the site just quietly
// gets worse. Same principle as scripts/migrate-history.ts's "copied nothing
// is NOT success" guard: a write that would shrink coverage by more than a
// card game's real catalogue could plausibly shrink in one refresh cycle is
// refused rather than trusted, and the existing (older but complete) rows are
// kept until a run that isn't truncated comes along to replace them.
export async function refreshTcgplayerPrices(): Promise<{ written: number; byCountry: Record<string, number> }> {
  const products = await fetchTcgplayerProducts();
  let written = 0;
  const byCountry: Record<string, number> = {};
  for (const mkt of [TCG_US, TCG_UK, TCG_SG, TCG_AU, TCG_CA]) {
    const { total, matched, rows, unmatchedSamples } = await buildTcgplayerRows(mkt, products);
    console.log(`TCGplayer ${mkt.country}: ${total} products, ${matched} matched, ${rows.length} rows.`);
    if (unmatchedSamples.length && mkt === TCG_US) {
      console.log(`TCGplayer unmatched (sample): ${unmatchedSamples.slice(0, 8).join(" | ")}`);
    }
    if (rows.length === 0) {
      console.warn(`TCGplayer ${mkt.country}: 0 rows built — keeping existing rows.`);
      continue;
    }
    const existing = await prisma.retailerPrice.count({ where: { retailer: mkt.retailer } });
    if (existing > 0 && rows.length < existing * COVERAGE_DROP_FLOOR) {
      console.warn(
        `::warning::TCGplayer ${mkt.country}: refusing to replace ${existing} existing rows with only ` +
          `${rows.length} (under ${Math.round(COVERAGE_DROP_FLOOR * 100)}% of existing) — almost certainly a ` +
          `truncated fetch, not real catalogue shrinkage. Keeping the existing rows; the next run will retry.`,
      );
      continue;
    }
    await prisma.retailerPrice.deleteMany({ where: { retailer: mkt.retailer } });
    await prisma.retailerPrice.createMany({ data: rows });
    written += rows.length;
    byCountry[mkt.country] = rows.length;
  }
  return { written, byCountry };
}
