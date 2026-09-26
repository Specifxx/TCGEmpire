# Current state: the rules and decisions in force

Last reviewed 2026-09-23, against DECISIONS.md up to and including the
overlays entry, [2026-09-23](../DECISIONS.md#L11348).

The short version of [DECISIONS.md](../DECISIONS.md): what still stands,
with the latest position where an entry was reversed. Each bullet ends with
links to its sources, labelled by date; [DECISIONS-INDEX.md](DECISIONS-INDEX.md)
gives each line's title. If this page and an entry disagree, the entry wins:
fix the page. When a new entry changes or reverses a bullet, update the
bullet in the same commit. `npm run decisions:index` fails if a link here no
longer lands on its entry.

## Deploys & egress

- **Production builds only on `[deploy]` in a commit SUBJECT** (any case; the
  body does not count), via `vercel.json`'s `ignoreCommand`, which fails
  open. Previews are not gated. [2026-09-11](../DECISIONS.md#L4871),
  [2026-09-11](../DECISIONS.md#L5195)
- **One release a day:** `production-deploy.yml` lands an empty `[deploy]`
  commit at 08:00 UTC if anything landed since the last one (GitHub's cron
  drifts; it has fired at 11:51–13:01). "Run workflow" releases at once.
  [2026-09-11](../DECISIONS.md#L4871), [2026-09-14](../DECISIONS.md#L6263)
- **Sessions never add `[deploy]` on their own**; "push to prod" means land
  on `main` and ride the release. RM9's four days saw 16 marked builds, about
  4 a day, and `egress-audit.yml` now counts them. The log names one standing
  exception, a database cutover. Two other off-schedule releases were
  one-offs: an explicit owner request, and an importer change whose
  auto-started import needed its site code live. Automated sessions still
  follow CLAUDE.md: add `[deploy]` only when the user says it is urgent.
  [2026-09-14](../DECISIONS.md#L6263), [2026-09-14](../DECISIONS.md#L6203),
  [2026-09-21](../DECISIONS.md#L9167), [2026-09-23](../DECISIONS.md#L11091)
- **A build is the expensive event:** it prerenders DB-backed pages and
  orphans much of the Data Cache. Card pages prerender nothing; don't re-add
  prewarming or lower a page's `revalidate`. The six egress rules atop
  `src/lib/db.ts` stand; rule 6 (no self-cached loader inside another
  `unstable_cache`) came from the nested-cache burn. Freshness shorter than a
  page's TTL is done client-side, like the `/auctions` countdown.
  [2026-09-11](../DECISIONS.md#L4871), [2026-09-11](../DECISIONS.md#L5042),
  [2026-09-16](../DECISIONS.md#L6683)
- **Guards:** `cachedOrDirect` logs nested-cache, cache-miss and oversize
  (past ~1.2 MB, where an `unstable_cache` entry silently drops).
  `BIG_RESULT_ROWS` / `_BYTES` are temporarily 200 rows / 400 KB; restore
  500 / 1 MB once audit-egress has measured the fix.
  [2026-09-14](../DECISIONS.md#L6263)
- **Left alone on purpose:** card pages purge after each of the two daily
  imports, and the 5-minute keep-warm stays (compute, not transfer). Still
  the owner's call: purging once a day, and narrowing `refresh-prices.yml`'s
  `push` trigger, which starts a full import when an importer file changes.
  [2026-09-11](../DECISIONS.md#L4871), [2026-09-11](../DECISIONS.md#L5303),
  [2026-09-11](../DECISIONS.md#L5370), [2026-09-23](../DECISIONS.md#L11091)
- **The burn is still unidentified.** RM9, RM10 and RM12 all went live after
  the gate and each neared or hit the cap in 3–4 days. Run audit-egress after
  each cutover (`RetailerPrice` is the first suspect); never sample during a
  deploy, import or purge. [2026-09-11](../DECISIONS.md#L5370),
  [2026-09-18](../DECISIONS.md#L8523), [2026-09-22](../DECISIONS.md#L10455)

## Databases

- **Live names** (since 2026-09-25; `src/lib/db-chains.ts` is the source of
  truth): operational `RM4`, one variable, never a chain, because
  `resolveVar()` takes the first SET variable, not the first healthy one.
  History: `HISTORY_DATABASE_URL_3`, then `_2`, then `DATABASE_URL`
  (terminal). Never rotate onto `DATABASE_URL`.
  [2026-09-14](../DECISIONS.md#L6203), [2026-09-22](../DECISIONS.md#L10455), [2026-09-25](../DECISIONS.md#L12637)
- **Migrating:** verify the target live first (a recycled project must trail
  the source on every metric; a new one must be empty). Use a named
  `maintenance.yml` task: it guards SOURCE≠TARGET, dumps before truncating,
  verifies every row count, runs twice and ends with `prisma db push`
  "already in sync". Flip the chain only after the data verifies; the owner
  sets the variable in all three Vercel environments.
  [2026-09-12](../DECISIONS.md#L5439),
  [2026-09-14](../DECISIONS.md#L6203), [2026-09-18](../DECISIONS.md#L8523)
- **These move with the chain:** `build-db-push.sh`, the `db.ts` /
  `db-history.ts` warnings, each workflow's `DB_SOURCE_NAME`, its
  `OPERATIONAL_URL` guard and env-var names, and the probe labels; migration
  tasks' SOURCE/TARGET do not. [2026-09-18](../DECISIONS.md#L8523),
  [2026-09-23](../DECISIONS.md#L11091)
- **Workflow traps:** a duplicate YAML key makes GitHub reject the whole
  workflow (local parsers accept it), and rotating back onto an old name can
  collide step names. `maintenance.yml` must stay under GitHub's
  512,000-byte limit (a test fails at 450 KB).
  [2026-09-22](../DECISIONS.md#L10455), [2026-09-23](../DECISIONS.md#L10924)
- **History is not solved either:** despite the 09-11 ~0 GB/day reading,
  history projects still neared or hit the cap in about five days (09-17,
  09-22). [2026-09-11](../DECISIONS.md#L5303),
  [2026-09-17](../DECISIONS.md#L7710), [2026-09-22](../DECISIONS.md#L10455)
- **Never build or run a dev server against production;** use the local seed
  DB. [2026-09-16](../DECISIONS.md#L6598), [2026-09-23](../DECISIONS.md#L11201)

## Premium & monetisation

- **Measure the trial model until about 2026-10-15:** the owner replaced the
  14-day trial on 2026-09-24 with a **3-day card-gated trial, then the first 3
  months half price on monthly plans** (never-paid accounts; annual unchanged).
  Leave the pitch, pricing and trial alone while it is measured with
  `trial-cancel-report`, which counts the cancel click
  (`cancel_at_period_end`); `funnel-report`'s "canc" counts only ended
  subscriptions and missed every mid-trial cancel. A trial set to end is told
  it won't be charged, gets the no-charge reminder 24–48h out and a one-click
  Keep (`/api/premium/resume`); plan switches stay hidden mid-trial until
  verified on a Stripe test clock. The owner lifted the freeze for the
  09-25 lineup change (prices, trial and intro untouched); compare cohorts
  by `PREMIUM_COPY_VERSION` (`lineup-2026-09-25`, then `lineup-2026-09-25b`
  once Demand Finder returned to Premium the same day).
  [2026-09-24](../DECISIONS.md#L12120), [2026-09-24](../DECISIONS.md#L12215), [2026-09-23](../DECISIONS.md#L10924),
  [2026-09-25](../DECISIONS.md#L12842)
- **Tiers (lineup of 2026-09-25):** Plus, $4.99/mo or $39.99/yr, is
  **ad-free**, has the full Deal Finder (with "Only my cards") and Rising
  Cards lists, and target-price alerts on up to `PLUS_TARGET_ALERT_LIMIT`
  (25) cards. Premium, $9.99/mo or $79.99/yr, adds unlimited targets,
  Best Basket's store-by-store plan (for a pasted list, deck, watchlist or
  binder, and behind the portfolio's replacement cost) and **Demand Finder**
  (`/tools/demand`, `isPremium(user, "premium")`: top 25 most searched and
  most viewed, 7 or 30 days). Below Premium, Plus included, Demand Finder
  shows only the free /movers strip's top 10 most searched this week
  (`FREE_DEMAND_ROWS`, `tests/demand-finder.test.ts`). Any signed-in
  account gets its own Best Basket total and the replacement-cost total;
  "binder" means replacement cost, never gaps. Value Finder, Rising Sealed,
  the Condition Calculator and the Bulk Pricer are gone, each 301'd to the
  free page carrying its useful part (`tests/lineup-removals.test.ts`).
  The intro price is an amount-off coupon created by `ensureIntroCoupon`;
  its display and charge share `introAmountOffCents`, and it is quoted only
  where `introEligibleFor` says checkout will give it. A tier switch keeps
  exactly the discounted renewals left (`introRenewalsRemaining`).
  [2026-09-11](../DECISIONS.md#L4428), [2026-09-24](../DECISIONS.md#L12120),
  [2026-09-25](../DECISIONS.md#L12322), [2026-09-25](../DECISIONS.md#L12842),
  [2026-09-25](../DECISIONS.md#L13067)
- **Gates:** `isPremium(user)` defaults to the Plus minimum; ads read
  `adFree` (any paid tier). Tier comes from the Stripe price (`tierFromPriceId`);
  a `premiumTierFloor` only raises a paid tier, never grants one. Never reuse
  a Price across tiers. Ad-free is enforced client-side too: the eBay
  carousel and the app's AdMob banner check `adFree`, and the `rc_adfree`
  boot script pauses ad requests before the (ungated) loader. **Set
  `AD_STRATEGY=manual`, or verify anchor/vignette ads stay off on a Plus
  account, before AdSense Auto ads go on.** [2026-09-11](../DECISIONS.md#L4774),
  [2026-09-14](../DECISIONS.md#L6038), [2026-09-25](../DECISIONS.md#L12842)
- **Copy:** members see their real tier; marketing says "Premium", except
  that a Plus-level wall sells Plus (`<PremiumButton tier="plus">`) and every
  surface describing Plus says it is ad-free; never link a member to a wall. The pitch is "Never overpay for a Riftbound card", with
  no flipper or "ahead of the market" language. No fake scarcity,
  countdowns, invented numbers, savings totals or testimonials. Rising
  Cards is a screen, not a prediction. The lock-in banner is a promise:
  never move existing subscribers onto a new Price.
  [2026-09-11](../DECISIONS.md#L4642), [2026-09-14](../DECISIONS.md#L5971),
  [2026-09-10](../DECISIONS.md#L3990), [2026-09-22](../DECISIONS.md#L10328),
  [2026-09-25](../DECISIONS.md#L12842)
- **Checkout:** every buy button goes to `/premium/start` (sign-in first when
  signed out; OAuth only). `/premium` defaults to MONTHLY and headlines the
  real price, with no `$0`. [2026-09-13](../DECISIONS.md#L5890),
  [2026-09-14](../DECISIONS.md#L6038)
- **Nudges:** the signed-out popup sells the FREE account (no price, no
  gold); the signed-in `PremiumSlideIn` carries Premium. The popup waits for
  a 2nd page view or 60 s of reading, never on the first page from another
  site or a phone's first view (`lib/signup-promo-gate.ts`). It stops after 2
  dismissals per device, snoozes 3 pages then 7 days, and keeps its 5-second
  delay. [2026-09-16](../DECISIONS.md#L7031),
  [2026-09-14](../DECISIONS.md#L6134), [2026-09-24](../DECISIONS.md#L12089)
- **Signed-out visitors get nothing from Deal Finder or Rising Cards**; a
  free account gets the top 3 of each, a paid tier the full list.
  [2026-09-22](../DECISIONS.md#L10538), [2026-09-25](../DECISIONS.md#L12842)
- **AdSense review mode** (`NEXT_PUBLIC_ADSENSE_REVIEW_MODE`, which lifts
  the paywall for a submission) **is off by default in code**; a value set in
  Vercel's dashboard overrides it. "The paywall now takes priority." The
  loader and meta tag are never gated. `scripts/adsense-guard.ts` still
  fails on pages under 150 unique editorial words, near-duplicate clusters
  above 90%, and pages with empty server HTML.
  [2026-09-22](../DECISIONS.md#L10538), [2026-09-17](../DECISIONS.md#L7801)
- **Measure changes:** after the freeze, bump `PREMIUM_COPY_VERSION` /
  `PROMO_VARIANT` whenever funnel wording, price or frequency changes.
  [2026-09-09](../DECISIONS.md#L3628), [2026-09-14](../DECISIONS.md#L6134)
- **Sign-up attribution:** /login keeps the clicked source
  (`readSignupSource`) rather than overwriting it with "login", and every
  /login link carries `src=` or marks its source on click
  (`tests/login-links-attributed.test.ts`). By-source numbers compare only
  from 2026-09-25 on. [2026-09-25](../DECISIONS.md#L12446)
- **Affiliate clicks name their page:** outbound store and eBay links are
  `OutboundLink`s, so `buy_click` carries `page_type`, `surface` and the
  visitor's first-touch `entry` bucket (`lib/entry-source.ts`). Their URLs
  come from `lib/affiliate.ts` (`affiliateUrl` with the page's path,
  `ebaySearchUrl` with a source), never a local eBay host map, so EPN's
  customid names the page and all six markets reach their own eBay.
  Every eBay unit sends its own `surface` and a distinct EPN source, and every
  eBay query goes through `riftboundEbayQuery` ("Riftbound" exactly once).
  By-surface numbers compare only from 2026-09-26 on (the eBay-only surfaces
  from 09-27). [2026-09-26](../DECISIONS.md#L13640),
  [2026-09-26](../DECISIONS.md#L13751)
- **eBay beside every comparison, never inside the ranking** (owner, 09-26:
  push eBay clicks even where stores are cheaper). No comparison is re-ranked
  and no true figure (the "+N%" on a dearer eBay row) is hidden; eBay rows keep
  their price position but wear eBay blue (`.btn-ebay`, or `.btn-ebay-ghost` in
  a list of ghost buttons). Everything else is a labelled "Search …" beside the
  list (`EbaySearchPanel`, Paid link tag + EPN disclosure) that claims no price,
  stock or listing; cross-sells (`promo`) hide for ad-free members and carry
  `data-ad-placement`. `/editorial-policy`, `/about` and `/privacy` disclose
  this. Never claim eBay guarantees ("money back", "buyer protection" fail a
  test). The homepage's free "Cheapest on eBay" row lists only cards where eBay
  beats every source the card page ranks (EU: CardTrader too; US: TCGplayer's
  listing too; Canada never). Its free status beside the trial measurement is
  the owner's call. [2026-09-26](../DECISIONS.md#L13751)

## Navigation & chrome

- **Desktop rail:** 17rem from 1024px, always expanded (the collapse mode was
  deleted on 09-21). Group headers are disclosures; only Prices opens on a
  first visit. The rail's search filters FEATURES; the header's searches
  CARDS. [2026-09-21](../DECISIONS.md#L9958),
  [2026-09-21](../DECISIONS.md#L10095)
- **Header:** "Database" (→ `/browse`) shows at every width. Card search has
  its own row until xl, then sits inline. The theme toggle is in the header
  from lg, in the menu below that. [2026-09-21](../DECISIONS.md#L9368),
  [2026-09-21](../DECISIONS.md#L10095), [2026-09-23](../DECISIONS.md#L11201)
- **1024–1279 is its own band** (~704px of content): the filter sidebar
  waits for xl, card art is 160px (320 from xl), and stickies use
  `lg:top-36 xl:top-20`. [2026-09-23](../DECISIONS.md#L11201)
- **No mobile bottom tab bar** (fixed-bottom UI cannot track browser chrome)
  **and no notification bell** (build a `/notifications` page rather than
  restore it). One control opens `CinematicNavMenu` below lg.
  The one fixed-bottom exception is the card page's owner-requested sticky
  buy bar (`CardStickyBuyBar`, below lg, hidden over the comparison); if it
  rides up like the tab bar did, delete it — `CardTopBuy` under the name
  carries the same action. [2026-09-26](../DECISIONS.md#L14021)
  [2026-09-18](../DECISIONS.md#L8260), [2026-09-19](../DECISIONS.md#L8590)
- **Watchlist:** a heart on all five surfaces and its own header control
  from sm, opening a right-side drawer; `/watching` stays. The drawer renders
  rows (`layout="list"`), never the page's grid: its breakpoints read the
  viewport and gave a 448px drawer four 90px columns. On a tile the heart
  stacks above the badges, which stop short of it.
  [2026-09-18](../DECISIONS.md#L8349), [2026-09-22](../DECISIONS.md#L10260),
  [2026-09-24](../DECISIONS.md#L11719)
- **Gold marks Premium**, so a non-Premium action never wears it. Phones show
  "✦" beside Database from 360px and the word from 400px (below 360, the
  menu's Premium spotlight). Signed-out visitors see "Log in" and a primary
  "Sign up free" at every width; below sm the market switcher lives in the
  menu's top bar. [2026-09-24](../DECISIONS.md#L11756)
  [2026-09-16](../DECISIONS.md#L7031), [2026-09-18](../DECISIONS.md#L8417)
- **Homepage order:** Recently viewed (returning visitors), Top Deals (with
  the free "Cheapest on eBay" row under its columns), eBay Picks (the newest
  released set), the popular carousel, Riftle/pack-sim, How it works.
  [2026-09-17](../DECISIONS.md#L7959), [2026-09-21](../DECISIONS.md#L9500),
  [2026-09-26](../DECISIONS.md#L13751)
- **Overlays:** `ui/Dialog` portals to body; Escape closes only the top
  layer and focus returns to the opener. Corner nudges share one corner
  string. [2026-09-23](../DECISIONS.md#L11348)

## Content & SEO

- **One page, one phrase:** add the `docs/seo-keyword-map.md` row before
  publishing, and publish fewer pages than feels natural (13 of ~24 Vendetta
  posts were 301'd, 7 after an AdSense low-value rejection).
  [2026-09-10](../DECISIONS.md#L4094), [2026-09-12](../DECISIONS.md#L5648),
  [2026-09-17](../DECISIONS.md#L7894)
- **Owners:** the six market homepages' titles and H1s lead with "Riftbound
  Card Prices", and their titles quote a LIVE count of stores with an
  in-stock listing (`homeTitle` / `regionHomeTitle`, dropped when unknown);
  each has a "Riftbound card prices today" table under the hero. `/browse`
  owns "riftbound card list"; the Radiance spoiler tracker is the only title
  with "radiance" + "spoiler". No store count in any OTHER page title
  (Singapore's "11 Stores" excepted). Bare hreflang `en` is the US page; the
  EU pages carry one en-XX per EU country served.
  [2026-09-24](../DECISIONS.md#L11756)
  [2026-09-17](../DECISIONS.md#L7894), [2026-09-21](../DECISIONS.md#L9560),
  [2026-09-21](../DECISIONS.md#L9222), [2026-09-22](../DECISIONS.md#L10403)
- **Card pages are always indexable** (09-17 reversed Phase 7a); only
  `getCanonicalTwin` duplicates are noindexed. Card titles aim for 60
  characters, but uniqueness beats length.
  [2026-09-17](../DECISIONS.md#L7393), [2026-09-17](../DECISIONS.md#L7801)
- **Set-agnostic code:** nothing names the current set; a new set is a data
  row. [2026-08-27](../DECISIONS.md#L3501), [2026-09-21](../DECISIONS.md#L9560)
- **Accuracy:** never invent TCG facts, numbers or testimonials, and never
  predict prices. Quote leaks only from photographed cards; half-known cards
  stay out of `manual-cards.json`. [2026-09-18](../DECISIONS.md#L8476),
  [2026-09-22](../DECISIONS.md#L10683)
- **FAQ:** one `faq` field feeds the visible Q&A and the JSON-LD. Every
  article needs an editorial inbound link. [2026-09-21](../DECISIONS.md#L9560),
  [2026-09-21](../DECISIONS.md#L9273)
- **Posts shared on Reddit put their buy paths early:** every Radiance news
  post (`category: "blog"`, tagged `radiance`) carries the pre-order CTA by
  rule (`carriesRadiancePreorderCta`); guides never do. A high-traffic post
  places its eBay strip mid-article with its own `[[shop]]` line, ahead of
  60% of the body (`tests/reddit-landing-conversion.test.ts`). Links posted
  to Reddit should carry `?utm_source=reddit`: the apps often send no
  referrer. [2026-09-26](../DECISIONS.md#L13640)

## Prices & data

- **Reference prices sit below the comparison, never in it** (TCGplayer;
  Cardmarket leads for UK/EU). The US `tcgplayer` row is the cheapest
  in-stock English NM listing; `tcgplayer_market` is reference-only.
  [2026-09-18](../DECISIONS.md#L8181), [2026-09-19](../DECISIONS.md#L8747),
  [2026-09-23](../DECISIONS.md#L10975)
- **Deal Finder opens on "Underpriced vs TCGplayer".**
  `Card.marketPriceCents` is synthetic; never show it.
  [2026-09-21](../DECISIONS.md#L9681), [2026-09-17](../DECISIONS.md#L7801)
- **Stores:** check the match rate before adding one. If a read fails, keep
  yesterday's rows; rows expire after 72h of empty returns, and
  `DECOMMISSIONED_RETAILERS` purges removed stores. A store's `currency`
  must match its market or its prices are refused (`lib/offer-currency.ts`).
  Sealed-only stores go in `lib/sealed-stores.ts`, never `RETAILERS`.
  [2026-09-23](../DECISIONS.md#L11091), [2026-09-23](../DECISIONS.md#L11034),
  [2026-09-24](../DECISIONS.md#L11971)
- **Sealed offers have three states** (open / sold out / unknown past 72h,
  `lib/sealed-offers.ts`); only open offers set a headline price or a store
  count. [2026-09-24](../DECISIONS.md#L11971)
- **Matching:** one `FOREIGN_LANG` pattern and one promo-set regex; a sealed
  listing's own title can veto its group. A plain store title (no chase
  signal) drops overnumbered/signature candidates before the cross-set
  check, so a chase reprint in a new set never strands the original's
  name-only listings. [2026-09-10](../DECISIONS.md#L4284),
  [2026-09-20](../DECISIONS.md#L8969), [2026-09-26](../DECISIONS.md#L14021)
- **Card art** comes from the `/card-art` mirror via `cardImageSrc`; OG
  images need PNG (`cardImageForOg`). Grids, lists and thumbnails use the committed
  320w/480w renditions via `cardImageSrcSet`/`cardThumbProps`; only the
  card-detail hero loads the 744px file. `/browse` defaults to "Most popular". [2026-09-13](../DECISIONS.md#L5750),
  [2026-09-22](../DECISIONS.md#L10857)
- **Portfolio value never includes shipping.** Price-drop emails: at most one
  digest per address per week, except Plus/Premium target, below-market and
  restock alerts, which run after both daily imports (refresh-prices.yml's
  `/price-alerts/paid` step). The free `all` run is a refresh-prices.yml step
  straight after the 07:00 import (no vercel.json cron), or a manual run with
  `free_alerts` ticked. Both are gated `!cancelled() && steps.import.outcome ==
  'success'` and never run on push; a push re-import runs the no-email
  `/price-alerts/baseline` pass instead. Every alert email names up to three
  stores with postage and a delivered total only where postage is known
  ("item price, postage extra" otherwise), is fluid (max-width 520px), and
  sends a plain-text part plus List-Unsubscribe one-click headers. Items past
  the 40 a digest renders are held for the next email, never recorded as told.
  [2026-09-15](../DECISIONS.md#L6531),
  [2026-09-21](../DECISIONS.md#L9752), [2026-09-25](../DECISIONS.md#L12842),
  [2026-09-25](../DECISIONS.md#L13128), [2026-09-25](../DECISIONS.md#L13258),
  [2026-09-25](../DECISIONS.md#L13394)
- **Alert emails pause, never delete, by default:** the footer, the inbox
  one-click and /watching write `AlertMute` (per address; the run skips it,
  baselines advance); deleting every watch is a separate explicit button.
  Per-card one-tap links (stop, snooze 30 days, Plus/Premium one target 10%
  under the lower of target and price) are HMAC-signed
  (`lib/alert-actions.ts`, key derived from `AUTH_SECRET`) and act only on a
  POST from the `/alerts/action` confirmation page, never on GET. A one-tap
  target at or above the current alert price is stored already fired there.
  `sanitizeNextPath` rejects backslashes and control characters, and
  `/api/market` re-checks the redirect's origin.
  [2026-09-25](../DECISIONS.md#L13258), [2026-09-25](../DECISIONS.md#L13394)
- **Alerts read the alert price, never Card.lowestPriceCents\*:** the
  cheapest in-stock Near Mint (or unstated) copy seen within 36h at a store,
  CardTrader or TCGplayer US's listing (`lib/alert-price.ts`). No eBay (no
  opt-in), no reference or `derived` rows. `unknown`, never sold out, when
  only stale rows claim stock, when a stale store is cheaper than every fresh
  copy, or when an in-stock row up to 14 days old survives a failing feed. A
  drop must be ≥5% and ≥50 minor units of the reference: the price last
  emailed while under 30 days old, else the drop anchor (`dropAnchorCents`,
  the price before the slide), else the last price. No reminders. A low >40%
  under the last price is held one run and confirmed only within ±5%.
  Targets re-arm above the line or on sell-out and re-fire only 10% further
  down; paid triggers have a 20h per-card cooldown; below-market needs ≥15%
  under TCGplayer market (`tcgMarketFor`, direct, never a `derived` row).
  `ALERT_DAILY_BUDGET` 50 addresses per 20h window (env-overridable), the
  free run at most 35. New watches are seeded from the alert price
  (`alertBaselineSeed`, null when not priced), never `pickPrice`.
  [2026-09-25](../DECISIONS.md#L13128), [2026-09-25](../DECISIONS.md#L13394)
- **Methodology breaks:** `METHODOLOGY_BREAKS` and `dropBreakWindow` live in
  `lib/price-history.ts`; every per-card PriceHistory reader uses them
  (`tests/methodology-breaks.test.ts`), and the Index and portfolio are
  chain-linked across a break. Rising Cards is the exception: it keeps its
  pre-09-23 signals by the owner's call until cards have five weekly points
  on the new basis. [2026-09-25](../DECISIONS.md#L12842), [2026-09-25](../DECISIONS.md#L13043)
- **Rules text:** `Card.description` comes from Riot's gallery for every set.
  Origins, Proving Grounds, Spiritforged and Unleashed are filled by
  `scripts/backfill-card-text.ts` (maintenance task `backfill-card-text`,
  report-only unless `apply`): fill-only, matched on externalId + name +
  collector number, refused unless it reproduces the stored Vendetta format.
  Never run set-pipeline for those sets (it would duplicate ~950 cards);
  sync-cards never writes the column. Core bracket-marker keywords are
  unscoped; Empower/Flow/Burn and the plain-word predicates stay on Vendetta.
  [2026-09-25](../DECISIONS.md#L12375)
- **First-listing and restock alerts:** a watch with a null baseline (no
  price in that market when it was created) gets one "now listed" email when
  the card lists — "open for pre-order" while its set is unreleased, which
  never becomes the drop reference. A watch that sold out (`soldOutAt`) for
  20h+ and was seen sold out by two runs (`soldOutRuns`) gets "back in
  stock"; a pre-2026-09-25 Card-price baseline that reads sold out is reset
  to no price instead. Both sit inside the weekly per-address cap and at
  most 25 new digests a run. Offering an alert on a card with no price
  names that notice ("pre-order alert", "in-stock alert"), never a drop,
  in QuickView and its email modal too. [2026-09-25](../DECISIONS.md#L12574),
  [2026-09-25](../DECISIONS.md#L13128), [2026-09-25](../DECISIONS.md#L13394),
  [2026-09-26](../DECISIONS.md#L13640)
- **Postage is measured, never guessed:** Best Basket, portfolio
  replacement cost and store pages price delivery with `shippingFor()`
  (lib/shipping.ts) from `src/lib/shipping-rates.json`, built by
  `scripts/build-shipping-rates.ts` from the checkout probe (never edit it by
  hand). A letter applies only within the value and card count it was seen
  on; free postage only from a measured threshold; an unknown region is
  priced at the highest regional rate, a US region between two measured
  cities at the dearer, US/CA "Elsewhere" as a floor ("from"). An unmeasured
  store is charged at least its market's highest measured one-card rate and
  labelled "est.". `shipping-rates.yml` re-measures monthly and never
  commits. [2026-09-25](../DECISIONS.md#L12689),
  [2026-09-25](../DECISIONS.md#L12803), [2026-09-25](../DECISIONS.md#L12831)
- **Auto-renew is on by default** with no in-site off button; switching off
  stays in the Stripe portal. The paid-renewal reminder is built on
  `feedback/auto-renew` and held for Stripe test-mode testing.
  [2026-09-25](../DECISIONS.md#L12831)

## Removed, declined, kept

- **Meta decks:** `/decks*` 301s to `/deck`; rebuild only from a licensed
  source, never a hand copy. [2026-09-12](../DECISIONS.md#L5565)
- **Also removed:** Market Pulse and the domain chips; the card page's
  "Embed this live price" (`/embed` still offers the widgets); the per-card
  eBay auction pass. [2026-09-17](../DECISIONS.md#L7959),
  [2026-09-21](../DECISIONS.md#L9560), [2026-09-16](../DECISIONS.md#L6683)
- **Declined:** a locked popup ✕; guest checkout (deferred); a Radiance post blitz or paid ads; a static rule-2
  egress test; a static landscape header or
  a 44px desktop switcher; re-ranking eBay above a cheaper store, an eBay
  "Money Back Guarantee" claim, a card-page "#N of M" eBay module, affiliate
  links in emails. [2026-09-26](../DECISIONS.md#L13751),
  [2026-09-14](../DECISIONS.md#L6134),
  [2026-09-13](../DECISIONS.md#L5890), [2026-09-16](../DECISIONS.md#L6598),
  [2026-09-21](../DECISIONS.md#L9560), [2026-09-14](../DECISIONS.md#L6263),
  [2026-09-23](../DECISIONS.md#L11201). (A minimum "real drop" threshold, once
  declined, was set on [2026-09-25](../DECISIONS.md#L13128).)
- **Kept on purpose:** Premium's nav prominence; the client-only
  `ssr: false` overlays. [2026-09-16](../DECISIONS.md#L6834),
  [2026-09-22](../DECISIONS.md#L10328)

## UI conventions

- **Tap targets:** `.btn`, `.input` and `min-h-11` are 44px. `.tap-icon` is
  44px below sm and 36px from sm with a mouse. All are 48px on a coarse
  pointer at any width, and `.tap-link` extends that to text links. Shrink an
  icon inside an unchanged tap box. [2026-08-17](../DECISIONS.md#L2030),
  [2026-09-16](../DECISIONS.md#L7242), [2026-09-23](../DECISIONS.md#L11201)
- **Desktop-only compact resets use `sm:[@media(pointer:fine)]:…`**; a bare
  `sm:min-h-0` cancels the touch floor on tablets.
  [2026-09-18](../DECISIONS.md#L8417), [2026-09-23](../DECISIONS.md#L11348)
- **Layout:** every grid gets a base `grid-cols-1`; rows of controls wrap;
  `body{overflow-x:clip}` is only a backstop. Audit phones at DPR 2.
  [2026-09-22](../DECISIONS.md#L10643), [2026-09-23](../DECISIONS.md#L11201)
- **Theme:** dark by default, no `prefers-color-scheme`. Light is a `theme`
  cookie stamped before paint; the root layout never reads cookies.
  [2026-09-12](../DECISIONS.md#L5530)
- **Details:** `.scroll-mt-header` goes on the element carrying the id.
  Fields are 16px on phones. Every `outline-none` has a `focus-visible:`
  ring. Motion uses `usePresence()`, no library. `SearchBar` must not use
  `useSearchParams()`. Route files export only Next's names. Analytics go
  through one `trackEvent()`. [2026-09-23](../DECISIONS.md#L11201),
  [2026-09-21](../DECISIONS.md#L10095), [2026-09-16](../DECISIONS.md#L6598),
  [2026-09-22](../DECISIONS.md#L10285), [2026-09-21](../DECISIONS.md#L9351),
  [2026-08-17](../DECISIONS.md#L3358)
- **Verification:** measure in a real browser; a deploy is not a
  verification. ESLint skips dot-directories. Checker agents return strings
  and never edit files. [2026-09-18](../DECISIONS.md#L8349),
  [2026-09-21](../DECISIONS.md#L9908), [2026-09-23](../DECISIONS.md#L11201)
