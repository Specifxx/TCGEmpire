/**
 * Amazon's Creators API (it replaced PA-API 5 in 2026), SERVER-SIDE ONLY: only lib/amazon-live.ts calls it, from
 * the `/api/amazon/sealed/<slug>` route the sealed page's Amazon row asks (tests/amazon-api.test.ts), and the
 * credentials never reach the browser. OP Compare builds once a week, so a build-time fetch (the sister sites'
 * pattern) would show a price one day in seven; the route fetches at request time and the CDN keeps the answer
 * six hours, so a product costs at most four calls a day per market.
 *
 * Access: the owner's Associates accounts (AU approved 2026-11-03, US 2026-11-05). ONE credential (Associates
 * Central → Tools → Creators API) serves every marketplace; access is per store and opens only once that store's
 * own account has qualifying sales (third-party guides say 10 in the last 30 days), so a refused store
 * (401/403/429) answers "no price" and the row keeps its search link. Limits: 1 request a second and 8,640 a
 * day at first.
 *
 * Credentials: AMAZON_CREATORS_AU_CLIENT_ID / _CLIENT_SECRET / _VERSION (Vercel Production variables, never in
 * the repo) serve every store; AMAZON_CREATORS_<COUNTRY>_* override them for one. The version (3.1 NA, 3.2 EU,
 * 3.3 FE) is printed beside the credential and picks the Login with Amazon token endpoint.
 * Docs: https://affiliate-program.amazon.com/creatorsapi/docs/en-us/get-started/using-curl
 */
import type { Country } from "./country";

export const CREATORS_API = "https://creatorsapi.amazon/catalog/v1";

const TOKEN_ENDPOINTS: Record<string, string> = {
  "3.1": "https://api.amazon.com/auth/o2/token",
  "3.2": "https://api.amazon.co.uk/auth/o2/token",
  "3.3": "https://api.amazon.co.jp/auth/o2/token",
};

/** The stores we have a tag for (lib/amazon.ts): marketplace host, currency and the credential's home version. */
export const MARKETS: Partial<Record<Country, { marketplace: string; currency: string; version: string }>> = {
  US: { marketplace: "www.amazon.com", currency: "USD", version: "3.1" },
  CA: { marketplace: "www.amazon.ca", currency: "CAD", version: "3.1" },
  UK: { marketplace: "www.amazon.co.uk", currency: "GBP", version: "3.2" },
  EU: { marketplace: "www.amazon.de", currency: "EUR", version: "3.2" },
  AU: { marketplace: "www.amazon.com.au", currency: "AUD", version: "3.3" },
};

/** The token endpoint for a credential version; an unknown version falls back to the market's home region. */
export function tokenEndpoint(version: string | undefined, country: Country): string {
  return TOKEN_ENDPOINTS[(version ?? "").trim()] ?? TOKEN_ENDPOINTS[MARKETS[country]?.version ?? "3.1"];
}

export interface Credentials { id: string; secret: string; version: string }

/** The market's credential from the environment (its own, else the AU-named one), or null: then nothing runs. */
export function credentialsFor(country: Country, env: Record<string, string | undefined> = process.env): Credentials | null {
  for (const r of [country, "AU"]) {
    const k = `AMAZON_CREATORS_${r}_`;
    const id = env[`${k}CLIENT_ID`]?.trim();
    const secret = env[`${k}CLIENT_SECRET`]?.trim();
    if (id && secret) return { id, secret, version: env[`${k}VERSION`]?.trim() || MARKETS[country]?.version || "3.1" };
  }
  return null;
}

export interface Listing {
  price?: { money?: { amount?: number; currency?: string } };
  condition?: { value?: string };
  availability?: { type?: string };
  merchantInfo?: { name?: string };
  isBuyBoxWinner?: boolean;
}
export interface Item {
  asin: string;
  detailPageURL?: string;
  itemInfo?: { title?: { displayValue?: string } };
  offersV2?: { listings?: Listing[] } | null;
}
interface Body { searchResult?: { items?: Item[] }; itemResults?: { items?: Item[] }; itemsResult?: { items?: Item[] } }

/** Items from either operation's response (GetItems answers `itemResults`; older docs said `itemsResult`). */
export const itemsOf = (b: Body): Item[] => b.searchResult?.items ?? b.itemResults?.items ?? b.itemsResult?.items ?? [];

// OffersV2 availability that can be bought today ("IN_STOCK_SCARCE" is "Only 3 left").
const BUYABLE = new Set(["IN_STOCK", "IN_STOCK_SCARCE"]);

/**
 * The price we show for an item: the buy-box listing if it is new, in stock and in the store's currency, else
 * the cheapest such listing. Null when none qualifies (the row then keeps its search link and no price).
 */
export function pickListing(item: Item, currency: string): { amount: number; seller?: string } | null {
  const ok = (item.offersV2?.listings ?? []).filter(
    (l) => l.condition?.value === "New" && BUYABLE.has(l.availability?.type ?? "") && l.price?.money?.currency === currency && (l.price?.money?.amount ?? 0) > 0,
  );
  if (!ok.length) return null;
  const best = ok.find((l) => l.isBuyBoxWinner) ?? [...ok].sort((a, b) => a.price!.money!.amount! - b.price!.money!.amount!)[0];
  const seller = best.merchantInfo?.name;
  return { amount: best.price!.money!.amount!, seller: seller && !/^amazon/i.test(seller) ? seller : undefined };
}

export const SEARCH_RESOURCES = [
  "itemInfo.title",
  "offersV2.listings.price",
  "offersV2.listings.condition",
  "offersV2.listings.availability",
  "offersV2.listings.merchantInfo",
  "offersV2.listings.isBuyBoxWinner",
];

export class AmazonRefused extends Error {}

const withTimeout = (ms: number) => AbortSignal.timeout(ms);

/** One searchItems call for one market: a bearer token, then the search. Throws AmazonRefused on 401/403/429. */
export async function searchItems(country: Country, tag: string, creds: Credentials, keywords: string): Promise<Item[]> {
  const market = MARKETS[country];
  if (!market) throw new Error(`no Amazon store for ${country}`);
  const tok = await fetch(tokenEndpoint(creds.version, country), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials", client_id: creds.id, client_secret: creds.secret, scope: "creatorsapi::default" }),
    signal: withTimeout(8000),
  });
  if (!tok.ok) throw new AmazonRefused(`token ${tok.status}`);
  const bearer = ((await tok.json()) as { access_token: string }).access_token;
  const res = await fetch(`${CREATORS_API}/searchItems`, {
    method: "POST",
    headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json", "x-marketplace": market.marketplace },
    body: JSON.stringify({ partnerTag: tag, marketplace: market.marketplace, keywords, itemCount: 10, resources: SEARCH_RESOURCES }),
    signal: withTimeout(8000),
  });
  if (res.status === 401 || res.status === 403 || res.status === 429) throw new AmazonRefused(`searchItems ${res.status} ${(await res.text()).slice(0, 160)}`);
  if (!res.ok) throw new Error(`searchItems ${res.status} ${(await res.text()).slice(0, 160)}`);
  return itemsOf((await res.json()) as Body);
}
