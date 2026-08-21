// Daily card-search allowances, by tier. Shared by the /api/search enforcement
// (server) and every surface that advertises the ladder (SearchBar's gate
// panel, the signup popup) — one module so the numbers in the pitch can never
// drift from the numbers being enforced.
//
// The limit applies to the INSTANT search (the typeahead dropdown + quick
// view), the surface people actually live in. /browse?q= full-page results are
// deliberately not metered: they're indexable SEO pages, and throttling a
// crawler-reachable page over a cookie it doesn't carry would look like
// cloaking. The gate is a conversion nudge, not DRM.
export const ANON_SEARCH_LIMIT = 10;
export const FREE_SEARCH_LIMIT = 100;

// One "search" is a burst of typing, not an API call: the typeahead fires a
// debounced request per settled keystroke, so counting raw requests would burn
// an anonymous visitor's 10 in a single query. Requests inside this window
// extend the current search instead of starting a new one.
export const SEARCH_BURST_MS = 10_000;

// The quota cookie: `${utcDay}.${count}.${lastRequestMs}`, httpOnly, reset
// whenever the UTC day rolls over. Clearing cookies resets the meter — accepted;
// see the note above about what this gate is for.
export const SEARCH_QUOTA_COOKIE = "rc_search_q";
