# RiftCompare marketing plan — 21 Sep to 20 Dec 2026

The working copy of the plan agreed on 2026-09-21.

- `docs/OWNER-CHECKLIST.md` — **every step that needs a human**, in order, written
  for someone who does not code. Start there.
- `docs/OUTREACH-KIT.md` — the three email templates, targets and reply handling.
- `docs/PROMO-KIT.md` — the broadcast copy (posts you publish yourself).

**The constraints it was written under:** under $100/month, under two hours a week
of owner time, and one number to move — **traffic**. Reddit, Discord, creator
outreach and paid ads had all been tried. Ads produced barely any clicks at a cost
that didn't pencil. Creators replied and nothing came of it. The big Riftbound
community sites had never been contacted at all.

**This plan needs $0.** The budget was never the binding constraint; attention was.

---

## What the data actually said

Rewritten 2026-09-21 against the real Search Console export (28 days to
2026-09-19, `Pages` / `Queries` / `Countries` / `Chart`), which replaced the
figures this plan was first drafted from.

**177,656 impressions, 3,311 clicks, 1.86% CTR as exported.**

**Read that CTR as 2.03%, not 1.86%.** 50 of the 1,000 page rows are anchor
URLs — `…#what-is-empower-in-riftbound` and the like — carrying 14,580
impressions and *exactly zero clicks between them*. Those are Google's
jump-to-section links: the impression is logged against the fragment, the click
is attributed to the parent page. They can never show a click, so leaving them
in the denominator permanently understates the site's CTR. Excluding them:
3,311 clicks on 163,076 impressions. **Every CTR target in this plan is measured
with anchor rows excluded.**

**The site is growing fast, and the first draft of this plan did not know it.**
Splitting the 28 days in half:

| | first 14 days | last 14 days |
|---|---|---|
| Clicks/day | 56 | 179 |
| Impressions/day | 3,171 | 7,658 |
| CTR | 1.75% | 2.34% |
| Average position | ~9.5 | ~7.4 |

Clicks more than tripled and average position improved by two places across the
whole site, not just on one post. The inflection is 9 September. That means the
28-day total is a *lagging* number: the current run rate is already around
**5,000 clicks per 28 days**, so the original "6,000 in the launch month, floor
above 4,000" target was set against a baseline the site had already passed. The
targets below are restated.

**One page is still a quarter of everything.** `/blog/riftbound-radiance-leaked-mechanics`
took 911 clicks, 27.5% of the month, and it is a news spike that will fade.

**The pages that rank and are not clicked, in order of what they cost:**

| Page | Impressions | Clicks | CTR | Position |
|---|---|---|---|---|
| `/guides/riftbound-empower-explained` | 9,156 | 92 | 1.00% | 6.3 |
| `/guides/riftbound-banlist-explained` | 8,519 | 16 | 0.19% | 8.6 |
| `/sets/unleashed` | 4,289 | 51 | 1.19% | 8.2 |
| `/blog/most-expensive-riftbound-cards` | 3,237 | 55 | 1.70% | 8.6 |
| `/guides/riftbound-flow-explained` | 3,150 | 43 | 1.37% | 5.9 |
| `/guides/riftbound-vendetta-crystal-rose-cards` | 2,705 | 31 | 1.15% | 7.3 |
| `/sets/origins` | 2,604 | 15 | 0.58% | 10.7 |
| `/guides/every-ahri-card-in-riftbound` | 2,398 | 38 | 1.58% | 8.8 |
| `/blog/riftbound-t1-worlds-champion-collection` | 2,128 | 8 | 0.38% | 8.6 |

**The ban-list page is the exception that was investigated and left alone.**
Seven ban-shaped queries (`riftbound ban list` 1,911, `riftbound banlist` 1,644,
`riftbound banned cards` 683, `riftbound bans` 423 and three more) total **5,482
impressions and 8 clicks** at an average position of 8.5 — 0.15% where a normal
result at that position takes 1.5–2%. It looks like the flagship opportunity in
this export. It is not, and three checks say so:

- **Its snippet is already right.** The title is "Riftbound Ban List 2026: Every
  Banned Card" and the description names both formats, Riot's stated reason and
  live prices. This is the page the intent-matching lesson came from, already
  fixed in an earlier pass, and three of its strings are test-pinned.
- **It is not competing with itself.** The guide takes 8,519 of the 8,767
  ban-query impressions; the two ban blog posts take 192 and 41. Google has
  cleanly picked one canonical answer, which is what the keyword map wanted.
- **So what is left is the results above it** — Riot's own announcement, Reddit
  threads, and very likely an inline answer. "Which cards are banned" is a
  question Google can answer in the results page without anyone clicking.

The honest read is that these 5,482 impressions will not convert much better
through snippet work, and promising otherwise would be inventing a win. The page
already offers the one thing an inline answer cannot — a live price on each
banned card — and it already says so. Leave it; spend the effort on the
truncated descriptions below, where the cause is known.

**The guides section has a snippet problem and the blog does not — and position
rules out every other explanation.** Grouping all 1,000 page rows by section,
with anchor rows separated out:

| Section | Impressions | Clicks | CTR | Avg position |
|---|---|---|---|---|
| `/guides` | 42,364 | 498 | **1.18%** | **7.8** |
| `/blog` | 33,727 | 1,311 | **3.89%** | **7.8** |
| `/card` | 27,626 | 115 | 0.42% | 7.3 |
| `/sets` | 13,656 | 245 | 1.79% | 9.1 |
| `/champions` | 10,096 | 136 | 1.35% | 7.9 |
| `/keywords` | 6,884 | 20 | 0.29% | 9.4 |
| `/games` | 2,665 | 215 | 8.07% | 5.4 |

Guides and blog sit at **the same average position, 7.8**, on the same domain,
with the same authority — and blog converts **3.3 times better**. Ranking does
not explain it. The snippet does, and the difference is measurable:

| | Guides (1.18%) | Blog (3.89%) |
|---|---|---|
| Descriptions over the 155-char cap | **35 of 52 (67%)** | **13 of 50 (26%)** |
| Average description length | 175 | 160 |
| Titles containing a number | 2 (4%) | 13 (26%) |

Two-thirds of guide descriptions ship with their last sentence amputated.
**29,875 impressions — 18% of the site's total — sit on articles whose
description is cut off mid-sentence in the results page.** That is the largest
single fixable thing in this data, and it is why
`tests/description-length.test.ts` exists as a ratchet rather than a suggestion.

**What was checked and needs no fix.** Not every low-CTR page has a snippet
problem, and four templates were examined before concluding that: `/sets`
already builds its title longest-first and caps its description at 155 (its low
CTR is position — Origins sits at 10.7, page two); `/gallery`'s title is
"Riftbound Card Gallery: All N Cards by Set", an exact match for the query it
loses, so that too is position at 9.9; `/keywords` descriptions were *suspected*
of overflowing and do not — the template already truncates the long on-page
answer to 96 characters before appending the card-list promise, and all 30 land
under 155; and `/card` is the most heavily tuned template on the site with its
own title ladder and tests. `/card` converting at 0.42% from position 7.3 is the
one number in this table with no explanation yet, and it is 27,626 impressions,
so it is the obvious subject of the next pass — but changing that template on a
hunch, without knowing what outranks it for card-name queries, would be guessing.

**23% of impressions come from markets the site does not price for.** 35,027
impressions and 736 clicks from outside the six tracked markets, concentrated in
South-East Asia — the Philippines alone is 5,483 impressions, then Thailand
2,399, Malaysia 2,281, Indonesia 1,766, Hong Kong 1,242 — plus New Zealand at
1,614. This is not in scope for the 90 days and is recorded as a finding, not a
recommendation: adding a market means real store coverage, not a currency toggle.

**The US is the weakest of the big markets, not the strongest.** It is 32% of
impressions and converts at 1.62% from position 8.28, against Australia 3.01%,
Germany 2.80%, Canada 2.66% and Singapore 2.64%. The eurozone markets convert
well everywhere — France 3.49%, Italy 3.24%, the Netherlands 2.89%.

So there were four findings, and the plan is just those four in order:

1. A **demand window opening in four days** (Radiance Preview Season, 25 Sep –
   9 Oct) that the site's own top queries are already asking for.
2. **Tens of thousands of monthly impressions already earned and not converted**,
   fixable by editing titles rather than by earning anything new.
3. **Working distribution machinery switched off by account settings** — bulk
   email reaching 1 of 263 accounts because of a Brevo IP allowlist; Bing never
   verified; the index-coverage workflow with no key.
4. Exactly **one channel that genuinely needs a human**, which is the one never
   used.

---

## A — Own the Radiance window

Most of this was already built; the work was running it, and wiring the front door.

**Shipped 2026-09-21:**

- The homepage's next-set line now links the reveal tracker
  (`spoilersHrefForSet`, `NextSetCountdownCard`). It names no set and retires on
  the street date by itself.
- The daily Discord post leads with the tracker during the run-up, and reverts to
  the Riftle-only post on release day without an edit.
- The Friday promo pack carries the tracker on all three channels (Reddit, X,
  Discord), so the seasonal post writes itself.
- `tests/set-window-promotion.test.ts` pins all three, and pins that none of them
  names a set in code — every one of these surfaces has rotted before by
  hardcoding the set of the moment.

**Owner cadence during preview season:** press `set-pipeline` Mon/Wed/Fri (two
minutes); post the **tracker** link — not the leak post — in r/Riftbound and the
Discords on the two or three biggest reveal days.

**Target:** by 9 Oct the tracker is the site's #1 page by clicks. By release day,
the tracker plus `/sets/radiance` together exceed the leak post's 857.

**Release day:** per `docs/SET-LAUNCH-RUNBOOK.md`. Decide on the day from Search
Console whether the tracker's title flips to the past-tense "every card revealed"
shape or 301s to `/sets/radiance` — the Vendetta survivor pattern.

---

## B — Claim the clicks already earned

The cheapest traffic there is, because the impressions are already there.

- **FAQ retrofit.** `faq` on an article is the single source for both the visible
  FAQ section and the `FAQPage` JSON-LD, which widens the SERP footprint of a page
  that already ranks. 33 of 101 published articles had none. Every question and
  answer is generated from the article's own body and held to a **verbatim
  evidence span** copied out of that body, then adversarially fact-checked against
  it — the anti-fabrication device for the data-accuracy rule. A pair whose
  evidence isn't verbatim is thrown away, not repaired.
- **Snippet rewrites** on the pages that rank and aren't clicked. The lesson is the
  banlist page: the queries wanted a *list*, the title said *Explained*. Match the
  query intent, not the article's internal framing. Descriptions are hard-capped
  at 155 characters, because longer ones ship truncated mid-sentence. Nine pages
  are done — the six country buying guides, the comparison-sites listicle, the
  banlist guide and singles-vs-sealed. Two of the old titles carried store counts
  that disagreed with their own article body; those are gone rather than
  corrected, since an unverifiable number in a title earns nothing.
- **48 articles still ship a truncated description**, which is a real CTR drag
  across the catalogue and the largest single piece of work left in this
  workstream. It is deliberately NOT a bulk edit: which ones to rewrite, and
  toward what intent, comes from the Search Console "Pages" export (see
  `docs/OWNER-CHECKLIST.md`, Part 4). `tests/description-length.test.ts` holds
  the count at 48 as a ratchet so it cannot grow while that waits, and fails if a
  batch is fixed without lowering the budget. The right value is 0.
- **Orphan fix** — done 2026-09-21 by the SEO review pass;
  `tests/internal-links.test.ts` now fails on any orphaned article.

---

## C — Switch on what's built but blocked

Account settings, not code. The highest return per minute in the plan, and it is
the owner's to do:

| Action | Where | Why |
|---|---|---|
| Turn off Brevo "Authorised IPs" | Brevo → Security | Bulk email is rejected from Vercel's rotating IPs. The last campaign reached **1 of 263** accounts |
| Verify Bing Webmaster, set `BING_SITE_VERIFICATION` | bing.com/webmasters + Vercel env | Bing feeds DuckDuckGo and Yahoo, and IndexNow — live here for 84 days — is Bing's own protocol |
| Add the `GSC_SA_KEY` secret | Google Cloud → GitHub secret | `gsc-index-coverage.yml` is built and has never run |
| Mark `buy_click` a GA4 key event | GA4 → Admin → Events | Without it the site's best session (search → store in 8s) is recorded as a bounce |

The referral programme was checked and is **already on** (`REFERRAL_PREMIUM_DAYS`
defaults to 3) — no action.

---

## D — The one human channel

Three or four partnership emails a month, brand-anchor links only. Full templates,
targets and reply handling in `docs/OUTREACH-KIT.md`.

**Shipped 2026-09-21 to make it possible:**

- **`/embed`** — a public directory of the three embeddable widgets, with
  copy-paste snippets. The widgets had been live for months with nothing anywhere
  describing them; the outreach ask is "here's a widget your readers would want",
  which needs a URL a webmaster can actually open.
- **`/admin/store-partners`** — mint a store's repricing-report link from a form.
  The report route and its token API both existed; nothing called the API, so the
  only way to give a store their report was to hand-craft an authenticated POST.
  That blocked the entire store-outreach channel on a developer.

**Target:** 6–8 new referring domains by 20 Dec, at least three Riftbound-specific.

---

## The weekly rhythm

| Runs itself | Owner |
|---|---|
| Daily Discord post, daily market report, auctions refresh, sitemap + IndexNow on every card change, price-drop / trial / checkout-recovery / release-day emails, Riftle and leaderboards | — |
| Friday promo pack, emailed ready to paste | **Paste it.** 10 min |
| `set-pipeline` (manual button) | **Press it** Mon/Wed/Fri in spoiler season, weekly otherwise. 2 min |
| — | **One partnership email**, Tuesday. 25 min |
| — | **Reveal-day post** on big reveal days only. 15 min |

Roughly 60–90 minutes in a normal week, about two hours in a spoiler-season week.

---

## What not to do, and why

Each of these is grounded in this site's own measured history, not in general
advice:

- **No paid ads.** Tried; the cost per click doesn't pencil against what a visitor
  is worth.
- **No creator sponsorships.** $100 buys nothing, and the reciprocity route costs
  nothing and reaches the same people.
- **No Radiance article blitz.** Of ~24 Vendetta pre-release articles, 13 were
  301'd within eight weeks. Every survivor had live data in it. One tracker, one
  what-we-know, the set hub, the pre-order page — and nothing else unless only
  this site could compute it.
- **No new nudges, popups or pricing changes during the window.** The freeze of
  2026-09-14 stands. The 78%-dismiss popup already proved a nudge can *cost*
  traffic.
- **Don't retitle the leak post toward "spoilers".** It holds 857 clicks. The
  tracker earns that query on its own (`docs/seo-keyword-map.md`).
- **No fabricated TCG content and no scalping framing.** Both are test-enforced.

---

## Measurement

Every number is compared against **this site's own before**, never an industry
benchmark — the rule in `docs/homepage-measurement.md`. All CTR figures exclude
anchor-URL rows, for the reason given at the top.

**The baseline moved.** These targets were restated on 2026-09-21 once the real
export showed the site running at ~179 clicks/day, not the ~110/day the 28-day
total implies. A target the site has already passed teaches nobody anything.

| Metric | Source | 28d to 19 Sep | Current run rate | 90-day target |
|---|---|---|---|---|
| Google clicks, 28d | Search Console | 3,311 | ~5,000 | **9,000 in the Radiance launch month**; a post-launch floor above 6,000 |
| Site CTR, anchors excluded | Search Console | 2.03% | 2.34% | ≥2.8% |
| Top page's share of clicks | Search Console | 27.5% (the leak post) | — | under 15%, by the rest growing rather than it falling |
| Top page by clicks | Search Console | leak post (911) | — | tracker / `/sets/radiance` |
| CTR on the 14 rewritten pages | Search Console | 0.89% weighted (42,328 impr, 375 clicks) | — | ≥2.5% weighted, i.e. **+683 clicks/month** |
| Average position | Search Console | 7.4 (last 14d) | — | hold under 8 while impressions grow |
| Referring domains | Search Console / Bing | — | — | +6–8, ≥3 Riftbound-specific |
| Bing clicks | Bing Webmaster | 0 (unverified) | — | non-zero, then trend |
| Email deliverability | campaign summaries | 1 of 263 | — | ≥95% delivered |
| **Guardrail** | GA4 | — | — | `buy_click` and pages/visitor must not fall |

Reported at the end of each phase: 25 Oct, 25 Nov, 20 Dec, split by page.

**Do not report bounce rate.** It punishes the site's best outcome — a visitor
who searches, clicks through to a store in seconds and leaves.

**Do not read the 28-day total as the run rate** while the site is growing this
fast. Compare the last 14 days to the 14 before them, which is what surfaced the
tripling in the first place.
