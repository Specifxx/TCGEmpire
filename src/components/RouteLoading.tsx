import type { ReactNode } from "react";
import { Skeleton, SkeletonText, Spinner } from "./ui/Skeleton";

// The route-transition placeholder, shared by the scoped loading.tsx files
// (movers, portfolio, singles — see each one's own "SCOPED DELIBERATELY"
// comment for why this can never move to src/app/loading.tsx).
//
// It must fill the viewport (minus the navbar). At its old 55vh the footer and
// the layout-level ad banner sat in view during the load and then got shoved
// down by the arriving page — a 0.4–0.6 CLS hit on every dynamic route. That
// min-height is kept even when a real skeleton `children` is passed, since a
// skeleton's own natural height won't generally match the real page's exactly
// either — reserving the floor is what actually prevents the shift, not the
// shape of what's inside it.
//
// Bare (no children): a spinner, for any route that doesn't have a shaped
// skeleton yet. With children: the skeleton IS the shape, so no spinner.
export function RouteLoading({ children }: { children?: ReactNode }) {
  if (children) {
    return <div className="min-h-[calc(100dvh-6rem)]">{children}</div>;
  }
  return (
    <div className="flex min-h-[calc(100dvh-6rem)] flex-col items-center justify-center gap-3 text-slate-500">
      <Spinner size="lg" />
      <p className="text-sm">Loading…</p>
    </div>
  );
}

// /movers: breadcrumb + H1 + intro paragraph, then PriceWatch's own 3-column
// grid of mover panels (title/subtitle header + up to 5 rows: thumb, name +
// set code, a sparkline-width gap, price + delta).
export function MoversSkeleton() {
  return (
    <RouteLoading>
      <div className="flex flex-col gap-8">
        <div>
          <Skeleton className="h-3 w-40" />
          <Skeleton className="mt-3 h-8 w-3/4 sm:h-9 sm:w-1/2" />
          <SkeletonText lines={2} className="mt-3 max-w-3xl" />
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {[0, 1, 2].map((col) => (
            <div key={col} className="card-surface p-4">
              <div className="mb-2 flex items-baseline justify-between">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-16" />
              </div>
              <div className="divide-y divide-ink-800">
                {[0, 1, 2, 3, 4].map((row) => (
                  <div key={row} className="flex items-center gap-2.5 py-2">
                    <Skeleton className="h-12 w-9 shrink-0" />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-4/5" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                    <Skeleton className="h-6 w-16 shrink-0" />
                    <div className="w-14 shrink-0 space-y-1">
                      <Skeleton className="ml-auto h-3.5 w-12" />
                      <Skeleton className="ml-auto h-3 w-8" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </RouteLoading>
  );
}

// /portfolio: H1, then the headline value card (a big number + 3 delta boxes
// for 1/7/30 days + a chart slot), then a second card for the P&L section.
export function PortfolioSkeleton() {
  return (
    <RouteLoading>
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Skeleton className="h-7 w-48" />
            <Skeleton className="mt-2 h-3.5 w-64" />
          </div>
        </div>
        <div className="card-surface p-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <Skeleton className="h-3 w-40" />
              <Skeleton className="mt-2 h-10 w-40" />
              <Skeleton className="mt-2 h-3 w-32" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-12 w-16" />
              ))}
            </div>
          </div>
          <Skeleton className="mt-4 h-40 w-full" />
        </div>
        <div className="card-surface p-5">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="mt-3 h-24 w-full" />
        </div>
      </div>
    </RouteLoading>
  );
}

// /singles: an editorial hub, not a card grid — hero block, then the
// entry-points section's own 2/3-column grid of link cards.
export function SinglesSkeleton() {
  return (
    <RouteLoading>
      <div className="flex flex-col gap-10">
        <div className="card-surface overflow-hidden">
          <div className="border-l-2 border-brand-500 bg-ink-900 px-6 py-8 sm:px-8 sm:py-10">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="mt-3 h-8 w-3/4 sm:h-10 sm:w-2/3" />
            <SkeletonText lines={3} className="mt-4 max-w-2xl" />
            <div className="mt-5 flex flex-wrap gap-2">
              <Skeleton className="h-11 w-40" />
              <Skeleton className="h-11 w-40" />
            </div>
          </div>
        </div>
        <div>
          <Skeleton className="mb-4 h-6 w-56" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="card-surface flex flex-col gap-2 p-5">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </RouteLoading>
  );
}
