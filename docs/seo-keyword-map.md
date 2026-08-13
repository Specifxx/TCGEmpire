# Keyword → URL Ownership Map

Purpose: one owner URL per search intent, so future content has a clear home and
doesn't accidentally compete with an existing page. When adding new content,
check this file first; when a query doesn't fit an existing cluster, add a new
row rather than letting two pages drift onto the same intent.

Legend: **Primary** = the page that should rank / gets internal-link weight for
that query. **Secondary** = a page that legitimately also touches the topic but
should NOT compete for the primary query (usually via a different angle, or an
explicit link up/down to the primary).

## Card & champion intent

| Query pattern | Primary URL | Secondary (different angle) |
|---|---|---|
| `<card name> riftbound` | `/card/<slug>` | — |
| `<card name> price` | `/card/<slug>` | — |
| `<champion> riftbound`, `<champion> riftbound cards` | `/champions/<slug>` | `/card/<slug>` for each individual printing |
| `<champion> deck riftbound`, `riftbound <champion> deck` | `/champions/<slug>` (deck section) if a real `META_DECKS` entry exists; otherwise `/decks` (browse) | `/deck` (builder) for a custom build |
| `riftbound deck`, `riftbound decks` | `/decks` (meta decks hub) | `/deck` (builder tool) — different intent (build vs. browse), keep both indexable, no canonical between them |

## Mechanic / keyword intent (see Task 4 precedent already shipped)

| Query pattern | Primary URL | Secondary |
|---|---|---|
| `riftbound <mechanic> explained`, `what is <mechanic> in riftbound` | `/guides/riftbound-<mechanic>-explained` | `/keywords/<mechanic>` links up to it |
| `riftbound <mechanic>` (reference/glossary intent), `<mechanic> riftbound cards` | `/keywords/<mechanic>` | Guide links down to it for the live card list |
| **Only 3 of 30 known keywords have this pair today: empower, flow, burn.** The other 27 in `ALL_KEYWORD_NAMES` (`lib/keywords.ts`) have NO verified rules text and NO page — do not draft one without a verified source (see backlog item 19). |

## Set / product-line intent

| Query pattern | Primary URL | Secondary |
|---|---|---|
| `riftbound <set name>`, `riftbound <set name> prices` | `/sets/<slug>` | — |
| `riftbound <set> card list` | `/guides/riftbound-<set>-card-list` (exists for Vendetta only today — `riftbound-vendetta-card-list`) — **backlog item 10**: build the same template for Origins/Origins: Proving Grounds/Spiritforged/Unleashed | `every-riftbound-<set>-card-revealed` blog gallery post (Vendetta only today) — the two are DIFFERENT angles (checklist guide vs. embedded live gallery), keep both when both exist |
| `riftbound card list` (no set named) | `/guides/riftbound-card-list` (all-sets hub — **not yet built, backlog item 12**) | — |
| `riftbound roadmap` | `/blog/riftbound-2027-set-roadmap` (exists — corrects the slug this file previously guessed at) | — |
| `riftbound sets in order`, `riftbound set list`, `how many riftbound sets` | `/guides/riftbound-sets-in-order` (added 2026-08-13) | Deliberately does not restate Legacy/The Reckoning/Set 8/9 facts — links out to the roadmap post for those instead, so the two can't drift apart |
| `riftbound origins card list`, `what's in the origins set`, `origins riftbound cards` | `/guides/whats-in-the-riftbound-origins-set` (added 2026-08-13) | Real rarity/domain/type breakdown computed from the catalogue, not estimated. Secondary: `/sets/origins` for the live browsable list |
| `riftbound card condition`, `nm lp mp hp riftbound`, `riftbound card grading` | `/guides/riftbound-card-condition-guide` (added 2026-08-13) | Distinct from `/guides/how-to-store-and-protect-riftbound-cards` (storage, not grading) — cross-linked both ways |
| `riftbound rarities` | **Decision needed** — either a new `/guides/riftbound-rarities-explained` hub, or fold into a beefed-up `/cards` intro. See backlog item 9. Existing `/cards/rarity/<rarity>` facet pages own the per-rarity queries either way. | `/cards/rarity/<rarity>` (per-rarity facet pages, already exist for Common/Uncommon/Rare/Epic/Showcase) |

## Rules intent

| Query pattern | Primary URL | Secondary |
|---|---|---|
| `riftbound rules` | `/guides/riftbound-rules-explained` (**not yet built — pure linking hub, backlog item 8**) | Links to Pre-Rift, sealed, banlist, empower/flow/burn |
| `riftbound prerift rules` | `/guides/riftbound-pre-rift-rules-explained` (exists) | — |
| `riftbound sealed rules` | `/guides/riftbound-sealed-rules-explained` (**not yet built — needs a verified rules source, backlog item 7**) | — |
| `riftbound banlist` / `riftbound ban list` | `/guides/riftbound-banlist-explained` (exists — prose + hand-curated slug list, NOT a DB-queryable ban flag; see backlog for why "is X banned" can't be a per-card FAQ) | `/blog/riftbound-july-2026-ban-list-update` (news angle on the same facts — keep distinct: guide = reference, blog = the update announcement) |

## Regional buying intent

| Query pattern | Primary URL | Notes |
|---|---|---|
| `buy riftbound cards australia` | `/blog/buy-riftbound-cards-australia` | Real: 19 AU stores tracked |
| `buy riftbound cards nz` | `/blog/buy-riftbound-cards-nz` | Real: 10 NZ stores tracked |
| `buy riftbound cards us` | `/blog/buy-riftbound-cards-us` | Real: ~19 US stores + TCGplayer + eBay |
| `buy riftbound cards uk` | `/blog/buy-riftbound-cards-uk` | Real: 14 UK stores + eBay |
| `riftbound singapore` | `/blog/riftbound-price-comparison-singapore` | Real: 11 SG stores |
| `buy riftbound cards canada` | `/blog/buy-riftbound-cards-canada` | Real: Canada landed as a full sixth market mid-pass (20 CA stores, CAD pricing, end-to-end) — this guide was rewritten to match the AU/NZ/US/UK/SG template with real data, replacing an earlier "honest interim" draft written before CA support existed. |
| `riftbound singapore/brunei/malaysia` | Existing SG post covers SG. Brunei/Malaysia — **not built**, same zero-infrastructure blocker as Canada (backlog item 6). | |
| `where to buy riftbound` (no market named) | `/guides/where-to-buy-riftbound-cards` (multi-market umbrella, exists) | Every regional post links back to this |

## Events / competitive intent

| Query pattern | Primary URL | Notes |
|---|---|---|
| `riftbound events`, `riftbound event locator`, `riftbound regionals` | **Not built** — `/events` hub is backlog item 13, blocked on a real data source (no `Event` model, no dataset beyond one blog post). Needs your decision. | `/blog/riftbound-2026-regional-qualifier-los-angeles` (the one real event post that exists today) |
| `gen con`, worlds-adjacent queries | No dedicated page — would live under `/events` once built | — |

## Comparison / community intent

| Query pattern | Primary URL | Notes |
|---|---|---|
| `riftbound vs [competitor]`, price-tool comparisons | `/learn/riftbound-price-tracking-tools-compared` (**not built** — needs real competitor research first, backlog item 15) | — |
| `riftbound online`, `riftbound simulator`, `tcgarena` | `/learn/riftbound-online-and-simulators` (**not built**, backlog item 16) | — |
| `riftbound reddit`, `riftbound discord`, `riftbound gallery` | `/learn/riftbound-community-hubs` (**not built**, backlog item 16) | — |
| `uvs riftbound`, `lorcana`, `mtg commander` (comparison) | `/learn/riftbound-vs-universus-lorcana-mtg` (**not built**, backlog item 16) | — |

## Price-modifier long-tails — deliberately NOT primary-targeted

Per the trend data's own finding: `riftbound singles`, `riftbound card prices`,
`riftbound cardmarket` etc. have near-zero search volume. These are NOT owner
queries for any page — they're served as secondary/incidental phrasing inside
card, champion, set and regional pages (which target the real-volume queries:
card names, champion names, mechanics, set names) via the price-comparison
modules embedded in those pages, never as a page's primary keyword target.

## Vendetta-cluster cannibalization audit (backlog item 25)

20 articles reference Vendetta in slug/title/tags (14 blog + 6 guide). Real
overlap clusters found, with a recommendation per cluster — **but the actual
301/consolidation is not executed in this pass**, because picking the URL to
keep requires real Search Console performance data this sandbox doesn't have
access to. Share that data and the redirects below can be wired same-day.

### Cluster A — "what's in the Vendetta set" (4 pages, real overlap)
- `/blog/riftbound-vendetta-everything-you-need-to-know` — evergreen master overview
- `/blog/every-riftbound-vendetta-card-revealed` — embedded live gallery (all 166 cards)
- `/blog/riftbound-vendetta-spoiler-season-complete-166-cards` — milestone/news angle ("spoiler season wrapped")
- `/guides/riftbound-vendetta-card-list` — text/checklist companion to the gallery

**Recommendation**: keep the gallery (`every-riftbound-vendetta-card-revealed`,
category blog) as the primary "what's in Vendetta" answer once real DB galleries
render — it's the highest-utility page (live, embedded, filterable). Fold
"everything you need to know" and "spoiler season complete" into it as sections
or 301 the weaker one of the two, and keep `riftbound-vendetta-card-list`
(guide) distinct only if it targets "card list" specifically as a text-search
term separate from "gallery"/"revealed" phrasing — otherwise merge it too.
**Needs your call on which URL has the real traffic before executing.**

### Cluster B — same-day early-release overlap (2 pages, published same day)
- `/blog/riftbound-vendetta-is-here-early-release` (2026-07-24)
- `/blog/how-to-start-buying-riftbound-vendetta-decks` (2026-07-24)

**Recommendation**: these have different enough angles (news: "it's trading
early" vs. actionable: "how to buy into the 3 archetypes") to coexist — lower
priority than Cluster A. Cross-link them explicitly if not already done rather
than consolidating.

### Cluster C — mechanic coverage overlap (not literally "vendetta" in slug, flagged anyway)
- `/blog/riftbound-vendetta-new-mechanics-flow-burn-empower` (all 3 mechanics, one post)
- `/guides/riftbound-empower-explained`, `/guides/riftbound-flow-explained`, `/guides/riftbound-burn-explained` (per-mechanic deep dives)
- `/keywords/empower`, `/keywords/flow`, `/keywords/burn` (reference pages — already de-cannibalized from the guides in a prior pass, see Task 4 history)

**Recommendation**: no action — the combined blog post serves "all 3 mechanics
at once" intent (a real, distinct query shape from "riftbound empower
explained"), and it already links out to each per-mechanic guide. Not a
cannibalization problem.

## How to use this file going forward

1. Before writing new content, search this file for the target query.
2. If a row exists and you're not the listed Primary, don't build competing
   content for that query — build the Secondary angle instead, or extend the
   Primary page.
3. If no row exists, add one before publishing, and note the Primary/Secondary
   split explicitly in the new content's front matter or a comment.
4. When in doubt about "which page should rank", the deciding question is
   **whose visible H1/title/meta-description already targets that phrase** —
   if two pages both do, that's the cannibalization signal to fix, not ship a
   third page next to them.
