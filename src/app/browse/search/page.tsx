import type { Metadata } from "next";
import Link from "next/link";
import { getCountry } from "@/lib/get-country";
import { normalizeCountry, type Country } from "@/lib/country";
import { browseMetadata } from "@/lib/browse-seo";
import { browseQuery, buildBrowseView, type BrowseParams } from "@/lib/browse-view";
import { parsePageNum } from "@/lib/cards";
import { quotaContext, refusedNow } from "@/lib/search-quota-server";
import { SearchLimitPanel } from "@/components/SearchLimitPanel";
import { SearchQuotaTick } from "@/components/SearchQuotaTick";
import { BrowseView } from "@/components/browse/BrowseView";

// A TEXT SEARCH OF THE CARD LIST (2026-11-05, DECISIONS.md "The card list
// becomes one CDN copy per URL"). next.config.js rewrites `/browse?q=…` here;
// the visitor's URL stays /browse. This route exists so that app/browse/page.tsx
// can be one CDN copy per URL that reads nothing about the visitor, while a
// search keeps everything it had: the daily allowance (a session and cookie
// read), the visitor's own market from the cookie or geo header, and no CDN
// header (next.config.js's /browse rule carries `missing: q`), so it renders
// per visit as it always did. The body is the same BrowseView, pinned to the
// market resolved here.
export const dynamic = "force-dynamic";

export async function generateMetadata({ searchParams }: { searchParams: BrowseParams }): Promise<Metadata> {
  return browseMetadata(searchParams);
}

export default async function BrowseSearchPage({ searchParams }: { searchParams: BrowseParams }) {
  // Sort/filter MUST use the visitor's market or the grid renders local prices
  // in another market's order and price filters drop cards with no local
  // listing. ?market= is an explicit override of the cookie/geo default.
  const country: Country = searchParams.market ? normalizeCountry(searchParams.market) : getCountry();
  const page = parsePageNum(searchParams.page);

  // THE DAILY SEARCH ALLOWANCE (2026-10-09, lib/search-quota.ts). A text search's
  // first page is metered like the typeahead: a query already counted today (or
  // one the dropdown counted as it was typed) is free, a new one counts, and one
  // past the allowance is refused here BEFORE any query runs. A server component
  // cannot set a cookie, so <SearchQuotaTick> counts an allowed new search from
  // the client. Paging and filters on an allowed search are never metered.
  const searchQ = (searchParams.q ?? "").trim();
  const quota = searchQ.length >= 2 && page === 1 ? await quotaContext() : null;
  if (quota && refusedNow(quota, searchQ)) {
    return (
      <section className="mx-auto max-w-2xl py-6">
        <h1 className="font-display text-2xl font-extrabold text-white">Search for “{searchQ}”</h1>
        <div className="mt-4">
          <SearchLimitPanel tier={quota.tier} next={`/browse?q=${encodeURIComponent(searchQ)}`} />
        </div>
        <p className="mt-4 text-sm text-slate-400">
          You can still <Link href="/browse" className="text-brand-400 hover:underline">browse every card</Link>, open any{" "}
          <Link href="/sets" className="text-brand-400 hover:underline">set</Link> or{" "}
          <Link href="/champions" className="text-brand-400 hover:underline">champion</Link>, and compare prices on every card page.
        </p>
      </section>
    );
  }
  const view = await buildBrowseView(country, browseQuery(searchParams));
  return (
    <BrowseView
      searchParams={searchParams}
      view={view}
      pinned
      before={quota?.metered && <SearchQuotaTick q={searchQ} />}
    />
  );
}
