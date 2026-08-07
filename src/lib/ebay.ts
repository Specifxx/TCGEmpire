// eBay AU price source (scaffold) — uses eBay's official Browse API.
//
// To switch on, set in .env:
//   EBAY_CLIENT_ID=...     (App ID / Client ID from developer.ebay.com)
//   EBAY_CLIENT_SECRET=... (Cert ID / Client Secret)
//   EBAY_AFFILIATE_CAMPAIGN=... (optional, eBay Partner Network campaign id for commission)
//
// Until those are set, isEbayEnabled() is false and searchEbayLowest() returns null,
// so nothing breaks. eBay listings are free-text and noisier than store feeds, so
// treat results as a secondary signal (lowest Buy-It-Now, AU marketplace).

import { EBAY_CAMPAIGN_ID, ebayAffiliateUrl } from "./affiliate";

const TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const SEARCH_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search";
// eBay marketplace per country (results priced in that marketplace's currency).
export const EBAY_MARKETPLACE: Record<string, string> = { AU: "EBAY_AU", US: "EBAY_US", UK: "EBAY_GB", SG: "EBAY_SG", CA: "EBAY_CA" };
const DEFAULT_MARKETPLACE = "EBAY_AU";

export function isEbayEnabled(): boolean {
  return !!(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET);
}

// Set when the Browse API returns 429 (daily quota exceeded) OR our own budget is
// spent. Importers check this to abort the eBay pass early.
let rateLimited = false;
export function isEbayRateLimited(): boolean {
  return rateLimited;
}

// ---- Quota-aware budget ------------------------------------------------------
// eBay's Browse API allows 5,000 calls/day. We must never exhaust it (that 429s the
// rest of the run and any other usage). Before an eBay pass we ask eBay how many
// calls are actually left today and only spend down to a reserve — so even if the
// importer runs several times a day (schedule delays, deploys, manual runs) the
// quota can never hit zero.
const QUOTA_RESERVE = Number(process.env.EBAY_QUOTA_RESERVE ?? 600); // always leave this many
const FALLBACK_BUDGET = Number(process.env.EBAY_MAX_CALLS ?? 2200); // used only if the live count can't be read (covers ~1 full run)
let spendable = Infinity; // Browse calls we may still make this run
let spentThisRun = 0;

// Live remaining Browse-API calls for today (null if it can't be read). Uses the
// Developer Analytics API, which has its own separate limit (doesn't cost Browse quota).
async function fetchRemaining(): Promise<number | null> {
  const token = await getToken();
  if (!token) return null;
  try {
    const res = await fetch(
      "https://api.ebay.com/developer/analytics/v1_beta/rate_limit/?api_context=buy&api_name=Browse",
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return null;
    const data: any = await res.json();
    for (const grp of data.rateLimits ?? []) {
      for (const r of grp.resources ?? []) {
        if (r.name === "buy.browse") return r.rates?.[0]?.remaining ?? null;
      }
    }
  } catch {
    /* ignore — fall back to the fixed budget */
  }
  return null;
}

// Call once at the start of an eBay pass. Sets how many calls we may spend so we
// stop with QUOTA_RESERVE to spare, regardless of how often the importer runs.
export async function primeEbayBudget(): Promise<{ remaining: number | null; budget: number }> {
  rateLimited = false;
  spentThisRun = 0;
  const remaining = await fetchRemaining();
  spendable = remaining == null ? FALLBACK_BUDGET : Math.max(0, remaining - QUOTA_RESERVE);
  if (spendable <= 0) rateLimited = true;
  console.log(
    `eBay quota: ${remaining ?? "unknown"}/5000 remaining today → budget ${spendable} calls this run (reserve ${QUOTA_RESERVE}).`
  );
  return { remaining, budget: spendable };
}

export function ebaySpentThisRun(): number {
  return spentThisRun;
}

// Account for one Browse API call; flips the rate-limit flag when the budget runs
// out so importer loops stop early. Returns false when we must NOT make the call.
function spend(): boolean {
  if (spendable <= 0) {
    rateLimited = true;
    return false;
  }
  spendable--;
  spentThisRun++;
  return true;
}

let cachedToken: { value: string; expires: number } | null = null;

async function getToken(): Promise<string | null> {
  if (!isEbayEnabled()) return null;
  if (cachedToken && cachedToken.expires > Date.now() + 30_000) return cachedToken.value;

  const basic = Buffer.from(`${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope",
  });
  if (!res.ok) return null;
  const data = await res.json();
  cachedToken = { value: data.access_token, expires: Date.now() + (data.expires_in ?? 7200) * 1000 };
  return cachedToken.value;
}

export interface EbayResult {
  // eBay's listing id. Optional because most consumers (the price row, the ad
  // carousel) key on card+retailer and never needed it; the graded table keys on
  // it so a refresh updates a slab rather than duplicating it.
  itemId?: string;
  priceCents: number;
  shippingCents: number | null; // actual listing shipping (null if not provided)
  url: string;
  title: string;
  condition?: string;
  imageUrl?: string | null; // listing image (used for sealed product thumbnails)
}

function shippingFromItem(item: any): number | null {
  const opt = item?.shippingOptions?.[0];
  if (!opt) return null;
  const v = opt.shippingCost?.value;
  if (v == null) return null;
  return Math.round(parseFloat(v) * 100); // 0 = free shipping (eBay states it)
}

// Titles that mean a bundle/lot/non-English/sealed/non-card/graded listing — never
// a raw single. NOTE: "starter"/"deck" alone are NOT here — they appear in real card
// names (e.g. "Annie, Dark Child — Starter"); only the sealed-PRODUCT phrases
// ("starter deck", "structure deck", "precon") and graded slabs are excluded, since
// those trade far above a raw single and were leaking in as wrong prices.
// Split in two, because "not a raw single" and "not the same PRODUCT" are
// different claims and only one of them is always true.
//
// NOT_A_SINGLE: a lot, a sealed product, an accessory, a proxy — never the card,
// under any buying option.
const NOT_A_SINGLE =
  /\b(lot|lots|bundle|joblot|job lot|playset|complete set|full set|master set|set of|bulk|pick your|choose your|your choice|all epic|all rare|all common|all uncommon|all cards|sealed|booster|pack|box|starter deck|structure deck|preconstructed|precon|intro deck|challenger deck|deck box|proxy|custom|chinese|japanese|korean|\d+\s*cards|x\s*\d+|keychain|key ?ring|keyring|novelty|sticker|plush|playmat|sleeves?|toploader|top ?loader|binder|lanyard|badge|poster|magnet|funko|pin badge)\b/i;

// GRADED: a slab IS the card, but it is not comparable to a raw one — it trades
// far above, so it leaked into the price table as a wrong "cheapest". That makes
// it correct to exclude from PRICE rows and wrong to exclude everywhere: no
// tracked store lists slabs at all, so for graded copies eBay is the only market
// there is. The auction search keeps them and flags them (EbayAuction.isGraded);
// the price search still drops them, exactly as before.
export const GRADED_SLAB = /\b(psa|bgs|cgc|sgc|graded|gem mint)\b/i;

export function isGradedListing(title: string): boolean {
  return GRADED_SLAB.test(title ?? "");
}

export interface ParsedGrade {
  grader: string | null; // "PSA" | "BGS" | "CGC" | "SGC"
  grade: number | null; // 10, 9.5, 9, …
}

// The grader must sit IMMEDIATELY before the number, with only spaces or a dash
// between. That ordering is what separates a real grade from a number that
// happens to be nearby: "1 of 10 PSA graded" and "PSA graded, see photos" both
// contain a grader and a digit, and neither states a grade.
//
// Half grades exist only below 10 (BGS/CGC use .5 increments; nothing grades
// 10.5), so the alternation is ordered 10 first and the fractional branch is
// restricted to 1-9 — written the other way round, `1` would match the leading
// digit of `10` and every PSA 10 slab would be recorded as a PSA 1.
const GRADE_RE = /\b(PSA|BGS|CGC|SGC)\s*[-–]?\s*(10(?:\.0)?|[1-9](?:\.5)?)\b/i;
const GRADER_ONLY_RE = /\b(PSA|BGS|CGC|SGC)\b/i;

/**
 * Pull the grader and numeric grade out of an eBay title.
 *
 * Returns the grader alone when a slab word appears with no grade after it —
 * the listing IS graded, we just cannot say to what, and the UI shows "Graded"
 * rather than inventing a number. Guessing here would be worse than the gap:
 * a wrong grade on a slab misvalues the card by a wide margin.
 */
export function parseGrade(title: string): ParsedGrade {
  const t = title ?? "";
  const m = GRADE_RE.exec(t);
  if (m) return { grader: m[1].toUpperCase(), grade: parseFloat(m[2]) };
  const g = GRADER_ONLY_RE.exec(t);
  return { grader: g ? g[1].toUpperCase() : null, grade: null };
}

// The original combined guard, unchanged in behaviour — every title EXCLUDE
// matched before still matches.
const EXCLUDE = new RegExp(`${NOT_A_SINGLE.source}|${GRADED_SLAB.source}`, "i");

// Foreign-language / non-English printings that EXCLUDE's English word-list misses.
// Riftbound's Chinese release shares our cards' collector numbers but trades far
// cheaper, so a Chinese listing kept surfacing as the "cheapest" (e.g. a $40 Kai'Sa
// Survivor AA). We catch them by: any CJK character in the title (a Chinese/Japanese/
// Korean card name, or 中文/简体/繁體), OR short region/language codes EXCLUDE can't
// (cn/chs/cht/jp/kr/asia/simplified/traditional/…).
const FOREIGN_LANG =
  /[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]|\b(cn|chs|cht|jp|jpn|kr|kor|asia|asian|simplified|traditional|mandarin|cantonese)\b/i;

// A listing that is (or is very likely) a non-English printing — by title language or
// by shipping from mainland China (overwhelmingly the Simplified-Chinese print when an
// English-market search returns it). Hong Kong and elsewhere are kept (more mixed).
function isForeignListing(it: any): boolean {
  if (FOREIGN_LANG.test(it?.title ?? "")) return true;
  if ((it?.itemLocation?.country ?? "") === "CN") return true;
  return false;
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Return the cheapest listing AFTER discarding gross low-price outliers — the
// signature of a foreign printing that escaped the title/location filters. We drop
// the cheapest while it's < 40% of the median price (computed in dollars), requiring
// >= 4 listings and a median >= $5 so it never mis-fires on cheap cards or thin data.
// `items` must already be sorted cheapest-first.
function pruneCheapOutliers(items: any[]): any | undefined {
  let arr = items;
  while (arr.length >= 4) {
    const prices = arr.map((it) => parseFloat(it.price.value));
    const med = median(prices);
    if (med >= 5 && prices[0] / med < 0.4) arr = arr.slice(1);
    else break;
  }
  return arr[0];
}

// A promo printing (organized-play / prerelease / "GG EZ" etc.) shares the base
// card's collector number, so the ONLY way to tell a promo listing from the base
// listing is wording like this. Used to route promo listings to the promo card and
// keep them OUT of the base card's price.
const PROMO_HINT = /\bpromo\b|promotional|pre-?release|gg\s*ez|organi[sz]ed\s*play|nexus\s*night|judge\s*promo/i;

// Set-name keywords used to confirm the set when a title gives the number without
// the full "/total" (e.g. "SFD (141)").
const SET_NAMES: Record<string, string> = {
  OGN: "origins", OGS: "proving\\s*grounds", SFD: "spirit\\s*forged", UNL: "unleashed", VEN: "vendetta",
};

function delivered(it: any): number {
  return parseFloat(it.price.value) + (parseFloat(it.shippingOptions?.[0]?.shippingCost?.value ?? "0") || 0);
}

function setMentioned(title: string, setCode: string): boolean {
  if (new RegExp(`\\b${setCode}\\b`, "i").test(title)) return true;
  const name = SET_NAMES[setCode];
  return name ? new RegExp(name, "i").test(title) : false;
}

// Confirm the title is THIS exact card by its collector number — letter-aware so
// base "238" never matches alt "238a"/overnumbered, tolerant of leading zeros.
// Strong: matches "238/219". Fallback: number token + the set is named in the title.
function numberMatches(title: string, number: string, total: string, setCode: string): boolean {
  const digits = number.replace(/[^0-9]/g, "");
  if (!digits) return false;
  const n = parseInt(digits, 10);
  const letter = (number.match(/[a-z]/i)?.[0] ?? "").toLowerCase();

  const full = title.match(new RegExp(`\\b0*${n}([a-z]?)\\s*\\*?\\s*/\\s*${total}\\b`, "i"));
  if (full) return (full[1] || "").toLowerCase() === letter;

  if (setMentioned(title, setCode)) {
    const tok = title.match(new RegExp(`\\b0*${n}([a-z]?)\\b`, "i"));
    if (tok) return (tok[1] || "").toLowerCase() === letter;
  }
  return false;
}

// Does the title actually name this card? Every meaningful token of the card
// name must appear. This is the identity check that lets the number requirement
// be relaxed for signatures below — WITHOUT it, "any Riftbound signature" would
// match any signature card, which is far worse than no price at all.
function nameMatches(title: string, name: string): boolean {
  const t = ` ${title.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  const tokens = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
  if (!tokens.length) return false;
  return tokens.every((w) => t.includes(` ${w} `));
}

// Is this listing a Signature print? ("223*" or signature/signed keywords)
function titleIsSignature(title: string, n: number): boolean {
  return (
    /\bsignature\b|\bsigned\b|\bautograph|\bsig\b/i.test(title) ||
    new RegExp(`\\b0*${n}\\s*\\*`).test(title)
  );
}

/**
 * DIAGNOSTIC ONLY: run a raw Browse search and report how many items came back.
 *
 * searchEbayLowest bakes in one query shape and one buyingOptions filter. When
 * it returns nothing, the funnel can prove the FILTERS are innocent but cannot
 * say which part of the QUERY is at fault — and Browse ANDs every keyword, so
 * any single token can silently zero the result set. This runs a candidate query
 * verbatim so the difference between variants localises the culprit.
 *
 * Not used by the importer. Costs one Browse call per invocation.
 */
export async function probeEbayQuery(opts: {
  q: string;
  marketplace: string;
  fixedPriceOnly?: boolean;
}): Promise<{ ok: boolean; count: number; titles: string[] }> {
  const token = await getToken();
  if (!token) return { ok: false, count: 0, titles: [] };
  const params = new URLSearchParams({ q: opts.q, limit: "20" });
  if (opts.fixedPriceOnly !== false) params.set("filter", "buyingOptions:{FIXED_PRICE}");
  try {
    const res = await fetch(`${SEARCH_URL}?${params}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID": opts.marketplace,
      },
    });
    if (!res.ok) return { ok: false, count: 0, titles: [] };
    const data: any = await res.json();
    const items: any[] = data.itemSummaries ?? [];
    // NO price sort and EVERY title returned. Sorting cheapest-first and sampling
    // the head is what hid the answer last time: a $3,600 chase card sorts to the
    // very end, so the sample showed only cheap look-alikes and implied the
    // expensive listing did not exist.
    return {
      ok: true,
      count: items.length,
      titles: items.map((i) => `${String(i.title ?? "")}  [${i?.price?.value ?? "?"} ${i?.price?.currency ?? ""}]`),
    };
  } catch {
    return { ok: false, count: 0, titles: [] };
  }
}

/** One filter stage in searchEbayLowest's funnel — see the `funnel` param. */
export interface EbayFunnelStage {
  stage: string;
  kept: number;
  dropped: number;
  samples: string[];
}

/** The card identity a listing has to match. */
export interface EbayCardIdentity {
  name: string;
  setCode: string;
  number: string;
  total: string;
  isSignature: boolean;
  isPromo?: boolean;
}

/**
 * The identity filter: does this listing describe THIS exact card and printing?
 *
 * Returned as named stages rather than one boolean so `searchEbayLowest` keeps
 * its per-stage funnel instrumentation — every one of these is a place a real
 * listing can silently disappear, and "0 results" looks identical whether eBay
 * returned nothing or we rejected everything it returned.
 *
 * It is ALSO the single definition of card identity, shared with the auction
 * search. Auctions are a different buying option, not a different card: a lot,
 * a Chinese printing, a promo where we wanted the base print or a signature
 * where we wanted the plain overnumbered is exactly as wrong under a bid as it
 * is under a fixed price. Two copies of these rules would drift, and the auction
 * copy would drift silently — nobody checks a widget as closely as the price
 * table.
 */
export function cardIdentityStages(
  card: EbayCardIdentity,
  // Keep graded slabs. Only the auction search sets this: a slab is genuinely
  // this card, just not comparable to a raw copy — see GRADED_SLAB. Auctions
  // never become price rows, so there is nothing for it to distort, and slabs
  // are the one tier our store comparison cannot cover at all.
  opts: { allowGraded?: boolean } = {},
): { stage: string; pred: (it: any) => boolean }[] {
  const n = parseInt(card.number.replace(/[^0-9]/g, ""), 10);
  const notThisProduct = opts.allowGraded ? NOT_A_SINGLE : EXCLUDE;
  return [
    { stage: "has price", pred: (it) => Boolean(it?.price?.value) },
    {
      stage: opts.allowGraded
        ? "not excluded (lots/bundles/etc; graded kept)"
        : "not excluded (lots/bundles/etc)",
      pred: (it) => !notThisProduct.test(it.title ?? ""),
    },
    // Non-English (Chinese etc.) printings share collector numbers with our
    // English cards but trade much cheaper, so they leak in as the "cheapest".
    { stage: "not foreign printing", pred: (it) => !isForeignListing(it) },
    {
      // The collector number is the identity check for a base card. For a
      // SIGNATURE print it is too strict alone: there is exactly one signature
      // printing per card per set and sellers frequently omit the number, so a
      // signature also qualifies on name + set + "signature" — three independent
      // signals, a stronger identity than a bare number. Base cards untouched.
      stage: `collector number matches ${card.number}/${card.total}${card.isSignature ? " (or named signature print)" : ""}`,
      pred: (it) => {
        const title = it.title ?? "";
        if (numberMatches(title, card.number, card.total, card.setCode)) return true;
        return (
          card.isSignature &&
          titleIsSignature(title, n) &&
          setMentioned(title, card.setCode) &&
          nameMatches(title, card.name)
        );
      },
    },
    // Signature ("*") and plain overnumbered share a number — keep them apart.
    {
      stage: `signature flag === ${card.isSignature}`,
      pred: (it) => titleIsSignature(it.title ?? "", n) === card.isSignature,
    },
    // Promo and base share a number too. A promo card matches ONLY promo-marked
    // listings; a base card ONLY non-promo ones.
    {
      stage: `promo flag === ${!!card.isPromo}`,
      pred: (it) => PROMO_HINT.test(it.title ?? "") === !!card.isPromo,
    },
  ];
}

/** Composite of {@link cardIdentityStages} — for callers that don't need a funnel. */
export function listingMatchesCard(it: any, card: EbayCardIdentity): boolean {
  return cardIdentityStages(card).every((s) => s.pred(it));
}

function mapEbayItem(it: any): EbayResult {
  return {
    itemId: it?.itemId ? String(it.itemId) : undefined,
    priceCents: Math.round(parseFloat(it.price.value) * 100),
    shippingCents: shippingFromItem(it),
    url: ebayAffiliateUrl(it.itemAffiliateWebUrl ?? it.itemWebUrl),
    title: it.title,
    condition: it.condition,
    imageUrl: it.image?.imageUrl ?? it.thumbnailImages?.[0]?.imageUrl ?? null,
  };
}

/** The Browse `q` for a card. `withGame` appends "Riftbound" (see the note in
 *  searchEbayLowest about why that word is a fallback boundary, not a constant). */
function buildQuery(
  card: { name: string; number: string; isSignature: boolean; isPromo?: boolean },
  withGame: boolean,
): string {
  const num = card.isSignature ? "" : ` ${card.number.replace(/[^0-9]/g, "")}`;
  return `${card.name}${num}${card.isSignature ? " signature" : ""}${card.isPromo ? " promo" : ""}${withGame ? " Riftbound" : ""}`;
}

// Lowest legitimate single-card AU listing for a specific card. Requires the
// listing title to actually contain the card's name (rejects bundles/lots/wrong
// cards) and excludes obvious multi-card/non-English listings.
export async function searchEbayLowest(
  card: {
    name: string;
    setCode: string;
    number: string;
    total: string;
    isSignature: boolean;
    isPromo?: boolean;
    marketplace?: string; // "EBAY_AU" (default) | "EBAY_US"
    // The card's known value in this market (cheapest tracked STORE price, cents). When
    // present, listings priced absurdly above it are dropped as mismatches — a promo,
    // signature, graded slab or sealed deck that slipped past the keyword/number checks
    // (e.g. a $1,986 "Annie" leaking onto a $10 starter card). A legit cheaper listing
    // can still win, so this never blanks a card that has a real eBay single.
    referenceCents?: number;
  },
  // Optional output array: if provided, filled with the top few (already
  // legit-filtered) listings for the card page's "eBay Ad" carousel — a side
  // effect of this SAME search, so the carousel costs zero extra Browse API
  // calls/quota beyond what this pass already spends for the price comparison.
  captureAdListings?: EbayResult[],
  // Diagnostic sink. When supplied, records how many listings survived each
  // filter stage (and a sample of what was dropped) so "0 results" can be
  // attributed to a specific stage instead of guessed at. See
  // scripts/diagnose-card.ts.
  funnel?: EbayFunnelStage[],
  // Optional output array for GRADED (slabbed) listings, filled from this SAME
  // search at zero extra quota.
  //
  // It is free because the graded exclusion was never an API filter — the Browse
  // request has only ever sent buyingOptions, and EXCLUDE is applied to the items
  // eBay already returned. So the slabs are sitting in the response we paid for
  // and were simply being discarded.
  //
  // Behaviour-neutral for prices BY CONSTRUCTION: when this is supplied the
  // identity pass keeps graded listings, then they are partitioned OUT before
  // anything price-related runs. Every downstream step — the reference-value
  // guard, the delivered() sort, pruneCheapOutliers' median, captureAdListings
  // and the returned best — sees exactly the set it would have seen with the
  // graded exclusion applied at the filter stage instead. Nothing price-shaped
  // ever observes a slab.
  captureGraded?: EbayResult[],
  // Out-param distinguishing "searched, found nothing" from "the search never
  // completed". Both return null, and a caller that deletes rows for cards it
  // searched MUST tell them apart: treating a transient 5xx as "no listing"
  // deletes a live price. Defaults to ok:true and is set false only when the
  // call genuinely did not run.
  status?: { ok: boolean }
): Promise<EbayResult | null> {
  if (status) status.ok = true;
  const token = await getToken();
  if (!token) {
    if (status) status.ok = false;
    return null;
  }

  // ── WHY THERE ARE TWO QUERIES ────────────────────────────────────────────
  // Browse ANDs every keyword, so each token is another chance to miss a real
  // listing. "Riftbound" looks like a harmless guard against noise; measured, it
  // is the single biggest false negative in this search. The two live eBay AU
  // listings for Akali, Rogue Assassin (Signature) are titled:
  //   "VEN Akali Rogue Assassin Signature Overnumbered 189/166 Foil - NM -"
  //   "Akali Rogue Assassin VEN 189*/166 Signature Overnumbered Rare Foil ..."
  // Both name the card, the set and the printing. Neither says "Riftbound" — so
  // the search returned zero, the card showed no AU price for days, and it read
  // as "no listings exist" rather than as a bug.
  //
  // Dropping the word outright is not safe either: for a card whose name is
  // ordinary English it is what keeps the result window full of Riftbound cards
  // instead of unrelated tat, and `limit` is finite. So it is a FALLBACK — the
  // broad query runs only when the strict one found nothing, which costs one
  // extra Browse call on exactly the cards that would otherwise be unpriced, and
  // nothing at all on the ones already working.
  const queries = [buildQuery(card, true), buildQuery(card, false)];
  const params = new URLSearchParams({
    // Include the collector number so the exact card ranks into the result window —
    // otherwise expensive chase cards (e.g. overnumbered) get pushed past the limit
    // by cheap noise (keychains, bundles). For Signature prints, also add the word
    // "signature"; for promos add "promo" so the promo printing surfaces.
    // THE NUMBER IS OMITTED FOR SIGNATURE PRINTS, on purpose. Browse `q` ANDs its
    // keywords, so every token is a chance to miss a real listing. Including the
    // collector number is right for base cards (it ranks the exact printing into
    // the window ahead of cheap noise) but wrong for signatures: sellers of a
    // $3,000 chase card routinely title it "Riftbound Akali Rogue Assassin
    // Signature" with no number at all. Requiring "189" then returns literally
    // nothing — measured: eBay AU returned 0 items for this card while two real
    // listings were live on the site. A signature is unique per card per set, so
    // name + "signature" is enough to find it; identity is still enforced by the
    // filters below.
    q: queries[0],
    filter: "buyingOptions:{FIXED_PRICE}",
    sort: "price",
    limit: "100",
  });
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "X-EBAY-C-MARKETPLACE-ID": card.marketplace ?? DEFAULT_MARKETPLACE,
  };
  if (EBAY_CAMPAIGN_ID) {
    headers["X-EBAY-C-ENDUSERCTX"] = `affiliateCampaignId=${EBAY_CAMPAIGN_ID}`;
  }

  if (!spend()) return null; // budget exhausted — don't make the call

  let res: Response;
  try {
    res = await fetch(`${SEARCH_URL}?${params}`, { headers });
  } catch {
    if (status) status.ok = false; // network failure — not an answer
    return null;
  }
  if (res.status === 429) {
    rateLimited = true; // daily quota hit — stop the pass
    if (status) status.ok = false;
    return null;
  }
  if (!res.ok) {
    if (status) status.ok = false; // 5xx/4xx — not an answer
    return null;
  }
  const data = await res.json();
  let items: any[] = data.itemSummaries ?? [];

  // Strict query found nothing — retry once without the game name. See the note
  // above: sellers routinely omit "Riftbound" from a chase-card title.
  if (items.length === 0 && queries[1] !== queries[0] && spend()) {
    const retry = new URLSearchParams(params);
    retry.set("q", queries[1]);
    try {
      const res2 = await fetch(`${SEARCH_URL}?${retry}`, { headers });
      if (res2.status === 429) rateLimited = true;
      else if (res2.ok) items = (await res2.json())?.itemSummaries ?? [];
    } catch {
      /* keep the empty result */
    }
  }

  // FUNNEL INSTRUMENTATION. Every filter below is a place a real listing can
  // silently disappear, and "0 results" looks identical whether eBay returned
  // nothing or we rejected everything it returned. Without per-stage counts the
  // only way to tell them apart is to guess — which is exactly how a user ended
  // up reporting live eBay listings we swore did not exist. `funnel` records the
  // survivor count after each stage plus a sample of what each stage dropped.
  const drop = (stage: string, kept: any[], before: any[]) => {
    if (!funnel) return kept;
    const lost = before.filter((b) => !kept.includes(b));
    funnel.push({
      stage,
      kept: kept.length,
      dropped: lost.length,
      samples: lost.slice(0, 3).map((it) => String(it.title ?? "").slice(0, 90)),
    });
    return kept;
  };

  let cur: any[] = items;
  if (funnel) funnel.push({ stage: "eBay returned", kept: items.length, dropped: 0, samples: [] });
  // Identity stages come from cardIdentityStages() so the auction search applies
  // the identical rules — see its doc comment. Each is still recorded separately
  // in the funnel, which is what makes "0 results" attributable to a stage.
  //
  // With captureGraded, slabs are allowed THROUGH the identity pass (they are
  // genuinely this card) and removed immediately after, in their own funnel
  // stage. The stage is named either way so the diagnostic output states which
  // mode ran rather than silently reporting different numbers for the same card.
  for (const { stage, pred } of cardIdentityStages(card, { allowGraded: Boolean(captureGraded) })) {
    cur = drop(stage, cur.filter(pred), cur);
  }
  if (captureGraded) {
    const graded = cur.filter((it) => isGradedListing(it.title ?? ""));
    captureGraded.push(...graded.map(mapEbayItem));
    // Partition, not a copy: from here the price pipeline sees a set with no
    // slabs in it — identical to what the graded exclusion would have produced.
    cur = drop("graded split out (price path excludes slabs)", cur.filter((it) => !graded.includes(it)), cur);
  }
  // Sanity guard: a single can legitimately cost a bit more on eBay than in a
  // store, but not 8×+. A listing that far above the card's store value (and over
  // an absolute floor so cheap-card noise isn't over-filtered) is a mismatch.
  cur = drop(
    "not absurdly above store value",
    cur.filter((it) => {
      const ref = card.referenceCents;
      if (!ref || ref <= 0) return true; // no reference — can't judge
      const price = delivered(it);
      return !(price > ref * 8 && price > 4000);
    }),
    cur,
  );
  const valid = cur.sort((a, b) => delivered(a) - delivered(b));

  // Final safety net for a foreign printing that slipped past the title/location
  // filters (e.g. a Chinese card with an all-English title from a non-CN seller).
  // Such listings are priced FAR below the genuine English market, so we drop the
  // cheapest listing while it's a gross outlier — under 40% of the median price —
  // and there are enough comparison listings for the median to be trustworthy. This
  // only bites on clear outliers ($40 among $100s), never on normally-priced cards.
  const best = pruneCheapOutliers(valid);

  if (captureAdListings) {
    captureAdListings.push(...valid.slice(0, 4).map(mapEbayItem));
  }

  if (!best) return null;
  return mapEbayItem(best);
}

export interface EbayAuctionResult {
  itemId: string;
  currentBidCents: number;
  bidCount: number;
  buyItNowCents: number | null;
  currency: string;
  endsAt: Date;
  url: string;
  title: string;
  condition?: string;
  imageUrl: string | null;
  isGraded: boolean;
}

/**
 * LIVE AUCTIONS for one chase-tier card. Never a price source — see the
 * EbayAuction model comment for why a current bid must not reach RetailerPrice.
 *
 * A SEPARATE Browse call rather than relaxing searchEbayLowest's filter, which
 * would have been free. Two reasons it isn't worth the saving:
 *
 *  1. That call uses `sort=price` with a finite window. Auction items enter the
 *     result set at their CURRENT BID, which for a chase card starts near zero,
 *     so they sort to the front and push genuine fixed-price listings out of the
 *     window — degrading the price table on exactly the expensive cards it
 *     matters most for.
 *  2. The two searches want different filters: the price search must reject
 *     graded slabs, this one specifically wants them.
 *
 * Sorted by soonest-ending, not by price: an auction's value here is its
 * deadline, and it is also the only ordering that puts the listings most likely
 * to still be live when a reader sees them at the top.
 */
export async function searchEbayAuctions(
  card: EbayCardIdentity & { marketplace?: string },
  limit = 3,
): Promise<EbayAuctionResult[]> {
  const token = await getToken();
  if (!token) return [];

  // Same two-query shape as searchEbayLowest — sellers of chase cards routinely
  // omit "Riftbound" from the title, and Browse ANDs every keyword. The broad
  // query runs only if the strict one is empty.
  const queries = [buildQuery(card, true), buildQuery(card, false)];
  const params = new URLSearchParams({
    q: queries[0],
    filter: "buyingOptions:{AUCTION}",
    // Soonest-closing first. `sort=endingSoonest` is Browse's own auction
    // ordering; anything else would rank by a bid that means little mid-auction.
    sort: "endingSoonest",
    limit: "50",
  });
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "X-EBAY-C-MARKETPLACE-ID": card.marketplace ?? DEFAULT_MARKETPLACE,
  };
  if (EBAY_CAMPAIGN_ID) headers["X-EBAY-C-ENDUSERCTX"] = `affiliateCampaignId=${EBAY_CAMPAIGN_ID}`;

  if (!spend()) return [];

  let items: any[] = [];
  try {
    const res = await fetch(`${SEARCH_URL}?${params}`, { headers });
    if (res.status === 429) {
      rateLimited = true;
      return [];
    }
    if (!res.ok) return [];
    items = (await res.json())?.itemSummaries ?? [];
  } catch {
    return [];
  }

  if (items.length === 0 && queries[1] !== queries[0] && spend()) {
    const retry = new URLSearchParams(params);
    retry.set("q", queries[1]);
    try {
      const res2 = await fetch(`${SEARCH_URL}?${retry}`, { headers });
      if (res2.status === 429) rateLimited = true;
      else if (res2.ok) items = (await res2.json())?.itemSummaries ?? [];
    } catch {
      /* keep the empty result */
    }
  }

  const stages = cardIdentityStages(card, { allowGraded: true });
  const now = Date.now();

  return items
    .filter((it) => stages.every((s) => s.pred(it)))
    .map((it) => mapEbayAuction(it))
    // An auction with no end date cannot be shown: the countdown, the staleness
    // guard and the ordering all key off it, and a listing we cannot expire is
    // the failure mode this feature most has to avoid.
    .filter((a): a is EbayAuctionResult => a !== null && a.endsAt.getTime() > now)
    .slice(0, limit);
}

function mapEbayAuction(it: any): EbayAuctionResult | null {
  const end = it?.itemEndDate ? new Date(it.itemEndDate) : null;
  if (!end || Number.isNaN(end.getTime())) return null;
  const itemId = String(it?.itemId ?? "");
  if (!itemId) return null;

  // Browse reports an auction's live bid in currentBidPrice; `price` mirrors it
  // for auction items but is the BIN figure on an auction-with-Buy-It-Now, so
  // reading `price` alone would show the BIN as if it were the bid.
  const bid = it?.currentBidPrice ?? it?.price;
  if (!bid?.value) return null;
  const options: string[] = it?.buyingOptions ?? [];
  const hasBin = options.includes("FIXED_PRICE");
  const binValue = hasBin ? it?.price?.value : null;

  return {
    itemId,
    currentBidCents: Math.round(parseFloat(bid.value) * 100),
    bidCount: Number(it?.bidCount ?? 0),
    buyItNowCents: binValue != null ? Math.round(parseFloat(binValue) * 100) : null,
    currency: bid.currency ?? it?.price?.currency ?? "USD",
    endsAt: end,
    url: ebayAffiliateUrl(it.itemAffiliateWebUrl ?? it.itemWebUrl, "auction"),
    title: it.title,
    condition: it.condition,
    imageUrl: it.image?.imageUrl ?? it.thumbnailImages?.[0]?.imageUrl ?? null,
    isGraded: isGradedListing(it.title ?? ""),
  };
}

// Keyword each sealed product type must appear as in an eBay title.
const SEALED_TYPE_KW: Record<string, RegExp> = {
  "Booster Box": /booster\s*box|booster\s*display|display\s*box/i,
  "Booster Case": /\bcase\b/i,
  "Booster Pack": /booster\s*pack/i,
  Bundle: /bundle|gift/i,
  "Proving Grounds": /proving\s*grounds/i,
  "Promo Pack": /nexus\s*night|promo\s*pack/i,
  "Starter Set": /starter|two[-\s]?player/i,
  Tin: /\btin\b/i,
};
// Accessories and non-product listings that share a sealed product's keywords — a
// "booster box PROTECTOR", "acrylic display CASE", "EMPTY box", a single art/code
// card, etc. These are the main source of absurd low "sealed" prices (a $22 Origins
// "booster box" that's really a display-box protector), so exclude them outright.
const SEALED_EXCLUDE_EBAY =
  /\bsingle\b|proxy|sleeve|playmat|\bempty\b|\bcard\b|\d+\s*\/\s*\d+|chinese|japanese|korean|toploader|binder|protector|acrylic|magnetic|\bfits\b|storage|box\s*only|no\s*(?:cards?|packs?)|\bopened\b|\bstand\b|\bholder\b|divider|topper|spacer|\binsert\b|figure|plush|keychain|key\s*ring|sticker|lanyard|poster|wallpaper|digital|code\s*card|art\s*card/i;

// Per-type minimum plausible price (AUD cents) for an eBay sealed listing. A real
// booster box is never $22 — anything below the floor is an accessory/empty/mis-listed
// item that escaped the keyword filter. The floor is the LARGER of this absolute
// minimum and half the trusted (store/TCGplayer) reference price, so it adapts per
// product yet still bites when no reference exists (e.g. the Nexus Night seeds).
const SEALED_MIN_CENTS: Record<string, number> = {
  "Booster Box": 4000,
  "Booster Case": 12000,
  "Booster Display": 4000,
  "Proving Grounds Case": 5000,
  "Box Set": 1500,
  Bundle: 1500,
  "Pre-Rift Event Kit": 1500,
  "Pre-Rift Kit": 800,
  "Proving Grounds": 800,
  "Starter Set": 800,
  Tin: 800,
  "Champion Deck": 800,
  "Sleeved Booster (Art Set)": 800,
  "Nexus Night Pack": 200,
  "Promo Pack": 200,
  "Sleeved Booster": 200,
  "Booster Pack": 300,
};

// The minimum price an eBay sealed listing must clear to be trusted: the larger of the
// per-type floor and 50% of the known store/TCGplayer reference (when we have one).
export function sealedFloorCents(productType: string, referenceCents?: number | null): number {
  const absolute = SEALED_MIN_CENTS[productType] ?? 300;
  const relative = referenceCents && referenceCents > 0 ? Math.round(referenceCents * 0.5) : 0;
  return Math.max(absolute, relative);
}

// Lowest legitimate AU eBay listing for a sealed product (booster box, pack, …).
// `referenceCents` is the trusted store/TCGplayer price for this product (when known)
// — listings priced implausibly below it (or below the per-type floor) are dropped as
// accessories / mis-listings.
export async function searchEbaySealed(
  name: string,
  productType: string,
  setCode: string | null,
  referenceCents?: number | null,
  // Which eBay marketplace to search. Defaults to AU only so existing callers
  // keep their behaviour; the sealed importer now passes one per market.
  // Prices come back in THAT marketplace's currency, which is what makes the
  // resulting row storable against a market — SealedListing has no currency
  // column, so the country IS the currency.
  marketplace: string = DEFAULT_MARKETPLACE,
): Promise<EbayResult | null> {
  const token = await getToken();
  if (!token) return null;
  const kw = SEALED_TYPE_KW[productType];

  const params = new URLSearchParams({
    q: `Riftbound ${name}`,
    filter: "buyingOptions:{FIXED_PRICE}",
    sort: "price",
    limit: "50",
  });
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "X-EBAY-C-MARKETPLACE-ID": marketplace,
  };
  if (EBAY_CAMPAIGN_ID) {
    headers["X-EBAY-C-ENDUSERCTX"] = `affiliateCampaignId=${EBAY_CAMPAIGN_ID}`;
  }

  if (!spend()) return null; // budget exhausted — don't make the call

  let res: Response;
  try {
    res = await fetch(`${SEARCH_URL}?${params}`, { headers });
  } catch {
    return null;
  }
  if (res.status === 429) {
    rateLimited = true;
    return null;
  }
  if (!res.ok) return null;
  const data = await res.json();
  const items: any[] = data.itemSummaries ?? [];

  const setName = setCode ? (SET_NAMES[setCode] ?? setCode) : null;
  const floor = sealedFloorCents(productType, referenceCents);
  const valid = items
    .filter((it) => it?.price?.value)
    .filter((it) => /riftbound/i.test(it.title ?? ""))
    .filter((it) => !kw || kw.test(it.title ?? ""))
    .filter((it) => !setName || new RegExp(setName.replace(/\s+/g, "\\s*"), "i").test(it.title ?? "") || !setCode)
    .filter((it) => !SEALED_EXCLUDE_EBAY.test(it.title ?? ""))
    .filter((it) => !isForeignListing(it))
    // Price-sanity: drop anything below the per-type / reference floor (the $22
    // "booster box" accessory class).
    .filter((it) => Math.round(parseFloat(it.price.value) * 100) >= floor)
    .sort((a, b) => delivered(a) - delivered(b));

  // Secondary net for a low outlier that cleared the floor (e.g. a mis-listed item in
  // a thin result set): drop the cheapest while it's a gross outlier vs the median.
  const best = pruneCheapOutliers(valid);
  if (!best) return null;
  return {
    priceCents: Math.round(parseFloat(best.price.value) * 100),
    shippingCents: shippingFromItem(best),
    url: ebayAffiliateUrl(best.itemAffiliateWebUrl ?? best.itemWebUrl),
    title: best.title,
    condition: best.condition,
    imageUrl: best.image?.imageUrl ?? best.thumbnailImages?.[0]?.imageUrl ?? null,
  };
}
