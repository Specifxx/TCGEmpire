# Growth Plan — from the 2 Jul → 9 Jul traffic data

> **How to use this doc (for the executing agent):** work top-down. Each task has an ID
> (P0-1, P1-2, …) so the owner can say "do P0-3". Check acceptance criteria before
> committing. Everything ships to `main` (auto-deploys on Vercel). Verify `npx tsc
> --noEmit` + `npm run build` before every push.

## The data this plan is built on (7 days, Plausible: visitors / pageviews)

| Signal | Numbers | Read |
|---|---|---|
| Homepage + /browse dominate | 157/345 and 95/310 | Discovery works; funnel below it leaks |
| `/movers` is the stickiest page | 18 visitors, **83 views (4.6 each)** | Habitual price-checkers = the exact Premium persona |
| `/tools/arbitrage` | 10 visitors, 37 views | Power users, but only 10 found it |
| **`/premium`: 4 visitors. `/register`: 2.** | — | The top of the paid/signup funnel is starved, not the checkout |
| Card pages | ~200 distinct URLs, mostly 1–2 views/visitor | Biggest aggregate landing surface; land → check price → leave |
| `/guides/riftbound-empower-explained` | 18 visitors within ~1 day of shipping | The GSC query-cluster strategy is **validated** — scale it |
| `/riftle` | 26 visitors | A real daily habit, currently a dead-end loop |
| `/vendetta-countdown` | 6 visitors | Homepage widget absorbs demand; page captures nothing |
| `/card/cmq0o5nsj00g5bucp8be30vlp` | live raw-cuid URL | Bug — confirmed emitters found (see P0-1) |

## Hard constraints (do not violate)

1. **Card pages, /movers, and set pages are deliberately cookie-free ISR.** Never call
   `cookies()`/`headers()`/`getCurrentUser()`/`getCountry()` server-side in those routes —
   it silently reverts the whole route to per-request rendering and re-breaks the GSC
   "Discovered – currently not indexed" fix. New per-user/per-market UI there must be a
   **client island** (the `AdSlot`/`usePremium`/`TodaysTopDeals` pattern).
2. **Never fabricate TCG content** (cards, rules, decklists). Vendetta content sticks to
   confirmed facts; deck content must be editorially real.
3. **Published card slugs are permanent** (no redirect table). Don't rename slugs; variants
   deliberately self-canonicalise (each printing is a distinct product) — don't "fix" that.
4. Admin surfaces: gated (`isAdmin` or `?key=ADMIN_TOKEN`) + `robots: noindex`.

---

## P0 — Fix & convert (do first, ~1 session)

### P0-1 · Kill the raw-cuid card URLs (bug, small & surgical)
Audit confirmed the two live emitters and the missing redirect:
- `src/app/card/[id]/page.tsx` accepts both slug and cuid (`OR: [{slug}, {id}]`) but only
  hints via `rel=canonical` — **add `permanentRedirect(\`/card/${card.slug}\`)`** when
  `card.slug && params.id !== card.slug`.
- `src/components/SellForm.tsx:96` pushes `/card/${data.cardId}` (raw cuid from
  `/api/listings` POST). Return the slug/href from the API and push `cardHref`.
- `src/components/DeckBuilder.tsx:248` hardcodes `/card/${it.card.id}` **and** the backing
  select in `src/app/api/deck/price/route.ts` omits `slug` — add `slug: true` + use `cardHref`.
- Tighten `cardHref`'s param type in `src/lib/card-url.ts` from `slug?: string | null` to
  **required** `slug: string | null` so a missing-slug select becomes a compile error.

**Accept:** visiting a cuid URL 308s to the slug URL; sell flow and deck pricer emit slug links; tsc clean.

### P0-2 · Make /movers the mouth of the Premium funnel
The stickiest page has **zero** premium presence, no capture, and doesn't link to the paid
tools (cross-linking is currently one-directional *into* movers). Keep the page static;
add client islands:
- A **"For flippers" strip** linking to `/tools/arbitrage` + `/tools/value-finder`
  (server-rendered, static-safe — just links).
- A **Value Finder teaser** (client island via `usePremium`): one real "X% below 30-day avg"
  row + 2–3 blurred rows + `PremiumButton` — reuse the proven `LockedTable` pattern from
  `src/app/tools/arbitrage/page.tsx:350`.
- An **inline alert-capture CTA**: "Get the week's movers in your inbox" → existing
  `/api/newsletter` (after P0-4 hardening), or per-card 🔔 that opens the existing
  `PriceAlertModal`.
- Fix the stale comment (`movers/page.tsx:11-13` says 30-min, actual `revalidate = 86400`).

**Accept:** non-premium visitor to /movers sees exactly one teaser + one capture, both dismiss-quiet; page still ISR (no cookies server-side); `/admin/premium` clicks from source `dialog` rise.

### P0-3 · Card-page conversion island (biggest surface, zero upsell today)
`src/app/card/[id]/page.tsx` has mature SEO + affiliate rows but **no Premium mention and
no visible price-watch CTA**. Add one compact client island under the price table/history:
- **"🔔 Watch this price"** button that opens the existing `PriceAlertModal` explicitly
  (bypassing its once-ever auto-prompt gate, which is `PROMPTED_KEY` in
  `PriceAlertModal.tsx:79` — an explicit click should always open it).
- A contextual **Premium teaser** (client-side `usePremium`, hidden for members): e.g.
  "See every card trading below its average → Value Finder".
- Keep it ONE island; don't clutter — affiliate rows are the page's primary monetisation.

**Accept:** route still ISR (build output unchanged: `revalidate 86400`); alert subscriptions (`/api/alerts/subscribe`) tick up; no CLS regressions.

### P0-4 · Countdown page email capture + newsletter hardening
`/vendetta-countdown` (Event schema, priority 0.8, homepage-linked) captures **zero** emails.
The infra already exists (Resend + `NewsletterSubscriber` + welcome/unsub flows). Ship:
- Inline form on the countdown page: **"Get the release-day alert — we'll email you the
  moment Vendetta prices go live."** POSTs to `/api/newsletter`.
- Harden `/api/newsletter` first: **add rate limiting** (mirror `/api/alerts/subscribe`'s
  20/min/IP via `src/lib/rate-limit`) and **add a `source` column** to `NewsletterSubscriber`
  (`countdown | footer | movers | …`) so conversion is attributable.
- Write the **release-day email template** (new type in `src/lib/email.ts`) now; send
  manually/one-off cron on 31 Jul to `source=countdown` + all subscribers.
- Verify `RESEND_API_KEY` is set in prod (sending silently no-ops without it).
- (Before pushing volume: consider double opt-in reusing the existing token infra —
  currently single opt-in, a deliverability risk as the list grows.)

**Accept:** form works rate-limited; new rows carry `source`; template renders; 31 Jul send planned.

### P0-5 · Stop lying on /tools hub
`src/app/tools/page.tsx` metadata + h1 say "all free, no sign-up" while arbitrage/value-finder
are gated. Fix copy, add **Premium badges** to the two gated cards (badges legitimise the sub),
and port the arbitrage `LockedTable` one-free-row teaser to **value-finder** (currently a blank
hard gate — the worst-converting pattern of the three).

---

## P1 — SEO compounding before Vendetta (31 Jul)

### P1-1 · Scale the validated cluster (Empower proved it: 18 visitors in a day)
New exact-match pages, same hub-and-spoke pattern as the mechanic guides:
- **`/guides/vendetta-card-list`** — living tracker ("every confirmed Vendetta card so far"),
  updated as official reveals land. Only confirmed cards; link the countdown + set page.
  This is THE head query for spoiler season.
- **Champion intent pages** for the nine confirmed Vendetta Legends (Nasus, Renekton, Zed,
  Shen, Akali, Mel, Ambessa…): "Riftbound {champion} cards" — even thin-but-real pages win
  in this vertical right now. Batch template, cross-linked.
- **`vendetta overnumber`** appeared in GSC — add an Overnumbered/Rival-cards explainer guide.
- Add an **FAQ block + FAQPage schema to `/vendetta-countdown`** ("what time does Vendetta
  release", "what's in Vendetta") to own the release-date intent.
- Continue the weekly GSC loop (owner pastes queries; rising cluster → dedicated page).

### P1-2 · Internal-link distribution to the long tail
Card pages: link equity currently concentrates on ~12 expensive same-domain siblings per set.
- Make **tag chips real links** (`page.tsx:402-410` renders `<span>`) → add a `tag` filter to
  `buildCardWhere` (`src/lib/cards.ts:43-88`) and link to filtered `/browse`.
- **Seed/rotate the similar-cards selection per card** (deterministic by card id, not
  priced-desc-only) so long-tail cards get inbound links — these are exactly the URLs stuck
  in "crawled, not indexed".
- **Champion cross-links**: name-prefix match module ("More {champion} cards") — no schema
  change needed (match on name before the comma).

### P1-3 · Regionalise /movers (client-side, keep ISR)
Movers is AU-hardcoded; US/UK visitors of the stickiest page see the wrong market. Use the
`TodaysTopDeals` pattern: serialize all four markets' movers, pick client-side via
`useCountry`, add `RegionToggle`. (Also strengthens P0-2's premium angle.)

### P1-4 · Expand deck coverage (only with real decks)
"Played in these decks" renders on a tiny fraction of pages (6 static decks in
`prisma/meta-decks.json`). Add real, curated decks (owner-approved or sourced from actual
events) — each new deck adds card→deck→card internal links. **No invented decklists.**

---

## P2 — Retention loops (Vendetta week and after)

### P2-1 · Riftle: stitch the daily loop together (viral infra already built)
The emoji-grid share + dynamic OG unfurl already work. Missing distribution:
- Add **streak to the share text** ("🔥 6-day streak") + `navigator.share` fallback; make
  Share the primary post-win button.
- **Homepage teaser tile** (clone the DailyWrapBanner pattern): "Today's Riftle — play in 30s".
- **`riftle_daily` Shard award** via existing `awardPoints` dedupe (game currently pays 0 —
  the two retention economies never touch).
- **Chain the result screen**: after share → "Read today's market wrap" + "Claim your
  check-in (+✦)" instead of dead-ending at "come back tomorrow".
- Add Games/Riftle to the top-level navbar; later unify the two streak systems (Riftle is
  localStorage + Sydney-midnight; check-in is DB + UTC).

### P2-2 · Daily Discord automation
A daily auto-post (today's wrap headline + Riftle link) to the Discord — near-free reach,
uses existing content. One cron + webhook.

### P2-3 · Release-day execution (31 Jul)
- Send the P0-4 release-day email (countdown list + founding users).
- Countdown page + homepage flip to "It's out — every Vendetta price" state (already built
  into `CountdownTimer`).
- Publish the "Vendetta singles: day-one prices" post; social posts (FB/IG assets exist).

### P2-4 · Hygiene
- Exclude `/admin*` from Plausible (data pollution: admin pages show in top pages).
- Watch weekly: `/admin/premium` (clicks→checkout), alert + newsletter subs by `source`,
  pages/visit on card pages, movers→arbitrage clickthrough, GSC rising queries.

---

## Explicitly NOT doing (and why)

- **No premium gate on /movers' existing free content** — its habit value is the funnel;
  tease *additional* depth instead.
- **No canonicalising variants to base cards** — deliberate architecture, each printing is
  a distinct product.
- **No auto-generated per-champion "deck" pages with invented lists** — accuracy rule.
- **No new heavy nav** — the mega-menu was removed on purpose; single nav entry for Games max.
