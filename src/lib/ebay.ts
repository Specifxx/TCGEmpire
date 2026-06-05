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

const TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const SEARCH_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search";
const MARKETPLACE = "EBAY_AU";

export function isEbayEnabled(): boolean {
  return !!(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET);
}

// Set when the Browse API returns 429 (daily quota exceeded). Importers check this
// to abort the eBay pass early instead of firing ~950 doomed requests.
let rateLimited = false;
export function isEbayRateLimited(): boolean {
  return rateLimited;
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
}): Promise<EbayResult | null> {
  const token = await getToken();
  if (!token) return null;

  const params = new URLSearchParams({
    // Include the collector number so the exact card ranks into the result window —
    // otherwise expensive chase cards (e.g. overnumbered) get pushed past the limit
    // by cheap noise (keychains, bundles). For Signature prints, also add the word
    // "signature": they cost thousands, so a price-ascending search would otherwise
    // bury the real listings past the 100-result window behind cheap base copies.
    q: `${card.name} ${card.number.replace(/[^0-9]/g, "")}${card.isSignature ? " signature" : ""} Riftbound`,
    filter: "buyingOptions:{FIXED_PRICE}",
    sort: "price",
    limit: "100",
  });
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "X-EBAY-C-MARKETPLACE-ID": MARKETPLACE,
  };
  if (process.env.EBAY_AFFILIATE_CAMPAIGN) {
    headers["X-EBAY-C-ENDUSERCTX"] = `affiliateCampaignId=${process.env.EBAY_AFFILIATE_CAMPAIGN}`;
  }

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
    .sort((a, b) => delivered(a) - delivered(b));

  const best = valid[0];
  if (!best) return null;

  return {
    priceCents: Math.round(parseFloat(best.price.value) * 100),
    shippingCents: shippingFromItem(best),
    url: best.itemAffiliateWebUrl ?? best.itemWebUrl,
    title: best.title,
    condition: best.condition,
  };
}
