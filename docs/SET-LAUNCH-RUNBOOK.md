# Set-launch runbook

**Written 2026-09-10, with Radiance (23 Oct 2026) as the worked example.**

Vendetta's launch was run from memory. It worked, but it cost a hand-written
countdown page that had to be retired, seven near-duplicate blog posts that had
to be consolidated after an AdSense low-value-content rejection, and a set-data
pipeline that could only ever import one set. This file is the thing that did not
exist then.

Read it top to bottom before the next set. Everything in it is a real workflow
task, a real file, or a real date — nothing here is aspirational.

---

## 0. The one-line summary

Most of the site is already **date-driven** and needs no edit at all on release
day. What needs a human is: **the set code**, **the `comingSoon` flag**, and
**the email blast**. Everything else follows.

---

## 1. What rolls forward by itself

Do not "prepare" any of these. They read `lib/constants.ts` and the clock.

| Surface | Mechanism |
|---|---|
| `/release-dates` (countdown, Event JSON-LD, `.ics`, FAQ) | `nextDatedRelease()` over `lib/release-calendar.ts` |
| `/embed/release-countdown` | same |
| Homepage "N days to go" line | `nextUpcomingSet()` → `NextSetCountdownCard` |
| Homepage "Explore by set" gallery link | `newestReleasedSet()` |
| `/sets` "Upcoming & unreleased" section | `set.comingSoon` |
| Pre-order listings appearing / disappearing | `isPreorderSetCode()` — date only |
| RRP badges suppressed on pre-orders | same |
| eBay quota priority for the new set (60 days) | `pricePrioritySetCodes()`, window closed at both ends |
| `/sets/<slug>` pre-order link | `preordersHrefForSet()` |
| Set page dropping out of the sitemap while it has 0 cards | `lib/sitemap-sections.ts` |
| Release-day email's default set | `newestReleasedSet()` |

The rule those all follow: **a page that names a set in its code will rot.**
`/vendetta-countdown` and `/radiance-countdown` were both built and both retired;
`lib/release-calendar.ts`'s header is the post-mortem. `/radiance-preorders` is
the one deliberate exception, because a pre-order comparison has a real end date
and retires itself.

---

## 2. Before anything is imported — CONFIRM THE SET CODE

`lib/constants.ts` carries a **guessed** three-letter code for a set Riot has
named but not coded. Today that is `"RAD"` for Radiance, and the comment above it
says so.

Getting this wrong is not cosmetic. It needs a `Card.setCode` backfill after the
fact, and until that backfill runs, every mapper keyed on the code silently
misses — no set match on store listings, no eBay set confirmation, no sealed
grouping.

`scripts/fetch-set-official.ts` **will not let you import under a wrong code**:
if the official gallery reports no cards under our code but does report some other
code, it prints the code the gallery actually uses and exits `2` without writing a
file. That check is the gate; do not work around it.

When the real code differs from the guess, update **all** of:

- `src/lib/constants.ts` — the `SETS` entry
- `src/lib/price-import.ts` — `SET_FROM_TITLE`, `STOP`, `setFromTotal`
- `src/lib/tcgplayer.ts` — `setFromTotal`, `setCodeFromSetName`
- `src/lib/ebay.ts` — `SET_NAMES`
- `src/lib/sealed-import.ts` — `SET_FROM_TITLE`, `SET_NAMES`, `RIFTBOUND_HINT`
- `src/lib/woocommerce.ts` — `SINGLE_NUMBER`

`tests/set-launch-readiness.test.ts` fails if any of those is missing a set that
`SETS` knows about, so you will be told rather than having to remember.

### The printed denominator

`setFromTotal()` maps `/NNN` to a set, and it is the **authoritative** signal —
a title reading `"Some Card - 042/114"` with no set word resolves through it, and
if it misses, `resolveCardId` falls back to `"OGN"` and writes the price onto an
**Origins** card.

For Radiance we claim **both** 114 and 180, because Riot published "180 cards,
66 of them Showcase" and nobody has seen a card: Vendetta's 166 was its base run
with Showcase numbered above it (which would make Radiance's denominator 114),
while Riot's own phrasing would make it 180. Neither collides with another set,
so claiming both is free. **Prune the wrong one once a real card is in the
catalogue.**

---

## 3. Spoiler season (Radiance: 25 Sep – 9 Oct 2026, opening at RQ Los Angeles)

Run `maintenance.yml` → **`set-pipeline`** every few days from the first reveal.

```
task:     set-pipeline
set_slug: radiance        # or blank = the next unreleased set
dry_run:  true            # first run only
```

It scrapes playriftbound.com's official gallery for that set and imports whatever
is revealed so far. Additive and idempotent — re-running adds new reveals and
refreshes existing rows; it never wipes and never touches another set's cards.

Two guards, in both directions: the scraper stamps its output with the set it
captured, and the importer refuses a file stamped with any other set.

What lands: real names, numbers, domains, types, rules text and official Riot CDN
art. Rarity is stored only when the gallery exposed it, otherwise `"TBC"` — an
honest placeholder that `scripts/sync-cards.ts` corrects in place when RiftScribe
catalogues the card, keeping the URL.

Then, in order of preference for anything still missing:

1. `cards-sync` — RiftScribe's own snapshot, once it lists the set.
2. `cards-manual` — `prisma/manual-cards.json`, the backstop. Read the `_note` at
   the top of that file first; most "missing" cards are just prod being behind the
   snapshot.

Every card-mutating task auto-POSTs `/api/cron/ping-new-cards` afterwards, which
purges the sitemap and pings IndexNow. That is the launch-week discoverability
path and it needs no action.

### What the set page does while this runs

`/sets/<slug>` shows the revealed cards as they land, with a green
"Revealed so far" band that flips to "All revealed" when the count reaches
`totalCards`. Below the empty grid it shows the per-set pre-release link cluster
from `PRE_RELEASE_LINKS` in `src/app/sets/[set]/page.tsx` — add the next set's
entry there, six links, when its cluster exists.

---

## 4. Pre-orders (already live for Radiance)

Nothing to run. Sealed pre-orders are imported by the normal `import-sealed` path
and routed to `/radiance-preorders` by `getPreorderGroups()`.

Two things to check by hand for a new set's SKUs, because both are keyed on the
product type rather than the set:

- `classifySealed()` in `lib/sealed-import.ts` must return a real type for every
  new SKU. Radiance introduced a bare **"Vault"**, which matched no product word
  at all until a rule was added.
- `SEALED_TYPE_KW` and `SEALED_MIN_CENTS` in `lib/ebay.ts` must have an entry for
  each of those types. A **missing** keyword is not inert: the filter is
  `!kw || kw.test(...)`, so a type with no keyword is searched with no title
  filter at all and takes eBay's cheapest match for a bare product-name query.

Note that **eBay sealed searches do not run for a pre-order set** —
`refreshEbaySealedMarket` iterates `getSealedGroups()`, which excludes them. A
pre-order set is covered by store/Woo/TCGplayer/Cardmarket rows only, and eBay
coverage starts on release day by itself.

`lib/msrp.ts` has no Radiance-era RRPs and no `"Vault"` row. That is correct
until Riot publishes them — the pre-order page suppresses RRP badges entirely
(`msrpCents = null`) rather than showing a guessed one.

---

## 5. Release day

**One edit, in `src/lib/constants.ts`:**

```ts
{ code: "RAD", name: "Radiance", slug: "radiance", totalCards: 180,
  recentlyReleased: true, releasedOn: "2026-10-23" }
//        ↑ drop comingSoon, add recentlyReleased
```

`comingSoon` is the master interlock. While it is set:

- `runReleaseDayBlast()` refuses (`"<name> is still flagged comingSoon"`),
- `/api/cron/ping-new-cards` will not ping the set hub,
- the set is excluded from `/tools/box-ev`, the pack simulator and movers.

Then, in order:

1. `maintenance.yml` → `cards-sync` (and `fetch-promos`, `tcg-printings`).
2. `maintenance.yml` → `import-prices` and `import-sealed`, or wait for
   `refresh-prices.yml`'s 07:00 / 19:00 UTC runs. The new set automatically wins
   eBay quota priority for 60 days.
3. `maintenance.yml` → `check-cards`, `audit-rarity`, `audit-indexability` —
   read-only, and worth the two minutes.
4. Move the set from `ANNOUNCED_UNPRINTED` into `PRINTED_SET_TOTALS` in
   `tests/set-sizes.test.ts` (that file tells you to).
5. Prune the wrong `setFromTotal` denominator (§2).

### The blast

`release-day-email.yml`, dispatch only — there is no cron and nothing fires on a
date.

```
set_slug: (blank)   # = the most recently released set, which is what you want
dry_run:  true      # ALWAYS first. It reports the real audience and live stats.
audience: subscribers
```

Dry run reports `{ok, set, stats, audienceSize, pending}` without sending. It
refuses on zero cards tracked, so a green dry run is also a data check. Then
re-dispatch with `dry_run` unticked. It is batched (200) and resumable — each
recipient is stamped `release-<slug>` on success, so re-running continues rather
than double-sending.

`audience: users` reaches registered accounts who never opted into marketing;
they get a real one-click opt-out. `all` is both, deduped.

---

## 6. Content: publish fewer pages than feels natural

The hard-won lesson, and the reason this section exists at all.

Of roughly 24 Vendetta pre-release articles, **13 were 301'd away within eight
weeks** — seven in one consolidation commit that names an AdSense low-value-content
rejection as its cause, the rest on Search Console evidence (two of the flagship
posts had 4 and 19 impressions in 28 days).

The survivors all have **live data in them**: an embedded gallery, real decklists,
live eBay picks. The casualties all restated the same announcement facts in
different words.

So, for a new set:

- **One** "what's confirmed" page. `/blog/riftbound-<set>-what-we-know`.
- The **set hub** carries the card list. Do not write a card-list guide until
  there are cards to list.
- The **countdown** is `/release-dates`. Never a per-set page.
- The **pre-order** intent is answered *on* `/radiance-preorders`, not in a post
  beside it.
- Everything else should be something only this site can compute.

`docs/seo-keyword-map.md` has the per-query ownership rows; check it before
writing anything.

---

## 7. Post-deploy check

```
npx tsx scripts/smoke-pages.ts
```

covers `/radiance-preorders`, `/sets/radiance`, `/embed/release-countdown`,
`/release-dates`, and the two retired countdown URLs' 301s.

`store-health.yml` runs 08:00 / 20:00 UTC and will flag scrapers that broke on
the new SKUs — worth watching for the first week, because a new product type is
the usual cause.
