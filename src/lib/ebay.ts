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

// Lowest fixed-price AU listing for a card query (e.g. "Jinx Loose Cannon Riftbound").
export async function searchEbayLowest(query: string): Promise<EbayResult | null> {
  const token = await getToken();
  if (!token) return null;

  const params = new URLSearchParams({
    q: query,
    // Fixed-price only; exclude obvious lots/bundles in the query itself.
    filter: "buyingOptions:{FIXED_PRICE}",
    sort: "price",
    limit: "10",
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

  // Skip listings that look like bundles/lots/sets to reduce noise.
  const candidate = items.find(
    (it) => it?.price?.value && !/\b(lot|bundle|set of|playset|x\d+|complete set|joblot)\b/i.test(it.title ?? "")
  );
  if (!candidate) return null;

  return {
    priceCents: Math.round(parseFloat(candidate.price.value) * 100),
    shippingCents: shippingFromItem(candidate),
    url: candidate.itemAffiliateWebUrl ?? candidate.itemWebUrl,
    title: candidate.title,
    condition: candidate.condition,
  };
}
