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

// Titles that mean a bundle/lot/non-English/sealed listing — never a single.
const EXCLUDE =
  /\b(lot|lots|bundle|joblot|job lot|playset|complete set|full set|master set|set of|bulk|pick your|choose your|your choice|all epic|all rare|all common|all uncommon|all cards|sealed|booster|pack|box|proxy|custom|chinese|japanese|korean|\d+\s*cards|x\s*\d+)\b/i;

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}
function delivered(it: any): number {
  return parseFloat(it.price.value) + (parseFloat(it.shippingOptions?.[0]?.shippingCost?.value ?? "0") || 0);
}
// Does the title's collector number match exactly (so base "039" doesn't match an
// alt-art "039a", and vice-versa)? Tolerant of leading zeros (039 == 39).
function numberMatches(title: string, number: string): boolean {
  const digits = number.replace(/[^0-9]/g, "");
  if (!digits) return false;
  const letter = (number.match(/[a-z]/i)?.[0] ?? "").toLowerCase();
  const m = title.match(new RegExp(`\\b0*${parseInt(digits, 10)}([a-z]?)\\b`, "i"));
  if (!m) return false;
  return (m[1] || "").toLowerCase() === letter;
}

// Lowest legitimate single-card AU listing for a specific card. Requires the
// listing title to actually contain the card's name (rejects bundles/lots/wrong
// cards) and excludes obvious multi-card/non-English listings.
export async function searchEbayLowest(card: {
  name: string;
  setCode: string;
  number: string;
}): Promise<EbayResult | null> {
  const token = await getToken();
  if (!token) return null;

  const params = new URLSearchParams({
    // Broad query for coverage; correctness comes from the name + number filters
    // below (a narrow query misses cheap listings that word their title differently).
    q: `${card.name} Riftbound`,
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
  if (!res.ok) return null;
  const data = await res.json();
  const items: any[] = data.itemSummaries ?? [];

  const wantName = norm(card.name); // e.g. "kaisasurvivor"
  const valid = items
    .filter((it) => it?.price?.value)
    .filter((it) => !EXCLUDE.test(it.title ?? ""))
    // The title must contain the full card name — this rejects bundles and wrong cards.
    .filter((it) => norm(it.title ?? "").includes(wantName))
    .sort((a, b) => delivered(a) - delivered(b));

  // Prefer a listing whose collector number matches exactly (correct base vs
  // alt-art printing); otherwise fall back to the cheapest name match.
  const exact = valid.filter((it) => numberMatches(it.title ?? "", card.number));
  const best = exact[0] ?? valid[0];
  if (!best) return null;

  return {
    priceCents: Math.round(parseFloat(best.price.value) * 100),
    shippingCents: shippingFromItem(best),
    url: best.itemAffiliateWebUrl ?? best.itemWebUrl,
    title: best.title,
    condition: best.condition,
  };
}
