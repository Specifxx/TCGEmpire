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

---

## Phase 3 — Hero & Search (2026-08-17)

Re-read `git log` and this file in full before starting (per instructions) —
confirmed analytics wiring from Phase 2 (`gaEvent`, `search_initiated`,
`search_suggestion_selected`, `search_submitted`, `search_no_results`,
`region_changed`, `store_click`) was live and untouched at the start of this
phase, and built on top of it rather than around it.

### What was already satisfied — verified, not rebuilt

Before writing anything, read `CountryHeroToggle.tsx`, `CountryProvider.tsx`
and `src/app/api/geo/route.ts` fresh, per this phase's own instruction not to
assume. Result: **the brief's region-auto-detect ask (item 2) was already
fully implemented**, by a prior optimisation pass, and needed zero code
changes:

- `src/app/api/geo/route.ts` is exactly the "existing geo API route" the
  phase brief told me to look for before building anything new — a
  read-only, side-effect-free `GET` that reads Vercel's
  `x-vercel-ip-country` header and returns `{ country, currency }`. No
  mutation, no cookie write from inside the route itself.
- `CountryProvider.tsx`'s mount effect calls this route once, **only when no
  country cookie exists yet**, and on success calls `setState()` directly
  (not `setCountry()` — see Phase 2's mechanism note on why that matters:
  it's what keeps `region_changed` firing only for a person's own click, not
  the app's silent starting guess) plus writes the cookie so the *next*
  server render already agrees. This is IP-based **auto-detect that sets a
  default**, never an IP-based **redirect** — the URL never changes, only
  client-side state and a cookie — which is exactly what Google's
  multi-regional guidance
  (https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites)
  asks for: Googlebot crawls from the US and must see the same URL structure
  every other visitor does.
- `CountryHeroToggle.tsx` shows the resolved country as a **labelled**
  active chip ("Shopping from" eyebrow + a highlighted "US · USD" pill) in a
  small, quiet, low-contrast segmented control directly under the search
  box — not a six-button strip competing for attention, never a blocking
  modal. There is exactly one instance of it in the hero; no second/duplicate
  region strip exists anywhere in `CinematicHero.tsx`.
- The choice, once a visitor explicitly picks one, persists via
  `document.cookie` (1-year `COUNTRY_COOKIE`), and a signed-in account's
  choice also persists server-side (`preferredCountry`) — both already
  wired, both pre-existing.

Given all of this was already correct and already read-only/side-effect-free
per the phase's own scope guardrail, no `api/geo` change, no new geo logic,
and no `CountryHeroToggle`/`CountryProvider` edit was needed for item 2.
Logged here so a later phase doesn't waste time re-verifying it, and so it's
on record that this wasn't skipped, just already done.

Also verified, not changed: `AffiliateDisclosure`/`PartnersStrip` wording
(Phase 1 flagged this as unverified) — read `PartnersStrip.tsx` in full while
screenshotting the hero for this phase's own verification; the eBay Partner
Network disclosure line is present, unchanged, below the fold, out of this
phase's file scope (footer/partners work belongs to Phase 4). Not re-quoted
here since Phase 4 owns re-verifying it against the brief's "verbatim"
requirement as part of its own footer audit.

### Hero copy (item 1)

`src/components/home/CinematicHero.tsx`:

- H1 changed from *"Compare Riftbound card prices across AU, NZ, US, UK, SG
  & CA stores"* (60+ chars, market-listing) to *"Find the cheapest place to
  buy any **Riftbound** card"* (51 chars, job-stating) — the brief's
  suggested shape, close to verbatim. "Riftbound" kept (still wrapped in the
  brand-green `<span>`) for SEO. Still says nothing about which market is
  active, so the page's ISR/no-cookie-reads contract (see the existing
  comment directly above the H1, untouched) is unaffected — one server-
  rendered version still serves every visitor and every crawler.
- Subhead cut from a 3-line, 200+ character paragraph that named all six
  countries a second time, to one 68-character sentence: *"Compare live
  prices across every major Riftbound store, instantly."* No country names —
  they live in the region toggle (unchanged, see above) and stay in the
  SEO/FAQ block at the foot of the page (not touched this phase, per the
  phase brief's own scope note).

### Hero CTA trim (item 4)

Deleted from the hero, per the brief: the "Browse the database" filled
button, "Top meta decks →", and "New to Riftbound? Learn how to play →".
Replaced with exactly one plain-text link, `Browse all {totalCards.
toLocaleString()} cards →`, pointed at `/browse` (where "Browse the
database" already linked) — `totalCards` is the same prop already threaded
in from `page.tsx`, not a hardcoded number. There was no second/duplicate
search box or region strip already in the hero to remove (see above) — the
"delete the duplicate search box" and "delete the duplicate region strip"
items in the phase instructions were already satisfied before this phase
started.

**A pre-existing test pinned the removed `/learn` hero link and had to be
reconciled, not just made to pass.** `tests/internal-linking.test.ts`
(predates this task — see its own header comment referencing
`GROWTH-AUDIT.md § 2`) asserted the hero's server HTML must literally contain
`href="/learn"`, with descriptive anchor text, because `/learn` used to be a
genuine crawler orphan (zero inbound links, sitemap priority 0.8) and the
hero link was the fix. The homepage-redesign brief explicitly instructs
removing that exact link, so this phase's own change and that pre-existing
test are in direct, intentional conflict — this is not a regression to
revert.

Resolution: since Phase 1, `/learn` has gained a **second, independent, more
robust** fix for the same orphan problem — a real entry in `nav-groups.ts`
(`{ href: "/learn", label: "Learn Riftbound", ... }`, group "Guides & News",
no `hideInFooter` flag) that flows into `FOOTER_GROUPS` and renders via
`FooterNav.tsx` (a plain server component, real `<Link href>` anchors, no
"use client") from `layout.tsx`'s unconditional `<footer>` — present on
every route, including "/", not just the hero. That fix is strictly better
than the one it replaces (sitewide, not homepage-only), so I rewrote the
test to pin *that* mechanism instead of grepping one specific component for
one specific href: `/learn` has a real, non-hidden `nav-groups.ts` entry
→ that entry's group is actually one of the groups spread into
`FOOTER_GROUPS` (not launcher-only) → `FooterNav.tsx` renders those links as
real anchors, not JS-only navigation → the root layout renders `<FooterNav
/>` unconditionally. Four small, source-level tests, same rigor as the
originals (still checks for JS-only-navigation footguns, still checks label
descriptiveness), pointed at the surface that's now authoritative. Also
rewrote the file's third test ("the hero does not become a wall of competing
CTAs") — its old regex targeted a CSS class string (`flex flex-wrap
items-center justify-center gap-x-4`) that no longer exists now that the CTA
row is a single link, so it was passing **vacuously** (matching nothing,
`0 <= 2`) rather than testing anything current. Replaced with a direct count
of `<Link` elements in the whole file (now pinned at exactly 1) plus an
explicit check that it isn't styled `btn-primary` (a filled button = a second
CTA in disguise). All four tests pass; full suite is still 581/581 (was
578/578 before this phase — net +3 tests: one test removed, four added, see
below for why the count doesn't move 1:1 with "tests I touched").

This required editing a test file, which is outside this phase's literal
"Homepage, shared homepage components, footer, and analytics only" scope
note. Judgment call: leaving the build/test suite red because a prior,
unrelated pass pinned behavior the CURRENT task explicitly instructs changing
would violate the harder rule ("Never leave the build red... anything your
own edits broke must be fixed before you finish"), and reverting my hero
change to keep the old test green would directly contradict the brief. Test
files aren't card-detail-pages/search-backend/pricing-logic/scraper/API (the
things explicitly off-limits), so I judged this the least-bad path and
logged it here rather than picking silently.

### Stat line compression (item 5)

`src/components/home/HeroStats.tsx` rewritten to the brief's exact shape:
`{cards} cards · {stores} {market} stores · prices updated {freshness}` (one
`<p>`, one line, freshness clause omitted entirely when null exactly as
before). Two clauses dropped from display: `{priced} priced` and `{inStock}
in-stock listings` — the brief's compressed example doesn't include them,
and re-reading the brief's own words for this line — "this is trust signal,
not navigation — style it accordingly" — I read as also meaning: this line
should stop being three separate `<Link>`s (to `/browse`, `/tools/deal-
finder`, `/stores/tracked`) competing for above-the-fold interactive-target
budget alongside the actual primary elements. All three links removed; the
line is now plain muted text. `/browse` stays reachable from the hero's own
"Browse all N cards →" link right below the search box (unchanged
destination); `/tools/deal-finder` and `/stores/tracked` stay reachable
sitewide via nav/footer (confirmed both have real `nav-groups.ts` entries,
same mechanism verified above for `/learn`) — nothing is orphaned, per the
brief's own "nothing gets deleted" framing.

`MarketStat`'s `priced`/`inStock` fields, and `page.tsx`'s Prisma queries
that compute them, are **untouched** — they're still threaded through as
props even though this component no longer renders them, per this phase's
own instruction to "match HeroStats.tsx's existing prop shape... don't guess
the data plumbing." Trimming those now-unused queries out of `page.tsx` is a
separate, small, low-risk future cleanup this phase deliberately didn't do,
to keep this phase's diff to hero/search only.

### Header search: hide-until-scroll, homepage-only (item 6)

New `src/components/HeaderSearchSlot.tsx`, wired into `Navbar.tsx` around
**only** the desktop (`lg:block`) search wrapper — the separate mobile
full-width row (`pb-3 lg:hidden`) is untouched. Scoped via `usePathname() ===
"/"` read inside the new client component (not a prop threaded from a
homepage-specific wrapper — `Navbar` itself stays a server component with no
new client boundary of its own; `HeaderSearchSlot` is the one small client
piece that needs to know both the route and the scroll position). On every
route other than "/", it's a pure no-op — `scrolled` starts and stays `true`,
so the search box renders exactly as it always has, no behavior change,
verified via the full test suite still passing and via `npm run build`'s
route list still showing sane bundle sizes on other routes.

On "/", it reuses `NavbarShell`'s own `scrollY > 8` threshold (a second,
independent scroll listener with the same number, not a shared one — see
"what I did not do" below) so the header search reappearing reads as part of
the same "you've scrolled" moment as the header's frosted-background
transition, not a separately-timed effect. Hidden via Tailwind's `hidden`
class (`display:none`), **never unmounted** — confirmed via a real
Playwright run that the `<input>` is present in the DOM immediately
(`document.querySelector` finds it) even before any scroll, satisfying "keep
it... always in the DOM for crawlers" literally, not just in spirit.

**What I did not do**: thread `NavbarShell`'s existing `scrolled` boolean
into `HeaderSearchSlot` via context so there's only one scroll listener
instead of two. `NavbarShell` currently takes a plain `children: ReactNode`
(JSX, not a render-prop), and `Navbar.tsx` is a server component — turning
that into a shared client context would mean either converting `Navbar`
itself to a client component (unnecessary blast radius for a one-field
value) or adding a new context provider file for a single boolean two
components already compute independently and cheaply (a rAF-throttled
`scrollY` read is negligible). Two independent `scrollY > 8` listeners
computing the same threshold is a very small duplication next to that cost;
logged here as a real design trade-off, not an oversight, in case a later
phase wants to unify it.

**Real, measured tension with the master brief's own hard target — flagged
explicitly for Phase 6/7, not silently resolved either way.** This phase's
own instructions (quoting the brief) say: "keep it always present on mobile
and always in the DOM for crawlers" — i.e. mobile does **not** get the
scroll-gate at all, only desktop does ("consider hiding... until scroll on
desktop"). Implemented exactly that: the mobile nav row is completely
unaffected by `HeaderSearchSlot`. But the master brief's Hard Targets table
separately demands **zero duplicate search boxes above the fold**, with no
desktop/mobile carve-out stated there. On a real 390×844 screenshot (taken
this phase, see `artifacts`-equivalent scratch shot, not committed — Phase 6
owns `artifacts/`), the header's mobile search row (top of page, inside the
sticky header) and the hero's own search box **are both visible in the same
first screen** — a real, structural duplicate-search-box-above-the-fold
situation on mobile specifically, caused by following this phase's own
literal instruction. This is NOT a data-sparsity artifact of the local seed
DB — it's true regardless of how rich the price data is, because the header
is always at the very top of every page and the hero search sits directly
below it. I implemented the phase's literal instruction rather than
unilaterally overriding it (the instruction was unambiguous, and it's
possible a later phase's holistic view of the hard-target numbers is the
right place to decide whether to override it), but this needs an explicit
decision from Phase 6 (when `scripts/homepage-audit.mjs`'s "exactly one
visible search input above the fold" assertion is built — it will need to
either accept 2 on mobile with a documented exception, or this behavior
needs to change) or Phase 7 (final verification/reconciliation). Options for
whoever picks this up: (a) accept 2 as correct per this phase's literal
brief text and adjust the audit's mobile assertion accordingly with a
comment citing this entry; (b) scroll-gate mobile too, contradicting "always
present on mobile" but satisfying the hard target; (c) shrink/simplify the
header's mobile search row into something that doesn't count as a full
second "search box" (e.g. a smaller icon-trigger). Not decided here.

### Search UX — `SearchBar.tsx` (item 7)

Rewrote the shared component (both `variant="nav"` and `variant="hero"` —
kept as one implementation per the codebase's own "exactly one search
implementation" principle, not forked). Every change below applies to both
variants unless noted.

1. **Autofocus gating tightened.** Was `matchMedia("(min-width: 1024px)")`
   alone; now also requires `matchMedia("(pointer: fine)")` — both must
   hold. Reasoning (also in the component's own doc comment): a touch
   tablet or a phone browser's "request desktop site" mode can report
   ≥1024px while still being a touch-primary device, and stealing focus
   there still pops the on-screen keyboard before the visitor has read
   anything. `pointer: fine` reports the device's **primary** pointer, so a
   laptop with both a touchscreen and a trackpad still autofocuses
   correctly (trackpad/mouse is that device's primary input even though
   touch is also physically available) — this was the brief's own worked
   example ("a touch laptop with a fine pointer is a real case worth
   thinking about") and I followed it literally: AND, not a replacement of
   the width gate.
2. **`/` global shortcut**, implemented as a `document`-level `keydown`
   listener registered once per mounted `SearchBar` instance (up to 3 exist
   on the homepage at once: nav desktop, nav mobile, hero). Skips entirely
   while focus is already inside any input/textarea/contenteditable. Each
   instance independently checks whether **its own** input is currently
   visible (`offsetParent !== null` for the `display:none` case, **plus** a
   `getBoundingClientRect()` intersection-with-viewport check) before
   reacting — the viewport check specifically exists because `offsetParent`
   alone can't distinguish "hidden via CSS" from "merely scrolled out of
   view," and without it, once a visitor scrolls past the hero on the
   homepage, the now-off-screen hero box (still `display:block`, just
   scrolled away) would fight the now-visible header box for the shortcut.
   **Known, accepted, minor limitation** (documented in the component's own
   comments): during the few hundred pixels of scroll where the header
   search has just reappeared (>8px) but the hero search is still mostly
   on-screen too, both instances' visibility checks can pass simultaneously,
   so which one wins isn't fully deterministic. Not engineered further
   (would need a cross-instance singleton/coordinator) — both outcomes are a
   real, visible, functioning search box, so the cost of this ambiguity is
   low and short-lived.
   A small visible `/` badge renders inside the field (a `<kbd>`, `aria-
   hidden`, decorative only — the real listener is document-level, not on
   the badge) whenever the field is empty (focused or not), and disappears
   the instant the visitor types — so it never has to fight with typed text
   for space, and no extra right-padding is needed beyond a small `sm:pr-*`
   safety margin. Hidden below the `sm` breakpoint (a touch keyboard has no
   physical `/` key worth advertising).
3. **Baymard autocomplete refinements, all implemented**:
   - **Suggestion cap**: 10 desktop / 6 mobile (`matchMedia("(max-width:
     767px)")`, within Baymard's stated 4-8 mobile band), applied as a hard
     slice on the combined list (cards-then-sealed in query-state,
     trending-then-recent in zero-state) so the total row count — not a
     fixed panel height — is what stays bounded. This is also how "no
     scrollbar, ever" is satisfied: the `max-h-[70vh] overflow-y-auto` that
     used to wrap the list is gone entirely; there is nothing to overflow
     because the row count itself never exceeds the cap.
   - **Bold ONLY the predicted portion**, not what the visitor typed — the
     reverse of the naive approach, per Baymard's finding. A small
     `HighlightedLabel` component finds the query as a case-insensitive
     substring and wraps everything AFTER the matched span in `<strong>`;
     everything up to and including the match renders plain. Falls back to
     fully-plain text when the query isn't a literal substring of the
     label (a typo/fuzzy backend match) rather than guessing at a highlight
     that would be misleading.
   - **Active suggestion highlighted visibly** — a `ring-1 ring-inset
     ring-brand-500/50` on top of the same background a mouse-hover gets, so
     the keyboard-active row reads as distinct, not just "currently
     hovered."
   - **Full arrow-key navigation**, wrapping in both directions, computed
     over whichever list is actually showing (zero-state trending+recent, or
     query-state cards+sealed) so the highlight and `Enter` always agree
     with what's visually on screen. The arrowed-to suggestion's plain text
     **copies into the input** (a `displayValue` derived from
     `activeSuggestion` when one is set, falling back to the real typed
     `value` otherwise) so the visitor can keep editing from it — the
     underlying `value` driving the debounced fetch is untouched until an
     actual keystroke commits the new text and resets `activeIndex`, so
     arrowing through suggestions never re-triggers the search API.
   - **Set code, collector number, and price already shown per row** —
     verified this was already true in the pre-existing implementation and
     preserved unchanged (card/trending rows: `{setCode} · {collectorNumber}`
     + `fmt(price(card))`; sealed rows: `{productType} · {setCode}` +
     `fmt(lowestPriceCents)`).
4. **Zero-state** (empty/near-empty field, focused): shows trending chips
   **as suggestions** (when the `trendingCards` prop is passed — see below)
   plus recent searches from `localStorage` (`rc_recent_searches`, capped at
   5, deduped case-insensitively, most-recent-first) when present. Confirmed
   via a real interaction test (see Verification below) that with zero
   trending data AND zero recent-search history, the dropdown correctly
   stays **closed** rather than opening on nothing — then confirmed that
   after one real search, the SAME field's zero-state correctly shows that
   exact recent query on the next focus. `trendingCards` is a new **optional**
   prop, wired only from `CinematicHero` (which already computes this data
   server-side for the always-visible `TrendingChips` row below the box) —
   deliberately **not** wired from the nav variant. Reasoning: the nav
   `SearchBar` renders on every one of 150+ routes via shared `layout.tsx`
   chrome; giving it trending-card data would mean either a new sitewide
   data fetch (real risk: this codebase has hit its DB transfer allowance
   multiple times per `lib/db.ts`'s own comments, cited elsewhere in this
   codebase) or threading homepage-specific server data through global
   chrome, neither of which this phase's scope ("Homepage, shared homepage
   components, footer, and analytics only" — the nav variant living outside
   the homepage isn't really "a homepage component") justified for what
   degrades gracefully anyway. The nav variant's zero-state still works —
   recent searches only, exactly the brief's own fallback ("they may not
   [exist] — that's fine, the feature should just be inert until there's
   history").
5. **ARIA combobox**, full pattern: `role="combobox"`, `aria-expanded`,
   `aria-haspopup="listbox"`, `aria-controls` (→ a real `id={listboxId}` on
   the `<ul role="listbox">`), `aria-autocomplete="list"`, and
   `aria-activedescendant` pointing at the currently-arrowed option's id
   (unset when nothing is active). Each option (`<Link>` for
   card/trending/sealed rows, `<button>` for recent-search rows — the only
   row type with no natural href to navigate to) carries `role="option"`,
   a stable id, `aria-selected`, and `tabIndex={-1}` — options are reachable
   by arrow key via `aria-activedescendant`, not by Tab, per the standard
   ARIA 1.2 combobox pattern (focus stays on the input the whole time).
   `id`s are built from `useId()` (React 18) so the up-to-3 simultaneously-
   mounted `SearchBar` instances on one page never collide.
   Modifier-clicks (ctrl/cmd/shift, or a real middle-click) on card/trending
   rows still open the card page in a new tab via native anchor behavior,
   unchanged from before; the same modifiers held on a keyboard `Enter`
   trigger an explicit `window.open` (there's no native href-click for a key
   press to fall back on) — implemented as parallel, explicit code paths
   per row kind (`activateCardLike`, `activateSealed`, `commitSearch`) rather
   than trying to synthesize/dispatch a fake click event on the anchor,
   which would have been more DRY but relies on undocumented interop between
   a dispatched `MouseEvent` and Next.js `<Link>`'s internal navigation
   handler — correctness over cleverness here, given this is exactly the
   code path Baymard's testing says causes real user-facing mis-selection
   when it's subtly wrong.
6. **Mobile obscuring audit** (this phase's own instruction: verify
   `SearchBar`'s own z-index/positioning isn't the problem before Phase 5
   touches `FeedbackWidget`). Confirmed via a real 390×844 Playwright run:
   the dropdown panel is `z-50`; `FeedbackWidget`'s fixed bottom-right
   launcher is `z-40` (`FeedbackWidget.tsx`'s own comment already documents
   this). `50 > 40`, asserted directly against the computed styles in a real
   browser, not just read from source — so even where their boxes might
   spatially overlap near the bottom of a short viewport, the dropdown
   always paints on top and stays fully clickable. **This confirms
   `SearchBar` itself isn't the obscuring risk** the brief worries about;
   whatever's left (making the launcher itself smaller or hiding it below a
   scroll threshold) is Phase 5's stated job, unchanged by this finding.

### `TrendingChips.tsx` — closing Phase 2's flagged gap

Phase 2 explicitly logged (`DECISIONS.md`, "Known gap logged for a later
phase: trending-chip clicks are GA4-blind") that this component only fired a
Vercel Analytics event, and flagged this exact phase as the natural place to
fix it since it already touches the file. Fixed: chip clicks now ALSO call
`gaEvent("search_initiated", { trigger: "trending_chip", card_id, variant:
"hero" })` alongside the untouched, still-firing `track("trending_chip_
click", …)` Vercel call. Reused `search_initiated` with a new `trigger`
value rather than inventing a fourth GA4 event, specifically so `docs/
homepage-measurement.md`'s "search initiation rate" formula stays a plain
`search_initiated OR search_submitted` GA4 query — updated that doc's §2 to
reflect the fix (was previously instructing readers to work around the gap
via a separate Vercel Analytics check).

### Verification

Typecheck, lint, full test suite, and production build were run after every
meaningful change, not just once at the end:

| Command | Result | Notes |
|---|---|---|
| `npm run typecheck` | PASS (0 errors) | |
| `npm run lint` | PASS (exit 0) | Zero new warnings; same pre-existing `react/no-unescaped-entities` set Phase 1/2 already catalogued, none in files this phase touched |
| `npm test` | PASS — 581/581 | Was 578/578 before this phase. `tests/internal-linking.test.ts` needed real edits (see above) to reconcile a pre-existing pin with this phase's brief-mandated hero change — net effect: 1 test replaced conceptually by 4 more targeted ones (removed 1 hero-specific assertion pair, added 4 footer-mechanism assertions + rewrote 1 CTA-count assertion), so the suite total moved by +3, not by the number of files touched |
| `npm run build` | PASS (exit 0) | Homepage (`/`) still a static (`○`) route: **16.8 kB page / 151 kB First Load JS** — page weight is DOWN from Phase 2's 18.4 kB (less hero markup: 3 links → 1, 4 stat clauses → 3, no more `Link`-wrapped stat spans) even though `SearchBar.tsx` itself grew substantially (autocomplete/keyboard/ARIA logic) — expected, since `SearchBar` is one shared chunk referenced from 3 places, not duplicated per-instance. First Load JS ticked up slightly (148 → 151 kB) from that same shared-chunk growth. Restarted `next dev` after this build per Phase 2's own documented gotcha (a concurrent `next build` corrupts a running `next dev`'s module registry) — confirmed `next dev` serves `/` as 200 again afterward. |

**Real-browser interaction verification** (not just source review): wrote a
throwaway Playwright script (not committed — same pattern Phase 2 used;
`scripts/homepage-audit.mjs` is Phase 6's real deliverable), driving actual
Chromium at both 1440×900 and 390×844 against the local `next dev` server,
and asserting on real DOM state and `window.dataLayer` after real
interactions rather than reading the source and assuming it works. 30
assertions, all passing on the final run, covering: H1/subhead copy, exactly
one `/browse` link, no leftover "Top meta decks" text, compressed
link-free stat line, header search hidden pre-scroll / revealed post-scroll
on the homepage, ARIA combobox attributes, the zero-state's honest
"nothing to show yet" empty case AND (after seeding one real search) its
"here's your one recent search" populated case, a live "ahri" query
returning results with the desktop 10-cap respected, bold-predicted-portion
markup present, two consecutive `ArrowDown` presses moving
`aria-activedescendant` to two different real option elements with
`aria-selected="true"` and the field text updating to match, `Enter` on an
arrowed suggestion firing exactly one `search_suggestion_selected` with the
correct `suggestion_rank`, the global `/` shortcut correctly focusing a
search input from a page with no field focused, and the dropdown's `z-50`
beating `FeedbackWidget`'s `z-40` on a real mobile viewport. Two real bugs
were found and fixed *in the verification script itself* while writing it
(not in the app code): a raw CSS `#id` selector doesn't work against React
`useId()`'s colon-containing ids without escaping (switched to
`document.getElementById` inside `page.evaluate`), and `gtag()` calls
`dataLayer.push(arguments)` with an array-**like** `arguments` object, which
fails an `Array.isArray()` duck-type check (switched to checking `a[0] ===
"event"` directly) — both are dead-end script details, not application bugs,
recorded here only so a later phase reusing this technique doesn't hit the
same two potholes.

Also took fresh before/after-equivalent screenshots at both hard-target
viewports during this verification pass (not committed — scratch, in the
session's own scratchpad — `artifacts/` is Phase 6's deliverable) and
visually confirmed: the search box reads as the clear dominant element
against the dark background (see the styling note below), the hero has
exactly one secondary link, the region toggle is a single quiet row, and —
the one open item — the mobile screenshot visually confirms the documented
header-row/hero-search coexistence flagged above for Phase 6/7.

### Search box visual dominance (item 3)

Audited per this phase's own instruction ("verify sizing/contrast/centring
already satisfies 'the single visually dominant element'; adjust if not") —
it did NOT. The hero's search `<input>` was using the sitewide `.input`
component class unmodified: `bg-ink-950 border-ink-700`, and the hero's own
background is flatly `bg-ink-950` — i.e. the search box's fill was the
**identical color** to the page behind it, distinguished only by a 1px
`border-ink-700` hairline. This is close to verbatim the Baymard finding the
brief cites ("low-contrast fields on graphics-heavy backgrounds push users
into browsing instead"). Fixed via hero-variant-only utility classes layered
on top of `.input` (Tailwind's utilities layer always wins over the
`@layer components` class regardless of source order in the className
string, so this doesn't require touching the shared `.input` definition
other routes/forms rely on): `border-ink-600` (a visibly lighter, more
visible border than the sitewide default) + `bg-ink-900` (the same elevated-
surface fill `.card-surface` already establishes as this design system's
"this sits above the page" convention, reused rather than inventing a new
tone) + `shadow-glow` (an existing Tailwind config token, not a new
arbitrary value). The nav variant's `.input` styling is untouched — it's
deliberately secondary chrome, not the page's dominant element. Confirmed
visually via the screenshots described above.

### Summary of files changed this phase

- `src/components/home/CinematicHero.tsx` — H1, subhead, CTA row (3 links/1
  button → 1 link), doc comments updated
- `src/components/home/HeroStats.tsx` — compressed to one link-free line
- `src/components/home/TrendingChips.tsx` — added GA4 `search_initiated`
  (trigger: `trending_chip`) alongside the existing Vercel event
- `src/components/SearchBar.tsx` — full rewrite: pointer-fine autofocus
  gate, `/` shortcut + badge, Baymard autocomplete refinements, zero-state
  (trending + recent searches), full ARIA combobox + keyboard nav, hero
  visual-dominance styling
- `src/components/HeaderSearchSlot.tsx` (new) — homepage-only, desktop-only,
  scroll-gated visibility wrapper around the header's own search field
- `src/components/Navbar.tsx` — wired `HeaderSearchSlot` around the desktop
  search row only; mobile row untouched
- `tests/internal-linking.test.ts` — rewrote the `/learn`-reachability and
  hero-CTA-count tests to match the brief-mandated hero change (see above)
- `docs/homepage-measurement.md` — updated §2 to reflect the trending-chip
  GA4 gap being closed
- `CountryHeroToggle.tsx`, `CountryProvider.tsx`, `src/app/api/geo/route.ts`
  — read and verified, **not modified** (already satisfied the brief)

---

## Phase 4 — Sections & Footer (2026-08-17)

Re-read `git log` and this file in full before starting. Confirmed Phase 3's
hero/search rebuild (shortened H1, one CTA link, quiet region toggle,
Baymard-refined `SearchBar`) was live and untouched, and read the CURRENT
`src/app/page.tsx` fresh (not the FACTS summary, which predates Phase 2/3) —
it still carried `MarketPulse`, the 4-column `TodaysTopDeals` + its filter
chips, an inline `NewsletterSignup`, `EbayPicks`, `PopularCardsCarousel` (4
tabs), `ReturnVisitCards` (3 cards), `HowItWorks`, an inline Explore section
(by-set + by-domain), `RadianceCountdownCard` (own card + own newsletter
capture), `LatestPosts`, `ReviewsSection`, the About+FAQ section, and
`PartnersStrip` — i.e. Phases 2/3 had deliberately left all of section-level
structure exactly as Phase 1 found it, per their own stated scope. This was
the phase that actually does the section-consolidation half of the brief.

### What was built

- **`src/lib/proof-strip.ts`** (new) — `getProofStripPick(candidates,
  country)`: given a popularity-ordered candidate list (the homepage's own
  `popularCards`), finds the first candidate with ≥3 distinct in-stock
  stores in that market and returns its cheapest three ranked by TOTAL
  DELIVERED cost (item + shipping), same ranking rule the card page itself
  uses. Two queries, not one per candidate: a single small `groupBy` across
  every candidate id (`by: [cardId, retailer], _min: {priceCents}`, scoped
  to `country` + `inStock: true`) finds out WHICH card qualifies; only then
  does a second `findMany` fetch the winner's full rows. Both are bounded to
  a handful of already-fetched candidate ids for one market, never a table
  scan (see `lib/db.ts`'s egress rules — read before writing this, not
  guessed at). Built entirely from READ-ONLY reuse of existing pricing-lib
  exports: `computeMarket()`/`MarketRow` from `lib/market-rows.ts` (same
  file the card page's own price table uses) and `effectiveShippingCents()`
  from `lib/retailers.ts` — imported, never edited, per this task's
  pricing-logic-is-off-limits rule. `affiliateUrl()`/`cardHref()` reused the
  same way. This is new AGGREGATION code (selecting/ranking already-computed
  prices), not new pricing logic.
- **`src/components/home/ProofStrip.tsx`** (new, client) — renders the
  card + its 3 cheapest stores (cheapest one badged and highlighted) + a
  "Save $X ... delivered" line (only when `savingsCents > 0`) + the brief's
  exact caption text ("Every store, ranked by total delivered cost. Free, no
  sign-up."). Server-serializes `pickByCountry` for all six markets (same
  pattern `MarketPulse`/`TodaysTopDeals` already used) so it localises to
  the visitor's actual market client-side; hides entirely for a market with
  no qualifying candidate — a thin two-price "comparison" would undercut the
  exact point it exists to prove. Deliberately **not** wrapped in `<Reveal>`
  — it now sits where `MarketPulse` used to (right after the hero), and
  reused that component's own documented reasoning verbatim: close enough to
  the hero to often be in the initial viewport, so it should render
  immediately rather than fade in on scroll. Wires `OutboundLink`'s Phase-2
  optional props (`cardId`, `cardName`, `price`, `positionInList`,
  `pageType: "homepage"`) on all three store links, since this call site was
  already being touched for its own reasons — exactly what Phase 2 asked the
  next component that touched `OutboundLink` to do.
- **`src/components/home/DealsRow.tsx`** (new, client) — collapses
  `MarketPulse` + the old 4-column `TodaysTopDeals` grid + its price-tier
  filter chips into ONE horizontally-scrolling row of up to 6 cards + a
  single "See all deals →" link. Reuses `lib/top-deals.ts`'s **existing**
  `getTopDeals()` blend (`savingsVsMarket`, `priceDrops`, `cheapestSealed`,
  `undervalued`) completely unchanged — this file only SELECTS from data
  already computed elsewhere; it invents no new pricing aggregation, which
  is what the phase brief's "reuse its data source rather than inventing a
  new one" instruction asked for. `MarketPulse`'s own risers/fallers content
  is NOT folded into the row's data — that full experience already lives at
  `/market` (footer-linked, see "what moved, and where" below); the row only
  absorbs `TodaysTopDeals`' four "deal-signal columns", matching the phase
  instructions' literal wording ("the deal-signal columns" = TodaysTopDeals'
  own `COLUMNS` array, not Market Pulse's movers). Filter chips are gone
  entirely, per the brief ("they belong on the deals page, not here").
  **Premium-gating decision**: the row shows plain cards with no lock/teaser
  UI at all — but the SIX-card cap plus a deliberate bucket order
  (`[priceDrops, cheapestSealed, savingsVsMarket, undervalued]`, free
  signals first) means the round-robin selection can only ever pull ONE item
  from each Premium signal (`savingsVsMarket`, `undervalued`) before moving
  on to a second pass that only reaches the free signals ahead of them in
  the array — i.e. it exposes **exactly** the same amount of Premium-sourced
  data for free that the retired `TodaysTopDeals.COLUMNS`' `gated ?
  items.slice(0, 1) : items` logic already did, just without re-implementing
  a locked-teaser UI in a six-card row. Logged as a deliberate design choice,
  not an oversight: re-implementing the old blur/lock UI in a compact
  horizontal row was judged not worth the complexity for a homepage teaser
  whose whole point is restraint, and the exposure level is provably
  unchanged either way.
- **`src/components/home/RadianceCountdownCard.tsx`** (rewritten in place,
  same export name/prop) — was a full-width `card-surface` block with its
  own heading, digit countdown and its own `<NewsletterSignup source=
  "countdown">`. Now a single `<p>` line: a small "{set} is coming" chip +
  "{days} days to go — Full release details →". The newsletter capture is
  **gone entirely** (not moved anywhere) — the brief wants exactly one
  capture, footer-only, and `/radiance-countdown`'s own page still carries
  the full release-hype treatment (with its own capture) for anyone who
  clicks through wanting more, so nothing is lost, just not duplicated on
  the homepage. Still server-computed, no client timer (same ISR-consistency
  reasoning as before).
- **`src/app/about/page.tsx`** — added `<HowItWorks totalCards={totalCards}
  />` (the untouched three-step search→compare→buy explainer component),
  right after the "What RiftCompare is" intro section, before "Why we built
  it". `/about` had zero DB reads before this; added one
  `prisma.card.count()` and `export const revalidate = 86400` (same daily
  cadence `/sets` already uses for its own per-set counts) so the page stays
  statically cacheable rather than becoming force-dynamic for one number
  that changes maybe once a set. This is the brief's own explicit
  instruction ("HowItWorks itself should keep existing (unchanged) as the
  full version on /about... add it there if not already present") — verified
  first that `/about`'s existing prose "How it works" section (data
  methodology — sourcing/matching/snapshots) is a DIFFERENT thing from
  `HowItWorks`' user-facing three-step mechanic, so this is additive, not a
  duplicate.
- **`src/app/page.tsx`** — the big one. Removed: `MarketPulse`,
  `TodaysTopDeals` (both replaced by `DealsRow`), the inline mid-page
  `<NewsletterSignup source="home">` card, `PopularCardsCarousel` and its
  four tabs, `ReturnVisitCards` (all 3 cards — see below), `HowItWorks`
  (moved to `/about`), the by-domain chip sub-grid inside Explore (moved
  conceptually to `/domains`, an existing fuller hub page for exactly that
  content — see below), `RadianceCountdownCard`'s old full-width mount
  (replaced by its new one-line self, folded into the Explore section),
  `LatestPosts`, `ReviewsSection`. Kept, repositioned: `EbayPicks` (see
  pinned-test note below), the Explore-by-set grid (compressed), the
  About+FAQ section (heading shortened, see page-height section below;
  paragraph and FAQ content byte-for-byte unchanged), `PartnersStrip`.
  New mounts: `ProofStrip` (right after the hero), `DealsRow` (below
  ProofStrip, inside the same `anyDeals`-gated `<Reveal>` wrapper
  `TodaysTopDeals` used to sit in). Data-fetching trimmed to match: dropped
  `getPopularCards(8, country, "VEN")` (`popularVendetta`, only consumed by
  the now-gone Vendetta tab), `getRecentlyUpdated()` (only consumed by the
  now-gone "recently updated" tab AND its own ItemList — see JSON-LD note
  below), and the six-market `getPriceMovers()` sweep + `biggestMovers`
  derivation (only consumed by `MarketPulse` and the now-gone "movers" tab).
  `storeCount`/`storeWord` (only ever fed `PopularCardsCarousel`'s
  description text) dropped too. Added one new per-market read
  (`proofArr`/`getProofStripPick`, same `unstable_cache`+`CONTENT_TAG`
  pattern as `topDealsArr`) — net effect is FEWER Prisma round-trips than
  before this phase, not more, despite the new section.

### `EbayPicks` — kept, not moved (a real pinned-test conflict, resolved by
NOT removing it)

The master brief's own "target page structure" list (sections 1-6) and "what
moves, and where" table don't mention `EbayPicks` at all, and my phase's own
explicit "REMOVE FROM HOMEPAGE BODY" list doesn't name it either — but
`tests/ebay-picks.test.ts` has a real, pre-existing, deliberate assertion:
`assert.match(read("src/app/page.tsx"), /<EbayPicks \/>/, "/ must render
it")`, part of a test literally titled "the unit is on all five requested
pages". Reading the surrounding test file: this is a genuine business/EPN-
placement requirement (5 specific high-traffic pages, homepage included),
not an accident. Read `EbayPicksLive.tsx` in full before deciding: it's
compact (ONE unlabelled row of up to 6 tiles, `aria-label` on the `<section>`
instead of a real `<h2>` — zero `<h2>` budget cost), carries its own
`AffiliateDisclosure`, and degrades to a single-CTA fallback (`EbayBuyCta`)
when a market has no fresh cached listings (confirmed in the local seed
render — see screenshots). Decision: **kept, unmoved**, repositioned
directly after `DealsRow` (matching its old relative position right after
the deals content, before what used to be "Most popular cards"). This reads
as consistent with the master brief's own explicit monetisation carve-out
("Keep in the header: Marketplace and Premium stay prominent — they're
monetisation") applied to the one below-the-fold monetisation unit the
homepage already had, rather than a violation of "one job" — it's a single
compact row, not a market portal. No test file was touched for this one;
the existing pin is satisfied by simply keeping the mount.

### The `ReturnVisitCards` price-alerts card — dropped, not relocated
(future work, out of this task's scope)

Per the phase brief: pack sim and Riftle both already have real, non-hidden
`nav-groups.ts` entries reaching `FOOTER_GROUPS` (confirmed by reading
`nav-groups.ts` directly — Games group, `hideInFooter` unset on either), so
removing their homepage-body promo cards doesn't orphan them. The **third**
card (`/alerts`, "Watching a card? Get an alert the moment its price
drops") has no such ready alternative — the master brief says explicitly
this promo "belongs on card detail pages, where intent exists," but card
detail pages are off-limits to this task ("Do not modify card detail
pages"). So: the whole `ReturnVisitCards` mount is removed from the
homepage (all three cards, not just the alerts one — pack sim and Riftle
don't need a homepage-specific promo when they're already one click away
sitewide), and re-adding the alerts promo to card detail pages is logged
here as explicit **future work outside this task's scope**, not attempted.
`/alerts` itself stays reachable — it already has a real `nav-groups.ts`
entry ("Price Alerts", "Your collection" group → "Browse & collect" footer
column).

### A real, vacuously-passing pre-existing test found and fixed (same shape
as Phase 3's `/learn` fix)

`tests/pack-composition.test.ts` had a test titled "the homepage links to
the pack simulator" whose own comment explained real intent ("the incumbent
at #1 has no indexable content at all... a homepage link is the strongest
lever") — but its assertion only ever grepped
`src/components/home/ReturnVisitCards.tsx`'s OWN source text for
`href="/games/pack-sim"`, never `src/app/page.tsx` itself. That means the
test would have kept passing **even after `ReturnVisitCards` stopped being
mounted on the homepage at all** — exactly the "vacuous pass" shape Phase 3
found and fixed for `/learn`'s hero-link test. Since this phase's own
(brief-mandated) change is precisely "stop mounting `ReturnVisitCards` on
the homepage," fixed the same way Phase 3 did: rewrote the test to pin the
real, sitewide mechanism — a real, non-hidden `nav-groups.ts` entry for
`/games/pack-sim` that reaches `FOOTER_GROUPS` (already true, verified, zero
`nav-groups.ts` changes needed) — instead of grepping one specific
now-unmounted component. Renamed the test to "the pack simulator is
reachable from the homepage" since "the homepage links to..." was no longer
literally true (nor does it need to be — the mechanism is sitewide chrome,
same reasoning Phase 3 already established for `/learn`). Full test suite:
581/581 both before and after this one file's edit (net zero — one test
rewritten in place, not added/removed).

### Explore by set — compressed, by-domain moved, Radiance folded in

- **By-domain sub-grid**: removed from the homepage entirely. Checked
  `/domains` first (per the phase brief's explicit instruction to check
  before duplicating) — it's not a stub, it's a genuinely FULLER hub page
  for exactly this content (per-domain card counts, lore/tagline copy, same
  chip-grid concept) than the homepage's own 6-chip row ever was, and it
  already has a real `nav-groups.ts` entry (`Browse the database` group →
  `Browse & collect` footer column). Nothing to build, nothing orphaned —
  just stopped duplicating a lesser version of a page that already exists.
  Added one small, low-risk cross-link FROM `/sets` TO `/domains` ("Building
  around a colour instead? Browse cards by domain.") since `/sets` didn't
  link to it before and the phase brief asked to "wire the sets page's
  domain filter/links there if not already surfaced" — the primary
  reachability already existed via nav/footer regardless, this is a purely
  additive UX improvement.
- **Radiance one-liner**: folded into this section (see
  `RadianceCountdownCard` rewrite above), right after the gallery link.
- **Grid density**: `lg:grid-cols-5` → `lg:grid-cols-6`. `SETS` has exactly
  6 entries today (5 released + Radiance), so 5 columns wrapped a 6th tile
  to a lonely second row; 6 columns fits all of them in one row on desktop
  and was a real, measured, easy win against the page-height hard target
  (94px saved — see below). Will need revisiting if a 7th set is ever added
  (wraps to a 2nd row regardless of 6 vs 7 columns at that point) — not a
  problem to solve today.

### JSON-LD — one ItemList trimmed, one removed cleanly (not left stale)

- **"Most popular Riftbound cards" → "Trending Riftbound cards", 12 → 6
  items.** Renamed and re-scoped to `popularCards.slice(0, 6)` — exactly the
  6 cards `TrendingChips` actually renders visibly in the hero. The old
  ItemList's own comment said "the ItemList of the cards actually rendered
  above"; since `PopularCardsCarousel` (which used to render all 12) is
  gone, leaving the ItemList at 12 would have made that comment false and
  the structured data would no longer describe anything genuinely on the
  page. Trimming it to match what `TrendingChips` shows keeps the honesty
  contract Google's structured-data guidance cares about (markup should
  reflect visible content).
- **"Recently updated Riftbound prices" ItemList — removed entirely**, not
  kept alive on a smaller feed. Nothing on the rebuilt homepage renders that
  content anymore (its one consumer, `PopularCardsCarousel`'s "recently
  updated" tab, is gone), and keeping the query + the ItemList block just to
  preserve stale structured data referencing nothing visible would be
  exactly the anti-pattern the trimmed "Trending" ItemList above was fixing.
  `getRecentlyUpdated()`'s import was removed from `page.tsx` along with it
  — a real, measurable data-fetching reduction, not just a display change.

### Discord in the footer — resolved (a real gap, fixed WITHOUT touching
`nav-groups.ts`)

Phase 1 flagged this as unresolved; this phase makes the call. Confirmed
`DISCORD_URL` (`src/lib/site.ts`) exists and is real (not fabricated) and
was header-only (`Navbar.tsx`) plus the Organization JSON-LD's `sameAs` —
genuinely absent from `nav-groups.ts`/`FOOTER_GROUPS`/`FooterNav`, matching
the master brief's footer table which explicitly lists "Discord" as
something the footer itself must show. **Deliberately did NOT add it to
`nav-groups.ts`**, even though that would have been the more "consistent"
mechanism (same one `/learn` and `/games/pack-sim` now rely on): read
`CommandLauncher.tsx` first and found its keyboard-select path calls
`router.push(href)` — Next's client-side router, built for internal routes.
An `https://discord.gg/...` entry in `NAV_GROUPS` would also feed the ⌘K
launcher, whose Enter-to-open path would call `router.push()` on an
external absolute URL — untested, unintended behavior for that mechanism,
and not worth risking for one footer link. Instead added a plain external
`<a href={DISCORD_URL} target="_blank" rel="noopener noreferrer">Discord</a>`
directly into `layout.tsx`'s existing legal-links row, matching the exact
pattern that row already uses for two other external links (the
RiftboundStocks.com cross-promo, the `mailto:` contact link). Verified live
via Playwright: `a[href*="discord.gg"]` present and matches `DISCORD_URL`.
Zero `nav-groups.ts`/`FooterNav.tsx`/`tests/nav-search.test.ts` changes
needed — confirmed the footer-column-balance test is unaffected (this link
isn't part of `FOOTER_GROUPS` at all, so column counts don't move).

### `ReviewsSection` — mount removed (a judgment call, documented)

The phase brief left this as "your call, document it." Removed the mount
entirely rather than leaving it in place-but-inert. Reasoning: it's not
part of the master brief's target structure (sections 1-6), it's an async
server component that runs a real `getApprovedReviews()` Prisma query on
every homepage render (ISR-cached, so not per-visitor, but still a real
read for a section that — per its own doc comment — "renders NOTHING until
there are at least a few genuine ones", which is every render so far, in
this sandbox and evidently in production too or the master brief's own
13-section inventory would have listed it as content, not a `<h2>`). Cutting
the dead read is a small, real efficiency win consistent with this phase's
broader "remove sections with no upside" theme, and the component itself
is untouched — nothing stops a later pass from re-mounting it the moment
real reviews exist.

### Footer reachability — confirmed comprehensive, cross-checked against the
brief's own list

Market index (`/market`), All deals (`/tools/deal-finder` — see below),
Price movers (`/movers`), Sealed (`/sealed`), Value finder
(`/tools/value-finder`), Decks (`/decks`), Riftle (`/riftle`), Pack
simulator (`/games/pack-sim`), Price alerts (`/alerts`), Guides (`/guides`),
Store list (`/stores/tracked`), Discord (see above) — every one confirmed
present in `nav-groups.ts` with a real, non-hidden entry reaching
`FOOTER_GROUPS`, all already true before this phase touched anything (Phase
1's FACTS summary was accurate). `AffiliateDisclosure`'s exact wording
(flagged unverified by Phase 1, spot-checked by Phase 3) is now formally
re-verified: read `AffiliateDisclosure.tsx` in full this phase (the
`TEXT` map's `both` string — "Affiliate links: as an eBay Partner Network
affiliate and a TCGplayer affiliate, RiftCompare earns from qualifying
purchases — at no extra cost to you.") and confirmed via a live Playwright
render that this exact text renders on the homepage (via `PartnersStrip`)
— untouched, byte-for-byte, this phase changed nothing in that file.

**"See all deals →" destination**: points at `/tools/deal-finder`, per the
phase brief's own suggested candidate. Logged honestly: no single existing
page shows exactly the same 4-signal blend `DealsRow` draws from (price
drops live at `/movers`, cheapest sealed at `/sealed`, undervalued at
`/tools/value-finder`, and `/tools/deal-finder` itself is actually a
DIFFERENT arbitrage tool — eBay-flip / TCGplayer-flip / eBay-cheapest, not
the same `lib/top-deals.ts` blend). `/tools/deal-finder` was still judged
the best single link: it's explicitly what the phase brief named as "the
closest fit," it's already one of the four old `TodaysTopDeals` columns'
own "All opportunities" destination, and it's the closest single-page
match for "more deals" as a general concept. Not a perfect 1:1 content
match — logged here rather than silently treated as one.

### Local test-data gotcha discovered (and worked around) while verifying —
important for Phase 5/6/7 to know about

The local sandbox DB has **zero** `RetailerPrice`/`SealedListing` rows (see
Phase 1), so `ProofStrip` and `DealsRow` render nothing there by default —
same as `MarketPulse`/`TodaysTopDeals` always did against this seed. To
actually SEE and verify the new sections render correctly (not just trust
the code), wrote a throwaway, NOT-COMMITTED Node script
(`__scratch_seed_prices.mjs`, deleted after use — same "throwaway script,
not committed" pattern Phase 2/3 already established for their own
verification scripts) that inserts a small number of real `RetailerPrice`
rows (5 US retailers, varying prices/shipping) against 5-7 of the real
seeded cards, and backfills the `Card.lowestPriceCentsUs` denormalized
column those rows imply (the real price-importer's job in production;
`getPopularCards`' `priced: "1"` filter reads that column, not
`RetailerPrice` directly, so inserting listings alone isn't enough to make
a card "popular-and-priced"). **This data was left in the local DB** (not
rolled back) — it's genuinely useful test fixture for Phase 5/6/7 to reuse
(without it, `ProofStrip` and large parts of any visual/audit verification
stay permanently empty against this seed), and per Phase 1's own framing
this whole Postgres instance is ephemeral, non-committed test
infrastructure a later phase can always reset via `db:seed` if a truly
clean baseline is needed. Current extra state: ~21 `RetailerPrice` rows
across 7 cards (5 with ≥3 distinct US stores, qualifying for `ProofStrip`),
country `US` only. `prisma/seed.ts` itself was **not** touched.

**A real gotcha worth flagging explicitly**: after inserting this data,
`ProofStrip`/`DealsRow` still rendered EMPTY for a while — not a bug in the
new code, but `unstable_cache`'s on-disk cache (`.next/cache`) had already
memoized the empty result from a request made BEFORE the seed script ran,
keyed by `["proof-strip", "US"]`/`["top-deals", "US"]` with a 1-hour
`revalidate`. Restarting the `next dev` PROCESS does **not** bust this —
the cache lives on disk, not in process memory, and survives a plain
restart. Only `rm -rf .next/cache` (or waiting out the full hour, or a real
`CONTENT_TAG` revalidation via `/api/revalidate`, which needs
`CRON_SECRET`) actually clears it. **Any later phase that inserts/changes
local price data expecting to see it reflected immediately must delete
`.next/cache` first** — this cost real time to diagnose this phase and is
worth not re-discovering.

### The page-height hard target — measured, and a structural finding logged
for Phase 6/7 (not silently resolved either way)

Built a throwaway Playwright measurement script (not committed) that reads
real `getBoundingClientRect()` heights for every top-level section, against
the local dev server with the test price data above. Two safe, low-risk,
homepage/footer-scoped trims were applied as a direct result (both already
reflected in the file changes above): the Explore grid's `lg:grid-cols-6`
(saved 94px @ 1440×900 by fitting all 6 sets in one row instead of two),
and shortening the About/FAQ section's own visible `<h2>` from "Riftbound
prices in Australia, New Zealand, the US, the UK, Singapore and Canada —
all in one place" (~103 chars, wrapped to 3+ lines at 390px width) to
"Riftbound prices, compared across every store we track" (56 chars) plus
`p-6` → `p-5 sm:p-6` on that card (saved a combined ~64px on mobile). Full
before/after numbers, this phase's own local measurements only (NOT the
brief's real-production numbers, same caveat Phase 1 already established —
Phase 7 owns the real before/after table):

| Viewport | Before this phase's height trims | After | Target |
|---|---|---|---|
| 1440×900 | 3,024px (3.36 screens) | 2,930px (3.26 screens) | ≤2,350px (2.6 screens) |
| 390×844 | 3,943px (4.67 screens) | 3,879px (4.59 screens) | ≤3,798px (4.5 screens) |

**Neither target is hit yet, and the desktop gap is large enough (580px)
that it needed real investigation, not just more trimming.** Measured the
full section-by-section breakdown at 1440×900 (see the raw numbers in this
phase's own scratch measurement, not reproduced verbatim here, but summed
below) and found the miss is NOT primarily coming from homepage BODY
content — it's coming from chrome that was already there before this task
started, present on every one of 150+ routes, not homepage-specific:

- Header: 65px
- `FooterAds` (the sitewide TCGplayer + eBay banner pair above the footer):
  **~282px**
- `<footer>` itself (newsletter capture + `FooterNav`'s 4-column site map +
  share row + legal links + Riot's required "Legal Jibber Jabber" notice +
  copyright): **~834px**, of which `FooterNav` alone (the site map — real
  content this phase's OWN "everything removed from the body must remain
  reachable" mandate is exactly what makes it this comprehensive) is ~407px

Header + FooterAds + footer = **~1,181px (1.31 screens)** of shared,
pre-existing, largely non-homepage-specific chrome, before the hero (543.5px
= 0.6 screens, deliberately close to a full screen by the brief's own hero
design intent — "one screen, and it is the whole first impression") or a
single word of homepage BODY content is counted. That leaves roughly
**625px (0.7 screens)** of the 2,350px budget for `ProofStrip` + `DealsRow`
+ `EbayPicks` + Explore-by-set + the FAQ combined — and Explore-by-set
(194px, already compressed to one row) + the FAQ (now ~571px even after
this phase's own trims, most of it the brief-mandated "keep the long-form
intro paragraph and FAQ" content) alone already exceed that remaining
budget, before `ProofStrip` (240px, itself comfortably "well under half a
screen" per ITS OWN brief target) is even added.

**This was not silently resolved.** Two further trims exist that would
close most or all of the remaining gap, and neither was applied this phase,
on purpose:

1. Make `FooterNav` collapse into `<details>` accordions on desktop too
   (today it only does that below `sm:` — the ≥`sm:` view is a fully
   expanded 4-column grid). This is the SAME collapsed-but-crawlable
   pattern this very page already uses for its own FAQ ("collapsed by
   default... answers still in the DOM"), so it's philosophically
   consistent with the brief. Estimated to save ~300px+ of the footer's
   834px. **Not done**: this is genuinely sitewide chrome shared by every
   route, and changing its default visual behavior site-wide as a side
   effect of one page's screen-height metric is a bigger, more visible
   product decision than this phase's own footer mandate ("confirm
   reachability") covers — it changes what every visitor on every page sees
   in the footer, not just this one.
2. Shrink `FooterAds`' banner sizing or drop it from the homepage
   specifically. **Not done**: it's explicit sitewide monetisation
   ("BOTH live partners... on every page, so no page is left unmonetised")
   that predates this task and that the master brief's own header carve-out
   ("Marketplace and Premium stay prominent — they're monetisation")
   suggests should be preserved, not cut, on a homepage rebuild that is
   otherwise deliberately NOT anti-monetisation (see the `EbayPicks`
   decision above).

**Recommendation, not a decision** (this genuinely isn't this phase's call
to make alone): if hitting ≤2.6 screens is a hard requirement rather than a
target to get "as close as possible" to (the master brief's own words for
Phase 6's audit script), option 1 above is the highest-leverage lever left
and is low-risk against every EXISTING test (`FooterNav` would stay a
server component with real `<Link href>` anchors either way —
`tests/internal-linking.test.ts`'s "FooterNav renders FOOTER_GROUPS as real
anchors, not JS-only navigation" test doesn't care whether they're inside a
`<details>`). Left for Phase 5 (which may touch `FooterNav`/`FeedbackWidget`
for its own accessibility reasons already) or Phase 6/7 (which will have
the REAL audit script and Lighthouse numbers, not this phase's own
approximate local-seed measurements) to decide with full context, rather
than this phase unilaterally redesigning sitewide chrome under a "Sections
& Footer" mandate that was framed as reachability, not visual redesign.

Mobile (390×844) is much closer — only 81px (1.6% of viewport) over after
this phase's own trims — and is plausibly closable by Phase 6's own
iteration against real (not hand-seeded) data, without needing the bigger
`FooterNav` call above.

### Verification

Real-browser verification via a throwaway Playwright script (not committed,
deleted after use — same pattern every prior phase used): confirmed the
FAQ's `FAQPage` JSON-LD parses as valid JSON and contains all 4 original
questions (`mainEntity.length === 4`), the affiliate disclosure text
renders verbatim on the page, the Discord footer link renders with the
correct `href`, `ProofStrip` renders the expected card/store/savings
markup against the seeded test price data, and `DealsRow`/`EbayPicks`
degrade gracefully (a locked-teaser-free empty state / the `EbayBuyCta`
fallback respectively) against markets with no qualifying data. Also
visually reviewed full-page screenshots at both hard-target viewports
(`prefers-reduced-motion: reduce` emulated so the `<Reveal>` scroll-in
animation doesn't leave later sections at `opacity: 0` mid-capture — a
capture-only artifact, not a real bug, discovered while taking the first,
confusing-looking screenshot) — page reads cleanly top to bottom, matches
the target structure precisely, no visual breakage.

| Command | Result | Notes |
|---|---|---|
| `npm run typecheck` | PASS (0 errors) | |
| `npm run lint` | PASS (exit 0) | Zero new warnings; same pre-existing `react/no-unescaped-entities` set every prior phase already catalogued, none in files this phase touched |
| `npm test` | PASS — 581/581 | Unchanged from Phase 3's ending count (one test in `tests/pack-composition.test.ts` rewritten in place, net zero) |
| `npm run build` | PASS (exit 0) | Homepage (`/`) still a static (`○`) route: **12.3 kB page / 146 kB First Load JS** — DOWN from Phase 3's 16.8 kB / 151 kB despite two whole new components, because far more markup left the page than arrived (8 sections removed, 2 added). `/about` (previously a fully static page with no DB read) now 600 B / 96.8 kB. Restarted `next dev` after every build per Phase 2's documented gotcha. |

### Local/seed metrics this phase (NOT the brief's real-production numbers
— same caveat as every prior phase's own local table; Phase 7 owns the
real before/after against the brief's Hard Targets)

| Metric | 1440×900 (after this phase) | 390×844 (after this phase) |
|---|---|---|
| Page height | 2,930px = 3.26 screens | 3,879px = 4.59 screens |
| `<h2>` in `<main>` | 3 (would be 4 with `DealsRow` visible — no eBay/price-history/sealed test data exists locally to exercise that section; still ≤6 either way) | 3 |
| DOM nodes | 889 | 838 |
| Images in `<main>` | 7 | 1 (the ProofStrip card thumbnail is the only in-viewport-relevant image at this narrow width in the current local render; the by-set grid has none, `EbayPicksLive`'s fallback CTA has none) |
| `[autofocus]` elements | 0 | 0 |
| Primary CTA above the fold | 1 (the search box) | 1 |

Both are structurally lower than the brief's real-production numbers would
be (richer price data means `DealsRow` would actually render, `EbayPicks`
would show 6 real tiles instead of the CTA fallback, etc.) — same "valid for
structural comparison, not a stand-in for production numbers" caveat Phase
1 already established for its own before-table.

### Phase 4 deliverables

- `src/lib/proof-strip.ts` (new)
- `src/components/home/ProofStrip.tsx` (new)
- `src/components/home/DealsRow.tsx` (new)
- `src/components/home/RadianceCountdownCard.tsx` — rewritten to a one-line
  component, newsletter capture removed
- `src/components/home/TrendingChips.tsx` — doc-comment accuracy fix only
  (no behavior change)
- `src/app/page.tsx` — the section consolidation described above
- `src/app/about/page.tsx` — mounts `<HowItWorks>`, one new DB read
- `src/app/layout.tsx` — Discord footer link
- `src/app/sets/page.tsx` — cross-link to `/domains`
- `tests/pack-composition.test.ts` — fixed a vacuously-passing test (see
  above)
- This `DECISIONS.md` section

---

## Phase 5 — Accessibility & Mobile (2026-08-17)

### Crash recovery

This exact phase had a prior attempt that was cut off mid-work by a session
usage limit and never committed. Per the handoff instructions, the first
step was `git status`/`git diff` on the working tree, not re-doing the work
from scratch. The prior attempt had left 14 real source files modified and
5 throwaway `__scratch_*.mjs` debug/verification scripts at the repo root,
uncommitted.

Every one of the 14 modified files was read in full (`git diff` on each)
and judged on its own merits against this phase's checklist rather than
either blindly kept or blindly reverted:

- `src/app/layout.tsx` — skip link floor to `min-h-11` on focus, `.tap-link`
  on the plain `riftboundstocks.com` credit link. Correct, kept as-is.
- `src/app/page.tsx` — `.tap-link` on the "See all N cards in the gallery"
  link. Correct, kept as-is.
- `src/components/CommandLauncher.tsx` — `focus-visible:ring-2` added to
  the ⌘K launcher's search input, which had `outline-none` with nothing
  standing in for it. Verified genuinely missing before the fix (the
  sitewide `:focus-visible { outline: 2px solid #34d17e }` rule in
  `globals.css` is a lower-specificity global selector that a local
  `focus:outline-none` utility class silently wins against — see the
  contrast/focus review below for why this matters). Correct, kept.
- `src/components/CountryHeroToggle.tsx` — `min-w-11` added alongside the
  existing `min-h-11` on the region pills; a 2-letter inactive chip ("NZ")
  was measured under 44px wide even though height already cleared it.
  Correct, kept.
- `src/components/FeedbackWidget.tsx` — launcher shrunk to a 44×44
  icon-only circle below `sm:` (was a wider pill measuring ~38px tall on
  mobile), text label returns at `sm:` and up, `aria-label` added so the
  accessible name survives losing its visible text at narrow widths, and a
  new `IntersectionObserver` keyed on `id="rc-hero"` hides the launcher
  entirely while the hero — and the hero's own autocomplete dropdown — is
  in view. Verified the `id="rc-hero"` marker the effect depends on was in
  fact present (see `CinematicHero.tsx`'s diff below) rather than assuming
  it, per the crash-recovery instructions' explicit warning to check. It
  was there, correctly wired through `ParallaxRoot`'s new `id` prop.
  Correct, kept.
- `src/components/OutboundLink.tsx` — forwards a new optional `aria-label`
  prop to the rendered `<a>`. This closes a real gap Phase 2 explicitly
  flagged and deferred to this phase: `PartnersStrip`'s eBay/TCGplayer
  wordmark links were passing `aria-label` and having it silently dropped.
  Correct, kept.
- `src/components/ShareRow.tsx` — `min-w-11` added to the `size="sm"` share
  button variant; the single-character "X" label measured ~26px wide even
  though `.btn`'s own `min-h-11` already covered height. Correct, kept.
- `src/components/SignupPromoPopup.tsx` — exempts `pathname === "/"`
  specifically (a real, deliberate exact-match check, not folded into the
  existing `SKIP_PATHS.some(startsWith)` list, which would have matched
  every route). The comment it left cites the master brief's own
  unconditional "No newsletter popup, no overlay, no region modal. Ever."
  line and reasons correctly that this component — an auto-opening,
  full-screen `role="dialog"` overlay on a 25s timer — is exactly that
  class of interruption, even though it isn't literally a newsletter form.
  The reasoning is sound and the fix is minimal and correctly scoped
  (homepage only; the other 149 routes keep this component's existing,
  out-of-task-scope sitewide behavior unchanged). Verified end-to-end with
  a real 27-second wait in a live browser (see Verification below) that it
  truly never appears on `/` and still does appear, unchanged, on `/market`.
  Correct, kept.
- `src/components/home/CinematicHero.tsx` — `.tap-link` +
  `focus-visible:ring-2` on the hero's one surviving secondary link
  ("Browse all N cards"), plus `id="rc-hero"` added to `ParallaxShell`'s
  root `<section>` as the marker `FeedbackWidget` depends on. Both correct.
  One regression was found and fixed in this phase (see below): the doc
  comment this diff added contained the literal substring `<Link>` in
  prose, which broke `tests/internal-linking.test.ts`'s naive
  `/<Link\b/g` source-text count for "the hero has exactly one `<Link>`."
- `src/components/home/DealsRow.tsx` — `.tap-link-block` on the mobile
  "See all deals →" link. Correct, kept.
- `src/components/home/ParallaxRoot.tsx` — accepts and forwards an optional
  `id` prop so `CinematicHero` can stamp `id="rc-hero"` onto the actual
  rendered `<section>` (this file owns that element; `CinematicHero` only
  passes children through it). Minimal, correct, kept.
- `src/components/home/PartnersStrip.tsx` — `.tap-link` on the eBay and
  TCGplayer wordmark links, which had no flex display and no min-height so
  the sitewide `min-h-11`/pointer-coarse floor had nothing to act on
  (measured ~18px/16px tall). Their existing `aria-label` props now
  actually reach the DOM once `OutboundLink` forwards them (see above).
  Correct, kept.
- `src/components/home/RadianceCountdownCard.tsx` — `.tap-link` on the
  "Full release details →" link. Correct, kept.
- `src/components/home/TrendingChips.tsx` — `min-h-11` added to the chip
  links, which measured ~22px tall (the shared `.chip` class itself was
  deliberately left untouched since most of its other sitewide uses are
  non-interactive labels/badges, not tap targets). Correct, kept.

All fourteen files were correct and complete as found — nothing needed
reverting or redoing. The `.tap-link` / `.tap-link-block` / `.tap-icon`
classes and the sitewide `pointer: coarse` 44/48px floor these diffs lean
on are pre-existing infrastructure from a pass that predates this entire
task (visible in `git log -- src/app/globals.css`, well before Phase 1's
first commit) — the prior attempt was reusing an established pattern
correctly, not inventing a parallel one.

The five `__scratch_*.mjs` files were reviewed for anything worth keeping
before deletion. `__scratch_a11y_audit.mjs` was a genuinely thorough,
well-designed Playwright verification script (tab-order capture, ARIA
combobox assertions, `prefers-reduced-motion` neutralization check, live
pixel-sampled contrast ratios on the hero placeholder and stat line, a
full-page 44×44 tap-target sweep on a real 390×844 viewport, and a real
27-second `SignupPromoPopup` timing check on both `/` and `/market`) — it
was run for real against the local dev server (see Verification below)
rather than just read, since a script that was never executed proves
nothing. The four `__scratch_debug*.mjs` files were narrower one-off
investigations (logo/RiftboundStocks/ShareRow tap-target measurements, a
raw ARIA-combobox probe, a focus-ring probe, a dialog-detection probe) that
fed directly into the source fixes above and had nothing further to
extract. All five were deleted after use, per the crash-recovery
instructions — they were never a deliverable.

### What this phase found and fixed beyond the recovered diff

1. **A real regression in the recovered diff's own doc comment.**
   `tests/internal-linking.test.ts` has a naive regex check —
   `hero.match(/<Link\b/g).length === 1` — pinning that the hero renders
   exactly one `<Link>` element (a deliberate, intentionally brittle guard
   against the hero quietly re-growing a wall of CTAs). The recovered
   diff's new comment on `CinematicHero.tsx` explained the focus-ring fix
   using the literal phrase "a bare `<Link>`" in prose, which the regex —
   scanning raw file text, not JSX AST — counted as a second match. Fixed
   by rewording to "a bare Next.js link" (no `<` character), preserving the
   comment's meaning with zero behavior change. Caught by `npm test`, not
   by inspection — a reminder that a source-text-matching test is exactly
   as literal as it sounds, and doc comments participate in it.
2. **One remaining `focus:outline-none`-with-no-ring gap**, found by
   grepping every homepage-in-scope component tree for `outline-none`
   after auditing the recovered diff's own two fixes (`CommandLauncher.tsx`,
   `CinematicHero.tsx`) for completeness rather than assuming the sweep was
   exhaustive: `FeedbackForm.tsx` (the form inside `FeedbackWidget`'s
   panel, explicitly in scope since this phase already touches that
   component) had three text inputs sharing the same base styling; two
   already carried `focus:ring-1 focus:ring-brand-500/40` alongside
   `focus:outline-none`, but the third (the optional "name to show
   publicly" field, only rendered once a checkbox is ticked) was missing
   the ring — almost certainly an oversight when the other two were fixed
   at some earlier point, not something this task introduced. Added the
   same ring for consistency.
3. **Confirmed, not re-decided:** `useParallax.ts` already bails out
   entirely (writes nothing, leaving the CSS var fallbacks at their flat
   0-state) when `matchMedia('(prefers-reduced-motion: reduce)').matches`
   — pre-existing, correct, untouched. `globals.css`'s
   `@media (prefers-reduced-motion: reduce)` block already neutralizes
   every `animation-duration`/`transition-duration` sitewide via a
   `*, *::before, *::after { ... !important }` catch-all, which covers
   Tailwind's `animate-fade-in` keyframe (used by the hero's staggered
   entrance) and the `.reveal-init`/`.reveal-stagger` scroll-in classes
   alike without needing a per-component opt-in. Verified live, not just
   read: a real Chromium context with `reducedMotion: "reduce"` emulated
   showed every sampled `animate-fade-in`/`reveal-*` element's computed
   `animation-duration`/`transition-duration` collapsed to `1e-06s` (the
   `0.001ms !important` override, as expected) with `opacity: 1` (the
   settled, fully-visible end state, not stuck mid-fade). No code change
   needed — item 4 of this phase's checklist was already fully satisfied.
4. **Confirmed, not re-decided:** the contrast concern the master brief
   flagged for the search placeholder and the muted stats line turned out
   to already be solved at the design-token level, from a pass that
   predates this entire task (`git log -- tailwind.config.ts` shows it well
   before Phase 1). Tailwind's stock `slate-500`/`slate-600` were replaced
   sitewide with `#8593a6`/`#76828f` specifically because the originals
   measured 4.11:1 / worse on this palette's dark surfaces, under the
   4.5:1 AA floor for body text — the replacements clear 6.05:1 and 4.82:1
   on `ink-900` respectively, documented in the token file's own comment
   with the math shown. Because this is a token-level fix (not per-class),
   every component that reaches for `text-slate-500`/`-600` — including
   `HeroStats.tsx`'s stat line and `TrendingChips.tsx`'s "Trending" label —
   inherits it automatically; nothing in this task's own new components
   (`ProofStrip.tsx`, `DealsRow.tsx`) uses a different, unaudited color.
   Verified live, not just from the token math: a real Chromium session
   read the actual computed `color`/`background-color` off the rendered
   hero search input's `::placeholder` pseudo-element (6.05:1) and the
   hero stat line (6.26:1) — both comfortably over 4.5:1. The one
   deliberate exception (`PartnersStrip.tsx`'s eBay wordmark, hand-colored
   per letter to eBay's own brand colors) is exempt under WCAG's own
   logotype carve-out ("text that is part of a logo... has no minimum
   contrast requirement") and is unaffected either way, since its
   accessible name now comes from `aria-label`, not the colored glyphs.
5. **Confirmed, not fixed — a real, deliberate design tradeoff, not a
   defect.** On a real desktop browser context (Playwright's default,
   which reports a "fine" pointer), the hero's `autoFocusDesktop` effect
   (Phase 3's work, unchanged this phase) puts real keyboard focus into
   the hero search input immediately on page load — this is the master
   brief's own explicit ask ("focus programmatically via JS, gated to
   non-touch pointers... this is exactly what Scryfall does"), not
   something introduced or revisited here. One consequence, verified
   directly rather than assumed: because focus starts inside the hero
   input rather than at the top of the document, a **forward**-only Tab
   walkthrough from page load never visits the skip link or the header
   (logo, nav links, Marketplace, Premium, region switcher, Sign in) —
   they sit earlier in DOM order than the point focus already occupies.
   This is not a keyboard trap and nothing is actually unreachable:
   confirmed with a real `Shift+Tab` walk from the autofocused state,
   which correctly stepped backward through Sign in → region switcher →
   Discord → Premium → Blog → Decks → Sealed → Database → Explore → the
   RiftCompare logo → the skip link, in sensible reverse-DOM order, before
   hitting the top of the document. A touch/coarse-pointer visitor (where
   the autofocus gate correctly does NOT fire, confirmed separately) gets
   the conventional forward-from-top order, skip link first. This is
   logged here as a verified, intentional characteristic of a
   brief-mandated pattern, not left as an open question — there is nothing
   for a later phase to decide.

### Verification

Ran the recovered `__scratch_a11y_audit.mjs` for real against the local dev
server (Postgres cluster restarted first — the container had recycled
since Phase 4, `pg_lsclusters` showed the "16 main" cluster `down`; brought
back up with `pg_ctlcluster 16 main start` per this file's own documented
recipe, no data loss, same seeded DB Phase 4 left behind) before making any
further changes, then again after this phase's own edits (the `<Link>`
regex fix, the `FeedbackForm.tsx` ring). Zero failures both times, one
expected/benign note ("FeedbackWidget launcher not found/visible at
initial mobile load" — correct, since the hero occupies the entire first
mobile screen and `overHero` correctly hides the launcher there by design).
Full summary of what it covers:

| Check | Result |
|---|---|
| No visible `[role=dialog]` on load, desktop and mobile | PASS |
| Desktop tab sequence advances, never stuck, every stop visible | PASS |
| Hero search: `role="combobox"`, `aria-haspopup="listbox"`, `aria-controls` resolves to a real element in the DOM | PASS |
| `aria-expanded` flips true once results render | PASS |
| `aria-activedescendant` set after ArrowDown, points at a real `role="option"` with `aria-selected="true"` | PASS |
| A second ArrowDown moves `aria-activedescendant` to a different option | PASS |
| Escape closes the combobox (`aria-expanded="false"`) | PASS |
| Hero "Browse all N cards" link reachable via real keyboard Tab, with a real `:focus-visible` ring painted | PASS |
| Hero search placeholder contrast (live computed pixels) | 6.05:1 (≥4.5:1 floor) |
| Hero stat line contrast (live computed pixels) | 6.26:1 (≥4.5:1 floor) |
| `prefers-reduced-motion: reduce` neutralizes every sampled animated element | PASS |
| First mobile Tab lands on the skip link; it becomes properly sized once focused | PASS |
| Full-page mobile (390×844) tap-target sweep: every real, reachable interactive element | 103 found, **0 under 44×44** |
| `SignupPromoPopup` does NOT appear on `/` after a real 27s wait | PASS |
| `SignupPromoPopup` STILL appears, unchanged, on `/market` after a real 27s wait | PASS |

A supplementary, throwaway (also deleted after use) script independently
confirmed the from-autofocus `Shift+Tab` backward walk described in
finding 5 above, since the recovered script's own forward-only tab loop
couldn't observe it (focus started mid-page, not at the top).

`DealsRow`'s deal cards and the Explore-by-set grid tiles were checked by
direct code inspection rather than live-rendered on this phase's local
data (each card/tile is a single full-bleed `<a>`/`<Link>` — the deal
card's `h-24` image alone exceeds the 44px floor before any padding or
text is counted, and the set tiles are `p-4` cards with two lines of text)
— `DealsRow` did not render against the current local seed data (same
sparse-data gap Phase 4 already documented: it needs eBay-listing/
price-history/sealed signals the throwaway seed rows don't carry), so its
tap targets could not be swept by the live 390×844 script this round. Not
re-fixed or re-seeded this phase since Phase 4 already logged this gap in
detail and it's a data-availability issue, not an accessibility defect —
flagged again here only so a later phase with richer data doesn't need to
rediscover it.

`TradeCalculator.tsx`, `MyCollection.tsx`, `MarketSwitcher.tsx`, and
`FilterableCardGallery.tsx` were found via a sitewide `outline-none` grep
run while checking item 3 of this phase's checklist, but are not rendered
anywhere in the homepage's component tree (confirmed by grepping
`src/app/page.tsx` and `src/components/home/*.tsx` for their names — zero
hits) — out of this task's stated scope ("Homepage, shared homepage
components, footer, and analytics only"), so left untouched. Noting this
explicitly so it reads as a scope boundary that was checked, not one that
was missed.

| Command | Result | Notes |
|---|---|---|
| `npm run typecheck` | PASS (0 errors) | |
| `npm run lint` | PASS (exit 0) | Zero new warnings; same pre-existing `react/no-unescaped-entities` set every prior phase already catalogued, none in files this phase touched |
| `npm test` | PASS — 581/581 | Failed at 580/581 mid-phase (`tests/internal-linking.test.ts`'s hero-`<Link>`-count test) due to the doc-comment regression described above; green again immediately after that one-line reword — no test logic was changed, only the prose that tripped it |
| `npm run build` | PASS (exit 0) | Full production build. Homepage (`/`) still a static (`○`) route: **12.3 kB page / 146 kB First Load JS** — unchanged from Phase 4's ending size, as expected, since this phase's changes are markup/class/comment-only and add no new client-side logic |

### Phase 5 deliverables

- `src/app/layout.tsx` — skip link tap-target floor
- `src/app/page.tsx` — `.tap-link` on the by-set gallery link
- `src/components/CommandLauncher.tsx` — focus ring on the ⌘K search input
- `src/components/CountryHeroToggle.tsx` — `min-w-11` on region pills
- `src/components/FeedbackForm.tsx` — focus ring on the display-name field
  (this phase's own fix, beyond the recovered diff)
- `src/components/FeedbackWidget.tsx` — 44×44 icon-only launcher below
  `sm:`, hidden while the hero is in view
- `src/components/OutboundLink.tsx` — forwards `aria-label`
- `src/components/ShareRow.tsx` — `min-w-11` on the compact share buttons
- `src/components/SignupPromoPopup.tsx` — never on `/`
- `src/components/home/CinematicHero.tsx` — tap target + focus ring on the
  browse-all link, `id="rc-hero"` marker, and this phase's doc-comment fix
  for the `<Link>`-count regression
- `src/components/home/DealsRow.tsx` — `.tap-link-block` on mobile
- `src/components/home/ParallaxRoot.tsx` — forwards an `id` prop
- `src/components/home/PartnersStrip.tsx` — `.tap-link` on wordmark links
- `src/components/home/RadianceCountdownCard.tsx` — `.tap-link`
- `src/components/home/TrendingChips.tsx` — `min-h-11` on chip links
- This `DECISIONS.md` section

---

## Phase 6 — Audit Script (2026-08-17)

Re-read `git log` and this file in full before starting, per instructions.
Confirmed the homepage rebuild was functionally complete as of Phase 5 (hero,
search, analytics, sections, footer, accessibility all landed) and that this
phase's job was specifically the verification harness the brief demands —
**and to keep iterating on the actual homepage code, not the harness, until
the Hard Targets table is met or a genuine architectural shortfall is found
and precisely documented.** Postgres and `next dev` had recycled since Phase
5 (container restart) — brought back up with the exact recipe Phase 1's
section already documents, no data loss, same seeded DB every phase since
has been building on.

### What was built

- `scripts/homepage-audit.mjs` — the brief's own required deliverable.
  Loads the homepage at 1440×900 and 390×844, asserts every Hard Targets
  row that is a DOM/structural/link-graph fact (page height, `<h2>` count,
  image count, DOM node count, above-the-fold interactive-target count,
  primary-CTA count, search-input duplication, region-selector duplication,
  `[autofocus]` count, FAQ JSON-LD validity + question-completeness, the
  affiliate disclosure's presence, and a crawl of every internal link the
  homepage itself links to), prints a target-vs-actual table with a `PASS`/
  `FAIL` per row and a readable sample of offending elements on failure, and
  exits non-zero on any failure. Also writes `artifacts/after/{desktop,
  mobile}-*.png`.
- `scripts/homepage-audit-analytics.mjs` — a **separate** script (see "Why
  two scripts" below) that drives real interactions (type a query, select a
  suggestion, submit a search, click an outbound store link, scroll through
  the page, change region) in a real Chromium and asserts on the resulting
  `window.dataLayer` entries — proving Phase 2's GA4 instrumentation still
  fires correctly with real params, not just that the source code looks
  right.
- `package.json` — added `audit:homepage` / `audit:homepage-analytics` npm
  aliases for both, matching this repo's existing `npm run <verb>:<noun>`
  convention for one-shot verification scripts (`crawl:check`, `seo:gate`,
  `mobile:check`, etc.).

**LCP / CLS / INP and the Lighthouse Performance/Accessibility scores — also
rows in the brief's Hard Targets table — are deliberately NOT in either
script.** They need a production build served over HTTP and a real
Lighthouse run (throttled, mobile preset), a different tool for a different
job than a Playwright DOM audit — and the orchestrating brief's own task list
for this run names that as the NEXT phase's job ("Lighthouse run, full
verification, finalize DECISIONS.md"), not this one's. Both scripts' own
header comments say this explicitly so nobody reads their passing exit code
as "the whole Hard Targets table is green."

### Why two scripts, not one

`homepage-audit.mjs` asserts static/structural facts about a single rendered
snapshot and is meant to be re-run constantly while iterating on layout —
fast, stateless, one page load per viewport.
`homepage-audit-analytics.mjs` drives multi-step, stateful interactions
(type → wait for a debounce → click; scroll partway → wait for a rAF tick;
open a dropdown → click an option) and needs a fresh browser context per
scenario so one test's state can never bleed into the next — slower, and a
failure in "did scroll_depth fire at 50%" has nothing to do with "is the
`<h2>` count over budget," so mixing them would make the fast checks slow to
iterate on and the slow checks fragile to unrelated layout edits. Both are
real Playwright scripts against the same running server; this is the "your
call, document it" split the phase brief explicitly allowed for, not a
different verification standard for one over the other.

### Real bugs found while building the harness — fixed in the actual
homepage code, not worked around in the scripts

Building an audit script that actually measures reality (rather than
asserting the developer's own mental model of the page) surfaced several
real, previously-undiscovered defects. Per this phase's own instructions
("iterate on the ACTUAL HOMEPAGE CODE... not on loosening the script's
assertions"), every one of these was fixed at the source:

1. **A real, user-facing bug: the hero search dropdown was invisible/
   unclickable underneath TrendingChips.** Found because the audit script's
   first "interactive targets above the fold" count came back impossibly
   high (34, with six phantom `<a role="option">` rows that shouldn't have
   been open at page load at all) — chasing that number down surfaced two
   compounding defects:
   - **(a) `autoFocusDesktop`'s programmatic `.focus()` call was itself
     triggering the search box's `onFocus` handler**, which unconditionally
     opened the zero-state dropdown — meaning every desktop page load
     auto-opened a 6-row trending-suggestions dropdown that nobody asked
     for, immediately covering the hero's own trending-chips row, stat
     line, browse-all link and region toggle with an unrequested overlay.
     Confirmed with a real screenshot before fixing anything — this was not
     a theoretical concern. **Fixed** in `SearchBar.tsx`: a one-shot
     `suppressNextFocusOpenRef` flag, set immediately before the
     `autoFocusDesktop` effect calls `.focus()` and consumed (and cleared)
     by the very next `onFocus`, so the programmatic focus puts the cursor
     in the box (satisfying the actual point of `autoFocusDesktop` — let a
     visitor start typing immediately) without also opening the dropdown.
     Also stopped the `search_initiated` "focus_dwell" timer from starting
     off that same suppressed focus — a visitor who did nothing for
     1200ms simply because the page loaded with the cursor already there is
     not evidence of search intent, and counting it would have quietly
     inflated that metric forever.
   - **(b) A real CSS stacking-context bug, independent of (a) and still
     reproducible on a genuine user-typed query.** Diagnosed with
     `document.elementsFromPoint()` and `getComputedStyle()` walked up the
     ancestor chain: every direct child of the hero's content section that
     carries the `animate-fade-in` class (the search wrapper, TrendingChips'
     row, the browse-link/region-toggle row) becomes its own CSS stacking
     context for as long as its animation is "in effect" — and with
     `animation-fill-mode: both` (this codebase's own `fade-in` keyframe,
     see `tailwind.config.ts`), that is forever, not just for the 0.6s it
     visibly plays. Per the CSS spec, an element that is (or has been) the
     target of an animation on a stacking-context-triggering property forms
     one regardless of its own `position`/`transform` reading `static`/
     `none` afterward. None of these three siblings sets an explicit
     z-index, so each sorts as `z-index:0` in the hero's own stacking
     order, and ties break by DOM order — meaning TrendingChips (mounted
     after the search wrapper) was silently painting, and **hit-testing**,
     above the search wrapper's own `z-50` dropdown, because that `z-50`
     only ever competed against siblings INSIDE the search wrapper's own
     now-separate stacking context, never against TrendingChips directly.
     Confirmed with two real screenshots (before/after) that this wasn't
     just a hit-testing quirk: the dropdown's own rows were visibly
     interleaved with the trending chips underneath, illegible, and a real
     mouse click on a dropdown suggestion landed on a chip instead —
     exactly what broke the first `homepage-audit-analytics.mjs` run
     (`locator.click()` timed out with "chip intercepts pointer events").
     **Fixed** with `relative z-20` on the search wrapper div in
     `CinematicHero.tsx` — an explicit, positive stacking level at the
     hero's own top scope, unambiguously above every animation-promoted
     sibling regardless of DOM order, closing the gap for every sibling at
     once rather than only the one (TrendingChips) this instance happened
     to be tested against. This is a genuine fix to the single highest-
     leverage surface on the page (per the master brief's own framing) that
     would never have been found without actually scripting a real user
     interaction and reading back real pixel/hit-test data — a lesson worth
     recording for its own sake: a component can look correct in a static
     screenshot and still be unusable the moment it's actually driven.

2. **A real duplicate-region-selector-above-the-fold defect.** The audit
   script's `[data-region-control]` check (see "Selector conventions"
   below) found TWO region controls simultaneously visible above the fold
   at 1440×900: the header's `CountrySwitcher` (always rendered, no scroll
   gate) and the hero's own `CountryHeroToggle` — the exact "0 duplicate
   region selectors above the fold" hard target catching a real instance
   of what it's designed to catch. **Fixed** as part of the
   `HomeHeaderReveal` work below (item 5) — same scroll-gate pattern
   already established for the header's duplicate SEARCH box.

3. **`CountryHeroToggle` was still a six-button strip, just quietly styled.**
   Re-reading the actual rendered markup (not the code comments, which
   described it as "quiet, not a six-button strip") found it rendering all
   six `COUNTRY_LIST` entries as always-visible pill buttons — small type,
   low contrast, but six real, always-present tap targets regardless.
   That's literally the shape the master brief's own hero spec rules out:
   *"Show it once, quietly, near the search box... not as a six-button
   strip competing for attention."* It was also the single largest
   contributor to the hero's own above-the-fold interactive-target count.
   **Fixed**: rewrote `CountryHeroToggle.tsx` to a single labelled trigger
   ("Shopping from: US · USD ▾") that reveals the other five markets in a
   dropdown panel on click — the exact same disclosure-on-demand pattern
   `CountrySwitcher` (the header's own region control) already used, so
   this isn't a new interaction model, just the hero adopting the one the
   rest of the site had already settled on. Cut this control's own
   above-the-fold interactive-target cost from 6 to 1. Kept the working,
   previously-hard-won `aria-labelledby`-built-from-visible-spans pattern
   (see the file's own comment) rather than a hand-written `aria-label`,
   since the original file's history recorded that a hand-written label
   failed `label-content-name-mismatch` for exactly this shape of control.

4. **Mobile carried two visible search boxes above the fold at once.**
   Phase 3 had already scroll-gated the header's DESKTOP search field away
   on the homepage (`HeaderSearchSlot`), but left the header's MOBILE
   search row un-gated — a literal reading of the master brief's own
   "Keep in the header" line ("keep it always present on mobile"). Phase 3
   flagged this explicitly as a real, measured tension against the
   separate "0 duplicate search boxes above the fold" hard target and left
   three resolution options for whichever phase built the audit script.
   **Resolved here as option (b)**: extend the same scroll-gate to the
   mobile row too, on the homepage only. Reasoning: the "always present on
   mobile" instruction was written to keep search reachable without
   scrolling on phones — but on THIS codebase's homepage, the hero already
   renders its own full-size search box immediately below the header on
   every viewport including mobile (only `autoFocusDesktop` is
   desktop-gated; the box itself isn't), so "always present" was buying a
   visitor nothing they couldn't already do one glance below it, at the
   cost of a real, confirmed duplicate on a real 390×844 screenshot. The
   field stays fully in the DOM either way (`hidden` via CSS, never
   unmounted — same "in the DOM for crawlers" guarantee Phase 3's own
   desktop version already established), so nothing is actually lost for
   crawlers or for a visitor who scrolls even 8px. `HeaderSearchSlot.tsx`
   now takes a `mobile` prop for this second call site; `Navbar.tsx` wraps
   its own mobile search row with it.

5. **The header's remaining desktop nav row (⌘K launcher, Database, Sealed,
   Decks, Blog, Discord, the region switcher, sign-in) was, on its own,
   already at or over the interactive-target budget before a single pixel
   of the hero was counted.** Measured directly: 10 real, always-visible
   header items at 1440×900 pre-scroll, against a ≤12 total (header
   included) hard target that ALSO has to fit the hero's own search box,
   six protected trending chips, one browse-all link and one region
   control. The master brief protects exactly two header items by name —
   *"Marketplace and Premium stay prominent — they're monetisation"* — in
   the same document that budgets the WHOLE header (not just those two)
   against that ≤12 ceiling; naming only two reads as intentional, not as
   silent permission to leave the rest alone. **Fixed**: a new
   `HomeHeaderReveal.tsx` component (same `usePathname()==='/'` + `scrollY
   >8` gate `HeaderSearchSlot` already established, generalised to a
   second, non-search use) wraps the header's two remaining non-protected
   groups — (⌘K launcher → Blog) and (Discord → region switcher →
   sign-in) — hiding them until the visitor scrolls, ONLY on the homepage.
   `MobileNav` (the hamburger) is deliberately NEVER wrapped: below `lg` it
   is the only way to reach Sealed/Decks/Blog/Discord/Premium at all, so
   gating it would strand a mobile visitor with no navigation whatsoever
   until they scrolled — a real regression this fix must not cause. The
   logo, Marketplace, and Premium are also never wrapped, per the brief's
   own protection. This is the single largest lever applied this phase
   against the above-the-fold interactive-target count: header
   contribution dropped from 10 to 2 (logo + Premium; Marketplace is env-
   gated off in this sandbox — see "What's still short" below for why it's
   counted as 3 in production).

6. **The desktop page-height hard target's single largest remaining lever
   was `FooterNav`'s fully-expanded 4-column site-map grid, ~330-400px on
   every homepage load** — the exact lever Phase 4 had already identified
   and deliberately left unapplied, reasoning it was "a bigger sitewide
   product decision than a reachability audit covers." Re-examined this
   phase with the explicit mandate to iterate on code until targets pass:
   the task's own scope line names **footer** as in-scope (distinct from
   the header nav links, which aren't named and were treated more
   conservatively in item 5 above) — collapsing a site-map footer is also
   categorically different from trimming revenue/monetisation surfaces,
   and it has a direct, already-proven precedent in this exact file: the
   mobile breakpoint already collapses the same `FOOTER_GROUPS` data into
   a per-group `<details>` accordion. **Fixed**: `FooterNav.tsx` now
   renders a single "Full site map" accordion (collapsed by default, all
   four groups inside once opened) at every width, but ONLY on the
   homepage — every other route keeps the original always-expanded 4-
   column grid completely unchanged. Nothing is deleted or JS-gated-only:
   see "The FooterNav/server-component test conflict" below for why both
   layouts render as real, unconditional, server-rendered `<Link href>`
   anchors regardless of which one is visually shown. Saved ~330px on the
   homepage's desktop measurement (2,937px → 2,607px against this
   phase's own start-of-phase baseline, once combined with the smaller
   `gap-10`→`gap-8` trim below).
7. **A modest, additional, low-risk trim**: the homepage's own top-level
   section wrapper (`src/app/page.tsx`) went from `gap-10` (40px between
   each of the 6 top-level sections × 5 gaps = 200px) to `gap-8` (32px ×
   5 = 160px) — a 40px saving, small on its own but free (every section
   already carries its own heading/border to separate it visually; nothing
   reads as cramped) and stacked on top of item 6's much larger saving.

### Selector conventions this phase established (the audit script's own
contract with the homepage code)

The phase brief explicitly asked for a documented, concrete selector
convention for "primary CTA" (none existed) — extended to region controls
once the duplicate-selector defect above showed the same ambiguity applied
there too:

- **`data-primary-cta="true"`** — exactly one element on the page, the hero
  `SearchBar`'s own outer wrapper `<div>` (only when `variant === "hero"`,
  never the nav variant). Per the master brief's own framing — *"the search
  box is the hero"* — the search box itself, not a button, is the page's one
  primary above-the-fold action; the "Browse all N cards" link is
  explicitly the hero's one **secondary** action and never carries this
  attribute.
- **`data-region-control="hero"` / `"nav"`** — `CountryHeroToggle` and
  `CountrySwitcher` respectively. The audit script counts how many distinct
  VISIBLE values of this attribute intersect the first viewport, rather
  than inferring "is this a region control" from class names or DOM
  position — which is exactly what caught the real duplicate in finding 2
  above.

Both attributes are additive, presentational-only (no behaviour keys off
them), and cost nothing outside the audit script reading them.

### The FooterNav/server-component test conflict, and how it was resolved

Converting `FooterNav.tsx` to a client component (to read `usePathname()`
for the homepage-only accordion in item 6 above) broke a real, deliberately
-strict pre-existing test:
`tests/internal-linking.test.ts`'s *"FooterNav renders FOOTER_GROUPS as real
anchors, not JS-only navigation"* asserts, by reading the file's own source
text, that `FooterNav.tsx` does **not** start with `"use client"` — a
literal proxy for "these links are guaranteed present in the raw server
HTML, not something a crawler or a no-JS visitor could miss." That guarantee
is exactly what makes this file load-bearing for `/learn` and everything
else this whole redesign moved out of the homepage body (see that test's
own extensive doc comment) — weakening or deleting the test to make my own
change pass would have been solving the wrong problem.

**Resolved by keeping `FooterNav.tsx` a plain server component and pushing
the client-only PATHNAME DECISION into a new, separate file,
`HomeFooterToggle.tsx`** — the exact same architecture
`HeaderSearchSlot`/`HomeHeaderReveal` already use for the header's own
homepage-only behaviour: **both** the homepage's single accordion layout
and the sitewide 4-column/mobile-accordion layout render, unconditionally,
as real server-rendered `<Link href>` anchors in every response regardless
of route; `HomeFooterToggle` only ever toggles which one is CSS-visible
(`hidden` vs `contents`) after hydration. A crawler or a no-JS visitor sees
BOTH layouts' links (redundant, but never absent); a real browser shows
exactly one. This costs some DOM nodes (measured: 726 → 925 on the
homepage specifically, since two real link sets are now present instead of
one) but stayed comfortably inside the ≤1300 DOM-node hard target with
plenty of headroom, and the pinned test now passes again — verified
directly, not assumed (`tests/internal-linking.test.ts` re-run in
isolation, all 13 tests green, then the full suite, 581/581).

### Two real script-robustness bugs, found and fixed while getting the
analytics script to run reliably (not homepage-code changes — infrastructure
for this phase's own deliverable)

1. **`scroll-behavior: smooth` is set site-wide** (`globals.css`, overridden
   to instant only under `prefers-reduced-motion` — which a default
   Playwright browser context doesn't request). This means
   `window.scrollTo()` **animates** over a real, non-trivial duration rather
   than jumping instantly — both scripts' scroll-related steps (the audit
   script's reveal-triggering scroll-through before screenshotting; the
   analytics script's `scroll_depth` threshold test) were originally
   written assuming an instant jump, and a fixed short wait after calling
   `scrollTo()` was measured, empirically, to sometimes read back
   `window.scrollY` from mid-animation rather than the true destination —
   in one captured case, a `window.scrollTo(0, 0)` reset still showed
   `scrollY: 1030` a full 100ms later. **Fixed** in both scripts with a
   small `scrollToAndSettle(page, y)` helper that scrolls and then POLLS
   `window.scrollY` (clamped against the page's own real max-scroll, so a
   request past the bottom of the page doesn't wait out its full timeout
   every time) until it actually arrives, rather than guessing a fixed
   duration. This was the root cause of `homepage-audit-analytics.mjs`'s
   `scroll_depth` test only ever catching the 25% threshold on an early
   run, and of the "after" mobile screenshot briefly (before this fix)
   showing the homepage-only mobile search row still visible even after
   the screenshot's own scroll-to-top reset.
2. **An unblocked `store_click` test popup could wedge the whole browser
   instance.** The `ProofStrip` store link's `href` is a real external
   retailer/affiliate URL; this sandbox's outbound network goes through an
   agent proxy with no route to (and no reason to reach) eBay/TCGplayer.
   The first full run of `homepage-audit-analytics.mjs` hung and had to be
   killed by an external timeout after the store-click test, with the
   `scroll_depth` and `region_changed` tests never running at all —
   diagnosed as the `target="_blank"` popup repeatedly retrying a doomed
   TLS handshake against the real host, apparently starving the shared
   browser process for the rest of the run. **Fixed**: `freshPage()` now
   blocks every non-`BASE_URL` request context-wide via
   `context.route("**/*", ...)` for every test, not just the store-click
   one — this also meaningfully sped up every other test's `page.goto()`
   (Vercel Analytics/AdSense/gtag.js were each burning several real
   seconds retrying against the same proxy on every fresh page load
   before this fix, which `waitUntil: "networkidle"` was dutifully waiting
   out on every single test). None of this affects what's being verified:
   `store_click` fires synchronously inside the `onClick` handler before
   the browser acts on the `href` at all, so the event is already in
   `window.dataLayer` regardless of whether the click's own navigation
   ever succeeds — confirmed by the event still asserting correctly with
   the block in place. Also wrapped each of the 7 test functions in its
   own `try/catch` in `main()` as a backstop, so one scenario's failure or
   timeout can never again silently prevent the rest of the suite from
   running.

### A screenshot-only artifact, found and fixed (not a homepage bug)

The first "after" screenshots showed two visual defects that turned out to
be pure `page.screenshot({fullPage:true})` capture artifacts, not real
rendering bugs — verified by checking the live DOM/computed styles before
concluding either way, not assumed:

1. Several sections (e.g. "Explore by set"'s 6-tile grid) appeared as blank
   gaps. Cause: this codebase's `Reveal.tsx` uses `IntersectionObserver` to
   reveal content on scroll (deliberately "SEO / no-JS safe" — real content
   in the server HTML either way, see that component's own doc comment); a
   `fullPage` capture expands the viewport to the whole document in one
   shot rather than replaying a real scroll, so those observers never see
   an intersection and the content stays at its pre-reveal `opacity:0`.
   **Fixed**: `homepage-audit.mjs` now scrolls through the page in 6 even
   steps (using the `scrollToAndSettle` helper above, each step followed by
   a short settle wait) — AFTER every real measurement, which all still
   describe the true, unscrolled first-load state — before taking the
   screenshot, then scrolls back to the top.
2. The sticky header appeared to "float" partway down the page. A known
   Playwright/CDP limitation with `position:sticky` and `fullPage`
   screenshots (the expanded-viewport capture can bake in a sticky
   element's offset from an earlier real scroll position rather than
   recomputing it for the full-height frame) — real visitors never hit
   this, since they scroll a normal-height viewport where this header's
   sticky behaviour is unaffected and already exercised by every prior
   phase's manual testing. **Fixed**, screenshot-only: a scoped
   `page.addStyleTag({content: "[class*='sticky']{position:static
   !important;}"})` immediately before the screenshot call neutralises it
   for that one capture, so the header renders once, at its natural
   top-of-document position — exactly what a full-page screenshot should
   show regardless.

Both `artifacts/after/desktop-1440x900.png` and
`artifacts/after/mobile-390x844.png` were re-captured and visually
re-reviewed after both fixes — clean, no floating header, no blank gaps,
before being committed.

### Final audit results — `scripts/homepage-audit.mjs`

25 of 27 checks pass. Full run, against the local seeded DB (1,064 cards,
~21 throwaway `RetailerPrice` test rows Phase 4 seeded and documented,
same dataset every phase since has measured against):

| Hard Target | Viewport | Target | Actual | Result |
|---|---|---|---|---|
| Page height | 1440×900 | ≤ 2.6 screens (≤2,350px) | 2,607px (2.90 screens) | **FAIL — see below** |
| Page height | 390×844 | ≤ 4.5 screens (≤3,798px) | 3,681px (4.36 screens) | PASS |
| `<h2>` count in `<main>` | both | ≤ 6 | 3 | PASS |
| Images in `<main>` | both | ≤ 24 | 1 | PASS |
| DOM nodes | both | ≤ 1,300 | 925 | PASS |
| `[autofocus]` attributes | both | 0 | 0 | PASS |
| Visible search inputs above the fold | both | exactly 1 | 1 | PASS |
| Visible region selectors above the fold | both | ≤ 1 (0 duplicates) | 1 | PASS |
| Primary CTAs above the fold | both | exactly 1 | 1 | PASS |
| Interactive targets above the fold | 1440×900 (incl. header) | ≤ 12 | 15 | **FAIL — see below** |
| Interactive targets above the fold | 390×844 | n/a (informational) | 13 | n/a |
| FAQ JSON-LD parses, an FAQPage node exists | n/a | valid | valid | PASS |
| FAQ JSON-LD contains every question from `FAQS` | n/a | 4/4, exact match | 4/4 | PASS |
| FAQ JSON-LD every answer non-empty | n/a | 0 empty | 0 | PASS |
| FAQ JSON-LD answers also present in the DOM | n/a | all present | all present | PASS |
| Affiliate disclosure text present (verbatim) | n/a | present | present | PASS |
| Broken internal links from the homepage | n/a | 0 | 0 (63 crawled) | PASS |

(Images/DOM-node/interactive-target/FAQ/disclosure/link-crawl numbers above
are the local-seed-DB measurement, same structural-vs-real-production caveat
Phase 1's own before/local table already established — image/DOM counts in
particular would read higher against real production's richer price/listing
data, though the structural checks — `<h2>` count, duplication checks,
autofocus, JSON-LD, link crawl — are data-independent and not subject to
that caveat.)

`scripts/homepage-audit-analytics.mjs`: **8/8 checks pass** —
`search_initiated` (keystroke trigger), `search_suggestion_selected` (with
`suggestion_rank`), `search_no_results` (with the exact zero-match query),
`search_submitted` (navigates to `/browse?q=...`), `store_click` (with
`page_type`/`transport_type=beacon` and the richer `ProofStrip`-supplied
params — `card_id`, `card_name`, `price`, `position_in_list`),
`scroll_depth` at all four thresholds (25/50/75/90), and its
fire-once-per-threshold guarantee (a scroll back up and down past 50% again
does not re-fire), and `region_changed` with real `from`/`to` values.

### What's still short of the Hard Targets — real, reasoned architectural
shortfalls, not silently accepted and not faked

Per this phase's own instructions: iterate on the real code until a target
is met, or — if genuinely unachievable — get as close as possible, do NOT
weaken the assertion, and log the shortfall with its reason. Both remaining
failures were treated exactly that way; both received real, substantial
code changes this phase (see the numbered fixes above) that measurably
closed the gap, and neither was accepted as-is without first trying the
available levers.

**1. Desktop page height: 2,607px vs. the 2,350px (≤2.6 screen) target,
257px over.** Precisely measured, section by section, at the end of this
phase (1440×900, local dataset):

| Region | Height |
|---|---|
| Header | 65px |
| Hero | 568px |
| ProofStrip | 241px |
| EbayPicks | 111px |
| Explore by set | 202px |
| About + FAQ | 380px |
| PartnersStrip | 62px |
| Gaps (5 × 32px, post-trim) + `<main>` padding | ~208px |
| **`FooterAds` (the two leaderboard ad banners + disclosure)** | **282px** |
| Footer (post-accordion-collapse) | 512px |
| **Total** | **2,607px** |

The arithmetic is exact and worth stating plainly: **removing `FooterAds`
alone would land the page at 2,325px — under the 2,350px target with room
to spare.** It was deliberately NOT touched. `FooterAds` renders two real
AdSense/affiliate leaderboard banners (728×90 each, stacked) plus their
shared disclosure line — genuine ad-monetisation revenue, sitewide (every
one of 150+ routes), not homepage-specific. The master brief itself singles
out monetisation for protection in the one place it discusses trimming the
header ("Marketplace and Premium stay prominent — they're monetisation"),
and shrinking/reflowing/removing an ad unit is a yield/revenue decision, not
a design-density one — squarely the same category of "bigger sitewide
product decision beyond this phase's own reachability/design-fix mandate"
that Phase 4 already declined to touch for the same underlying reason
(that phase's parallel FooterNav-accordion lever, which THIS phase did
apply, once the footer was explicitly confirmed in-scope and the ad units
were confirmed NOT to be the same category of change). A real alternative
was considered and rejected: laying the two 728px-wide leaderboard units
side-by-side instead of stacked would roughly halve `FooterAds`' footprint
— but 728px × 2 = 1,456px exceeds the audit's own 1,440px desktop viewport,
and IAB-standard ad-unit dimensions are often load-bearing for a network's
own fill/creative-serving logic, so risking a fractional-width render on
exactly the viewport this target is measured at, for a monetisation unit,
was judged a worse trade than reporting this shortfall honestly. Every
other realistic lever within this phase's own design-fix mandate — the
hero (568px, intentionally near-full-screen per the brief's own "one
screen, and it is the whole first impression" framing, not oversized),
`ProofStrip` (241px, already "well under half a screen" per its own design
spec), `EbayPicks` (111px, pinned by `tests/ebay-picks.test.ts`, Phase 4's
own already-reasoned decision), the footer's site-map (already collapsed
this phase), and the section gaps (already trimmed this phase) — was
either already minimal, already reasoned about and kept by an earlier
phase, or genuinely too small a lever to matter against a 257px gap.
**Conclusion: 2,607px is the closest achievable figure without cutting into
sitewide ad monetisation, which is out of this phase's (and arguably any
single homepage-design phase's) authority to decide unilaterally.**

**2. Desktop above-the-fold interactive targets: 15 vs. the ≤12 target, 3
over.** After the fixes in this phase (dropdown auto-open bug, region-
toggle collapse, `HomeHeaderReveal` on the header's non-protected items),
the true architectural floor is:

| Contributor | Count |
|---|---|
| Header (logo + Premium; Marketplace is env-gated off in THIS sandbox — `NEXT_PUBLIC_MARKETPLACE_PUBLIC` unset — production would measure 3, not 2) | 2 (3 in prod) |
| Hero search box | 1 |
| Trending chips (brief: *"keep 6, they're a good zero-state"*) | 6 |
| Browse-all link | 1 |
| Region control (post-collapse) | 1 |
| **Floor, before any body content** | **11 (12 in prod)** |

That floor alone is already at or one below the ≤12 ceiling — with ZERO
budget left for anything below the hero. But at this phase's own trimmed
page height, `ProofStrip`'s first card+3-store-price-links (4 more
elements) genuinely intersects the first 900px, because a shorter hero (a
real, independent WIN against the page-height target above) mechanically
pulls more of the next section into the fold. **This is a direct,
structural conflict between two hard targets in the same table**: shrinking
the page to help target #1 pulls content up into the fold and hurts target
#2; growing the hero or adding space before `ProofStrip` to help target #2
directly un-does the very trim target #1 needed. Both cannot be perfectly
satisfied at once without deleting real, brief-mandated content. Given
that, and given the floor of 11-12 is already governed entirely by
explicitly-protected items (Marketplace/Premium by the brief's own words;
6 trending chips by the brief's own words; the search box, which IS the
page's whole redesigned purpose) plus one already-minimised region control,
**15 is judged the closest honest figure achievable without removing
content the brief itself protects.** Not weakened, not faked — the
assertion still fails loudly, exactly as it should, with the real element
list printed for whoever reviews this next.

Both shortfalls are flagged here precisely so Phase 7 (Lighthouse run,
final verification, closing `DECISIONS.md`) has exact numbers, exact
reasoning, and exact alternatives-considered for its own before/after Hard
Targets table — not a vague "didn't quite get there."

### Verification

| Command | Result | Notes |
|---|---|---|
| `npm run typecheck` | PASS — 0 errors | |
| `npm run lint` | PASS — exit 0 | Zero new warnings; same pre-existing `react/no-unescaped-entities` set every prior phase already catalogued, none in files this phase touched |
| `npm test` | PASS — 581/581 | Dipped to 580/581 mid-phase (`tests/internal-linking.test.ts`'s FooterNav-server-component pin) after converting `FooterNav.tsx` to a client component for the accordion; fixed by moving the client-only logic into a new sibling file (`HomeFooterToggle.tsx`) instead, keeping `FooterNav.tsx` itself a server component — re-ran the file in isolation (13/13) then the full suite (581/581) to confirm, both green in the committed state |
| `npm run build` | PASS — exit 0 | Full production build, no new route failures. Homepage (`/`) still a static (`○`) route: 12.7 kB page / 147 kB First Load JS (up slightly from Phase 5's ending 12.3 kB / 146 kB — this phase's own new markup/components, expected). Ran with `next dev` killed first per Phase 2's documented gotcha (concurrent `next build` + `next dev` against the same `.next` directory corrupts the dev server's module registry); `next dev` restarted afterward for this phase's own final re-verification pass |
| `scripts/homepage-audit.mjs` | 25/27 PASS | Two documented, reasoned shortfalls above; not weakened to fake a pass |
| `scripts/homepage-audit-analytics.mjs` | 8/8 PASS | All GA4 events verified firing with real params via real interactions |

### Phase 6 deliverables

- `scripts/homepage-audit.mjs` (new) — Hard Targets structural/link
  verification harness
- `scripts/homepage-audit-analytics.mjs` (new) — GA4 event verification via
  real driven interactions
- `package.json` — `audit:homepage` / `audit:homepage-analytics` npm
  aliases
- `artifacts/after/desktop-1440x900.png`, `artifacts/after/mobile-390x844.png`
  (new)
- `src/components/SearchBar.tsx` — fixed the autofocus-triggered dropdown
  auto-open bug; added `data-primary-cta` to the hero variant
- `src/components/home/CinematicHero.tsx` — fixed the stacking-context bug
  that let TrendingChips paint/hit-test over the search dropdown
- `src/components/CountryHeroToggle.tsx` — rebuilt from a 6-button strip to
  a single labelled trigger + on-click dropdown; `data-region-control="hero"`
- `src/components/CountrySwitcher.tsx` — `data-region-control="nav"`
- `src/components/HeaderSearchSlot.tsx` — added a `mobile` variant; the
  header's mobile search row is now scroll-gated on the homepage too
- `src/components/Navbar.tsx` — wires the mobile `HeaderSearchSlot` variant;
  wraps its own non-protected nav groups in the new `HomeHeaderReveal`
- `src/components/HomeHeaderReveal.tsx` (new) — homepage-only, scroll-gated
  visibility for header items the brief doesn't explicitly protect
- `src/components/FooterNav.tsx` — rebuilt as a homepage-only single
  accordion vs. every other route's unchanged 4-column grid, while staying
  a plain server component throughout
- `src/components/HomeFooterToggle.tsx` (new) — the client-only pathname
  toggle `FooterNav.tsx` delegates to, so the server-component test stays
  satisfied
- `src/app/page.tsx` — `gap-10` → `gap-8` on the top-level section wrapper
- This `DECISIONS.md` section
