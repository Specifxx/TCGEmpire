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

- **Live names** (since 2026-09-22; `src/lib/db-chains.ts` is the source of
  truth): operational `RM3`, one variable, never a chain, because
  `resolveVar()` takes the first SET variable, not the first healthy one.
  History: `HISTORY_DATABASE_URL_3`, then `_2`, then `DATABASE_URL`
  (terminal). Never rotate onto `DATABASE_URL`.
  [2026-09-14](../DECISIONS.md#L6203), [2026-09-22](../DECISIONS.md#L10455)
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

- **FREEZE until about 2026-09-28:** no change to the Premium pitch, pricing,
  trial, paywall or nudges, and `PREMIUM_COPY_VERSION` stays put, while the
  09-14 and 09-21 trial cohorts mature. The 09-23 read found retention fine
  (9 of 10 matured trials paid), the fall at acquisition, and the freeze
  already broken four times.
  [2026-09-14](../DECISIONS.md#L6038), [2026-09-23](../DECISIONS.md#L10924)
- **Tiers:** Plus, $4.99/mo or $39.99/yr, has the full lists (Deal Finder,
  Rising Cards, Rising Sealed). Premium, $9.99/mo or $79.99/yr, adds Value
  Finder, Bulk Pricer, Best Basket, Demand Finder and **ad-free**. One 14-day
  card-gated trial. [2026-09-11](../DECISIONS.md#L4428),
  [2026-09-14](../DECISIONS.md#L6038)
- **Gates:** `isPremium(user)` defaults to the Plus minimum; ads read
  `adFree` (Premium). Tier comes from the Stripe price (`tierFromPriceId`);
  a `premiumTierFloor` only raises a paid tier, never grants one. Never reuse
  a Price across tiers. [2026-09-11](../DECISIONS.md#L4774),
  [2026-09-14](../DECISIONS.md#L6038)
- **Copy:** members see their real tier; marketing says "Premium"; never link
  a member to a wall. The pitch is "Never overpay for a Riftbound card", with
  no flipper or "ahead of the market" language. No fake scarcity,
  countdowns, invented numbers or testimonials. The lock-in banner is a
  promise: never move existing subscribers onto a new Price.
  [2026-09-11](../DECISIONS.md#L4642), [2026-09-14](../DECISIONS.md#L5971),
  [2026-09-10](../DECISIONS.md#L3990), [2026-09-22](../DECISIONS.md#L10328)
- **Checkout:** every buy button goes to `/premium/start` (sign-in first when
  signed out; OAuth only). `/premium` defaults to MONTHLY and headlines the
  real price, with no `$0`. [2026-09-13](../DECISIONS.md#L5890),
  [2026-09-14](../DECISIONS.md#L6038)
- **Nudges:** the signed-out popup sells the FREE account (no price, no
  gold); the signed-in `PremiumSlideIn` carries Premium. The popup stops
  after 2 dismissals per device, snoozes 3 pages then 7 days, and keeps its
  5-second delay. [2026-09-16](../DECISIONS.md#L7031),
  [2026-09-14](../DECISIONS.md#L6134)
- **Free visitors get nothing from Deal Finder or Rising Cards** (the queries
  run only for paying members); Rising Sealed and Value Finder keep a free
  top pick. [2026-09-22](../DECISIONS.md#L10538)
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
  [2026-09-18](../DECISIONS.md#L8260), [2026-09-19](../DECISIONS.md#L8590)
- **Watchlist:** a heart on all five surfaces and its own header control
  from sm, opening a right-side drawer; `/watching` stays.
  [2026-09-18](../DECISIONS.md#L8349), [2026-09-22](../DECISIONS.md#L10260)
- **Gold marks Premium**, so a non-Premium action never wears it. Phones show
  "✦" beside Database from 360px and the word from 400px (below 360, the
  menu's Premium spotlight). Signed-out visitors see "Log in" and a primary
  "Sign up free" at every width; below sm the market switcher lives in the
  menu's top bar. [2026-09-24](../DECISIONS.md#L11717)
  [2026-09-16](../DECISIONS.md#L7031), [2026-09-18](../DECISIONS.md#L8417)
- **Homepage order:** Recently viewed (returning visitors), Top Deals, eBay
  Picks, the popular carousel, Riftle/pack-sim, How it works.
  [2026-09-17](../DECISIONS.md#L7959), [2026-09-21](../DECISIONS.md#L9500)
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
  [2026-09-24](../DECISIONS.md#L11717)
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
  `DECOMMISSIONED_RETAILERS` purges removed stores.
  [2026-09-23](../DECISIONS.md#L11091), [2026-09-23](../DECISIONS.md#L11034)
- **Matching:** one `FOREIGN_LANG` pattern and one promo-set regex; a sealed
  listing's own title can veto its group.
  [2026-09-10](../DECISIONS.md#L4284), [2026-09-20](../DECISIONS.md#L8969)
- **Card art** comes from the `/card-art` mirror via `cardImageSrc`; OG
  images need PNG (`cardImageForOg`). [2026-09-13](../DECISIONS.md#L5750),
  [2026-09-22](../DECISIONS.md#L10857)
- **Portfolio value never includes shipping.** Price-drop emails: at most one
  digest per address per week. [2026-09-15](../DECISIONS.md#L6531),
  [2026-09-21](../DECISIONS.md#L9752)

## Removed, declined, kept

- **Meta decks:** `/decks*` 301s to `/deck`; rebuild only from a licensed
  source, never a hand copy. [2026-09-12](../DECISIONS.md#L5565)
- **Also removed:** Market Pulse and the domain chips; the card page's
  "Embed this live price" (`/embed` still offers the widgets); the per-card
  eBay auction pass. [2026-09-17](../DECISIONS.md#L7959),
  [2026-09-21](../DECISIONS.md#L9560), [2026-09-16](../DECISIONS.md#L6683)
- **Declined:** a locked popup ✕; guest checkout (deferred); target-price
  alerts (backlog); a Radiance post blitz or paid ads; a static rule-2
  egress test; redefining a "real" price drop; a static landscape header or
  a 44px desktop switcher. [2026-09-14](../DECISIONS.md#L6134),
  [2026-09-13](../DECISIONS.md#L5890), [2026-09-16](../DECISIONS.md#L6598),
  [2026-09-21](../DECISIONS.md#L9560), [2026-09-14](../DECISIONS.md#L6263),
  [2026-09-21](../DECISIONS.md#L9752), [2026-09-23](../DECISIONS.md#L11201)
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
