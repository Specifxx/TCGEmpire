# Homepage Measurement Guide — How To Judge the Rebuild

This is for whoever reports on the homepage rebuild's results in GA4. It exists because
the metric most people would reach for first — bounce rate — actively punishes the
homepage's best possible outcome, and reporting it without the context below will make a
successful redesign look like a failure (or vice versa).

Read this before pulling any number into a deck.

## 1. Report engagement rate, not bounce rate

GA4 defines bounce rate as `1 − engagement rate`. A session counts as **engaged** if it
lasts longer than 10 seconds, **or** it fires a key event, **or** it has 2+ pageviews.
(https://support.google.com/analytics/answer/12195621?hl=en)

An outbound click to a retailer is **not a pageview** — the visitor leaves
riftcompare.com entirely. So today, before `store_click` is marked as a GA4 key event
(see §4), a visitor who lands on the homepage, searches, compares three stores' prices,
and clicks through to the cheapest one in eight seconds is recorded as a **bounce** —
even though that is the single most successful session this site can produce. The
homepage's whole job is to get someone into a price comparison and out to a store
quickly; GA4's default bounce definition scores speed at that job as failure.

**Two numbers are the same fact inverted** — "68% engagement rate" and "32% bounce rate"
describe an identical population of sessions. But which one a team reports shapes what
they optimize for: a team staring at "bounce rate" starts treating every fast exit as
damage to be prevented, including the fast successful exits this site depends on.
Reporting **engagement rate**, and reading it alongside `store_click` volume specifically,
keeps the team pointed at the real goal.

Once `store_click` is marked a key event (§4), a search → store-click session becomes
engaged regardless of its duration, and this problem mostly self-corrects. Until it is
marked, do not draw conclusions from bounce/engagement rate at all — the number is
measuring the wrong thing.

## 2. The metric this redesign should be judged on: search initiation rate

Define **search initiation rate** as:

> Of sessions that landed on the homepage (`/`), what percentage fired at least one of:
> `search_initiated`, `search_submitted`, or a trending-chip selection?

This is the number that answers "did the rebuilt homepage get people into the one thing
it exists to do" — not bounce rate, not time-on-page, not scroll depth (those are all
diagnostic, not the headline number).

**Measurement gap closed in the Hero & Search phase**: trending-chip clicks used to be
tracked only in Vercel Analytics (`track("trending_chip_click", …)`), which a GA4
Exploration cannot read. `src/components/home/TrendingChips.tsx` now ALSO fires the GA4
`search_initiated` event on a chip click, with `trigger: "trending_chip"` — reusing the
existing event rather than adding a fourth one, so the formula above stays a plain
"`search_initiated` OR `search_submitted`" query with no separate trending-chip union
required. The Vercel Analytics `track()` call is untouched (still fires alongside), so
the click-volume dashboard keeps working exactly as before.

GA4 event reference for building this metric (all added by this phase and the Hero &
Search phase after it — see `src/lib/ga-events.ts` and its call sites for the
authoritative param list):

| Event | Fires when | Key params |
|---|---|---|
| `search_initiated` | First keystroke in a search box, OR the box stays focused ~1.2s without typing (a deliberate "focus with intent," not a tab-through), OR a hero trending chip is clicked | `trigger` (`keystroke` \| `focus_dwell` \| `trending_chip`), `variant` (`nav` \| `hero`), `card_id` (trending-chip clicks only) |
| `search_submitted` | Enter / "See all results" clicked, or a recent-search suggestion selected | `query`, `variant` |
| `search_suggestion_selected` | A row in the search dropdown is selected (live-preview results, or a zero-state trending/recent suggestion) | `suggestion_rank` (1-based, across the whole visible list), `result_type` (`card` \| `sealed` \| `trending` \| `recent`), `query`, `card_id` (card/trending rows only), `variant` |
| `search_no_results` | A debounced query (≥2 chars) returns zero cards and zero sealed matches | `query`, `variant` |
| `store_click` | Any outbound retailer link (`OutboundLink`) is clicked, sitewide | `card_id`, `card_name`, `store`, `market`, `price`, `position_in_list`, `page_type` — all except `store`/`market` are optional and populated only where the calling component already has the data |
| `scroll_depth` | Scroll position crosses 25/50/75/90% of the page, once each per pageview | `percent_scrolled`, `page_path` |
| `region_changed` | A visitor explicitly clicks a different market in any region control (hero toggle, navbar switcher, inline `RegionToggle`) — NOT the silent IP/account auto-detect on load | `from`, `to` |

## 3. Segment by landing page first, then device and channel

**Never blend homepage entrants with card-page entrants** — Contentsquare's benchmark
(§4 below) shows a 61% bounce rate on deep-linked detail pages is *normal*, and this site
gets roughly a third of its traffic landing directly on card pages from search/Discord
links. Averaging that in with homepage sessions manufactures a number that describes
neither population accurately.

**GA4 Exploration setup** (Explore → blank exploration):

- **Rows**: `Landing page + query string` — this is deliberately the query-string variant,
  not bare `Landing page`, so that UTM'd/campaign homepage traffic doesn't get grouped
  with organic homepage traffic that behaves differently. Filter rows to `/` (and any
  `/?...` variants) as the first pass, then look at other landing pages separately —
  never in the same row as `/`.
- **Columns**: `Device category` (mobile / desktop / tablet) — the brief's hard targets
  and this whole rebuild are mobile-first (70% of traffic per the Contentsquare number
  below), so device is the second-most-important split after landing page.
- **Values**: `Sessions`, and `Session key event rate` (this is GA4's built-in
  "engagement conferred by a key event" metric — it's what changes once `store_click` is
  a key event, see §4).
- Optional third dimension worth adding once the above is set up: `Session default
  channel group` (Direct / Organic Search / Referral / Social) — Discord referrals and
  direct-navigation returning users are this homepage's two named audiences per the
  design brief, and they may behave differently enough to be worth separating.

Pull search-initiation-rate (§2) as a **secondary exploration** on the same
`Landing page + query string = /` row filter, with `search_initiated` /
`search_submitted` event count divided by sessions — GA4 Explorations don't compute
ratios natively across two different metrics in one cell, so this one is easiest as two
numbers pulled side by side (sessions with the event ÷ total sessions) rather than a
single built-in metric.

## 4. Context: some softness is macro, not this homepage

Contentsquare's 2026 Digital Experience Benchmark (99 billion sessions) found:

- Mobile is 70% of visits.
- 1 in 3 visits now start on a detail page (not a homepage) — for this site, a card page.
- **61% of detail-page visits bounce, and that is described as normal, not broken.**
- Engagement fell roughly 10% year-over-year, industry-wide.

(https://contentsquare.com/guides/digital-experience-benchmark/engagement/)

So if engagement rate (or search initiation rate) doesn't move as much as hoped after
this rebuild, or even dips slightly, check whether the same softness shows up in
non-homepage landing pages too before concluding the redesign underperformed — some of
it may be a macro trend this site has no control over, not a homepage design failure.

**There is no published bounce/engagement benchmark for TCG price-comparison sites
specifically.** Every comparable-site number the rebuild's design brief cites (Scryfall,
TCGplayer, Skyscanner, etc.) is about page *structure* — screens of content, above-fold
element counts — not about their actual GA4 bounce/engagement numbers, which are not
public. **The only valid comparison is this site's own before vs. after**, on the same
metric definition, over comparable time windows (ideally a full week on each side, to
average out day-of-week effects) with a landing-page filter of `/` and no other site
change happening in that window that would confound the comparison. Do not benchmark this
site's absolute engagement-rate number against an industry figure pulled from a different
kind of site — it will always look wrong, in either direction, for reasons that have
nothing to do with this homepage.

## 5. Before drawing any conclusion, do these two things

1. **Mark `store_click` as a GA4 key event.** This is a manual step in the GA4 admin UI
   that cannot be done from code — see `DECISIONS.md`'s Phase 2 entry for the exact,
   step-by-step click path. Until this is done, engagement rate still undercounts the
   site's best sessions (§1), and "Session key event rate" in the Exploration above will
   read as artificially low.
2. **Record the GA4 property's current engagement-time-limit setting** before pulling
   the before/after comparison. It's an Admin-panel value (adjustable 10–60 seconds,
   default 10) that changes what counts as "engaged" independent of anything this
   redesign touched — if that setting is ever changed between the before and after
   measurement windows, the two numbers stop being comparable to each other. `DECISIONS.md`
   flags this as an open item — the account owner needs to record the value there before
   the first before/after comparison is pulled.
