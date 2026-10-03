# Sister-site playbook

**Written 2026-10-03, with OP Compare (opcompare.app, `Specifxx/OpCompare`) as
the worked example.**

OP Compare was built from RiftCompare in one Claude Code session, from memory and
from mid-build corrections. It worked, but the owner sent fifteen follow-up
messages that corrected or extended it (twelve during the build, three more
after the hand-over: admin parity, link thumbnails and an own eBay keyset). The
domain was guessed wrong. The first store list was
RiftCompare's Riftbound shops. Premium was left out until the owner asked for
it. Price history moved out of Postgres halfway through. This file is what would
have saved those corrections.

**This is guidance, not code that runs**: nothing here is imported, scheduled
or tested. **TCGEmpire was not changed by the OP Compare build**; the only
addition to this repo is this `docs/sister-sites/` folder
([README](README.md)).

Read it top to bottom before the next site. Every file, command and number here
comes from the 2026-10-03 build, or was checked against the two repos that day.
Where something was not verified, the text says so.

Snapshots this file describes:

| Repo | Commit | Notes |
|---|---|---|
| RiftCompare, `Specifxx/TCGEmpire` | `cda650c` | Paths below without a prefix are TCGEmpire repo paths |
| OP Compare, `Specifxx/OpCompare` | `d71528b` (7 commits, 191 files, 65 tests) | Written "Specifxx/OpCompare: path". `d71528b` is the tip of both `claude/tender-noether-2na98p` and `main` on GitHub (`git ls-remote`, 13:15 UTC; `main` did not exist at 11:25, and who created it is not recorded, see [build log §8](OP-COMPARE-BUILD-LOG.md#8-final-state)). At the time of writing the local working tree also held **uncommitted, unreviewed** admin-parity and share-image work (`src/app/admin/`, `scripts/store-health.ts`, `scripts/audit-inbox.ts`, edits to ~27 files). §3.17 records what was asked and decided for it; its code is not described here and must not be copied from a working tree (§2.1) |

---

## 0. One-screen summary

**What a sister site is.** A price-comparison site for one more trading card
game, run by the same owner on the same operating model as RiftCompare. It has
its own repo, Vercel project, Neon database, Stripe account, GA4 property and
domain. It shares rules (deploy gate, egress, matching philosophy), public
identifiers (EPN campaign, Impact link, IndexNow key) and the Search Console
service account. It never shares state, money or quota.

**What OP Compare ended up with (commit `d71528b`):**

| | |
|---|---|
| Catalogue | TCGCSV category 68: 87 sets, 7,255 card printings, 420 sealed, 7,324 TCGplayer listings |
| Stores | 235 Shopify stores: US 73, CA 57, AU 50, UK 30, EU 24, SG 1 |
| Offers | 365,516 store offers in the last full local import (10:22 UTC), 1 store failed |
| Coverage (cards with an in-stock offer) | US 6,963 (mostly TCGplayer), CA 5,826, AU 5,540, UK 3,605, EU 3,528, SG 0 (queried 10:21:34, before the 10:22:25 re-import's aggregate ran; the 10:06 import gave the same except CA 5,722; coverage after the last import was never queried, [build log §7](OP-COMPARE-BUILD-LOG.md#7-metrics)) |
| Site | 34 pages, 12 API routes, sitemap of ~7,800 URLs, 8 computed blog posts |
| Accounts | Google/Discord OAuth, Plus and Premium on Stripe, Deal Finder gated in the query, a Premium Buy List Planner |
| History | JSON files on a `data` branch, read from raw.githubusercontent.com |
| Tests | 65 in 11 files, all passing; crawl of 445 pages + 1,500 links with 0 errors |
| Live? | No. `main` and `data` did not exist on GitHub, and the domain returned Vercel `DEPLOYMENT_NOT_FOUND`. The go-live is a Claude in Chrome prompt the owner runs |

**How long it took** (UTC, 2026-10-03, from the build log):

| Milestone | Elapsed |
|---|---|
| Reconnaissance before the first file | ~6 min |
| First catalogue import | 18 min |
| First page rendered locally | 34 min |
| First commit `d44b533` (114 files, 38 tests, 114 stores) | **53 min 14 s** |
| 235 stores imported | 1 h 37 min |
| Last commit `d71528b` (Premium, OAuth, history in GitHub) | **2 h 15 min 53 s** |
| Hand-over (Launch Kit, env tables, Reddit post) | 2 h 18 min |

Three background agents ran in parallel with the build: the store search
(38 min), the correctness review (22 min) and the RiftCompare Premium map
(7 min).

**The five biggest lessons:**

1. **Ask the §1 questions in the first message.** Eleven of the fifteen
   follow-ups were answers the session could have asked for up front: the
   domain, the stores, the database, the env reuse, Premium, OAuth, history,
   the launch voice, admin tools, link previews and an own eBay keyset.
2. **Store coverage is the product, and the parent's registry is biased to the
   parent's game.** Start a game-specific store search at minute one. Adding
   121 One Piece stores raised UK coverage by 77% and EU by 34%; the US barely
   moved.
3. **"Understated, never wrong" needs proof, not care.** Real store titles in
   tests, a replay of every stored listing after every matcher change, and an
   independent review agent with live database access. The reviewer found 9
   real pricing bugs that the tests had missed, including a US$24.99 acrylic
   case shown as the cheapest booster case.
4. **Isolate anything with state, identity or money.** RiftCompare's Stripe
   reconcile matches subscriptions by email, so a shared Stripe account would
   have given RiftCompare Premium to OP Compare subscribers. New database,
   secrets, Stripe account, OAuth clients and GA4 property. Reuse only public
   identifiers.
5. **Copy OP Compare, not RiftCompare, but decide its departures on purpose.**
   OP Compare is ~190 files against RiftCompare's ~5,000. It also departs from
   RiftCompare in ways nobody decided: a root layout that makes every page
   dynamic, a 2 MB cache budget where RiftCompare measured 1.2 MB, and Vercel
   previews on `claude/*` branches. Fix those in the template first (§2.3).

---

## 1. Decide before writing code

Ask these in the first reply, as one numbered list, before the scaffold. Each
row comes from a correction the owner had to make (the build log quotes U1–U13;
U14–U16 came after the hand-over and are quoted in §3.17).

**Fastest path:** fill the inputs table of [PROMPTS.md prompt 1](PROMPTS.md#1-kick-off-build-site_name-for-game-from-riftcompare)
(the kick-off prompt) with the owner. It covers most of these questions; ask
the rest from this table.

| # | Question | Why it matters | OP Compare's answer, and when it arrived |
|---|---|---|---|
| 0 | **Does the new GitHub repo exist (exact owner/name, public?), and which branch do I work on?** | §3.1 starts from an empty repo; the raw-history design (Q12) needs it public; a cloud session must attach it (`add_repo`) before it can clone or push. | `Specifxx/OpCompare` existed; work went to `claude/tender-noether-2na98p`. If the repo doesn't exist, ask the owner to create it empty and public. Don't create it yourself. |
| 1 | **What is the production domain, and is it already pointed at Vercel?** | Canonicals, sitemap, robots, JSON-LD, OAuth redirect URIs, the Stripe webhook URL and every workflow default derive from it. A guess publishes canonicals on a domain the owner doesn't own. | The code guessed `opcompare.com`. At 1:20 in: "the domain name is opcompare.app which is really important". 11 minutes and a rebuild to fix, plus `tests/domain.test.ts`. `.app` is HSTS-preloaded, so the site is HTTPS-only from the first request. |
| 2 | **Which markets?** Is an empty market acceptable? | Markets are unrolled into 12 `Card` columns, 12 `Sealed` columns, `aggregate()` and two loaders. Changing them later touches all of those. | RiftCompare's six (US, CA, AU, UK, EU, SG). SG ended with 1 store and 0 in-stock cards, and the launch post says so. |
| 3 | **Stores: start from the parent's registry, or run a game-specific search?** | The parent's stores stock the parent's game. | First registry = 114 RiftCompare stores that also sold One Piece. At 0:40: "We obviously need different stores for onepiece". The search added 121. **Answer for the next site: both, from minute one** (§3.5). |
| 4 | **A separate database?** | Neon's free tier is 5 GB transfer and 0.5 GB storage per project, and RiftCompare's projects keep exhausting theirs. | "obviously we also need separate database". New Neon project, one pooled `DATABASE_URL`, never a RiftCompare one. Storage was never measured on Neon; locally the database was already 245 MB after 13 imports, half the free 0.5 GB (§3.4 "Done when"). |
| 5 | **Which env values can be reused from RiftCompare?** Get the exact secret names. | The owner said `GA_SA_KEY`; no such variable exists. RiftCompare's is `GSC_SA_KEY`. | §5 is the reuse table. |
| 6 | **Search Console, Bing, IndexNow, GA4?** | Each needs a workflow, a verification method and a credential. | All four. GSC reuses RiftCompare's service account with a new JSON key; IndexNow reuses the public key; GA4 is a new property; Bing comes in through a GSC import. |
| 7 | **Blog and SEO: hand-written or computed? Who is the byline?** | RiftCompare's posts are hand-written and fact-checked by a named owner, and its rule is "add nothing about him he has not confirmed". | "a really nice and SEO indexable blog". Posts are computed from the price database at render time, bylined to the Organization ("the OP Compare team"). |
| 8 | **Marketing: social posts, ads, promo automation?** | RiftCompare has Reddit/Facebook ads and promo scripts. | "we can skip that part, you know, like the marketing". Not ported. |
| 9 | **eBay: affiliate links only, or its own API keyset?** | RiftCompare owns the 5,000/day Browse quota. Features like "cheapest on eBay" need the API. | Links only: "don't use the eBay API quota … but we want to have the eBay affiliates". `tests/no-ebay-api.test.ts` enforces it. At 2:47 in (U16) the owner asked for OP Compare's **own** keyset, with its own 5,000-call quota split by region and spent on the most valuable cards first. Not in `d71528b`; the variables and setup order are in §3.17. Ask "links only, or an own keyset later?" so the forbidden-API test is written knowing it may be reversed. |
| 10 | **Accounts and Premium: which tiers, prices, gated features, trial?** Same Stripe account or a new one? | It is the largest single feature after the base site. The trial depends on reminder emails, which need a mailer. | Left out at first, then: "even stripe subscriptions should be similar to riftcompare … especially for deal finder". Plus $2.99/$23.99, Premium $4.99/$39.99, no $1 trial (no mailer), **a separate Stripe account**. Prices and trial policy are the owner's call. |
| 11 | **OAuth: new Google and Discord clients, or RiftCompare's?** | Google's account chooser shows the client's app name. | "unless we can use riftcompares". New clients, because RiftCompare's would say "continue to RiftCompare", and editing it would change a RiftCompare resource. |
| 12 | **Price history: a history database like RiftCompare, or files in Git? Will the repo stay public?** | Raw-file reads need a public repo. History also drives the 7/30-day change, Movers and the index. | Changed at 1:55 in: "let's use github to store the data rather than the history database". `PriceDay`/`IndexDay` were dropped and a `data` branch pipeline built. |
| 13 | **Brand: name, logo idea, palette, fonts, the two-letter prefix.** | The prefix names cookies (`oc_auth`), affiliate sub-ids (`oc-…`) and keys. `rc` and `oc` are taken. Use an original mark: no publisher logos, character art or franchise typefaces (for Lorcana, nothing Disney- or Ravensburger-owned, and not the Lorcana logotype). | "change up the logo … the theme is one piece". Straw-hat mark, night-sea navy, Straw Hat red `#d92b33`, straw gold, Luckiest Guy display font, prefix `oc`. OP Compare mixed prefixes: cookies use the site's (`oc_auth`), localStorage keys the game's (`op:theme`). Next time use one prefix for cookies, localStorage keys and sub-ids (for example `lc_auth`, `lc:theme`, `lc-<market>-…`). |
| 14 | **Hand-over: will the owner do any setup by hand?** | If not, the Claude in Chrome prompt and the env tables are deliverables from the start, not an afterthought. | "I really don't want to set it up". One Chrome prompt does Neon, GitHub, Vercel, OAuth, Stripe, GA4, GSC and Bing. |
| 15 | **Launch post: wanted? Voice, communities, style rules, call to action?** | The voice is the owner's call and was rewritten once. | Reddit, price guide first, "personal and no hyphens … sound human", then rewritten to a proud team "we" launch with RiftCompare as the MVP. |
| 16 | **Release semantics: who creates `main`, and when?** | Under the deploy gate, "make the website" means land the code, not `[deploy]`. Work pushed to the build branch after `main` exists does not reach production until merged. | The session left `main` for the Chrome prompt to create from the build branch. |
| 17 | **Keep a running build log for the playbook?** | Reconstructing from a 40 MB transcript and a scratchpad that gets deleted loses evidence. | Asked at the end ("document this entire process … so we can apply to another TCG"). This folder is the result. Next time, keep the log **in the new repo** at `docs/BUILD-LOG.md` (`OP-COMPARE-BUILD-LOG.md` style), committed with each stage. RiftCompare stays read-only during the build: at hand-over, copy the log to this folder as `<SLUG>-BUILD-LOG.md` only if the owner approves a TCGEmpire commit (plain subject, never `[deploy]`). |
| 18 | **Admin: which RiftCompare admin tools, and who is admin?** | RiftCompare has store health, an inbox audit, account/billing admin (grant/revoke Premium, subscriptions, reconcile) and click/demand pages. Each needs uncached per-user queries under the accounts exception. | At 2:36 in (U14): "Admin features should also be the same", naming the owner's address as admin. The in-flight port added a built-in `DEFAULT_ADMIN_EMAILS` list that `ADMIN_EMAILS` **replaces** when set (an empty value removes every address-based admin), so SETUP and the Chrome prompt must say to include the default address. Admins count as Premium. |
| 19 | **Link previews: what must the share images feature?** | Reddit, Discord and X show the `og:image` at small sizes and crop it; a logo-and-tagline card says nothing. | At 2:37 in (U15): "Website link thumbnails must also be very good featuring the website and mainly the price guide". The plan: the price guide as the hero, with real cards and prices, on home, `/price-guide`, sets and sealed, rendered and judged by eye at full size and at 600×315, and meta tags checked against what Reddit, Discord and X expect. |

Then show a **parity checklist** of RiftCompare features as in / out / later,
and the "not ported" list, before building. The owner's model of what had been
ported was out of date mid-build: at 1:56 in they asked to remove "cheapest on
eBay", which had never been built.

OP Compare's "not ported (yet)" list (Specifxx/OpCompare: README.md, "Not
ported (yet) from RiftCompare"): email (price alerts, trial reminders), decks
and the deck builder, games, AdSense, social and ads marketing, the mobile app,
and Cardmarket as an EU source. RiftCompare's Premium tools (deck watch, demand
finder) were also left out (OP DECISIONS.md, "Plus & Premium", not the README).

---

## 2. Strategy

### 2.1 A purpose-built port, not a fork

OP Compare is a new repo of ~190 files written against RiftCompare's ideas, not
a copy of RiftCompare's ~5,000 (Specifxx/OpCompare: DECISIONS.md, "A
purpose-built port, not a fork of RiftCompare"). Even files at the same path
were rewritten: a line-similarity pass over the 95 same-path files put most
under 40%. `prisma/schema.prisma` is 185 lines against RiftCompare's 1,842, and
`src/lib/premium.ts` is 54 lines against 1,075.

**For the next site, start from OP Compare's tree**, then rename and re-derive
per §2.2. Read RiftCompare only to understand why a rule exists; its
DECISIONS.md is the history behind most of OP Compare's rules.

Get the template from git, never from a working tree. `/home/user/OpCompare`
held uncommitted, unreviewed admin and share-image code when this was written,
so copying from it picks that up.

```bash
# in a cloud session, attach Specifxx/OpCompare with add_repo first
git clone https://github.com/Specifxx/OpCompare /tmp/opc
git -C /tmp/opc archive d71528b | tar -x -C <NEW_REPO_DIR>
```

`d71528b` is on branch `claude/tender-noether-2na98p` until `main` exists. Use
it unless the owner names a newer OP Compare commit. If they do, diff it against
`d71528b` (`git -C /tmp/opc diff --stat d71528b <newer>`) and read the new
DECISIONS entries before copying.

### 2.2 GENERIC / PARAMETERIZE / GAME-SPECIFIC

Every one of OP Compare's 191 tracked files falls into one of three classes:

| Class | Meaning | Examples (Specifxx/OpCompare: …) |
|---|---|---|
| **GENERIC**: copy as-is, rename brand tokens only | No game knowledge | `scripts/vercel-ignore-build.sh`, `vercel.json`, `.github/workflows/ci.yml`, `production-deploy.yml`, `stripe-setup.yml`; `scripts/import.ts`, `publish-history.ts`, `probe-stores.ts`, `gsc-report.ts`, `indexnow-submit.ts`; `src/lib/db.ts`, `scrape.ts`, `country.ts`, `get-country.ts`, `fx.ts`, `format.ts`, `price.ts`, `buy-list.ts`, `history.ts`, `history-store.ts`, `images.ts`, `ga.ts`; the whole accounts stack (`auth.ts`, `auth-secret.ts`, `admin-emails.ts`, `accounts.ts`, `oauth.ts`, `next-param.ts`, `premium.ts`, `stripe-entitlement.ts`, `stripe-reconcile.ts`); most components (`PriceBoard`, `LineChart`, `DealList`, `FormCleaner`, `Pagination`, `CardSearch`, `SealedTile`, `PricingCards`, `Upsell`, `GoogleAnalytics`); the API routes; tests `deploy-gate`, `nested-cache`, `theme`, `no-ebay-api` |
| **PARAMETERIZE**: same logic, change constants, copy, domain, regexes | Brand, domain, market list, game words | `package.json` (name), `.env.example`, `next.config.js` (hosts), `tailwind.config.ts` + `src/app/globals.css` (palette), `src/lib/site.ts` (the one-file rename point), `affiliate.ts` (prefix, game keyword), `theme.ts`, `ad-free.ts`, `use-me.ts` (key and cookie names), `plans.ts`, `stripe.ts`, `checkout-params.ts`, `data.ts` (`CoreTuple` columns, `HISTORY_RAW`), `import.ts`, `store-import.ts` (handle regex), `search.ts`, `browse.ts`, `selectors.ts`, blog posts that are pure data, most pages, `sitemap.ts`, `robots.ts`, `docs/SETUP.md`, `docs/CHROME-SETUP-PROMPT.md`, tests `premium`, `history`, `domain`, `affiliate`, `search` |
| **GAME-SPECIFIC**: re-derive | The game's numbers, printings, sets, sealed, stores, art, editorial | `src/lib/catalog.ts` (rules; its `slugify`, `pickPrice`, `plausibleLow`, `assignSlugs` are generic), `src/lib/match.ts` (number grammar, printing keys; its filters, conditions and plausibility are generic), `src/lib/constants.ts`, `src/lib/stores.ts`, `Card`'s stat columns in `prisma/schema.prisma`, `src/components/Logo.tsx` + `scripts/gen-icons.ts` art, the game-hub pages (`/leaders`, `/colors`), game-knowledge posts (`rarities.tsx`, `cheap-leaders.tsx`, `set-review.tsx`), `DECISIONS.md`, tests `catalog` and `match` |

**Brand and game tokens to rename** (a grep over every tracked file found
these): `OP Compare`, `OPCompare`, `opcompare`, `opcompare.app`,
`Specifxx/OpCompare` (history URL in `src/lib/data.ts`, pinned by
`tests/history.test.ts`); cookies `oc_session`, `oc_auth`, `oc_adfree`; the
client event `oc:me`; localStorage keys `op:theme`, `op:watchlist`,
`op:sidenav:collapsed`; affiliate sub-ids `oc-<market>-…`; Stripe
`oc_premium` (checkout metadata `kind`), `STRIPE_SITE = "opcompare"`, lookup
keys `opcompare_<tier>_<interval>`; User-Agents `OPCompare/1.0` and
`opcompare-indexnow`; TCGCSV category `68`; the words "One Piece", "Bandai",
"DON!!", "Leader".

Note that 72 files contain none of these strings and are still not generic:
`browse.ts`, `search.ts`, `ui.tsx` and `BrowseFilters.tsx` import
`src/lib/constants.ts` or carry a One Piece regex.

### 2.3 Fix these in the template before copying it

Found while documenting OP Compare. None was fixed in `Specifxx/OpCompare` at
`d71528b`; fix them in the new repo on day one.

| # | Issue | Where | Fix |
|---|---|---|---|
| 1 | **The root layout makes every page dynamic.** `getCountry()` reads `cookies()`/`headers()` in `src/app/layout.tsx`. The 10:38 UTC build's prerender manifest listed 7 non-page routes and no pages. Every view, `/about` included, is a function invocation. RiftCompare's layout (`src/app/layout.tsx`, around line 280) forbids exactly this, and RiftCompare measured per-request rendering as real Vercel cost (DECISIONS [Vercel cost cuts](../../DECISIONS.md#L12655)). | Specifxx/OpCompare: `src/app/layout.tsx`, `src/lib/get-country.ts` | **Default, unless the owner overrides it: follow RiftCompare.** Remove `getCountry()` from `src/app/layout.tsx`; add a client `CountryProvider` like this repo's `src/components/CountryProvider.tsx` (cookie + `/api/geo`); make price components (OP Compare: `PriceBoard`, the deal lists) take every market column and pick on the client; give pages `export const revalidate`. Record it in DECISIONS (no OP Compare entry covers the current behaviour). Done when the production build's prerender manifest lists the static pages. This is also the rule PROMPTS.md prompt 1 states. |
| 2 | **Cache budget is 2 MB in comments, untested.** RiftCompare measured that `unstable_cache` stores the JSON escaped, so ~1.3–1.6 MB raw can trip the 2 MB check. | `src/lib/db.ts` lines 13–28 (TCGEmpire); Specifxx/OpCompare: `src/lib/data.ts`, `CLAUDE.md` | Budget **~1.2 MB raw per entry**. Add a test that measures `JSON.stringify` of the catalogue entries on a fixture. |
| 3 | **`claude/*` branches build Vercel previews.** RiftCompare's `vercel.json` sets `git.deploymentEnabled` `"claude/*": false, "claude/**": false`. OP Compare's disables only `data`. | Specifxx/OpCompare: `vercel.json` | Copy RiftCompare's entries, keep `data: false`. |
| 4 | A manual release with no reason commits `release: scheduled production deploy [deploy]`, so `git log` can't tell manual from scheduled. | Specifxx/OpCompare: `.github/workflows/production-deploy.yml` | Pick the subject from the event, as RiftCompare does. |
| 5 | `src/lib/stripe.ts` compares `metadata.site === "opcompare"` instead of using `STRIPE_SITE`. | Specifxx/OpCompare: `src/lib/stripe.ts` (~line 44) | Use the constant. |
| 6 | The history URL is hard-coded and pinned by a test. | Specifxx/OpCompare: `src/lib/data.ts` (`HISTORY_RAW`), `tests/history.test.ts` | Derive from one constant in `site.ts`. |
| 7 | `CONTACT_EMAIL` falls back to RiftCompare's public address, and `scrape.ts` sends it as `From:` to every store. | Specifxx/OpCompare: `src/lib/site.ts`, `src/lib/scrape.ts` | Set the new site's own default. |
| 8 | Eight env vars the code reads appear in neither `.env.example` nor `docs/SETUP.md`: `HISTORY_RAW_BASE`, `EBAY_MKRID_*`, `EBAY_SITEID_*`, `PRISMA_LOG`, `REVALIDATE_URL`, `SKIP_REVALIDATE`, `HISTORY_REF`, `IMPORT_ONLY_COUNTRY` (the last is only in a README example and a `scripts/import.ts` comment). | Specifxx/OpCompare: `.env.example`, `docs/SETUP.md` | Document them. |
| 9 | `src/lib/buy-list.ts` cites `tests/buy-list.test.ts`, which doesn't exist (the tests are in `premium.test.ts`). `checkout-params.ts` cites a DECISIONS title "Premium: ported, minus the trial"; the real one is "Plus & Premium: RiftCompare's model, minus the trial". | Specifxx/OpCompare: those files | Fix the references. |
| 10 | `scripts/probe-stores.ts` passes `collections: []`, so a store whose sitemap has no game handle probes as 0 (Hodges UK did). | Specifxx/OpCompare: `scripts/probe-stores.ts` | Honour configured handles, or validate with `IMPORT_ONLY_STORES` (§3.5). |
| 11 | The 72-hour stale rule and reading the market in the layout have no DECISIONS entries. | Specifxx/OpCompare: `DECISIONS.md` | Write them in the new repo. |
| 12 | `import-prices.yml` comments say 07:00/19:00 UTC; the crons are `7 7 * * *` and `7 19 * * *`. | Specifxx/OpCompare: `.github/workflows/import-prices.yml` | Fix the comment. |
| 13 | **No egress audit.** RiftCompare measures where its 5 GB/month Neon transfer goes with `.github/workflows/egress-audit.yml`; the transfer budget is what has repeatedly killed RiftCompare's projects. OP Compare's only check is reading the Neon console by hand. | Specifxx/OpCompare: `.github/workflows/` (ci, import-prices, indexnow, production-deploy, search-console, stripe-setup) | Port `egress-audit.yml` (or a cut-down version), or record in DECISIONS why not. |

---

## 3. The build, in order

Each stage has the same five parts: **Goal**, **Copy from**, **Re-derive for the
new game**, **Done when** (the check that proves it), and **Pitfalls last time**.

"In order" means the **recommended** order. The times in the headings are OP
Compare's, from the start of the session, for reference only. OP Compare did
some stages in a different order: the catalogue (0:01–0:18) before the brand
(0:25), the deploy gate only at 0:50, after the first pages, and accounts
(1:42) before history (1:55). Next time the guards come first (§3.1), because
they are what make every later push safe.

Work on a `claude/*` branch in the new repo. Never put `[deploy]` in a commit
subject. Commit and push after each stage that passes its check.

### 3.1 Repo and scaffold (OP Compare: 0:00–0:07)

**Goal.** An empty repo becomes a Next 14 app with a local Postgres you can
import into.

**Copy from.** Specifxx/OpCompare: `package.json`, `package-lock.json`,
`tsconfig.json`, `.eslintrc.json`, `postcss.config.js`, `.gitignore` (includes
`/.cache/` and `/.data/`), `next.config.js`, `.env.example`. The stack: Next
14.2, React 18, TypeScript strict, Tailwind 3, Prisma 5.22, `jose`, `stripe` 23,
`@vercel/analytics`, `nextjs-toploader`, `sharp` (icons only), `tsx`. No
middleware, no email provider.

Before writing, take reference screenshots of the live parent site (home,
browse, a card page at three scroll depths, price guide, movers, sets, footer,
mobile at 390 px). OP Compare did this in the first two minutes, with Playwright
through the proxy.

Local database (the session started Postgres 16 with `service postgresql start` and created a throwaway role and database; the exact commands below are a sketch, pick your own names and password):

```bash
service postgresql start
sudo -u postgres psql -c "create role <role> login password '<local-pw>'" -c "create database <db> owner <role>"
echo 'DATABASE_URL="postgresql://<role>:<local-pw>@localhost:5432/<db>"' >> .env   # .env is gitignored
npm install && npx prisma db push
```

**Guards, in this stage** (OP Compare added them at 0:50; do it before the
first push). Copy the deploy gate and CI as described in §3.10
(`scripts/vercel-ignore-build.sh`, `vercel.json` `ignoreCommand` with the
`data` and `claude/*` opt-outs, `.github/workflows/ci.yml`,
`production-deploy.yml`, the `CLAUDE.md` rules), and the guard tests:
`tests/deploy-gate.test.ts`, `tests/nested-cache.test.ts`, `tests/domain.test.ts`
(with the real domain from §1 Q1) and the forbidden-API test
(`tests/no-ebay-api.test.ts` or its equivalent).

**Start store discovery now.** Spawn the store-discovery agent in the
background ([PROMPTS.md prompt 2](PROMPTS.md#2-store-discovery-agent), tooling in
[store-discovery/](store-discovery/README.md)) at minute one. It ran 38 minutes
last time and its results decide the registry (§3.5.2).

**Re-derive.** Only the package name at this stage.

**Done when.** `npm run typecheck`, `npm run lint` and `npm test` run, the
guard tests pass, and `npx prisma db push` succeeds locally.

**Pitfalls last time.**
- Bash `cwd` resets between calls: use absolute paths.
- A foreground `sleep 60` is blocked by the harness. Wait with an `until` loop
  in a background call or with Monitor.
- `pkill -f "next dev"` matched the shell running it and killed the call
  (exit 144). Find the server by port (`ss -ltnp | grep :3000`) or stop the
  background task.

### 3.2 Brand, logo and theme (0:25–0:27, then polish)

**Goal.** The site looks like the parent but belongs to the new game.

**Copy from.** RiftCompare's token system, as ported:
Specifxx/OpCompare: `tailwind.config.ts` (the `v(name)` helper:
`rgb(var(--c-<name>) / <alpha-value>)`), `src/app/globals.css` (dark on `:root`,
light on `:root[data-theme="light"]`), `src/lib/theme.ts`,
`src/components/Logo.tsx`, `scripts/gen-icons.ts`, `tests/theme.test.ts`.
Original: `tailwind.config.ts`, `src/app/globals.css`, `src/lib/theme-shared.ts`,
`tests/theme.test.ts`; DECISIONS [Light theme as a switchable palette](../../DECISIONS.md#L5530).

**Re-derive.** The palette (keep token names, rename the accent token, which is
`straw` in OP Compare), the mark geometry (`HAT_PATHS` in `Logo.tsx`, which
`gen-icons.ts` reads), the display font, and the theme storage key.
`npm run icons` writes `src/app/icon.svg`, `src/app/apple-icon.png`,
`public/logo-mark.svg`, `public/icon-192.png` and `public/icon-512.png`.

**Done when.** `tests/theme.test.ts` passes (every `v("…")` token exists in both
palettes) and screenshots in both themes look right next to the parent's.

**Pitfalls last time.**
- The header blur covered the side-rail logo: rail z-index 30 < header 40. Fix:
  `zIndex.rail = "45"`. Tailwind config changes need a dev-server restart.
- The display font looked wrong in mixed case: made the hero `uppercase`.

### 3.3 Catalogue from TCGCSV (0:01, 0:07–0:18)

**Goal.** Every set, single printing and sealed product of the game, with
TCGplayer prices, in Postgres.

**Copy from.** Specifxx/OpCompare: `src/lib/catalog.ts` (generic core:
`slugify`, `cleanEffect`, `pickPrice`, `plausibleLow`, `assignSlugs`, payload
types), `src/lib/import.ts` (`importCatalog`). Precedent in this repo:
`src/lib/pokemon/catalog.ts` (category 3) and `docs/pokemon/README.md`.

First, look at the raw data with curl (TCGCSV needs no key):

```bash
curl -sS https://tcgcsv.com/tcgplayer/categories | python3 -c "import json,sys;[print(c['categoryId'],c['name']) for c in json.load(sys.stdin)['results']]"
mkdir -p .cache && curl -sS -A "<site>-dev" -o .cache/groups.json https://tcgcsv.com/tcgplayer/<cat>/groups
# then, per group, /tcgplayer/<cat>/<groupId>/products and /prices, with a 0.3 s pause
```

Then write a one-off `check-cat.ts` that parses every group and prints set kind,
display name, slug, printing counts and sealed kinds with samples. Commit it
under `scripts/` this time (OP Compare's lived in the scratchpad and was lost).

**Re-derive.** Everything game-specific in `catalog.ts`; §4 is the checklist.
At minimum: the category id, the `extendedData` field names, the sealed-vs-single
test, set kinds from group codes and names, event-stamp detection, the printing
vocabulary and precedence, alias handling, rarity list, sealed kinds and pack
counts, the slug format. **Decide the printing model and slug format before the
first import**: `assignSlugs` keeps a product's first slug forever.

**Done when.** `npm run import:catalog` (= `IMPORT_STORES=0`) loads the whole
catalogue in seconds, and `check-cat.ts` shows no card classified `promo` that
isn't one. For One Piece: 87 sets, 7,255 cards, 420 sealed, 7,324 TCGplayer
listings, ~3 s with `TCGCSV_CACHE_DIR=.cache`.

**Pitfalls last time.**
- Python `urllib` got HTTP 401 from TCGCSV; `curl -A "<name>"` worked. Use curl
  or Node `fetch` with a User-Agent.
- TCGCSV's daily price archive (`https://tcgcsv.com/archive/tcgplayer/prices-<date>.ppmd.7z`)
  returned 403 from the sandbox, so there was no history backfill. RiftCompare's
  `.github/workflows/pokemon-archive-probe.yml` probes it **from GitHub
  Actions**; try that route for the next game (untested for category 68).
- DON!! and Treasure Rare naming bugs only showed up in the `check-cat` dump.
- OP17's six "(Pandaman Art)" cards still classify as `promo` in OP Compare
  (found 2026-10-03, not fixed). Every new set adds vocabulary: make each import
  report the tokens that fell through to `promo` on non-promo rarities.

### 3.4 Data model and import pipeline (0:09–0:18)

**Goal.** One pipeline that loads catalogue, stores, aggregates and history, run
twice a day by GitHub Actions.

**Copy from.** Specifxx/OpCompare: `prisma/schema.prisma` (7 models: `Set`,
`Card` = one TCGplayer printing, `Sealed`, `Offer` (unique `(productId, source,
market)`), `ImportRun`, `User`, `Meta`), `scripts/import.ts`, `src/lib/import.ts`.

The pipeline order (`scripts/import.ts` → `src/lib/import.ts`):

1. `ImportRun.create`.
2. `importCatalog`: groups, products and prices 4 groups at a time, 3 attempts;
   upsert Set, Card (after `foldNameAliases` and `assignSlugs`), Sealed; replace
   TCGplayer offers in one transaction (stored as in-stock **US** offers).
3. `importStores`: 8 stores at a time; currency guard; fetch; match; best
   variant; plausibility; replace each store+market's rows in one transaction.
   A store whose configured collection fails keeps its existing rows.
4. `aggregate`: delete offers from stores no longer in the registry; per market,
   `low<M>` and `stores<M>` from in-stock offers updated in the last 72 h.
5. `recordHistory` (needs step 4): history files, then `change7d`, `change30d`,
   `high90Usd` written onto the rows.
6. `ImportRun.update({ok, summary})`.
7. Revalidate (in CI this moves after the history push; §3.11).

Env knobs: `IMPORT_STORES=0`, `IMPORT_ONLY_STORES=a,b`, `IMPORT_ONLY_COUNTRY`,
`TCGCSV_CACHE_DIR`, `SKIP_REVALIDATE`.

**Re-derive.** `Card`'s stat columns (One Piece's are `cost`, `power`,
`counter`, `life`, `attribute`, `colors`, `subtypes`), and with them
`parseCard`, `CoreTuple` in `data.ts` and the card page's stats block. If the
game has finishes as **price subtypes of one product** (Magic, Lorcana, Flesh
and Blood, Riftbound, Pokémon; §4.2), the "one product = one printing" model
breaks. §3.4.1 gives the default design. Decide before the first import.

**Done when.** A 6-store sample import (one store per market) runs and
`ImportRun.summary->'stores'` shows per-store matches and miss reasons:

```bash
IMPORT_ONLY_STORES=<six keys> TCGCSV_CACHE_DIR=.cache npx tsx scripts/import.ts
psql "$DATABASE_URL" -c "select summary->'stores' from \"ImportRun\" order by id desc limit 1"
```

After the first **full** import, measure the database against Neon's free 0.5 GB
storage:

```bash
psql "$DATABASE_URL" -c "select pg_size_pretty(pg_database_size(current_database()))"
psql "$DATABASE_URL" -c "select relname, pg_size_pretty(pg_total_relation_size(relid)) from pg_catalog.pg_statio_user_tables order by pg_total_relation_size(relid) desc limit 5"
```

OP Compare's local Postgres 16 measured **245 MB after 13 import runs**:
`Offer` 379,142 rows / 192 MB with indexes, `Card` 7,255 rows / 43 MB (measured
2026-10-03, local, not on Neon). That is half the free tier for one game with
7,255 printings and 235 stores, and `docs/SETUP.md` still says storage "stays
small". Scale the projection by the new game's catalogue × store count before
go-live: Magic, Yu-Gi-Oh! and Pokémon (§4.2) have far larger catalogues. The
levers: trim `Offer` columns or stored titles, fewer stores, or a paid plan.

**Pitfalls last time.**
- `make_interval(hours => $2)` needs `$2::int` for a bound parameter.
- Bulk writes use `$executeRawUnsafe` in 30,000-parameter chunks; Postgres has a
  bind-parameter limit.
- Schema changes go out with `prisma db push` inside every import, without
  `--accept-data-loss`, so a destructive change fails instead of dropping data.
- `ImportRun.kind` "stores" is in the schema comment but never written.

#### 3.4.1 Games whose finishes are price subtypes (Lorcana, Magic, FaB, Pokémon, Riftbound)

One Piece prices each finish as its own TCGplayer product. Lorcana does not: in
set 13 (TCGCSV group 24666) 201 of 270 products carry both a `Normal` and a
`Cold Foil` price subtype, 38 carry only `Holofoil` (all Epic, Enchanted or
Iconic), 25 only `Normal` and 6 only `Cold Foil` (measured from the TCGCSV
files 2026-10-03). OP Compare's model has one price per product, so it would
merge a $0.30 normal and a $5 foil.

**Default design** (RiftCompare already solved this with a foil flag:
`prisma/schema.prisma` `isFoil Boolean` and
`@@unique([cardId, retailer, condition, isFoil])`, line 1048):

- Keep `Card` = one TCGplayer product. Add `foil Boolean` to `Offer` and give
  `Card` a second set of per-market price columns (or a child price table) for
  the foil finish.
- `Offer`'s unique key becomes `(productId, source, market, foil)`.
- `pickPrice` reads the `Normal` subtype for non-foil and `Cold Foil`/`Holofoil`
  for foil. A product with only a foil subtype (Lorcana's Enchanted/Iconic) is
  foil-only.
- History points and buckets are keyed by `${productId}:${foil ? 1 : 0}`, not
  `productId` (`src/lib/history.ts`, buckets by `productId % 256`).
- The matcher returns `{ productId, foil }`, and skips a title with no finish
  word when both finishes exist ("understated, never wrong").
- The plausibility band compares against the same finish's market price.
- Everything else keyed by product changes with it: `assignSlugs` (one slug per
  product; the finish becomes a page section or a query parameter, not a slug),
  `CoreTuple` in `src/lib/data.ts`, affiliate sub-ids and watchlist ids.

Record the choice in DECISIONS before the first import. This design is not
tested in any repo for Lorcana; treat it as the starting point.

### 3.5 Stores: registry, discovery, matcher, plausibility, stale rule (0:05–1:52)

This stage is most of the value and most of the risk. Run discovery **in the
background from the start** while you build pages.

#### 3.5.1 Registry

**Copy from.** Specifxx/OpCompare: `src/lib/stores.ts` (shape
`{ key, name, base, country, collections[], currency? }`, plus `STORE_BY_KEY`,
`storesIn`, `storeForSource`, `sourceLabel`), `src/lib/store-import.ts`
(Shopify reader: sitemap discovery, `SKIP_HANDLE`, `MAX_HANDLES = 24`,
`MAX_PAGES = 30` × 250, `?country=<ISO>` for Shopify Markets pricing),
`src/lib/scrape.ts` (UA, 300 ms between requests, 429 handling, robots).

**Re-derive.** The collection-handle regex (`/one-?piece/` in OP Compare), the
`SKIP_HANDLE` words, and the stores themselves.

#### 3.5.2 Discovery

Use the tooling in [store-discovery/](store-discovery/README.md). It is the
2026-10-03 scripts with the game constants moved into one config
(`game.example.json`) and the hand fixes built in.

**Edit every game key in the config first.** `game.example.json` is One Piece's.
Its `otherGamesRe` lists `lorcana`, and `lib.mjs` `classify()` marks a title
matching `otherGamesRe` as another game (`clean` requires `!otherGame`), so an
unedited copy counts every Lorcana listing as another game's, finds 0 clean
listings everywhere and silently passes no store at all. Change: `game`, `handleRe`, `titleRe`, `conventionalHandles`,
`singlesHandleRe`, `cardNumberRe`, `strictCardNumberRe`, `foreignRe`,
`foreignOptionRe`, `notSingleRe` and `otherGamesRe`. In `otherGamesRe`,
**remove** the new game and **add** One Piece (`one ?piece|optcg`). Make
`foreignRe` a superset of the importer's `FOREIGN_LANG` (`src/lib/match.ts`),
plus the game's own print languages: discovery's One Piece list has no German,
Italian or Spanish, so a German-stock Lorcana store would pass discovery and
then lose its titles at import. Then run the three scripts on 3 known-good
stores and check `uniqueClean > 0` before the full run.

A Lorcana starting point (**unverified**: check the regexes against 25 real
store titles first):

```json
"game": "Disney Lorcana",
"handleRe": "lorcana",
"titleRe": "lorcana",
"conventionalHandles": ["lorcana", "lorcana-singles", "disney-lorcana", "disney-lorcana-singles", "lorcana-tcg-singles"],
"singlesHandleRe": "single|card|promo",
"cardNumberRe": "\\b\\d{1,3}[a-z]?\\s?/\\s?\\d{2,3}\\b|#\\d{1,3}\\b",
"otherGamesRe": "one ?piece|optcg|digimon|pok[eé]mon|yu-?gi-?oh|magic: the gathering|\\bmtg\\b|dragon ?ball|union arena|gundam|weiss|riftbound|star wars|flesh and blood",
"foreignRe": "<One Piece's foreignRe>|german|deutsch|\\bde\\b|\\bger\\b|italian|italiano|\\bita?\\b|spanish|español"
```

Run order (`$NEW` is the **new** site's repo; its `src/lib/stores.ts` is empty at
first, so pass `--known` only from the second run on):

```bash
D=/home/user/TCGEmpire/docs/sister-sites/store-discovery
cp $D/game.example.json /tmp/<game>.json      # then edit every key listed above
OUT=$(mktemp -d)                              # never inside a repo
node $D/detect-shopify.mjs    $OUT/candidates.txt $OUT/detect.json --config /tmp/<game>.json [--known $NEW/src/lib/stores.ts]
node $D/probe-collections.mjs $OUT/detect.json    $OUT/probe.json  --config /tmp/<game>.json
node $D/verify-stores.mjs     $OUT/probe.json     $OUT/verify.json --config /tmp/<game>.json --detect $OUT/detect.json [--known $NEW/src/lib/stores.ts]
```

`--include-known` is a `probe-collections.mjs` flag, needed only when `--known`
lists the candidates themselves. `verify-stores.mjs` excludes any `--detect`
entry marked known as "already in the registry", so don't pass `--known` while
qualifying a registry's own stores.

Candidates, in this order of yield:

1. **The existing registries, imported rather than parsed.** OP Compare probed
   RiftCompare's 168 Shopify stores in ~2 min and kept 114 (US 31, CA 38, AU 19,
   UK 13, EU 12, SG 1); a regex parse of `src/lib/retailers.ts` skipped 4 CA
   stores. For a non-Riftbound game, OP Compare's 235 stores are a second
   source. Both lists, as `CC|Name|URL` lines (checked 2026-10-03: 172 and 235
   lines):

   ```bash
   TSX=<a repo with tsx installed>/node_modules/.bin/tsx
   cat > $OUT/r.ts <<'TS'
   import { RETAILER_LIST } from "/home/user/TCGEmpire/src/lib/retailers";
   for (const r of RETAILER_LIST) if (r.platform !== "woocommerce") console.log(`${r.country ?? "AU"}|${r.name}|${r.base}`);
   TS
   cat > $OUT/o.ts <<'TS'
   import { STORES } from "/tmp/opc/src/lib/stores";
   for (const s of STORES) console.log(`${s.country}|${s.name}|${s.base}`);
   TS
   $TSX $OUT/r.ts > $OUT/cand-rift.txt && $TSX $OUT/o.ts > $OUT/cand-op.txt
   cat $OUT/cand-rift.txt $OUT/cand-op.txt > $OUT/candidates.txt
   ```

   (`country` omitted in RiftCompare's registry means AU. `/tmp/opc` is the
   clone from §2.1. The store's market is decided by its `meta.json` country
   anyway.) **Put these stores through all three scripts exactly like new
   candidates.** Last time the 114 inherited stores got only a numbered-listing
   count: no language check, no graded check and no currency re-proof for the
   new game. OP Compare's DECISIONS "Stores" says the new ones were "verified
   the same way", which overstates what the 114 received; don't copy that
   wording into the new repo.
2. **The publisher's official store list**, if one exists. RiftCompare's
   `scripts/sweep-registry.ts` reads UVS Games' 8,445-store API for Riftbound.
   For One Piece only Bandai's Singapore list was used.
3. **Regional directories.** They supplied 74 of the 121 new stores:
   yestcg.com (US), cardcompass.co.uk (UK), tcgstorefinder.com.au (AU),
   tcgshopfinder.com (US, not mined last time). Probe every Shopify site in a
   directory whatever its game tags say: of cardcompass's 718 origins only 92
   mentioned One Piece, yet 16 passed.
4. **Web search**, last. It mostly returned marketplaces and spam.

OP Compare's acceptance rule (Specifxx/OpCompare: DECISIONS.md "Stores"):
Shopify, English ungraded singles, at least 20 numbered listings, priced in the
market's currency. Excluded last time: English titles over Japanese or French
stock (lorenzone.fr, cartespokemon.com), slab-only stores, currency mismatches,
and a duplicate domain of an existing store.

Before merging, **look at card images** for every store the verifier flags.
Three stores last time were caught only by their images.

**Adopt RiftCompare's stricter last step.** RiftCompare's bar (its DECISIONS,
2026-09-23) runs each candidate's live feed through its matcher
(`resolveCardId()`) before adding it. OP Compare didn't, and kept Solacido
(483 products → 64 cards, 17 in stock), whose singles were bare names that
RiftCompare's bar rejected. Run the new site's matcher on every candidate
(`IMPORT_ONLY_STORES`, §3.5.4) and set a products → cards floor.

**Expect a coverage ceiling.** The reader is Shopify-only, so the big
non-Shopify retailers are out of scope: Troll and Toad, CoolStuffInc and
Crystal Commerce stores in the US, Chaos Cards and Magic Madhouse in the UK,
and others. That is why US coverage barely moved. Singapore gained no store:
SG Shopify shops sell Japanese stock, and most other SG shops sell through
Instagram or Carousell. Cardmarket was rejected as an EU source: its public
files carry no card numbers, and the data permission RiftCompare holds covers
Riftbound only.

The prompt that ran this as a background agent is in [PROMPTS.md](PROMPTS.md).

#### 3.5.3 Matcher: two paths

**Copy from.** Specifxx/OpCompare: `src/lib/match.ts`, `tests/match.test.ts`.
The rule (header of `match.ts`, from RiftCompare): "understated, never wrong. A
title is matched only when exactly one printing of that number fits it;
anything ambiguous is skipped."

- **Number path** (`matchCardTitle`): card number(s) in the title → candidate
  printings → printing keys and leftover words → set-aware disambiguation (set
  code in title, then set name, then most specific, then home set) →
  `ruledOut` (a title naming a stamp, promo, event or reprint the printing lacks
  rules it out).
- **Name path** (`buildNameIndex`, `matchByName`): exact TCGplayer name + set
  name, for BinderPOS-style titles with no number ("Arlong (Alternate Art) [A
  Fist of Divine Speed]"). A name+set pair that names two products is marked
  `-1` and never matches. This raised GT Games (CA) from 1,179 to 4,429 matched
  cards. 33 of the 121 new stores carried the number only in the SKU and relied
  on this path.
- **Sealed** (`matchSealedTitle`, `sealedKindOfTitle`).
- **Generic filters**: `FOREIGN_LANG` (from RiftCompare's `src/lib/scrape-http.ts`,
  extended with `non[\s-]?english`), `NOT_A_RAW_SINGLE` (graded slabs incl.
  TAG/AGS, lots, playsets, proxies), conditions, `bestVariant`.

**Re-derive.** The number regex (`cardNumbersIn`), `KEY_PATTERNS`, `STOP`,
`PRINTING_WORDS`, `setCodesIn`, `isHomeSet`, sealed kinds. **Warning:**
`NOT_A_RAW_SINGLE` contains `\b\d{1,4}\/\d{2,4}\b`, meant for serial numbers. It
rejects every "003/084"-style collector number, so as written no Pokémon,
Lorcana, Riftbound or Star Wars Unlimited single could ever match (§4). The same
regex also gates the name path (`match.ts` line 338: `if (isForeign(title) ||
NOT_A_RAW_SINGLE.test(title)) return null`; the number path calls it at line
223), so the BinderPOS fallback is dead too.

**Fix for slash-numbered games** (a design, not yet tested in any repo):

1. Delete the `\b\d{1,4}\/\d{2,4}\b(?!\s*cards)` clause from
   `NOT_A_RAW_SINGLE`. Serials are already caught by the words
   `serialized|serialised` in the same regex.
2. Parse collector numbers first: a slash number whose denominator equals a
   known set total (from TCGCSV `Number`; Lorcana set 13 is `/207`) is a
   collector number, including "secret" numbers above the total (`212/207`).
3. Reject the remaining serials only by explicit words (`serial(ized|ised)?`,
   `numbered to`) or a `/N` whose denominator is under 100 and is not a set
   total.
4. Pin it in `tests/match.test.ts`: "Mike Wazowski - Well-Rounded Entertainer
   21/207" matches (it is product `21/207` in set 13), and a "/99 serialized"
   title is skipped.

How the One Piece matcher got there (6-store sample):

| Change | Offers | Effect |
|---|---|---|
| First matcher (number + name + printing keys) | 7,382 | 1,569 ambiguous key groups: main set vs its stamped event reprints |
| Event stamp as a token (`eventTag`) | – | ambiguous groups 1,569 → 147 |
| Bracket tokens, set-aware disambiguation | 12,374 | Danireon "ambiguous" misses 1,982 → 49 |
| Name + set path | 15,801 | GT Games 1,179 → 4,429 |

#### 3.5.4 Plausibility and the stale rule

- `plausibleSinglePrice`: drop a listing under 30% of a $3+ market price or
  over 4× + $5. `plausibleSealedPrice`: 0.5×–3×. `plausibleLow` drops a
  TCGplayer low under 25% of a $5+ market. These bands work for One Piece
  because printings of one number differ 10–100× (OP01-120 Shanks ~$40 / $400 /
  $4,000). Re-check them for a game whose printings are closer in price, and
  price per (product, finish) where finishes are subtypes.
- **72-hour rule** (`STALE_HOURS = 72` in `src/lib/import.ts`, `freshOffer` in
  `src/lib/data.ts`): an offer not refreshed in 72 h stops counting and shows as
  sold out. Origin: DECISIONS [A store fell off the site because one request failed](../../DECISIONS.md#L11034).
- **Currency guard**: a store whose `currency` is not its market's is skipped,
  never converted (RiftCompare's `src/lib/offer-currency.ts` rule).

**Done when.**
1. `amb.ts` (count printings with identical keys) shows only true duplicates.
2. Every rule has a real store title in `tests/match.test.ts`, with negatives
   (foreign, graded, playset, wrong name, ambiguous).
3. New stores validated with the real importer:
   `IMPORT_ONLY_STORES=$(paste -sd, new-keys.txt) TCGCSV_CACHE_DIR=.cache npx tsx scripts/import.ts`,
   then a per-store products → cards check, then a 60-offer random SQL sample
   read by eye.
4. A full import prints `Stores: N read, M offers, K failed`, and every failed
   store is explained.
5. After any matcher change, the replay (§3.13) shows >99% unchanged and every
   moved listing group makes sense.

**Pitfalls last time.**
- 401 Games (CA) "failed" every run: its collections hold 5,300–5,530 products,
  over `MAX_PAGES = 20` × 250. Fix: `MAX_PAGES = 30` and 3 handles.
- PokéBox (AU) failed on the last import; never investigated.
- Titles saying "(V.2)", "OP11P", promo/stamp words, "The Best"/PRB reprints and
  "(Non-English)" were priced as the plain print. The `ruledOut` rule moved 967
  listings to the right printing and skipped 758 (of 328,432).
- The reviewer found 9 bugs the tests missed (§3.13).
- Character aliases in parentheses ("Mr.3 (Galdino)") were parsed as printings;
  `foldNameAliases` fixed 97 printings. A short-name path for names like "Mr.3"
  (`nameWords()` is empty) was suggested and not done.
- Gundam and Dragon Ball Super Fusion World numbers have One Piece's exact
  `AA99-999` shape. Stores that sell several games need the collection-handle
  scope **and** an other-game word check.

### 3.6 Pages and cached loaders: egress (0:25–0:46)

**Goal.** Every page reads a small number of cached loaders and never Postgres
directly.

**Copy from.** Specifxx/OpCompare: `src/lib/data.ts`, `src/lib/db.ts` header,
`tests/nested-cache.test.ts`, `src/lib/browse.ts`, `selectors.ts`, `search.ts`,
`src/components/*`, `src/app/**`. The rules come from this repo's
`src/lib/db.ts` header and DECISIONS [Network transfer: the deploy cadence was the burn](../../DECISIONS.md#L4871)
and [The first egress audit found the second burn: nested caches](../../DECISIONS.md#L5042).

The egress rules as OP Compare applies them:

1. Pages and API routes read only `src/lib/data.ts` loaders (`unstable_cache`,
   tag `prices`, 6 h backstop, purged by the import's `POST /api/revalidate`).
   No `@/lib/db` import under `src/app` (tested).
2. Never wrap a loader in another `unstable_cache` or call one inside an
   `unstable_cache` callback (Next bypasses the inner cache). `unstable_cache`
   appears only in `data.ts` (tested).
3. Select only rendered columns. The catalogue is the one wide read: two
   entries (`loadCore`, `loadPrices`) stored as tuples, with derived slugs
   stored as `0`. **Keep each entry under ~1.2 MB raw** (§2.3 #2).
4. No `generateStaticParams` prewarming of database routes. Production builds
   once a day.
5. Accounts exception: `auth.ts`, `premium.ts`, `accounts.ts` and the Stripe
   routes query per user, uncached, only from account pages and `/api/*`, never
   from the root layout. Gated rows are cut in the query, never hidden with CSS.

Pages, in the order they were built: `/browse`, `/card/[slug]` (PriceBoard,
LineChart, share), `/sets`, `/sealed`, `/sealed/[slug]`, `/price-guide`,
`/movers`, `/market`, game hubs (`/colors`, `/leaders`), `/cards`,
`/cards/all`, `/tools/deal-finder`, `/tools/box-value`, `/stores`, `/watchlist`,
then about, methodology, contact, privacy, terms, sitemap, robots, OG image,
`/release-dates`.

**Re-derive.** `CoreTuple` columns, the game-hub pages (what players build decks
around: colours and Leaders in One Piece, ink in Lorcana, aspect in SWU, class
and talent in Flesh and Blood), browse facets, "box value" wording (OP Compare
says value, not EV, because pull rates are not published).

**Done when.** `npm test` passes `nested-cache`; a route sweep returns 200 (or
the expected 404) for every route; a production build succeeds with no
database; `/browse` is small gzipped (OP Compare: 36,371 B).

**Pitfalls last time.**
- Catalogue cache as objects: 3,701,119 B. Tuples: 1,502,730 B. Derived slugs:
  1,262,233 B. Then split in two. After-split sizes were never re-measured.
- `/browse` rendered the filter panel twice (phone and desktop): one copy with a
  CSS-only toggle.
- GET forms leaked `?min=&max=&per=48&sort=value`: added
  `src/components/FormCleaner.tsx`.
- The deals list overflowed on phones: `min-w-0` on grid children.
- The price guide's "dearest" tile was topped by a US$199,999 serial-numbered
  listing: it now ignores cards with no `marketUsd`.

### 3.7 SEO and the computed blog (1:03–1:09)

**Goal.** Indexable pages, a sitemap, and posts whose every number is computed.

**Copy from.** Specifxx/OpCompare: `src/app/sitemap.ts` (one urlset, ~7,800 URLs,
returns the fixed paths if the DB read fails), `robots.ts` (disallows `/api/`,
`/watchlist`, `/account`, `/login`, `/premium/welcome`), `feed.xml/route.ts`,
`src/lib/blog/**` (`types.ts`, `context.ts`, `util.ts`, `index.ts`,
`posts/*.tsx`), `/blog`, `/blog/[slug]` (Article + BreadcrumbList JSON-LD, TOC,
"short version" box), `/authors`, `/editorial-policy`, per-card and per-post
OG images. Precedent: `src/lib/pokemon/blog/`.

**Re-derive.** The game-knowledge posts (OP Compare: rarities explainer, cheapest
Leaders by colour, per-set chase review). The data posts (most expensive,
booster box prices by set, where to buy, cheaper abroad) mostly carry over.
Hedge uncertain factual claims; "a sentence that needs a fact prints only when
the fact exists".

**Done when.** Robots `Host`/`Sitemap`, sitemap `<loc>`s and canonicals are on
the right domain (§3.13 step 8), OG images return non-empty bytes, and posts
render with data.

**Pitfalls last time.**
- Satori (OG images) rejects `radial-gradient(1000px 500px at …)`: use
  `radial-gradient(circle at 50% 0%, …)`.
- Satori needs one text node per div: `{`${a} · ${b}`}`, not `{a} · {b}`.
- The dev log said `GET /opengraph-image 200` while curl got an empty reply.
  Check the bytes and grep the server log for "failed to pipe response".

### 3.8 Affiliates, with no eBay API (1:01)

**Goal.** Monetised outbound links that cost no API quota.

**Copy from.** Specifxx/OpCompare: `src/lib/affiliate.ts`,
`src/components/EbaySearchPanel.tsx`, `AffiliateAds.tsx`,
`tests/affiliate.test.ts`, `tests/no-ebay-api.test.ts`. Original:
`src/lib/affiliate.ts`; DECISIONS [Pokémon: … eBay quota strictly Riftbound's first](../../DECISIONS.md#L16335).

- EPN campaign `5339155912` (public; env `EBAY_AFFILIATE_CAMPAIGN`), per-market
  `mkrid`/`siteid`, Singapore reroutes to ebay.com.
- `customid`/`sharedid` = `<prefix>-<market>-<source>-<page>`, so revenue
  separates in the same EPN and Impact accounts.
- TCGplayer through the Impact link (`TCGPLAYER_IMPACT_LINK`).
- `tests/no-ebay-api.test.ts` fails on `api.ebay.com`, `api.sandbox.ebay.com`,
  `identity/v1/oauth2`, `buy/browse/v1` or `EBAY_CLIENT_(ID|SECRET)` in `src/`,
  `scripts/` or `.github/`.

**Re-derive.** The two-letter prefix (not `rc` or `oc`), the game keyword helper
(`onePieceEbayQuery` puts "One Piece" in a query exactly once).

**Done when.** `tests/affiliate.test.ts` pins one full customid, the SG reroute,
the single game keyword and the Impact sharedid; `no-ebay-api` passes.

**Pitfalls last time.** None in code. The owner believed an eBay-price feature
existed and asked to remove it; tell the owner explicitly what exists.

### 3.9 Analytics and search engines (0:57–1:09)

**Goal.** GA4, Search Console, Bing and IndexNow wired, each a no-op until its
value exists.

**Copy from.** Specifxx/OpCompare: `src/lib/ga.ts`, `src/components/GoogleAnalytics.tsx`
(Consent Mode v2 denied in EEA/UK/CH, `buy_click` on any `a[data-retailer]`),
verification meta tags in `src/app/layout.tsx` (`GOOGLE_SITE_VERIFICATION`,
`BING_SITE_VERIFICATION`), `scripts/gsc-report.ts` + `search-console.yml`
(submits the sitemap and writes a 28-day report to the run summary; needs Full
permission), `scripts/indexnow-submit.ts` + `indexnow.yml`,
`src/app/indexnow.txt/route.ts`. Originals: `gsc-coverage.yml`,
`indexnow-submit.yml`, `bing-coverage.yml`, `src/lib/indexnow.ts`.

**Re-derive.** Nothing game-specific. Decide on purpose: OP Compare has no
consent banner (EEA/UK/CH stay denied), where RiftCompare denies globally and
grants through a CMP.

**Done when.** Both scripts print their "not set — skipping" message with no env,
and a fake `GSC_SA_KEY` reaches JWT signing (fails with
`ERR_OSSL_UNSUPPORTED`, which proves the path runs).

**Pitfalls last time.** The owner's `GA_SA_KEY` is `GSC_SA_KEY`. GA4 needs no
key at all. `/indexnow.txt` is `force-static`, so `INDEXNOW_KEY` must be set
before the first deploy.

### 3.10 Deploy gate and workflows (0:50)

**Goal.** Production builds once a day; everything else runs on schedule and
no-ops until configured. The gate, CI and guard tests go in during the scaffold
(§3.1); this section is the reference for them and for the other workflows.

**Copy from.** `scripts/vercel-ignore-build.sh`, `vercel.json`,
`.github/workflows/production-deploy.yml` and this repo's `CLAUDE.md` rules, as
ported in Specifxx/OpCompare (with `tests/deploy-gate.test.ts`). History:
DECISIONS [deploy cadence](../../DECISIONS.md#L4871),
[The gate deployed on a commit that said it wasn't deploying](../../DECISIONS.md#L5195),
[Find the fifth burn before RM10 dies](../../DECISIONS.md#L6263).

OP Compare's schedule (UTC; GitHub cron drifts, so read each as "no earlier
than"):

| Time | Workflow | Needs |
|---|---|---|
| 07:07, 19:07 | `import-prices.yml` | secrets `DATABASE_URL`, `CRON_SECRET`; var `SITE_URL`; `permissions: contents: write` |
| 07:20 | Vercel Cron `/api/cron/stripe-reconcile` (`vercel.json`) | Vercel `CRON_SECRET`, `STRIPE_SECRET_KEY`; fails closed without the secret |
| 07:25 | `search-console.yml` | secret `GSC_SA_KEY`; vars `GSC_PROPERTY`, `SITE_URL` |
| 08:00 | `production-deploy.yml` (empty `[deploy]` commit on `main`; skips if the newest subject already has it) | `permissions: contents: write` |
| 08:10 | `indexnow.yml` | `INDEXNOW_KEY`, `SITE_URL` |
| manual | `stripe-setup.yml` | secret `STRIPE_SECRET_KEY` |
| PR, push to `main` | `ci.yml` (typecheck, lint, test; no secrets) | – |

**Re-derive.** Only the `SITE_URL` defaults and the release time if the import
time changes.

**Done when.** `tests/deploy-gate.test.ts` passes (subject marker builds, plain
skips, marker only in the body skips, preview builds); every workflow parses
(`python3 -c "import yaml,sys;[yaml.safe_load(open(f)) for f in sys.argv[1:]]" .github/workflows/*.yml`);
`bash -n scripts/vercel-ignore-build.sh`.

**Pitfalls last time.** The deploy-gate test's `spawnSync` env needed
`as unknown as NodeJS.ProcessEnv`. `vercel.json` missed the `claude/*` opt-out
(§2.3 #3).

### 3.11 Price history in GitHub (1:55–2:15)

**Goal.** Public price and index history without a history database.

**Copy from.** Specifxx/OpCompare: `src/lib/history.ts` (pure formats and maths),
`src/lib/history-store.ts`, `recordHistory` in `src/lib/import.ts`,
`scripts/publish-history.ts`, the history steps in
`.github/workflows/import-prices.yml`, `getProductHistory`/`getIndexSeries` in
`src/lib/data.ts`, `tests/history.test.ts`; DECISIONS "History lives in GitHub,
not in a history database".

Design:
- Files on an orphan `data` branch under `history/`: `days/YYYY-MM-DD.json`
  (every product that day), `products/<00–ff>.json` (256 buckets by
  `productId % 256`, each product's last 730 days as `[YYYYMMDD, marketCents,
  lowUSCents]`), `index.json` (chained, value-weighted, base 1,000, cards ≥ US$1
  on both days).
- The workflow clones `data` (or creates it with its own `vercel.json` that
  disables deployments), runs the import with `HISTORY_DIR=.data/history`,
  commits and pushes, exports `HISTORY_REF`, then `publish-history.ts` writes
  `Meta.historyRef` and revalidates. **The order matters**: never revalidate
  before the files the site will point at exist.
- Pages fetch `https://raw.githubusercontent.com/<repo>/<sha>/history/<file>`
  with a 30-day fetch cache (pinned sha). The repo must stay public.
- Postgres keeps only current prices. `tests/history.test.ts` fails if a
  `PriceDay` or `IndexDay` model appears.

RiftCompare is moving its own history to files differently: append-only day
files on `main`, published by `scripts/publish-price-history.sh` (refuses
`[deploy]`), to be bundled into each release (`src/lib/price-history-store.ts`;
only step 1 had landed at `cda650c`). Compare before choosing: OP Compare's is
fresh after every import with no deploy, but depends on GitHub's raw CDN at
runtime and rewrites all 256 buckets every import.

**Re-derive.** Nothing game-specific. Decide whether non-US markets get history
(OP Compare records TCGplayer market + US low only).

**Done when.** `tests/history.test.ts` passes; locally, with
`HISTORY_LOCAL_DIR=.data/history` and a back-dated day written by calling
`recordHistory(log, new Date(Date.UTC(y, m, d)))`, a card page draws a chart and
`/market` shows the index.

**Pitfalls last time.**
- Nothing has run against GitHub yet: `main` now exists at `d71528b`, but there is no `data` branch, so no import has run there (checked 13:15 UTC).
- "Moved this week" and Movers stay empty for 7 days after the first production
  import; charts need 2 days. There is no backfill.
- Measured locally: a day file is 133,724 bytes for 7,346 products; buckets hold
  ~24 bytes per point. Projection (arithmetic, not observed): 7,346 products ×
  730 points × 24 B ≈ 129 MB of bucket JSON at the 730-day cap (the research
  notes estimated 110–120 MB, ~440 KB per bucket; call it ~110–130 MB). Raw-CDN rate limits for server fetches were
  not verified.

### 3.12 Accounts and Premium (1:42–2:15)

**Goal.** Sign-in, Plus and Premium on Stripe, gated features, ad-free members.

**Copy from.** Specifxx/OpCompare: `src/lib/plans.ts` (the one price table;
`STRIPE_SITE`; lookup keys `<slug>_<tier>_<interval>`; `FREE_DEAL_ROWS = 3`),
`auth.ts` (HS256 JWT in an httpOnly cookie + a readable `<prefix>_auth` hint
cookie), `auth-secret.ts` (throws in production without `AUTH_SECRET`),
`oauth.ts`, `accounts.ts` (only a provider-verified email may link or create),
`next-param.ts`, `premium.ts`, `stripe.ts`, `stripe-entitlement.ts` (both
payload generations; only `active`/`trialing` entitle; extend-only; only
`site=<slug>` subscriptions), `stripe-reconcile.ts` (never matches by email),
`checkout-params.ts`, `use-me.ts`, `buy-list.ts`, `scripts/stripe-setup.ts`,
`/api/auth/**`, `/api/me`, `/api/premium/{checkout,portal}`,
`/api/stripe/webhook`, `/api/cron/stripe-reconcile`, `/api/buy-list`, the pages
`/login`, `/account`, `/premium`, `/premium/welcome`, `/tools/buy-list`, and
`tests/premium.test.ts` (13 tests). The map of RiftCompare's system that this
was ported from is in [PROMPTS.md](PROMPTS.md).

Gating as built:

| Visitor | Deal Finder rows | `/tools/buy-list` | `POST /api/buy-list` | `/account` |
|---|---|---|---|---|
| Signed out | 0 (no catalogue read; locked preview) | "Part of Premium" | 401 | 307 → `/login?next=/account` |
| Free | 3 | "Part of Premium" | 402 | 200 |
| Plus | 60, ad-free | "Part of Premium" | 402 | 200 |
| Premium | 60, ad-free | Buy List Planner | 200 | 200 |

**Re-derive.** Prices and tiers (owner's call), the Premium tool (OP Compare's is
the Buy List Planner, RiftCompare's Best Basket idea without postage), product
names in `stripe-setup.ts`, the prefix in cookies and checkout `kind`.

**Done when.** `tests/premium.test.ts` passes, and the gating table above
reproduces with curl against `next start` using minted QA sessions (§3.13 step 7).

**Pitfalls last time.**
- RiftCompare's reconcile falls back to the Stripe customer's **email**
  (`src/lib/stripe-reconcile.ts`, ~L100–125), so a shared Stripe account would
  cross-grant Premium. Separate account, plus the `site=<slug>` filter.
- RiftCompare's reconcile cron runs without `CRON_SECRET`; OP Compare's fails
  closed. Keep fail-closed.
- No $1 trial: it is only honest with trial-ending reminder emails.
- `stripe.accounts.retrieve()` needs an id in stripe v23: use
  `retrieveCurrent()`.
- Local production refuses sessions without `AUTH_SECRET`: add a random local
  one to `.env` and restart.
- Never read the session in the root layout; the header asks `/api/me` only when
  the hint cookie exists.

### 3.13 QA

**Goal.** Evidence, not confidence, that every price is the right printing and
every page works.

**The QA scripts were not preserved.** OP Compare's lived in the session
scratchpad, which is deleted; neither the build log nor PROMPTS.md holds their
source (PROMPTS.md describes the replay method in prose). Write them under
`scripts/qa/` in the new repo on day one and commit them. Each is specified
here by input, output and pass criterion (OP Compare's versions were 13–67
lines each):

| Script | Input | Output | Pass |
|---|---|---|---|
| `check-cat.ts` | cached TCGCSV `groups.json` and every group's products (`TCGCSV_CACHE_DIR`) | per group: abbreviation, `setKind`, display name, slug; counts per printing and per sealed kind, with samples | no card classified `promo` that isn't one; every sealed kind plausible |
| `amb.ts` | `Card` rows with a number, through `buildCardIndex` | number of groups of printings with identical keys + extras, 25 examples, counts per set pair | only true duplicates remain (OP: 1,569 → 147) |
| `miss.ts <storeKey> <reason>` | one store's live products (`fetchStoreProducts`) and the card index | 25 random titles that missed with that reason | every reason explained; real titles go into `tests/match.test.ts` |
| `replay.ts` | every `Offer` with `source` starting `store:` (`productId`, `title`); the catalogue | counts unchanged / moved / newly skipped, per source, 20 samples per bucket with printing and set | >99% unchanged and every moved group makes sense |
| `crawl.mjs` | `/sitemap.xml` of a running `next start` | every non-card route, 250 random cards, 60 sealed, some filter URLs, feed, robots, manifest, OG image; then up to 1,500 internal links found on them | `BAD 0` (non-200 or error text such as "Application error") |
| `interact.mjs` (Playwright) | a running server | 10 checks: typeahead, enter → `/browse?q=`, market switch re-renders currency, theme persists, watchlist, filters submit, sort keeps filters, phone menu opens and navigates, phone filter toggle | all 10 pass |
| `overflow.mjs` (Playwright, 375 px) | ~18 key routes | `body.scrollWidth` vs viewport width and the first 3 offending elements | no page wider than the viewport |
| `qa-users.ts` | the local DB and the local `AUTH_SECRET` | upserts `qa-free`, `qa-plus`, `qa-premium` users and signs an HS256 JWT for each with `jose`, written to a scratch file **outside the repo** | gating table (§3.12) reproduces per tier |

This is the order:

1. **Unit tests from day one**: `deploy-gate`, `nested-cache`, `theme`,
   `domain`, `no-<forbidden API>`, then `catalog` and `match` with real titles.
   OP Compare went 38 → 42 → 45 → 65 tests.
2. **Catalogue and matcher audits**: `check-cat.ts` (every group), `amb.ts`
   (identical-key groups: 1,569 → 147), `miss.ts` (25 sample titles for one
   store and miss reason), SQL price/market ratio per store (Danireon averaged
   5.54× market, which exposed sealed false positives).
3. **Imports at scale** in the background. Read the `Stores: N read, M offers,
   K failed` line; explain every failure.
4. **Replay after every matcher change.** Re-run the current matcher over every
   stored title and compare with the saved `productId` (`npx tsx scripts/qa/replay.ts`). Final One Piece run: 328,432 titles,
   326,707 unchanged, 967 moved, 758 newly skipped. Turn every surprising move
   into a real-title test.
5. **Independent review agent**, read-only, in the background, with the local DB,
   a running server and permission to replay. Ask for ranked findings with
   failure scenarios, file:line and fixes, and the areas that were clean. OP
   Compare's reviewer replayed 188,727 offers and found 9 bugs (prompt in
   [PROMPTS.md](PROMPTS.md)). Reproduce each as a failing test before fixing.
   Freeze the reviewed files or tell the reviewer to re-check HEAD, because the
   main session kept editing `match.ts` during the review.
6. **On a production server** (`npx next start`, started as its own background
   call): route sweep with curl; `crawl.mjs` over every sitemap route and 1,500
   sampled internal links (OP Compare: BAD 0 twice); Playwright `interact.mjs`
   (10 checks: typeahead, enter → browse, market switch re-renders currency,
   theme persists, watchlist, filters, sort keeps filters, phone menu opens and
   navigates, phone filter toggle); `overflow.mjs` at 375 px (body must not
   scroll sideways); screenshots at 1440 and 390, both themes, read with the
   Read tool and compared with the parent's.
7. **Accounts**: mint QA users (free, Plus, Premium) with Prisma and sign JWTs
   with `jose` exactly as the app does; send `<prefix>_session` and
   `<prefix>_auth`; curl every gated surface per tier. Never commit tokens:
   `git diff --cached --name-only | grep -iE "\.env$|qa-|token|\.data/"` must be
   empty.
8. **Domain and SEO**: build with `env -u NEXT_PUBLIC_SITE_URL npx next build`,
   then check robots `Host` and `Sitemap`, sitemap `<loc>`, canonical, and
   `curl -H "Host: www.<domain>" localhost:3000/x?y=1` → 308 to the apex with
   path and query kept.
9. **Before every commit**: `npm run typecheck && npm run lint && npm test`.

**Pitfalls last time (sandbox).**
- Playwright: external images fail without the proxy; localhost returns 405
  through it, even with a loopback bypass. Browse the container's own IP
  (`hostname -I`, it was `192.0.2.2`) with
  `proxy: { server: process.env.HTTPS_PROXY, bypass: '<that IP>' }`,
  `--ignore-certificate-errors`, `ignoreHTTPSErrors: true`. Cookies then use that
  IP as their domain.
- Screenshots with a relative path landed inside the repo. Use absolute
  scratchpad paths.
- React inserts `<!-- -->` between adjacent text expressions, so
  `grep 'Save [0-9]*%'` counts 0 rows. Grep `'Save <!-- -->[0-9]*'` or use the DOM.
- A scratch script outside the repo can't resolve `node_modules`
  (`Cannot find module 'jose'`): copy it into the repo root as a dot-file, run,
  delete.
- `/_vercel/insights/script.js` 404s off Vercel; filter it from console checks.
- Prisma reads `.env` itself, so `env -u DATABASE_URL` does not simulate "no
  database". Rename `.env` for that test.
- `next start` serves the last build: rebuild before checking SEO output.
- Background servers die at the 30-minute background limit; restart for final QA.

**Running the session** (lessons from how the OP Compare session itself ran):
- **End turns at milestones.** The whole build ran as one turn (08:29–10:48),
  so owner messages waited in the queue: U12 was typed at 10:29:11 and seen at
  10:48:22, 19 minutes later. Stop after each committed stage, or check for
  queued messages, so corrections land before more work is built on the old
  plan.
- **Expect compaction.** Auto-compaction at 09:51 (783,396 → 17,776 tokens)
  dropped early context; the owner's domain message arrived just before it.
  This is another reason for the build log (§1 Q17): write decisions down
  where compaction can't remove them.
- **Usage limits.** The owner hit a usage limit at about 11:36 and work resumed
  at 12:21; background workflows resumed from their cache. Leave each stage
  committed or clearly uncommitted so a stop at any point is recoverable.
- **One writer per repo.** Two background workflows must not edit the same
  repo at once: the eBay work was deliberately queued behind the admin and
  thumbnails work. Build once, then give each verifier its own `next start`
  port (3101–3107 last time), never 3000; don't run two `next build`s in one
  tree, since they write the same `.next`.
- **The Stop hook asks to commit and push untracked work.** Don't push
  unverified code to satisfy it: at 12:36:47 the session declined, because the
  admin code had not been security-checked yet. Say why in the reply.
- **Monitor expires** after 5 minutes with no events (10:06:23 and 10:21:43,
  during long imports). Re-arm it, or read the import log directly.

### 3.14 Docs (0:51–0:53, then each commit)

**Goal.** A future session can work in the repo without this session's memory,
and the owner can go live without touching a terminal.

**Copy from.** Specifxx/OpCompare: `README.md` (pages, sources, gate, egress,
local dev, adding a store, "not ported yet"), `CLAUDE.md` (deploy gate, never
call the eBay API, egress and the accounts exception, history in GitHub, Stripe
rules, matching rules, checks), `DECISIONS.md` (16 entries; copy the "port, not
fork", "no eBay API", "history in GitHub" and "Plus & Premium" entries as
precedent), `docs/SETUP.md` (go-live in order with what reuses RiftCompare
values), `docs/CHROME-SETUP-PROMPT.md`, `.env.example`.

**Re-derive.** All names; DECISIONS entries for the new game's catalogue and
matcher rules.

**Done when.** `tests/domain.test.ts` also scans `SETUP.md` and the Chrome prompt
for wrong hosts; every env var the code reads appears in `.env.example` and
`SETUP.md` (§2.3 #8 lists what OP Compare missed).

**Pitfalls last time.** `Write` refused `docs/SETUP.md` ("modified since read")
after earlier `sed` edits: Read again, then Write. SETUP and the Chrome prompt
disagreed on the `AUTH_SECRET` format and on the GA4 `buy_click` key event;
generate one from the other or check both.

### 3.15 Go-live via Claude in Chrome (owner, after hand-over)

**Goal.** The owner pastes one prompt into Claude in Chrome and the site goes
live.

**Copy from.** Specifxx/OpCompare: `docs/CHROME-SETUP-PROMPT.md` (12 sections: 11 steps and a report). A
generic template with placeholders (`{SITE_NAME}`, `{DOMAIN}`, `{REPO}`,
`{BRANCH}`, `{SLUG}`, `{SHORT_PREFIX}`, `{RIFT_REPO}`, `{SISTER_SITES}`,
`{DESCRIPTOR}`, `{BRAND_COLOR}`, `{PRICES}`, …) is in [PROMPTS.md](PROMPTS.md).

What the prompt does, in order: Neon project → GitHub (create `main` from the
build branch, set it default, Actions **Read and write**, secrets, variables) →
Vercel project in the same team, env vars, domain, `www` → apex → Google OAuth
client → Discord app (optional) → a **new Stripe account** under the same login,
`Stripe setup` workflow, webhook → first import → first production deploy → GA4
property and Search Console Domain property (DNS TXT, add the service account
as Full) → Bing import from GSC → turn on the search workflows → affiliate
housekeeping (optional; asks before submitting the Impact/EPN forms) → report.
The generic template also has an optional §11b for an own eBay keyset (§3.17).

Ground rules it carries: every existing sister site is read-only; no money spent
and no guesses; ask before deleting any DNS record; secrets go only into their
fields; track and report every step.

**Owner stop points.** The prompt stops and waits for the owner at:
- which addresses go in `ADMIN_EMAILS` (and, with the in-flight admin port,
  that setting it replaces the built-in default list);
- Stripe account activation (identity, bank, tax);
- deleting any DNS record;
- whether to run the `OWNERTEST` payment test;
- whether to submit the Impact and EPN forms.

**Done when.** The prompt's report lists every step done; `https://<domain>/`
serves the site; `/indexnow.txt` serves the key; the *Import prices* run pushed
`data`; the webhook shows a successful test delivery.

**After go-live, the owner:**
- marks the GA4 `buy_click` event as a key event once it appears (it appears
  only after real clicks; it is in OP Compare's `docs/SETUP.md` §4 but not in
  the Chrome prompt);
- checks the Search Console verification and the first *Search Console*
  workflow summary;
- checks the homepage link preview (paste the URL into a Discord or Reddit
  draft) before posting anywhere.

**Pitfalls (expected).**
- Every Vercel env change needs a new production deployment: run
  *Production deploy* (a plain push will not build production).
- `.app` domains load only once Vercel has issued the certificate.
- The prompt has never been run end to end; its UI paths were not checked
  against current UIs.
- After `main` exists, anything pushed to the build branch must be merged into
  `main` to ride a release.
- If `main` is ever branch-protected, *Production deploy*'s
  `git push origin HEAD:main` fails. Allow the Actions bot to push, or leave
  `main` unprotected.

### 3.16 Launch post (owner's call)

**Goal.** One honest post in the game's communities.

What worked for OP Compare (post text and research in [PROMPTS.md](PROMPTS.md)
and the build log):
- Write it **last**, so its numbers match the final site.
- Lead with the price guide; state concrete numbers (235 shops, over 7,000
  printings, twice a day); say what is skipped and why ("we'd rather show fewer
  prices than wrong ones"); state known gaps (Singapore, no shipping); ask for
  specific feedback (wrong printing, missing local shop).
- Voice is the owner's: the first draft ("I made…") was rewritten to "We just
  launched…", with RiftCompare as the MVP.
- Check a "no hyphens" rule with a script that fails closed. The first check,
  `grep -P … || echo "no hyphens"`, printed the pass message for a grep error.
  Use the Python check in [PROMPTS.md](PROMPTS.md) (exits 1 on any Unicode
  dash). A hyphenated URL such as `/price-guide` also fails it; decide whether
  URLs are exempt.
- OP Compare's targets were r/OnePieceTCG and r/OnePieceTCGFinance. The
  "124k members" for r/OnePieceTCG came from a search tool's summary of a
  GummySearch page and was never checked on Reddit.
- Read each subreddit's self-promotion rules before posting (not done last
  time). Post **at least 7 days after the first production import**, or drop
  "moved this week" from the text.
- Put the Chrome prompt, the env tables and the post in one private Launch Kit
  artifact, generated by a script from the repo's files. Last time the prompt
  and post came from files, but the env tables were hand-typed Python lists
  repeating `docs/SETUP.md`, the one part that could drift. Generate the tables
  from `docs/SETUP.md` (or one source file) instead.

### 3.17 After the hand-over: admin, link previews, own eBay keyset (2:36–2:48)

Three more owner requests arrived after the hand-over. None is in `d71528b`.
At the time of writing the admin and share-image work sat **uncommitted and
unreviewed** in `/home/user/OpCompare`, and the eBay integration existed only
as a port spec in the (ephemeral) session scratchpad. This section records what
was asked and decided, so the next site plans for them in §1 (Q9, Q18, Q19).
Verify every name below against whatever actually lands in Specifxx/OpCompare.

**Admin parity (U14, 11:06:46).** "Admin features should also be the same",
with the owner's address as admin.
- Source: this repo's `src/app/admin/`, `src/app/api/admin/`,
  `src/lib/admin-emails.ts` and what they call (store health, the inbox audit,
  accounts, grant/revoke Premium, subscriptions, reconcile).
- Each admin query sits in an uncached `src/lib/admin*.ts` module, because
  pages may not import `@/lib/db` (OP Compare `CLAUDE.md`, "Egress").
- The admin list: a built-in `DEFAULT_ADMIN_EMAILS` that `ADMIN_EMAILS`
  **replaces** when set (an empty value removes every address-based admin;
  `User.isAdmin` still works). SETUP and the Chrome prompt must say to include
  the default address. Admins count as Premium.
- Check: a security verifier requests every `/admin` page and `/api/admin`
  route as anonymous, free, Plus, Premium and admin, and only admin succeeds;
  `/admin` is noindex, disallowed in robots and absent from the sitemap.

**Link previews (U15, 11:07:23).** "Website link thumbnails must also be very
good featuring the website and mainly the price guide".
- Share images put the price guide first, with real cards and prices, for the
  homepage, `/price-guide`, sets and sealed (`opengraph-image.tsx` routes).
- Check: render each image, look at it with the Read tool at full size and
  downscaled to 600×315 (Reddit and Discord shrink and crop thumbnails), with
  brand fonts actually loaded; check the `og:` and `twitter:` meta tags against
  what Reddit, Discord and X expect. The Satori pitfalls in §3.7 apply.

**Own eBay keyset (U16, 11:16:50).** "a new eBay API for opcompare so when that
variable is set we have a new 5000 API quota which we can split by region and
allocate based on card price like riftcompare". The session's answer at
11:18:01:

| Where | Name | Value |
|---|---|---|
| GitHub secret (never Vercel) | `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET` | App ID and Cert ID of a **new** Production keyset made for the new site. Never RiftCompare's: it would silently spend RiftCompare's 5,000 calls |
| GitHub variable (optional) | `EBAY_QUOTA_RESERVE` | calls left unspent each day (RiftCompare's default 600) |
| GitHub variable (optional) | `EBAY_MAX_CALLS` | per-run budget when the live quota can't be read (default 2200) |
| GitHub variable (optional) | `EBAY_MIN_VALUE_CENTS` | value floor for searching a card (500 as told to the owner; the later reviewed spec proposed 2000) |
| Vercel, Production | `EBAY_VERIFICATION_TOKEN` | a new random 32–80 character string, also typed into eBay's portal |
| Vercel, Production | `EBAY_DELETION_ENDPOINT` | `https://{DOMAIN}/api/ebay/marketplace-deletion`, apex, exact (a `www` redirect breaks eBay's challenge) |

- **Order (eBay's rule):** eBay issues Production keys only after the
  marketplace-account-deletion endpoint answers its challenge. So: set the two
  Vercel values and run *Production deploy* → in eBay's developer portal
  (Alerts & Notifications → Marketplace account deletion) register the endpoint
  and token and send a test notification → copy the Production App ID and Cert
  ID into the GitHub secrets. PROMPTS.md prompt 5 §11b has this as a Chrome
  step.
- **Default off:** nothing calls eBay until both client secrets are set; the
  runner logs "not configured" and exits 0 (green, unlike RiftCompare's auction
  runner, which exits 1).
- **It reverses the "no eBay API" rule.** Change `tests/no-ebay-api.test.ts`
  (allow the names only in the eBay client files and the eBay workflow),
  `CLAUDE.md` and DECISIONS **in the same commit**.
- Source: this repo's `src/lib/ebay.ts` (client, quota, `EBAY_QUOTA_RESERVE`),
  `src/lib/price-import.ts` (`EBAY_MIN_VALUE_CENTS`, market allocation),
  `src/app/api/ebay/marketplace-deletion/`, and DECISIONS
  [Pokémon: … eBay quota strictly Riftbound's first](../../DECISIONS.md#L16335).
  Parse numeric variables so that an empty value means unset: RiftCompare's
  `Number(process.env.X ?? 600)` turns an empty GitHub variable into 0.

### 3.18 Operating the site after launch

Condensed from OP Compare's setup (`docs/SETUP.md`) and the research notes;
`{SLUG}` is the site key.

**Add a store.** Probe it (`npx tsx scripts/probe-stores.ts <url> <MARKET>`,
read-only; it ignores configured handles, §2.3 #10) → qualify it (§3.5.2) → add
`{ key, name, base, country, collections }` to `src/lib/stores.ts` (`currency`
only if it differs from the market's) → test with
`IMPORT_ONLY_STORES=<key>` locally, or *Import prices* → Run workflow with
`only_stores` (that run writes to **production**) → read the per-store line and
spot-check matches → land on `main`; `/stores` lists it after the next release.
**Remove a store:** delete its entry; the aggregate step deletes its offers.
A store that keeps failing keeps its old rows, which stop counting after 72 h.

**Change a price.** Prices live only in `PLAN_CENTS` (`src/lib/plans.ts`).
Edit it and land it on `main` → run *Production deploy* → run *Stripe setup*
straight away. `scripts/stripe-setup.ts` creates a new Price with lookup key
`{SLUG}_<tier>_<interval>` and `transfer_lookup_key: true`, so the key moves to
it; old Prices stay active and existing subscribers keep their price. Checkout
caches the lookup for 10 minutes per instance (`priceIdFor` in
`src/lib/stripe.ts`), so the page and the charge can disagree between the
release and the setup run: keep that window short. Prices are the owner's call.

**Other routine actions.**

| Need | Do |
|---|---|
| Deploy now, or apply a changed Vercel env var | *Production deploy* → Run workflow. `[deploy]` in a commit subject only when the owner says it is urgent |
| Refresh prices now | *Import prices* → Run workflow (untick `stores` for a ~30 s catalogue-only run) |
| Schema change | `prisma db push` runs inside every import without `--accept-data-loss`, so a destructive change **fails** there instead of dropping data. Plan the migration by hand |
| Re-submit to search engines | Run *Search Console* or *IndexNow submit* |

**What to watch.**

| What | Where |
|---|---|
| Neon storage (0.5 GB free; OP Compare measured 245 MB locally, §3.4) | Neon console |
| Neon transfer (5 GB/month) | Neon console → Monitoring, by hand, unless `egress-audit.yml` is ported (§2.3 #13) |
| `data` branch size | `gh api repos/<owner>/<repo> --jq .size` (KB), monthly |
| Failed and stale stores | the import log's `Stores: N read, M offers, K failed` line |
| Billing | Stripe → Webhooks for delivery failures; unmatched subscriptions appear only as a `console.warn` in Vercel logs (`[reconcile] subscriptions with no … user`), with no email |
| Repo visibility | must stay public, or charts break (§3.11) |
| The deploy gate | no `[deploy]` in commit subjects except urgent releases |

---

## 4. Game-variation checklist and TCGCSV findings

Researched 2026-10-03 by running OP Compare's own functions over one recent set
from each of 12 other games (43 TCGCSV requests, all HTTP 200). Paths are
Specifxx/OpCompare paths.

### 4.1 Answer these for the new game before writing `catalog.ts` and `match.ts`

| # | Question | Where One Piece answers it | What other games showed |
|---|---|---|---|
| 1 | TCGCSV category id? English only? | `src/lib/catalog.ts` `TCGCSV_CATEGORY = 68` | Pokémon English is 3, Japan 85. RiftCompare reads Riftbound from TCGplayer's search API, not TCGCSV |
| 2 | `extendedData` field names; which stats deserve columns and filters? | `parseCard` reads `Number, Rarity, CardType, Color, Cost, Power, Counterplus, Life, Attribute, Subtypes, Description` | Only `Number` and `Rarity` are common to all 13. "Card type" is `CardType`, `Card Type` or `SubType` |
| 3 | Is "no Number and no Rarity" a correct sealed test? | `isSealedProduct` | Pokémon Code Cards have a Rarity and no Number; Lorcana puzzle inserts have Rarity "None": both would import as singles |
| 4 | TCGplayer's `Number` format, and how **stores** write it | `cardNumbersIn`: `(OP|ST|EB|PRB)\d{2}-\d{3}`, `P-\d{3}` | "001/084", "BT26-001 C", "CORI-EN001", "NIK/S135-E001SEC", "UE23BT/IYS-1-001", "IAR001", plain "32". How stores write them was **not checked** for any other game |
| 5 | Is the number unique per printing? | Shared: 2,239 of 2,877 numbers have more than one printing (up to 17) | Unique in SWU, Weiss Schwarz, Magic, Pokémon; shared in Digimon, DBS Fusion World, Gundam, Union Arena, Yu-Gi-Oh!, FaB |
| 6 | Does a collector number contain `/`, `*`, `+` or `//`? | No | Pokémon, Lorcana, Riftbound, SWU titles all trip `NOT_A_RAW_SINGLE`'s `\d{1,4}\/\d{2,4}` serial clause. `*` and `+` defeat `\b` |
| 7 | Does the number shape collide with another game in the same store? | – | Gundam `ST07-009`, Digimon `ST24-…`, DBS Fusion World `FB10-001` all match One Piece's shape |
| 8 | Set code families and kinds; are abbreviations unique? | `setKind`: booster, extra, premium, starter, promo, event, collection | Not unique in Digimon, FaB, SWU, Pokémon (9 dupes), Yu-Gi-Oh! (25). Some groups have none. OP's `setKind` returns "collection" for FB10, GD05, BT-26 |
| 9 | How are event/stamp reprints grouped and coded? | `eventTag`: ` PRE`, ` RE`, ` ANN` suffixes | Digimon BT-26 (same as main set), BT27_RE, BT-25_PR; DBS FB10_PR (means release event, not promo); FaB IAR (same as main). OP's `eventTag` returns null for all; read the group **name** |
| 10 | Is `publishedOn` a release date? | Yes for all 87 groups | Pokémon 19, Magic 38, Yu-Gi-Oh! 18 old groups carry 2026-10-02 |
| 11 | Every finish and art variant, its price tier, and the phrase stores use | `classifyPrinting`, `KEY_PATTERNS` | OP rules label as promo: SWU 678/957, FaB 171/286, Weiss 162/318, Magic 138/334, Gundam 65/197. "SP" means something different in each game |
| 12 | Separate products or price subtypes for finishes? | Separate products (0 of 186 OP17 products have two subtypes) | Subtypes in Magic (289/356), Lorcana (201/270), FaB (207/287), Riftbound (99/258), Pokémon (74/147): breaks `pickPrice` and the plausibility band |
| 13 | Which distribution/event words rule a printing out? | `PRINTING_WORDS`, `ruledOut` | "Weekly Play", "Nexus Night", "Store Championship", "Judge", "Box Topper", "Prerelease Kit", "Costco Exclusive", "Serial Numbered" |
| 14 | Which parenthesised tokens are part of the name? | `foldNameAliases` (97 printings) | Gundam forms "(Oowashi)", FaB pitch "(Red)/(Yellow)/(Blue)" (different numbers), Magic "(0194)", DBS "(Great Ape)" |
| 15 | Singles with no number? Worth pricing? | 240 DON!! cards, name path only | Pokémon Code Cards, Riftbound runes/tokens, Gundam tokens and EX Resource, Magic tokens, Yu-Gi-Oh! token packs, SWU tokens, Union Arena AP cards |
| 16 | Full rarity list, order, labels; does a rarity imply a printing? | `RARITIES`: L C UC R SR SEC TR PR DON!! | Most use full words; Magic `L` = basic Land; in Yu-Gi-Oh! the rarity **is** the printing; Weiss puts the parallel rarity in the number |
| 17 | What do players build decks around (the game hubs)? | Colours and Leaders | Lorcana InkType; FaB Class/Talent; SWU Aspect; Digimon Color; Riftbound Domain |
| 18 | Sealed lineup, regional names, certain pack counts | `SEALED_KINDS` (16), 24 packs per main booster box | OP rules fall to "Collection" for most Pokémon, SWU, Magic, Riftbound sealed; "Booster Display" not a box. Pack counts are in TCGplayer text for Pokémon (36), FaB (24), Digimon (24). Precedent: `src/lib/pokemon/packs.ts` |
| 19 | Languages, graders, serial-numbered prints | `FOREIGN_LANG`, `NOT_A_RAW_SINGLE` | Yu-Gi-Oh! "Asian English" counts as foreign under OP rules: decide on purpose |
| 20 | Are plausibility bands wide enough apart? | 30% / 4× + $5 works because printings differ 10–100× | Where finish is a subtype the band compares against the wrong finish (FaB "Hex Gauntlet" Normal $0.27 vs Cold Foil $5.22) |
| 21 | Slug format, before the first import | name + number + variant | "003/084" → "003-084"; Magic's bare "32" needs the set code |
| 22 | Does " - " separate a subtitle (keep) or a disambiguator (strip)? | `baseName` strips it; 0 of 179 OP17 names contain it | Lorcana 205/261, SWU 450/957 are subtitles (stripping destroys the name); Pokémon and DBS are number suffixes (stripping is right) |
| 23 | Collection-handle stem and eBay keyword | `/one-?piece/`, "One Piece" | "lorcana", "star-wars-unlimited"/"swu", "flesh-and-blood"/"fab", "digimon", "gundam", "union-arena" |

**Worked example: Lorcana's answers** (derived from one set, group 24666
"Attack of the Vine!", and the 21 groups of category 71, 2026-10-03; confirm
each with `check-cat.ts` over every group):

- **Q3 sealed test.** The 9 sealed products have no `Number` and no `Rarity`,
  but the 10 puzzle inserts have `Rarity` "None" and no `Number`, so
  `isSealedProduct` would import them as singles. Treat Rarity "None" with no
  `Number` as not a card (skip it, or file it as a sealed insert).
- **Q8 set kinds.** Abbreviations are `1`–`15` (main sets), `Q1`–`Q3`
  (Illumineer's Quest) and `D23`, `D100`, `DLPC` (promos). So `/^\d+$/` = main
  set, `/^Q\d/` = Illumineer's Quest, `D23|D100|DLPC` = promo.
- **Q21 slug.** `Number` is "21/207": use name-version-`<set>`-`<num>` with the
  denominator dropped ("21/207" → "21").
- **Q22 " - ".** 206 of 270 product names contain it, and it is the subtitle
  (TCGplayer's `Character Version` field holds it): keep it. OP Compare's
  `baseName` strips it, which would destroy those names.
- **Q12 finishes.** Price subtypes; see §3.4.1.

Start `tests/match.test.ts` with the most expensive number that has several
printings (OP Compare started with OP01-120 Shanks: standard, Parallel, Manga,
PRB-01 alt), copy 5–10 real store titles for each, and pin one event stamp and
one reprint. The fixture pattern is in Specifxx/OpCompare: `tests/match.test.ts`
(`id(t)` returns the matched id or the miss reason) and `tests/catalog.test.ts`
(a `card(name, ext, id, groupId)` builder).

### 4.2 Candidate games at a glance

| Game (category) | Groups | Sampled set (products / singles / sealed) | Number examples | Shared numbers? | Finish as price subtype? | Biggest breaks under OP Compare's rules |
|---|---:|---|---|---|---|---|
| One Piece (68), baseline | 87 | OP17 (186 / 179 / 7) | OP17-001, EB04-007, P-084 | yes, 32 of 130 | no | Pandaman Art → promo |
| Pokémon (3) | 220 | ME05 Pitch Black (148 / 125 / 23) | 001/084, 120/084 | no | **yes** (74/147) | slash numbers, Code Cards, bad `publishedOn`; RiftCompare already has a Pokémon sealed catalogue on this category |
| Disney Lorcana (71) | 21 | Attack of the Vine! (270 / 261 / 9) | 1/207, 212/207 | 6 of 245 | **yes** (201/270) | slash numbers, " - " subtitles, set code "13", both foil models in one set |
| Digimon (63) | 103 | BT-26 (140 / 136 / 4) | BT26-001 C, BT26-050 SP | yes, 26/105 | no | rarity suffix in number, event group shares code, `setKind` |
| Dragon Ball Super Fusion World (80) | 54 | FB10 (170 / 163 / 7) | FB10-001 | yes, 37/122 | no | number shape identical to One Piece, "_PR" = release event. **Closest to One Piece's model** (Bandai, Leader rarity, AA tokens on shared numbers) |
| Gundam (86) | 28 | GD05 (202 / 197 / 5) | GD05-001, EXR-004, T-026, ST07-009 | yes, 44/148 | no | `+` rarities, `ST` collision, 65 promo |
| Union Arena (81) | 82 | UE23BT (133 / 128 / 5) | UE23BT/IYS-1-001 | yes, 29/92 | 2 of 130 | `/` and series code in number, `*` parallels, 48 promo |
| Star Wars Unlimited (79) | 34 | ASH (969 / 957 / 12) | 59/264, 323, 913 | no | no | every variant its own number, 678 promo, "Booster Display", " - " subtitles, 969 products in one set |
| Flesh and Blood (62) | 105 | IAR (289 / 286 / 3) | IAR001, IAR017 | yes, 25/261 | **yes** (207/287) | pitch colours as promo, finish subtype, 45 groups without a code |
| Magic (1) | 454 | HOB (356 / 334 / 22) | 32, 2 // 4 | no | **yes** (289/356) | titles rarely carry numbers, `L` = Land, largest catalogue |
| Yu-Gi-Oh! (2) | 658 | CORI (138 / 136 / 2) | CORI-EN001 | yes, 25/106 | edition as subtype | rarity is the printing, " - " names, 25 duplicate codes |
| Weiss Schwarz (20) | 176 | NIK/ (321 / 318 / 3) | NIK/S135-E001SEC | no | no | `/` in code and number, 162 promo |
| Riftbound (89) | 13 | VEN (258 / 246 / 12) | 001/166, 021a/166, 190*/166 | 1 of 245 | **yes** (99/258) | slash numbers; RiftCompare already prices it |

### 4.3 All TCGCSV categories (2026-10-03)

`GET https://tcgcsv.com/tcgplayer/categories`: 94 categories. `popularity` is 0
for every category from 54 up, so it cannot rank the newer games.

| id | name | id | name | id | name |
|---:|---|---:|---|---:|---|
| 1 | Magic | 33 | Card Storage Tins | 65 | Gate Ruler |
| 2 | YuGiOh | 34 | Life Counters | 66 | MetaZoo |
| 3 | Pokemon | 35 | Playmats | 67 | WIXOSS |
| 4 | Axis & Allies | 36 | Zombie World Order TCG | 68 | One Piece Card Game |
| 5 | Boardgames | 37 | The Caster Chronicles | 69 | Marvel Comics |
| 6 | D & D Miniatures | 38 | My Little Pony CCG | 70 | DC Comics |
| 7 | Epic | 39 | Warhammer Books | 71 | Lorcana TCG |
| 8 | Heroclix | 40 | Warhammer Big Box Games | 72 | Battle Spirits Saga |
| 9 | Monsterpocalypse | 41 | Warhammer Box Sets | 73 | Shadowverse Evolve |
| 10 | Redakai | 42 | Warhammer Clampacks | 74 | Grand Archive |
| 11 | Star Wars Miniatures | 43 | Citadel Paints | 75 | Akora |
| 12 | World of Warcraft Miniatures | 44 | Citadel Tools | 76 | Kryptik TCG |
| 13 | WoW | 45 | Warhammer Game Accessories | 77 | Sorcery Contested Realm |
| 14 | Supplies | 46 | Books | 78 | Alpha Clash |
| 15 | Organizers & Stores | 47 | Exodus TCG | 79 | Star Wars Unlimited |
| 16 | Cardfight Vanguard | 48 | Lightseekers TCG | 80 | Dragon Ball Super Fusion World |
| 17 | Force of Will | 49 | Protective Pages | 81 | Union Arena |
| 18 | Dice Masters | 50 | Storage Albums | 82 | TCGplayer Supplies |
| 19 | Future Card BuddyFight | 51 | Collectible Storage | 83 | Elestrals |
| 20 | Weiss Schwarz | 52 | Supply Bundles | 84 | Neopets Battledome |
| 21 | My Little Pony | 53 | Munchkin CCG | 85 | Pokemon Japan |
| 22 | TCGplayer | 54 | Warhammer Age of Sigmar Champions TCG | 86 | Gundam Card Game |
| 23 | Dragon Ball Z TCG | 55 | Architect TCG | 87 | hololive OFFICIAL CARD GAME |
| 24 | Final Fantasy TCG | 56 | Bulk Lots | 88 | Godzilla Card Game |
| 25 | UniVersus | 57 | Transformers TCG | 89 | Riftbound League of Legends Trading Card Game |
| 26 | Star Wars Destiny | 58 | Bakugan TCG | 90 | CookieRun Braverse TCG |
| 27 | Dragon Ball Super CCG | 59 | KeyForge | 91 | Palworld OFFICIAL CARD GAME |
| 28 | Dragoborne | 60 | Chrono Clash System | 92 | Cyberpunk TCG |
| 29 | Funko | 61 | Argent Saga TCG | 93 | Naruto Card Game |
| 30 | MetaX TCG | 62 | Flesh & Blood TCG | 94 | Rush of Ikorr |
| 31 | Card Sleeves | 63 | Digimon Card Game | | |
| 32 | Deck Boxes | 64 | Alternate Souls | | |

Not verified for other games: how stores write card numbers, pack counts where
TCGplayer's text doesn't state them, and whether older sets name variants the
same way as the one sampled set.

---

## 5. Credentials: reuse vs new

Rule: anything that **holds state, has an identity users see, or moves money is
new**. Only public identifiers and one per-property service identity are
reused. `{SLUG}` is the lower-case site key, `{PREFIX}` the two-letter prefix,
`{DOMAIN}` the apex domain.

| Where | Name | New / reuse | OP Compare's value (public ones only) | Why |
|---|---|---|---|---|
| GitHub setting | Actions → Workflow permissions = Read and write | – | – | The import pushes `data`; the release pushes `main`. Whether the YAML `permissions` block alone suffices was not tested |
| GitHub setting | default branch `main`, created from the build branch | – | – | CI, release and Vercel production key off `main` |
| GitHub secret + Vercel | `DATABASE_URL` | **New** Neon project, pooled string | – | Transfer and storage are per project; RiftCompare's run out |
| GitHub secret + Vercel | `CRON_SECRET` | **New**, same value in both | – | Authenticates cache purges and the reconcile cron |
| Vercel | `AUTH_SECRET` | **New, never RiftCompare's** | – | Signs session JWTs; throws in production if missing |
| Vercel | `NEXT_PUBLIC_SITE_URL`; GitHub var `SITE_URL` | New | `https://opcompare.app` | Also the code default, pinned by `tests/domain.test.ts` |
| Vercel | `GOOGLE_CLIENT_ID/SECRET` | **New client** | – | The consent screen shows the app name |
| Vercel | `DISCORD_CLIENT_ID/SECRET` | New app (optional) | – | Same reason |
| Vercel | `ADMIN_EMAILS` | Owner's choice | – | Treated as Premium. If the code has a built-in default admin list (OP Compare's in-flight admin port does), setting this **replaces** it: include the default address (§3.17) |
| Vercel + GitHub secret | `STRIPE_SECRET_KEY` | **New Stripe account** (same login, account switcher) | – | RiftCompare's reconcile matches by email; also own descriptor and payouts |
| Vercel | `STRIPE_WEBHOOK_SECRET` | New | endpoint `https://{DOMAIN}/api/stripe/webhook` | |
| Vercel | `NEXT_PUBLIC_GA_ID` | **New property**, same GA account | – | Keeps traffic separate |
| GitHub secret | `GSC_SA_KEY` | **Reuse the service account, new JSON key** | – | Access is granted per property; GitHub secrets can't be read back. Ask the owner (or the Chrome prompt) to open RiftCompare's Search Console property → Settings → Users and look for a `*.iam.gserviceaccount.com` user. If one exists, create a new JSON key for it; if not, follow `docs/OWNER-CHECKLIST.md` §3 to create one. Don't decide from the docs: this repo's DECISIONS L8136 and OWNER-CHECKLIST §3 disagree |
| GitHub var | `GSC_PROPERTY` | New | `sc-domain:opcompare.app` | Domain property, DNS TXT |
| Vercel + GitHub var | `INDEXNOW_KEY` | **Reuse** | `43ac93dd97a44d4894bedf52d621c57c` | Verified per host; public by design. Read at build time |
| Vercel | `EBAY_AFFILIATE_CAMPAIGN` | **Reuse** (code default) | `5339155912` | Public; revenue separated by the `{PREFIX}-` sub-id |
| Vercel | `TCGPLAYER_IMPACT_LINK` | **Reuse** (code default) | (link base in `src/lib/affiliate.ts`) | Same; add the domain as an Impact property |
| Vercel | `NEXT_PUBLIC_USD_TO_*` | Reuse if set on RiftCompare | defaults AUD 1.5, GBP 0.79, SGD 1.35, CAD 1.37, EUR 0.92 | Public numbers |
| Vercel | `NEXT_PUBLIC_CONTACT_EMAIL` | New | – | Otherwise falls back to RiftCompare's address |
| Vercel | `GOOGLE_SITE_VERIFICATION`, `BING_SITE_VERIFICATION` | New, only if needed | – | Domain property needs no meta tag; Bing imports from GSC |

Optional, only if the site gets its own eBay keyset (§3.17): `EBAY_CLIENT_ID`,
`EBAY_CLIENT_SECRET` (GitHub secrets, **new keyset**), `EBAY_QUOTA_RESERVE`,
`EBAY_MAX_CALLS`, `EBAY_MIN_VALUE_CENTS` (GitHub variables),
`EBAY_VERIFICATION_TOKEN` (new) and `EBAY_DELETION_ENDPOINT` (Vercel). The
deletion endpoint must be live before eBay issues the keys.

**Never copy from RiftCompare:** `EBAY_CLIENT_*` (RiftCompare's quota; a new site
gets its own keyset or none), `EBAY_VERIFICATION_TOKEN`, `RM*`,
`RH*`, `HISTORY_DATABASE_URL*`, `POKEMON_DATABASE_URL`, RiftCompare's
`AUTH_SECRET`, any `STRIPE_*` or `*_PRICE_ID`, Resend/Brevo keys, the Discord
bot, AdSense.

Other accounts: a new Neon project (Postgres 16+, AWS US East next to Vercel
`iad1`), a new Vercel project in the same team, a new Google Cloud project for
OAuth, a new Search Console property with the shared service account as **Full**
user, a Bing site imported from GSC.

---

## 6. Pitfalls and lessons

Each: symptom → cause → fix → where it is encoded now. "Playbook only" means
nothing in either repo enforces it yet.

1. **Canonicals on a guessed domain.** → The domain wasn't asked. → Default
   `SITE_URL` everywhere, rebuild. → `tests/domain.test.ts` (Specifxx/OpCompare);
   OP DECISIONS "The domain is opcompare.app"; §1 Q1 here.
2. **Thin UK/EU coverage.** → The registry was the parent game's stores. →
   Game-specific discovery (+121 stores). → [store-discovery/](store-discovery/README.md);
   §1 Q3.
3. **1,569 ambiguous match groups.** → Event reprints share name and number with
   the main set. → Event stamp as a variant token, set-aware disambiguation. →
   `tests/catalog.test.ts`, `tests/match.test.ts`; OP DECISIONS "Printings are
   told apart by tokens, event stamps and set".
4. **A store matched 1,179 of 5,672 products.** → BinderPOS titles carry no
   number. → Exact TCGplayer name + set path. → `tests/match.test.ts`; OP
   DECISIONS "A second match path".
5. **Stamped, "(V.2)", reprint and "(Non-English)" listings priced as the plain
   card.** → The matcher accepted a fit lacking words the title names. →
   `ruledOut` + `PRINTING_WORDS`; replay: 967 moved, 758 skipped. →
   `tests/match.test.ts`; OP DECISIONS "A title that names another printing
   rules the plain one out".
6. **9 pricing bugs after the tests passed** (Manga on the wrong page, set named
   in title ignored, RE/PRE/ANN codes, a lone plain printing outside its home
   set plus TAG/AGS slabs not treated as graded, aliases as printings, Red SAA
   as promo, acrylic case as booster case, colour words picking printings,
   oldest 730 index days; plus one minor extra, `/api/search?q=!!` returning
   arbitrary products). → Tests only cover what the author thought
   of. → Read-only review agent with live DB and replay. → `tests/match.test.ts`,
   `tests/catalog.test.ts`, `tests/premium.test.ts`; OP DECISIONS "The set a
   title names decides; aliases are names (review fixes)"; prompt in
   [PROMPTS.md](PROMPTS.md).
7. **Catalogue cache 3.7 MB.** → One object entry for 7,255 printings. → Tuples,
   derived slugs, two entries. → Comment in `src/lib/data.ts`; **size not
   tested** (§2.3 #2).
8. **Every page renders per request.** → Root layout reads cookies/headers. →
   Not fixed. → Playbook only (§2.3 #1).
9. **A store "failed" every run.** → Collections over `MAX_PAGES` × 250. →
   `MAX_PAGES = 30`, fewer handles. → `src/lib/store-import.ts` comment only.
10. **Probe reported 0 for a good store.** → `probe-stores.ts` ignores configured
    handles. → Validate with `IMPORT_ONLY_STORES`. → Playbook only (§2.3 #10).
11. **Store with English titles over Japanese stock.** → Title regex alone can't
    see language. → Tags, language options, descriptions, and looking at card
    images. → `verify-stores.mjs` flags, README acceptance criteria.
12. **Duplicate store under a second domain.** → Host comparison. → Compare
    `myshopify_domain`. → `detect-shopify.mjs`.
13. **Troll and Toad looked like "not Shopify".** → Password-protected Shopify:
    `meta.json` answers, `products.json` returns 401. → Check the feed is
    readable. → `detect-shopify.mjs` (`feedOpen`).
14. **Shared Stripe account would cross-grant Premium.** → RiftCompare's
    reconcile matches by email. → Separate account + `site=<slug>` filter, no
    email matching. → `tests/premium.test.ts`, Specifxx/OpCompare: `CLAUDE.md`
    "Plus & Premium"; OP DECISIONS "Plus & Premium".
15. **Locked rows leaking in HTML.** → Gating with CSS. → Cut rows in the query.
    → Source-regex checks in `tests/premium.test.ts`; Specifxx/OpCompare:
    `CLAUDE.md` "Egress".
16. **Owner's secret name wrong (`GA_SA_KEY`).** → Paraphrase. → Grep the
    workflows for the real name. → OP Compare `docs/SETUP.md`; §5 here.
17. **TCGCSV 401 from Python.** → Client filtering. → curl/Node with a UA. →
    Playbook only.
18. **No history backfill (archive 403).** → Sandbox couldn't reach the archive.
    → History starts at the first import. → OP DECISIONS "Price history starts
    with the first import"; try from Actions next time.
19. **Satori OG images fail with HTTP 200 logged.** → Unsupported CSS and
    multi-node divs. → Simple gradients, one template string per text node. →
    Playbook only.
20. **Ugly filter URLs.** → GET forms submit empty fields. →
    `src/components/FormCleaner.tsx`.
21. **Stale domain in SEO output after the fix.** → `next start` serves the last
    build. → Rebuild, then check. → Playbook only.
22. **Hyphen check false-passed.** → `grep -P` errored and `|| echo` printed the
    pass. → Fail-closed Python check. → [PROMPTS.md](PROMPTS.md).
23. **`claude/*` pushes build Vercel previews.** → `vercel.json` opt-out not
    copied. → Copy RiftCompare's entries. → Playbook only (§2.3 #3).
24. **Admin/premium sessions refused locally.** → `AUTH_SECRET` missing. →
    Random local value in `.env`, restart. → `src/lib/auth-secret.ts` throws by
    design.
25. **Tokens nearly committed.** → QA scripts copied into the repo root. → Delete
    after running; grep the staged list. → Playbook only (§3.13 step 7).
26. **Review findings drifted.** → Main session edited the reviewed file. →
    Freeze files or re-check HEAD. → Playbook only.
27. **The owner thought a feature existed.** → No parity list was shown. → Show
    in/out/later before building. → §1 here.
28. **Evidence lost after the session.** → Scripts, logs and screenshots lived
    in an ephemeral scratchpad. → Commit audit scripts (`check-cat`, `amb`,
    `miss`, `replay`, crawl, interact, overflow, QA users) under
    `scripts/qa/` (§3.13), and keep a build log as you go. → Playbook only.
29. **Owner messages waited 5–19 minutes.** → The build ran as one long turn. →
    End turns at milestones (§3.13 "Running the session"). → Playbook only.
30. **Admin, link previews and an own eBay keyset were asked for after the
    hand-over.** → No §1 question covered them. → §1 Q9, Q18, Q19; §3.17. →
    Playbook only.
31. **The inherited stores were never language-, graded- or currency-checked
    for the new game.** → Only new candidates went through `verify.mjs`. → Run
    every candidate, inherited or new, through all three scripts (§3.5.2). →
    Playbook only.

---

## 7. Acceptance checklist before handing to the owner

**Code and tests**
- [ ] `npx prisma generate && npm run typecheck && npm run lint && npm test` all
      pass; the test files include deploy-gate, nested-cache, theme, domain,
      no-eBay-API (or the agreed forbidden-API test), catalog, match, premium,
      history, affiliate, search.
- [ ] No brand token from the template survives: grep the tree for `opcompare`,
      `OP Compare`, `oc_`, `oc-`, `op:` and `68` in TCGCSV URLs.
- [ ] The §2.3 template fixes are applied or each has a DECISIONS entry saying
      why not.
- [ ] Each catalogue cache entry measures under ~1.2 MB raw.
- [ ] If finishes are price subtypes, the §3.4.1 design (or a recorded
      alternative) is in DECISIONS and in the schema.

**Data**
- [ ] A catalogue-only import and a full import both succeed locally; the last
      full import's failed stores are each explained.
- [ ] `check-cat` shows no card misclassified as promo; `amb` shows only true
      duplicates.
- [ ] The replay after the last matcher change is >99% unchanged, and the moves
      were read.
- [ ] The review agent's findings are fixed and pinned by tests.
- [ ] Coverage per market is recorded, and any empty market is in the hand-over.
- [ ] Database size after a full import is measured (§3.4) and projected against
      Neon's 0.5 GB; the projection is in the hand-over.
- [ ] Every registry store, inherited or new, passed the three discovery
      scripts and an `IMPORT_ONLY_STORES` products → cards check.

**Site**
- [ ] `next build` succeeds with no database (rename `.env` for the test).
- [ ] Crawl: BAD 0. Playwright interaction checks pass. No page scrolls sideways
      at 375 px. Screenshots at 1440 and 390 in both themes were looked at.
- [ ] Domain build check: robots, sitemap, canonical, www → apex 308, OG image
      bytes.
- [ ] Gating table reproduces per tier; `/account` signed out redirects; paid API
      returns 401/402/200 as designed.

**Ops and docs**
- [ ] `vercel.json`: `ignoreCommand`, `deploymentEnabled` for `data` and
      `claude/*`, the reconcile cron.
- [ ] Every workflow parses and no-ops without its secrets.
- [ ] `egress-audit.yml` is ported, or DECISIONS says why not (§2.3 #13).
- [ ] The QA scripts are committed under `scripts/qa/`.
- [ ] `README.md`, `CLAUDE.md`, `DECISIONS.md`, `docs/SETUP.md`,
      `docs/CHROME-SETUP-PROMPT.md`, `.env.example` name every env var the code
      reads, with reuse/new marked.
- [ ] No commit subject contains `[deploy]`; everything is pushed.
- [ ] Hand-over message lists: what exists and what was not ported; decisions
      for the owner; the env tables; the Chrome prompt; what the owner must
      still do; the launch post (if asked), checked by the fail-closed script.
- [ ] The build log is committed in the new repo at `docs/BUILD-LOG.md`; a copy
      goes to this folder only if the owner approves a TCGEmpire commit (§1 Q17).

---

## 8. Where everything is

**In this folder**
- [README.md](README.md): index of this folder.
- [OP-COMPARE-BUILD-LOG.md](OP-COMPARE-BUILD-LOG.md): the timestamped record
  of the OP Compare build (requests, phases, commits, problems, metrics).
- [PROMPTS.md](PROMPTS.md): the agent prompts, the Claude in Chrome setup
  template, QA prompts, the launch post and the hyphen check.
- [store-discovery/](store-discovery/README.md): `detect-shopify.mjs`,
  `probe-collections.mjs`, `verify-stores.mjs`, `lib.mjs`, `game.example.json`.

**RiftCompare (this repo) files a sister site borrows from**

| Topic | Files |
|---|---|
| Deploy gate | `scripts/vercel-ignore-build.sh`, `vercel.json`, `.github/workflows/production-deploy.yml`, `tests/deploy-cadence.test.ts`, `CLAUDE.md` |
| Egress | `src/lib/db.ts` (header rules, the 1.2 MB figure), `tests/nested-cache.test.ts`, `src/app/layout.tsx` (no cookies in the layout) |
| TCGCSV precedent | `docs/pokemon/README.md`, `src/lib/pokemon/catalog.ts`, `src/lib/pokemon/packs.ts`, `.github/workflows/pokemon-archive-probe.yml` |
| Stores | `src/lib/retailers.ts`, `scripts/sweep-registry.ts`, `scripts/probe-uk-stores.ts` (currency proof) |
| Money and markets | `src/lib/affiliate.ts`, `src/lib/fx.ts`, `src/lib/country.ts` |
| Theme and nav | `tailwind.config.ts`, `src/app/globals.css`, `tests/theme.test.ts`, `src/components/nav-groups.ts` |
| Accounts | `src/lib/oauth.ts`, `src/lib/stripe-entitlement.ts`, `src/lib/stripe-reconcile.ts` (the email fallback) |
| History | `src/lib/price-history-store.ts`, `scripts/publish-price-history.sh` |
| Search Console | `docs/OWNER-CHECKLIST.md` §3 |
| Rules in force | `docs/CURRENT-STATE.md`, `docs/DECISIONS-INDEX.md` |

**OP Compare (Specifxx/OpCompare at `d71528b`)**

| Topic | Files |
|---|---|
| Rules and history | `README.md`, `CLAUDE.md`, `DECISIONS.md` |
| Go-live | `docs/SETUP.md`, `docs/CHROME-SETUP-PROMPT.md`, `.env.example` |
| Catalogue and matcher | `src/lib/catalog.ts`, `src/lib/match.ts`, `src/lib/constants.ts`, `tests/catalog.test.ts`, `tests/match.test.ts` |
| Stores and import | `src/lib/stores.ts`, `src/lib/store-import.ts`, `src/lib/scrape.ts`, `src/lib/import.ts`, `scripts/import.ts`, `scripts/probe-stores.ts` |
| Loaders | `src/lib/data.ts`, `src/lib/db.ts`, `tests/nested-cache.test.ts` |
| History | `src/lib/history.ts`, `src/lib/history-store.ts`, `scripts/publish-history.ts`, `.github/workflows/import-prices.yml`, `tests/history.test.ts` |
| Premium | `src/lib/plans.ts`, `src/lib/premium.ts`, `src/lib/stripe*.ts`, `src/lib/auth.ts`, `scripts/stripe-setup.ts`, `tests/premium.test.ts` |
| Brand | `src/lib/site.ts`, `src/components/Logo.tsx`, `scripts/gen-icons.ts`, `tailwind.config.ts`, `src/app/globals.css` |
| Guards | `tests/deploy-gate.test.ts`, `tests/domain.test.ts`, `tests/no-ebay-api.test.ts`, `tests/affiliate.test.ts` |

**DECISIONS entries in this repo behind the rules** (links use line anchors, as
`docs/DECISIONS-INDEX.md` does; they drift when an older entry is edited, and
GitHub's rendered Markdown may not scroll to them, so find an entry with
`grep -n '^## <title>' DECISIONS.md`)
[Network transfer: the deploy cadence was the burn](../../DECISIONS.md#L4871) ·
[The first egress audit found the second burn: nested caches](../../DECISIONS.md#L5042) ·
[The gate deployed on a commit that said it wasn't deploying](../../DECISIONS.md#L5195) ·
[Find the fifth burn before RM10 dies](../../DECISIONS.md#L6263) ·
[A store fell off the site because one request failed](../../DECISIONS.md#L11034) ·
[Vercel cost cuts: no per-request middleware…](../../DECISIONS.md#L12655) ·
[The Pokémon sealed section (beta): its own database, off by default](../../DECISIONS.md#L16105) ·
[Pokémon: the Discord app removed, and eBay quota strictly Riftbound's first](../../DECISIONS.md#L16335) ·
[TCGplayer is a buyable comparison row everywhere but Australia](../../DECISIONS.md#L16522)
