# Current state: the rules and decisions in force

Last reviewed 2026-09-23, against DECISIONS.md up to and including the
overlays entry, [2026-09-23](../DECISIONS.md#L11348); the free-limits bullets
updated on [2026-09-28](../DECISIONS.md#L14549); the trial and tiers bullets on
[2026-09-30](../DECISIONS.md#L15595); the Pokémon section on
[2026-10-01](../DECISIONS.md#L16105); the search allowance and paid history,
graded and auction bullets on [2026-10-09](../DECISIONS.md#L16846); the
Pokémon section's DexCompare connection on [2026-10-15](../DECISIONS.md#L17162).

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
  open. [2026-09-11](../DECISIONS.md#L4871),
  [2026-09-11](../DECISIONS.md#L5195)
- **Previews are off (2026-10-14):** `claude/*` branches never deploy, and any
  other branch or pull request builds a preview only when the commit SUBJECT
  carries `[preview]` (any case), added only when the owner asks. A preview
  build was the full pipeline against the Preview environment's databases
  (schema push, Singapore import, ~475 prerendered database-backed pages); an
  unreadable message builds no preview. Production is unchanged.
  [2026-10-14](../DECISIONS.md#L17091)
- **One release a day, after the snapshot (2026-10-15):** the morning import
  (`refresh-prices.yml`) exports and commits the public data snapshot, then
  dispatches `production-deploy.yml`, which lands an empty `[deploy]` commit;
  so in `PUBLIC_DATA_MODE=files` every release serves that day's data. The old
  08:00 cron fired 5 to 9 hours late and beat the snapshot by minutes. The
  schedule is now a 22:00 UTC fallback that skips if any `[deploy]` landed in
  the last 20 hours. "Run workflow" releases at once.
  [2026-10-15](../DECISIONS.md#L17436)
  [2026-09-11](../DECISIONS.md#L4871), [2026-09-14](../DECISIONS.md#L6263),
  [2026-10-03](../DECISIONS.md#L16553)
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
- **Card pages are cached by the CDN, not ISR (2026-10-17):** `/card/[id]` is `force-dynamic` with `Vercel-CDN-Cache-Control` (a day, plus a day stale) from `next.config.js`; nothing in its tree may read the visitor (`tests/card-cdn.test.ts`). An ISR write of a card was ~70 units after every release. [2026-10-17](../DECISIONS.md#L18379)
- **Page TTLs are six hours or more (owner, 2026-10-14):** `revalidate` 21600
  for what buyers act on (homes, decks, pre-orders, release dates, per-card API
  and embeds), 86400 for slow content. The import's purge and the daily release
  are what refresh prices; the TTL is the fallback. A loader's TTL moves with
  its page (rule 5), and a route handler that is a plain function on Vercel
  (reads `request.url`, or a dynamic segment with no `generateStaticParams`)
  caches through its CDN header, which moves with it. `/auctions` keeps 1800: a
  dynamic page whose 30-minute data cache matches the 4-hourly sweep.
  [2026-10-14](../DECISIONS.md#L17060)
- **Guards:** `cachedOrDirect` logs nested-cache, cache-miss and oversize
  (past ~1.2 MB, where an `unstable_cache` entry silently drops).
  `BIG_RESULT_ROWS` / `_BYTES` are temporarily 200 rows / 400 KB; restore
  500 / 1 MB once audit-egress has measured the fix.
  [2026-09-14](../DECISIONS.md#L6263)
- **No import purge in files mode (2026-10-16):** with `PUBLIC_DATA_MODE=files`
  the pages serve the release's snapshot, so `/api/revalidate` answers 202
  "skipped" (`importPurgeIsNoop`) unless `?force=1`; the daily release is what
  refreshes them. In `db`/`fallback` mode card pages purge after each import as
  before. The 5-minute keep-warm stays (compute, not transfer). Still the
  owner's call: narrowing `refresh-prices.yml`'s `push` trigger, and the
  Pokémon section (off, or 301 to DexCompare).
  [2026-10-16](../DECISIONS.md#L18017)
  [2026-09-11](../DECISIONS.md#L4871), [2026-09-11](../DECISIONS.md#L5303),
  [2026-09-11](../DECISIONS.md#L5370), [2026-09-23](../DECISIONS.md#L11091)
- **The burn is still unidentified.** RM9, RM10 and RM12 all went live after
  the gate and each neared or hit the cap in 3–4 days. Run audit-egress after
  each cutover (`RetailerPrice` is the first suspect); never sample during a
  deploy, import or purge. [2026-09-11](../DECISIONS.md#L5370),
  [2026-09-18](../DECISIONS.md#L8523), [2026-09-22](../DECISIONS.md#L10455)

## Databases

- **Public data can be served from files** (`data/public/`, `src/lib/public-data/`):
  every public table is exported after the 07:00 import and committed without
  a deploy marker. `PUBLIC_DATA_MODE` (`db` default / `fallback` / `files`)
  decides whether public reads hit Neon; cron routes, alert baselines and the
  auction board always ask Neon first. Private data never goes to files.
  Demand counters are published only as ranks. [2026-10-09](../DECISIONS.md#L16803)
- **The deploy bundles a gzipped pack of the snapshot, not data/public/ (2026-10-26):**
  `npm run build` writes `.public-data-pack/` (`scripts/pack-public-data.ts`) and
  `next.config.js` traces it instead of 1,700 files. The committed format is
  unchanged. It did not shorten builds; the store-page index below did. [2026-10-26](../DECISIONS.md#L19723)
- **Listings are indexed by store as well as by card (2026-10-26):** in files mode
  a `where: { retailer }` query reads the `retailer` index, not every listing;
  the 226 store pages were most of the build's prerender. [2026-10-26](../DECISIONS.md#L19878)
- **The site watches itself (2026-10-14):** `ops-monitor.yml` (GitHub Actions, every
  3 h, Sunday digest) checks Neon transfer limits, eBay, price imports, scheduled
  jobs, the live site, Stripe, email and the inbox, stores the result for
  `/admin/health`, and emails the owner only when something needs a look. Its
  memory is the Actions cache, not the database it watches. Every new public form
  calls `notifyOwnerBounded` (capped 8/h, 25/day); a new job, API or limit gets a
  check in `lib/ops/checks.ts`. The Neon rows need the `NEON_API_KEY` Actions secret.
  `docs/ops-monitor.md`. [2026-10-14](../DECISIONS.md#L16978)
- **Live names** (since 2026-10-25; `src/lib/db-chains.ts` is the source of
  truth): operational `RM10`, one variable, never a chain, because
  `resolveVar()` takes the first SET variable, not the first healthy one.
  History: `HISTORY_DATABASE_URL_4`, then `_3`, then `DATABASE_URL`
  (terminal). Never rotate onto `DATABASE_URL`.
  [2026-09-14](../DECISIONS.md#L6203), [2026-09-22](../DECISIONS.md#L10455), [2026-09-25](../DECISIONS.md#L12637), [2026-09-26](../DECISIONS.md#L14422), [2026-09-28](../DECISIONS.md#L15024), [2026-10-04](../DECISIONS.md#L16597), [2026-10-09](../DECISIONS.md#L16789), [2026-10-14](../DECISIONS.md#L16962), [2026-10-17](../DECISIONS.md#L18408), [2026-10-25](../DECISIONS.md#L19494)
- **Migrating:** verify the target live first (a recycled project must trail
  the source on every metric; a new one must be empty). Use a named
  `maintenance.yml` task: it guards SOURCE≠TARGET, dumps before truncating,
  verifies every row count, runs twice and ends with `prisma db push`
  "already in sync". Run the final pass between imports: a sealed refresh
  mid-copy fails the count. A recycled name can collide with its own old
  task; replace the legacy step, never keep two. Flip the chain only after the data verifies; the owner
  sets the variable in all three Vercel environments.
  [2026-09-12](../DECISIONS.md#L5439),
  [2026-09-14](../DECISIONS.md#L6203), [2026-09-18](../DECISIONS.md#L8523), [2026-10-17](../DECISIONS.md#L18408), [2026-10-25](../DECISIONS.md#L19494)
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
- **Public price history is files, not Neon (2026-10-03):** the GLOBAL card
  series and the sealed series are one JSON file per Sydney day in
  `data/price-history/` (`lib/price-history-store.ts`). Every import writes or
  replaces the day's file (daily again, no weekly gate), `refresh-prices.yml`
  commits it to `main` without a deploy marker, and each release bundles the
  files (`outputFileTracingIncludes`). History-derived caches key on
  `cardHistoryVersion()`. The history project keeps only the PRIVATE click log
  (`ClickEvent`); nothing private may ever be written to the files. While the
  projects held the price history they neared or hit the cap in about five
  days (09-17, 09-22). [2026-09-11](../DECISIONS.md#L5303),
  [2026-09-17](../DECISIONS.md#L7710), [2026-09-22](../DECISIONS.md#L10455),
  [2026-10-03](../DECISIONS.md#L16553)
- **Never build or run a dev server against production;** use the local seed
  DB. [2026-09-16](../DECISIONS.md#L6598), [2026-09-23](../DECISIONS.md#L11201)

## Premium & monetisation

- **Earnings dashboard (2026-10-24):** `/admin/earnings` shows Stripe, TCGplayer
  (Impact API), eBay Partner Network (Performance by Day report), AdSense
  (Management API) and Mediavine (entered by hand) for today / 7 / 30 / 90 days /
  all time, each and combined, at the site's reference FX rates. Each source is
  guarded alone and shows "Not connected" until its server-only keys are set; the
  ops monitor flags a connected source that fails. [2026-10-24](../DECISIONS.md#L19394)
  The Monday digest carries the money too (7/30 days by source, eBay by site,
  costs and profit), filled in by the site so no amount reaches a public log.
  [2026-10-26](../DECISIONS.md#L19640)
  Costs sit under it with a profit row: Anthropic API usage automatic (Admin
  API cost report); Vercel Pro, any Claude plan and ads are entries (once /
  monthly / yearly, stop-and-replace on a plan change; no billing API exists for
  them). Vercel and Anthropic are entered from their invoices month by month;
  only the US$200 of ads is pre-filled. [2026-10-25](../DECISIONS.md#L19446)
- **The Stores plan (2026-10-23, owner):** US$79.99/month (`STRIPE_STORE_PRICE_ID`,
  displayed amount `NEXT_PUBLIC_STORE_PLAN_AMOUNT`) for a retailer: the repricing
  report with "what buyers are searching for", a Verified mark with the store's own
  text on `/stores/<slug>`, and Premium for the buying account (via the existing
  `stampFromSubscription`). The owner links each paid plan to its tracked store at
  `/admin/store-partners`, which emails the report link; the report locks three days
  after the plan lapses. **Nothing a store pays for changes its place in any
  comparison** — never read the plan from a comparison or ranking. Checkout refuses a
  Stripe Price dearer than the page. Pilot partners keep free reports.
  [2026-10-23](../DECISIONS.md#L19079)
- **Store partner codes (2026-10-26, owner):** one list,
  `src/lib/store-partner-deals.ts`: a store's exclusive discount code (a chip beside
  its rows and on its store page, hidden 30 days after its last checkout test) and
  its affiliate app's commission parameter (added by `affiliateUrl`, so the row is a
  "Paid link"). The offer is `/stores/partners`. A label, never a position: rows stay
  sorted by item price, the price shown is before the code, and nothing that ranks
  reads the list. [2026-10-26](../DECISIONS.md#L19910)
- **Creator codes (2026-10-16, owner):** a creator applies at `/creators/apply`,
  the owner approves in `/admin/affiliates` (an `Affiliate` plus a Stripe
  promotion code on the shared 20%-off, forever coupon). Subscribers get 20% off
  through `/r/CODE`, `/premium?code=`, the code box on /premium (all set the
  `rc_aff` cookie checkout reads) or by typing it at Stripe. Checkout stamps
  `affiliateCode` on the session and subscription; the webhook records one
  referral per subscription and one 20% `AffiliateCommission` per paid invoice,
  after entitlement and never fatal. The intro coupon, when on, keeps the one
  discount slot. Paid out by hand ("Mark paid"). All four tables private.
  [2026-10-16](../DECISIONS.md#L17655)
- **Pro at $6.99, or $3.99/mo yearly, free tracker (owner, 2026-10-26,
  supersedes the price in the next bullet and the free limits below):** the
  paid plan is called Pro in every user-facing string (identifiers, `/premium`
  and tier keys unchanged), $6.99/mo or $47.88/yr (12 × $3.99); nobody is
  moved up in Stripe. No trial: `PREMIUM_TRIAL_DAYS` defaults to 0 (the 30-day
  trial below is superseded). `FREE_LIMITS_ON = false`: free watchlist and portfolio
  are unlimited and no copy quotes a limit; free price history is 90 days.
  `/premium` copies Collectr's page for non-members. A rate-the-site dialog
  asks after 3 pages and 45 s, always with "Not now"; the Pro page shows the
  average only from 10+ real ratings, never in JSON-LD.
  [2026-10-26](../DECISIONS.md#L19772)
- **One paid plan again (2026-10-23, supersedes the trial and tier bullets
  below):** Premium $9.99/mo or $79.99/yr with a free 30-day card-gated trial;
  existing $4.99/$39.99 subscribers are grandfathered by not migrating them.
  Plus is off sale (`PLUS_ON_SALE = false`) but its Price ids stay set so Plus
  members are still recognised and billed at their Plus price; while it is off
  sale they get everything in Premium (`effectiveTier` reads billed Plus as
  Premium, read-time only; billing still resolves tier from the Price).
  Stores plan $79.99/mo for retailers.
  [2026-10-23](../DECISIONS.md#L19127), [2026-10-23](../DECISIONS.md#L19306)
- **/premium is one plan table and one comparison (2026-10-25, replaces the
  10-23 proof page):** headline, then `PremiumPlanTable` (Annual, lit and
  "Best value", and Monthly, each with its own button; the trial said once, in
  the button's small print), one terms line, a collapsed creator-code box, then
  Free vs Premium. No hero button, proof, teaser, demo, example alert, sticky bar
  or FAQ (and so no FAQPage). Every number from `lib/site.ts`.
  `PREMIUM_COPY_VERSION` `one-table-2026-10-25`. [2026-10-25](../DECISIONS.md#L19587)
- **Free 14-day trial (2026-10-12; replaces the $1 first month below):**
  `PREMIUM_TRIAL_DAYS` 14 and `PREMIUM_TRIAL_FEE_CENTS` 0 by default, card
  required, prices unchanged. Leave price, trial and pitch alone until two
  14-day cohorts have matured (late November). `/admin/premium-offer` sends the
  "Subscribe now and get 14 days free" email to accounts that can still get a
  trial, and refuses while the trial is not free. `/premium/welcome` leads with
  watching a card until the account has one. [2026-10-12](../DECISIONS.md#L16934)
- **Superseded 2026-10-12, kept for its mechanics: the $1 first month, no intro (2026-09-30, owner: "Can we do $1 free trial for both
  pro and premium please? And the trial is for the first month?"):** a PAID trial on
  Stripe's own trial. A first-timer of either tier and either interval pays **$1 at
  checkout** for the first **30 days**, then the plan price (Plus $2.99/mo or
  $23.99/yr, Premium $4.99/mo or $39.99/yr) starts unless they cancel first; one per
  account and per card. New subscribers only: `trialOfferedTo` refuses anyone who
  has paid before (owner: "Lapsed payers should not be offered"); no refunds beyond the
  automatic one for a reused card (owner: "No refunds"). Checkout is the recurring line first plus an inline one-time
  fee line and `trial_period_days` (`lib/checkout-params.ts`, pure, tested); no new
  Stripe Price. `PREMIUM_TRIAL_DAYS` defaults to 30 (**`0` is the kill switch**, with a
  redeploy; a leftover value in Vercel overrides the default, so remove it) and
  `PREMIUM_TRIAL_FEE_CENTS` to 100 (`lib/trial-config.ts`; 0 = a free trial, and every
  copy helper then says "free"). **It is never called free or "$0 today" while the fee
  is above zero**: "First 30 days for $1, then $2.99/mo", "Start 30 days for $1". Shown
  only where the viewer would get it (signed out, or no `trialStartedAt`). The webhook
  recognises a trial from the SUBSCRIPTION (`trialing` / `trial_end`), never from
  `amount_total` or `payment_status` (a $1 trial is "paid", 100); `premiumUntil` runs to
  day 30, extend-only, so cancelling in the trial keeps access to day 30; a trial refused
  for a reused card refunds its $1. The reminder cron, Keep, the account card and the
  emails all read the subscription (its `trialFeeCents` metadata says what was paid) and
  never say "free" for a paid trial. The half-price intro is still off
  (`introOfferEnabled()` opt-in, `NEXT_PUBLIC_PREMIUM_INTRO_OFFER=1`) and the 3-day
  trial plus half-price months of 09-24 stay superseded. `trial-cancel-report` counts the
  cancel click, split free vs $1; `funnel-report`'s "canc" counts only ended
  subscriptions. Compare cohorts by `PREMIUM_COPY_VERSION` (`trial-2026-09-30` from
  this change, `nudges-2026-09-29` before it). Open for the owner: the refund policy for
  the $1 (none invented; /terms keeps only "non-refundable except where required by
  law"), and a lapsed payer with no `trialStartedAt` being offered it again.
  [2026-09-30](../DECISIONS.md#L15595), [2026-09-26](../DECISIONS.md#L14680),
  [2026-09-24](../DECISIONS.md#L12120), [2026-09-24](../DECISIONS.md#L12215),
  [2026-09-23](../DECISIONS.md#L10924), [2026-09-25](../DECISIONS.md#L12842)
- **Tiers (lineup of 2026-09-25, prices of 2026-09-26; a $1 first month from
  2026-09-30, above):** Plus, $2.99/mo or
  $23.99/yr, is
  **ad-free**, has the full Deal Finder (with "Only my cards") and Rising
  Cards lists, no watchlist or portfolio limit (so a whole set fits in the set
  tracker), and target-price alerts on up to `PLUS_TARGET_ALERT_LIMIT`
  (25) cards and sealed watches on up to `SEALED_WATCH_LIMIT_PLUS` (10)
  products, checked about every six hours (2026-09-29). Premium, $4.99/mo or
  $39.99/yr, adds unlimited targets and sealed watches, the deck price watch
  (up to `DECK_WATCH_LIMIT`, 10, saved lists), unlimited Best Basket
  store-by-store plans (for a pasted list, deck, watchlist, binder or a set's
  missing cards, and behind the portfolio's replacement cost) at the minimum
  condition the member sets (below Premium, free and Plus alike:
  `FREE_PLANS_PER_MONTH`, 3, plans a UTC month, counted server-side on reveal in
  `BasketPlanUsage`, [2026-10-22](../DECISIONS.md#L18884); Best Basket is
  the first Premium row on /premium), bulk pricing past a deck (/deck prices
  `FREE_BULK_LINES`, 60, card lines below Premium and `DECK_LINE_CAP`, 200, for
  Premium; `limit:bulk`, [2026-10-25](../DECISIONS.md#L19614)), and
  **Demand Finder**
  (`/tools/demand`, `isPremium(user, "premium")`: top 25 most searched and
  most viewed, 7 or 30 days). Below Premium, Plus included, Demand Finder
  shows only the free /movers strip's top 10 most searched this week
  (`FREE_DEMAND_ROWS`, `tests/demand-finder.test.ts`); it is described as "what
  people are searching for" and sits low on /premium, never as "what to buy
  before it spikes". **The persona line (2026-09-29): Plus tells you what to
  buy and when; Premium tells you which stores to buy it from and what it
  costs delivered.** The set tracker is FREE within the 50-card portfolio (the
  tick, the missing list and the cost to finish are never metered; card 51 is
  the Plus step), so /premium's hero is "Know what you're missing. Buy it for
  less." and its "What you get" list starts with what is free. Any signed-in
  account gets its own Best Basket total and the replacement-cost total;
  in Best Basket "binder" means replacement cost, never gaps (narrowed
  2026-09-29: what a binder is missing from a set is answered by the free set
  checklist, below). Value Finder, Rising Sealed,
  the Condition Calculator and the Bulk Pricer are gone, each 301'd to the
  free page carrying its useful part (`tests/lineup-removals.test.ts`).
  The owner chose the cut knowing the 09-08 read had $4.99 converting worse
  than $9.99. Existing subscribers are moved DOWN in Stripe from their next
  renewal, and only after the new Prices and legacy ids are live. A
  subscription with an `rc-intro-*` coupon moves at the first renewal after
  the coupon ends. The intro, if re-armed, is an amount-off coupon created by
  `ensureIntroCoupon`; its display and charge share `introAmountOffCents`, and
  it is quoted only where `introEligibleFor` says checkout will give it. A
  tier switch keeps exactly the discounted renewals left
  (`introRenewalsRemaining`).
  [2026-09-11](../DECISIONS.md#L4428), [2026-09-24](../DECISIONS.md#L12120),
  [2026-09-25](../DECISIONS.md#L12322), [2026-09-25](../DECISIONS.md#L12842),
  [2026-09-25](../DECISIONS.md#L13067), [2026-09-26](../DECISIONS.md#L14680),
  [2026-09-29 personas](../DECISIONS.md#L15447), [2026-09-30](../DECISIONS.md#L15595)
- **Gates:** `isPremium(user)` defaults to the Plus minimum; ads read
  `adFree` (any paid tier). Tier comes from the Stripe price (`tierFromPriceId`):
  an unknown price is Premium, so every retired Plus Price must be listed in
  `STRIPE_PLUS_LEGACY_PRICE_IDS` (`STRIPE_PREMIUM_LEGACY_PRICE_IDS` is only
  for reporting), and the maintenance steps that read tiers get those
  secrets. A `premiumTierFloor` only raises a paid tier, never grants one.
  While `PLUS_ON_SALE` is false, `effectiveTier` reads billed Plus as Premium,
  so every Plus-only limit on this page (25 targets, 10 sealed watches, 100
  searches, no deck watch…) currently applies to nobody
  ([2026-10-23](../DECISIONS.md#L19306)). Never reuse a Price across tiers: the new Premium amounts equal the old Plus
  ones, so they are new Prices. Ad-free is enforced client-side too: the eBay
  carousel and the app's AdMob banner check `adFree`, and the `rc_adfree`
  boot script pauses ad requests before the (ungated) loader. **Set
  `AD_STRATEGY=manual`, or verify anchor/vignette ads stay off on a Plus
  account, before AdSense Auto ads go on.** [2026-09-11](../DECISIONS.md#L4774),
  [2026-09-14](../DECISIONS.md#L6038), [2026-09-25](../DECISIONS.md#L12842)
- **Copy:** members see their real tier; marketing says "Premium", except
  that a Plus-level wall sells Plus (`<PremiumButton tier="plus">`) and every
  surface describing Plus says it is ad-free; never link a member to a wall. The pitch is "Never overpay for a Riftbound card", with
  no flipper or "ahead of the market" language. No fake scarcity,
  countdowns, invented numbers, savings totals or testimonials; the one
  saving figure allowed is Best Basket's, the viewer's own list's computed
  saving, from one whole unit of its currency (`lib/basket-saving.ts`). Rising
  Cards is a screen, not a prediction. The persona pass adds: no P&L or "worth"
  in the set view, "cost to finish" is always "the cheapest listing today,
  before postage", Radiance is "N revealed" and never a denominator, sealed is
  "about every six hours" and never "instant", and the binder's since-you-bought
  panel gives no "beating the market" verdict. No "lock in before the price goes
  up": since the 09-26 cut, the lock-in banner, dialog lines and FAQ render only while a real, higher price is announced
  (`NEXT_PUBLIC_PREMIUM_NEXT_PRICE_AMOUNT`, which defaults to today's price);
  the steady state says "cancel anytime". The terms still promise a
  subscriber's price never rises while they stay subscribed: existing
  subscribers may be moved onto a lower Price, never a higher one.
  [2026-09-11](../DECISIONS.md#L4642), [2026-09-14](../DECISIONS.md#L5971),
  [2026-09-10](../DECISIONS.md#L3990), [2026-09-22](../DECISIONS.md#L10328),
  [2026-09-25](../DECISIONS.md#L12842), [2026-09-26](../DECISIONS.md#L14292), [2026-09-26](../DECISIONS.md#L14680),
  [2026-09-28](../DECISIONS.md#L14549), [2026-09-29 personas](../DECISIONS.md#L15447)
- **Free limits (2026-09-28, owner: "charge for the features people use every
  week"):** a free account watches up to 10 distinct cards and keeps up to 50
  in its portfolio (`lib/free-limits.ts`, the one source for every route and
  every quoted number); any paid tier is unlimited; price comparison (card,
  set, champion and store pages) stays free with no limit. Search no longer
  does: see the search allowance below ([2026-10-09](../DECISIONS.md#L16846)). Nobody loses anything: only a NEW card is refused while
  at or over the limit, and existing watches, portfolio cards, copies, edits
  and removals keep working, lapsed subscribers included. Every create route
  enforces it (`402 code:"free_limit"`), the anonymous email-only door
  included (counted per canonical inbox, so a `+tag` alias of an address
  that already watches ten is at the limit too), and the import adds up to
  the allowance and reports the rest.
  [2026-09-28](../DECISIONS.md#L14549)
- **Free accounts get one alert (2026-10-23, owner: "One free alert is the
  strongest hook"):** a free signed-in account (a lapsed one included) sets
  ONE target price on a card and keeps ONE sealed watch
  (`FREE_TARGET_ALERT_LIMIT`, `FREE_SEALED_WATCH_LIMIT`; `targetAlertLimit(null)`
  and `sealedWatchLimit(null)` are 1). Past it the routes answer `402
  code:"free_alert_limit"` and the field / heart show the `gate:target-limit` /
  `gate:sealed-watch` PremiumButton; never before. The oldest one is live
  (`honouredTargetIds`; the sealed run's per-owner ceiling). A free card target
  is checked by the daily "all" run, not the paid runs; the sealed run reads
  every owner's watches, capped. Signed-out visitors sign in first.
  [2026-10-23](../DECISIONS.md#L19200)
- **Search is unlimited for everyone (2026-10-15, owner: "completely remove the search limit"):** the meter below is dormant; it runs only with `SEARCH_CAPS=on`, and no pricing surface mentions searches. [2026-10-15](../DECISIONS.md#L17561)
  **Was — search allowance (2026-10-09, owner: "make it 10 / 30 / 100 / unlimited", now 25 / 100 / 500;
  reverses "search is unmetered"):** signed out 10 searches a UTC day, a free
  account 30, Plus 100, Premium unlimited (`lib/search-quota.ts`). A search is a
  distinct query: typing "ak" → "akali" is one, paging and filters are free,
  the store tools send `scope=tool` and crawlers are never metered. The count is
  a signed httpOnly cookie (`rc_sq`), no database write; `/api/search` counts,
  `/browse` only refuses and counts through `/api/search/quota`. At the limit,
  `SearchLimitPanel` (`limit:search`) offers the next tier. The earlier 10 / 100 /
  unlimited ladder lost pages per visitor 3.86 → 2.75 and ~40% of `buy_click` in
  a day; **`SEARCH_CAPS=off` plus a redeploy is the kill switch**, so watch those
  two numbers. `PREMIUM_COPY_VERSION` `search-caps-2026-10-09`.
  `tests/search-limits.test.ts`. [2026-10-09](../DECISIONS.md#L16846)
  **Kept after its first week:** views per session fell 4.12 → 2.76 again, but
  `buy_click` per 100 sessions rose 35.2 → 50.8 (GA4). Measure with the
  `impact-report` task. Mobile vignette ads are off in AdSense (owner, 10-14).
  [2026-10-14](../DECISIONS.md#L17002)
  **Loosened 2026-10-15 (owner: "be more generous") to 25 signed out / 100 free /
  500 Plus / unlimited Premium**; the numbers above are the first week's.
  [2026-10-15](../DECISIONS.md#L17125)
- **Paid history, graded tracking, auction alerts (2026-10-09):** free sees a
  card's last 30 days (`FREE_HISTORY_DAYS`); Plus and Premium see the whole
  series and a CSV (`/history/full`, `/history.csv`, `private, no-store`). It is
  a convenience gate: the series stays public in `data/price-history/` and the
  v1 API is uncapped. Plus also gets graded history per grade (a public day file
  in `data/price-history/graded/` from every import, no new eBay calls) and
  graded watches (`GradedWatch`, the paid route's fourth pass, material new low,
  once a day). Premium gets auction alerts: one email per sweep when a watched
  card has an auction in their market ending within 24 h, each auction once
  (`AuctionAlertSent`), matched by TITLE with the eBay pass's identity rules
  (`/api/cron/auction-alerts` after `refresh-auctions.yml`). Both share the alert
  budget and pauses. `tests/premium-features.test.ts`. [2026-10-09](../DECISIONS.md#L16846)
- **Watches that run for you (2026-09-29, owner: "make premium more
  attractive", "marketed better and highly accessible to new users"):** the
  paid tiers watch prices after every import and email when something is
  worth acting on. **Sealed watches** (free: one, since 2026-10-23, above;
  Plus up to `SEALED_WATCH_LIMIT_PLUS`, 10; Premium unlimited, ceiling `SEALED_WATCH_HARD_CAP` 200;
  `lib/sealed-watch.ts`): a restock after ≥5h sold out at every fresh real
  store (the clock starts when the member starts watching), at or under RRP
  (`lib/msrp.ts`), the member's target, or a material drop — real stores only,
  never eBay and never TCGplayer's market-price row, a restock at most once
  per 6h and the rest once per 24h per watch. **Checked about every six
  hours** (`SEALED_CHECK_CADENCE`, never "instant" or "first in line"; "a
  Discord stock bot may be faster"): the 07:00 and 19:00 paid runs read
  `getSealedGroups` directly (busted first, `?fresh=1`, when the page purge was
  skipped), and the schedule-only `sealed-refresh.yml` (01:00 and 13:00 UTC,
  stores-only import, NO revalidate step and no CONTENT_TAG bust) calls
  `/api/cron/price-alerts/sealed`, which runs only the sealed pass on an
  uncached read (`lib/sealed-alert-read.ts`). Every sealed email states the
  listing's checked time in bold. **Deck price watch**
  (Premium, up to `DECK_WATCH_LIMIT`, 10; `lib/deck-watch.ts`): a saved list
  re-priced delivered with Best Basket's own resolver, listing read, optimiser
  and measured postage for the saved delivery; emails at the target (news per
  the 30-day watermark, 5% further) or on a ≥5%/≥one-unit drop, only when the
  plan covers every copy; "Watch this list" is offered only for a result
  priced without "skip copies I own". Both run in the paid cron after the
  sealed import, as separate passes that fail alone, under the shared
  `ALERT_DAILY_BUDGET` (`lib/alert-budget.ts` counts all three tables) and one
  `PAID_SEND_CAP` across the card, deck and sealed passes, at most
  `WATCH_EMAILS_PER_ADDRESS` (3) emails to one address per pass; lapsed owners
  keep rows, get nothing, and can still see, snooze and stop them; one-tap
  stop/snooze tokens carry a kind (`lib/alert-actions.ts`, v1 card tokens stay
  valid) and a watch email's List-Unsubscribe stops that watch. Manage on
  /watching ("Sealed", "Decks"). A "use client" file never imports a server
  module (`lib/deck-watch-pure.ts` is the client-safe half;
  `tests/client-imports.test.ts`). [2026-09-29](../DECISIONS.md#L15178),
  [2026-09-29 review](../DECISIONS.md#L15224),
  [2026-09-29 six-hourly sealed check](../DECISIONS.md#L15423)
- **Minimum condition (2026-09-29, Premium):** Best Basket, Buy this list and
  the deck price watch may be limited to NM only or LP or better
  (`lib/basket-condition.ts`; grades are `conditionRank`, unstated = NM). The
  filter runs INSIDE `loadStoreListings` before the per-(card, store)
  reduction (`minRank`, default `any`, so every other caller is unchanged), in
  memory, on the same single read. A card with nothing at the floor is "not
  covered", never filled with a played copy. Premium only on the server; a new
  session and a new deck watch start on LP or better, the last choice is
  remembered (`User.basketPrefs`), and `DeckWatch.minCondition` null = any, so
  old watches keep their baselines; changing a floor re-baselines. Every free
  total says "Includes N played copies" when it does (an honesty line, not an
  entitlement). "Any printing" waits until after Radiance.
  [2026-09-29](../DECISIONS.md#L15513)
- **Set tracker (2026-09-29, free within the 50-card portfolio; Plus's "no
  limit" lets a whole set fit):** what a binder is missing from a set and the
  cheapest listing for each card, on `/portfolio/sets` and
  `/portfolio/sets/[set]` (noindex, per-request, no `searchParams`, no
  `notFound()`: a `loading.tsx` sits above `/portfolio`). The rules are pure in
  `lib/set-scope.ts`: "Base set" is the numbered run (no promo, alt-art,
  overnumbered, Signature or Crystal Rose), "Every printing we track" adds
  those but never promos, tokens are in neither, one copy of any finish or
  condition is owned, and counts say "printings we track", never a typed-in
  total. The price is `lib/set-checklist.ts`'s own read of real-store
  `RetailerPrice` rows (in stock, market, no `ebay*`, no fallback or derived
  rows), NEVER `Card.lowestPriceCents*`, which is stores + eBay; an eBay-only
  card is counted in neither total; the footer is "Cheapest listing per card,
  before postage. Best Basket prices delivery." Its cache key is
  `['set-checklist', code, country]`, 3600s, `CONTENT_TAG`, with no nested
  loader; owned copies are one user-scoped groupBy
  (`GET /api/collection/owned?set=CODE`, no-store). `/sets/[set]` reads neither
  cookies nor the user: a released set's ticks are a client overlay portalled
  into the tiles and price guide rows, so the page's HTML is unchanged and its
  memo is shared. The tick is `POST /api/collection`, so card 51 opens the
  `limit:portfolio` panel inline ("Nobody loses cards they already have").
  Radiance shows "N cards revealed so far" with no denominator, percentage,
  bar or cost until it releases (its total is unsettled). The printing-aware
  CSV import (`lib/collection-csv.ts`: set, collector number, finish,
  condition, quantity; skipped lines listed with reasons) is free and stays
  free. No P&L, "worth", prediction or urgency wording in the set view. Phase
  2, after Radiance: opt-in "looking for these" on `/c/[token]`.
  [2026-09-29](../DECISIONS.md#L15366)
- **Finish this set (2026-09-29, Premium):** Best Basket's fourth source,
  `source: "set"` ("Finish a set", and "Plan the purchase" under the missing
  list on `/portfolio/sets/[set]`): the cards the account is MISSING from one
  released set, one copy each, from `getSetChecklist` (called directly, never
  wrapped) minus one user-scoped `ownedBySet` read (NOT `loadOwnedQty`, which
  reads 400 rows and would call an owned card missing); pure rule in
  `lib/set-gap.ts`. Skip-owned is locked on. **One plan is at most
  `SET_GAP_CHUNK` (the 200-line cap) cards**, cheapest first with stable
  ties; a bigger gap is a chunk with "Your 200 cheapest missing cards. N more not
  included." and a "Plan the next 200" step (a cursor, `after`, not a rank),
  never silently partial.
  A card no real store has in stock is listed apart ("not stocked in {place}",
  named for Premium, counted for everyone), never dropped; a card dearer than
  the member's own ceiling is counted; non-foil listings; the minimum condition
  applies (ranking and the ceiling use the price the plan pays: the floor, at
  the stores that post to the buyer; a card only a postage-less store or only
  a played copy has is counted apart, never chunked). The
  tier is the existing gate: any account keeps `basketPreview` and Best
  Basket's own saving on its own list plus `setGap` COUNTS (no store, line, link
  or card name; `setGapFields`), store names, lines and URLs are Premium's, no
  other saving figure anywhere. Radiance answers 400 "N revealed cards have no
  store listing yet" until it releases (no denominator). Table cell "Same 3 plans" /
  "Unlimited" since 2026-10-22 (the monthly free plans are shared with Best
  Basket).
  [2026-09-29](../DECISIONS.md#L15397)
- **Every paid feature is discoverable where it lives, inline, never a
  popup:** `DiscoveryTip` (`tip:*` surfaces) is one dismissable sentence for
  signed-in non-members only, on /sealed, a non-Premium Best Basket result and
  /watching's "What you can watch" block (the sealed quick view's watch button
  sells Plus itself, no second line in an overlay); the deck
  watch form and the sealed heart are the ordinary `PremiumButton` gates
  (`gate:deck-watch`, `gate:sealed-watch`) below the tier. /premium (2026-10-17's "70% simpler", revised
  2026-10-22): H1, a market-specific subline (US leads with alerts, elsewhere
  with Best Basket), the Annual / Monthly toggle (annual default, per-month
  equivalents, "Save 33%"), two plan cards (price, tagline, four bullets from
  `lib/premium-plan-copy.ts`, trial line, button; Premium badged "Most
  features"), a "Not ready to add a card?" line (feedback week, referral days),
  then `PremiumTicks`: sixteen rows whose cells are `TIER_COMPARISON`'s real
  limits, not ticks (`tests/premium-ticks.test.ts`), header prices following the
  toggle and the picked plan's column lit; then the creator code and the FAQ. No
  footer ad pair on /premium (`SALES_ROUTES`); `/pricing` 301s here.
  [2026-10-22](../DECISIONS.md#L18914) No "What you get",
  no missing-grid, no proof line, no second copy of the trial terms, no persona
  sections, CTA band or sticky bar (`tests/premium-plans-first.test.ts`).
  Superseded for Premium-only by the one-table page (2026-10-25, above); this
  layout renders only while Plus is on sale. [2026-10-17](../DECISIONS.md#L18460), [2026-09-29 plans first](../DECISIONS.md#L15538)
- **Upgrade intent is measured with two Vercel events, no click table:**
  `upgrade_dialog_open` (dialog opens; inline gate/limit prompts once per surface
  per tab) and `upgrade_cta_click` (click through to checkout), with feature,
  tier_required, market, signed_in (+ plan, billing_period); never personal data.
  [2026-10-22](../DECISIONS.md#L18945)
- **Upgrade prompts live where a limit is hit, and in the header (header since 10-15):**
  the at-the-limit panel (`limit:watchlist`, `limit:portfolio`), Best
  Basket's preview (`limit:basket`, leading with the list's own saving) and
  the tool walls — plus the header's Pricing callout (`PricingNudge`, since
  10-25; the corner `PremiumSlideIn` is gone), and a tick on a set page (the same
  `limit:portfolio` panel, reworded for a set). The header carries the shiny
  `GetPremiumLink` since 2026-10-15 (see "Gold marks Premium"); rail and account
  menu stay plain "Pricing" links. [2026-10-15](../DECISIONS.md#L17561) [2026-09-28](../DECISIONS.md#L14549),
  [2026-09-29](../DECISIONS.md#L15178)
- **Checkout:** every buy button goes to `/premium/start` (sign-in first when
  signed out; OAuth only). `/premium` defaults to ANNUAL (per-month equivalent
  headlined, since 2026-10-22, [2026-10-22](../DECISIONS.md#L18914); the dialog stays
  monthly) and never headlines `$0`. [2026-09-13](../DECISIONS.md#L5890),
  [2026-09-14](../DECISIONS.md#L6038)
  Stripe Checkout asks for Adaptive Pricing (the buyer pays in their own
  currency) and retries without it if Stripe refuses; the pay-button note stays
  in US dollars and says so. `payment-failures-report` (maintenance) shows why
  Stripe refused a charge. [2026-10-12](../DECISIONS.md#L16892)
- **Growth levers (2026-10-16):** Radiance posts and set pages
  lead with "Follow Radiance's chase cards" (one OAuth click = an account
  already watching 8 cards, `radiance_watch`); the pull tracker
  (`/tools/pull-tracker/<set>`, `pull_tracker`) shares results by a link that
  carries the pulls, no database row. The owner's outreach list is
  `docs/GROWTH-PLAYBOOK-2026-10.md`. [2026-10-16](../DECISIONS.md#L18158)
- **Radiance leads (2026-10-17):** `featuredSet()` (upcoming set from its
  `newFrom`, else newest released) drives eBay Picks and the homepage strip's
  first tab, "<set> chase cards" (`getSetChaseTiles`, art only); "Most popular"
  is second. `singlesLive()` (released, or past `newFrom`) gates every card-price
  surface on `/sets/<slug>` and its gallery; sealed copy keeps
  `isPreorderSetCode()`. Signatures (`*`) are in no official feed: add them to
  `prisma/manual-cards.json` with their own `externalId`.
  [2026-10-17](../DECISIONS.md#L18273)
- **Legacy is coming soon (2026-10-25):** LGC is `comingSoon` with
  `releasedOn` 2027-01-29 and Riot's 239 cards (93 Showcase) as
  `announcedCards`. It has no `totalCards`, `newFrom` or `hubReady`, so
  /sets/legacy stays noindex while it has no cards. In a store title "legacy"
  names the set only beside "Riftbound"/"League of Legends", or as the bare code
  LGC. `/legacy-preorders` holds its pre-orders. Release alerts take the
  pre-order link from the calendar row and run for RAD and LGC.
  [2026-10-25](../DECISIONS.md#L19536)
- **Radiance is released (2026-10-22):** RAD is no longer `comingSoon` (Legacy
  is, since 10-25); RAD is `recentlyReleased`. Every release check uses `streetDateStartMs()` (midnight
  AEDT on the street date), never midnight UTC. `/radiance-preorders` stays live
  in its released state: every Radiance product's in-stock store offers,
  cheapest first, same URL, no redirect ([2026-10-24](../DECISIONS.md#L19340)). All 219 official printings plus 16
  Signatures are in the catalogue; all nine Legends are named everywhere
  (`RADIANCE_LEGENDS_CONFIRMED`). [2026-10-22](../DECISIONS.md#L18959)
- **AdSense off; Journey on articles only (owner, 2026-10-27):**
  AdSense was switched off, back on "for now", and off again for good the
  next day because the ads were too annoying:
  `ADSENSE_SERVING` (`lib/adsense.ts`) is the one switch for the loader and
  every unit. Mediavine's script loads only on `/blog/[slug]` and
  `/guides/[slug]`, never for an ad-free member, and links off an article do a
  full page load so it never reaches card, set, sealed or price pages.
  Review 2026-11-23. [2026-10-26](../DECISIONS.md#L19693), [2026-10-26](../DECISIONS.md#L20023), [2026-10-27](../DECISIONS.md#L20039)
- **Paid ads: a measured test, not a ban (2026-10-16):** AdSense pays per page,
  so a paid click is worth its page views plus any sign-up. The test (small
  fixed budget, free high-RPM pages only, `utm_source=*_ads` → entry bucket
  `ads`, stop after two weeks if a visit costs more than it earns) is in the
  growth playbook. [2026-10-16](../DECISIONS.md#L18206)
- **The Akali slider is gone (2026-10-25):** replaced by `PricingNudge`, a
  "Try our Premium features" callout with an arrow under the header's Pricing
  link, on the slider's own rules (3 s, once a session, 3-day snooze, its page
  gate, never in the sign-up session), gone after 9 s. [2026-10-25](../DECISIONS.md#L19587)
  Before it, (2026-10-17): one corner Premium card for everyone not
  Premium, signed in or out, 3 s after the page settles, once a session, a
  dismissal snoozes it 3 days. Akali art, five `PremiumTicks` rows Free vs
  Premium (since 10-17's "70% simpler": 320×384 on a phone, from 352×692; no
  scrolling table, no "Not now"), and signed out Google/Discord side by side
  straight into `/premium/start` (source `premium_slider`).
  It replaced the signed-out sign-up card and the 3rd-page/48-hour gate; off
  sign-in, checkout, the arcade, widgets, admin and Pokémon.
  [2026-10-17](../DECISIONS.md#L18317), [2026-10-17 smaller](../DECISIONS.md#L18460)
- **Sign-up prompts in the page:** the signed-out corner card (`SignupSlideIn`,
  10-15 and 10-16) was replaced on 10-17 by the Akali slider above
  [2026-10-15](../DECISIONS.md#L17561), [2026-10-16](../DECISIONS.md#L17957).
  `PREMIUM_COPY_VERSION` was `akali-slider-2026-10-17` (then `premium-simple-2026-10-17`, now `premium-limits-2026-10-22`, the /premium rebuild). `InlineSignupPrompt` is page content, one per page, below
  the first screen, signed-out only after `/api/me` answers: `/browse` (after
  the 12th tile), a priced `/deck`, `/decks/[slug]`, `/movers`,
  `/champions/[slug]`. The homepage keeps `AccountStrip` and a released set page
  its tracker line instead. Free account only: no price, gold, Premium, timer,
  modal or dismiss; numbers from `lib/free-limits.ts`; `/login?next=…&src=inline_*`;
  `signup_inline_view` (GA4 only) and `signup_inline_click` by `surface`
  (`tests/signup-inline.test.ts`). `PREMIUM_COPY_VERSION` `signup-inline-2026-09-30`
  (since 10-09 `search-caps-2026-10-09`, the search allowance above).
  [2026-09-30](../DECISIONS.md#L15871)
- **Phones (below 1024px):** no ad intents (`google-anno-skip`), no vignette
  on a tapped link (`data-google-vignette="false"` set in the capture phase
  before the loader), and no Google ads on Best Basket, `/deck` and `/sets/*`
  (`MOBILE_AD_FREE_ROUTES`). Everything else keeps its Auto ads; desktop is
  unchanged. Anchor ads and the ad load are console settings.
  [2026-10-17](../DECISIONS.md#L18428)
- **Corner nudges:** only `AnnualSwitchNudge` since 10-25 (the Premium card
  became the header callout, above). The Premium card was the Akali slider 10-17 to 10-25 (above;
  the owner chose a 3 s, every-visitor card knowing an instant card once
  measured 78% dismissed and that Google treats a pop-up over a phone's first
  page as intrusive). `AnnualSwitchNudge` keeps the 09-29 rules:
  `NUDGE_DELAY_MS` = 12 s, 2 dismissals per device, 7/14-day snoozes. Both
  cancel on a dialog, drawer, focused text field or navigation and never appear
  within 10 s of a dialog closing (`lib/nudge-gate.ts`, `lib/nudge-runtime.ts`),
  and the slider never shows in the sign-up session. [2026-09-16](../DECISIONS.md#L7031),
  [2026-09-14](../DECISIONS.md#L6134), [2026-09-24](../DECISIONS.md#L12089),
  [2026-09-27](../DECISIONS.md#L14536), [2026-09-28](../DECISIONS.md#L14549),
  [2026-09-29](../DECISIONS.md#L15178), [2026-09-29](../DECISIONS.md#L15281),
  [2026-09-29](../DECISIONS.md#L15555), [2026-09-30](../DECISIONS.md#L15871), [2026-10-01](../DECISIONS.md#L16105)
- **Signed-out visitors get nothing from Deal Finder's two Underpriced lists
  or Rising Cards**; a free account gets the top 3 of each, a paid tier the full
  list. Deal Finder's Cheapest on eBay view is free for everyone.
  [2026-09-22](../DECISIONS.md#L10538), [2026-09-25](../DECISIONS.md#L12842),
  [2026-09-30](../DECISIONS.md#L16000)
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
- **After sign-in:** back to the page it started on (`?next=` on every
  contextual `/login` link; a pending watch completes). With no destination:
  `/dashboard` (`POST_SIGN_IN_FALLBACK`), never `/profile`. A new account gets
  "Welcome" and the setup checklist first there, or a one-time "Your free
  account is ready — Get set up →" toast on the page it returned to, and no
  Premium callout for the rest of that session (`lib/signup-session.ts`).
  [2026-09-29](../DECISIONS.md#L15313)
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
  eBay query goes through `riftboundEbayQuery` ("Riftbound" exactly once);
  the Pokémon section's go through `pokemonEbayQuery` ("Pokemon" once).
  By-surface numbers compare only from 2026-09-26 on (the eBay-only surfaces
  from 09-27). [2026-09-26](../DECISIONS.md#L13640),
  [2026-09-26](../DECISIONS.md#L13751)
- **eBay beside every comparison, never inside the ranking** (owner, 09-26:
  push eBay clicks even where stores are cheaper) — **with ONE exception since
  10-15 (owner):** the pre-order table (`PreorderPriceTable`, on
  `/radiance-preorders` and `/sets/radiance`) pins every OPEN eBay row first in
  each product (`orderPreorderRows`; stale or sold-out eBay rows are not
  pinned), each tagged "Shown first" beside "Paid link", the table's top line
  saying so. The headline stays the cheapest open offer from anyone and the
  "+N%" stays on the eBay row. "eBay may have a lower price" is on the
  per-product Search eBay line only — never on a listing, which is already the
  cheapest valid one the importer found. The headline reads the UNPINNED
  ranking, so a price tie never goes to eBay. `/editorial-policy`, `/about`,
  `/privacy`, `/terms`, `/methodology`, the homepage and the region homes' FAQ
  name the exception; nothing describes that table as
  "cheapest first". [2026-10-15](../DECISIONS.md#L17284). Elsewhere
  no comparison is re-ranked
  and no true figure (the "+N%" on a dearer eBay row) is hidden; eBay rows keep
  their price position but wear eBay blue (`.btn-ebay`, or `.btn-ebay-ghost` in
  a list of ghost buttons). Everything else is a labelled "Search …" beside the
  list (`EbaySearchPanel`, Paid link tag + EPN disclosure) that claims no price,
  stock or listing; cross-sells (`promo`) hide for ad-free members and carry
  `data-ad-placement`. `/editorial-policy`, `/about` and `/privacy` disclose
  this. Never claim eBay guarantees ("money back", "buyer protection" fail a
  test). The free "Cheapest on eBay" view (Deal Finder's `?view=ebay` since 09-30, the whole
  ranking, paged) lists only cards where eBay
  beats every source the card page ranks (EU: CardTrader too; US: TCGplayer's
  listing too; Canada never). Its free status beside the trial measurement is
  the owner's call. Hot 40 snapshots mark picks "Cheapest on eBay" by the same
  rule (`getCheapestOnEbayFor`), in each pick's basis market, frozen at mint,
  with a Paid link tag and the disclosure above the table
  [2026-09-28](../DECISIONS.md#L15039). The region homes' price table has an eBay button on every row,
  last, after our own figures: the tracked listing's item price in the page's
  own market (filled only when it is the row's cheapest), a "Search" of the
  visitor's own eBay otherwise; stacked rows below 768px so it is never cut
  off. [2026-09-26](../DECISIONS.md#L13751),
  [2026-09-26](../DECISIONS.md#L14190), [2026-09-30](../DECISIONS.md#L16000)
- **The phone Cheapest block names the paid marketplace:** when a store that
  pays nothing is cheapest, `CardTopBuy` adds "or US$X on TCGplayer/eBay (+N%)",
  the cheapest paid row within 20%, with the Paid link tag; the Buy button and
  the comparison's order are unchanged (`lib/paid-alternative.ts`, surface
  `card_top_alt`). [2026-10-27](../DECISIONS.md#L20049)

## Navigation & chrome

- **Desktop rail:** 17rem from 1024px, always expanded (the collapse mode was
  deleted on 09-21). Group headers are disclosures; Prices and Guides & News
  (the second group) open on a first visit, because a collapsed group renders
  no links and the guides must be in every page's HTML for AdSense's
  crawlers. The rail's search filters FEATURES; the header's searches
  CARDS. [2026-09-21](../DECISIONS.md#L9958),
  [2026-09-21](../DECISIONS.md#L10095), [2026-09-28](../DECISIONS.md#L15131)
- **Header:** "Database" (→ `/browse`) shows at every width. Card search has
  its own row until xl, then sits inline. The theme toggle is in the header
  from lg, in the menu below that. "Tools" (→ `/tools`) joins Blog from xl
  only (owner's brief, 09-26; the lg row has ~5px of slack).
  [2026-09-21](../DECISIONS.md#L9368),
  [2026-09-21](../DECISIONS.md#L10095), [2026-09-23](../DECISIONS.md#L11201),
  [2026-09-26](../DECISIONS.md#L14680)
- **Footer:** the always-visible row is Home, Blog, Guides, Tools, About us,
  Editorial policy, Methodology, Who writes this, Contact & feedback, Privacy
  policy, Terms of service (the site map stays collapsed on `/`). Privacy and
  Terms are also in the rail/menu Help group (`hideInFooter`). `FooterAds`
  renders no banner pair on /about, /authors(/*), /contact, /editorial-policy,
  /methodology, /privacy, /support and /terms, nor on `/pokemon` (another game:
  `OFF_TOPIC_ROUTES`). The arcade (/games/*, /riftle) is ad-free for everyone:
  no footer pair, no in-page pair, no AdSlot (`AD_FREE_GAME_ROUTES`), and
  Auto ads' requests paused there by the boot script and on every client
  navigation (`syncAdPause`, [2026-10-16](../DECISIONS.md#L17845)).
  [2026-09-26](../DECISIONS.md#L14680), [2026-10-01](../DECISIONS.md#L16105), [2026-10-02](../DECISIONS.md#L16478)
- **Phones get fewer Google ads (2026-10-16, owner: "reduce the impact of ads
  on a mobile phone"):** below 1024px, no ad intents on any page
  (`google-anno-skip` on `<body>`, `MOBILE_AD_INTENTS_SCRIPT`: no tap-to-open
  ad words, no bottom intent bar), and Auto ads paused on Best Basket and the
  deck builder (`MOBILE_AD_FREE_ROUTES`, the arcade's mechanism). The
  homepages keep their Auto ads (owner, same day: "bring back the ads on the
  home page", [2026-10-16](../DECISIONS.md#L17983)). Desktop and the site's own
  affiliate units are unchanged. A Google slot that will not fill never leaves a
  blank hole: `ins.adsbygoogle[data-ad-status="unfilled"]` (Google's documented
  rule) and any not-filled slot under `data-ads-paused` are `display: none`; a
  slot still waiting to fill, or filled, is never hidden
  ([2026-10-16](../DECISIONS.md#L18131)). Real anchor ads and the in-page ad cap are
  AdSense console settings (anchor "Top only" or off keeps a card page's Buy
  bar clear). [2026-10-16](../DECISIONS.md#L17916)
- **RiftCompare Coins (`/coins`) are free and Premium-only:** tasks earn pulls,
  a server-side roll reveals one of twelve coins (odds and pity printed on the
  page), and nothing about them is ever sold. Every reward is idempotent on
  `CoinTask`'s unique key. [2026-10-16](../DECISIONS.md#L17866)
- **The arcade's line-up is chosen by data:** `games-report.yml` (dispatch-only)
  gives each game's search clicks and players; the two weakest (Card Rain,
  Pairs) were replaced by Seraphine's Piano, a Radiance rhythm game timed on
  the Web Audio clock and drawn on one rAF canvas. Retired game routes 301 to
  it. [2026-10-16](../DECISIONS.md#L17753)
- **Sister sites:** the footer links OP Compare, DexCompare and MTG Compare
  (`SISTER_SITES`, `lib/sister-sites.ts`), and the cross-game guides and the
  where-to-buy / price-comparison articles end with a sister-site block
  (`sisterSitesFor`; at most a third of articles). Plain followed links
  (`rel="noopener"`); a deep link is added only once it is live there. The
  Pokémon section's DexCompare data links are the exception: nofollow, on
  every Pokémon product page ([2026-10-15](../DECISIONS.md#L17162)).
  [2026-10-14](../DECISIONS.md#L17018)
- **1024–1279 is its own band** (~704px of content): the filter sidebar
  waits for xl, card art is 160px (320 from xl), and stickies use
  `lg:top-36 xl:top-20`. [2026-09-23](../DECISIONS.md#L11201)
- **The filter panels open with a search box** (`FilterSearch`, on /browse,
  set pages, /sealed and /pokemon/sealed; not /price-guide, whose toolbar
  searches). It writes the page's own `q` with every filter kept, on Enter or
  its button only. On /browse that is the same metered search as the header's.
  `q` is the search, not a facet: no chip, no count, and "Clear" keeps it and
  the sort (`clearedFilters`). [2026-10-19](../DECISIONS.md#L18619)
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
- **Gold marks Premium**, so a non-Premium action never wears it. The HEADER
  sells it again since 2026-10-15 (owner: "get premium … shiny"): `GetPremiumLink`,
  `.premium-cta`: glowing, shimmering gold TEXT and nothing else: no fill, no
  outline, no box glow (owner, same day: "I only want the font to be glowing";
  [2026-10-15](../DECISIONS.md#L17636)); brighter on hover, still under reduced motion. Its label is "Pricing" at every width since 2026-10-24
  (plain gold text for a member; the homepage hero's button keeps "Get Premium"). [2026-10-15](../DECISIONS.md#L17561), [2026-10-24](../DECISIONS.md#L19322)
  The rail and account menu keep a plain "Pricing" link. No menu spotlight. Signed-out visitors see "Log in" and a primary
  "Sign up free" at every width. The market switcher (flag only below sm) is
  in the header from 360px, and in the menu's top bar below that; on phones
  its panel opens full width under the header. [2026-09-24](../DECISIONS.md#L11756),
  [2026-09-30](../DECISIONS.md#L15905)
  [2026-09-16](../DECISIONS.md#L7031), [2026-09-18](../DECISIONS.md#L8417),
  [2026-09-28](../DECISIONS.md#L14549)
- **Homepage order (all six homes, owner 10-06):** hero, then the editorial
  band (`EditorialHub`: Start here, Latest news, Market updates; two rows per
  column on phones), eBay Picks (the newest released set's chase cards),
  Today's Top Deals (Biggest savings, Price drops, Rising cards; no tier chips,
  no Cheapest sealed column), the price-guide link, the one-line Pokémon promo
  while that section is on (`PokemonHomePromo`, all six homes), the popular
  carousel (its "Most popular" tab back, owner's call; it carries the ItemList
  on `/`), Riftle/pack-sim, How it works. No price table on any home (`/` since 09-30, the
  region homes since 10-02). "Cheapest on eBay" is a Deal Finder view since
  09-30. No Recently viewed on any homepage (owner, 09-28); it stays in the
  search box and on card pages.
  [2026-09-17](../DECISIONS.md#L7959), [2026-09-21](../DECISIONS.md#L9500),
  [2026-09-26](../DECISIONS.md#L13751), [2026-09-26](../DECISIONS.md#L14190),
  [2026-09-26](../DECISIONS.md#L14680), [2026-09-28](../DECISIONS.md#L15131),
  [2026-09-30](../DECISIONS.md#L15971), [2026-10-01](../DECISIONS.md#L16105),
  [2026-10-02](../DECISIONS.md#L16505), [2026-10-06](../DECISIONS.md#L16699)
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
  each has a "Riftbound card prices today" table right after the editorial
  band under the hero ([2026-09-28](../DECISIONS.md#L15131)). Their
  DESCRIPTIONS lead with "Compare Riftbound card prices", and the share
  previews, JSON-LD (`WebApplication` at `/#app`) and `/llms.txt` say
  "Riftbound price comparison engine". Shipping is never called "live":
  comparison pages say "cheapest first, postage shown where known", and only
  Best Basket claims shipping "measured at each store's checkout". `/browse`
  owns "riftbound card list"; `/price-guide` owns the UNSCOPED "riftbound price
  guide / price list" (set-scoped ones stay on `/sets/<slug>`) and never leads
  with "Riftbound Card Prices" ([2026-10-02](../DECISIONS.md#L16383)); the
  Radiance spoiler tracker is the only title
  with "radiance" + "spoiler". No store count in any OTHER page title
  (Singapore's "11 Stores" excepted). Bare hreflang `en` is the US page; the
  EU pages carry one en-XX per EU country served.
  [2026-09-24](../DECISIONS.md#L11756), [2026-09-27](../DECISIONS.md#L14908)
  [2026-09-17](../DECISIONS.md#L7894), [2026-09-21](../DECISIONS.md#L9560),
  [2026-09-21](../DECISIONS.md#L9222), [2026-09-22](../DECISIONS.md#L10403)
- **Thin keyword pages are noindexed:** a `/keywords/<slug>` page listing fewer
  than `KEYWORD_THIN_THRESHOLD` (5) cards renders `noindex, follow` and is left
  out of `sitemaps/keywords.xml`; its guide is the indexed page. Facets use
  `FACET_THIN_THRESHOLD`, champions `CHAMPION_THIN_THRESHOLD`.
  [2026-10-23](../DECISIONS.md#L19025)
- **Card pages are always indexable** (09-17 reversed Phase 7a); only
  `getCanonicalTwin` duplicates are noindexed. Card titles aim for 60
  characters, but uniqueness beats length.
  [2026-09-17](../DECISIONS.md#L7393), [2026-09-17](../DECISIONS.md#L7801)
- **Set-agnostic code:** nothing names the current set; a new set is a data
  row. [2026-08-27](../DECISIONS.md#L3501), [2026-09-21](../DECISIONS.md#L9560)
- **"New" is a badge, not a release (2026-10-12):** `SetInfo.newFrom` plus
  `showsAsNew()` shows an unreleased set as new (homepage tile, sets index, share
  image) once its list is out; Radiance from 12 Oct. Everything behavioural
  (pre-orders, release alerts, countdown, `newestReleasedSet`, eBay priority)
  still reads `comingSoon` and `releasedOn` and changes on the street date. A
  preview set's count past the announced total reads "N Cards So Far", never
  "N of 180" and never "All". [2026-10-12](../DECISIONS.md#L16908)
- **Share images:** the site-wide preview is a composite of real screenshots of
  the whole site (`src/app/opengraph-image.jpg`), not the price guide; `/price-guide`
  keeps its own. Screenshots come from `.github/workflows/og-shots.yml`, because
  the design sandbox cannot load https pages. Every share image is a fixed file,
  prerendered, or CDN-cached for at least a day (owner, 2026-10-14); a data-backed
  image route is a function on Vercel, so its response header is its cache, not
  `revalidate`. [2026-10-07](../DECISIONS.md#L16760),
  [2026-10-14](../DECISIONS.md#L17035)
- **Ultimate Rare is an explicit list:** `ULTIMATE_PRINTS` in `lib/constants.ts`
  (Unleashed 238, Radiance 184, Packed Amphitheater), because an Ultimate
  print's number is an ordinary over-number. Its stored rarity stays Showcase.
  A set's own reported pull rate goes in `ULTIMATE_PER_PACK_BY_SET`, not in the
  global Signature rate. [2026-10-07](../DECISIONS.md#L16743)
- **Accuracy:** never invent TCG facts, numbers or testimonials, and never
  predict prices. Quote leaks only from photographed cards; half-known cards
  stay out of `manual-cards.json`. [2026-09-18](../DECISIONS.md#L8476),
  [2026-09-22](../DECISIONS.md#L10683)
- **What the site says about itself is true** (`tests/site-claims.test.ts`,
  every page, component and published article): comparisons are "cheapest
  first by item price, with the delivered total shown where the store
  publishes its postage" — never "ranked by delivered cost", "shipping
  included" or "no hidden fees"; six markets, never five; two imports a day,
  never "real-time"; listings, never sold/completed sales. Only Best Basket
  prices whole orders with measured postage. Store counts come from
  `RETAILER_LIST`, never typed. A correction bumps the article's `updated`.
  [2026-09-26](../DECISIONS.md#L14680)
- **Authorship is the owner's statement:** the site is built and run by one
  person, Bill (Person author `/authors/bill`, the Organization's founder).
  Articles are "drafted with AI assistance, then edited and fact-checked by
  Bill" with figures from our own database (`ARTICLE_PROCESS`,
  lib/content/authors.ts). Add nothing about him he has not confirmed; every
  byline must resolve in the registry. [2026-09-26](../DECISIONS.md#L14680)
- **Blog ↔ tools:** `lib/content/tool-guides.ts` maps each tool/data route to
  at most three guides, read both ways — `RelatedGuides` after the page's data
  and before any affiliate block (outside paywalls; /movers and the signed-out
  Deal Finder keep their pinned eBay CTAs first), and an article's "Related tools" row. Data pages carry a
  visible, page-specific intro under the H1 (`HubIntro`, `[label](/path)`
  links); /deck and set pages keep theirs under the tool/grid. The 09-26
  "Mobile first" entry covers the homepage, card page, thumbnails and
  /browse's sort only. Every published article links a tool (ratchet test).
  [2026-09-26](../DECISIONS.md#L14680)
- **A set in preview:** its `/sets/<slug>` and `/sets/<slug>/gallery` pages
  count what is shown ("N of 180 So Far" / "(N So Far)") and date the prices
  while `isPreorderSetCode()` holds, and return to the released-set titles on
  release day by themselves. The gallery owns "<set> card gallery", never
  "spoiler", "revealed" or "card list". A comingSoon + hubReady set's gallery
  is in the nav (derived from `SETS`), on `/gallery` as "Upcoming" (kept out
  of the hub's all-sets count), and is the homepage set tile's link. [2026-09-30](../DECISIONS.md#L15834)
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
- **RiftboundStocks per-page links:** card, champion and set pages link to
  the same page on RiftboundStocks.com through the map it publishes
  (`lib/riftboundstocks.ts`); no link when there is no match. Copy describes
  the other page and makes no appreciation claim. [2026-09-28](../DECISIONS.md#L15160)

- **Social posts are made from the committed price data and posted by the
  owner (2026-10-26):** `social/` films a vertical video, an Instagram carousel
  and captions per pack; `social-packs.yml` publishes Mon/Wed/Fri packs to the
  `social-packs` branch. Same price basis and wording rules as the site; Claude
  never posts. [2026-10-26](../DECISIONS.md#L19772)

## Prices & data

- **Only English prints are priced.** `FOREIGN_LANG` (`lib/scrape-http.ts`) is
  the one non-English list every source reads (singles, store sealed, eBay,
  Cardmarket, TCGplayer): CJK in any script or word, and French (`french`,
  `FR`, `VF`, Origines, Déchaînés). Add a language there, never per source.
  [2026-10-12](../DECISIONS.md#L16892)
  **The one exception is `lib/regional-printings.ts`:** four cards that exist only
  in Korean or Chinese (Jinx and Yasuo KR promos, Ahri 303a KR, Seraphine 174a* CN)
  are priced from eBay listings in their language that name that printing.
  Add a card there, never loosen `FOREIGN_LANG`. [2026-10-15](../DECISIONS.md#L17148)
- **TCGplayer is a buyable comparison row in every market but Australia**
  (US `tcgplayer`; UK/SG/CA/EU the same price converted): the cheapest English
  NM listing of the card's printing (Foil for Rare, Epic and Showcase, from
  TCGplayer's rarity, since `foilOnly` is never set), else TCGplayer's market
  (last-sold) price, in stock either way.
  In Australia it stays a reference, never a row. Other references (Cardmarket;
  `tcgplayer_market`) still sit below the comparison, never in it.
  [2026-09-18](../DECISIONS.md#L8181), [2026-09-19](../DECISIONS.md#L8747),
  [2026-09-23](../DECISIONS.md#L10975), [2026-10-02](../DECISIONS.md#L16522),
  [2026-10-26](../DECISIONS.md#L19970)
- **Deal Finder has three views, as tabs under its intro:** "Underpriced vs
  TCGplayer" (the default; the store picker, no Buy-from presets), "Cheapest on
  eBay" (`?view=ebay`, free) and "Underpriced vs eBay" (`?view=vs-ebay`, gated
  like the first): a store on the default list (+ CardTrader in the EU) below
  the cheapest eBay listing, an asking price; store prices are item prices,
  postage extra, and the copy says the gap is smaller by it; % is of the eBay
  price; ties excluded; Canada has no eBay view. The store picker is on the
  first view only. `Card.marketPriceCents` is synthetic; never show it.
  [2026-09-21](../DECISIONS.md#L9681), [2026-09-17](../DECISIONS.md#L7801),
  [2026-09-30](../DECISIONS.md#L16000)
- **Stores:** check the match rate before adding one. If a read fails, keep
  yesterday's rows; rows expire after 72h of empty returns, and
  `DECOMMISSIONED_RETAILERS` purges removed stores. Only the keys listed there:
  a store dropped from the registry without its key added keeps its rows
  indefinitely (the 105 such ghost stores were purged on 2026-10-16). A store
  moved to sealed-only goes in `SINGLES_RETIRED_RETAILERS` instead, which drops
  its card rows and keeps its sealed ones. Vet a store by its live match rate
  and where it ships from (`/meta.json`): Canadian stores sat in the US
  and SG markets until 2026-10-16 (two of them). A store's
  `currency` must match its market or its prices are refused
  (`lib/offer-currency.ts`), and every Shopify `?country=` goes through
  `isoCountry` (GB, ES), never our market code.
  Sealed-only stores go in `lib/sealed-stores.ts`, never `RETAILERS` (Shopify,
  product pages, or a store's own JSON feed: `FEED_STORES`, [2026-10-15](../DECISIONS.md#L17542)).
  [2026-09-23](../DECISIONS.md#L11091), [2026-09-23](../DECISIONS.md#L11034),
  [2026-09-24](../DECISIONS.md#L11971), [2026-10-15](../DECISIONS.md#L17453),
  [2026-10-16](../DECISIONS.md#L18060)
- **Sealed offers have three states** (open / sold out / unknown past 72h,
  `lib/sealed-offers.ts`); only open offers set a headline price or a store
  count. [2026-09-24](../DECISIONS.md#L11971). A product page's stock comes
  from the platform's live inventory before schema.org: BigCommerce's BCData
  (`instock` or a live backorder allowance; `purchasable: false` vetoes, `true`
  is never stock) overrides a JSON-LD `PreOrder`, which states the purchase
  mode, not the stock; an unreadable BCData is not evidence of stock. "Checked
  X ago" (`lastSeen`) means the page was read, not that its stock was judged
  right. [2026-10-15](../DECISIONS.md#L17216) A store whose theme locks products to in-store
  purchase invisibly to its feed opts in with `purchaseLockPages` (Thistle
  Tavern): its in-stock sealed rows' pages are re-read and a
  `data-purchase-locked`/`data-instore-only` main block is stored as not in
  stock — one-way, never marking anything in stock. [2026-10-15](../DECISIONS.md#L17382)
- **Deck lines resolve to the STANDARD printing** (`isStandardPrinting` in
  `lib/deck.ts`): not a promo, alt-art, Signature or overnumbered copy, unless
  no standard one exists or the line pins it (`(VEN-197*)`). Every resolver
  caller selects `variant` and `isPromo`. A card slug that changes goes in
  `lib/card-slug-renames.ts`, which keeps the old URL resolving, never in a
  config redirect. Legend names come from `lib/legend-name.ts` in every
  importer. [2026-09-27](../DECISIONS.md#L14955)
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
- **Last known price (2026-10-18, owner):** where the card page's headline
  would read "—" (no live price, no "Last seen" listing) and no market has the
  card in stock, it shows the newest day of the card's own history series (the
  chart's, `getPriceHistory`) in the secondary text colour under "No live
  price", with "Last known price · 15 Oct 2026" as text; the quick view does the
  same. A card stocked in another market keeps "—": the shared series' newest
  point would be that market's live price. Display only (`lib/last-known-price.ts`):
  never a sort, filter, index, mover, deal, alert, basket, value, eBay
  comparison, "cheapest"/"from" claim, JSON-LD, title, description, share image,
  sitemap or export field (`tests/last-known-price.test.ts`). Tiles and lists
  still say "No price yet"; that needs a column the import writes forward.
  [2026-10-18](../DECISIONS.md#L18543)
- **Portfolio value never includes shipping.** Price-drop emails: at most one
  digest per address per week, except Plus/Premium target, below-market and
  restock alerts (and a free account's one target, which rides the daily
  "all" run), which run after both daily imports (refresh-prices.yml's
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
  `lib/price-history.ts`; every per-card price-history reader uses them
  (`tests/methodology-breaks.test.ts`), and the Index and portfolio are
  chain-linked across a break. Rising Cards is the exception: it keeps its
  pre-09-23 signals by the owner's call until cards have five weekly points
  on the new basis. /movers is never blank through a break: until any card
  has a week on the new basis (and only within the grace window) it shows the
  last week BEFORE the switch, labelled — opt-in, so no other surface shows a
  stale price as today's. [2026-09-25](../DECISIONS.md#L12842), [2026-09-25](../DECISIONS.md#L13043),
  [2026-09-27](../DECISIONS.md#L14850)
- **Rules text:** `Card.description` comes from Riot's gallery for every set.
  Origins, Proving Grounds, Spiritforged and Unleashed are filled by
  `scripts/backfill-card-text.ts` (maintenance task `backfill-card-text`,
  report-only unless `apply`): fill-only, matched on externalId + name +
  collector number, refused unless it reproduces the stored Vendetta format.
  Never run set-pipeline for those sets (it would duplicate ~950 cards);
  sync-cards never writes the column. Core bracket-marker keywords are
  unscoped; Empower/Flow/Burn and the plain-word predicates stay on Vendetta.
  [2026-09-25](../DECISIONS.md#L12375)
- **Hand-catalogued reveals:** a card Riot's gallery doesn't carry yet goes
  in `manual-cards.json` only when its number, rarity gem and text all read
  off a finished card image. Radiance matches Riot's card gallery, all 177
  printings (8 October; 164 on 7 October, 130 on 5 October, 84 on 30 September): image, name, number, rarity and rules text from the gallery
  (text in the importer's [S]/[T]/[N]/[A]/[C] token format), and domain,
  type and stats from the printed card, because the gallery's metadata
  fields are wrong for many Radiance cards. So the scheduled Radiance import
  runs as a dry run. A printing no Riot source shows is retired through
  `RETIRED` in `add-manual-cards.ts`. A retired card that user data points at
  is merged into the printing it really was (`mergeInto`: every user row
  moves, then the card goes, in one transaction; any unique-key clash keeps
  it) or, with no `mergeInto`, kept. A slug moves only through
  `CARD_SLUG_RENAMES`. The gallery import
  skips a printing already catalogued by hand (same set + number). A card a preview partner shows before Riot's gallery does goes in from that partner's finished English image, self-hosted until Riot's asset exists; a non-English printing alone is not enough. Read the image Riot serves for a number, not only the number: RAD 169, 171 and 174 are each an unsigned overnumber (Riot's image) plus a signed \* twin (so are 168 and 170), and nothing is in `RETIRED` now. A gallery's own Might and domain are not trusted either (a gear with Might 3, Entrenched Boar "Colorless"): Might is stored for Units only and each new row is checked against the printed card. A watermarked or low-resolution partner image is held back, not hosted. Article
  markdown writes a Signature number as `169\*/167`.
  [2026-09-29](../DECISIONS.md#L15513), [2026-09-30](../DECISIONS.md#L15766), [2026-09-30](../DECISIONS.md#L15794), [2026-09-30](../DECISIONS.md#L15921), [2026-09-30](../DECISIONS.md#L15941), [2026-10-02](../DECISIONS.md#L16445), [2026-10-05](../DECISIONS.md#L16646), [2026-10-07](../DECISIONS.md#L16713), [2026-10-08](../DECISIONS.md#L16772)
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
- **Release alerts are their own type** (`SetReleaseAlert`, Radiance first):
  at most two emails per address and set — singles get a store price in its
  market (a card-page signup waits for that card), a sold-out pre-order
  restocks — capped per run, POST-only unsubscribe, no affiliate links. Blog
  and guide card mentions link to the card with a viewer-market price chip,
  resolved at ISR time; single-word card names are never auto-linked.
  [2026-09-26](../DECISIONS.md#L14074)
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

## Pokémon section (beta)

- **Self-contained, removable, off by default (2026-10-01, owner: "if there is
  an issue, I can just completely remove all the Pokemon"):** `/pokemon` prices
  English Pokémon sealed (Sword & Shield onward) in all six markets from its OWN
  Neon project (`POKEMON_DATABASE_URL`, `prisma/pokemon/schema.prisma`, its own
  client) — never RM5 or history. On only when `NEXT_PUBLIC_POKEMON_SECTION=1`
  AND the database is set; off, every route 404s and the nav link, homepage
  promo, sitemap section, robots.txt and llms.txt entries vanish. Six Riftbound
  files know it exists, pinned by `tests/pokemon-isolation.test.ts`; the
  removal table is in `docs/pokemon/README.md`. Daily import
  (`pokemon-import.yml`, schedule only) from TCGCSV; eBay is Riftbound's first:
  Pokémon searches only at 21:47 UTC, after both Riftbound runs, and spends
  `min(60, remaining − 2500)` (nothing when unknown) on the last 12 months' sets
  [2026-10-01](../DECISIONS.md#L16335);
  Cardmarket is built but off (`POKEMON_CARDMARKET`) pending the owner's
  permission question; product pages noindex until `POKEMON_INDEX_PRODUCTS=1`.
  eBay queries go through `pokemonEbayQuery` ("Pokemon" once), never
  `riftboundEbayQuery`; affiliate sub-ids carry `pkmn`. The site's price rules
  apply unchanged. [2026-10-01](../DECISIONS.md#L16105)
- **Home, hubs, blog and distribution (2026-10-01):** `/pokemon` is the
  section's home; three kind hubs and `/pokemon/price-per-pack` own the head
  terms; product pages index only through the stage-1 gate
  (`lib/pokemon/index-gate.ts`: box, ETB, PC ETB, bundle with a known pack
  count) and only once `POKEMON_INDEX_PRODUCTS=1`, which waits on an audit with
  no `pokemon-product` cluster (never padding). The blog is its own registry
  (`lib/pokemon/blog/`, never `ARTICLES`); posts land as drafts that 404 in
  production until Bill approves. Shared figures come from `lib/pokemon/value.ts`
  only; per-pack comparisons pick by price per pack. No MSRP/RRP, no "deal",
  dates "TCGplayer lists", "as of" not "today" (`tests/pokemon-copy.test.ts`).
  Titles absolute ≤60 via `pokemonMeta` with an explicit share image. Reaching
  communities that ban links: price share cards and copy-as-text buttons, never
  promo posts; the Pokémon Discord app was built and then removed by the owner.
  [2026-10-01](../DECISIONS.md#L16219)
- **Connected to DexCompare (2026-10-15, owner: "connect it to Dex Compare …
  seamless"):** keep both sites, joined exactly by TCGplayer productId (DexCompare's
  TCGplayer images), never by name. `getDexMarket` (self-cached, no database)
  reads DexCompare's public browse index; product boards, the quick view, the
  every-market table, tiles, kind hubs, set pages, the home band and the subnav
  show its store figures and link it. It is never an offer row, never ranked in
  the comparison, and never feeds per-pack rankings or prose. A price is quoted
  only as a store's (`storePriceCents`): never when TCGplayer is in DexCompare's
  figure. A sold-out or set-only block goes after the eBay search. The fetch
  never passes `cache: "no-store"` (it breaks ISR inside `unstable_cache`). Every DexCompare link opens
  a new tab, `rel="nofollow noopener"`, `pokemon_dexcompare_click`. DexCompare
  links back through `/pokemon/tcgplayer/<id>`. The ops monitor watches the index
  (`partner:dexcompare`). [2026-10-15](../DECISIONS.md#L17162)

## Removed, declined, kept

- **Meta decks:** never from a hand copy; rebuild a meta/tier list only from
  a licensed source. `/decks` is live again (2026-09-26) as the PLAYER-published
  library only — signed-in publishes and owner imports, nothing seeded, no
  redirect. [2026-09-12](../DECISIONS.md#L5565), [2026-09-26](../DECISIONS.md#L14127)
- **Also removed:** Market Pulse and the domain chips; the card page's
  "Embed this live price" (`/embed` still offers the widgets); the per-card
  eBay auction pass. [2026-09-17](../DECISIONS.md#L7959),
  [2026-09-21](../DECISIONS.md#L9560), [2026-09-16](../DECISIONS.md#L6683)
- **Ten features deleted (2026-10-16):** the Discord price bot and daily
  Discord post, marketplace leftovers, the Shopify cart API, the MCP server,
  store consulting, Sealed Bid, Card Smash, Zoomed In, Price Check and
  `/community`. Their tables stay (no drops); every page 301s
  (`tests/feature-cleanup.test.ts`). The Pokémon section stays (owner).
- **No AI calls, no Speed Insights (2026-10-16):** Trade Roast (and its
  Gremlin box) and the unrendered AI card insight are gone with the Anthropic
  SDK; the site makes no model call. Speed Insights is removed (billed, unread).
  Web Analytics and the keep-warm stay. [2026-10-16](../DECISIONS.md#L18248)
  [2026-10-16](../DECISIONS.md#L18206)
- **Declined:** a locked popup ✕; guest checkout (deferred); a Radiance post blitz; open-ended paid ads (a measured test is allowed, 2026-10-16); a static rule-2
  egress test; a static landscape header or
  a 44px desktop switcher; re-ranking eBay above a cheaper store (declined
  09-26; adopted for the pre-order table only on 10-15, [2026-10-15](../DECISIONS.md#L17284)), an eBay
  "Money Back Guarantee" claim, a card-page "#N of M" eBay module, affiliate
  links in emails. [2026-09-26](../DECISIONS.md#L13751),
  [2026-09-14](../DECISIONS.md#L6134),
  [2026-09-13](../DECISIONS.md#L5890), [2026-09-16](../DECISIONS.md#L6598),
  [2026-09-21](../DECISIONS.md#L9560), [2026-09-14](../DECISIONS.md#L6263),
  [2026-09-23](../DECISIONS.md#L11201). (A minimum "real drop" threshold, once
  declined, was set on [2026-09-25](../DECISIONS.md#L13128).)
- **Kept on purpose:** the client-only `ssr: false` overlays. Premium's nav
  prominence, kept on purpose until then, was reversed on 2026-09-28 (plain
  "Pricing" links). [2026-09-16](../DECISIONS.md#L6834),
  [2026-09-22](../DECISIONS.md#L10328), [2026-09-28](../DECISIONS.md#L14549)

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
- **Brand (2026-10-16):** Riftbound's palette, read from playriftbound.com:
  teal-navy ink, orange `#ef7d00` as the one accent (`brand-*`; `#f29733` as
  text on dark), Cinzel headings (the Beaufort stand-in), Inter body. The logo
  is the R mark (`public/brand/r-mark.svg`, a CSS mask over the `--rc-flame`
  gold-to-orange gradient) beside "Rift" + "Compare" as live mixed-case text,
  "Compare" in the same gradient (owner: not all caps). The gradient is
  decoration only (the logo, the H1's "Riftbound"). Purchases keep the
  pre-rebrand green, `buy` / `.btn-buy`: every store's buy button, Premium's
  checkout, the Cheapest and savings chips. eBay stays blue, the header's
  Premium link gold, and a green that means something (gains, in stock) green.
  The homepage hero moves (RiftEmbers, `.rb-vortex`, `.rb-flame-live`,
  `.rb-search-aura`), stilled by reduced motion. Mask classes live in
  `@layer components`, or they beat `hidden`. `lib/brand.ts` holds the hexes
  for OG images and email.
  [2026-10-16](../DECISIONS.md#L17677), [2026-10-16](../DECISIONS.md#L17713)
- **Seasons and scroll motion (2026-10-16):** a season is a local-date window
  (`lib/season.ts`; Halloween 16-31 Oct) stamped as `data-season` on `<html>`
  before paint, so it starts and ends with no deploy; `?season=halloween|off`
  previews it. Anything a boot script stamps outside React's props needs an
  observer to survive a failed hydration, which resets `<html>`/`<body>`
  attributes ([2026-10-16](../DECISIONS.md#L17916)). Season markup lives in
  its own components (`NocturneComing`, `HalloweenDecor`), so a season comes
  out by deleting them.
  Scroll motion is scroll-driven CSS (scroll/view timelines; transform and
  opacity only) under `@supports` and no-preference; `Reveal` steps aside where
  it runs. No scroll-jacking library. Riftbound 2048 is retired
  (`/games/twenty48` → `/games`). [2026-10-16](../DECISIONS.md#L17797)
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
