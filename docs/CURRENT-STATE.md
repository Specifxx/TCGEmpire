# Current state: the rules and decisions in force

Last reviewed 2026-09-23, against DECISIONS.md up to and including the
overlays entry, [2026-09-23](../DECISIONS.md#L11348); the free-limits bullets
updated on [2026-09-28](../DECISIONS.md#L14549); the trial and tiers bullets on
[2026-09-30](../DECISIONS.md#L15595).

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

- **Live names** (since 2026-09-28; `src/lib/db-chains.ts` is the source of
  truth): operational `RM5`, one variable, never a chain, because
  `resolveVar()` takes the first SET variable, not the first healthy one.
  History: `HISTORY_DATABASE_URL_4`, then `_3`, then `DATABASE_URL`
  (terminal). Never rotate onto `DATABASE_URL`.
  [2026-09-14](../DECISIONS.md#L6203), [2026-09-22](../DECISIONS.md#L10455), [2026-09-25](../DECISIONS.md#L12637), [2026-09-26](../DECISIONS.md#L14422), [2026-09-28](../DECISIONS.md#L15024)
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

- **The $1 first month, no intro (2026-09-30, owner: "Can we do $1 free trial for both
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
  (up to `DECK_WATCH_LIMIT`, 10, saved lists), Best Basket's store-by-store
  plan (for a pasted list, deck, watchlist, binder or a set's missing cards,
  and behind the portfolio's replacement cost) at the minimum condition the
  member sets, and
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
  Never reuse a Price across tiers: the new Premium amounts equal the old Plus
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
  every quoted number); any paid tier is unlimited; price comparison stays
  free with no limit. Nobody loses anything: only a NEW card is refused while
  at or over the limit, and existing watches, portfolio cards, copies, edits
  and removals keep working, lapsed subscribers included. Every create route
  enforces it (`402 code:"free_limit"`), the anonymous email-only door
  included (counted per canonical inbox, so a `+tag` alias of an address
  that already watches ten is at the limit too), and the import adds up to
  the allowance and reports the rest.
  [2026-09-28](../DECISIONS.md#L14549)
- **Watches that run for you (2026-09-29, owner: "make premium more
  attractive", "marketed better and highly accessible to new users"):** the
  paid tiers watch prices after every import and email when something is
  worth acting on. **Sealed watches** (Plus up to `SEALED_WATCH_LIMIT_PLUS`,
  10; Premium unlimited, ceiling `SEALED_WATCH_HARD_CAP` 200;
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
  store listing yet" until it releases (no denominator). Table cell "Total and
  saving preview" / "Store-by-store plan, up to 200 cards".
  [2026-09-29](../DECISIONS.md#L15397)
- **Every paid feature is discoverable where it lives, inline, never a
  popup:** `DiscoveryTip` (`tip:*` surfaces) is one dismissable sentence for
  signed-in non-members only, on /sealed, a non-Premium Best Basket result and
  /watching's "What you can watch" block (the sealed quick view's watch button
  sells Plus itself, no second line in an overlay); the deck
  watch form and the sealed heart are the ordinary `PremiumButton` gates
  (`gate:deck-watch`, `gate:sealed-watch`) below the tier. /premium is PLANS FIRST
  (2026-09-29, owner: "way too wordy... the buttons... at the bottom"): H1, one
  short subline, the Monthly/Annual toggle and the two plan cards with their
  buy buttons are the first screen at 390x844 and 1280x720; then "What you get"
  (one line a feature, Free / Plus / Premium), the table collapsed in a
  `<details>`, and a seven-question FAQ. No persona sections, per-feature
  cards, CTA band or sticky bar; the page's own content is about 900 words
  (`tests/premium-plans-first.test.ts`). `PREMIUM_COPY_VERSION`
  `premium-2026-09-29c`. [2026-09-29](../DECISIONS.md#L15178),
  [2026-09-29 plans first](../DECISIONS.md#L15538)
- **Upgrade prompts live where a limit is hit, not in headers:**
  the at-the-limit panel (`limit:watchlist`, `limit:portfolio`), Best
  Basket's preview (`limit:basket`, leading with the list's own saving) and
  the tool walls — plus, since 09-29 at the owner's request, the restored
  signed-in `PremiumSlideIn`, and a tick on a set page (the same
  `limit:portfolio` panel, reworded for a set). Header, rail and account menu stay plain
  "Pricing" links. [2026-09-28](../DECISIONS.md#L14549),
  [2026-09-29](../DECISIONS.md#L15178)
- **Checkout:** every buy button goes to `/premium/start` (sign-in first when
  signed out; OAuth only). `/premium` defaults to MONTHLY and headlines the
  real price, with no `$0`. [2026-09-13](../DECISIONS.md#L5890),
  [2026-09-14](../DECISIONS.md#L6038)
- **No sign-up slider; sign-up prompts live in the page (09-30; reverses the
  signed-out half of "value first"):** nothing in the layout asks a signed-out
  visitor to sign up. `InlineSignupPrompt` is page content, one per page, below
  the first screen, signed-out only after `/api/me` answers: `/browse` (after
  the 12th tile), a priced `/deck`, `/decks/[slug]`, `/movers`,
  `/champions/[slug]`. The homepage keeps `AccountStrip` and a released set page
  its tracker line instead. Free account only: no price, gold, Premium, timer,
  modal or dismiss; numbers from `lib/free-limits.ts`; `/login?next=…&src=inline_*`;
  `signup_inline_view` (GA4 only) and `signup_inline_click` by `surface`
  (`tests/signup-inline.test.ts`). `PREMIUM_COPY_VERSION` `signup-inline-2026-09-30`.
  [2026-09-30](../DECISIONS.md#L15871)
- **Corner nudges (value first, 09-29 evening; supersedes "instant" and "on the
  first page"):** only signed-in cards remain. The Premium slide-in (signed in,
  no paid tier) waits for the session's 3rd view and an account older than 48 h,
  skips `/tools`, `/portfolio`, `/watching`, `/sealed`, and is a compact card
  (about 23% of a phone's height) with the tier table behind "See what's
  included". It and `AnnualSwitchNudge` wait `NUDGE_DELAY_MS` = 12 s from
  eligibility, cancel on a dialog, drawer, focused text field or navigation, and
  never appear within 10 s of a dialog closing (`lib/nudge-gate.ts`,
  `lib/nudge-runtime.ts`). What stays: 2 dismissals per device, the 7/14-day
  snoozes, the slide-in's once per session, and no slide-in in the sign-up
  session. Do not add an instant or first-page path back: an instant card
  measured 78% dismissed and Google treats a pop-up over a phone's first page
  as intrusive. [2026-09-16](../DECISIONS.md#L7031),
  [2026-09-14](../DECISIONS.md#L6134), [2026-09-24](../DECISIONS.md#L12089),
  [2026-09-27](../DECISIONS.md#L14536), [2026-09-28](../DECISIONS.md#L14549),
  [2026-09-29](../DECISIONS.md#L15178), [2026-09-29](../DECISIONS.md#L15281),
  [2026-09-29](../DECISIONS.md#L15555), [2026-09-30](../DECISIONS.md#L15871)
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
- **After sign-in:** back to the page it started on (`?next=` on every
  contextual `/login` link; a pending watch completes). With no destination:
  `/dashboard` (`POST_SIGN_IN_FALLBACK`), never `/profile`. A new account gets
  "Welcome" and the setup checklist first there, or a one-time "Your free
  account is ready — Get set up →" toast on the page it returned to, and no
  Premium slide-in for the rest of that session (`lib/signup-session.ts`).
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
  test). The free "Cheapest on eBay" block (Deal Finder since 09-30) lists only cards where eBay
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
  [2026-09-26](../DECISIONS.md#L14190)

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
  /methodology, /privacy, /support and /terms; the six mini-games carry no
  in-page pair. [2026-09-26](../DECISIONS.md#L14680)
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
- **Gold marks Premium**, so a non-Premium action never wears it, and the
  chrome no longer sells it: the header, rail and account menu carry a
  plain, non-gold "Pricing" link to /premium (phones from 400px; below that,
  the menu's Premium entry). No shimmer, no menu spotlight. Signed-out visitors see "Log in" and a primary
  "Sign up free" at every width. The market switcher (flag only below sm) is
  in the header from 360px, and in the menu's top bar below that; on phones
  its panel opens full width under the header. [2026-09-24](../DECISIONS.md#L11756),
  [2026-09-30](../DECISIONS.md#L15905)
  [2026-09-16](../DECISIONS.md#L7031), [2026-09-18](../DECISIONS.md#L8417),
  [2026-09-28](../DECISIONS.md#L14549)
- **Homepage order:** hero, then Today's Top Deals (Biggest savings, Price
  drops, Rising cards; no tier chips, no Cheapest sealed column), then the
  editorial band (`EditorialHub`: Start here, Latest news, Market updates; two
  rows per column on phones), eBay Picks (the newest released set), the popular
  carousel (its "Most popular" tab back, owner's call; it carries the ItemList
  on `/`), Riftle/pack-sim, How it works. No price table on `/` since 09-30
  (the region homes keep theirs). "Cheapest on eBay" lives in Deal Finder since
  09-30. No Recently viewed on any homepage (owner, 09-28); it stays in the
  search box and on card pages.
  [2026-09-17](../DECISIONS.md#L7959), [2026-09-21](../DECISIONS.md#L9500),
  [2026-09-26](../DECISIONS.md#L13751), [2026-09-26](../DECISIONS.md#L14190),
  [2026-09-26](../DECISIONS.md#L14680), [2026-09-28](../DECISIONS.md#L15131),
  [2026-09-30](../DECISIONS.md#L15971)
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
  owns "riftbound card list"; the Radiance spoiler tracker is the only title
  with "radiance" + "spoiler". No store count in any OTHER page title
  (Singapore's "11 Stores" excepted). Bare hreflang `en` is the US page; the
  EU pages carry one en-XX per EU country served.
  [2026-09-24](../DECISIONS.md#L11756), [2026-09-27](../DECISIONS.md#L14908)
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
  off a finished card image. Radiance matches Riot's card gallery, all 84
  printings: image, name, number, rarity and rules text from the gallery
  (text in the importer's [S]/[T]/[N]/[A]/[C] token format), and domain,
  type and stats from the printed card, because the gallery's metadata
  fields are wrong for many Radiance cards. So the scheduled Radiance import
  runs as a dry run. A printing no Riot source shows is retired through
  `RETIRED` in `add-manual-cards.ts`. A retired card that user data points at
  is merged into the printing it really was (`mergeInto`: every user row
  moves, then the card goes, in one transaction; any unique-key clash keeps
  it) or, with no `mergeInto`, kept. A slug moves only through
  `CARD_SLUG_RENAMES`. The gallery import
  skips a printing already catalogued by hand (same set + number). A card a preview partner shows before Riot's gallery does goes in from that partner's finished English image, self-hosted until Riot's asset exists; a non-English printing alone is not enough. Article
  markdown writes a Signature number as `169\*/167`.
  [2026-09-29](../DECISIONS.md#L15513), [2026-09-30](../DECISIONS.md#L15766), [2026-09-30](../DECISIONS.md#L15794), [2026-09-30](../DECISIONS.md#L15921), [2026-09-30](../DECISIONS.md#L15941)
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

## Removed, declined, kept

- **Meta decks:** never from a hand copy; rebuild a meta/tier list only from
  a licensed source. `/decks` is live again (2026-09-26) as the PLAYER-published
  library only — signed-in publishes and owner imports, nothing seeded, no
  redirect. [2026-09-12](../DECISIONS.md#L5565), [2026-09-26](../DECISIONS.md#L14127)
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
