import type { Metadata } from "next";
import { DEFAULT_COUNTRY, normalizeCountry, type Country } from "@/lib/country";
import { browseMetadata } from "@/lib/browse-seo";
import { browseQuery, buildBrowseView, type BrowseParams } from "@/lib/browse-view";
import { BrowseView } from "@/components/browse/BrowseView";

// ONE CDN COPY PER URL, KEPT SIX HOURS (2026-11-05, DECISIONS.md "The card list
// becomes one CDN copy per URL"). The page reads searchParams (filters, sort,
// paging, market), which made it dynamic all along: until 2026-11-05 it ALSO
// read the market cookie (getCountry), so every visit was a function render and
// two Postgres queries that no cache could share. Now it is force-dynamic on
// purpose, renders the baseline market (DEFAULT_COUNTRY, the US; or the market a
// `?market=` link pins, which is part of the URL) into its HTML, and
// next.config.js (`/browse`, QUERY_CDN_PAGES) keeps the response at Vercel's
// CDN, one copy per URL (the query string is part of the key). The
// market-dependent body is the BrowseMarketBoard island, which swaps in the
// visitor's market from /api/browse-view (the same computation,
// lib/browse-view.ts, also CDN-kept). Nothing in this page's server tree reads
// a cookie, a header or the session (tests/card-cdn.test.ts walks it).
//
// A TEXT SEARCH NEVER REACHES THIS FILE. `/browse?q=…` is rewritten by
// next.config.js to app/browse/search/page.tsx (the URL the visitor sees does
// not change), which meters the search per account (lib/search-quota-server.ts,
// a cookie and session read this tree must never make) and renders the
// visitor's own market directly; its response carries no CDN header.
export const dynamic = "force-dynamic";

export async function generateMetadata({ searchParams }: { searchParams: BrowseParams }): Promise<Metadata> {
  return browseMetadata(searchParams);
}

export default async function BrowsePage({ searchParams }: { searchParams: BrowseParams }) {
  // ?market=US (etc.) is an explicit override of the visitor's market, so an
  // agent (which carries no cookie) can construct a deterministic URL for
  // "cheapest X for a US buyer" instead of the market being invisible client
  // state. normalizeCountry() coerces anything invalid to the US default. Like
  // every other filter param, a non-empty searchParams object already falls
  // through browseMetadata's default branch to `canonical: "/browse"`.
  const country: Country = searchParams.market ? normalizeCountry(searchParams.market) : DEFAULT_COUNTRY;
  // `q` is dropped on purpose: the rewrite above means it is never here, and a
  // search answered from this tree would be the allowance's back door.
  const { q: _q, ...rest } = searchParams;
  const view = await buildBrowseView(country, browseQuery(rest));
  return <BrowseView searchParams={rest} view={view} pinned={!!searchParams.market} />;
}
