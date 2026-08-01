# SEO Content Backlog — Trend-Driven Content Layer

Source: Google Trends export, 30 Jul 2026 (see the original task brief for the full
query/topic list). Scored on three axes:

- **Demand** — 1 (low) to 5 (very high), from the trends data (absolute volume for
  evergreen queries, breakout/% for rising ones).
- **Effort** — 1 (hours) to 5 (multi-day, needs new infra/data sourcing).
- **Gap severity** — how bad the current state is: 5 = no page exists and the
  intent is currently unserved or served by a competitor; 1 = already well covered.

**Data-availability flag** is the important fourth column: several brief items
describe content that would require inventing card names, decklists, ban
entries, tournament results, or market infrastructure that doesn't exist in this
codebase today. Those are marked 🚫 and are *not* implemented — see the notes.
Items marked ✅ are implemented in this pass. Items marked 🟡 are partially
implemented or scoped down to what real data supports.

**Mid-pass correction, same day:** the initial survey (which this table was
built from) found Canada had zero pricing/store infrastructure and that 9 of
the 15 trending champions had zero card data. Concurrent work on `main` during
this same pass added Canada as a full sixth market (20 real CA stores, CAD
pricing, end-to-end) and imported real cards for Akali, Zed, Renekton, Mel and
Kennen. Both findings below have been corrected in place rather than left
stale — the `/blog/buy-riftbound-cards-canada` guide was rewritten to a real
regional guide (matching the AU/NZ/US/UK/SG template) instead of the honest
"we don't have this yet" interim version originally published, and those 5
champions were added to the `CHAMPIONS` allowlist in `lib/champions.ts` so
their hub pages go live with real data. This is exactly the kind of drift a
concurrent-development environment produces — re-verify anything in this
backlog against the live `Country`/`CHAMPIONS`/retailer data before acting on
it if more time has passed since this was written.

## Scoring table

| # | Item | Demand | Effort | Gap | Status | Notes |
|---|---|---|---|---|---|---|
| 1 | Card page template upgrade (H2s, extra FAQ, JSON-LD) | 5 | 2 | 2 | ✅ done | Template was already strong (Product/Offer/AggregateOffer/FAQPage/BreadcrumbList, ~150–500 words/card, similar-cards/decks/printings rails). Added: explicit H2 over price-comparison+history block, a "Rarity, prints & variants" H2 section, and one new FAQ ("Is the {Signature/Overnumbered/Crystal Rose} printing worth it?") that only renders when a real comparable base-printing price exists. |
| 2 | Seed/verify the 27 named spiking cards exist | 5 | 3 | — | 🚫 not verifiable here | No live `DATABASE_URL` in this sandbox — cannot query the production DB. **Action needed from you**: run `SELECT name, slug FROM "Card" WHERE name ILIKE ANY (ARRAY['Crystal Rose Sona','Lacerate','Seat of Power', ...])` against production and report back which of the 27 are missing before any content references them by name. |
| 3 | Champion hub template upgrade (real prose, deck cost, attribution) | 5 | 3 | 4 | 🟡 partial | Added real per-champion domain-distribution prose and, where a real `META_DECKS` entry exists, resolved build cost + tier + domains + tournament source attribution (previously the page showed a bare deck name/archetype with none of that). **Cannot** honestly add "2–3 decklists" for 9 of the 15 named champions — see item 4. |
| 4 | 9 of 15 trending champions have zero real data | 5 | 3 (updated) | 3 (updated) | 🟡 improved mid-pass | **Updated**: real cards for Akali, Zed, Renekton and Mel landed on `main` during this pass (plus Kennen, not in the original 15) and have been added to the `CHAMPIONS` allowlist — their hub pages now render with real card grids. Still genuinely zero data for **Ambessa, Illaoi, Kayle, Nasus, Gangplank** (5 of the original 15) — check the live corpus again before adding them. Jayce/Sona/Shen (already allowlisted) still have only 1 tracked printing each — thin pages regardless of prose. Building "2–3 decklists" for any of these remains fabrication unless a real `META_DECKS` entry exists — only Irelia and Diana have one among the 15. |
| 5 | Canada buying guide | 4 | 1 (updated) | 1 (updated) | ✅ done | **Updated**: Canada landed as a full sixth market on `main` during this pass — real `CA` in the `Country` type, `lowestPriceCentsCa` column, 20 real Canadian retailers, full price-import pipeline support, `CA` in `stores/tracked`'s `MARKETS` and the marketplace launch-country list. `/blog/buy-riftbound-cards-canada` was rewritten to a real regional guide matching the AU/NZ/US/UK/SG template (20 named CA stores, CAD pricing framing) — the originally-published "honest interim" version (written before this landed) would now be actively wrong if left in place. |
| 6 | Singapore/Brunei/Malaysia guide | 3 | 2 | 2 | 🚫 skipped this pass | Existing `riftbound-price-comparison-singapore` post already covers SG (11 real stores). Brunei/Malaysia have the same "zero infrastructure" problem as Canada (no `BN`/`MY` in `Country`, no local stores tracked) — same "needs your decision" flag, lower demand (Brunei/SG rank high on RELATIVE search interest per capita, which Trends reports as an index, not raw volume — worth noting since it can overstate absolute opportunity vs. a market like Canada). Deferred to keep this pass scoped; same infra prerequisite as Canada. |
| 7 | `/guides/riftbound-sealed-rules-explained` | 4 | 3 | 4 | 🚫 needs a verified source | `lib/keywords.ts`'s own DATA-ACCURACY RULE (quoted in full below) forbids drafting rules content without verified official source text or explicit sign-off. Riftbound's Pre-Rift sealed guide already exists (`riftbound-pre-rift-rules-explained`), but a **general** sealed-format guide covering pack count/deck construction/legal pool differs from Pre-Rift specifically and needs the same sourcing discipline. **Needs your decision**: supply Riot's Comprehensive Rules PDF/URL (or confirm an existing verified source) and this becomes a same-day write. |
| 8 | `/guides/riftbound-rules-explained` hub | 3 | 1 | 3 | ✅ doable, deferred | Pure internal-linking hub (links to already-published Pre-Rift/Empower/Flow/Burn/banlist guides) — no new rules claims needed. Not built this pass purely on scope/time; flagged as low-effort, do-next. |
| 9 | `/guides/riftbound-rarities-explained` vs. existing rarity content | 3 | 2 | 2 | 🚫 needs your call | A card-rarity-facet page framework already exists (`/cards/rarity/{rarity}`, one per rarity: Common/Uncommon/Rare/Epic/Showcase). Whether "riftbound rarities" (the aggregate query, not per-rarity) needs a **separate** hub URL or should just get a beefed-up `/cards` intro section is a cannibalization judgment call — see the keyword map file for the concrete recommendation and the decision this needs from you. |
| 10 | `/guides/riftbound-spiritforged-card-list` + Origins/Proving Grounds/Unleashed card-list pages | 4 | 3 | 3 | 🚫 not attempted this pass | The Vendetta card-list template (`every-riftbound-vendetta-card-revealed` blog post, `riftbound-vendetta-card-list` guide) is real and reusable, and the static seed *does* have OGN/OGS/SFD/UNL cards to build from — this is legitimately buildable without fabrication. Deferred purely on time budget within this pass; concrete next step, not blocked. |
| 11 | `/blog/riftbound-set-roadmap-2026` | 3 | 4 | 3 | 🚫 needs your input | "Confirmed and rumoured sets, release dates" is exactly the kind of content your constraints forbid guessing at ("never invent... release dates"). **Needs your decision**: give me the actual confirmed/rumoured roadmap (or a citable official source) and I'll draft it same-day. |
| 12 | `/guides/riftbound-card-list` all-sets hub | 3 | 1 | 3 | 🚫 deferred | Same reasoning as #8 — a real, buildable internal-linking hub over existing (or #10's new) set-specific card-list pages. Not built this pass on time budget. |
| 13 | `/events` hub with searchable locator | 3 | 5 | 5 | 🚫 blocked on data | **Confirmed zero events infrastructure anywhere**: no `Event`/`Tournament`/`Regional` model in `schema.prisma`, no events lib file, and exactly **one** piece of event content in the entire repo (`riftbound-2026-regional-qualifier-los-angeles`, a single blog post, prose-only). A "searchable/filterable store-event locator" with a real calendar and `Event` JSON-LD needs a genuinely new data model and a real event dataset — not something to fabricate. **Needs your decision**: is there a real events data source (Riot's own event locator, UVS Games' schedule, a Google Calendar you maintain) I can ingest, or is this a "build the model, backfill it by hand as events are announced" project? |
| 14 | `/sealed/accessories` + `/guides/riftbound-playmats` | 3 | 3 | 3 | 🚫 not attempted this pass | Real trend signal (playmats/sleeves/deck boxes rising). Would need either (a) new `Product`-adjacent inventory in the existing sealed-import pipeline for accessory SKUs, or (b) a lighter editorial-only page linking out to affiliate searches (same pattern as the "SEALED_SEARCHES" eBay/Amazon cross-sell block already on `/sealed`). (b) is buildable without new infra; deferred on time budget, not blocked. |
| 15 | Competitor comparison (`/learn/riftbound-price-tracking-tools-compared`) | 3 | 3 | 2 | 🚫 not attempted this pass | Your constraint — "be genuinely fair and factual... do not fabricate feature claims" — means this needs real verification of what TCGplayer/Cardmarket/Collectr/RiftMeta/TCGArena actually do today, which I have not done (would require live research I haven't run in this pass). Flagging rather than guessing at competitor features. |
| 16 | `/learn/riftbound-online-and-simulators`, `-community-hubs`, `-vs-universus-lorcana-mtg`, `/blog/riftbound-release-dates` | 2–3 each | 2 | 2 | 🚫 not attempted this pass | All four are legitimately buildable (link/context pages, not data-claim-heavy), just deferred on time budget in this pass. |
| 17 | Homepage/`/movers`/`/tools/rising` "trending this week" module | 4 | 3 | 2 | 🚫 not attempted this pass | Real `DemandSnapshot` (searchCount/viewCount daily snapshot) data already exists and already feeds `rise-predictor.ts` — this is genuinely buildable, no fabrication risk. Deferred on time; concrete next step. |
| 18 | Related-content engine (card → champion/set/keyword/siblings; guide → cards/tools) | 5 | 2 | 1 | ✅ mostly already exists | Card page already links to: champion hub, same-set/domain siblings (12), other printings, decks played in, type/rarity/domain facets. This is *not* a gap — see the card-page survey. The one real gap: expanding `/keywords` beyond empower/flow/burn (below). |
| 19 | Expand `/keywords` beyond empower/flow/burn | 4 | 4 | 3 | 🚫 blocked on verified source | `ALL_KEYWORD_NAMES` lists 30 real keyword names; only 3 have verified rules text sourced from Riot's Core Rules, and the file's own header explicitly says: *"DO NOT draft entries for them from general knowledge — get the source text (Riot's Comprehensive Rules PDF/URL, or an explicit sign-off) first."* This applies directly to your P1 ask. **Needs your decision**: supply source text (or sign off) per keyword and each becomes a same-day addition, reusing the existing `/keywords/[slug]` template. |
| 20 | Sitemap changefreq/lastmod honesty + correct child placement | 5 | 1 | 1 | ✅ already done | Completed in a prior pass (11-section sitemap index, every entry has a real `lastModified`). No further action needed here. |
| 21 | hreflang / market-crawlability audit | 3 | 1 | 1 | ✅ audited, no gap found | Confirmed: single `x-default` hreflang is a deliberate, correct, sitewide policy (one cookie-switched URL per market, not URL-segmented) — there is nothing to "fix." Confirmed separately that the highest-crawl-value pages (card detail, homepage, movers) never read cookies/geo-IP server-side, so Googlebot sees the same cached HTML as every visitor — no cloaking risk. |
| 22 | `ItemList` JSON-LD on `/browse`, `/singles`, `/sealed`, `/movers`, `/decks` | 3 | 2 | 2 | 🚫 not verified this pass | Confirmed present on `/browse` (from an earlier audit pass) and `/sealed` (`ItemList` of priced in-stock groups). Not verified on `/singles`, `/movers`, `/decks` in this pass — quick follow-up. |
| 23 | WebSite + SearchAction + Organization JSON-LD sitewide | 5 | 0 | 0 | ✅ already done, confirmed correct | `layout.tsx` already emits an `@graph` with `Organization` + `WebSite`, and the `WebSite` node already carries a `SearchAction`/`potentialAction` pointing at `/browse?q={search_term_string}` — exactly the sitelinks-searchbox shape Google documents. Nothing to build. |
| 24 | Core Web Vitals on card/browse templates | 4 | 3 | ? | 🚫 not measured this pass | No live environment/Lighthouse run available in this sandbox (no `DATABASE_URL`, so the app can't fully render). Flag for a real-environment check, not something I can verify here. |
| 25 | Vendetta blog cannibalization audit + consolidation | 4 | 3 | 4 | 🟡 audited, not consolidated | Full audit done — see `docs/seo-keyword-map.md` for the concrete cluster list and consolidation recommendation. **Not executing the 301 consolidation itself**: picking which URL is "best-performing" needs real Search Console data I don't have access to in this sandbox. **Needs your decision**: share the per-URL performance numbers (or confirm which URL you want kept) and I'll wire the redirects same-day. |

## Data-accuracy rule this whole backlog respects

Quoted verbatim from `lib/keywords.ts`, because it's the clearest statement of the
constraint that shaped every 🚫 above:

> "DATA-ACCURACY RULE (do not relax this): ... DO NOT draft entries for them from
> general knowledge — get the source text (Riot's Comprehensive Rules PDF/URL, or
> an explicit sign-off) first. Listing a name in ALL_KEYWORD_NAMES is just
> cataloguing a real printed term; it is not a claim about what it does."

The same principle governs every item above marked "blocked on data" or "needs
your decision": a real gap in the trend data doesn't authorize inventing the
content to fill it.

## Needs your decision (collected)

1. **Remaining Vendetta champion cards** — Akali/Zed/Renekton/Mel/Kennen landed
   and are now allowlisted (done this pass). Still need confirmation on
   Ambessa/Illaoi/Kayle/Nasus/Gangplank — check the live corpus again
   (`SELECT DISTINCT split_part(name, ',', 1) FROM "Card" WHERE name LIKE '%,%'`)
   and add any that now have real cards to `lib/champions.ts`.
2. **Brunei / Malaysia as real markets** — Canada is now done (landed mid-pass,
   see above). Brunei/Malaysia have the same infra prerequisite Canada used to
   have (schema migration + retailer sourcing + price-import-pipeline change).
   Do you want this scoped as a real project?
3. **Rules-content sourcing** — sealed rules, a general rules hub, and 27
   unverified keywords all need either a citable official source or your
   explicit sign-off before I draft rules-claim copy.
4. **Set roadmap facts** — confirmed/rumoured 2026 set names and dates, or a
   source to cite.
5. **Events data source** — is there a real calendar/feed to ingest for `/events`,
   or should this start as a hand-maintained single-event page (today's actual
   state) that grows as events are announced?
6. **Vendetta-cluster 301 consolidation** — share per-URL Search Console
   performance so the "keep the best-performing URL" instruction can be executed
   rather than guessed at.
7. **Card-name verification** — run the `SELECT` above against production and
   report which of the 27 named spiking cards are missing/misspelled before any
   copy references them by name.

## Update — 31 Jul 2026 (search-demand report pass)

Driven by the Riftbound/Vendetta search-demand report (Google Autocomplete +
r/riftboundtcg, 31 Jul 2026). Three of that report's seven recommended assets
were buildable from real data and are now live; the rest stay blocked for the
reasons already listed above.

| Report priority | Status | Notes |
|---|---|---|
| #5 Price-movement explainer | ✅ `/guides/why-riftbound-card-prices-change` | The report's "biggest untapped seam" — people ask *why* prices move, not just what they are. Written as mechanism + live-data pointers, deliberately with **no** hardcoded prices or invented historical percentages (the RH5→RH6 migration on the same day means our own price history restarts from today). Descriptive, not advisory, per the report's own editorial rule. |
| #4 "Cheapest way to start" | ✅ `/guides/cheapest-way-to-start-riftbound` | Onboarding intent is risk-averse and price-led. Compares the four real routes in. Asserts **no** MSRPs — points at live per-market pricing instead. |
| #3 Rules hub | ✅ `/guides/riftbound-rules-explained` | Backlog item #8 ("doable, deferred"). Pure internal-linking hub over already-verified guides; adds **zero** new rules claims, and says so on the page. The `lib/keywords.ts` DATA-ACCURACY RULE still blocks the deeper per-mechanic FAQ the report asks for. |
| #1 Vendetta card list w/ live prices | already existed | `/guides/riftbound-vendetta-card-list` + `/sets/vendetta`. Retrofitted with FAQ schema this pass. |
| #2 Chase/pull-rate hub | 🚫 still blocked | Chase side exists. **Pull rates do not** — publishing rates needs either Riot's official odds or a real aggregated dataset. Community box-opening numbers are not a citable source. |
| #6 Radiance (Set 5) hub | 🚫 still blocked | Same as backlog #11: no confirmed set facts. "riftbound radiance" being the #2 autocomplete does not authorise inventing a release date or card list. |
| #7 Regional buying guides | already existed | AU/NZ/US/UK/SG/CA all live. |

### Two SEO defects found and fixed while doing this

1. **12 broken internal links across the article corpus.** Links pointing at
   `/blog/<slug>` for articles whose category is `guide` (and vice versa). Both
   route handlers `notFound()` on category mismatch, so every one was a hard
   404 — wasted crawl budget and dead ends for readers. All 12 rewritten; a
   both-directions validator now confirms zero remain.
2. **FAQPage schema was on only 3 of 60 articles**, despite the report's
   finding that Google serves *no* "People also ask" box for Vendetta queries
   yet — i.e. the slots are unclaimed. Now on 9 articles / 45 Q&As. Two
   pre-existing articles (`riftbound-burn-explained`, `riftbound-empower-explained`)
   had structured FAQ with **no visible on-page counterpart**, which violates
   Google's FAQPage policy; both fixed. Every structured question is now
   verified to have visible `**Question**` text on the page.

**Do next (cheap, unblocked):** retrofit visible-FAQ + schema onto the
remaining ~54 articles, highest-commercial-value first. The validator to check
it is in this pass's commit message.
