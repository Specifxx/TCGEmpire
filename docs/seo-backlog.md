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

## Scoring table

| # | Item | Demand | Effort | Gap | Status | Notes |
|---|---|---|---|---|---|---|
| 1 | Card page template upgrade (H2s, extra FAQ, JSON-LD) | 5 | 2 | 2 | ✅ done | Template was already strong (Product/Offer/AggregateOffer/FAQPage/BreadcrumbList, ~150–500 words/card, similar-cards/decks/printings rails). Added: explicit H2 over price-comparison+history block, a "Rarity, prints & variants" H2 section, and one new FAQ ("Is the {Signature/Overnumbered/Crystal Rose} printing worth it?") that only renders when a real comparable base-printing price exists. |
| 2 | Seed/verify the 27 named spiking cards exist | 5 | 3 | — | 🚫 not verifiable here | No live `DATABASE_URL` in this sandbox — cannot query the production DB. **Action needed from you**: run `SELECT name, slug FROM "Card" WHERE name ILIKE ANY (ARRAY['Crystal Rose Sona','Lacerate','Seat of Power', ...])` against production and report back which of the 27 are missing before any content references them by name. |
| 3 | Champion hub template upgrade (real prose, deck cost, attribution) | 5 | 3 | 4 | 🟡 partial | Added real per-champion domain-distribution prose and, where a real `META_DECKS` entry exists, resolved build cost + tier + domains + tournament source attribution (previously the page showed a bare deck name/archetype with none of that). **Cannot** honestly add "2–3 decklists" for 9 of the 15 named champions — see item 4. |
| 4 | 9 of 15 trending champions have zero real data | 5 | 5 | 5 | 🚫 blocked on data | Ambessa, Akali, Zed, Illaoi, Renekton, Kayle, Mel, Nasus, Gangplank are Vendetta-debut Legends with **zero rows in the static card seed** and are not in the `CHAMPIONS` allowlist. Vendetta street-dates tomorrow (31 Jul 2026); once real Vendetta cards are imported into production, add these 9 to `lib/champions.ts` and their hub pages activate automatically with real card data. Building "2–3 decklists" for them before then would be fabricating tournament results — explicitly forbidden by your constraints. Jayce/Sona/Shen (already allowlisted) have only 1 tracked printing each — thin pages regardless of prose. |
| 5 | Canada buying guide | 4 | 2 (content) / 5 (real market) | 4 | 🟡 partial | Published `/blog/buy-riftbound-cards-canada` — but **honestly**, not as a 6th "N Canadian stores, CAD prices" guide like AU/NZ/US/UK/SG. Canada has **zero** infrastructure today: no `CA` in the `Country` type, no `lowestPriceCentsCa` column, zero Canadian retailers in `retailers.ts`, no CA branch in the price-import pipeline, no CA in `stores/tracked`'s `MARKETS`, no CA in the sitewide `Organization` JSON-LD `areaServed`. The published guide is honest about this and routes Canadian readers to the real US/eBay comparison instead. **A full Canadian market needs a product decision from you** — see "Needs your decision" below; it's a multi-day infra project (schema migration + retailer sourcing + import-pipeline branch), not a content task. |
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

1. **Vendetta champion cards** — confirm whether the *live production DB* already
   has Ambessa/Akali/Zed/Illaoi/Renekton/Kayle/Mel/Nasus/Gangplank cards imported
   (the static repo snapshot has none). If yes, add them to `CHAMPIONS` in
   `lib/champions.ts` and their hub pages activate with real data immediately.
2. **Canada / Brunei / Malaysia as real markets** — full buildout is a schema
   migration + retailer sourcing + price-import-pipeline change (multi-day). Do
   you want this scoped as a real project, or is the honest interim content
   (published this pass for Canada) sufficient for now?
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
