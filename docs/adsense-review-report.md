# AdSense low-value-content remediation — report (2026-09-27)

Branch: `claude/riftbound-database-improvements-tgpb28`. **Not deployed and not merged to `main`.** Merging to `main` would ship it with the next daily 08:00 UTC release.

## Stack (step 0)

- Next.js 14 App Router on Vercel, Prisma on Postgres (Neon).
- **Sitemaps:** `src/app/sitemap.xml/route.ts` is an index of nine child sitemaps, served by `src/app/sitemaps/[section]`. They are built in `src/lib/sitemap-sections.ts` (`core`, `cards`, `sets`, `domains`, `keywords`, `facets`, `champions`, `stores`, `content`).
- **Robots meta and canonicals:** each route's `generateMetadata` / `metadata` sets them through `pageAlternates()` (`lib/seo.ts`) and a `robots` object. Before this change, each route carried its own threshold (`FACET_THIN_THRESHOLD`, `STORE_THIN_THRESHOLD`, `CHAMPION_THIN_THRESHOLD`, `getCanonicalTwin`).
- **`robots.ts`:** unchanged. Nothing is blocked there, so Google can read every noindex.

## Indexable URLs, before vs after (with `ADSENSE_REVIEW_MODE` on)

"Before" is the live sitemap on 2026-09-27. For the rows marked (est.), "after" is computed from live data (see method notes). The other rows are exact.

| Sitemap | Before | After | Change |
|---|---:|---:|---|
| cards.xml | 1,442 | ~991–1,012 (est.) | −430 special printings folded into their base printing; up to 21 more if they have no listing ever |
| stores.xml | 162 | 157 | −5 stores with under 25 in-stock listings (acecollectibles, heavenscollectibles, reefsidegames, eclipsegames, levelupgames) |
| core.xml | 65 | 62 | −`/premium`, −`/auctions`, −`/cards/rarity` |
| facets.xml | 15 | 0 | all facet pages noindexed |
| champions.xml | 51 | 51 | — |
| keywords.xml | 30 | 30 | — |
| sets.xml | 12 | 12 | — |
| domains.xml | 7 | 7 | — |
| content.xml | 109 | 109 | 54 blog posts, 52 guides, 3 published decks |
| **Total** | **1,893** | **~1,420–1,440** | about −25% |

Method notes:

- **Cards.** Slugs encode the printing: `-promo`, a letter after the number (`066a`, `227s`), or a number above the set total. Classifying all 1,442 live slugs this way found 430 special printings that have a base printing and 9 that don't; the 9 stay indexed.
  - Showcase-rarity printings whose slug carries no marker aren't detected, so the real figure may be slightly lower.
  - "No listing ever" can't be read from the sitemap. 21 kept cards have no in-stock price, which is the upper bound.
- **Stores.** Counted from each live store page's own "N cards in stock".
- **Local check.** Against a seeded database, the review-mode sitemaps listed exactly the expected URLs. With `ADSENSE_REVIEW_MODE=false`, cards returned to 1,060 of 1,064 (4 duplicate rows) and facets to 14.

Card pages remain the largest share of the index (~70%). Each now has its own facts and price summary above the table (below).

## Route patterns that are noindex, follow while review mode is on

| Pattern | Rule | In sitemap |
|---|---|---|
| `/cards/type/*`, `/cards/rarity/*`, `/cards/printing/*` | facet: always, during review | no |
| `/cards/rarity` | facet index | no |
| `/browse?<any filter or sort>` | facet (canonical is already `/browse`) | no |
| `/browse?q=…` | search results (already before) | no |
| `/stores/<slug>` with < 25 in-stock listings | thin store | no |
| `/card/<slug>` that is a promo, Showcase, alt-art, Overnumbered or Signature printing and has a base printing | canonical → base printing | no |
| `/card/<slug>` with no listing ever recorded | empty state | no |
| `/card/<slug>` duplicate row (always, as before) | canonical → primary row | no |
| `/premium` | sales/checkout | no |
| `/premium/*`, `/login`, `/verify`, `/profile`, `/dashboard`, `/portfolio`, `/watching`, `/alerts/manage`, `/alerts/action`, `/admin/*` | private (already noindexed) | no |
| `/auctions` | third-party eBay feed, often empty | no |
| `/champions/<slug>` with < 4 cards, `/sets/<slug>` with 0 cards, `/decks/legend/*` with 0 decks | empty state (unchanged rules, now via the policy module where applicable) | no |

Missing entities already return a real 404 via `notFound()` (card, set, champion, store, keyword, domain, deck).

**Regional homepages** (`/`, `/uk`, `/au`, `/ca`, `/sg`, `/eu`) were checked live. Each has a self-referencing canonical and the same reciprocal hreflang set: `en-US`/`en` → `/`, `en-GB` → `/uk`, `en-AU`, `en-CA`, `en-SG`, fourteen `en-XX` EU tags → `/eu`, and `x-default` → `/`. No change was needed.

## What changed on pages

1. **Card pages:** an "at a glance" block above the price table, built only from data we hold:
   - rules text, type, domain, cost, set (linked) and rarity;
   - a link to each keyword printed on the card, the champion hub and the set;
   - a price summary: lowest in-stock price and store, the in-stock price range, stores tracked, and the date prices were last checked;
   - "Related guides": up to 3 articles that mention the card, its champion or its set in the title, tags or body, topped up by the existing attribute-based guide picker.
2. **Homepage and region homes:** "Guides & News" (the 6 newest posts, with dates and excerpts, plus "All news" and "All guides") straight under the price table. It measures ~1,165px down on a 1280×900 desktop and ~1,056px on a 390×844 phone. It replaces the two teaser rows near the bottom.
3. **Header:** Blog (as before) plus Guides from 1280px wide. At 1024px a fourth link pushed Sealed over Database (measured), so between 1024 and 1279 Guides stays in the always-open left rail. The phone menu gains Blog and Guides buttons near the top.
4. **Footer (every page):** the always-visible row now reads Blog, Guides, About, Contact & feedback, Privacy policy, Terms, Editorial policy, Methodology, Who writes this.
5. **Blog and guide posts:**
   - a visible breadcrumb trail (Home › Blog › title) matching the existing BreadcrumbList JSON-LD;
   - a byline "By <author> for RiftCompare" linking to /about, with Published and Updated dates;
   - four related articles instead of three;
   - a "Sets in this article" block linking the set pages the post names.
   BlogPosting/TechArticle JSON-LD and the automatic links to cards mentioned in the body were already there.
6. **/contact:** riftcompare@gmail.com, "We usually reply within 2 business days", and what to contact us about (price errors, missing stores, partnerships, account questions), above the unchanged form.

## Quality checks (step 5)

- **New crawler:** `scripts/check-site-quality.ts` (`npx tsx scripts/check-site-quality.ts [--url …] [--max N]`) reports broken internal links, indexable pages with missing or duplicate titles or descriptions, and placeholder text.
- **Production crawl, before these changes** (251 pages, 2,047 links):
  - 0 missing or duplicate titles, 0 missing or duplicate descriptions;
  - 2 broken links, both fixed:
    - `/embed/index` answered **500**: it exported `revalidate` while reading `request.url`. It is now force-dynamic behind its existing 30-minute CDN header.
    - `/embed` linked `/stores/STORE-SLUG` from a live example badge; the preview now uses a real store.
  - Placeholder text on the 6 homepages: the unreleased-set tile said "Coming soon". It now shows the release date.
- **Placeholder text elsewhere:** no lorem ipsum or TODO text anywhere in `src/`.
- **Ad slots:** there are no empty or reserved ad boxes. `AdSlot` renders a house promo linking our own pages whenever real units are off, and nothing on noindexed pages.
- **Local production build** (`npm run build` against a seeded database): passes. A crawl of it showed `/embed/index` 200. Its remaining 404s were links to Radiance cards and champions that don't exist in the local seed; production has them.

## Checks run

- `npm run typecheck`: clean.
- `npm run lint`: no errors.
- `npm test`: 2,526 pass, 0 fail, including the new `tests/indexing-policy.test.ts` (11 tests).
- `npm run adsense:guard`: 22/22.
- `npm run build`: passes.

Two existing tests were updated on purpose:

- `tests/card-always-indexable.test.ts` now asserts that with the flag off, only duplicates are noindexed.
- `tests/signup-funnel.test.ts` now pins the xl-only Guides header link.

## How to turn review mode off later

Set `ADSENSE_REVIEW_MODE=false` in Vercel → Settings → Environment Variables (Production), then redeploy. Facets, thin stores, special printings, never-priced cards, `/premium` and `/auctions` return to their previous indexing and sitemap behaviour on the next build. The card overview, the editorial sections, the nav, footer and contact changes, and the bug fixes are independent of the flag and stay.

This is not `NEXT_PUBLIC_ADSENSE_REVIEW_MODE`, which still controls the paywall and is still off by default. `lib/adsense.ts` no longer reads the bare name, so the indexing flag can never open the paywall.

## Files changed

- **New:**
  - `src/lib/indexing-policy.ts`, `src/lib/card-indexing.ts`
  - `src/lib/content/card-price-summary.ts`, `src/lib/content/card-articles.ts`
  - `src/components/CardOverview.tsx`
  - `scripts/check-site-quality.ts`
  - `tests/indexing-policy.test.ts`
  - `docs/adsense-review-report.md`
- **Indexing:**
  - `src/lib/sitemap-sections.ts`, `src/lib/adsense.ts`
  - `src/app/card/[id]/page.tsx`, `src/app/cards/{type,rarity,printing}/[…]/page.tsx`, `src/app/cards/rarity/page.tsx`
  - `src/app/stores/[slug]/page.tsx`, `src/app/champions/[slug]/page.tsx`, `src/app/browse/page.tsx`
  - `src/app/premium/page.tsx`, `src/app/auctions/page.tsx`
- **Content and navigation:**
  - `src/app/card/[id]/page.tsx`, `src/lib/keywords.ts`
  - `src/components/home/HomeSections.tsx`, `src/components/home/LatestPosts.tsx`
  - `src/components/Navbar.tsx`, `src/components/CinematicNavMenu.tsx`, `src/components/nav-groups.ts`
  - `src/app/layout.tsx`, `src/components/ArticleView.tsx`, `src/app/contact/page.tsx`
- **Fixes:** `src/app/embed/index/route.ts`, `src/app/embed/page.tsx`
- **Records:** `DECISIONS.md`, `docs/CURRENT-STATE.md`, `docs/DECISIONS-INDEX.md`
- **Tests:** `tests/card-always-indexable.test.ts`, `tests/signup-funnel.test.ts`

## Not done / worth knowing

- Card pages are still the bulk of the index. If the next review still objects, the next lever is:
  - noindexing cards whose only listings are out of stock (21 or fewer today), or
  - raising the store threshold (25 only removes 5 stores).
- Published user decks (3) remain in content.xml.
