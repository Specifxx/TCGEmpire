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

// Titles that mean a bundle/lot/non-English/sealed/non-card listing — never a single.
const EXCLUDE =
  /\b(lot|lots|bundle|joblot|job lot|playset|complete set|full set|master set|set of|bulk|pick your|choose your|your choice|all epic|all rare|all common|all uncommon|all cards|sealed|booster|pack|box|proxy|custom|chinese|japanese|korean|\d+\s*cards|x\s*\d+|keychain|key ?ring|keyring|novelty|sticker|plush|playmat|sleeves?|toploader|top ?loader|binder|lanyard|badge|poster|magnet|funko|pin badge)\b/i;

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
    .filter((it) => numberMatches(it.title ?? "", card.number, card.total, card.setCode))
    // Signature ("*") and plain overnumbered share a number — keep them apart.
    .filter((it) => titleIsSignature(it.title ?? "", n) === card.isSignature)
    // Promo and base share a number too. A promo card matches ONLY promo-marked
    // listings; a base card matches ONLY non-promo listings (so promos don't
    // pollute the base price and vice versa).
    .filter((it) => PROMO_HINT.test(it.title ?? "") === !!card.isPromo)
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
