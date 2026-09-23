# Current state: the rules and decisions in force

Last reviewed 2026-09-23, against DECISIONS.md up to and including [2026-09-23 · The UI pass, completed: overlays](../DECISIONS.md#L11348).

This is the short version of [DECISIONS.md](../DECISIONS.md): what still stands, taken from the entries themselves. Each bullet cites its source entry. Where an
entry was reversed later, the bullet gives the latest position and names the reversal. If this page and an entry disagree, the entry wins, so fix the page. The
index is [DECISIONS-INDEX.md](DECISIONS-INDEX.md) (`npm run decisions:index`).

## Deploys & egress

- **Production builds only when a commit's SUBJECT contains `[deploy]`** (any case; a body mention does not count). `vercel.json` `ignoreCommand` →
  `scripts/vercel-ignore-build.sh`, which fails open. Previews are not gated.
  [2026-09-11 · Network transfer: the deploy cadence was the burn](../DECISIONS.md#L4871), subject-only since
  [2026-09-11 · The gate deployed on a commit that said it wasn't](../DECISIONS.md#L5195).
- **One release a day.** `production-deploy.yml` lands an empty `release: scheduled production deploy [deploy]` commit at 08:00 UTC if anything landed since the
  last release. GitHub's cron drifts (it has fired at 11:51–13:01 UTC). "Run workflow" releases immediately.
  [2026-09-11 · Network transfer: the deploy cadence was the burn](../DECISIONS.md#L4871),
  [2026-09-14 · Find the fifth burn before RM10 dies](../DECISIONS.md#L6263).
- **Sessions never add `[deploy]` on their own.** "Push to prod" means land on `main` and ride the release. RM9's four days saw 16 marked builds (about 4 a day,
  not 1). `egress-audit.yml` now counts `[deploy]` subjects over 7 days. [2026-09-14 · Find the fifth burn before RM10 dies](../DECISIONS.md#L6263).
  Off-schedule releases the log accepts: a database cutover [2026-09-14 · RM9 lasted three days too](../DECISIONS.md#L6203), an explicit owner "I need something
  now" [2026-09-21 · "Visitor counts are going down"](../DECISIONS.md#L9167), and an importer change whose auto-started import needs its site code live
  [2026-09-23 · US stores: five added, one moved, one removed](../DECISIONS.md#L11091).
- **Every build prerenders DB-backed pages**, clears the Full Route Cache and orphans much of the Data Cache (an `unstable_cache` key includes the callback's
  minified source). Card pages prerender nothing (`generateStaticParams` returns `[]`). Don't re-add prewarming or lower a page's `revalidate`.
  [2026-09-11 · Network transfer: the deploy cadence was the burn](../DECISIONS.md#L4871), [2026-09-11 · The second burn: nested caches](../DECISIONS.md#L5042).
- **The six egress rules atop `src/lib/db.ts` stand:** (1) per-request queries are scoped to one entity; (2) big datasets go through a `globalThis` TTL memo (an
  `unstable_cache` entry silently drops above ~1.2 MB raw); (3) `select` only what is used and `take` a cap; (4) whole-table reads belong in workflows and
  scripts; (5) an `unstable_cache` `revalidate` is never lower than the page's; (6) a self-cached loader is never called inside another `unstable_cache`
  callback, which came from [2026-09-11 · The second burn: nested caches](../DECISIONS.md#L5042). Freshness shorter than the page's TTL is done client-side,
  e.g. the `/auctions` countdown. [2026-09-16 · /auctions rebuilt at 7% of the cost](../DECISIONS.md#L6683).
- **Guards:** `cachedOrDirect` logs `[egress-guard:nested-cache]`, `cache-miss` and `oversize` (above ~1.2 MB). The rule-5/6 tests follow imports into
  `src/components` and across call hops. `BIG_RESULT_ROWS`/`_BYTES` are temporarily widened to 200 / 400 KB (still, in code); restore them to 500 / 1 MB once
  audit-egress has measured the fix. [2026-09-14 · Find the fifth burn before RM10 dies](../DECISIONS.md#L6263).
- **Left alone on purpose:** card pages purge after each of the two daily imports, and the 5-minute keep-warm stays. Two levers are still the owner's call:
  purging once a day, and narrowing `refresh-prices.yml`'s `push` trigger, which starts a full import when importer files change (`sealed-import.ts`,
  `price-import.ts`, `retailers.ts`, `tcgplayer.ts`…). [2026-09-11 · History went from 8.7 GB/day to nothing](../DECISIONS.md#L5303),
  [2026-09-11 · The operational baseline](../DECISIONS.md#L5370), [2026-09-23 · US stores: five added, one moved, one removed](../DECISIONS.md#L11091).
- **The burn is still unidentified.** RM9, RM10 and RM12 all went live after the gate, and each neared or hit the cap in 3–4 days. Run audit-egress after each
  cutover (`RetailerPrice` is the first suspect), and never sample during a deploy, import or purge.
  [2026-09-11 · The operational baseline](../DECISIONS.md#L5370), [2026-09-18 · RM10 → RM12: a new project](../DECISIONS.md#L8523),
  [2026-09-22 · Operational RM12 → RM3, history _2 → _3](../DECISIONS.md#L10455).

## Databases

- **Live names**, with `src/lib/db-chains.ts` as the source of truth, both since 2026-09-22: operational `RM3`, a single variable; history
  `HISTORY_DATABASE_URL_3`, then `_2` (rollback), then `DATABASE_URL` (terminal: history shares operational). Never rotate onto `DATABASE_URL`, "the most
  dangerous name in this repo to rotate onto". [2026-09-22 · Operational RM12 → RM3, history _2 → _3](../DECISIONS.md#L10455).
- **One operational name, never a chain.** `resolveVar()` takes the first SET variable, not the first healthy one, so a chain served stale data silently. One
  name fails loudly (P1001). [2026-09-14 · RM9 lasted three days too](../DECISIONS.md#L6203).
- **Verify the target live before writing.** A recycled project must trail the source on every metric; a new one must be empty.
  [2026-09-18 · RM10 → RM12: a new project](../DECISIONS.md#L8523), [2026-09-22 · Operational RM12 → RM3, history _2 → _3](../DECISIONS.md#L10455).
- **Migration:** a named `maintenance.yml` task with the source pinned to one variable. It guards SOURCE≠TARGET, rejects the operational DB as a target, and
  checks for User rows on history targets. It dumps before truncating, verifies every row count, runs twice (bulk, then top-up), and ends with `prisma db push`
  reporting "already in sync". The chain flips only after the data verifies. The owner sets the variable in Vercel Production, Preview and Development, and
  keeps the rollback. [2026-09-12 · History rotates onto HISTORY_DATABASE_URL](../DECISIONS.md#L5439),
  [2026-09-14 · RM9 lasted three days too](../DECISIONS.md#L6203), [2026-09-17 · History: HISTORY_DATABASE_URL → _2](../DECISIONS.md#L7710).
- **These move with the chain:** `build-db-push.sh`, the `db.ts`/`db-history.ts` warnings (built from `OPERATIONAL_VARS[0]`), each workflow's `DB_SOURCE_NAME`,
  its `OPERATIONAL_URL` guard and bare env-var names, and the probe labels. Migration tasks' SOURCE/TARGET do not move. Retired projects stay reachable by name
  only. [2026-09-14 · RM9 lasted three days too](../DECISIONS.md#L6203), [2026-09-18 · RM10 → RM12: a new project](../DECISIONS.md#L8523),
  [2026-09-23 · US stores: five added, one moved, one removed](../DECISIONS.md#L11091).
- **Workflow traps:** a duplicate YAML key makes GitHub reject the whole workflow (local parsers accept it). Rotating back onto an old name can collide step
  names. [2026-09-22 · Operational RM12 → RM3, history _2 → _3](../DECISIONS.md#L10455). `maintenance.yml` must stay under GitHub's 512,000-byte limit (a test
  fails at 450 KB). [2026-09-23 · Premium did not die — acquisition did](../DECISIONS.md#L10924).
- **History is not solved either.** Despite the 2026-09-11 ~0 GB/day reading, history projects still reached or neared the cap in about five days (09-17,
  09-22). [2026-09-11 · History went from 8.7 GB/day to nothing](../DECISIONS.md#L5303),
  [2026-09-17 · History: HISTORY_DATABASE_URL → _2](../DECISIONS.md#L7710), [2026-09-22 · Operational RM12 → RM3, history _2 → _3](../DECISIONS.md#L10455).
- **Never build or run a dev server against production;** verify on the local seed DB.
  [2026-09-16 · The UI/UX sophistication pass (P0–P8)](../DECISIONS.md#L6598), [2026-09-23 · A multi-device UI pass](../DECISIONS.md#L11201).

## Premium & monetisation

- **FREEZE until about 2026-09-28.** No change to the Premium pitch, pricing, trial, paywall or nudges, and `PREMIUM_COPY_VERSION` stays put. The freeze began
  2026-09-14 for two weeks, and the 09-14 and 09-21 trial cohorts mature from ~09-28. The 09-23 read found retention fine (9 of 10 matured trials paid, no
  paying churn), with the fall at acquisition. That entry says the freeze has "been broken four times since".
  [2026-09-14 · The pricing page was asking for $79.99](../DECISIONS.md#L6038), [2026-09-21 · Marketing: build the front doors](../DECISIONS.md#L9560),
  [2026-09-23 · Premium did not die — acquisition did](../DECISIONS.md#L10924).
- **Tiers.** Plus is $4.99/mo or $39.99/yr for the full lists (Deal Finder, Rising Cards, Rising Sealed). Premium is $9.99/mo or $79.99/yr: Plus plus Value
  Finder, Bulk Pricer, Best Basket, Demand Finder and **ad-free** (moved Plus → Premium on 09-14). One 14-day card-gated trial covers both tiers.
  [2026-09-09 · Premium price reverted to $9.99/$79.99](../DECISIONS.md#L3686), [2026-09-11 · Premium goes two-tier](../DECISIONS.md#L4428),
  [2026-09-14 · The pricing page was asking for $79.99](../DECISIONS.md#L6038).
- **Two gates.** `isPremium(user)` defaults to the Plus minimum. Ad components read `adFree` (the Premium minimum). Pointing ads back at `premium` hands Plus
  ad-free (`tests/ad-free-tier.test.ts`). [2026-09-14 · The pricing page was asking for $79.99](../DECISIONS.md#L6038).
- **Tier comes from the Stripe price.** `tierFromPriceId` maps unknown prices to premium. `max(premiumTier, premiumTierFloor)` is applied at read time; a floor
  only raises and never grants. Never reuse a Price across tiers. Floored to Premium: the August $4.99 cohort, and 09-14's Plus subscribers
  (`scripts/grandfather-plus-adfree.ts`). [2026-09-11 · Premium goes two-tier](../DECISIONS.md#L4428),
  [2026-09-11 · Grandfathering: a tier floor](../DECISIONS.md#L4774), [2026-09-14 · The pricing page was asking for $79.99](../DECISIONS.md#L6038).
- **Member-facing copy names the viewer's real tier**, and marketing says "Premium". Never link a member to a wall. In-app moves: upgrade, downgrade (credited
  now), switch to annual. [2026-09-11 · Plus is a real tier everywhere](../DECISIONS.md#L4642).
- **Checkout:** every buy button goes to `/premium/start`, which is the sign-in step when signed out. OAuth only; guest checkout deferred.
  [2026-09-13 · Sign-in is a step inside checkout](../DECISIONS.md#L5890). `/premium` defaults to MONTHLY (the 09-11 annual default was reversed on 09-14) and
  headlines the real price, with no `$0`. [2026-09-11 · /premium rebuilt to the mtgstocks layout](../DECISIONS.md#L4523),
  [2026-09-11 · /premium defaults to annual billing](../DECISIONS.md#L4608), [2026-09-14 · The pricing page was asking for $79.99](../DECISIONS.md#L6038).
- **"Never overpay for a Riftbound card"** replaced "Get an unfair edge". Pitch surfaces carry no flipper, scalp or "ahead of the market" language, and
  speculation goes to RiftboundStocks.com (`tests/premium-positioning.test.ts`). [2026-09-14 · REVERSAL: Premium sells not overpaying](../DECISIONS.md#L5971).
- **Honesty:** no fake scarcity, countdowns, invented numbers or testimonials, and no free feature sold as Premium.
  [2026-09-10 · The Premium pitch becomes the owner's own comp](../DECISIONS.md#L3990),
  [2026-09-11 · /premium rebuilt to the mtgstocks layout](../DECISIONS.md#L4523). The lock-in banner always shows, with no date. It is a promise: never move
  existing subscribers onto a new Price. [2026-09-22 · The lock-in banner shows either way](../DECISIONS.md#L10328).
- **Nudges:** the signed-out popup sells the FREE account (no price, no gold) and returns to the visitor's page, reversing 09-04's Premium pitch. The signed-in
  `PremiumSlideIn` carries Premium. [2026-09-15 · Premium pitch: a real comparison table](../DECISIONS.md#L6460),
  [2026-09-16 · The signed-out nudge sells the free account again](../DECISIONS.md#L7031). The popup stops after 2 dismissals per device, with a 3-page then
  7-day snooze (14 days after a sign-in click). A locked or timed ✕ was declined. The 5-second delay stays by the owner's call.
  [2026-09-14 · The pricing page was asking for $79.99](../DECISIONS.md#L6038), [2026-09-14 · The signup popup's frequency cap](../DECISIONS.md#L6134).
- **Free visitors get nothing from Deal Finder or Rising Cards**; the queries run only for paying members. Rising Sealed and Value Finder keep a free top pick.
  [2026-09-22 · Deal Finder and Rising Cards give free visitors nothing](../DECISIONS.md#L10538). `TIER_COMPARISON` has no "No account" column.
  [2026-09-22 · The pricing page loses the "No account" column](../DECISIONS.md#L10767).
- **AdSense review mode is off; "the paywall now takes priority".** `NEXT_PUBLIC_ADSENSE_REVIEW_MODE` lifts the paywall for a submission, and the loader and
  meta tag are never gated (`src/lib/adsense.ts`). [2026-09-22 · Deal Finder and Rising Cards give free visitors nothing](../DECISIONS.md#L10538). Still
  blocking: <150 unique words, >90% near-duplicates, empty server HTML. [2026-09-17 · Card pages are always indexable now](../DECISIONS.md#L7801).
- **Measure changes:** bump `PREMIUM_COPY_VERSION` / `PROMO_VARIANT` when funnel wording, price or frequency changes (after the freeze).
  [2026-09-09 · "$0 today" leads everywhere](../DECISIONS.md#L3628), [2026-09-14 · The signup popup's frequency cap](../DECISIONS.md#L6134).

## Navigation & chrome

- **Desktop rail:** 17rem from 1024px (`--sidenav-w`), always expanded. The collapse mode (the default since 09-11) and its cookie, boot script and `[` key were
  deleted on 09-21. Group headers are disclosures, not links; only Prices opens on a first visit.
  [2026-09-11 · The rail defaults to collapsed](../DECISIONS.md#L5253), [2026-09-21 · The rail became a navigation system](../DECISIONS.md#L9958),
  [2026-09-21 · Six corrections to the rail and header](../DECISIONS.md#L10095).
- **Two searches:** the rail's filters FEATURES (`searchNav()`), the header's searches CARDS. Premium is on both; the session control is header-only.
  [2026-09-21 · The rail became a navigation system](../DECISIONS.md#L9958), [2026-09-21 · Six corrections to the rail and header](../DECISIONS.md#L10095).
- **Header:** "Database" (→ `/browse`) shows at every width and is the label everywhere (SEO titles untouched). Card search takes its own second row until xl,
  then sits inline at 36rem. The theme toggle is in the header from lg, and in the menu below that.
  [2026-09-18 · The watchlist is its own header control](../DECISIONS.md#L8349),
  [2026-09-21 · /browse is "the card database" everywhere](../DECISIONS.md#L9368),
  [2026-09-21 · Six corrections to the rail and header](../DECISIONS.md#L10095), [2026-09-23 · A multi-device UI pass](../DECISIONS.md#L11201).
- **1024–1279 is its own band** (~704px): the filter sidebar waits for xl, card art is 160px (320 from xl), and stickies use `lg:top-36 xl:top-20`.
  [2026-09-23 · A multi-device UI pass](../DECISIONS.md#L11201).
- **No mobile bottom tab bar** since 09-18: fixed-bottom UI cannot reliably track browser chrome. One control opens `CinematicNavMenu` below lg, and the menu
  always shows its full grid. [2026-09-16 · Consistency pass: one search, one menu](../DECISIONS.md#L7182),
  [2026-09-18 · The mobile bottom tab bar is deleted](../DECISIONS.md#L8260).
- **No notification bell** since 09-19 (there is no `/notifications`; build a page rather than restore the bell).
  [2026-09-19 · The Database link is back; the bell is gone](../DECISIONS.md#L8590).
- **Watchlist:** a separate header control from sm, a heart on all five surfaces (the star and the bell were reversed). It opens a right-side drawer;
  `/watching` stays. [2026-09-18 · The watchlist is its own header control](../DECISIONS.md#L8349),
  [2026-09-21 · Six corrections to the rail and header](../DECISIONS.md#L10095), [2026-09-22 · The watchlist opens as a side drawer](../DECISIONS.md#L10260).
- **Premium on phones:** gold "✦ Premium" beside Database, with text from 360px. [2026-09-10 · Premium made visual](../DECISIONS.md#L3897),
  [2026-09-18 · The watchlist is the bell; Premium gets its letters back](../DECISIONS.md#L8417). Gold marks Premium, so a non-Premium action never wears it.
  [2026-09-16 · The signed-out nudge sells the free account again](../DECISIONS.md#L7031),
  [2026-09-21 · The sidebar became the whole left edge](../DECISIONS.md#L9805).
- **Homepage order:** Recently viewed (returning visitors only), Top Deals, eBay Picks, the popular carousel, Riftle/pack-sim, How it works. This finishes
  reversing 09-16's game-first order, though Games and Decks still outrank the money tools in the nav.
  [2026-09-16 · "Too money focused for a card GAME"](../DECISIONS.md#L6834), [2026-09-17 · Market Pulse and the domain chips removed](../DECISIONS.md#L7959),
  [2026-09-21 · Today's Top Deals takes the top slot](../DECISIONS.md#L9500).
- **Overlays:** `ui/Dialog` portals to body. Escape closes only the top layer, and focus returns to the opener. Corner nudges hide under a dialog and share one
  corner string. [2026-09-21 · Six corrections to the rail and header](../DECISIONS.md#L10095),
  [2026-09-23 · The UI pass, completed: overlays](../DECISIONS.md#L11348).

## Content & SEO rules

- **One page, one phrase.** Add the `docs/seo-keyword-map.md` row before publishing, and publish fewer pages than feels natural: 13 of ~24 Vendetta pre-release
  posts were 301'd, 7 after an AdSense low-value rejection. [2026-09-10 · Radiance launch readiness](../DECISIONS.md#L4094),
  [2026-09-12 · Three posts, and the eleven ideas we declined](../DECISIONS.md#L5648), [2026-09-17 · Two keywords got an owner](../DECISIONS.md#L7894).
- **Owners.** The homepage `<title>` is "Riftbound Card Prices — Cheapest Store & eBay" (add `(US)` back if `/au` reclaims the US query). The H1 is "Buy
  Riftbound cards at the best price". `/browse` owns "riftbound card list", and `/cards/all` is "Complete A-Z Index". "Price check" is in the homepage FAQ; the
  game is "Price Check Game". [2026-09-17 · Two keywords got an owner](../DECISIONS.md#L7894),
  [2026-09-17 · The homepage sells before it compares](../DECISIONS.md#L8012), [2026-09-17 · /cards/all: an HTML index of every card](../DECISIONS.md#L8062),
  [2026-09-22 · The homepage title, and the store count](../DECISIONS.md#L10403).
- **Radiance:** the spoiler tracker is the only title with "radiance" + "spoiler". The leak post keeps leaks, and `/sets/radiance` keeps "card list". 167 cards;
  9 Legends, 6 confirmed. [2026-09-19 · A photographed Neeko settled Radiance's card count](../DECISIONS.md#L8810),
  [2026-09-21 · A Radiance spoiler tracker](../DECISIONS.md#L9222), [2026-09-22 · The Radiance teaser post, and two Legend counts](../DECISIONS.md#L10174),
  [2026-09-22 · Seraphine's Radiance Legend](../DECISIONS.md#L10683).
- **No store count in any page title** (Singapore's "11 Stores" excepted). [2026-09-21 · Marketing: build the front doors](../DECISIONS.md#L9560),
  [2026-09-22 · The homepage title, and the store count](../DECISIONS.md#L10403). Set pages lead with card-list intent; mechanics guides keep "Explained: How
  the … Mechanic Works". [2026-09-13 · An external audit's title/preorder brief](../DECISIONS.md#L5830),
  [2026-09-21 · "Visitor counts are going down"](../DECISIONS.md#L9167).
- **Card pages are always indexable** (09-17 reversed Phase 7a); only `getCanonicalTwin` duplicates are noindexed. `lib/card-seo.ts` titles aim for 60
  characters, but uniqueness beats length, and "Price" beats the epithet. Paginated set pages stay out of the sitemap.
  [2026-09-17 · The card template's problem was never noindex](../DECISIONS.md#L7393),
  [2026-09-17 · Card pages are always indexable now](../DECISIONS.md#L7801).
- **Set-agnostic code:** nothing names the current set (`/release-dates`, `spoilersHrefForSet()`); a new set is a data row.
  [2026-08-27 · Release dates — one page instead of a page per set](../DECISIONS.md#L3501),
  [2026-09-21 · Marketing: build the front doors](../DECISIONS.md#L9560).
- **Accuracy:** never invent TCG facts, numbers or testimonials, and never predict prices. Quote leaks only from photographed cards with provenance. Never guess
  a domain or rarity; half-known cards stay out of `manual-cards.json`. [2026-09-18 · The HEARTSTEEL post is a fact-check](../DECISIONS.md#L8476),
  [2026-09-22 · The Radiance teaser post, and two Legend counts](../DECISIONS.md#L10174), [2026-09-22 · Seraphine's Radiance Legend](../DECISIONS.md#L10683).
- **FAQ:** one `faq` field feeds both the visible Q&A and the JSON-LD, and it renders once. Generated pairs need a verbatim evidence span.
  [2026-09-21 · Marketing: build the front doors](../DECISIONS.md#L9560). Every article needs an editorial inbound link; `robots.txt` blocks only `/api/` and
  two scrapers. [2026-09-21 · An outside SEO review](../DECISIONS.md#L9273).

## Prices & data

- **Reference prices sit below the comparison, never in it.** That covers TCGplayer, and Cardmarket, which leads for UK/EU.
  [2026-09-18 · The TCGplayer reference price reaches the popup](../DECISIONS.md#L8181),
  [2026-09-19 · Cardmarket: the link and the block order](../DECISIONS.md#L8747). The US `tcgplayer` row is the cheapest in-stock English NM listing of the
  matching printing. `tcgplayer_market` is reference-only, and valuations read market price via `preferMarketRows()`.
  [2026-09-23 · The US TCGplayer row is the cheapest English listing](../DECISIONS.md#L10975).
- **Deal Finder opens on "Underpriced vs TCGplayer"**, and the homepage's Biggest savings badge shows the percentage below the reference.
  [2026-09-21 · Biggest savings means underpriced vs TCGplayer](../DECISIONS.md#L9681). `Card.marketPriceCents` is synthetic; never show it.
  [2026-09-17 · Card pages are always indexable now](../DECISIONS.md#L7801).
- **Stores:** set `freeOverCents: 0` when no threshold is published, and check the match rate before adding a store.
  [2026-09-20 · Working the inbox: sealed prices that were the wrong product](../DECISIONS.md#L8969),
  [2026-09-23 · US stores: five added, one moved, one removed](../DECISIONS.md#L11091). If a read fails, keep yesterday's rows. Rows expire after 72h of empty
  returns, and `DECOMMISSIONED_RETAILERS` purges removed stores. [2026-09-23 · A store fell off the site](../DECISIONS.md#L11034).
- **Matching:** there is one `FOREIGN_LANG` pattern and one promo-set regex. A non-Riftbound denominator leaves a listing unmatched, and a sealed listing's own
  title can veto its group. [2026-09-10 · Working the inbox: four queues](../DECISIONS.md#L4284),
  [2026-09-20 · Working the inbox: sealed prices that were the wrong product](../DECISIONS.md#L8969),
  [2026-09-20 · A third leak, found by reading the table](../DECISIONS.md#L9129).
- **Card art** comes from the `/card-art` mirror via `cardImageSrc`; re-run the mirror with any `fetch-cards` refresh. OG images need PNG (`cardImageForOg`).
  [2026-09-13 · Card art is served from our own origin](../DECISIONS.md#L5750), [2026-09-22 · The Hot 40 thumbnail, and the WebP bug](../DECISIONS.md#L10857),
  [2026-09-23 · Card pages with no picture](../DECISIONS.md#L11146).
- **Portfolio value never includes shipping** [2026-09-15 · Portfolio: the shipping question](../DECISIONS.md#L6531). Price-drop emails: at most one digest per
  address per week; drops are deferred, not lost. [2026-09-21 · Price-drop emails capped at once a week](../DECISIONS.md#L9752).

## Things deliberately removed or declined

- **Meta decks:** `/decks*` 301s to `/deck`. Rebuild only from a licensed source (a TopDeck.gg API key, or Piltover Archive's permission), never a hand copy.
  [2026-09-12 · Meta decks removed](../DECISIONS.md#L5565).
- **Embed widgets:** the card page no longer offers "Embed this live price" (only a code comment in `src/app/card/[id]/page.tsx` records this), but all three
  widgets are still offered on `/embed` (09-21) and old embeds work. [2026-09-21 · Marketing: build the front doors](../DECISIONS.md#L9560).
- **Deleted UI:** the bottom tab bar [2026-09-18 · The mobile bottom tab bar is deleted](../DECISIONS.md#L8260), the notification bell
  [2026-09-19 · The Database link is back; the bell is gone](../DECISIONS.md#L8590), the rail's collapse mode
  [2026-09-21 · The rail became a navigation system](../DECISIONS.md#L9958), Market Pulse and the domain chips
  [2026-09-17 · Market Pulse and the domain chips removed](../DECISIONS.md#L7959), and the "No account" tier column
  [2026-09-22 · The pricing page loses the "No account" column](../DECISIONS.md#L10767). The per-card eBay auction pass stays gone; `/auctions` makes at most 36
  calls a day [2026-09-16 · /auctions rebuilt at 7% of the cost](../DECISIONS.md#L6683).
- **Declined:** a locked popup ✕ [2026-09-14 · The signup popup's frequency cap](../DECISIONS.md#L6134); guest checkout (deferred)
  [2026-09-13 · Sign-in is a step inside checkout](../DECISIONS.md#L5890); target-price alerts (backlog)
  [2026-09-16 · The UI/UX sophistication pass (P0–P8)](../DECISIONS.md#L6598); a Radiance post blitz or paid ads
  [2026-09-21 · Marketing: build the front doors](../DECISIONS.md#L9560); a static rule-2 egress test
  [2026-09-14 · Find the fifth burn before RM10 dies](../DECISIONS.md#L6263); redefining a "real" price drop
  [2026-09-21 · Price-drop emails capped at once a week](../DECISIONS.md#L9752); a static landscape header or a 44px desktop switcher
  [2026-09-23 · A multi-device UI pass](../DECISIONS.md#L11201).
- **Kept on purpose:** Premium's nav prominence [2026-09-16 · "Too money focused for a card GAME"](../DECISIONS.md#L6834); the client-only `ssr: false` overlays
  [2026-09-22 · The lock-in banner shows either way](../DECISIONS.md#L10328).

## UI conventions

- **Tap targets:** `.btn`, `.input`, `.tap-icon` and `min-h-11` are 44px, and 48px under `(pointer: coarse)`; `.tap-link` extends that to text links. Shrink an
  icon inside an unchanged tap box. [2026-08-17 · Phase 5 — Accessibility & Mobile](../DECISIONS.md#L2030),
  [2026-09-16 · Notification bell hidden on phones](../DECISIONS.md#L7242), [2026-09-23 · A multi-device UI pass](../DECISIONS.md#L11201).
- **Desktop-only compact resets use `sm:[@media(pointer:fine)]:…`**, because a bare `sm:min-h-0` cancels the touch floor on tablets. Desktop rows stay 36px.
  [2026-09-18 · The watchlist is the bell; Premium gets its letters back](../DECISIONS.md#L8417),
  [2026-09-23 · The UI pass, completed: overlays](../DECISIONS.md#L11348).
- **Layout:** every grid gets a base `grid-cols-1`, and `body{overflow-x:clip}` is a backstop. An image in a fixed-aspect box is out of flow, and rows of
  controls wrap. Audit phones at DPR 2. [2026-09-22 · One un-wrappable row zoomed the site out](../DECISIONS.md#L10643),
  [2026-09-22 · The mobile zoom-out's second cause](../DECISIONS.md#L10725), [2026-09-23 · A multi-device UI pass](../DECISIONS.md#L11201).
- **Theme:** dark by default, with no `prefers-color-scheme`. Light is a one-year `theme` COOKIE stamped before paint (the root layout never reads cookies), and
  contrast is pinned in both palettes. [2026-09-12 · Light theme as a switchable palette](../DECISIONS.md#L5530). Data colours use `.data-ink`.
  [2026-09-23 · A multi-device UI pass](../DECISIONS.md#L11201).
- **Anchors and fields:** put `.scroll-mt-header` on the element carrying the id (9rem, 6rem from xl). Fields are 16px on coarse pointers under 640px wide or
  500px tall. [2026-09-23 · A multi-device UI pass](../DECISIONS.md#L11201).
- **Focus, motion, money:** every `outline-none` has a `focus-visible:` ring [2026-09-21 · Six corrections to the rail and header](../DECISIONS.md#L10095).
  Motion uses `usePresence()` with no library, per `docs/DESIGN-SYSTEM.md` [2026-09-16 · The UI/UX sophistication pass (P0–P8)](../DECISIONS.md#L6598). Negative
  money renders "−US$190.00" [2026-09-23 · A multi-device UI pass](../DECISIONS.md#L11201).
- **Rendering:** `SearchBar` must not use `useSearchParams()` [2026-09-22 · The search input is in the first HTML byte again](../DECISIONS.md#L10285). Route
  files export only Next's names [2026-09-21 · /gallery: the title makes a claim](../DECISIONS.md#L9351),
  [2026-09-22 · The Hot 40 thumbnail, and the WebP bug](../DECISIONS.md#L10857). Cache headers are scoped by file extension
  [2026-09-20 · The card page's LCP](../DECISIONS.md#L8892). Analytics go through one `trackEvent()` [2026-08-17 · Merge reconciliation](../DECISIONS.md#L3358).
- **Verification:** measure in a real browser. An overflow check misses wrapping and overlap, and a deploy is not a verification. ESLint skips dot-directories.
  Checker agents return strings and never edit files. [2026-09-18 · The watchlist is its own header control](../DECISIONS.md#L8349),
  [2026-09-21 · Subagents wrote to the working tree](../DECISIONS.md#L9908), [2026-09-22 · The Hot 40 thumbnail, and the WebP bug](../DECISIONS.md#L10857),
  [2026-09-23 · A multi-device UI pass](../DECISIONS.md#L11201).
