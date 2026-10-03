# OP Compare build log

**Written 2026-10-03, last revised about 13:00 UTC the same day. This is the
record of the day OP Compare was built.**

OP Compare (https://opcompare.app, repo `Specifxx/OpCompare`) is the One Piece
Card Game sister site of RiftCompare. It was written in one Claude Code session
as a new, smaller codebase modelled on this repo, **not a fork of it** (OP
Compare DECISIONS.md, "A purpose-built port, not a fork of RiftCompare"). The
product build ran on 2026-10-03 between 08:29:55 and 10:55:49 UTC. The
follow-up work (admin pages, share images and an eBay spec; U14 to U16) was
stopped by the session usage limit at 11:36, resumed at 12:22, and **was still
running at about 13:00** when this file was last revised. This file records
what the owner asked for, what was built in response, the commits, the
subagents, what broke, and the numbers at each stage. It ends with what we
would ask or do earlier next time.

All times are UTC. The sources are the session transcript, the three subagent
transcripts, `git -C /home/user/OpCompare log`, and the scratchpad import logs.
Those transcripts and logs are ephemeral; this file is meant to outlive them.
Everything quoted from the owner is verbatim, except one personal email address,
which is redacted.

**This is a record, not a recipe.** To build another sister site, follow
[PLAYBOOK.md](PLAYBOOK.md): the questions to ask first are in
[§1](PLAYBOOK.md#1-decide-before-writing-code), the build in order is in §3,
and the per-game differences are in §4 (Lorcana is TCGCSV category 71; see
[§4.2](PLAYBOOK.md#42-candidate-games-at-a-glance)). Use the prompts in
[PROMPTS.md](PROMPTS.md). Store discovery is in
[store-discovery/README.md](store-discovery/README.md). Use this log as the
evidence for why a step exists. The next site should start from OP Compare's
tree at `d71528b` ([PLAYBOOK §2.1](PLAYBOOK.md#21-a-purpose-built-port-not-a-fork)),
applying the fixes in
[PLAYBOOK §2.3](PLAYBOOK.md#23-fix-these-in-the-template-before-copying-it)
first, not from a copy of this repo.

**Paths.** Unqualified paths such as `src/lib/match.ts` are in
`Specifxx/OpCompare` at `d71528b`. Paths in this repo are written
`TCGEmpire:path`. Several names (`src/lib/ga.ts`, `src/lib/site.ts`,
`src/lib/premium.ts`) exist in both repos with different contents. "OP Compare
DECISIONS" means `Specifxx/OpCompare: DECISIONS.md`; "RiftCompare DECISIONS"
means `TCGEmpire:DECISIONS.md`. "Scratchpad" means the session's ephemeral
`/tmp/claude-0/…/scratchpad`, which is deleted with the session.

---

## 0. The one-line summary

The first commit took **53 minutes**. The last product commit took
**2 h 16 min**. In between, the owner corrected the course 12 times. Every
correction was something we could have asked in the first message. The main
ones were: the domain, a separate store search, Stripe parity, history in Git,
and the launch voice. §11 lists those questions.

**If you are building the next site: stop here and send the owner the
questions in §11 and [PLAYBOOK §1](PLAYBOOK.md#1-decide-before-writing-code)
before writing any code.** For Lorcana that means at least: the domain and
repo name; whether the repo will be public (history in GitHub needs it); its
own Stripe account, Google OAuth client, GA4 property and Neon project;
whether to include admin, share images, Premium, the blog and an eBay API
keyset; which markets (SG had 0 cards for One Piece); how far the theme may go
toward the publisher's IP; and the launch-post voice and subreddits.

---

## 1. At a glance

| Milestone | Time | Elapsed |
|---|---|---|
| First owner message | 08:29:55 | 0:00 |
| `npm install` of the hand-written scaffold (Next 14.2, React 18, Tailwind 3.4, Prisma 5.22) | 08:36:00 | 0:06 |
| First catalogue import (87 sets, 7,255 cards, 420 sealed) | 08:48:05 | 0:18 |
| First page rendered locally | 09:04:16 | 0:34 |
| First course-correction ("different stores") | 09:09:50 | 0:40 |
| First commit `d44b533`, pushed | 09:23:09 | **0:53:14** |
| Context auto-compacted (783k tokens down to 18k) | 09:51:07 | 1:21 |
| 235 stores imported (333,062 offers) | 10:06:44 | 1:37 |
| Review fixes committed `335c40a` | 10:17:12 | 1:47 |
| Last commit `d71528b` (Premium, history in GitHub) | 10:45:48 | **2:15:53** |
| Hand-over message (Launch Kit, variable tables, Reddit post) | 10:48:21 | 2:18:26 |
| Reddit post rewritten in the "proud launch" voice | 10:55:49 | 2:25:54 |
| Session usage limit: all three background workflows stop with partial results (admin/share images, eBay spec, this documentation) | 11:36:37–11:38:46 | 3:06 |
| Owner reports the limit has reset; workflows resumed | 12:21:47–12:22:34 | 3:52 |
| eBay port spec finished (resumed run `wwtrchc3s`) | 12:36:37 | 4:06 |
| Admin/share-image work still running, deliberately not committed | 12:36:47 onward | |

The product build was one long turn. Ten of the owner's first 13 messages (U1
to U13, up to the hand-over) arrived while the session was working. The
documentation request (U12) and the Reddit voice change (U13) waited in the
queue until a turn ended.

---

## 2. The owner's requests, verbatim

"Typed" is when the message was queued. "Seen" is when the session got it.

| # | Typed | Seen | Request |
|---|---|---|---|
| U1 | 08:29:55 | 08:29:55 | "Can we create uh, a website for one piece called um, OP Compare, uh, similar to Riff Compare? You know, change up the logo. You know, leverage pretty much it's like an identical website except everything is one piece. Um, the logo, um, the the coloring, the theme is one piece, and uh, also um, use the one piece repository, the OP Compare repository. Uh, just migrate. You know, like copy over the stuff that you need, and um, also get, don't use the eBay API quota. So that's those are the main things. But everything else, you know, identical. Um, we gotta make this website. Uh, thank you." |
| U2 | 09:09:50 | 09:09:50 | "We obviously need different stores for onepiece" |
| U3 | 09:26:37 | 09:26:37 | "obviously we also need separate database and stuff and you need to tell me what environment variables to set in both vercel and github. We can re-use a lot of variables from riftcompare like GA_SA_KEY also we need to set up google search console as well. So give me a claude chrome extension prompt at the end that can do all of this for me when you're finished." |
| U4 | 09:29:59 | 09:29:59 | "At the end of the day, I just want the store to like, you know, work exactly as Rift Compare without any bugs. Uh, the only difference is OP Compare has a, a bunch of um, like way more cards than Riftbound. Uh, so one piece. Um, and I think, yeah, we don't want to use any of the eBay quota, but we want to have the eBay affiliates uh, in a, OP Compare. Um, and um, yeah, and everything else should be fine. Uh, and everything else should be like basically the same. You know, and then you know, Rift Compare has uh, integration with Google uh, Search, like Bing Webmaster, um, you know, it, it's got a lot of ads on like you know, Facebook, Reddit, or whatever. We, we can skip that part, you know, like the marketing. Um, but uh yeah, like we also want like a really, really like nice and SEO indexable blog post for OP Compare. Um so yeah, and like, you know, have, have some, like a, like a sitemap, but you know, like, like you, we got to set everything up just like Rift Compare." |
| U5 | 09:32:20 | 09:32:20 | "Yeah, and, and once again, I, I really don't want to set it up. So um, yeah, so like Claude Chrome extension, we want to use that. Um, so yeah, you, you got to give me like a prompt and that, you know, sets everything up uh, from the website, like Vercel to like all the environment variables, everything, everything set up uh, with that Claude Chrome extension." |
| U6 | 09:50:32 | 09:51 (after compaction) | "also the domain name is opcompare.app which is really important" |
| U7 | 10:11:48 | 10:11:48 | "even stripe subscriptions should be similar to riftcompare, so we might need to get everything set up via stripe for the chrome extension too - especially for deal finder etc." |
| U8 | 10:13:47 | 10:13:47 | "we also need at the very end a draft reddit post introducing OPCompare, with main focus on price guide to the relevant subreddits - make it personal and no hyphens please and make it sound human." |
| U9 | 10:25:16 | 10:25:16 | "ok one thing unlike riftcompare, lets for all the price and card history and any history that is public, let's use github to store the data rather than the history database." |
| U10 | 10:25:34 | 10:25:34 | "Also yeah we might need chrome extension to help us set up OAUTH as well, unless we can use riftcompares or etc." |
| U11 | 10:26:18 | 10:26:18 | "obviously some features that rely on ebay like cheapest on ebay can be removed since we are not using any of the ebay API" |
| U12 | 10:29:11 | **10:48:22** | "I want to document this entire process of building for opcompare from riftcompare as well in the riftcompare repo so we can apply to another TCG in future" |
| U13 | 10:49:44 | **10:55:01** | "The Reddit post should be  the same vibe as we are proud to launch opcompare, we made riftcompare as an MVP and have taken the learnings and applied it to one piece so it's more complete etc. keen for feedback etc." |
| U14 | 11:06:46 | 11:06:46 | "Admin features should also be the same - flag ‹owner email, redacted› as an admin" |
| U15 | 11:07:23 | folded into the U14 work | "Website link thumbnails must also be very good featuring the website and mainly the price guide" |
| U16 | 11:16:50 | 11:16:50 | "I'm also planning to create a new eBay API for opcompare so when that variable is set we have a new 5000 API quota which we can split by region and allocate based on card price like riftcompare just tell me what variables to set" |

At 12:21:47 the owner also sent "I hit my usage limit while you were working,
but it has reset now. Please continue from where you left off." (§4,
11:06 onward).

Three Stop-hook messages were not typed by the owner, but they did change what
happened. At 10:17:05 the hook said "There are uncommitted changes… Please
commit and push", which produced `335c40a`. At 10:54:45 it said "There are 2
unpushed commit(s)…" on TCGEmpire, and the documentation branch was pushed
while it still equalled `main`. At 12:36:40 it asked again to commit the
untracked files; the session refused, because the admin code had "not been
built or security-checked yet".

---

## 3. Commits

From `git -C /home/user/OpCompare log --shortstat`, checked on 2026-10-03.
All are on `claude/tender-noether-2na98p`. No subject carries `[deploy]`.

| Time | Hash | Subject | Files, lines | Tests | Stores | Triggered by |
|---|---|---|---|---|---|---|
| 09:23:09 | `d44b533` | OP Compare: One Piece Card Game price comparison, ported from RiftCompare | 114, +16,504 | 38 | 114 | U1 |
| 09:25:53 | `9fb68f7` | Release dates page, store probe script, one filter panel, card text after prices on phones | 6, +157/−41 | 38 | 114 | own QA and parity |
| 09:38:56 | `faf4edb` | Blog, affiliate panels, analytics and search-engine setup | 41, +2,163/−11 | 38 | 114 | U3, U4 |
| 09:46:32 | `9648da6` | Stale-offer rule, clean filter URLs, Claude in Chrome setup prompt | 8, +224/−26 | 38 | 114 | U5, QA |
| 10:01:17 | `2b6f0cd` | Set opcompare.app as the domain, add 121 One Piece stores, tighten printing matches | 15, +463/−111 | 42 | 235 | U2, U6 |
| 10:17:12 | `335c40a` | Fix review findings: set-aware matching, aliases, sealed cases, index series | 10, +231/−28 | 45 | 235 | review agent (U4 "without any bugs") |
| 10:45:48 | `d71528b` | Add Plus & Premium (Stripe), Google/Discord sign-in, and move price history to GitHub | 73, +3,243/−408 | 65 | 235 | U7, U9, U10 |

The test counts are the number of `test(` calls in `tests/*.test.ts` at each
commit, and they match the `npm test` output at the time. The store counts are
the number of `key: "` lines in `src/lib/stores.ts`.

---

## 4. The day, in order

> **Game-specific.** Everything below in the matcher, catalogue and
> store-acceptance steps is One Piece grammar: `OPxx-NNN` numbers, event-stamp
> tokens (Pre-Release, Release Event, Anniversary), Manga/Parallel/SP/PRB and
> "The Best", DON!!, the Leaders and colours hubs, the Mr.3 alias fold, and
> Bandai publishing no pull rates. Copying `src/lib/match.ts` or
> `src/lib/catalog.ts` as-is will not work for another game. For Lorcana
> (TCGCSV category 71), PLAYBOOK §4.2 records slash numbers ("1/207"), finishes
> carried as price subtypes, and " - " subtitles that are part of the name;
> each breaks an OP Compare rule. Answer
> [PLAYBOOK §4.1](PLAYBOOK.md#41-answer-these-for-the-new-game-before-writing-catalogts-and-matchts)
> before writing `catalog.ts` or `match.ts`, and write a new store-discovery
> config rather than reusing `store-discovery/game.example.json`, whose
> `cardNumberRe` is One Piece's.

### 08:29–08:36 · Reconnaissance (U1)

- The OpCompare repo was empty ("No commits yet"). TCGEmpire had 879 files
  under `src` and 131 `page.tsx`.
- **Decision: a purpose-built port, not a fork** (OP Compare DECISIONS, "A
  purpose-built port, not a fork of RiftCompare"). RiftCompare's operating
  rules (deploy gate, egress, matching discipline, affiliate tagging) were
  copied; the game-specific code was rebuilt. At `d71528b` OP Compare has 191
  tracked files in all, against 879 under TCGEmpire's `src` alone. One
  consequence: features left out
  at first (Premium, admin) later had to be ported as separate efforts.
- `TCGEmpire:docs/pokemon/README.md` was the model for pricing without eBay
  calls: TCGCSV, plus store scrapers, plus eBay search links.
- `curl https://tcgcsv.com/tcgplayer/68/groups` returned 200 with
  `totalItems: 87`. One Piece is TCGCSV category 68.
- Playwright screenshots of live riftcompare.com became the visual reference.
- Read RiftCompare's Prisma models, `TCGEmpire:src/lib/retailers.ts` (2,441
  lines) and the Shopify fetch code. Cardmarket was ruled out as an EU source
  (OP Compare DECISIONS, "Cardmarket is not an EU source (yet)": its public
  price files carry no card numbers, and RiftCompare's permission to use them
  was asked for Riftbound).
- 08:33: the sandbox already had Postgres 16 installed. (At 08:39 it was
  started and a local database was created, so everything could be tested
  against a real database.)
- 08:35:24: RiftCompare's retailers were extracted with a regex over the
  source. **It got 168 of the 172 entries** (AU 28, US 43, CA 50, UK 24, SG 11,
  EU 12). The four it silently dropped are Canadian (`altf4`, `cardbrawlers`,
  `hobbyexpert`, `6ixtcgsmarkham`): a comment sits between `name:` and `base:`,
  or the key is quoted. None of the four was ever probed for One Piece, and
  none is in `src/lib/stores.ts`. A background probe of the 168 started at
  08:35:42.

### 08:36–08:48 · Scaffold, catalogue, data model

- The scaffold was written by hand (no `create-next-app`), following
  RiftCompare's config files: Next 14.2, React 18, TypeScript, Tailwind 3.4,
  Prisma 5.22 (PLAYBOOK §3.1 has the full list). `npm install` took 53 s.
- Python `urllib` got **HTTP 401** from TCGCSV. A `curl -A "opcompare-dev"`
  loop worked.
- The catalogue: 7,684 products, 429 of them sealed. The rarities were C 2,453,
  UC 1,358, R 1,250, SR 841, PR 577, L 375, DON!! 223, SEC 165 and TR 12.
- The TCGCSV price archive returned **403**, so there was no backfill. The
  decision "Price history starts with the first import" means Movers starts
  empty.
- Schema: Set, Card (one row per TCGplayer printing), Sealed, Offer, PriceDay,
  IndexDay and ImportRun.
- 08:43:08: the probe passed **114 of the 168** RiftCompare stores, each with
  at least 20 numbered One Piece listings (AU 19, US 31, UK 13, CA 38, SG 1,
  EU 12). The registry `src/lib/stores.ts` was generated from it. **This bar
  was weaker than the one the 121 new stores later met:** the probe
  (`scratchpad/probe/probe.mjs`) had no language check, no graded-slab check
  and no currency re-proof (the 114 inherited RiftCompare's per-store
  currency, proven for Riftbound), and its count summed per-collection counts,
  so overlapping collections double-count. OP Compare DECISIONS "Stores" says
  the 121 were "verified the same way", which overstates what the 114 got.
- 08:48:05: **first catalogue import**. 87 sets, 7,255 cards, 420 sealed and
  7,324 TCGplayer listings in about 3 s. The index base was 1000.0 over 3,228
  cards.

### 08:48–08:55 · Matcher iterations on a 6-store sample

The sample was one store per market: `cherry`, `danireon`, `totalcards`,
`gtgames`, `trextcg` and `chonkycollectibles`.

| Time | Change | Offers |
|---|---|---|
| 08:48:57 | First matcher (card number + name + printing keys) | 7,382 |
| 08:49:21 | SQL audit of matched offers by store: Danireon's in-stock offers averaged **5.54× market**. The same pass found Pokémon "TAG 9" slabs in Danireon's feed; TAG/AGS were excluded only an hour later, by review finding 4 | – |
| 08:49:29 | Sealed false positive "Koala (Alternate Art) [Premium Booster -The Best-]" from a bare "booster" fallback: fallback removed, exclusion regex added | – |
| 08:49:45 | Measured printings with identical match keys: **1,569 ambiguous groups**, mostly main sets against their Pre-Release, Release Event and Anniversary reprints | – |
| 08:50:34 | Event groups add their stamp as a token | ambiguous groups **1,569 → 147** (an intermediate run at 08:51:39 showed 208) |
| 08:52:22 | Bracket tokens, leftover words as extras, set-aware tie-breaking | 12,374 |
| 08:54:28 | Second match path: exact TCGplayer name + set name, for BinderPOS titles with no card number | 15,801 (GT Games 1,179 → 4,429) |

### 08:55–09:16 · Theme, loaders, pages

- RiftCompare's token system was recoloured: night-sea navy, Straw Hat red and
  straw gold. The logo is a straw-hat SVG mark with an "OP"+"Compare" wordmark.
- `src/lib/data.ts` holds the self-cached loaders. The catalogue cache measured
  **3,701,119 B** as objects, against a 2 MB entry limit. It shrank to
  1,502,730 B as tuples, then 1,262,233 B with derived slugs, and was then
  split into `loadCore` and `loadPrices`. The compaction summary puts each at
  about 0.6 MB; that size was not re-measured.
- The pages: browse, card, sets, sealed, price guide, movers, market, colours,
  leaders, cards, deal finder, box value, stores, watchlist, API, the static
  pages, sitemap, robots and OG. Typecheck and lint were clean at 09:16:02.
- **Box value, not box EV** (OP Compare DECISIONS): Bandai publishes no pull
  rates, so `/tools/box-value` puts the box price beside the set's card value
  and how concentrated it is, rather than an expected value built on guessed
  odds.

### 09:16–09:26 · First QA, first commits

- Every route returned 200 or the expected 404, except `/opengraph-image`,
  which was fixed (§6).
- Price guide: a US$199,999 serial-numbered listing had topped the "dearest"
  tile, so the tile now needs a `marketUsd`.
- Tests: **38 pass** (catalog, match, affiliate, no-ebay-api, theme, search,
  deploy-gate, nested-cache).
- Ported the deploy gate (`scripts/vercel-ignore-build.sh`, `vercel.json`
  `ignoreCommand`) and the workflows `ci.yml`, `import-prices.yml` and
  `production-deploy.yml`.
- Production build: 87 kB shared JS. `/browse` was 36,371 B gzipped (09:21:34);
  that measurement showed the filter panel rendering twice (phone and
  desktop), which `9fb68f7` fixed. The size after the fix was not re-measured.
- **09:23:09 `d44b533`**, then **09:25:53 `9fb68f7`**: `/release-dates`,
  `scripts/probe-stores.ts`, and card text below prices on phones. An overflow
  scan at 375 px found no page that scrolled sideways.
- 09:26:38: **full import of 114 stores, 188,727 offers, 1 failed
  (`games401`)**, in about 3.5 min.

### 09:09–10:01 · Different stores (U2)

- 09:10:51: spawned the store-search agent (§5).
- While it ran, the main session kept building pages.
- 09:47–09:49: spot-probed four of the new stores through the real matcher.
  Good Games AU matched 2,783, BSA Store EU 1,495 and GameZilla CA 3,907.
  Hodges UK matched 0, because `probe-stores.ts` ignores configured collection
  handles; the store itself was fine.
- 09:49:18: merged into `src/lib/stores.ts` by a one-off Python script (never
  saved) that checked key, domain and currency clashes: "121 added; skipped
  []".
- 09:51:14–09:54:08: **imported only the 121 new stores. 142,610 offers,
  0 failed.** Weak stores were kept: none was removed for a low match rate
  (§8, Coverage gaps).
- 09:54–10:00: **match-quality checks on the new stores.** A `psql` sample of
  60 random new-store offers, then a SQL count of plain-printing offers whose
  titles name a stamp, a promo or "(V.n)" (1,227 offers, 264 of them "(V.n)"),
  found mispriced title patterns: "(V.2)", "OP11P", promo or stamp words on a
  plain print, "The Best"/PRB reprints and "(Non-English)". The fixes were
  `ruledOut` and `PRINTING_WORDS`, a PRB code or "The Best" implying the
  reprint, and `non[\s-]?english` as a foreign marker. Every stored listing
  was then replayed with `replay.ts` (Appendix B):

  | Time | Scope | Listings | Unchanged | Newly skipped | Moved |
  |---|---|---|---|---|---|
  | 09:57:52 | number path | 226,193 | 224,046 | 1,826 | 321 |
  | 09:59:12 | number + name paths | 328,432 | 326,714 | 717 | 1,001 |
  | 10:00:32 | final | 328,432 | 326,707 | **758** | **967** |

  In the 09:59 replay, the biggest moves were "plain @OP09 → Reprint @PRB-02"
  (75), "plain @OP06 → Reprint @PRB-02" (58) and "plain @OP07 → Reprint
  @PRB-02" (52). The per-move counts for the final 10:00 replay were not
  recorded.

### 09:26–09:46 · Variables, analytics, search engines, affiliates, blog, Chrome prompt (U3, U4, U5)

- Inventoried every `process.env.X` and workflow secret in RiftCompare. **The
  owner's "GA_SA_KEY" is RiftCompare's `GSC_SA_KEY`**; no `GA_SA_KEY` exists.
- Added `src/lib/ga.ts`: its own GA4 property, Consent Mode v2 denied in the
  EEA, UK and CH, and a `buy_click` event. Also Google and Bing verification
  tags and `/indexnow.txt`.
- Added `scripts/gsc-report.ts` with `search-console.yml`, and
  `scripts/indexnow-submit.ts` with `indexnow.yml`. Both do nothing until their
  secrets exist.
- `docs/SETUP.md` got the Vercel and GitHub variable tables.
- Affiliate panels are tagged search links (EPN campaign 5339155912) and never
  call an API.
- The blog: 7 post modules make 8 posts, with every figure computed from the
  price database at render time. It has Article and BreadcrumbList JSON-LD,
  `/feed.xml`, `/authors` and `/editorial-policy`. Uncertain facts (Romance
  Dawn waves, print runs) were hedged.
- **09:38:56 `faf4edb`.**
- QA pass 2 on a production build. The crawl (`crawl.mjs`, Appendix B) covered
  7,679 sitemap URLs: 443 pages checked plus 1,500 sampled links, **0 bad**.
  Playwright interaction tests passed **10/10**. The tests exposed URLs like
  `?min=&max=&…&per=48&sort=value`, so `FormCleaner.tsx` now drops empty and
  default fields.
- `docs/CHROME-SETUP-PROMPT.md`: one prompt that sets up Neon, GitHub, Vercel,
  GA4, Search Console and Bing.
- The 72-hour stale-offer rule. Offers from stores no longer in the registry
  are deleted on import.
- 09:46:20: spawned the correctness-review agent (§5).
- **09:46:32 `9648da6`.**

### 09:50–10:02 · The domain is opcompare.app (U6)

- The code had guessed `https://opcompare.com` (`src/lib/site.ts`).
- The default `SITE_URL` changed in `src/lib/site.ts` and in every workflow.
  `GSC_PROPERTY` now defaults to `sc-domain:opcompare.app`, www redirects to
  the apex, and `tests/domain.test.ts` was added (3 tests).
- **10:01:17 `2b6f0cd`**: 42 tests, 235 stores. (It also carries the U2
  matcher fixes above.)
- The running server still said `opcompare.com`, because its build predated
  the change. After a rebuild, robots, the sitemap and canonical URLs all said
  `https://opcompare.app`. The code default was proved with
  `env -u NEXT_PUBLIC_SITE_URL npx next build` (10:01:50).
- 10:01:30: a separate task was suggested through `spawn_task`, "Add a matcher
  path for Mr.3-style short names". Review fix 5 made it mostly moot (§5).

### 10:00–10:22 · Full import and the 401 Games fix

- 10:06:44: **235 stores, 333,062 offers, 1 failed (`games401`)**, in about
  6 min. The log line was "a configured collection could not be read —
  keeping its existing rows".
- What was found: 12 overlapping configured handles, and two collections of
  5,530 and 5,300 products, more than `MAX_PAGES` 20 × 250 = 5,000.
- **The cause is unverified.** In `fetchCollection`
  (`src/lib/store-import.ts`), reaching `MAX_PAGES` ends the loop with
  `failed: false`: the cap silently **truncates** a collection, it does not
  fail it. "Could not be read" needs a network error, a 429, a non-404 error
  status or a JSON-parse failure on some page, and the importer does not log
  which page or status. The failure was most likely a transient or
  rate-limited request among the 100+ page requests the 12 handles caused.
- Fix: the store was trimmed to 3 handles and `MAX_PAGES` raised to 30. 401
  Games alone then read 5,530 products and matched 4,390 cards and 84 sealed.
  A collection over 30 × 250 = 7,500 products would still be truncated with no
  warning.
- 10:22:25: re-import after the review fixes. **235 stores, 365,516 offers,
  1 failed (`pokebox`, AU; its rows were kept and the cause was never
  investigated).** It is the same unlogged failure.

### 10:08–10:17 · Review findings fixed

The review agent reported 9 confirmed bugs and 1 minor one at 10:08:00. §5 has
each finding and its fix. **45 tests passed**, and **`335c40a` landed at
10:17:12**. The OP Compare DECISIONS entry is "The set a title names decides;
aliases are names (review fixes)".

### 10:11–10:45 · Plus & Premium with Stripe (U7), OAuth (U10)

- 10:12:45: spawned the Premium/Stripe mapping agent (§5).
- 10:21:27: the plan.
  - Custom Google and Discord OAuth with a jose HS256 cookie.
  - Plus at $2.99/mo or $23.99/yr; Premium at $4.99/mo or $39.99/yr.
  - Checkout, a webhook, the billing portal and a daily reconcile.
  - Deal Finder gated **in the query**: signed out sees no rows, free sees 3,
    paid sees everything. Plus is ad-free.
- **OP Compare gets its own Stripe account.** RiftCompare's reconcile falls
  back to matching by email (`TCGEmpire:src/lib/stripe-reconcile.ts`), so a
  shared account would hand RiftCompare Premium to OP Compare subscribers. OP
  Compare only honours subscriptions marked `site=opcompare`.
- **No $1 trial.** RiftCompare's trial relies on reminder emails, and OP
  Compare sends none.
- Built:
  - libraries: `plans.ts`, `auth.ts`, `oauth.ts`, `stripe.ts`,
    `stripe-entitlement.ts`, `premium.ts`, `stripe-reconcile.ts`, `accounts.ts`
    and others, all under `src/lib/`;
  - 9 API routes: auth logout, OAuth start and callback, buy list, `me`,
    checkout, portal, the Stripe webhook, and the cron route
    `/api/cron/stripe-reconcile`;
  - the pages `/login`, `/account`, `/premium` and `/premium/welcome`;
  - the **Buy List Planner** (`/tools/buy-list`), Premium's tool and the
    counterpart of RiftCompare's "Best Basket";
  - a Vercel cron for `/api/cron/stripe-reconcile` at `20 7 * * *`;
  - `scripts/stripe-setup.ts` with `stripe-setup.yml`, which create prices from
    `src/lib/plans.ts` with lookup keys.
- `tests/premium.test.ts`: 13 pass.
- OAuth (U10): the Chrome prompt creates OP Compare's own Google OAuth client
  and Discord app. It uses RiftCompare's Google client only if the owner says
  so, because the consent screen would otherwise say "continue to
  RiftCompare".

### 10:25–10:45 · Price history in GitHub (U9)

- Both repos are public, so pages can read raw files without credentials.
- `src/lib/history.ts` writes 256 per-product bucket files, per-day files and
  `index.json`, trims to 2 years, and computes the 7/30-day change, the 90-day
  high and the index chaining. `PriceDay` and `IndexDay` left the schema.
- `import-prices.yml` commits the files to an orphan `data` branch, then
  `scripts/publish-history.ts` sets `Meta.historyRef` and revalidates. The
  order (push `data`, then set the ref, then revalidate) matters. Pages read
  from `raw.githubusercontent.com`, pinned to the commit in `Meta.historyRef`.
  `vercel.json` disables deployments of `data`.
- `tests/history.test.ts`: 7 pass. A synthetic 2026-09-25 day (7,346 prices)
  tested the charts locally. A card chart draws only once there are two days
  of prices.

### 10:26 · "Cheapest on eBay can be removed" (U11)

A grep of `src` for eBay price claims found only the methodology page, which
says eBay is a search link. OP Compare never had an eBay-price feature, so
**nothing needed removing**, and the hand-over said so.

### 10:38–10:45 · End-to-end QA and the last commit

- **65 tests pass**, typecheck and lint are clean, and the production build
  exits 0.
- QA users for free, Plus and Premium got locally signed sessions. The method:
  a random `AUTH_SECRET` appended to the local `.env` (a production server
  refuses sessions without one; restart after adding it); one `User` row per
  tier with `premiumTier`/`premiumUntil` set; an `oc_session` cookie signed
  with jose HS256 exactly as `src/lib/auth.ts` does, plus the `oc_auth=1` hint
  cookie, passed to Playwright and curl (`qa-users.ts`, Appendix B; PLAYBOOK
  §3.13). No token is kept here. The gating results:

  | State | Deal Finder rows | Other checks |
  |---|---|---|
  | Signed out | 0 (locked preview) | `/account` → 307 to `/login?next=/account`; `POST /api/buy-list` → 401 |
  | Free | 3, plus a "more" prompt | |
  | Plus | 60 | no footer ad |
  | Premium | 60 | Buy List: 6 US items, split total 11,807 cents |

- Crawl: **445 pages plus 1,500 links, 0 bad.** The only console errors came
  from `/_vercel/insights/script.js`, which exists only on Vercel.
- `docs/SETUP.md` and `docs/CHROME-SETUP-PROMPT.md` were rewritten to cover
  OAuth, Stripe on its own account, and the `data` branch.
- **10:45:48 `d71528b`**: 65 tests.

### 10:16 and 10:46–10:56 · Reddit post and Launch Kit (U8, U13)

- 10:16:49: one web search found r/OnePieceTCG (the search summary said about
  124k members) and r/OnePieceTCGFinance. Neither sub's self-promotion rules
  were read.
- 10:46:32: the first draft, 417 words in the first person ("I made…"). The
  first hyphen check used `grep -P`. It failed with "character code point
  value in \x{} or \o{} is too large", and the `||` branch printed "no hyphens
  or dashes", a **false pass**. A Python re-check over `-‐‑‒–—―−` found 0.
- The no-hyphen rule also bans hyphenated URLs: `https://opcompare.app/price-guide`
  would fail it, which is presumably why a post "focused on the price guide"
  links only to the homepage. Decide with the owner whether URLs are exempt.
- 10:47:46: the "OP Compare Launch Kit" Artifact (private,
  https://claude.ai/artifact/GZA3GpH38SDJW2kFDBrkgZ), built by a script from
  the repo's files. It holds the Chrome prompt, the variable tables and the
  post, each with a copy button.
- 10:48:21: the hand-over, with four decisions for the owner:
  1. a separate Stripe account;
  2. no $1 trial;
  3. its own Google OAuth client;
  4. the variable is `GSC_SA_KEY`, not `GA_SA_KEY`, and it needs a fresh JSON
     key for the same service account. **Unverified:** RiftCompare's own docs
     disagree on whether that service account exists (RiftCompare DECISIONS
     around line 8136 says "Google has `GSC_SA_KEY`";
     `TCGEmpire:docs/OWNER-CHECKLIST.md` §3 says the check "has never run
     because it has no key"). If none is listed on RiftCompare's Search Console
     property, create one per OWNER-CHECKLIST §3.
- 10:55:26: the post was rewritten for U13 in the team voice. It is 409 words
  with 0 hyphens, and the full text is in Appendix A. The Launch Kit was
  republished at the same URL.

### 10:48 onward · This documentation (U12)

The TCGEmpire branch was reset onto `origin/main` (`cda650c`). A workflow was
launched to write this playbook; its first script failed to parse because of
an unescaped backtick, and the relaunch ran at 10:54:12. It was stopped by the
usage limit at 11:38:45 and resumed at 12:22:34 (`wn73whvki`). The notes
behind this file, and the `store-discovery/` scripts, came out of that
workflow. As of about 13:00, `docs/sister-sites/` is **not yet committed** to
TCGEmpire (`git status` shows it untracked).

### 11:06 onward · After the last commit (U14, U15, U16), the usage limit, the resume

- **U14/U15:** at about 11:10 a workflow (`wxmugv6yh`) started porting
  RiftCompare's admin features, with a built-in admin list holding the owner's
  address, and building price-guide share images. The session told the owner
  that **setting `ADMIN_EMAILS` replaces that built-in list**, so the variable
  must include every admin, the owner included.
- **U16:** a second workflow (`whentn9lw`) mapped RiftCompare's eBay Browse
  integration for a port spec. The session gave the owner the variables (§8,
  "Left to the owner", item 7) and the order eBay requires (11:18:01).
- **11:36:37–11:38:46: the session usage limit** ("You've hit your session
  limit · resets 12:20pm (UTC)"). All three background workflows ended with
  partial results while their notifications still said "completed": the admin
  workflow had 10 of 16 agents failed and returned `build: null` and
  `docs: null`; the eBay workflow had its spec and challenge steps fail
  (`spec: null`); the documentation workflow lost its store-discovery and
  writing steps.
- **12:21:47:** the owner said the limit had reset. Resuming with the original
  script paths (under `/root/.claude/projects/-home-user-OpCompare/…` and
  `-home-user-TCGEmpire/…`) was refused four times: "scriptPath must be a
  script path this tool returned, or a file you can already read". The eBay
  one, whose path the tool accepted, relaunched at 12:22:09 (`wwtrchc3s`). The
  fix for the other two was to copy the scripts into `scratchpad/wf/` and
  relaunch with `resumeFromRunId` (12:22:31–12:22:34: admin `wbnfgz2t4`,
  documentation `wn73whvki`). Finished agents replayed from cache.
- **12:36:37:** the eBay port spec finished and was challenged by a reviewer.
  It is at `scratchpad/ebay/ebay-spec.md`, beside four notes
  (`map-client-quota.md`, `map-allocation.md`, `map-matching-storage-ui.md`,
  `map-compliance-setup.md`). **The scratchpad is ephemeral: copy these into a
  repo before the session ends.** The session planned to implement eBay only
  after the admin work lands, to avoid two workflows editing and building one
  repo at once. No eBay code exists yet.
- **12:36:47:** the session refused the Stop hook's request to commit, because
  the admin code had "not been built or security-checked yet". **None of the
  admin or share-image work is committed.** It was still being written at
  about 13:00: `git -C /home/user/OpCompare status --short` listed 40 paths at
  12:36, 65 at 12:43 and 66 at 12:59, including `src/app/admin/`,
  `src/app/api/admin/`, `src/components/admin/`, `src/lib/admin-*.ts`,
  `src/lib/og/`, new `opengraph-image.tsx` files, `scripts/audit-inbox.ts`,
  `scripts/store-health.ts`, changes to `prisma/schema.prisma` (11 models in
  the working tree), `package.json` and `.github/workflows/import-prices.yml`,
  and new test files (`admin`, `inbox`, `oauth-email-verified`, `og`,
  `store-health`, `subscription-metrics`). Its verifier findings were not read
  for this log.

---

## 5. Subagents

| Agent | Spawned → reported | Duration | Kind | Result |
|---|---|---|---|---|
| "Find One Piece TCG stores" (`a0d0fa7c222fb7663`) | 09:10:51 → 09:49:11 | 38 m 20 s | general-purpose, background; WebSearch 95, Bash 87, WebFetch 11 | **121 verified stores**: US 42, AU 31, CA 19, UK 17, EU 12, **SG 0** |
| "Review OP Compare for bugs" (`a4deaecfb28da4c4e`) | 09:46:20 → 10:08:00 | 21 m 40 s | general-purpose, background, read-only; Bash 96 | **9 confirmed bugs plus 1 minor**, all fixed in `335c40a` |
| "Map RiftCompare Premium/Stripe" (`a76ba2135ab9ec44b`) | 10:12:45 → 10:19:43 | 6 m 58 s | Explore, background; Bash 78, Grep 5, Read 3 | A 43 KB port map that corrected the brief |

The three workflows after 11:06 (admin and share images, eBay map, this
documentation) are in §4, "11:06 onward".

**Store search.**
- **Sources:** most candidates came from regional directories, not web search:
  yestcg.com (US, 680 sites), cardcompass.co.uk (UK, 718), tcgstorefinder.com.au
  (AU, 204) and TCGTalk's Singapore list. About 2,040 candidates went in; 143
  were fully verified and 22 excluded.
- **Acceptance bar:** Shopify, at least 20 numbered English One Piece listings,
  and prices in the market's currency. Language and slab checks included
  looking at card images: 3 stores were caught only that way. **The 114
  RiftCompare-derived stores never went through this bar** (§4, 08:36).
- **Exclusions:**
  - French or Japanese stock behind English titles;
  - graded-slab shops;
  - currency mismatches;
  - one duplicate domain (`plentyofgames.com.au`, the same shop as `plenty`).
- **SKU-only numbers:** 33 BinderPOS stores put the card number only in the
  SKU, so they depend on the name + set match path.
- **Singapore:** shops there mostly sell Japanese stock or sell through
  Instagram and Carousell.
- **Reuse:** the method is now in [store-discovery/](store-discovery/README.md).

**Correctness review.** The reviewer replayed all 188,727 stored offers
through the real matcher, from a CSV snapshot, against the running server. It
noticed that the main session was editing `match.ts` at the same time, dropped
the findings those edits had already fixed, and re-checked the rest at about
10:05. Each finding below became a real-title test before it was fixed.

| # | Finding | Fix in `335c40a` | Pinned by |
|---|---|---|---|
| 1 | Original-set Manga listings landed on the PRB-01 Manga page (lowEU €2,150 built from OP06 listings) | "Manga" implies alternate art on both sides, and the set named in the title decides | `match.test.ts`, Zoro OP06-118 Manga titles |
| 2 | A single fit was accepted even when the title named another set (`[ST-27-OP09-083]` → the OP09 card; about 34 ST-23…ST-28 titles) | When a title names a set that holds a printing of the card, only printings in a named set fit | Van Augur ST-27 title |
| 3 | `OP03 PRE`, `OP15 RE` and `OP09 ANN` matched the plain print (73 stored offers) | A set code with an event suffix counts as a stamp | Charlotte Praline and Braham titles |
| 4 | A lone untagged printing outside the home set won ("Monkey.D.Luffy (P-001)" → Demo Deck). TAG and AGS slabs were not treated as graded | Untagged strays are skipped; `NOT_A_RAW_SINGLE` gained TAG/AGS grades and "ace grading" | P-001 → ambiguous; TAG 9 → not-single |
| 5 | Character aliases ("Mr.3 (Galdino)") were parsed as printings; about 45 base cards were badged Promo | `foldNameAliases` in `catalog.ts`; **97 printings changed** | `catalog.test.ts` alias test |
| 6 | Red Super Alternate Art and Super Leader AA were classified as promo (a US$4,800 Sabo sat in the blog's "promos you can't pull" table) | `classifyPrinting` matches alt-art words anywhere | `catalog.test.ts` |
| 7 | A sealed title with "case" became "Booster Case": a US$24.99 acrylic case showed as the cheapest Kingdoms of Intrigue case, against TCGplayer's US$5,995 | `NOT_SEALED_PRODUCT` gained acrylic, protector and magnetic; a booster case must be written as one | sealed-title tests |
| 8 | Incidental words ("Leader", colours) picked a pricier printing (the US$51 AA became the US$1,736 Super Leader AA) | A multi-word key must appear as one phrase | Sabo and Luffy OP17-079 titles |
| 9 | `getIndexSeries` loaded the **oldest** 730 days, so `/market` would freeze after two years | Order newest first, then reverse. Superseded in `d71528b`, which removed `IndexDay` | `history.test.ts` |
| minor | `/api/search?q=!!` returned 3 arbitrary sealed products | Queries with fewer than 2 non-space characters return nothing | not tested |

The reviewer also reported what came out clean: the import SQL and per-store
offer replacement; the `data.ts` tuples (all 7,255 slugs round-trip); every
page; and a build with no database.

**Premium map.** It corrected the brief:
- auth is custom OAuth plus a jose JWT, not NextAuth;
- there is no magic link and no middleware;
- there are two tiers;
- the webhook lives at the legacy path `/api/marketplace/stripe/webhook`;
- there is no per-market pricing.

Its porting gotchas all made it into OP Compare:
- `past_due` never entitles;
- `premiumUntil` is never written backwards;
- the session stays out of the root layout;
- redirects are built from `SITE_URL`.

---

## 6. Problems and fixes

In time order. These are the ones worth knowing next time; more are in
[PLAYBOOK §6, "Pitfalls and lessons"](PLAYBOOK.md#6-pitfalls-and-lessons). The
raw session notes were not kept. Rows marked "(sandbox)" are specific to the
Claude Code cloud sandbox.

| Time | Problem | Cause | Fix |
|---|---|---|---|
| 08:35 | 4 of RiftCompare's 172 retailers missing from the extraction | regex over `retailers.ts` source; a comment between fields, or a quoted key | **not fixed**; next time import `RETAILER_LIST` through `tsx` |
| 08:37 | TCGCSV returned HTTP 401 to Python `urllib` | TCGCSV rejects Python's default client | `curl` with a User-Agent, cached in `.cache/` via `TCGCSV_CACHE_DIR` |
| 08:39 | TCGCSV price archive returned 403 (CloudFront) | not reachable from the sandbox | no backfill; history starts at the first import. Trying from GitHub Actions is still open. |
| 08:49 | Danireon in-stock offers at 5.54× market; TAG 9 slabs in its feed | sealed and slab titles matching singles | sealed tightening at once; TAG/AGS only an hour later (review finding 4) |
| 08:49 | Sealed false positive: "Koala (Alternate Art) [Premium Booster -The Best-]" | bare "booster" fallback in the sealed classifier | fallback removed, exclusion regex added |
| 08:49 | 1,569 ambiguous match groups | event groups list stamped reprints under the main set's name and number | event stamp as a token (147 groups left at 08:50:34); bracket tokens and set-aware tie-breaking followed at 08:52 |
| 08:52 | GT Games matched 1,179 of 5,672 | BinderPOS titles have no card number | second match path on exact name + set (4,429) |
| 08:57 | Catalogue cache 3.7 MB against a 2 MB entry limit | one entry for 7,255 printings | tuples, derived slugs, then split into two entries |
| 09:04 | (sandbox) Screenshots: certificate errors, then proxy 405 on localhost | Playwright without the proxy; the proxy doesn't serve localhost | launch with the proxy and browse the container's non-loopback address (from `hostname -I`), with that address in the proxy `bypass` |
| 09:06, 09:39 | `Exit code 144` | `pkill -f`/`pgrep` patterns matched the session's own shell | kill by PID (from `ps` or `ss -ltnp`); start servers in the background |
| 09:16 | `/opengraph-image` failed to render; the dev log said 200 while curl got an empty reply | Satori can't parse `radial-gradient(1000px 500px at …)` and fails mid-stream | `radial-gradient(circle at 50% 0%, …)`. Check the bytes received and grep the server log for "failed to pipe response", not the logged status |
| 09:25 | (sandbox) `sleep 60` blocked | the harness forbids a foreground sleep | `until` loops in the background, or `Monitor` |
| 09:38 | Card OG image: "Expected <div> to have explicit display: flex" | mixed JSX text and expressions make several text nodes | single template-string text nodes |
| 09:46 | `make_interval(hours => $2)` failed | Postgres can't infer the parameter's type | `$2::int` |
| 09:49 | Hodges UK probe showed 0 | `probe-stores.ts` ignores configured handles | not fixed in the tool; the import was the real check |
| 10:01 | robots and sitemap still said opcompare.com | the server ran a build from before the change | rebuild, restart, re-check |
| 10:01 | Simulating a missing env var for a build | Prisma loads `.env` itself, so `env -u DATABASE_URL` does not simulate "no database" | `env -u NEXT_PUBLIC_SITE_URL npx next build` worked because `.env` lacks that variable; for "no database", move `.env` aside |
| 10:06 | 401 Games failed every import | **unverified**: the cap truncates silently; the failure was likely a transient or rate-limited page among 12 overlapping handles | `MAX_PAGES` 30, 3 handles. Still open: warn when a collection hits the cap; log the page and status on failure |
| 10:06, 10:21 | (sandbox) `Monitor` expired before the import finished | Monitor stops after 5 minutes with no events; an import takes about 6 | print progress lines, or re-arm the Monitor |
| 10:22 | PokéBox (AU) failed the last import | **not investigated**; the same unlogged failure path | rows kept |
| 10:31 | `stripe.accounts.retrieve()` TS2554 | stripe v23 needs an id there | `retrieveCurrent()` |
| 10:32 | (sandbox) production server killed | 30-minute limit on background tasks | restarted for the final QA |
| 10:39 | Production server 500s on anything that signs a session | `authSecret()` throws in production without `AUTH_SECRET` | append a random local `AUTH_SECRET` to `.env`, restart |
| 10:39 | `Cannot find module 'jose'` running a scratchpad script | the scratchpad is outside the repo, so `node_modules` doesn't resolve | copy the script into the repo root, run it, delete it at once |
| 10:39 | Deal Finder row-count grep returned 0 for every tier (false fail) | React inserts `<!-- -->` between adjacent text expressions in SSR HTML | grep with the separators (`'Save <!-- -->[0-9]*'`) or count in the DOM with Playwright |
| 10:43 | Write of `SETUP.md` refused: "modified since read" | earlier edits were made with sed/Python | Read, then Write |
| 10:46 | False "no hyphens" | `grep -P` failed with "character code point value in \x{} or \o{} is too large", and `\|\|` printed the success branch | a fail-closed Python check |
| 10:52 | Workflow script parse error (24:139) | unescaped backtick in a template literal | escaped and relaunched |
| 11:36 | All three background workflows stopped, notifications still saying "completed" | session usage limit | read `<failures>` and `agents_error` in each notification; resume after the reset |
| 12:22 | Workflow resume refused: "scriptPath must be a script path this tool returned, or a file you can already read" | the scripts lived under another project's `/root/.claude/projects/…` directory | copy the scripts into the scratchpad and resume with `resumeFromRunId` |

---

## 7. Metrics

### Imports

| Time | Scope | Stores | Offers | Failed | Duration |
|---|---|---|---|---|---|
| 08:48:57 | sample, first matcher | 6 | 7,382 | 0 | |
| 08:54:28 | sample, + name path | 6 | 15,801 | 0 | |
| 09:26:38 | RiftCompare-derived | 114 | 188,727 | 1 (games401) | ~3.5 min |
| 09:54:08 | new stores only | 121 | 142,610 | 0 | ~2.8 min |
| 10:06:44 | all | 235 | 333,062 | 1 (games401) | ~6 min |
| 10:22:25 | all, after review fixes | 235 | **365,516** | 1 (pokebox) | ~6 min |

### Store registry

| Point | US | CA | AU | UK | EU | SG | Total |
|---|---|---|---|---|---|---|---|
| RiftCompare retailers in `retailers.ts` | | | | | | | 172 |
| Extracted and probed (4 CA lost to the regex) | 43 | 50 | 28 | 24 | 12 | 11 | 168 |
| Passed (≥20 numbered listings) | 31 | 38 | 19 | 13 | 12 | 1 | 114 |
| Added by the store agent | +42 | +19 | +31 | +17 | +12 | 0 | +121 |
| Final | 73 | 57 | 50 | 30 | 24 | 1 | **235** |

### Cards with at least one in-stock offer, per market

| Time | Stores | US | CA | AU | EU | UK | SG |
|---|---|---|---|---|---|---|---|
| 09:26:38 | 114 | 6,959 | 5,386 | 4,794 | 2,630 | 2,037 | 0 |
| 10:06:44 | 235 | 6,963 | 5,722 | 5,540 | 3,528 | 3,605 | 0 |
| 10:21:34 (queried before the 10:22:25 import's aggregate ran) | 235 | 6,963 | 5,826 | 5,540 | 3,528 | 3,605 | 0 |

TCGplayer is stored as an in-stock US offer, so the US column is mostly
TCGplayer. Store-only US coverage was never measured. The UK gained 77% and
the EU 34% from the new stores. Coverage after the last full import's
aggregate was not queried.

### Tests and checks

- Tests: 38 → 42 → 45 → 65, in 11 files at the end: catalog, match, affiliate,
  no-ebay-api, theme, search, deploy-gate, nested-cache, domain, premium and
  history.
- Crawls: 443 pages + 1,500 links, 0 bad (09:41); 445 pages + 1,500 links,
  0 bad (10:41).
- Interaction tests: 10/10. Gating states: 4/4 as designed.
- Local database after 13 import runs: 245 MB (Neon's free tier is 0.5 GB).
  `Offer` alone was 379,142 rows and 192 MB with indexes. One history day file
  is 133,724 bytes.

---

## 8. Final state

**This section is OP Compare's state, not a task list for a new site.** For
the new site's hand-over, use
[PLAYBOOK §7](PLAYBOOK.md#7-acceptance-checklist-before-handing-to-the-owner)
(acceptance checklist) and
[PROMPTS §5](PROMPTS.md#5-claude-in-chrome-go-live-prompt-template) (Chrome
prompt template).

### OP Compare at `d71528b` (checked 12:36–13:00 UTC)

- **Size:** 7 commits; 191 tracked files and 22,360 lines; 34 `page.tsx` and
  14 `route.ts` under `src/app`; 65 tests in 11 files; 235 stores.
- **Prisma models:** 7 (Set, Card, Sealed, Offer, ImportRun, User, Meta).
- **GitHub workflows:** 6 (`ci`, `import-prices`, `production-deploy`,
  `search-console`, `indexnow`, `stripe-setup`), plus one Vercel cron.
- **Branches:** `git ls-remote` shows `main` at `d71528b`, as well as the
  claude branch, and `main` is the repo's default branch
  (`gh api repos/Specifxx/OpCompare --jq .default_branch`). The notes from
  11:25 found no `main`. Who created it, and when, is not recorded: the GitHub
  events API lists only two pushes, both to the claude branch (09:46:34 and
  10:45:51). One CI run on `main` succeeded at 11:36:26.
- **Not yet:** there is no `data` branch, so no import has run on GitHub.
  `https://opcompare.app/` returns HTTP 404 with
  `x-vercel-error: DEPLOYMENT_NOT_FOUND` (checked about 13:00): the DNS already
  points at Vercel, but nothing is deployed, so the site is not live.
- **Uncommitted, and still being written:** the admin parity and share-image
  work (§4, 11:06 onward). Until it lands on OP Compare's `main`, a new site
  starting from `d71528b` has **no admin pages and no price-guide share
  images**. Either port them from RiftCompare
  ([PROMPTS §4](PROMPTS.md#4-map-a-riftcompare-feature-for-porting)) or wait
  for the OP Compare commit; ask the owner which.
- **Docs:**
  - in the repo: `README.md`, `CLAUDE.md`, `DECISIONS.md`, `docs/SETUP.md` and
    `docs/CHROME-SETUP-PROMPT.md`;
  - outside it: the private Launch Kit Artifact
    (https://claude.ai/artifact/GZA3GpH38SDJW2kFDBrkgZ); the final Reddit post
    is also in Appendix A here.
- **Local-only files, never committed:**
  - a local `.env` (local database URL and secrets);
  - `.cache/` (TCGCSV);
  - `.data/history`;
  - the QA users.
- **Ephemeral, in the scratchpad only:** the eBay port spec and its notes
  (`scratchpad/ebay/`), and the QA and probe scripts. `replay.ts`, `crawl.mjs`
  and `qa-users.ts` are preserved in Appendix B; the store-merge script was
  never saved.

### Not ported, by decision

From README "Not ported (yet) from RiftCompare":
- email, so no price alerts and no trial reminders;
- decks and the deck builder;
- games;
- AdSense;
- social and ad marketing (U4 asked to skip it);
- the mobile app;
- Cardmarket as an EU source.

RiftCompare's Premium tools (deck watch, demand finder) have no One Piece
equivalent. Premium's tool is the Buy List Planner.

### Known issues found afterwards (from the architecture review)

None of these is fixed in `Specifxx/OpCompare` at `d71528b`. A new site copied
from it must fix them on day one; the files and fixes are in
[PLAYBOOK §2.3](PLAYBOOK.md#23-fix-these-in-the-template-before-copying-it).

- **Every page is dynamic.** The root layout calls `getCountry()`, which reads
  cookies and headers. That is the pattern RiftCompare's layout forbids, and
  it means no page gets full-page ISR. Pages still read only the Data Cache,
  so database transfer is protected. There is no DECISIONS entry for it.
- **The 2 MB cache budget is untested.** RiftCompare measured the safe raw size
  at about 1.2 MB.
- **`src/lib/buy-list.ts` cites `tests/buy-list.test.ts`**, which does not
  exist.
- **`src/lib/stripe.ts` hard-codes `"opcompare"`** instead of using
  `STRIPE_SITE`.
- **The history raw URL defaults to `Specifxx/OpCompare`** (`HISTORY_RAW` in
  `src/lib/data.ts`), overridable only through the undocumented
  `HISTORY_RAW_BASE`, and is pinned by `tests/history.test.ts`.
- **`CONTACT_EMAIL` falls back to RiftCompare's public address**, which
  `scrape.ts` sends to every store as its `From:` header.
- **Seven environment variables are undocumented.**
- **`vercel.json` does not turn off `claude/*` preview builds** the way
  RiftCompare's does.
- **The import cron comment is wrong.** The `import-prices.yml` comment says
  07:00 and 19:00, but the crons are `7 7 * * *` and `7 19 * * *`.
- **The Pandaman Art cards are classed as promo.** OP17's six '(Pandaman Art)'
  cards are labelled promo when they are not.
- **The market list is unrolled** into 12 `Card` columns, 12 `Sealed` columns,
  the aggregate and the loaders, so adding or removing a market touches all of
  them.
- **`MAX_PAGES` truncation is silent**, and a failed collection is logged
  without its page or status (§4, 10:00).

### Coverage gaps

- **Singapore:** 1 store and 0 in-stock cards.
- **PokéBox (AU):** failed on the last import; the cause is unknown.
- **Four RiftCompare CA stores never probed:** `altf4`, `cardbrawlers`,
  `hobbyexpert`, `6ixtcgsmarkham` (lost to the extraction regex).
- **The 114 RiftCompare-derived stores were never language-, slab- or
  currency-verified for One Piece.** Run `store-discovery/verify-stores.mjs`
  and the card-image check over them; Japanese stock behind English titles
  could be live and nothing would flag it.
- **Weak stores kept:** no store was removed for a low match rate. To review
  or remove: Do Big Things (65 cards from 1,962 products), CardCosmos (6/100),
  Burbank Sportscards (113/1,782), Frenly Bricks (26/262), Card Boyz (17/176),
  and Solacido (64/483, singles with bare card names, which RiftCompare's bar
  would reject).
- **The Mr.3 short-name match path:** suggested, not built.

### Left to the owner

1. **Run the Chrome prompt** (`docs/CHROME-SETUP-PROMPT.md`). It covers Neon,
   GitHub secrets, variables and permissions, the Vercel project and domain,
   the Google OAuth client and Discord app, a **separate** Stripe account, the
   first import and deploy, GA4, Search Console, Bing and IndexNow. **It has
   never been run end to end.** None of its UI paths (Neon, Google Auth
   Platform, the Stripe account switcher, Vercel Domains) was checked against
   today's UIs, and the claim that basic OAuth scopes need no Google review is
   the session's own, not verified; expect drift. The domain already resolves
   to Vercel (`DEPLOYMENT_NOT_FOUND`), and `.app` is HTTPS-only (HSTS
   preloaded), so nothing loads until Vercel issues the certificate.
2. **Answer its stop points:**
   - who goes in `ADMIN_EMAILS`. Setting it **replaces** the built-in admin
     list, so it must include every admin, the owner included, or the owner
     loses admin;
   - Stripe activation details;
   - any DNS record to delete;
   - whether to run the payment test;
   - whether to submit the affiliate forms.
3. **Commit and merge the post-11:06 work into `main`** (admin parity, share
   images) once it is built and verified. It rides the 08:00 UTC release; add
   `[deploy]` only if the owner says the release is urgent.
4. **GA4:** mark `buy_click` as a key event once it appears. This is in
   `SETUP.md` but not in the Chrome prompt.
5. **Search Console:** check the first *Search Console* workflow summary. If
   RiftCompare's property has no service account, create one first (§4,
   hand-over decision 4).
6. **Reddit:** read both subs' self-promotion rules first. Post **at least 7
   days after the first production import**, because "moved this week" needs a
   price 7 to 11 days old and there is no backfill. Check the homepage link
   preview before posting.
7. **eBay keyset (U16), if the owner goes ahead:**
   - a new "OP Compare" Production keyset, giving the GitHub secrets
     `EBAY_CLIENT_ID` and `EBAY_CLIENT_SECRET`;
   - in Vercel, `EBAY_VERIFICATION_TOKEN` and `EBAY_DELETION_ENDPOINT`;
   - optional GitHub variables `EBAY_QUOTA_RESERVE`, `EBAY_MAX_CALLS` and
     `EBAY_MIN_VALUE_CENTS`.

   **Order matters:** eBay won't issue Production keys until the
   account-deletion endpoint answers its challenge. So set the two Vercel
   values and deploy first, then register the endpoint and token with eBay and
   send a test notification, and only then copy the Production keys into the
   GitHub secrets. Note that the endpoint needs code that does not exist yet.

   This reverses "No eBay API at all", so `tests/no-ebay-api.test.ts` and
   OP Compare's CLAUDE.md must change in the same commit. The code does not
   exist yet; the spec is in the scratchpad (§4, 12:36:37).

---

## 9. Daily operation once live

The crons are listed in `docs/SETUP.md`. GitHub cron times drift, often by
several minutes.

| UTC | Job |
|---|---|
| 07:07 and 19:07 | import (`import-prices.yml`): catalogue, stores and history files committed to `data` |
| 07:20 | Stripe reconcile (Vercel cron) |
| 07:25 | Search Console |
| 08:00 | production release (`production-deploy.yml`) |
| 08:10 | IndexNow |

- **To add a store**, edit `src/lib/stores.ts`.
- **To change a price**, edit `src/lib/plans.ts` and run the *Stripe setup*
  workflow again. Checkout caches lookup-key prices for 10 minutes per
  instance (`priceIdFor` in `src/lib/stripe.ts`), so run *Production deploy*
  and *Stripe setup* back to back.
- **A changed Vercel env var does nothing until a production release.** Under
  the deploy gate a plain push won't build production: run *Production deploy*
  or wait for 08:00. `INDEXNOW_KEY` is read at build time by the force-static
  `/indexnow.txt`, which 404s without it, so set it before the first deploy.
- **Don't branch-protect `main` against the Actions bot:**
  `production-deploy.yml` pushes to it (`git push origin HEAD:main`).

### What to watch

- **Neon storage:** the local database is already 245 MB, about half the
  0.5 GB free tier (`Offer`: 379,142 rows, 192 MB).
- **Neon transfer:** OP Compare has no `egress-audit` workflow, unlike
  RiftCompare (`TCGEmpire:.github/workflows/egress-audit.yml`); check the
  Neon console by hand.
- **The `data` branch:** every import rewrites all 256 bucket files. The
  session's projection is roughly 115–120 MB at the 730-day cap. Check
  `gh api repos/Specifxx/OpCompare --jq .size` monthly. The repo must stay
  public, or the charts break.
- **Billing:** subscriptions with no matching OP Compare user appear only as a
  `console.warn` in Vercel logs (`[reconcile] subscriptions with no OP Compare
  user`); nothing emails anyone.
- **Store failures:** the import log's "N failed (…)" line.

---

## 10. What could not be sourced

- **The 41-test count at 09:54** is inferred as 38 + 3. The run output shows
  only the domain file passing.
- **Why U12 waited in the queue for 19 minutes** does not show in the
  transcript.
- **The catalogue cache size after the split** is about 0.6 MB per entry,
  according to the compaction summary. It was never re-measured.
- **Per-store match counts for all 235 stores** exist only in scratchpad logs,
  which are deleted with the session.
- **The store agent's interim file** held 117 stores at 09:47:04 (CA 18,
  EU 9) and its final report 121 (CA 19, EU 12), so the 4 late additions were
  1 CA and 3 EU stores. Which keys they were is not recorded.
- **The PokéBox failure cause, the 401 Games failure mechanism, the
  r/OnePieceTCG member count and both subs' promotion rules** were never
  checked.
- **Whether RiftCompare's Search Console property lists a service account**
  (§4, hand-over decision 4).
- **The verifier findings of the admin and share-image workflow** were not
  read for this log; the workflow was still running.
- **Who created OP Compare's `main` branch, and when**, is not recorded, and
  the GitHub events API does not show it.

---

## 11. If we did it again

Ask these in the first reply, before writing code. Each one maps to a
correction the owner had to make mid-build.
[PLAYBOOK §1](PLAYBOOK.md#1-decide-before-writing-code) has the full question
list.

1. **The domain.** Ask for the production domain, and whether it is already
   owned (U6). Never default to a guessed `.com`; every canonical URL, sitemap
   and workflow default depends on it.
2. **Run store discovery from minute one, in parallel** (U2). The parent's
   registry is biased to the parent's game: 114 of 168 probed stores passed,
   and the dedicated search added 121 more. Start `store-discovery/` alongside
   the scaffold, using regional directories rather than web search alone. Ask
   whether an empty market, like Singapore here, is acceptable.
   - Load the parent registry by importing `RETAILER_LIST` through `tsx`,
     never by a regex over source (4 stores were lost that way).
   - Put inherited stores through the same verification as new ones
     (language, slabs, currency, card images).
3. **Agree a parity checklist, then show the "not ported" list early** (U4, U7,
   U11, U14). Mark each parent feature as in, out or later:
   - accounts, Premium and Stripe, and which features are gated;
   - the admin pages;
   - the blog and SEO;
   - GA4, Search Console, Bing and IndexNow;
   - affiliates;
   - email (and with it any trial that needs reminder emails);
   - social marketing;
   - share images;
   - anything eBay-derived.

   Stripe, admin and share images all came back after they had been left out.
   Also ask how far the theme and logo may go toward the publisher's IP (U1
   asked to "change up the logo"). For Disney Lorcana, agree what is allowed
   (logos, characters, fonts, card art in the OG images) before designing.
4. **Decide what is shared and what is new, item by item** (U3, U7, U10). The
   rule that worked: anything that holds state, has an identity users see, or
   moves money is new. That covers the database, secrets, Stripe, OAuth
   clients, GA4 and the Search Console property. Reuse only public identifiers
   (the IndexNow key, the EPN campaign with a new subid prefix) and the Search
   Console service account with a fresh key, after checking that it exists.
   Use exact secret names: the owner said `GA_SA_KEY` and meant `GSC_SA_KEY`.
5. **Ask about departures from the parent's architecture up front** (U9). Here
   that was history in Git rather than Postgres, which only works because the
   repo is public. Ask whether the new site should keep the parent's
   static-layout rule, which OP Compare broke without a decision.
6. **Treat the hand-over format as a first deliverable** (U3, U5). If the owner
   won't set anything up by hand, the Claude in Chrome prompt and the variable
   tables are part of the product. Write them as the code is written, not at
   the end.
7. **Ask about launch communications on day one** (U8, U13). Is a post wanted?
   Agree:
   - the voice (team "we", proud launch, the parent as the MVP; for a third
     site, the voice can reference both RiftCompare and OP Compare);
   - which subreddits, and their rules: find the game's subreddits and read
     their rules before drafting;
   - style constraints, checked by a fail-closed script, and whether URLs are
     exempt from them;
   - the call to action;
   - when to post (after 7 days of history).
8. **Keep a running build log from the first commit** (U12). This file had to
   be rebuilt from a 40 MB transcript and an ephemeral scratchpad. Write the
   dated entries, metrics and tooling into the repo as they happen.
9. **Settle release semantics** with the owner. "Make the website" means
   landing on a branch. Agree who creates `main` and when, and don't use
   `[deploy]` unless the release is urgent.
10. **Things to do earlier ourselves:**
    - Spawn the correctness reviewer as soon as the matcher stabilises, and
      tell it the tree is moving. It found 9 real pricing bugs, some worth
      thousands of dollars per card.
    - After the first sample import, run a per-store price/market ratio audit,
      and act at once on every grader or false positive it surfaces.
    - Replay every stored listing after every matcher change.
    - Add the cache-size test.
    - Commit the replay and audit scripts instead of leaving them in the
      scratchpad (Appendix B preserves three of them).
11. **Expect the usage limit on a multi-hour build.** Keep workflow scripts
    somewhere resumable (the scratchpad or the repo, not another project's
    directory), check each notification's failures rather than its
    "completed" status, and let only one workflow edit a repo at a time.

---

## Appendix A. The final Reddit post (10:55:26, U13 voice)

Verbatim from `scratchpad/reddit.md` (409 words, 0 hyphen or dash
characters). It also lives in the Launch Kit Artifact.

> **Title:** We just launched OP Compare, a free One Piece price guide that compares 235 card shops in your own currency
>
> Hey everyone,
>
> We're really proud to finally launch OP Compare: https://opcompare.app
>
> Some of you might know RiftCompare, the price comparison site we built for Riftbound. That was our MVP. Running it taught us a lot about what players actually use, where prices go wrong and what was missing, and we took all of it and built OP Compare for One Piece from day one. It's a much more complete site than RiftCompare was when it launched.
>
> The heart of it is the price guide. Every English card is in there, over 7,000 printings, and every parallel, manga, SP, alt art, treasure rare and event stamp has its own line, so a base card and its alt art never get mixed up. You can sort the whole list by price, by set, or by how much it moved this week, and next to every card you see the TCGplayer market price and the cheapest price a real shop has it for in your country right now.
>
> A few things we learned from RiftCompare and built in from the start:
>
> We read 235 card shops across the US, Canada, Australia, the UK and Europe, plus TCGplayer, twice a day, and show every price in your own currency.
>
> We only show a shop's price when we can tell exactly which printing the listing is. If a listing just says "Shanks Manga" and that could be two different cards, we skip it. We'd rather show fewer prices than wrong ones.
>
> No graded slabs, no Japanese cards, no lots. Just raw English singles and sealed product.
>
> Every card has a price history chart, and the full history is public on GitHub for anyone who likes digging through data.
>
> The price guide, card pages, sets and sealed prices are all free, and you don't need an account to use them.
>
> We're keen for feedback, good or bad. Tell us if you spot a price matched to the wrong version of a card, if your local shop sells online and isn't on there yet, or if there's something you wish it did. Singapore is still thin because most shops we found there sell Japanese stock, so SG shop suggestions are especially welcome. Shipping isn't included anywhere yet either, so check postage before you buy.
>
> Thanks for checking it out, and good luck with your pulls!

Before posting, note: "the full history is public on GitHub" is true only once
the `data` branch exists, and the "no Japanese cards" claim rests on checks the
114 RiftCompare-derived stores never had (§8, Coverage gaps).

---

## Appendix B. QA scripts, preserved from the scratchpad

These ran against OP Compare at `d71528b`. They hold no secrets. Copy one into
the OP Compare repo root as a dot-file (for example `.replay.ts`), run it with
`npx tsx` (or `node` for `.mjs`), then delete it: module resolution needs the
repo root.

**`replay.ts`** (09:57–10:00): re-runs every stored store offer through the
current matcher and reports unchanged (`same`), newly skipped (`miss`) and
moved (`other`). Usage: `npx tsx .replay.ts <out.txt>`.

```ts
import { PrismaClient } from "@prisma/client";
import { buildCardIndex, buildNameIndex, cardNumbersIn, matchByName, matchCardTitle } from "./src/lib/match";
const db = new PrismaClient();
(async () => {
  const cards = await db.card.findMany({ select: { id: true, name: true, tcgName: true, number: true, variant: true, set: { select: { code: true, name: true, tcgName: true } } } });
  const nameIdx = buildNameIndex(cards.map((c) => ({ id: c.id, tcgName: c.tcgName, setNames: [c.set.name, c.set.tcgName] })));
  const idx = buildCardIndex(cards.filter((c) => c.number).map((c) => ({ id: c.id, name: c.name, number: c.number, variant: c.variant, setCode: c.set.code, setName: c.set.name })));
  const offers = await db.offer.findMany({ where: { source: { startsWith: "store:" } }, select: { productId: true, title: true, source: true } });
  const cardIds = new Set(cards.map((c) => c.id));
  const tag = new Map(cards.map((c) => [c.id, `${c.variant ?? "plain"} @${c.set.code}`]));
  let same = 0, miss = 0, other = 0, n = 0;
  const bySrc = new Map<string, number>();
  const ex: string[] = [];
  for (const o of offers) {
    if (!cardIds.has(o.productId) || !o.title) continue;
    n++;
    const r0 = matchCardTitle(o.title, idx);
    const byName = "id" in r0 ? null : matchByName(o.title, nameIdx);
    const r = byName != null ? { id: byName } : r0;
    if ("id" in r && r.id === o.productId) same++;
    else if ("id" in r) { other++; ex.push(`OTHER ${tag.get(o.productId)} → ${tag.get(r.id)} | ${o.title}`); }
    else { miss++; bySrc.set(o.source, (bySrc.get(o.source) ?? 0) + 1); if (ex.length < 400) ex.push(`${r.miss} ${o.source} ${o.title}`); }
  }
  console.log({ n, same, miss, other });
  console.log([...bySrc].sort((a, b) => b[1] - a[1]).slice(0, 15));
  require("fs").writeFileSync(process.argv[2], ex.join("\n"));
  await db.$disconnect();
})();
```

**`crawl.mjs`** (09:41 and 10:41): every non-card sitemap route, 250 random
cards, 60 random sealed products and some filter URLs, then up to 1,500
internal links found on them. Needs a server on `localhost:3000`.

```js
// QA crawl: every route, every set + blog post, a random sample of cards and
// sealed products (from the sitemap), then every internal link found on them.
const BASE = 'http://localhost:3000';
const sm = await (await fetch(BASE + '/sitemap.xml')).text();
const all = [...sm.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => new URL(m[1]).pathname);
const pick = (arr, n) => arr.sort(() => Math.random() - 0.5).slice(0, n);
const cards = all.filter(p => p.startsWith('/card/'));
const sealed = all.filter(p => p.startsWith('/sealed/'));
const others = all.filter(p => !p.startsWith('/card/') && !p.startsWith('/sealed/'));
const pages = [...others, ...pick(cards, 250), ...pick(sealed, 60), '/browse?q=luffy', '/browse?sort=price-asc&priced=1', '/browse?set=op01-romance-dawn&color=red', '/price-guide?sort=move&page=3', '/sealed?kind=Booster+Box&stock=1', '/feed.xml', '/robots.txt', '/manifest.webmanifest', '/opengraph-image'];
console.log('sitemap urls', all.length, 'checking', pages.length);
const bad = []; const links = new Set(); let i = 0;
async function check(p, collect) {
  try {
    const r = await fetch(BASE + p, { redirect: 'manual' });
    const t = r.headers.get('content-type')?.includes('html') ? await r.text() : '';
    if (r.status !== 200) bad.push(`${r.status} ${p}`);
    else if (/Rough seas|Application error|Unhandled Runtime Error/.test(t)) bad.push(`ERRTEXT ${p}`);
    if (collect && t) for (const m of t.matchAll(/href="(\/[^"#]*)"/g)) { const h = m[1].replace(/&amp;/g, '&'); if (!h.startsWith('/_next') && !h.startsWith('/api')) links.add(h); }
  } catch (e) { bad.push(`FETCH ${p} ${e.message}`); }
}
const pool = async (list, n, fn) => { let k = 0; await Promise.all(Array.from({ length: n }, async () => { while (k < list.length) await fn(list[k++]); })); };
await pool(pages, 8, (p) => check(p, true));
const extra = [...links].filter(l => !pages.includes(l));
console.log('internal links found', links.size, 'new', extra.length);
await pool(pick(extra, 1500), 8, (p) => check(p, false));
console.log('BAD', bad.length); console.log(bad.slice(0, 40).join('\n'));
```

**`qa-users.ts`** (10:38): upserts `qa-free`, `qa-plus` and `qa-premium`
users and signs a session token for each with the local `AUTH_SECRET`. Run
with `set -a; . ./.env; set +a; npx tsx .qa-users.ts`. The output path was the
session scratchpad; it is written here as `QA_TOKENS_OUT`. Never commit or
print the tokens.

```ts
import fs from "node:fs";
import { SignJWT } from "jose";
import { prisma } from "./src/lib/db";
(async () => {
  const secret = new TextEncoder().encode(process.env.AUTH_SECRET!);
  const out: Record<string, string> = {};
  const future = new Date(Date.now() + 30 * 864e5);
  for (const [k, tier, until] of [["free", "premium", null], ["plus", "plus", future], ["premium", "premium", future]] as const) {
    const u = await prisma.user.upsert({
      where: { email: `qa-${k}@example.com` },
      create: { email: `qa-${k}@example.com`, displayName: `QA ${k}`, googleId: `qa-${k}`, emailVerified: new Date(), premiumTier: tier, premiumUntil: until },
      update: { premiumTier: tier, premiumUntil: until },
    });
    out[k] = await new SignJWT({ sub: u.id }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1d").sign(secret);
  }
  fs.writeFileSync(process.env.QA_TOKENS_OUT ?? "/tmp/qa-tokens.json", JSON.stringify(out));
  console.log(Object.keys(out));
  await prisma.$disconnect();
})();
```

The original imported `jose` and `db` by absolute path into
`/home/user/OpCompare`; run from the repo root, the relative imports above
resolve the same modules. Send the cookies `oc_session=<token>` and
`oc_auth=1`.
