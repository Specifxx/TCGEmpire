// Shared metadata builders.
//
// WHY: Next's App Router SHALLOW-merges metadata. A page that declares
// `alternates: { canonical: "/blog" }` doesn't add a canonical to the root's
// alternates — it REPLACES the whole object, silently dropping the RSS/JSON-Feed
// auto-discovery links and the x-default declared in app/layout.tsx. 71 of the
// site's 100 pages did exactly that, so feed readers and auto-posting agents
// found no feed link on the homepage or the blog index. The same applies to
// `openGraph`: a page that sets its own title/description loses the root's
// siteName and type.
//
// These helpers rebuild the inherited parts so a page can override the bits it
// cares about without dropping the bits it doesn't.
import type { Metadata } from "next";
import { SITE_NAME, SITE_URL } from "./site";
import { COUNTRIES, type Country } from "./country";

/** Feed auto-discovery, declared once, re-attached by pageAlternates(). */
const FEED_TYPES = {
  "application/rss+xml": "/feed.xml",
  "application/feed+json": "/feed.json",
} as const;

export interface AlternatesOpts {
  /** Extra rel=alternate types, e.g. the /llm markdown mirror. */
  types?: Record<string, string>;
  /**
   * Per-market alternates for a page that genuinely has one URL PER MARKET —
   * today, only the six country buying guides. Markets are otherwise cookie-
   * driven on a single URL set, so inventing hreflang elsewhere would be
   * fabricated markup. See hreflangForCountryGuide().
   */
  languages?: Record<string, string>;
}

/**
 * `alternates` for an indexable page: its own canonical, plus everything the
 * root declares that a bare `{ canonical }` would otherwise wipe out.
 */
export function pageAlternates(canonical: string, opts: AlternatesOpts = {}): Metadata["alternates"] {
  return {
    canonical,
    types: { ...FEED_TYPES, ...(opts.types ?? {}) },
    languages: opts.languages ?? { "x-default": `${SITE_URL}${canonical === "/" ? "" : canonical}` },
  };
}

/**
 * `openGraph` for a page, always carrying the root's siteName and a type, which
 * 34 routes were dropping. Pass `url` as a site-relative path.
 */
export function pageOpenGraph(opts: {
  title: string;
  description: string;
  url: string;
  type?: "website" | "article";
  images?: string[];
  publishedTime?: string;
  modifiedTime?: string;
  authors?: string[];
}): Metadata["openGraph"] {
  const { title, description, url, type = "website", images, ...rest } = opts;
  return {
    type,
    siteName: SITE_NAME,
    url: `${SITE_URL}${url === "/" ? "" : url}`,
    title,
    description,
    ...(images ? { images } : {}),
    ...rest,
  } as Metadata["openGraph"];
}

/**
 * The one place on this site where per-market hreflang is HONEST.
 *
 * RiftCompare serves one URL set and switches market on a cookie, so there are
 * no /en-gb/ style locale paths and inventing hreflang for them would be a lie.
 * The country buying guides are the exception: each is a genuinely distinct,
 * separately-indexable page about buying in ONE market, in that market's
 * currency, and they are alternates of each other in exactly the sense hreflang
 * describes.
 *
 * Keyed by market so the map and the routes can't drift.
 */
export const COUNTRY_GUIDE_SLUGS: Record<Country, string> = {
  US: "buy-riftbound-cards-us",
  UK: "buy-riftbound-cards-uk",
  AU: "buy-riftbound-cards-australia",
  CA: "buy-riftbound-cards-canada",
  SG: "riftbound-price-comparison-singapore",
  EU: "buy-riftbound-cards-europe",
};

/** BCP-47 tag per market. UK's region subtag is GB, not UK.
 *
 *  EU IS THE AWKWARD ONE, and used to be annotated en-ES (English targeted at
 *  Spain, the market's anchor country for Shopify/eBay — see country.ts's
 *  EU_ANCHOR_ISO). That was wrong, not just an under-claim: hreflang's region
 *  subtag exists to say WHO a page is for, and this page is not for Spain
 *  specifically — it is pan-European English content for shoppers in ~20
 *  member states, with nothing in its copy, currency formatting or content
 *  that singles Spain out. en-ES told Google the opposite of that.
 *
 *  hreflang's region subtag must be an ISO 3166-1 alpha-2 COUNTRY code, and
 *  "EU" is a UN M.49 region — search engines reject or ignore it, so "en-EU"
 *  is not a legal fix either. The correct BCP-47 tag for "English, no
 *  particular country" is simply the bare language subtag: "en". That is a
 *  real, standard hreflang value (search engines match it against any en-*
 *  visitor not already served by a more specific tag — en-US/en-GB/en-AU/
 *  en-CA/en-SG here), not a fabrication like en-EU would be, and it is the
 *  genuinely accurate claim for this page: EU_ANCHOR_ISO's job is choosing
 *  ONE country for Shopify/eBay's country-code-shaped APIs (see country.ts),
 *  a completely different question with a completely different right answer
 *  — hreflang has no such API constraint forcing a single-country tag, so it
 *  should just say what the page actually is. */
const HREFLANG: Record<Country, string> = {
  US: "en-US",
  UK: "en-GB",
  AU: "en-AU",
  CA: "en-CA",
  SG: "en-SG",
  EU: "en",
};

// ── 2026-09-24: bare `en` moves from the EU page to the US one ──────────────
// The note above was right that `en` is a legal tag and wrong about who it
// catches. Bare `en` is the match for every English searcher NOT covered by a
// more specific tag — the Philippines, New Zealand, Malaysia, India, Ireland —
// and for all of them it served EUR prices from European stores. The US page is
// the site's default market (DEFAULT_COUNTRY), the one those visitors are
// served anyway by normalizeCountry(), so it is the honest `en`.
//
// The EU page is instead declared for the countries its market actually serves:
// every one below is in country.ts's EU_ISO, so a visitor Google sends there
// with that tag is one normalizeCountry() also routes to EU. New Zealand gets no
// tag: NZ support was removed 2026-08-20 and an NZ visitor resolves to the US
// market, not AU, so an en-NZ → /au claim would be false.
export const EU_HREFLANG_COUNTRIES = ["IE", "DE", "FR", "NL", "BE", "ES", "IT", "AT", "PL", "SE", "DK", "FI", "PT"] as const;

/** The hreflang entries for one market's page: one tag, or the EU's list. */
function hreflangTags(country: Country): string[] {
  if (country === "EU") return EU_HREFLANG_COUNTRIES.map((c) => `en-${c}`);
  if (country === "US") return ["en-US", "en"];
  return [HREFLANG[country]];
}

/**
 * hreflang map for one of the country buying guides, or null for any other slug.
 * x-default points at the US guide, which is the site's default market
 * (DEFAULT_COUNTRY in lib/country.ts).
 */
export function hreflangForCountryGuide(slug: string): Record<string, string> | null {
  const isGuide = Object.values(COUNTRY_GUIDE_SLUGS).includes(slug);
  if (!isGuide) return null;
  const map: Record<string, string> = {};
  for (const [country, s] of Object.entries(COUNTRY_GUIDE_SLUGS) as [Country, string][]) {
    for (const tag of hreflangTags(country)) map[tag] = `${SITE_URL}/blog/${s}`;
  }
  map["x-default"] = `${SITE_URL}/blog/${COUNTRY_GUIDE_SLUGS.US}`;
  return map;
}

/**
 * The second honest hreflang group on the site: the homepage ("/") plus its
 * region variants (/au, /uk, /sg, /ca, /eu — see app/au/page.tsx etc). Each is
 * a genuinely distinct, separately-indexable page — its own H1, its own
 * region-locked stat block, its own store list — not a re-skin, so this is not
 * the "inventing hreflang" case hreflangForCountryGuide's header warns against.
 *
 * Keyed by market so the map, the routes and the sitemap entries can't drift.
 */
export const REGION_HOME_PATH: Record<Country, string> = {
  US: "/",
  UK: "/uk",
  AU: "/au",
  CA: "/ca",
  SG: "/sg",
  EU: "/eu",
};

/** hreflang map for the homepage + all region pages. x-default points at "/",
 *  the site's default market (DEFAULT_COUNTRY, currently US). */
export function regionHomeHreflang(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const [country, path] of Object.entries(REGION_HOME_PATH) as [Country, string][]) {
    for (const tag of hreflangTags(country)) map[tag] = `${SITE_URL}${path === "/" ? "" : path}`;
  }
  map["x-default"] = SITE_URL;
  return map;
}

// ── Market homepage titles (2026-09-24) ──────────────────────────────────────
// "riftbound card prices": 988 impressions at position 7.4, CTR 0.6% — every
// result above us is a price list whose title leads with the query. Query first,
// then a live, specific count. The count is stores with an IN-STOCK listing in
// that market right now (home-stats liveStoresByCountry), which is the reading
// that settles the 2026-09-22 objection to store counts in titles ("tracked" and
// "live" are different numbers): it says which one it means, and it is derived
// hourly, never typed. Unknown or zero drops the count rather than printing 0.
//
// Titles are ABSOLUTE and carry no "| RiftCompare" suffix: 60 characters is the
// budget and the brand is already in the URL and the site name Google shows.

/** Short market names for titles: "Australia", "UK", "Europe" — no article. */
const TITLE_PLACE: Record<Exclude<Country, "US">, string> = {
  AU: "Australia",
  UK: "UK",
  SG: "Singapore",
  CA: "Canada",
  EU: "Europe",
};
const TITLE_MAX = 60;

const firstFit = (candidates: string[]) => candidates.find((t) => t.length <= TITLE_MAX) ?? candidates[candidates.length - 1];

export function homeTitle(liveStores: number | null | undefined): string {
  const n = liveStores && liveStores > 0 ? liveStores : null;
  return firstFit([
    ...(n ? [`Riftbound Card Prices: Live Price Guide, ${n} Stores + eBay`, `Riftbound Card Prices: ${n} Stores + eBay, Updated Daily`] : []),
    "Riftbound Card Prices: Live Price Guide, Stores + eBay",
  ]);
}

export function regionHomeTitle(region: Exclude<Country, "US">, liveStores: number | null | undefined): string {
  const n = liveStores && liveStores > 0 ? liveStores : null;
  const place = TITLE_PLACE[region];
  return firstFit([
    ...(n ? [`Riftbound Card Prices ${place}: Compare ${n} ${region} Stores`] : []),
    `Riftbound Card Prices ${place}: Compare ${region} Stores`,
  ]);
}

export function homeDescription(cards: number | null | undefined, liveStores: number | null | undefined): string {
  const c = cards && cards > 0 ? `${cards.toLocaleString("en-US")} cards` : "every card";
  const s = liveStores && liveStores > 0 ? `${liveStores} stores` : "every store we track";
  return `Riftbound card prices for ${c} across ${s} and eBay in six markets — price check any card across them and find the cheapest place to buy. Updated daily.`;
}

export function regionHomeDescription(region: Exclude<Country, "US">, cards: number | null | undefined, liveStores: number | null | undefined): string {
  const info = COUNTRIES[region];
  const c = cards && cards > 0 ? `${cards.toLocaleString("en-US")} cards` : "every card";
  const s = liveStores && liveStores > 0 ? `${liveStores} ${info.adjective} stores` : `every ${info.adjective} store we track`;
  return `Riftbound card prices in ${info.place}: ${c} compared across ${s} in ${info.currency}, with ${info.adjective} delivered cost. Updated daily.`;
}

/** Full <Metadata> for one of the region home pages (not "/" itself, which
 *  keeps its own hand-written metadata in app/page.tsx). Every one of the
 *  region-locked facts here (adjective, currency, canonical path) reads off
 *  COUNTRIES/REGION_HOME_PATH so a page can never describe a market other than
 *  the one it actually renders. */
export function regionHomeMetadata(
  region: Exclude<Country, "US">,
  live: { cards?: number | null; stores?: number | null } = {},
): Metadata {
  const path = REGION_HOME_PATH[region];
  const title = regionHomeTitle(region, live.stores);
  const description = regionHomeDescription(region, live.cards, live.stores);
  return {
    title: { absolute: title },
    description,
    alternates: pageAlternates(path, { languages: regionHomeHreflang() }),
    openGraph: pageOpenGraph({ title, description, url: path }),
  };
}
