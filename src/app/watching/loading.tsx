import { WatchlistSkeleton } from "@/components/RouteLoading";

// SCOPED DELIBERATELY — never move this to src/app/loading.tsx.
//
// A loading.tsx wraps its whole segment subtree in a Suspense boundary, which
// makes Next stream the response: the shell flushes with a committed HTTP 200
// before the page component runs. A notFound() thrown after that can only swap
// the UI, not the status — so every unknown /card/…, /sets/… URL would return
// "200 OK" with the 404 page rendered inside it, an unlimited supply of
// crawlable soft-404s. scripts/adsense-guard.ts fails the build if a loading.tsx
// appears at the app root, in any segment with a notFound()-calling descendant,
// or above a page that reads searchParams.
//
// This route is safe on all three counts: it has no children, its page calls
// redirect() (not notFound()) for a signed-out visitor, and it reads no
// searchParams — so there is no query-string variant that could serve this
// skeleton as a complete final response to a crawler. It is also noindex
// regardless, being a personal page.
//
// WHY IT EXISTS: /watching is force-dynamic because it reads the session, and
// without a boundary the App Router holds the visitor on their previous page
// until the server responds. That read as "the watchlist takes too long to
// load" even though the list itself already streamed client-side. The boundary
// is what lets the navigation commit first and the contents arrive after.
export default function Loading() {
  return <WatchlistSkeleton />;
}
