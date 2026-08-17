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
