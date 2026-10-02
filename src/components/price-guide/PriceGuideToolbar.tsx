"use client";

import { useEffect, useState, type ReactNode } from "react";
import { GUIDE_DEFAULT_SORT, GUIDE_SORTS } from "@/lib/price-guide-query";
import { PRICE_GUIDE_PATH } from "@/lib/price-guide-seo";
import { SortSelect } from "@/components/SortSelect";
import { PageSizeSelect } from "@/components/PageSizeSelect";
import { RegionToggle } from "@/components/RegionToggle";
import { useGuideNav } from "./PriceGuideNav";

// The controls above the price table: search within the guide, sort, rows per
// page and market, with the server-rendered result count passed in as
// children. One flex-wrap row of controls (nothing here may need more than
// 390px — RegionToggle wraps on its own), then the count and the market.
//
// The market switch is RegionToggle, not MarketSwitcher: it sets the cookie and
// refreshes, so every filter in the URL survives, and it keeps the 48px touch
// floor. A shared link that carries `?market=` overrides the cookie on the
// server, so while it is in the URL the toggle would look broken (it sets a
// cookie the URL then outranks); a one-tap "use my market" takes its place.
export function PriceGuideToolbar({
  q,
  size,
  marketOverride,
  children,
}: {
  q: string;
  size: number;
  /** The place a `?market=` link pins the prices to, or null without one. */
  marketOverride: string | null;
  children: ReactNode;
}) {
  const { navigate } = useGuideNav();
  return (
    <div className="card-surface mb-3 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <PriceGuideSearch initial={q} />
        <div className="flex flex-wrap items-center gap-2">
          <SortSelect basePath={PRICE_GUIDE_PATH} defaultSort={GUIDE_DEFAULT_SORT} options={GUIDE_SORTS} />
          <PageSizeSelect size={size} basePath={PRICE_GUIDE_PATH} />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 text-sm text-slate-400">{children}</div>
        {marketOverride ? (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
            <span>
              Prices for <span className="font-semibold text-slate-200">{marketOverride}</span> from this link
            </span>
            <button
              type="button"
              onClick={() => navigate((p) => p.delete("market"))}
              className="tap-link font-semibold text-brand-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
            >
              Use my market
            </button>
          </p>
        ) : (
          <RegionToggle label="Market" />
        )}
      </div>
    </div>
  );
}

function PriceGuideSearch({ initial }: { initial: string }) {
  const { navigate } = useGuideNav();
  const [value, setValue] = useState(initial);
  // Back/forward, a chip removal or "Clear all" changes the URL under us.
  useEffect(() => setValue(initial), [initial]);

  function submit(next: string) {
    const v = next.trim();
    navigate((p) => (v ? p.set("q", v) : p.delete("q")));
  }

  return (
    // A real GET form, so the box still searches with JavaScript off (it then
    // drops the other filters, which is the honest no-JS behaviour).
    <form
      role="search"
      action={PRICE_GUIDE_PATH}
      method="get"
      onSubmit={(e) => {
        e.preventDefault();
        submit(value);
      }}
      className="flex min-w-0 flex-1 basis-full items-center gap-2 sm:basis-72"
    >
      <label htmlFor="price-guide-q" className="sr-only">
        Search the price guide
      </label>
      <div className="relative min-w-0 flex-1">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          id="price-guide-q"
          type="search"
          name="q"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Card name or number, e.g. Jinx or 193*/166"
          enterKeyHint="search"
          autoComplete="off"
          className="input pl-9"
        />
      </div>
      {initial && (
        <button
          type="button"
          onClick={() => {
            setValue("");
            submit("");
          }}
          className="btn-ghost shrink-0 px-3"
          aria-label="Clear the search"
        >
          Clear
        </button>
      )}
      <button type="submit" className="btn-primary shrink-0 px-4">
        Search
      </button>
    </form>
  );
}
