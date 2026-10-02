"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PRICE_GUIDE_PATH } from "@/lib/price-guide-seo";

// Shared navigation for /price-guide's own controls (search, column sorts, the
// "use my market" button). One transition for all of them, so the table can
// dim while the next server render is on its way, and one optimistic sort, so
// a clicked header shows its arrow at once rather than after the round trip.
//
// Every change is a router.push to a clean URL built from the current one:
// `page` is always dropped (a new filter or order starts at page 1) and a
// default is never written (`sort=price_desc` is the same page as no sort, and
// would be a needless noindexed duplicate).
type Nav = {
  pending: boolean;
  /** The sort a header click asked for, until the URL catches up. */
  optimisticSort: string | null;
  navigate: (mutate: (p: URLSearchParams) => void, sortHint?: string) => void;
};

const Ctx = createContext<Nav | null>(null);

export function PriceGuideNavProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const params = useSearchParams();
  const paramsStr = params.toString();
  const [pending, startTransition] = useTransition();
  const [optimisticSort, setOptimisticSort] = useState<string | null>(null);
  // The URL is the truth: once it changes (navigation landed, or back/forward),
  // drop the optimistic copy.
  useEffect(() => setOptimisticSort(null), [paramsStr]);

  const navigate = useCallback(
    (mutate: (p: URLSearchParams) => void, sortHint?: string) => {
      const next = new URLSearchParams(paramsStr);
      mutate(next);
      next.delete("page");
      if (sortHint !== undefined) setOptimisticSort(sortHint);
      const qs = next.toString();
      startTransition(() => router.push(qs ? `${PRICE_GUIDE_PATH}?${qs}` : PRICE_GUIDE_PATH, { scroll: false }));
    },
    [paramsStr, router],
  );

  const value = useMemo(() => ({ pending, optimisticSort, navigate }), [pending, optimisticSort, navigate]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGuideNav(): Nav {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useGuideNav must be used inside <PriceGuideNavProvider>");
  return ctx;
}

/** Dims its (server-rendered) children while a guide navigation is pending. */
export function PriceGuideBusyRegion({ children, className = "" }: { children: ReactNode; className?: string }) {
  const { pending } = useGuideNav();
  return (
    <div aria-busy={pending} className={`motion-safe:transition-opacity motion-safe:duration-fast ${pending ? "opacity-60" : ""} ${className}`}>
      {children}
    </div>
  );
}
