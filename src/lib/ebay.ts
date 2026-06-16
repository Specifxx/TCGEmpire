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

import { EBAY_CAMPAIGN_ID } from "./affiliate";

const TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const SEARCH_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search";
// eBay marketplace per country (results priced in that marketplace's currency).
export const EBAY_MARKETPLACE: Record<string, string> = { AU: "EBAY_AU", US: "EBAY_US", UK: "EBAY_GB" };
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
const EXCLUDE =
  /\b(lot|lots|bundle|joblot|job lot|playset|complete set|full set|master set|set of|bulk|pick your|choose your|your choice|all epic|all rare|all common|all uncommon|all cards|sealed|booster|pack|box|starter deck|structure deck|preconstructed|precon|intro deck|challenger deck|deck box|proxy|custom|chinese|japanese|korean|\d+\s*cards|x\s*\d+|psa|bgs|cgc|sgc|graded|gem mint|keychain|key ?ring|keyring|novelty|sticker|plush|playmat|sleeves?|toploader|top ?loader|binder|lanyard|badge|poster|magnet|funko|pin badge)\b/i;

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

// Is this listing a Signature print? ("223*" or signature/signed keywords)
function titleIsSignature(title: string, n: number): boolean {
  return (
    /\bsignature\b|\bsigned\b|\bautograph|\bsig\b/i.test(title) ||
    new RegExp(`\\b0*${n}\\s*\\*`).test(title)
  );
}

// Lowest legitimate single-card AU listing for a specific card. Requires the
// listing title to actually contain the card's name (rejects bundles/lots/wrong
// cards) and excludes obvious multi-card/non-English listings.
export async function searchEbayLowest(card: {
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
}): Promise<EbayResult | null> {
  const token = await getToken();
  if (!token) return null;

  const params = new URLSearchParams({
    // Include the collector number so the exact card ranks into the result window —
    // otherwise expensive chase cards (e.g. overnumbered) get pushed past the limit
    // by cheap noise (keychains, bundles). For Signature prints, also add the word
    // "signature"; for promos add "promo" so the promo printing surfaces.
    q: `${card.name} ${card.number.replace(/[^0-9]/g, "")}${card.isSignature ? " signature" : ""}${card.isPromo ? " promo" : ""} Riftbound`,
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
    return null;
  }
  if (res.status === 429) {
    rateLimited = true; // daily quota hit — stop the pass
    return null;
  }
  if (!res.ok) return null;
  const data = await res.json();
  const items: any[] = data.itemSummaries ?? [];

  // Accept only listings whose collector number matches THIS exact card+printing.
  // No name-only fallback — that mislabelled overnumbered/alt cards with the base
  // card's listing. The number is the reliable identity.
  const n = parseInt(card.number.replace(/[^0-9]/g, ""), 10);
  const valid = items
    .filter((it) => it?.price?.value)
    .filter((it) => !EXCLUDE.test(it.title ?? ""))
    // Drop non-English (Chinese etc.) printings — they share collector numbers with
    // our English cards but trade much cheaper, so they leak in as the "cheapest".
    .filter((it) => !isForeignListing(it))
    .filter((it) => numberMatches(it.title ?? "", card.number, card.total, card.setCode))
    // Signature ("*") and plain overnumbered share a number — keep them apart.
    .filter((it) => titleIsSignature(it.title ?? "", n) === card.isSignature)
    // Promo and base share a number too. A promo card matches ONLY promo-marked
    // listings; a base card matches ONLY non-promo listings (so promos don't
    // pollute the base price and vice versa).
    .filter((it) => PROMO_HINT.test(it.title ?? "") === !!card.isPromo)
    // Sanity guard: a single can legitimately cost a bit more on eBay than in a
    // store, but not 8×+. A listing that far above the card's store value (and over
    // an absolute floor so cheap-card noise isn't over-filtered) is a mismatch.
    .filter((it) => {
      const ref = card.referenceCents;
      if (!ref || ref <= 0) return true; // no reference — can't judge
      const price = delivered(it);
      return !(price > ref * 8 && price > 4000);
    })
    .sort((a, b) => delivered(a) - delivered(b));

  // Final safety net for a foreign printing that slipped past the title/location
  // filters (e.g. a Chinese card with an all-English title from a non-CN seller).
  // Such listings are priced FAR below the genuine English market, so we drop the
  // cheapest listing while it's a gross outlier — under 40% of the median price —
  // and there are enough comparison listings for the median to be trustworthy. This
  // only bites on clear outliers ($40 among $100s), never on normally-priced cards.
  const best = pruneCheapOutliers(valid);
  if (!best) return null;

  return {
    priceCents: Math.round(parseFloat(best.price.value) * 100),
    shippingCents: shippingFromItem(best),
    url: best.itemAffiliateWebUrl ?? best.itemWebUrl,
    title: best.title,
    condition: best.condition,
    imageUrl: best.image?.imageUrl ?? best.thumbnailImages?.[0]?.imageUrl ?? null,
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
const SEALED_EXCLUDE_EBAY =
  /\bsingle\b|proxy|sleeve|playmat|empty|\bcard\b|\d+\s*\/\s*\d+|chinese|japanese|korean|toploader|binder/i;

// Lowest legitimate AU eBay listing for a sealed product (booster box, pack, …).
export async function searchEbaySealed(name: string, productType: string, setCode: string | null): Promise<EbayResult | null> {
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
    "X-EBAY-C-MARKETPLACE-ID": DEFAULT_MARKETPLACE,
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
  const valid = items
    .filter((it) => it?.price?.value)
    .filter((it) => /riftbound/i.test(it.title ?? ""))
    .filter((it) => !kw || kw.test(it.title ?? ""))
    .filter((it) => !setName || new RegExp(setName.replace(/\s+/g, "\\s*"), "i").test(it.title ?? "") || !setCode)
    .filter((it) => !SEALED_EXCLUDE_EBAY.test(it.title ?? ""))
    .filter((it) => !isForeignListing(it))
    .sort((a, b) => delivered(a) - delivered(b));

  const best = valid[0];
  if (!best) return null;
  return {
    priceCents: Math.round(parseFloat(best.price.value) * 100),
    shippingCents: shippingFromItem(best),
    url: best.itemAffiliateWebUrl ?? best.itemWebUrl,
    title: best.title,
    condition: best.condition,
    imageUrl: best.image?.imageUrl ?? best.thumbnailImages?.[0]?.imageUrl ?? null,
  };
}
