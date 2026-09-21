# RiftCompare marketing plan — 21 Sep to 20 Dec 2026

The working copy of the plan agreed on 2026-09-21. `docs/OUTREACH-KIT.md` holds
the email templates it refers to; `docs/PROMO-KIT.md` holds the broadcast copy.

**The constraints it was written under:** under $100/month, under two hours a week
of owner time, and one number to move — **traffic**. Reddit, Discord, creator
outreach and paid ads had all been tried. Ads produced barely any clicks at a cost
that didn't pencil. Creators replied and nothing came of it. The big Riftbound
community sites had never been contacted at all.

**This plan needs $0.** The budget was never the binding constraint; attention was.

---

## What the data actually said

Search Console, 28 days to 2026-09-21: **164,892 impressions, 3,097 clicks, 1.88%
CTR**.

- **857 clicks — 28% of the month — came from one page**, the Radiance
  leaked-mechanics post, and it is a fading news spike.
- The site's #2, #3, #5 and #6 queries after its own name are all *radiance
  spoilers / leaks / card list*.
- Pages that already rank are not being clicked: the banlist guide had **8,313
  impressions and 16 clicks** (0.2%); the empower guide 17,695 and 85.
- Google is the traffic engine. Nothing else is close. Reddit's only measurable
  win was that same spike.

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
  at 155 characters, because longer ones ship truncated mid-sentence.
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
benchmark — the rule in `docs/homepage-measurement.md`.

| Metric | Source | Now | 90-day target |
|---|---|---|---|
| Google clicks, 28d | Search Console | 3,097 | 6,000 in the launch month; a floor above 4,000 after |
| Top page by clicks | Search Console | leak post (857) | tracker / `/sets/radiance` |
| CTR on the retitled pages | Search Console | 0.2–1.9% | ≥2.5% weighted |
| Referring domains | Search Console / Bing | — | +6–8, ≥3 Riftbound-specific |
| Bing clicks | Bing Webmaster | 0 (unverified) | non-zero, then trend |
| Email deliverability | campaign summaries | 1 of 263 | ≥95% delivered |
| **Guardrail** | GA4 | — | `buy_click` and pages/visitor must not fall |

Reported at the end of each phase: 25 Oct, 25 Nov, 20 Dec, split by page.

**Do not report bounce rate.** It punishes the site's best outcome — a visitor who
searches, clicks through to a store in seconds and leaves.
