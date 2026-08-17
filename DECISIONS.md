# DECISIONS.md

Shared memory for the "rebuild the RiftCompare homepage around one job" task.
Every phase appends a new section below — nothing here is overwritten or
deleted by a later phase. Write for a reader with zero other context.

---

## Phase 1 — Orient & Baseline (2026-08-17)

### Branch-naming deviation

The task brief asked for a branch named `homepage/reduce-bounce`. This
checkout was handed to me already on `claude/execute-prompt-dvnqhl` — a name
imposed by the hosting session's own branch-naming requirement, not something
this task chose. Per my instructions I did **not** create or switch to
`homepage/reduce-bounce`; all work for this task happens on
`claude/execute-prompt-dvnqhl`. Logged here per the brief's own ground rule
("where something is genuinely ambiguous... write the assumption into
DECISIONS.md and keep going").

### What was already done before Phase 1 started

`git log` shows this checkout already carries one prior, unrelated
optimisation pass (visible in the last ~15 commits, e.g. "Remove the hero's
flanking affiliate rails"). Reading the actual current `src/app/page.tsx` and
`src/components/home/*` (not the brief's own prose, which quotes the
*original pre-optimisation* numbers as documented context) shows the
following already done, ahead of this task:

- Hero is already "search-first": one search box (not two), no floating
  chase-card rail, no affiliate rails either side.
- Stat line is already collapsed to one muted line under the search box
  (`HeroStats.tsx`): `X cards · Y priced · Z in-stock listings · N US
  stores`, plus a separate freshness line ("Prices updated Xh ago").
- The six-country region strip is already de-emphasised into
  `CountryHeroToggle.tsx` — small pill toggle, quiet styling, NOT a blocking
  modal, NOT auto-redirecting the URL (matches the brief's Google
  multi-regional guidance already).
- Partner logos + affiliate disclosure already live below the fold in
  `PartnersStrip.tsx`, not in the hero.

**What the brief still wants that is NOT yet done** (i.e. real work for
Phases 2+, not already satisfied):

- H1 still lists all six countries verbatim ("Compare Riftbound card prices
  across AU, NZ, US, UK, SG & CA stores" — 60+ chars). Brief wants it
  shortened to the job, not the market list.
- Subhead is 3 lines and repeats the same six country names again.
- Hero still has **three** links/buttons below the stat line: "Browse the
  database" (styled as a filled button), "Top meta decks →", and "New to
  Riftbound? Learn how to play →". Brief wants all three gone, replaced by
  exactly one text link "Browse all {totalCards} cards →".
- `SearchBar.tsx` auto-focus already avoids the literal `autofocus`
  attribute (uses `useEffect` + `matchMedia("(min-width: 1024px)")`) — but
  that is a **width** gate, not the brief's requested **pointer-type** gate
  (`matchMedia('(pointer: fine)')`). A touch device with a ≥1024px screen
  (many tablets, some foldables) still gets focus-stolen today.
  `SearchBar.tsx` has **no** `/` keyboard shortcut, no ARIA combobox roles
  (`role="combobox"`, `aria-expanded`, `aria-activedescendant`,
  `aria-controls`), no arrow-key navigation, no bold-predicted-portion
  styling, no active-suggestion highlight, no price/set/collector-number
  columns beyond what's already shown (price IS already shown, set code +
  collector number too — good), and the dropdown has no explicit
  suggestion cap (Baymard wants 10 desktop / 4-8 mobile).
- Homepage is still 13 `<h2>`s deep with the full original section list
  (Market pulse, Today's Top Deals, inline newsletter card, EbayPicks,
  PopularCardsCarousel, ReturnVisitCards [3 of its own h2s], HowItWorks,
  inline Explore-the-database [by-set + by-domain], RadianceCountdownCard,
  LatestPosts, ReviewsSection, About+FAQ, PartnersStrip). None of the
  section consolidation (proof strip, one deals row, drop by-domain grid to
  its own page, fold Radiance into Explore, one footer-only newsletter
  capture) has happened yet.
- No `store_click` / `search_initiated` / `search_suggestion_selected` /
  `search_submitted` / `search_no_results` / scroll-depth / `region_changed`
  GA4 events exist yet. `OutboundLink.tsx` only fires Vercel Analytics'
  `track("buy_click", …)`, not a GA4 event, and it is not marked a GA4 key
  event (that's a manual admin-UI step no code change can do — flagged
  below for the owner).
- No `scripts/homepage-audit.mjs`, no `docs/homepage-measurement.md`.

So Phases 2-7 have the full scope of work described in the brief still
ahead of them; only a handful of hero-adjacent things the brief asks for
happen to already be true. Do not assume any other brief requirement is
already satisfied without checking the live file — this list is not
exhaustive of *everything* that already matches, only the highlights that
would otherwise cause duplicated work.

### Codebase map

**Framework**: Next.js 14.2 (App Router), TypeScript (strict), Tailwind CSS.
Prisma 5.22 ORM against PostgreSQL (Neon in production). React Server
Components by default; `"use client"` only where interactivity/hooks are
needed. Path alias `@/*` → `src/*`.

**Routing**: `src/app/**/page.tsx` file-based routing, ~150+ routes (browse,
card detail, sets, sealed, market, movers, tools/*, marketplace/*, games/*,
guides/blog, account, admin, etc). Homepage is `src/app/page.tsx`,
`export const revalidate = 3600` (real ISR, not force-dynamic) — it
deliberately reads **no** cookies/headers so it stays statically cacheable;
country/market localisation happens client-side after hydration via
`CountryProvider`.

**Styling**: Tailwind, utility classes plus a handful of shared component
classes defined in `globals.css` (`card-surface`, `chip`, `btn-primary`,
`btn-ghost`, `input`, `tap-link`, `num` for tabular-figure text, `rb-eyebrow`
etc). Dark theme only (`ink-*` background scale, `brand-*` green accent,
`gold`, `up`/`down` for price deltas). Three font families via `next/font`:
Inter (body/UI), JetBrains Mono (prices/tabular figures), Fraunces (headings)
— plus Archivo loaded *only* on the homepage for the display H1
(`src/app/page.tsx`'s own `Archivo` import, scoped there so no other route
pays for the extra font download).

**i18n / currency**: Not translated content (English only, `lang="en"`
site-wide) — "i18n" here means **market/region + currency**, six markets:
AU, NZ, US, UK, SG, CA (`src/lib/country.ts`). `DEFAULT_COUNTRY = "US"`
(guarded by `tests/country-default.test.ts` — do not touch without reading
that test first, it pins the exact fallback semantics for both server and
client code paths). Market resolution order: signed-in account's
`preferredCountry` > cookie (`COUNTRY_COOKIE`) > `/api/geo` IP-detect >
`DEFAULT_COUNTRY`. `CountryProvider.tsx` (client context) does the
reconciliation post-hydration; `getCountry()` (server) reads cookies only in
non-ISR routes. UK market has a special EUR-display wrinkle
(`EUR_DISPLAY_COOKIE`) for EU visitors browsing real GBP stores — real price
stays GBP, only the *displayed* figure converts. The homepage itself never
reads cookies (see ISR note above); it serializes **all six markets'** stats
into the page and lets client components pick the visitor's market at
render time (`statsByCountry`, `topDealsByCountry`, `moversByCountry`
patterns throughout `page.tsx`).

**Analytics** (full detail — this is Phase 2's primary surface):
- **GA4** (`src/components/GoogleAnalytics.tsx`, `src/lib/ga.ts`): loads
  `gtag.js` via `next/script` `afterInteractive`, **after**
  `ConsentDefaults` (Consent Mode v2 — analytics_storage defaults to
  `denied` globally until a visitor grants consent through the CMP; this is
  deliberate, not a bug — see the component's own header comment).
  `GA_MEASUREMENT_ID` defaults to `G-B5BB9ZRWM3` (env-overridable).
  Pageviews on client-side route changes are handled by GA4's own Enhanced
  Measurement (History API) — there is no manual router-event pageview
  listener, and Phase 2 must not add one (would double-count). A separate
  `GoogleAnalyticsUser` component sets a hashed GA4 User-ID once `/api/me`
  resolves.
  - **No custom GA4 events exist yet at all** (no `store_click`, no search
    events, no scroll depth, no `region_changed`). This is the biggest gap
    Phase 2 has to fill.
- **Vercel Analytics** (`@vercel/analytics`'s `track()`): used extensively
  as an ad-hoc lightweight click-volume beacon — `buy_click` (in
  `OutboundLink.tsx`), `trending_chip_click`, `market_pulse_click`,
  `deals_tab_change`, `packsim_cta_click`, `riftle_cta_click`,
  `alerts_cta_click`, `feedback_open/rating/submit`. This is a **separate**
  product from GA4 and stays as-is — Phase 2 adds GA4 events *alongside*
  it, does not replace it.
- **`OutboundLink.tsx`** is THE component every affiliate/retailer link in
  the codebase routes through (used by `TodaysTopDeals`, `PartnersStrip`,
  `EbayPicksLive`, card-detail buy buttons, etc). It currently only fires
  `track("buy_click", { retailer, country, kind })` (Vercel Analytics).
  Phase 2's job: extend it **additively** with new *optional* props
  (`cardId`, `cardName`, `price`, `positionInList`, `pageType`) so every
  existing call site across the codebase keeps compiling unchanged, and add
  a GA4 `store_click` event alongside the existing `track()` call using
  whatever subset of those fields the caller happens to pass.
  `OutboundLink`'s own header comment explains the retired `/api/click` POST
  route (now a deliberate 204 no-op) — do not resurrect it, do not route
  `store_click` through it.
- **Consent**: `ConsentDefaults.tsx` sets Consent Mode v2 defaults
  (`analytics_storage: denied` globally, region-scoped variant available in
  its own comments but not currently used) as the *first* thing in `<head>`,
  before GA4 or AdSense load. Any new GA4 event Phase 2 adds is subject to
  the same consent gating automatically (it's a property of `gtag()` calls
  in general, not something each call site has to handle itself).

**Homepage render tree** (`src/app/page.tsx`, current, top to bottom):

```
<div> (Archivo font wrapper)
  CinematicHero                              — src/components/home/CinematicHero.tsx
    ParallaxRoot (client, useParallax)        — src/components/home/ParallaxRoot.tsx / useParallax.ts
    H1 + subhead                              — inline in CinematicHero.tsx
    <Suspense><SearchBar variant="hero" autoFocusDesktop /></Suspense>
                                               — src/components/SearchBar.tsx (shared w/ nav)
    TrendingChips                             — src/components/home/TrendingChips.tsx
    HeroStats                                 — src/components/home/HeroStats.tsx
    "Browse the database" button + "Top meta decks →" + "New to Riftbound?…" links — inline
    CountryHeroToggle                         — src/components/CountryHeroToggle.tsx
  MarketPulse (hides if no movers)            — src/components/home/MarketPulse.tsx        <h2>
  TodaysTopDeals (hides if no deals anywhere)  — src/components/TodaysTopDeals.tsx           <h2>
  NewsletterSignup (inline card)               — src/components/NewsletterSignup.tsx
  EbayPicks → EbayPicksLive                    — src/components/EbayPicks.tsx / EbayPicksLive.tsx
  PopularCardsCarousel (tabs)                  — src/components/home/PopularCardsCarousel.tsx <h2> (per active tab)
  ReturnVisitCards (3 cards, EACH its own h2)  — src/components/home/ReturnVisitCards.tsx     <h2> x3
  HowItWorks                                   — src/components/home/HowItWorks.tsx           <h2>
  "Explore the database" (inline section)      — inline in page.tsx (by-set grid + gallery link + by-domain chips) <h2>
  RadianceCountdownCard (hides if none upcoming) — src/components/home/RadianceCountdownCard.tsx <h2>
  LatestPosts (hides if no guides)             — src/components/home/LatestPosts.tsx           <h2>
  ReviewsSection (renders nothing < MIN reviews) — src/components/ReviewsSection.tsx            <h2>
  About + FAQ (inline section, collapsible <details>) — inline in page.tsx                      <h2>
  PartnersStrip (affiliate disclosure)         — src/components/home/PartnersStrip.tsx
  <script type="application/ld+json"> — webPage + faqPage + 2x ItemList
```

Shared chrome (every page, not homepage-specific), from `src/app/layout.tsx`:
`Navbar` (header — search box `variant="nav"`, region switcher
`CountrySwitcher`, nav links, ⌘K `CommandLauncherProvider`, Discord link
already present — `DISCORD_URL` from `src/lib/site.ts`, wired in
`Navbar.tsx` line ~146, opens in a new tab), `PriceAlertModal`,
`SignupPromoPopup` (25s-delayed dialog — pre-existing, out of scope, brief's
"no popups" rule is about NOT adding a *new* one, not removing this
existing one — flagged for a later phase to confirm against the brief's "no
newsletter popup" line, since this IS one; **not resolved in Phase 1**,
left as an explicit open question for Phase 3/4), `FeedbackWidget` (bottom-
right launcher, already hides itself while a `#rc-ad-zone` element
intersects the viewport via `IntersectionObserver` — already satisfies most
of the brief's "audit the Feedback tab" ask; it's a normal-sized
`44px`-ish pill button, not obscuring anything by default), `FooterAds`,
footer (`NewsletterSignup` + `FooterNav` + share row + legal links).

**Nav/footer system** (confirmed comprehensive, matches the FACTS summary):
`src/components/nav-groups.ts` defines `NAV_GROUPS` (⌘K launcher's full
site index, also feeds `/llms.txt`) and derives `FOOTER_GROUPS`
automatically (4 columns, `tests/nav-search.test.ts` pins both the search
ranking behaviour AND the footer-column-balance invariant — max column ≤ 2×
min column, every column ≥ 4 links). Every destination the brief worries
about orphaning already has a real page and a real nav/footer entry:
`/market`, `/movers`, `/sealed`, `/tools/value-finder`, `/tools/deal-finder`,
`/decks`, `/riftle`, `/games/pack-sim`, `/alerts`, `/guides`,
`/stores/tracked`, `/about`. Discord is already linked (`Navbar.tsx`, not
currently in `nav-groups.ts`/footer — only in the header and in
`layout.tsx`'s `orgJsonLd.sameAs`). **Open item for Phase 4**: brief's
footer table explicitly lists "Discord" as something the footer must show;
right now Discord is header-only. Decide there whether to also add it to
`NAV_GROUPS`/footer or leave it header-only (already visible on every page
including the trimmed homepage) — leaning toward "already satisfied,
header is site-wide chrome" but Phase 4 should make the call explicitly and
log it.

**`AffiliateDisclosure`** (`src/components/AffiliateDisclosure.tsx`, not
read in full this phase — referenced by `PartnersStrip.tsx` and
`TodaysTopDeals`'s eBay Partner Network / TCGplayer wording) is the
component that must be verified verbatim per the brief's compliance
requirement — Phase 4/7 to re-verify wording is unchanged after the
rebuild, not just present.

**SEO/JSON-LD constraint** (already pinned by an existing test —
`tests/seo-landing-pages.test.ts`, "the current set's gallery is internally
linked from the key surfaces"): `src/app/page.tsx` **must** keep a link
matching either the literal string `/sets/vendetta/gallery` or the pattern
`` /gallery` `` (a template literal ending in `/gallery`). The current
"See all N Vendetta cards in the gallery →" link inside the inline Explore
section satisfies this via `` `/sets/${newestSet.slug}/gallery` ``. Any
homepage rebuild in Phase 4 **must preserve this link somewhere on the
page** or this test breaks.

**Existing test constraints relevant to later phases** (read the actual
files, this is a summary):
- `tests/nav-search.test.ts` — pins ⌘K/footer search ranking + footer
  column-balance. Do not touch `nav-groups.ts` link labels/keywords without
  re-running this.
- `tests/country-default.test.ts` — pins `DEFAULT_COUNTRY = "US"` and the
  exact fallback code shape in `get-country.ts` / `CountryProvider.tsx`
  (regex-matches literal source text, e.g.
  `INTL_ENABLED \? initial : DEFAULT_COUNTRY`). Don't refactor those two
  files' fallback expressions without checking this test's regexes.
- `tests/ad-responsive.test.ts` — pins `EbayAd.tsx`/`TcgplayerAd.tsx`
  responsive breakpoint behaviour (unrelated to the homepage rebuild
  directly, but `EbayAd`/similar ad components may appear via `FooterAds`
  or `PartnersStrip`'s siblings — don't resize those components without
  checking this).
- `tests/seo-landing-pages.test.ts` — see JSON-LD/gallery-link note above.
  Also pins several unrelated set/riftle page title-and-schema invariants —
  not touched by this task's scope, listed here only so a future phase
  recognizes them as pre-existing and unrelated if `npm test` output
  mentions them.

### Local test environment

**Problem**: sandbox has no live database configured anywhere (no
`DATABASE_URL`/`RM*`/`RH*`/`HISTORY_*` in the shell env or any committed
`.env*` file — `.env.production` only carries the public AdSense client ID,
nothing secret/DB-related). `node_modules` was **also completely absent**
at the start of this phase (not mentioned in the task's FACTS section) —
`npm install` had never been run in this checkout. Both had to be set up
before typecheck/lint/build/test could run meaningfully.

**Recipe** (reproduce exactly, in order):

```bash
cd /home/user/TCGEmpire

# 1. Install JS dependencies — node_modules did not exist at all.
npm install

# 2. Start the pre-installed local Postgres 16 cluster (was stopped).
pg_ctlcluster 16 main start
pg_lsclusters   # confirm "online" on port 5432

# 3. Create a dedicated role + database (NOT the postgres superuser db).
su postgres -c "psql -c \"CREATE ROLE riftcompare WITH LOGIN PASSWORD 'riftcompare_local' CREATEDB;\""
su postgres -c "psql -c \"CREATE DATABASE riftcompare OWNER riftcompare;\""

# 4. .env.local (gitignored via .gitignore's `.env*.local` pattern — see
#    the file itself, already written, do not recreate from scratch):
#    DATABASE_URL="postgresql://riftcompare:riftcompare_local@localhost:5432/riftcompare"
#
#    NOTE: Next.js reads .env.local automatically for `next dev`/`next build`,
#    but the Prisma CLI (`prisma db push`, `prisma generate`) does NOT read
#    .env.local by default — only `.env`. Either export DATABASE_URL inline
#    for prisma commands (what Phase 1 did, shown below) or also write a
#    plain `.env` with the same content (also gitignored, would work too).

# 5. Push the schema (schema.prisma's datasource requires DATABASE_URL in
#    the literal process env for the CLI, not just .env.local):
DATABASE_URL="postgresql://riftcompare:riftcompare_local@localhost:5432/riftcompare" npx prisma db push

# 6. Seed (do NOT edit prisma/seed.ts — data layer, out of scope). This
#    creates 950 real cards + 114 promo cards (1,064 total) — real card
#    data, but ZERO price data (no RetailerPrice/SealedListing/EbayAdListing
#    rows — those only exist after scripts/import-prices.ts runs against
#    live retailer sites over the network, which this task explicitly does
#    not do — see prisma/seed.ts's own "next: npx tsx scripts/import-prices.ts"
#    hint, deliberately not followed here):
DATABASE_URL="postgresql://riftcompare:riftcompare_local@localhost:5432/riftcompare" npm run db:seed

# 7. Playwright: added as a devDependency, but PINNED to 1.56.1, not latest.
#    The pre-installed Chromium at $PLAYWRIGHT_BROWSERS_PATH (/opt/pw-browsers)
#    is build/revision 1194. `npm install --save-dev playwright` installs
#    latest (1.62.x at the time of this phase), which bundles browsers.json
#    expecting Chromium revision 1234 — chromium.launch() fails with
#    "Executable doesn't exist" against the pre-installed 1194 build.
#    Verified by `npm pack`-ing several playwright-core versions and grepping
#    their bundled browsers.json for the chromium revision without a full
#    install: 1.55.0→1187, 1.56.0→1194 (MATCH), 1.56.1→1194 (MATCH),
#    1.57.0→1200. So: playwright@1.56.1 is the version that actually finds
#    the pre-installed browser with zero extra config, exactly as the task's
#    FACTS section promised — but only at that specific pinned version, not
#    "whatever `npm install playwright` gives you today". package.json now
#    pins "playwright": "^1.56.1" — DO NOT `npm update` this package without
#    re-verifying the revision match against whatever's actually on disk at
#    $PLAYWRIGHT_BROWSERS_PATH.
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install --save-dev playwright@1.56.1
# Always run playwright scripts with PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers
# in the environment (it already is, site-wide in this sandbox) and never run
# `npx playwright install` (would try to download over the network into a
# path that already has what's needed, and the FACTS section is explicit not to).

# 8. Boot the app and confirm it actually serves the homepage:
DATABASE_URL="postgresql://riftcompare:riftcompare_local@localhost:5432/riftcompare" npm run dev
# then, from another shell:
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/    # → 200
```

At the end of Phase 1, **both the Postgres cluster and a `next dev` server
are left running** in this sandbox (PIDs are ephemeral/not worth recording;
`pg_lsclusters` / `ps aux | grep next` will show them) so later phases can
reuse them without repeating steps 2/8. If a later phase's session is a
genuinely fresh container, repeat the whole recipe above — everything in it
is idempotent except step 6 (`db:seed` truncates and reseeds; safe to
re-run, just resets any data a later phase added by hand).

This whole setup is **local, ephemeral test infrastructure** — `.env.local`
is gitignored, the Postgres cluster and its data are not part of the repo,
and none of this touches any real/production database (`VERCEL_ENV` stays
unset in this sandbox throughout, which keeps `build-db-push.sh` and the
live price importer in `npm run build`'s script chain as the inert no-ops
the FACTS section described).

### Baseline verification (before any Phase-1-or-later code edit)

Run in this order, against the local Postgres set up above:

| Command | Result | Notes |
|---|---|---|
| `npm install` | ✅ succeeded | 556 packages; pre-existing high-severity `npm audit` findings in transitive deps, not touched (out of scope, pre-existing, not introduced by this task) |
| `npm run typecheck` | ✅ clean (0 errors) | Only failed *before* `npm install` because `node_modules` didn't exist yet (missing `@types/node`, `@prisma/client`, etc. — an install-order artifact, not a real type error) |
| `npm run lint` | ✅ exit 0 | Only pre-existing `react/no-unescaped-entities` warnings (apostrophes/quotes in unrelated pages — `alerts`, `marketplace/*`, `support`, `ArticleView.tsx`, `BulkPricer.tsx`, `MarketplaceOrders.tsx`, `SellerDashboard.tsx`, `SupportForm.tsx`), zero errors, none in homepage-scope files |
| `npm run build` | ✅ exit 0 | Full production build, 150+ routes, homepage (`/`) built as a static (`○`) route — 17.9 kB page / 147 kB First Load JS. Ran against the local DB from the recipe above; `VERCEL_ENV` unset so the DB-push/price-import build steps stayed inert as expected |
| `npm test` | ✅ 578/578 pass | Needed the local DB (many suites hit Prisma directly). Test runner invokes `node --env-file=.env.production …`; `DATABASE_URL` was supplied via explicit shell export (`--env-file` does not override an already-set process env var) rather than by adding it to `.env.production`, since that file is committed and documented as "non-secret production **defaults**" only — a local dev DB URL does not belong in it |

**All four gates are green before any homepage code changes.** No
pre-existing failures to carry forward — later phases can treat any red
result from here on as caused by their own edits.

### Before / local baseline metrics

Two separate tables on purpose — **do not confuse them**:

**(A) Brief's own numbers** — real production, 1,395×881 viewport, full
production data (1,429 cards, real prices, real listings). Quoted verbatim
from the task brief for external context; not reproducible in this sandbox
(no live DB, different viewport). Kept here only so the two are never
conflated:

| Metric | Brief's real-production value |
|---|---|
| Page height | 5,303px = 6.0 screens @ 1395×881 |
| `<h2>` sections | 13 |
| Headings total | 43 |
| Images in `<main>` | 59 |
| Links / buttons in `<main>` | 102 / 47 |
| DOM nodes | 2,038 |

**(B) Local/seeded baseline** — THIS sandbox, current (unmodified as of end
of Phase 1) homepage, against the local Postgres seeded per the recipe
above (1,064 cards, **zero** price/listing data — no live import was run).
Captured via a throwaway Playwright script (not committed —
`scripts/homepage-audit.mjs` is a later phase's real deliverable) against
`next dev` on `localhost:3000`, at the brief's two **hard-target**
viewports (1440×900 and 390×844 — not the brief's measurement viewport of
1395×881, since the Hard Targets table is what later phases are actually
graded against):

| Metric | 1440×900 | 390×844 |
|---|---|---|
| Page height | 4,536px = 5.04 screens | 7,168px = 8.49 screens |
| `<h2>` in `<main>` | 9 | 9 |
| Headings total (h1-h6) | 16 | 16 |
| Images in `<main>` | 3 | 3 |
| Links in `<main>` | 32 | 32 |
| Buttons in `<main>` | 9 | 9 |
| DOM nodes | 941 | 942 |
| `[autofocus]` elements | 0 | 0 |

**Why (B)'s numbers are structurally lower than (A)'s, and why that's
expected, not a discrepancy to chase**: with zero priced/listing data,
every data-dependent section that already fails open on empty data hides
itself exactly as designed — `MarketPulse` (no movers), `TodaysTopDeals`
(no deals in any market), `PopularCardsCarousel`'s image-bearing tiles,
`RadianceCountdownCard` may or may not show depending on `SETS`'s dates
(unrelated to price data), `ReviewsSection` (needs real approved reviews,
has none). The section *shells* mostly still render (headings, "0 priced ·
0 in-stock listings · 0 US stores" stat line visible in the before
screenshot), which is why the `<h2>` count (9) is closer to the brief's 13
than the image/DOM counts are to the brief's — headings don't depend on
priced data, images and interactive rows do. **This means (B) is a valid
before-baseline for verifying the *structural* trim (h2 count, section
count, hero CTA count, autofocus, search-box duplication) that Phases 2-7
will do, but is not a valid stand-in for the brief's own image/DOM/screen-
height numbers** — those should be re-checked against production data (or
at minimum against a richer local dataset) before being reported as the
task's final before/after, or clearly caveated the same way this table is.
Screenshots confirming this are at `artifacts/before/desktop-1440x900.png`
and `artifacts/before/mobile-390x844.png`.

The `search inputs matched: 4` raw count observed during capture (using
selector `input[type="search"], input[aria-label="Search cards"]`) is not a
Hard Target check — it's this phase's own instrumentation, and 4 rather
than 2 is expected: the header's `SearchBar` and the hero's `SearchBar` each
render one `<input>` in the DOM, but `Navbar.tsx` likely renders separate
mobile/desktop nav markup (not yet read this phase). Later phases building
`scripts/homepage-audit.mjs`'s real "exactly one **visible** search input
above the fold" assertion must account for hidden-by-CSS duplicates the
same way — count only elements that are actually visible/in-viewport, not
every `<input>` matching the selector.

### Outstanding items flagged for later phases (not decided in Phase 1)

1. **`SignupPromoPopup`** (25s-delayed dialog, `src/app/layout.tsx`) exists
   site-wide today, predates this task, and reads as exactly the kind of
   interruption the brief's "No newsletter popup, no overlay, no region
   modal. Ever." line rules out — but it is *global* chrome, not a
   homepage-scope component, and the brief's explicit scope line says
   "Homepage, shared homepage components, footer, and analytics only." Left
   undecided here; Phase 3/4 should make an explicit call (most likely:
   leave it, since it's out of the stated file scope, and log that
   reasoning) rather than silently ignoring the tension.
2. **Discord in the footer** — see nav/footer note above. Header-only today.
3. **`AffiliateDisclosure.tsx` exact wording** — not read this phase; Phase
   4/7 must read it in full and confirm it stays byte-for-byte identical
   through the rebuild (brief: "Keep the eBay Partner Network / TCGplayer
   wording verbatim").
4. **GA4 key-event marking** for `store_click` is an **admin-UI-only** step
   (GA4 Admin → Events → mark as key event, or Admin → Key events → New key
   event, by event name `store_click`) — cannot be done from code. Full
   click-path instructions belong in Phase 2's `DECISIONS.md` entry once
   the event actually exists and its exact name/params are final.

### Phase 1 deliverables

- `DECISIONS.md` (this file, created)
- `.env.local` (gitignored, not committed — local DB connection string)
- `artifacts/before/desktop-1440x900.png`, `artifacts/before/mobile-390x844.png`
- `package.json` / `package-lock.json` — added `playwright@1.56.1` as a
  devDependency (pinned, see "Local test environment" above for why the
  exact version matters in this sandbox)
- Local Postgres 16 cluster running with a `riftcompare` role/database,
  schema pushed, seeded (infrastructure, not a committed artifact)

No homepage code, analytics code, or audit script touched this phase —
scope was strictly orientation + infrastructure + baseline, per the phase
brief.

---

## Phase 2 — Analytics (2026-08-17)

Implemented first, ahead of any homepage layout change, per the brief's own
ordering requirement ("do this FIRST... so there's a clean before/after
baseline"). Touched exactly the files the phase brief named:
`src/components/OutboundLink.tsx`, `src/components/SearchBar.tsx`,
`src/components/CountryProvider.tsx`, a new `src/lib/ga-events.ts` shared
helper, a new `src/components/ScrollDepthTracker.tsx`, and one mount point
(`src/app/page.tsx`). `CountryHeroToggle.tsx` itself needed **no** edit — see
the mechanism note below.

### Mechanism findings (read before assuming anything about how region
changes work)

`CountryHeroToggle`, `RegionToggle`, the navbar's `CountrySwitcher`, and two
marketplace pickers all call the **same single** `setCountry()` callback
exposed by `CountryProvider`'s context — there is no per-component "region
changed" code path to instrument separately. So `region_changed` is fired
from **inside `setCountry()` itself**, once, covering every region control
sitewide simultaneously. This deliberately does **not** fire for the two
silent auto-detect paths in the same file (the `/api/geo` IP-detect effect
and the signed-in `preferredCountry` restore effect) — both call `setState()`
directly, bypassing `setCountry()` entirely, because those are the app
choosing a starting market for a visitor who hasn't acted yet, not a person
changing anything. An event named `region_changed` should mean "a person
clicked a market," and only the `setCountry()` path is that.

### Decisions made / assumptions logged

1. **`gtag`'s built-in `transport_type: 'beacon'`**, not a hand-rolled
   `navigator.sendBeacon` call to GA4's collect endpoint, for `store_click`.
   Reasoning: gtag.js already owns serializing a hit for its own endpoint
   (measurement protocol version, client/session ids, consent state, etc.);
   reimplementing that by hand would mean maintaining a second, unofficial
   copy of Google's payload format for no benefit. `transport_type: 'beacon'`
   is gtag.js's own documented mechanism for exactly this situation (an event
   fired as the page is about to unload via a real navigation) and uses
   `sendBeacon` internally when available. Verified working in this sandbox
   via the Playwright script described below (the event lands in
   `window.dataLayer` — see the note under "Verification" for what that does
   and doesn't prove about a real network beacon, since this sandbox's
   `gtag.js` never actually loads from `googletagmanager.com`).
2. **`search_initiated` definition**: fires on whichever happens first —
   (a) the first keystroke that makes the field non-empty, or (b) the field
   staying focused for `FOCUS_INTENT_MS` (1200ms, a constant in
   `SearchBar.tsx`) without either typing or blurring. Only ever fires once
   per component mount (each of the 3 `<SearchBar>` instances in the DOM —
   navbar mobile, navbar desktop, hero — has its own independent "has this
   fired yet" ref, since each is a genuinely separate visitor-facing search
   box). 1200ms was picked as long enough that a tab-through or an
   accidental click-and-immediate-blur doesn't count as intent, short enough
   that a visitor who's paused to think about what to type still gets
   counted before necessarily typing anything. Not empirically tuned against
   real user data (none exists in this sandbox) — if real GA4 data later
   shows this threshold is miscalibrated (e.g. most real "intent" focuses
   resolve in under or over that window), it's a one-constant change.
3. **`search_no_results` fires per settled (debounced) query**, not per
   submitted search. The existing 180ms debounce on the live-preview fetch
   already collapses a fast typist down to the strings they actually paused
   on, so firing on every zero-result settled fetch (rather than only on
   Enter/submit) catches more real product gaps — including a query the
   visitor typed, saw had no matches, and adjusted before ever pressing
   Enter — without meaningfully flooding GA4.
4. **`suggestion_rank` in `search_suggestion_selected` is 1-based across the
   WHOLE dropdown** (cards first, then sealed products below, continuing the
   same count), not two independent per-section counts starting at 1 each —
   it matches what the visitor actually saw top-to-bottom in one list.
5. **`ScrollDepthTracker` is mounted from `src/app/page.tsx`, not
   `src/app/layout.tsx`.** The brief left this an explicit choice. Reasoning:
   Next's App Router keeps a layout mounted across client-side navigations
   between routes that share it — only the route segment below it swaps. A
   tracker mounted in the root layout (which wraps every route in this app)
   would only run its mount effect once per full document load, not once per
   pageview — a visitor who went home → a card page → back home via
   client-side `<Link>`s would get scroll-depth events for only the first of
   those two homepage visits, silently undercounting the second. Mounting
   inside `page.tsx` means the "/" route segment (and the tracker's `fired`
   Set with it) is torn down and recreated on every navigation TO the
   homepage, which is exactly "once per pageview." The component itself
   (`src/components/ScrollDepthTracker.tsx`) has zero homepage-specific code
   — it's written as generic, reusable chrome any other route can mount the
   same way once scroll-depth reporting is wanted there too, matching the
   brief's "shared" framing even though only the homepage uses it today.
6. **`gaEvent()` guard is `typeof window.gtag === "function"`**, exactly as
   the phase brief specified, and deliberately does **not** re-check consent
   state itself. `window.gtag` is defined by `ConsentDefaults.tsx`'s inline
   `<head>` script as the very first thing on the page (`function
   gtag(){dataLayer.push(arguments)}`), before Consent Mode's grant/deny
   decision is even made — so this guard is really "does the shim exist at
   all" (true unless `GA_ENABLED` is off, or an ad blocker deleted it), not
   "has this visitor consented." Consent gating is a property of `gtag()`
   itself (Consent Mode v2's `analytics_storage` default, flipped by
   `lib/use-consent.ts`'s grant), already covers every event pushed through
   it automatically, and needed no new code this phase — see `ga-events.ts`'s
   header comment for the full mechanism chain.
7. **`OutboundLink`'s five new props (`cardId`, `cardName`, `price`,
   `positionInList`, `pageType`) are all optional and unwired at every
   existing call site.** Per the phase brief's own instruction, only the
   base params (`store`/`retailer`, `market`/`country`, and now
   `transport_type`) are populated everywhere; the richer per-card params
   stay `undefined` at the 20+ existing call sites (`TodaysTopDeals`,
   `PartnersStrip`, `EbayPicksLive`, card-detail buy buttons, the
   marketplace, etc.) until a later phase touches each one for its own
   reasons (Phase 3/4's homepage work, most obviously the proof strip and
   the collapsed deals row) and wires the fields it already has in hand.
   This is expected and intentional, not an oversight — an event missing an
   optional field is normal in GA4, not an error.

### A pre-existing build breakage found and fixed (not caused by this
phase's own feature work, but blocking every phase after it if left alone)

`npm run build` failed on a clean checkout of Phase 1's own final commit
(confirmed via `git stash` — the failure reproduces with **zero** of this
phase's edits applied). Root cause: Phase 1 added `playwright` as a real
`package.json` devDependency (previously it was an *optional*,
not-listed dependency, dynamically `import()`-ed inside a `try/catch` in
four `scripts/*.ts` probe/fetch utilities, each guarded by a `// @ts-expect-
error` comment because TypeScript couldn't resolve an unlisted package).
Once `playwright` became a real listed dependency, that dynamic import
started type-checking cleanly on its own — which makes the now-unnecessary
`@ts-expect-error` comment itself a TypeScript error (`TS2578: Unused
'@ts-expect-error' directive`), a hard failure under this repo's strict
`tsc --noEmit` gate that `next build` runs as part of its own build step.

This is a side effect of Phase 1's dependency change, not this phase's
analytics work, and normally the instruction is "note pre-existing failures,
don't burn the phase chasing them" — but every phase from here on needs a
green `npm run build` to verify its own changes, and the fix was a trivial,
safe, one-comment-block removal in four files with zero behavioral change
(the dynamic `import("playwright")` line itself is untouched; only the now-
stale `@ts-expect-error` escape hatch above it was removed, in
`scripts/fetch-official-images.ts`, `scripts/fetch-vendetta-official.ts`,
`scripts/probe-imgur.ts`, `scripts/probe-render.ts`). Fixed here so the
build stays green for the rest of this task rather than leaving every
subsequent phase to independently rediscover and re-diagnose the same
Phase-1-caused break.

### A dev-server gotcha hit while verifying (environment note, not a code
change)

Running `npm run build` (a production build) while Phase 1's `next dev`
server was still running against the same `.next` directory corrupted the
dev server's module registry (`next build` and `next dev` don't share a
`.next` layout — the production build's manifest overwrote files the
running dev server's webpack HMR runtime still had open handles/references
to). Symptom: every route started 500ing with `Cannot find module
'./8948.js'` until the dev server was killed and restarted fresh. Fixed by
killing the stale `next dev` process and starting a new one (same
`DATABASE_URL`-prefixed command as Phase 1's recipe). **Flagging for every
later phase**: do not run `npm run build` and rely on a concurrently-running
`next dev` staying healthy afterward — restart `next dev` after any build,
or run the build only when no dev server needs to stay up.

### Known gap logged for a later phase: trending-chip clicks are GA4-blind

`TrendingChips.tsx` (rendered in the hero, one row of 6 cards under the
search box) already fires a **Vercel Analytics** `track("trending_chip_click",
…)` event, but nothing in GA4. The measurement doc (`docs/homepage-
measurement.md`) defines "search initiation rate" as search-or-trending-chip
activity, which is the metric the redesign should be judged on — but a GA4
Exploration cannot read Vercel Analytics data, so today that metric can only
be computed from `search_initiated`/`search_submitted` in GA4 (a slight
undercount) plus a separate manual check of the Vercel Analytics dashboard
for the chip-click slice. **Not fixed this phase**: `TrendingChips.tsx` is
not one of the files this phase's brief named, and Phase 3 ("Hero & Search")
already touches that exact component for its own reasons (the brief keeps
trending chips in the rebuilt hero) — that is the natural place to add a
`gaEvent("search_initiated", { trigger: "trending_chip", … })` or similar
call alongside the existing `track()` call, not a reason to leave it
unaddressed forever. Logged here so it isn't forgotten.

### Known gap logged for a later phase: `OutboundLink` doesn't forward
`aria-label`

Discovered while writing the verification script (see below): `src/
components/home/PartnersStrip.tsx` passes `aria-label="eBay Partner
Network"` / `aria-label="TCGplayer"` straight to `<OutboundLink>`, but
`OutboundLink`'s prop type has never declared or forwarded an `aria-label`
(or any other pass-through DOM attribute) to the `<a>` it renders — confirmed
against the live rendered DOM, the attribute never reaches the page. Since
both of those specific links render as decorative colored letter-spans with
no other accessible text, this is a real pre-existing accessibility gap (an
unlabeled link) sitewide wherever the same pattern is used, not just on the
homepage. **Not fixed this phase**: changing `OutboundLink`'s rendering
surface for an unrelated accessibility concern, while already mid-edit on it
for `store_click`, risked conflating two unrelated changes in one component
this phase wasn't asked to audit for accessibility. Flagging explicitly for
Phase 5 ("Accessibility & Mobile polish"), which already owns exactly this
class of fix.

### Open question for the account owner (cannot be resolved from code)

**GA4 engagement-time-limit setting** (Admin → Data Streams → [stream] →
"Adjust session timeout" region, or Admin → Data Collection → session
settings, depending on which GA4 admin UI revision the account is on — the
setting is called "engagement time" or "session timeout" and defaults to
10s, adjustable 10–60s): this phase has no way to read the property's live
admin configuration from code, and the setting silently changes what counts
as an "engaged" session independent of anything in this codebase. **Action
needed from the account owner**: log the property's actual current value
here (this file) before the first before/after comparison in `docs/homepage-
measurement.md` is pulled, and do not change it between the before and after
measurement windows — see that doc's §5 for why.

### GA4 key event — exact click path for the account owner

`store_click` must be marked as a GA4 **key event** (formerly called
"conversion" in GA4's UI prior to a 2024 rename — if the property still
shows the old label, look for "Mark as conversion" instead). This cannot be
done from code; it's a one-time manual step in the GA4 web UI:

1. Go to **analytics.google.com**, select the RiftCompare property
   (measurement ID `G-B5BB9ZRWM3` unless a `NEXT_PUBLIC_GA_ID` env override is
   in place — check `src/lib/ga.ts` if unsure which property this is).
2. Click **Admin** (the gear icon, bottom-left of the left nav).
3. Under the **Property** column, click **Events** (in newer GA4 UI
   revisions this may show as **Data display → Events**).
4. **`store_click` will only appear in this list after it has fired at
   least once in production** (GA4 populates the event list from real
   traffic, not from code). Once deployed, wait for at least one real
   outbound click, then refresh this page.
5. Find `store_click` in the events table. Toggle the **"Mark as key event"**
   switch in its row to ON.
   - If the toggle isn't visible in that table (older UI revision): go to
     **Admin → Key events** instead, click **New key event**, and select
     `store_click` from the event-name dropdown (it only appears there once
     it has fired at least once), then **Save**.
6. Confirm it took: **Admin → Key events** should now list `store_click`
   with a checkmark. It can take up to 24 hours for historical/Realtime
   reports to fully reflect the change; new sessions are affected
   immediately.
7. Do **not** also mark any of the `search_*` events or `region_changed` as
   key events — per `docs/homepage-measurement.md`, they're diagnostic
   signals for the "search initiation rate" metric, not conversion signals,
   and marking them as key events would dilute what "Session key event rate"
   means in the Exploration that doc sets up.

### Verification — how the events were proven real, not just plausible

Wrote a throwaway Playwright script (not `scripts/homepage-audit.mjs` — that
is Phase 6's real deliverable) that launches a real Chromium against the
local `next dev` server, drives real user interactions (typing, focusing,
clicking a suggestion, pressing Enter, scrolling, switching region, clicking
an outbound link), and asserts on the contents of `window.dataLayer` rather
than reading the source and assuming it works. This is possible without any
real network egress to Google because `ConsentDefaults.tsx`'s inline
`<head>` script defines `function gtag(){dataLayer.push(arguments)}` itself
— that shim exists (and is exactly what `gaEvent()` calls) regardless of
whether the real `gtag.js` ever finishes loading from
`googletagmanager.com`, so every event this phase added shows up as a plain
array in `window.dataLayer` the instant it fires, which the script reads
back and asserts against.

**What this does and does not prove**: it proves each event fires with the
right name, the right params, the right trigger conditions (once per mount,
no re-fire on scroll-up-then-down, etc.) — real client-side behavior, not
just "the code looks right." It does **not** prove a real network beacon
reaches Google's collectors in production, since `gtag.js` never actually
loads in this sandboxed environment (no path to `googletagmanager.com`) —
that half is only verifiable after a real deploy, by checking GA4 Realtime
or DebugView against real traffic.

Final run, 22 assertions across all 8 events/behaviors (`search_initiated`
×2 triggers, `search_no_results`, `search_suggestion_selected`,
`search_submitted`, `scroll_depth` fire-once-per-threshold semantics,
`region_changed`, `store_click` with beacon transport): **22/22 passed**.
Each test runs in its own fresh browser instance (not just a fresh page) —
a real flake was found and fixed during this phase where a ctrl-clicked
link's spawned popup tab occasionally left a *shared* browser context in a
state where a later test's `page.goto()` failed with "Target page, context
or browser has been closed"; full per-test isolation costs a few seconds of
extra Chromium startup but removed the flake entirely. The script also
surfaced two real, pre-existing bugs while being written — the `Approved
partners` div `:has-text()` selector initially clicked the wrong link on the
page entirely (see the `aria-label` forwarding gap logged above, which is
*why* a text-based selector was tried in the first place: the more obvious
`getByLabel("eBay Partner Network")` locator found nothing, because that
label never reaches the DOM), and `store_click`'s test needed a URL-param-
based selector (`a[href*="partners_strip"]`, matching the `source` tag
`PartnersStrip.tsx` passes into `ebaySearchUrl()`) once the div-based
selector was shown to be unreliable. The script itself was not committed
(explicitly out of scope per the phase brief — `scripts/homepage-audit.mjs`
is Phase 6's deliverable) and was deleted after use.

### Verification results (this phase's own changes)

| Command | Result | Notes |
|---|---|---|
| `npm run typecheck` | PASS (0 errors) | Confirmed the 4 pre-existing `scripts/*.ts` errors reproduce identically with this phase's diff `git stash`ed out — not caused by this phase; fixed anyway (see above) since they block every later phase's build |
| `npm run lint` | PASS (exit 0) | One new warning surfaced and fixed: `SearchBar.tsx`'s debounced-fetch `useEffect` needed `variant` added to its dependency array (it's read inside for the `search_no_results` event) — `variant` is a static prop per mount, so this changes no runtime behavior, just satisfies `react-hooks/exhaustive-deps` honestly instead of suppressing it. All other lint output is the same pre-existing `react/no-unescaped-entities` warnings in unrelated files Phase 1 already catalogued |
| `npm run build` | PASS (exit 0) | Homepage (`/`) still builds as a static (`○`) route, 18.4 kB page / 148 kB First Load JS (up from Phase 1's baseline 17.9 kB / 147 kB — the delta is this phase's own analytics code, expected) |
| `npm test` | PASS — 578/578 | Full suite, against the local seeded DB, unchanged pass count from Phase 1's baseline — this phase touched no test-covered contract (search ranking, footer balance, country-default fallback, etc.) |

### Phase 2 deliverables

- `src/lib/ga-events.ts` (new) — shared `gaEvent()` helper
- `src/components/ScrollDepthTracker.tsx` (new) — 25/50/75/90% scroll-depth
  events, fire-once-per-threshold-per-pageview
- `src/components/OutboundLink.tsx` — `store_click` GA4 event, 5 new optional
  props, beacon transport
- `src/components/SearchBar.tsx` — `search_initiated`,
  `search_suggestion_selected`, `search_submitted`, `search_no_results`
- `src/components/CountryProvider.tsx` — `region_changed`
- `src/app/page.tsx` — mounts `<ScrollDepthTracker />`
- `scripts/fetch-official-images.ts`, `scripts/fetch-vendetta-official.ts`,
  `scripts/probe-imgur.ts`, `scripts/probe-render.ts` — removed 4 now-stale
  `@ts-expect-error` comments (build-breakage fix, see above; no behavioral
  change)
- `docs/homepage-measurement.md` (new) — engagement-rate-not-bounce-rate
  framing, "search initiation rate" definition, GA4 Exploration setup,
  Contentsquare context, no-published-TCG-benchmark honesty note
- This `DECISIONS.md` section
