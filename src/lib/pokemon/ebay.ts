// eBay Browse API calls for the Pokémon importer. Script-side only (the import
// workflow); nothing in a request handler calls eBay.
//
// Deliberately NOT lib/ebay.ts. That file belongs to Riftbound's importer and
// is on refresh-prices.yml's push-path list, so editing it starts a full
// Riftbound import; its searches also hard-require "Riftbound" in titles. The
// token call is the same client-credentials grant. The QUOTA is shared with
// Riftbound (one eBay app, 5,000 Browse calls a day), which is why this side
// reads the live remaining count first and only spends a capped slice of what
// sits above a reserve (ebay-match.ts pokemonEbayBudget).

import { EBAY_CAMPAIGN_ID } from "../affiliate";
import { parseBrowseItem, type EbayItemLite } from "./ebay-match";

const TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const SEARCH_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search";
const RATE_URL = "https://api.ebay.com/developer/analytics/v1_beta/rate_limit/?api_context=buy&api_name=Browse";

/**
 * The marketplace each market searches (lib/ebay.ts's EBAY_MARKETPLACE, minus
 * Singapore: there is no EPN program there and ebay.com.sg links are rerouted
 * to ebay.com, so a Singapore visitor gets the eBay SEARCH, never a tracked row).
 */
export const POKEMON_EBAY_MARKETPLACE: Record<string, string> = {
  US: "EBAY_US",
  UK: "EBAY_GB",
  AU: "EBAY_AU",
  CA: "EBAY_CA",
  EU: "EBAY_ES",
};
export const POKEMON_EBAY_MARKETS = Object.keys(POKEMON_EBAY_MARKETPLACE);

/** Where a buyer in each market takes delivery: the Browse `deliveryCountry` filter. */
export const EBAY_DELIVERY_ISO: Record<string, string> = { US: "US", UK: "GB", AU: "AU", CA: "CA", EU: "ES" };

export function pokemonEbayEnabled(): boolean {
  return Boolean(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET) && process.env.POKEMON_EBAY !== "0";
}

let token: { value: string; expires: number } | null = null;

async function getToken(): Promise<string | null> {
  if (!pokemonEbayEnabled()) return null;
  if (token && token.expires > Date.now() + 30_000) return token.value;
  const basic = Buffer.from(`${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope",
  });
  if (!res.ok) return null;
  const data = await res.json();
  token = { value: data.access_token, expires: Date.now() + (data.expires_in ?? 7200) * 1000 };
  return token.value;
}

/** Browse calls left today on the shared app, or null when it cannot be read. */
export async function ebayRemainingToday(): Promise<number | null> {
  const t = await getToken();
  if (!t) return null;
  try {
    const res = await fetch(RATE_URL, { headers: { Authorization: `Bearer ${t}` } });
    if (!res.ok) return null;
    const data: any = await res.json();
    for (const grp of data.rateLimits ?? []) {
      for (const r of grp.resources ?? []) if (r.name === "buy.browse") return r.rates?.[0]?.remaining ?? null;
    }
  } catch {
    /* unknown → the caller spends nothing */
  }
  return null;
}

export type EbaySearchOutcome = { status: "ok"; items: EbayItemLite[] } | { status: "rate-limited" } | { status: "error"; detail: string };

/** One Browse search: fixed price, new, deliverable to the market, cheapest first. */
export async function searchPokemonEbay(query: string, market: string): Promise<EbaySearchOutcome> {
  const t = await getToken();
  if (!t) return { status: "error", detail: "no eBay token" };
  const marketplace = POKEMON_EBAY_MARKETPLACE[market];
  const iso = EBAY_DELIVERY_ISO[market];
  if (!marketplace || !iso) return { status: "error", detail: `no eBay marketplace for ${market}` };
  const params = new URLSearchParams({
    q: query,
    filter: `buyingOptions:{FIXED_PRICE},conditions:{NEW},deliveryCountry:${iso}`,
    sort: "price",
    limit: "50",
  });
  let res: Response;
  try {
    res = await fetch(`${SEARCH_URL}?${params}`, {
      headers: {
        Authorization: `Bearer ${t}`,
        "X-EBAY-C-MARKETPLACE-ID": marketplace,
        "X-EBAY-C-ENDUSERCTX": `affiliateCampaignId=${EBAY_CAMPAIGN_ID}`,
      },
    });
  } catch (e) {
    return { status: "error", detail: (e as Error).message };
  }
  if (res.status === 429) return { status: "rate-limited" };
  if (!res.ok) return { status: "error", detail: `HTTP ${res.status}` };
  const data: any = await res.json();
  const items = ((data.itemSummaries ?? []) as any[]).map(parseBrowseItem).filter((x): x is EbayItemLite => x !== null);
  return { status: "ok", items };
}
