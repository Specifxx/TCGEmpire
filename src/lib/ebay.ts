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
// constants.ts imports nothing at all, so this cannot create a cycle. Using its
// isCrystalRose() rather than re-testing /^sp\d/ here keeps one definition of
// what a Crystal Rose printing IS — the same reason classifySealed is shared.
import { isCrystalRose } from "./constants";

const TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const SEARCH_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search";
// eBay marketplace per country (results priced in that marketplace's currency).
// EU maps to EBAY_ES (Spain) — eBay has no pan-European marketplace, so a single
// EUR site front has to stand for the market. Spain is the anchor country the
// whole EU market resolves to (see country.ts's EU_ANCHOR_ISO). eBay serves the
// same inventory across its site fronts under different domains/currencies (see
// the SG note in affiliate.ts), so this chooses the CURRENCY and the domain a
// buyer lands on, not which listings exist.
export const EBAY_MARKETPLACE: Record<string, string> = { AU: "EBAY_AU", US: "EBAY_US", UK: "EBAY_GB", SG: "EBAY_SG", CA: "EBAY_CA", EU: "EBAY_ES" };
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

// A RANGE of collector numbers — "SP1-SP6", "R01-R06" — which only ever describes
// several cards sold together. Found from a real live listing, "Riftbound Vendetta
// Crystal Rose Skin Set SP1-SP6 KaiSa Sona Ahri Sett Ezreal Lux": the whole
// six-card treatment in one lot, whose "Skin Set" wording none of NOT_A_SINGLE's
// set/lot phrases catch, and which then matched Kai'Sa on the literal "SP1".
//
// Both sides must carry the SAME letter prefix, which is what keeps it precise:
// it fires on "SP1-SP6" and "R01-R06", and deliberately NOT on "SP3-006" (one
// card written with a hyphen instead of a slash) or on prose like "1-2 day
// shipping" — either of which would otherwise drop a legitimate single.
const NUMBER_RANGE = /\b([a-z]{1,3})\d{1,3}\s*[-–—]\s*\1\d{1,3}\b/i;

// GRADED: a slab IS the card, but it is not comparable to a raw one — it trades
// far above, so it leaked into the price table as a wrong "cheapest". That makes
// it correct to exclude from PRICE rows and wrong to exclude everywhere: no
// tracked store lists slabs at all, so for graded copies eBay is the only market
// there is. searchEbayLowest's captureGraded therefore splits them out into
// EbayGradedListing rows; the price path still drops them, exactly as before.
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

// The T1 Signature Edition ships in three languages, sold only via a Riot Merch
// Store drawing — so unlike every other sealed search, the Chinese and Korean
// editions are real, distinct, wanted products, not a foreign-printing false
// positive to reject. This is the REQUIRE-side inverse of FOREIGN_LANG above:
// narrower per language on purpose (a Korean search accepting a Chinese listing
// just because both are "foreign" would silently mix two different resale
// markets under one price). See the `language` param on searchEbaySealed.
export const LANGUAGE_SIGNAL: Record<"CN" | "KR", RegExp> = {
  CN: /[㐀-鿿]|\b(chinese|simplified|traditional|chs|cht|mandarin|cantonese)\b/i,
  KR: /[가-힯]|\b(korean|kor)\b/i,
};

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
//
// PREFIX-AWARE. Some cards number outside the set's regular 1..total range with a
// LEADING letter instead of (or as well as) a trailing variant one: Crystal Rose
// is "SP1".."SP6", the rune cycle is "R01A".."R06B", Nexus Night promos are
// "NN1", the Panda Teemo promo is "WB25". A prior version stripped every letter
// out via `number.replace(/[^0-9]/g, "")` and grabbed "the first letter it saw"
// for the trailing-variant slot — for "SP3" that grabbed the leading "S" as if it
// were a variant suffix, and the match regex required a WORD BOUNDARY directly
// before the digit (`\b0*3`), which "SP3" can never satisfy: "P" and "3" are both
// word characters, so there is no boundary between them. The result was that a
// real listing titled "... SP3/006 ..." could never match, however it was worded
// — this is why Crystal Rose and every other prefixed-number card showed no
// price despite real eBay/store listings existing for them.
function numberMatches(title: string, number: string, total: string, setCode: string): boolean {
  // <leading letters><digits, leading zeros optional><one trailing letter>. A
  // number with no digits at all (e.g. "P" for a Buff//Buff-style card) fails to
  // match and correctly returns false below, same as before this fix.
  const parsed = number.match(/^([a-z]*)0*(\d+)([a-z]?)$/i);
  if (!parsed) return false;
  const [, rawPrefix, digits, rawSuffix] = parsed;
  const n = parseInt(digits, 10);
  const letter = rawSuffix.toLowerCase();
  // Letters only (guaranteed by the regex above), so no regex-special characters
  // to escape — still built via a literal alternative rather than interpolated
  // raw, in case a future collector-number format introduces one.
  const prefix = rawPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // The prefix (if any) IS the boundary: "SP3" must match "SP3", not the bare "3"
  // that a plain `0*3` would also match inside an unrelated "OGN 123/298". Either
  // way the token is preceded by \b once, applied where it is actually needed.
  //
  // A HYPHEN between prefix and digits is tolerated ("SP-3" alongside "SP3").
  //
  // WHITESPACE IS NOT, and that is deliberate: "SP" is also the standard condition
  // abbreviation for Slightly Played, so allowing "SP 3" made ordinary stock
  // wording collide with the card number — "…Ahri Inquisitive 119/298 NM/SP 3
  // available" matched VEN SP3, i.e. a cheap Origins base copy would have been
  // published as the price of the chase print. Single-letter prefixes were worse
  // still ("Gold Token T 3" → SFD t03). A hyphen has no such second meaning, and
  // it is bounded to one so "SP - - 3" cannot creep back in.
  // Prefixed numbers only; an unprefixed one keeps its exact previous behaviour.
  const numToken = prefix ? `${prefix}-?0*${n}` : `0*${n}`;

  const full = title.match(new RegExp(`\\b${numToken}([a-z]?)\\s*\\*?\\s*/\\s*${total}\\b`, "i"));
  if (full) return (full[1] || "").toLowerCase() === letter;

  if (setMentioned(title, setCode)) {
    const tok = title.match(new RegExp(`\\b${numToken}([a-z]?)\\b`, "i"));
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

// Does this listing name the Crystal Rose treatment? The VEN SP1–SP6 alt-arts are
// the Wild Rift "Crystal Rose" skin line, and that phrase is how sellers label
// them when they don't type the SP number — which, measured against real listings,
// is often. Hyphen/slash tolerated ("crystal-rose"); the two words must be
// adjacent, so a title merely containing "crystal" (a Crystal Rose-unrelated card
// name) or "rose" cannot trip it.
function titleIsCrystalRose(title: string): boolean {
  return /\bcrystal[\s\-/]*rose\b/i.test(title);
}

// Does the title state an ordinary <number>/<total> collector number?
//
// The treatment-name fallbacks below identify a card by NAME plus a printing word
// when the seller gives no number. A seller who DID give a number has already told
// us which printing it is, and it must win — otherwise "Riftbound Origins Ahri
// Inquisitive 119/298 Epic — not the Crystal Rose version" is read as the Crystal
// Rose card because the words "Crystal Rose" appear in it, and a $9 Origins base
// copy gets published as the price of the ~$90 chase print. Nothing downstream
// catches that: the reference guard only rejects prices ABOVE the store low, and
// pruneCheapOutliers needs several surviving listings before it will drop one.
const STATES_A_COLLECTOR_NUMBER = /\b\d{1,3}[a-z]?\s*\*?\s*\/\s*\d{2,4}\b/i;

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
 * It is ALSO the single definition of card identity, shared with the graded
 * pass (`allowGraded`). A slab is a different CONDITION of the card, not a
 * different card: a lot, a Chinese printing, a promo where we wanted the base
 * print or a signature where we wanted the plain overnumbered is exactly as
 * wrong in a slab as it is raw. Two copies of these rules would drift, and the
 * widget's copy would drift silently — nobody checks a widget as closely as the
 * price table.
 */
export function cardIdentityStages(
  card: EbayCardIdentity,
  // Keep graded slabs. Only searchEbayLowest's captureGraded path sets this: a
  // slab is genuinely this card, just not comparable to a raw copy — see
  // GRADED_SLAB. Those rows never become price rows, so there is nothing for it
  // to distort, and slabs are the one tier our store comparison cannot cover.
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
      // NUMBER_RANGE is tested separately rather than folded into the regex
      // above: it carries a backreference (\1, "same prefix both sides"), and
      // alternating it into EXCLUDE's source would renumber that group and
      // silently break it. It applies on BOTH paths — a multi-card lot is not a
      // single under any buying option, graded or otherwise.
      pred: (it) => {
        const title = it.title ?? "";
        return !notThisProduct.test(title) && !NUMBER_RANGE.test(title);
      },
    },
    // Non-English (Chinese etc.) printings share collector numbers with our
    // English cards but trade much cheaper, so they leak in as the "cheapest".
    { stage: "not foreign printing", pred: (it) => !isForeignListing(it) },
    {
      // The collector number is the identity check for a base card. For a
      // SIGNATURE print it is too strict alone: there is exactly one signature
      // printing per card NAME in the whole game (verified against the live
      // catalogue — zero collisions among 36 signature prints, which tracks:
      // it is a one-per-champion treatment, not a per-set one), and sellers of a
      // $500+ chase card very often title it just "<Champion, Title> Signature"
      // with no collector number AND no set code — name + "signature" is already
      // a stronger identity than a bare number, so requiring the set on top
      // rejects exactly the listings this fallback exists to catch.
      //
      // setMentioned() USED to be required here too. It silently made this
      // fallback nearly unreachable: Soraka, Wanderer; Sett, The Boss; Master Yi,
      // Wuju Master; Ivern, Green Father and Akali, Rogue Assassin all sat at
      // "No price yet" in every market but the ones sourced from TCGplayer/a real
      // store — not because no eBay listing existed (real AU listings for every
      // one of them were confirmed directly on eBay), but because "Riftbound
      // Soraka, Wanderer Signature" never says "SFD" or "Spiritforged", so the
      // fallback demanded something the very listings it was built for don't say.
      // Base cards are untouched: numberMatches (checked first) still requires
      // the real number for everything that isn't a signature.
      // CRYSTAL ROSE gets the same treatment, for the same reason and with the
      // same safety argument. There are exactly six (VEN SP1–SP6), one per card
      // name, and sellers routinely title them "<Champion, Title> Crystal Rose"
      // with no SP number at all — measured against real listings, which is how
      // this was found: those titles matched NOTHING and the card stayed unpriced
      // even after the number-parsing and query bugs were fixed.
      //
      // WHY THIS IS COLLISION-SAFE, checked against the live catalogue rather
      // than assumed — and it needed checking, because every one of the six names
      // is REUSED across printings (Ahri, Inquisitive alone exists as OGN 119,
      // OGN 119a, SFD 227, SFD 227* and VEN SP3). The discriminator is the
      // "crystal rose" marker, and only ONE printing per name carries it:
      //   • a Crystal Rose listing cannot match the OGN/SFD printings — none of
      //     them is a Crystal Rose card, so none gets this branch, and each still
      //     demands its own collector number, which such a listing doesn't carry;
      //   • a non-Crystal-Rose listing cannot match SP3 — this branch requires
      //     the marker, and the plain printings' listings don't say it.
      // The real "Crystal Rose Sona, Harmonious playmat" is already dropped by
      // NOT_A_SINGLE's `playmat`, so the marker can't pull in merchandise.
      stage: `collector number matches ${card.number}/${card.total}${
        card.isSignature ? " (or named signature print)" : ""
      }${isCrystalRose(card.setCode, card.number) ? " (or named Crystal Rose print)" : ""}`,
      pred: (it) => {
        const title = it.title ?? "";
        if (numberMatches(title, card.number, card.total, card.setCode)) return true;
        // Both name-based fallbacks are for listings that give NO number. If the
        // title states one and numberMatches already rejected it above, the seller
        // has identified a different printing — believe them, not the keyword.
        if (STATES_A_COLLECTOR_NUMBER.test(title)) return false;
        if (card.isSignature && titleIsSignature(title, n) && nameMatches(title, card.name)) return true;
        return (
          isCrystalRose(card.setCode, card.number) &&
          titleIsCrystalRose(title) &&
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
  const num = card.isSignature ? "" : ` ${queryNumberToken(card.number)}`;
  return `${card.name}${num}${card.isSignature ? " signature" : ""}${card.isPromo ? " promo" : ""}${withGame ? " Riftbound" : ""}`;
}

/**
 * The collector-number keyword to put in the Browse `q`.
 *
 * Browse ANDs every keyword, so this token has to be one a seller would actually
 * type. For an ordinary number that is the digits: a card numbered 042 is listed
 * as "042/166", which tokenises to "042", and searching "042" finds it.
 *
 * For a LETTER-PREFIXED number it is not. Stripping "SP3" to its digits asks eBay
 * for the token "3", and a listing titled "… Crystal Rose SP3/006 …" contains no
 * bare "3" — so the search returned ZERO ITEMS and every downstream filter,
 * including the prefix-aware identity match added alongside this, never saw a
 * candidate to judge. That is why Crystal Rose (SP1–SP6) stayed unpriced in the
 * text-searched markets even after the matching fix: two independent bugs on the
 * same cards, and fixing only the filter left the search itself empty-handed.
 * The rune cycle (R01A–R06B) had the same shape, asking for "01".
 *
 * So: keep the prefix. "SP3" stays "SP3", "R01A" stays "R01A" — exactly how the
 * number is printed and how sellers write it. Unprefixed numbers are untouched.
 */
export function queryNumberToken(number: string): string {
  const trimmed = number.trim();
  return /^[a-z]/i.test(trimmed) ? trimmed.toUpperCase() : trimmed.replace(/[^0-9]/g, "");
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

  // ── CRYSTAL ROSE NEEDS A SECOND, DIFFERENTLY-SHAPED QUERY ─────────────────
  // The queries above all pin the collector number, and Browse ANDs every
  // keyword — so a listing titled "Ahri, Inquisitive — Crystal Rose — Riftbound
  // Vendetta" is never RETURNED, and the treatment fallback in
  // cardIdentityStages never gets to accept it. Relaxing only the filter left
  // these cards exactly as unpriced as before; this is what makes that fix
  // reachable.
  //
  // A MERGE, not a fallback-on-empty. The two title shapes are largely disjoint —
  // store-style listings give "SP3/006" and no treatment words, collector-style
  // listings give "Crystal Rose" and no number — so whichever query runs second
  // still has to contribute. The existing retry above only fires on zero results
  // and would never run when the numbered query found something.
  //
  // Bounded cost: there are exactly six Crystal Rose cards, so this is 6 extra
  // Browse calls per market per run, against a budget in the thousands. It is
  // spend()-gated like every other call, so it can never overrun the quota.
  if (isCrystalRose(card.setCode, card.number) && !isEbayRateLimited() && spend()) {
    const alt = new URLSearchParams(params);
    alt.set("q", `${card.name} crystal rose`);
    try {
      const res3 = await fetch(`${SEARCH_URL}?${alt}`, { headers });
      if (res3.status === 429) rateLimited = true;
      else if (res3.ok) {
        const extra: any[] = (await res3.json())?.itemSummaries ?? [];
        // Dedupe on itemId (falling back to the URL) so a listing returned by
        // both queries isn't counted twice into the cheapest/median maths.
        const key = (it: any) => String(it?.itemId ?? it?.itemWebUrl ?? "");
        const seen = new Set(items.map(key));
        for (const it of extra) {
          const k = key(it);
          if (k && !seen.has(k)) {
            seen.add(k);
            items.push(it);
          }
        }
      }
    } catch {
      /* keep whatever the numbered query found */
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
  // Identity stages come from cardIdentityStages() so every eBay pass applies
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

// Keyword each sealed product type must appear as in an eBay title.
const SEALED_TYPE_KW: Record<string, RegExp> = {
  "Booster Box": /booster\s*box|booster\s*display|display\s*box/i,
  "Booster Case": /\bcase\b/i,
  "Booster Pack": /booster\s*pack/i,
  Bundle: /bundle|gift/i,
  "T1 Signature Edition": /t1|worlds\s*champion/i,
  "T1 Player Bundle": /t1|worlds\s*champion/i,
  "Proving Grounds": /proving\s*grounds/i,
  "Promo Pack": /nexus\s*night|promo\s*pack/i,
  "Starter Set": /starter|two[-\s]?player/i,
  Tin: /\btin\b/i,
};
// Accessories and non-product listings that share a sealed product's keywords — a
// "booster box PROTECTOR", "acrylic display CASE", "EMPTY box", a single art/code
// card, etc. These are the main source of absurd low "sealed" prices (a $22 Origins
// "booster box" that's really a display-box protector), so exclude them outright.
//
// Split from the language-word exclusion below (rather than one combined literal)
// so the T1 CN/KR searches can drop ONLY the language exclusion and keep every
// other guard — see SEALED_EXCLUDE_EBAY_BASE and the `language` param on
// searchEbaySealed further down.
const SEALED_EXCLUDE_EBAY_BASE =
  /\bsingle\b|proxy|sleeve|playmat|\bempty\b|\bcard\b|\d+\s*\/\s*\d+|toploader|binder|protector|acrylic|magnetic|\bfits\b|storage|box\s*only|no\s*(?:cards?|packs?)|\bopened\b|\bstand\b|\bholder\b|divider|topper|spacer|\binsert\b|figure|plush|keychain|key\s*ring|sticker|lanyard|poster|wallpaper|digital|code\s*card|art\s*card/i;
// A listing calling itself Chinese/Japanese/Korean is (almost always) a foreign
// printing of an English product being searched for — excluded by default. The T1
// Signature Edition's CN/KR seeds are the one deliberate exception: for those two
// searches, THIS is the listing being searched for, not noise. See `language` below.
const SEALED_EXCLUDE_LANGUAGE_WORDS = /chinese|japanese|korean/i;
const SEALED_EXCLUDE_EBAY = new RegExp(
  `${SEALED_EXCLUDE_EBAY_BASE.source}|${SEALED_EXCLUDE_LANGUAGE_WORDS.source}`,
  "i",
);

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
  // Riot's published English RRPs are US$360 (Signature Edition) and US$70 (Player
  // Bundle) — the highest-priced Riftbound products there have ever been, and both
  // drawing-only, so eBay will carry plenty of accessory/part-lot listings using the
  // product's name. Floors sit well under RRP (these WILL be resold under/over it and
  // the floor's job is only to reject the obviously-not-the-product listing), but far
  // above the generic 300c default that would have let a $5 promo card through.
  "T1 Signature Edition": 15000,
  "T1 Player Bundle": 3000,
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
// per-type floor and 50% of the known reference (when we have one) — a live store/
// TCGplayer price where one exists, otherwise the published MSRP (see msrp.ts and
// sealed-import.ts's trustedRef) for a product with no current stockist at all.
export function sealedFloorCents(productType: string, referenceCents?: number | null): number {
  const absolute = SEALED_MIN_CENTS[productType] ?? 300;
  const relative = referenceCents && referenceCents > 0 ? Math.round(referenceCents * 0.5) : 0;
  return Math.max(absolute, relative);
}

// Lowest legitimate AU eBay listing for a sealed product (booster box, pack, …).
// `referenceCents` is the trusted price for this product (when known) — a live store/
// TCGplayer price, or the published MSRP when no store carries it (see trustedRef in
// sealed-import.ts) — listings priced implausibly below it (or below the per-type
// floor) are dropped as accessories / mis-listings / undisclosed foreign printings.
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
  // Set ONLY by the T1 Signature Edition's Chinese/Korean seeds (see T1_SEEDS in
  // sealed-import.ts). Every other caller omits this and keeps the default
  // "reject anything foreign-looking" behaviour below — it exists because that
  // default behaviour, correct for every other sealed product, would reject the
  // CN/KR editions themselves: SEALED_EXCLUDE_EBAY normally drops any title
  // containing "chinese"/"japanese"/"korean", and isForeignListing() drops any
  // CJK title or mainland-China seller location. For these two searches that is
  // the listing being searched for, not noise, so both are swapped for the
  // opposite check — REQUIRE the language signal instead of excluding it.
  language?: "CN" | "KR",
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
    // "Riftbound" is required in every other search, but a CN/KR reseller's title
    // very often keeps the Latin-script team name ("T1") while dropping or
    // translating the English game name — so a language search also accepts a
    // bare "T1", still narrow (T1 is the whole reason this product is findable
    // at all) and still backstopped by the language/keyword/floor filters below.
    .filter((it) => (language ? /riftbound|\bt1\b/i : /riftbound/i).test(it.title ?? ""))
    .filter((it) => !kw || kw.test(it.title ?? ""))
    .filter((it) => !setName || new RegExp(setName.replace(/\s+/g, "\\s*"), "i").test(it.title ?? "") || !setCode)
    // Every OTHER exclusion in SEALED_EXCLUDE_EBAY_BASE still applies for a
    // language search (proxy/sleeve/empty/accessory/…) — only the language-word
    // branch is dropped, since that's exactly what CN/KR are searching for.
    .filter((it) => !(language ? SEALED_EXCLUDE_EBAY_BASE : SEALED_EXCLUDE_EBAY).test(it.title ?? ""))
    .filter((it) => (language ? LANGUAGE_SIGNAL[language].test(it.title ?? "") : !isForeignListing(it)))
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
