"use client";

import Link from "next/link";
import { PremiumButton } from "./PremiumButton";
import { limitCopy, type SearchTier } from "@/lib/search-quota";

// Shown where a search is refused for the day (lib/search-quota.ts): the
// typeahead dropdown and /browse. It says what the next tier gives and keeps
// the free routes in view, since card pages and price comparison stay open.
export function SearchLimitPanel({ tier, next, compact = false }: { tier: SearchTier; next?: string; compact?: boolean }) {
  const copy = limitCopy(tier);
  const loginHref = `/login?src=search_limit${next ? `&next=${encodeURIComponent(next)}` : ""}`;
  return (
    <div className={compact ? "px-4 py-3 text-sm" : "card-surface p-5 text-sm"} data-search-limit={tier}>
      <p className="font-semibold text-white">{copy.headline}</p>
      <p className="mt-1 text-slate-400">{copy.next}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {tier === "anon" ? (
          <>
            <Link href={loginHref} className="btn-primary min-h-11 px-4">
              Sign up free
            </Link>
            <PremiumButton tier="plus" surface="limit:search" className="btn-ghost min-h-11 px-4">
              Get Plus
            </PremiumButton>
          </>
        ) : tier === "free" ? (
          <PremiumButton tier="plus" surface="limit:search" className="btn-primary min-h-11 px-4">
            Get Plus
          </PremiumButton>
        ) : (
          <PremiumButton tier="premium" surface="limit:search" className="btn-primary min-h-11 px-4">
            Get Premium
          </PremiumButton>
        )}
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Card pages, sets and price comparison stay free. Searches reset at midnight UTC.
      </p>
    </div>
  );
}
