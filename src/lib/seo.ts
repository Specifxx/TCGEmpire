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
};

/** BCP-47 tag per market. UK's region subtag is GB, not UK. */
const HREFLANG: Record<Country, string> = {
  US: "en-US",
  UK: "en-GB",
  AU: "en-AU",
  CA: "en-CA",
  SG: "en-SG",
};

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
    map[HREFLANG[country]] = `${SITE_URL}/blog/${s}`;
  }
  map["x-default"] = `${SITE_URL}/blog/${COUNTRY_GUIDE_SLUGS.US}`;
  return map;
}

/**
 * The second honest hreflang group on the site: the homepage ("/") plus its
 * region variants (/au, /uk, /sg, /ca — see app/au/page.tsx etc). Each is
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
};

/** hreflang map for the homepage + all region pages. x-default points at "/",
 *  the site's default market (DEFAULT_COUNTRY, currently US). */
export function regionHomeHreflang(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const [country, path] of Object.entries(REGION_HOME_PATH) as [Country, string][]) {
    map[HREFLANG[country]] = `${SITE_URL}${path === "/" ? "" : path}`;
  }
  map["x-default"] = SITE_URL;
  return map;
}

/** Full <Metadata> for one of the region home pages (not "/" itself, which
 *  keeps its own hand-written metadata in app/page.tsx). Every one of the
 *  region-locked facts here (adjective, currency, canonical path) reads off
 *  COUNTRIES/REGION_HOME_PATH so a page can never describe a market other than
 *  the one it actually renders. */
export function regionHomeMetadata(region: Exclude<Country, "US">): Metadata {
  const info = COUNTRIES[region];
  const path = REGION_HOME_PATH[region];
  const title = `Compare Riftbound Card Prices Across Every ${info.adjective} Store | RiftCompare`;
  const description = `Compare live Riftbound TCG card prices across ${info.adjective} stores in ${info.currency} — total delivered cost including ${info.adjective} shipping, updated daily. Free.`;
  return {
    title: { absolute: title },
    description,
    alternates: pageAlternates(path, { languages: regionHomeHreflang() }),
    openGraph: pageOpenGraph({ title, description, url: path }),
  };
}
