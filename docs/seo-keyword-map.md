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
| `<card short name> signature\|overnumbered\|promo\|alt art [riftbound]` (e.g. `shen signature riftbound`, `akali overnumbered`) | `/card/<slug>` **of that exact printing** — every printing is its own row and its own page; the title, subtitle, About opening, Product `additionalProperty` and breadcrumb all name the printing, and only that page does | `/cards/printing/<x>` for the whole shelf; `/guides/riftbound-variant-glossary` for "what is a Signature?" |
| `<community nickname> [riftbound]` (e.g. `armpit shen`, 711 impr/28d at pos 5.9) | `/card/<slug>` via `lib/content/card-aliases.ts` — the nickname is in the meta description, in visible "Also known as" copy and in Product `alternateName`, and on-site search resolves it | the blog/guide that coined it may still rank; it answers "why is it called that", not "what does it cost" |
| `<champion> legend [riftbound]` (e.g. `kennen legend riftbound`) | `/card/<slug>` of that champion's **Legend printing** — `type` is a real column and a Legend is the one card a deck is built around, so the title, the card-details table and the About opening all name it | `/cards/type/legend` for the whole shelf; `/champions/<slug>` for every printing of that champion |
| `<rarity\|domain> <type> riftbound` (e.g. `epic fury spell`) | `/cards/type/<type>` — a shelf query, not a card query. The search box resolves the same phrase to the same filters | the individual `/card/<slug>` pages rank incidentally on their own attributes |
| `<champion> riftbound`, `<champion> riftbound cards` | `/champions/<slug>` | `/card/<slug>` for each individual printing |
| `<champion> deck riftbound`, `riftbound <champion> deck` | `/champions/<slug>` — every printing priced; it no longer claims a decklist (the meta-deck dataset was removed 2026-09-12, see DECISIONS.md) | `/deck` (pricer) for a custom build; `/guides/riftbound-deck-archetypes-guide` for "which kind of deck" |
| `riftbound deck`, `riftbound decks` | `/deck` (deck pricer/builder) — the site's only deck surface; `/decks*` 301 here | `/guides/riftbound-deck-archetypes-guide` (choose an archetype) and `/guides/budget-riftbound-decks` (build cheaply) |
| `riftbound meta decks`, `riftbound tier list`, `best riftbound decks`, `<champion> decklist` | **Deliberately unowned.** No licensed machine-readable source exists (riftdecks/riftools ToS + Cloudflare; Piltover Archive forbids automated/commercial use; TopDeck.gg needs a key). Do not build a page for this intent until one does | `/guides/riftbound-deck-archetypes-guide` may rank incidentally; keep it count-free |

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
| `riftbound <set> card list` | `/guides/riftbound-<set>-card-list` (exists for Vendetta only today — `riftbound-vendetta-card-list`). For the older sets the owner is the `whats-in-the-riftbound-<set>-set` breakdown guide instead: Origins, Spirit Forged and Unleashed all exist (backlog item 10, closed 2026-09-10); Proving Grounds is covered inside `riftbound-sets-in-order` | `every-riftbound-<set>-card-revealed` blog gallery post (Vendetta only today) — the two are DIFFERENT angles (checklist guide vs. embedded live gallery), keep both when both exist |
| `riftbound card list` (no set named) | `/browse` — the card database IS the card list. Its `<title>` and H1 both read "Riftbound Card List" as of 2026-09-17 | `/cards` (browse by type/rarity/printing) and `/guides/riftbound-sets-in-order` (which SETS exist) are different questions and must not retitle onto this phrase. **This row previously said `/guides/riftbound-card-list`, "not yet built, backlog item 12"** — stale twice over: item 12 was closed 2026-08-13 by shipping `riftbound-sets-in-order`, and that guide answers set-list intent, not card-list intent, so the query was left genuinely unowned in the meantime |
| `every riftbound card`, `all riftbound cards`, `riftbound card index`, `full riftbound card list` | `/cards/all` — the flat HTML index of all ~1,431 printings, grouped by set, one anchor per card page. Added 2026-09-17 as a crawl path, not a ranking play: every other surface caps what it renders (facets at 60 tiles, galleries at 500, set pages at 100/page) | `/browse` owns `riftbound card list` (see the row above) and `/cards` owns the facet index, so **this page deliberately titles on "Complete A-Z Index" rather than "Card List"** — the phrase is spoken for. Secondary intent here is the crawler's, not a visitor's |
| `riftbound roadmap` | `/blog/riftbound-2027-set-roadmap` (exists — corrects the slug this file previously guessed at) | — |
| `riftbound neeko`, `neeko riftbound card`, `riftbound neeko spoiler`, `neeko blending in` | `/blog/riftbound-neeko-blending-in-spoiler` (added 2026-09-19, the day the card was photographed) — the **reveal** intent: what the card does, and what its 167/167 collector number settles about the set's size | `/card/neeko-blending-in-rad-167-167` keeps `neeko riftbound price` per this file's standing `<card name> price` rule, and `/champions/neeko` keeps `<champion> riftbound` once it has more than one printing. The post links down to both rather than competing with them. **This row is for the reveal, not the card** — when Radiance ships and the card has a real price history, the card page is primary for anything price-shaped and this post must not retitle toward it |
| `riftbound ksante`, `ksante riftbound card`, `riftbound ksante spoiler`, `ksante radiance`, `pride of nazumah`, `ntofo strikes` | `/blog/riftbound-ksante-radiance-spoiler` (added 2026-09-25, the day K'Sante's first cards surfaced as Preview Season opened) — the **reveal** intent for K'Sante's game debut: his Legend (Pride of Nazumah) and signature spell (Ntofo Strikes), what they do, and the Shield-to-offense archetype. A SIBLING to the HEARTSTEEL post per this file's band-not-set rule, not a rewrite of it | Title omits "Radiance" to clear the radiance+spoiler title guard (`tests/radiance-spoiler-tracker.test.ts`). `/blog/riftbound-heartsteel-cards` keeps the BAND / skin-line intent and now links down to this post for the base cards; `/card/pride-of-nazumah-rad-172-167` and `/card/ntofo-strikes-rad-146-167` take anything price-shaped once Radiance ships; `/sets/radiance` stays primary for the set. Does NOT move radiance.ts's confirmed-Legend count — K'Sante is a sighting until Riot formally confirms him |
| `riftbound heartsteel`, `heartsteel riftbound cards`, `riftbound heartsteel kayn`, `ksante riftbound card` | `/blog/riftbound-heartsteel-cards` (added 2026-09-18, the day "LIVE MY LIFE" landed). **Nothing owned any music-skin-line intent** — a repo-wide search for HEARTSTEEL returned zero hits across articles, routes and card content. Deliberately named for the BAND, not the set, so it survives whichever product the cards actually land in | `/sets/radiance` and `/blog/riftbound-radiance-what-we-know` stay primary for the SET; this post targets the skin line and must not retitle onto "Radiance". `/guides/riftbound-variant-glossary` keeps `riftbound alt art`/`showcase`/`signature` — the post links down to it rather than re-explaining the tiers. If True Damage or K/DA cards get their own post later, the same band-not-set rule applies and this row gets siblings, **not** a rewrite into a generic "music cards" page |
| `riftbound colorless champion unit`, `radiance colorless champion`, `riftbound radiance new set mechanic`, `riftbound radiance teaser` | `/blog/riftbound-radiance-colorless-champion-unit` (added 2026-09-22, the day the redacted contents graphic circulated) — the **teaser-analysis** intent. The graphic created a query none of the seven existing Radiance pages answered, and this site can answer it better than anyone because it already holds the card that almost certainly IS the answer: Neeko, Blending In prints "Neutral", which is what `Colorless` means on `/domains/colorless` | Must NOT claim `radiance spoilers` (the tracker), `radiance card list` (`/sets/radiance`) or `radiance release date` (`/release-dates`) in its title — it links down to each instead. `/blog/riftbound-neeko-blending-in-spoiler` keeps `riftbound neeko`; this post argues about the teaser LINE, not the card, and defers to that post for the card itself |
| `riftbound radiance spoilers`, `radiance riftbound spoilers`, `riftbound radiance card reveals`, `radiance revealed cards` | `/blog/riftbound-radiance-spoilers` (added 2026-09-21, four days before Preview Season) — the **official-reveal** intent: a dated reveal log around a `setAll: "RAD"` gallery that fills itself as cards import, the same shape as `every-riftbound-vendetta-card-revealed`. Search Console 28d to 2026-09-21: "riftbound radiance spoilers" 1,152 impr / 163 clicks and "riftbound radiance card list" 817 / 49 were the site's #2 and #5 queries, and every click was landing on the mechanics-LEAK post because nothing owned the reveals | `/blog/riftbound-radiance-leaked-mechanics` keeps `riftbound radiance leaks` / `leak` (857 clicks/28d — do not retitle it toward "spoilers"). `/sets/radiance` keeps `radiance card list`; the tracker links down to it for the list and never claims "card list" in its title |
| `riftbound radiance`, `riftbound radiance cards`, `radiance card list` | `/sets/radiance` — the set hub. Generic template, so it fills in with real cards through Preview Season (25 Sep – 9 Oct 2026, opening at RQ Los Angeles) and gets live prices on release day with no new page. **Until release its title counts reveals against Riot's announced total** ("Riftbound Radiance Card List: N of 180 So Far", from `SETS[].announcedCards`) and its description dates the prices; the released-set "All N Cards + Prices" rung returns by itself on 23 Oct via `isPreorderSetCode()` (2026-09-25) | `/blog/riftbound-radiance-what-we-know` for the confirmed-facts write-up. Do **not** build `/guides/riftbound-radiance-card-list` until cards actually exist — a checklist guide with nothing to check is the thin page AdSense rejected the Vendetta cluster for |
| `riftbound radiance release date`, `when does radiance come out`, `radiance countdown` | `/release-dates` — names no set in code, leads with whatever is next, and carries the countdown, the Event JSON-LD and an .ics | **Never rebuild a `/<set>-countdown` page.** It has been built and retired twice (`/vendetta-countdown`, `/radiance-countdown`, both now 301s); `lib/release-calendar.ts`'s header is the post-mortem |
| `riftbound radiance preorder`, `radiance booster box price`, `radiance vault` | `/radiance-preorders` — the only route on the site named for a set, deliberately: pre-order comparison is a real product with a real end date, and the page retires itself on 23 Oct 2026 via `isPreorderSetCode()`. Title "Riftbound Radiance Booster Box Pre-Order Prices" (47 characters, 2026-09-25): the booster-box phrase was in neither the old 72-character title nor the 204-character description. No price in it (the page renders in the visitor's currency) and no store count | Nothing. Do not write a "should you pre-order Radiance" post next to it — that intent is answered ON the page (the "When to pre-order" section), for exactly the cannibalisation reason this file exists |
| `where to buy riftbound radiance`, `radiance riftbound where to buy`, `riftbound radiance <country>`, `riot merch store radiance`, `radiance amazon` | `/blog/where-to-buy-riftbound-radiance` (added 2026-09-24) — the **which kind of seller, per market** intent: stores by country, Riot's Merch Store draw, marketplaces and big-box retailers, and what each product contains. Store prices in it are dated examples; it sends every price question to `/radiance-preorders` | `/radiance-preorders` keeps `radiance preorder` and every price phrase — the post's title says "Store Guide", never "pre-order price". `/guides/where-to-buy-riftbound-cards` keeps the set-agnostic `where to buy riftbound`; the post links up to it. Retire or fold into the umbrella guide after release, when Radiance is just another set in `/sealed` |
| `riftbound secret garden`, `secret garden bundle`, `riftbound secret garden price`, `riftbound gift box` | `/blog/riftbound-secret-garden-bundle` (added 2026-09-12) — the event-exclusive US$70 gift box: contents, the nine 2026 events, and the regional price analysis. **No retail channel exists**, so `/sealed` can never own this query with a shop price the way it does for boosters | `/blog/riftbound-t1-worlds-champion-collection` — the other non-retail collector product, deliberately a different angle (serialised/signed vs alternate art) and cross-linked, so the two don't compete on "limited riftbound box" |
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
| `buy riftbound cards us` | `/blog/buy-riftbound-cards-us` | Real: ~19 US stores + TCGplayer + eBay |
| `buy riftbound cards uk` | `/blog/buy-riftbound-cards-uk` | Real: 14 UK stores + eBay |
| `riftbound singapore` | `/blog/riftbound-price-comparison-singapore` | Real: 11 SG stores |
| `buy riftbound cards canada` | `/blog/buy-riftbound-cards-canada` | Real: Canada landed as a full sixth market mid-pass (20 CA stores, CAD pricing, end-to-end) — this guide was rewritten to match the AU/NZ/US/UK/SG template with real data, replacing an earlier "honest interim" draft written before CA support existed. |
| `riftbound singapore/brunei/malaysia` | Existing SG post covers SG. Brunei/Malaysia — **not built**, same zero-infrastructure blocker as Canada (backlog item 6). | |
| `where to buy riftbound` (no market named) | `/guides/where-to-buy-riftbound-cards` (multi-market umbrella, exists) | Every regional post links back to this |
| `buy riftbound cards`, `buy riftbound cards online` (no market named) | `/` — the homepage. **Since 2026-09-24 the lead line of the hero subhead** ("Buy Riftbound cards at the best price", verbatim); the H1 went back to the head term `Riftbound Card Prices` (+ ` in <place>` on the region pages) by the growth-pass brief, and every market homepage now carries a server-rendered "Riftbound card prices today" table. From 2026-09-17 to 09-24 it was the H1: "Buy Riftbound cards at the best price". Nothing owned the bare, market-free transactional phrase before; the six rows above all require a market, and the umbrella guide answers the *research* half ("which stores exist"), not "take me to the cheapest one now" | **The homepage `<title>` deliberately does NOT carry this phrase** — it keeps `Riftbound Card Prices` (three audits, see below). That split is what stops root colliding with `/guides/where-to-buy-riftbound-cards`, whose own title leads "Where to Buy Riftbound Cards…", in the field that carries the most weight. Do not "reinforce" the H1 by putting the phrase in the title too. The four region home pages take the same H1 with ` in <place>` appended, which is the geo variant the six regional blog posts already own — so those posts stay primary for `buy riftbound cards <market>` on title strength |

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

## Accessories intent

| Query pattern | Primary URL | Secondary (different angle) |
|---|---|---|
| `riftbound card size`, `what size are riftbound cards`, `riftbound card sleeve size`, `what size sleeves for riftbound` | `/guides/riftbound-card-size-sleeves-deck-boxes` (added 2026-09-12 — closes backlog item 14's sleeves/deck-box half) | — |
| `best sleeves for riftbound`, `riftbound deck box`, `riftbound storage box`, `riftbound binder` | `/guides/riftbound-card-size-sleeves-deck-boxes` — the accessory hub: sizing, the 65-sleeve deck arithmetic from the tracked tournament lists, deck-box capacity, binder page maths | `/guides/gradient-sleeves-for-riftbound-cards` keeps the narrower **aesthetic** query (`gradient sleeves riftbound`) and is linked as the colour-selection step; `/guides/how-to-store-and-protect-riftbound-cards` (450 words, long-term storage + humidity) links UP to the hub rather than competing |
| `riftbound playmat`, `riftbound playmat size` | `/guides/riftbound-card-size-sleeves-deck-boxes` (playmat section) — deliberately NOT a separate `/guides/riftbound-playmats` page as backlog item 14 originally scoped: the whole answer is "standard size, buy what you like", which is a section, not a page | — |

## Cross-market / import intent

| Query pattern | Primary URL | Secondary (different angle) |
|---|---|---|
| `are riftbound cards cheaper in <country>`, `cheapest country to buy riftbound cards`, `import riftbound cards`, `riftbound cards uk vs us price` | `/blog/are-riftbound-cards-cheaper-in-another-country` (added 2026-09-12) — the **should I leave my market** decision: delivered cost, de minimis thresholds, FX spread, and when importing genuinely pays | `/guides/where-to-buy-riftbound-cards` answers the different question **which stores in MY market** (4,800 words, six per-market sections) and stays primary for `where to buy riftbound`. The two link to each other explicitly; neither targets the other's phrase in its title or H1 |
| `buy riftbound cards <market>` | unchanged — the six per-market posts in the Regional buying intent table above | The import post links out to all six rather than restating any of them |

## Collection valuation intent

| Query pattern | Primary URL | Secondary (different angle) |
|---|---|---|
| `how much is my riftbound collection worth`, `riftbound collection value`, `value my riftbound cards`, `riftbound collection appraisal` | `/blog`-adjacent guide `/guides/how-much-is-your-riftbound-collection-worth` (added 2026-09-12). **Nothing owned this intent before** — a repo-wide search for "collection worth" returned zero hits across articles and routes, despite `/portfolio` and the Bulk Pricer both existing to answer it | `/deck` (the list pricer, which absorbed `/bulk-pricer` on 2026-09-25) and `/portfolio` are the TOOLS the guide sends you to — tool intent, not question intent, so no cannibalisation. `/guides/most-valuable-riftbound-cards` stays primary for `most valuable riftbound cards` (which cards), a different question from `what is mine worth` (how much) |
| `how to sell riftbound cards` | unchanged — `/blog/how-to-sell-riftbound-cards` | The valuation guide stops at the number and hands off to the selling post for the channels |

## Price-check intent

| Query pattern | Primary URL | Secondary (different angle) |
|---|---|---|
| `riftbound price check`, `price check riftbound card`, `check riftbound card price` | `/` — the homepage. Its description, hero subhead and a dedicated FAQ (real `FAQPage` JSON-LD) carry the phrase as of 2026-09-17; the search box IS the price check | `/browse` owns the list/database half of this and must not retitle onto "price check". The **many cards at once** query (`bulk price checker`) belongs to `/deck`'s list pricer since 2026-09-25, when the Premium-gated `/bulk-pricer` folded into it and started 301ing there — a genuinely different job, and free like this one |
| `riftbound price check` — **what it must NOT resolve to** | — | `/games/price-check` is a guess-the-price MINI-GAME. Until 2026-09-17 it was the only page on the site whose `<title>` contained the phrase, i.e. the site's de facto answer to a query about what a card is worth. Retitled "Price Check Game — …" to break the adjacency. **Do not put the bare phrase back in a game title.** |

Note this is a deliberate, scoped exception to the section immediately below:
`price check` is a distinct job-to-be-done phrase ("what is this worth right
now"), not one of the `<product> <price-word>` modifier long-tails that section
retired. The exception is one page and one phrase — it is not licence to
re-target `riftbound singles`/`riftbound cardmarket` etc.

| `riftbound <set> price guide`, `<set> price guide`, `riftbound price list`, `riftbound <set> price list` | `/sets/<slug>` — the set hub, whose top title rung became `Riftbound <Set> Card List & Price Guide` on 2026-09-24, then (same day, growth pass) `Riftbound <Set> Card List & Price Guide (All <N> Cards)` with N the live card count, plus a server-rendered `#price-guide` table of every card, dearest first. Search Console 28d to 2026-09-19: 21 "price guide"/"price list" queries, **789 impressions and one click**, most of them set-scoped and sitting at positions 5.5–10. The phrase appeared in no title, description or heading anywhere in the app, so this is the ban-list failure again — page one for words the title does not contain | `Card List` still LEADS the title: it is the bigger query (`riftbound unleashed card list` alone is 885 impressions) and `tests/seo-landing-pages.test.ts` pins list-intent first. "Price Guide" replaced the weaker "Prices" only where it fits 60 chars — Spirit Forged and Origins: Proving Grounds fall to a shorter rung and carry the phrase in their description instead. Do **not** put "price guide" in the homepage title: that slot is the `riftbound card prices` head term, settled across three audits |

## Price-modifier long-tails — deliberately NOT primary-targeted

Per the trend data's own finding: `riftbound singles`, `riftbound card prices`,
`riftbound cardmarket` etc. have near-zero search volume. These are NOT owner
queries for any page — they're served as secondary/incidental phrasing inside
card, champion, set and regional pages (which target the real-volume queries:
card names, champion names, mechanics, set names) via the price-comparison
modules embedded in those pages, never as a page's primary keyword target.

**Partially superseded for `riftbound card prices` specifically**: the homepage
`<title>` has targeted that exact phrase since 2026-09-10, on live SERP evidence
(the page sat at #10 and was the only page-one result whose title lacked the
words — see `src/app/page.tsx`'s own comment). The near-zero-volume finding
above still stands for the rest of the list; this row is kept because the
*policy* (don't spray price modifiers across pages) is still right even where
one specific head term earned an exception.

**Market marker dropped 2026-09-17**: that title read
`Riftbound Card Prices (US) — Compare Every Store | RiftCompare` between
2026-08-30 and 2026-09-17 and now reads `Riftbound Card Prices — Compare Every
Store | RiftCompare`. Owner call ("it doesn't need to say US on the Chrome tab
header"). The head term is untouched — only the geo marker went, and the geo
signal it stood in for now rides hreflang (root is the x-default/en-US member of
the region-home set) plus the per-page H1s: root's names no market, each region
home's names its own. The failure `(US)` was added to fix — `/au` outranking
root for `riftbound card prices US` — is a measurable trigger to put it back if
Search Console shows it recurring.

**Checked 2026-09-24 against the real export (28 days to 2026-09-19): it has
not recurred.** `riftbound card prices US` does not appear in the query set at
all, and geo-qualified commercial queries as a whole total three queries and
eleven impressions. The marker stays off. Re-run the check the same way — filter
the Queries export for a country word beside a price/buy word — before anyone
argues for putting it back.

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
5. **For a new SET specifically, publish fewer pages than feels natural.** Of
   ~24 Vendetta pre-release articles, 13 were 301'd away within eight weeks —
   first as a batch (`7997e00`, consolidating seven posts that restated the same
   launch facts in different words, written up as the cause of an AdSense
   low-value-content rejection), then on Search Console evidence (`4aab61f`:
   two of the flagship posts had 4 and 19 impressions in 28 days). The ones that
   survived all have **live data in them** — an embedded gallery, real decklists,
   `ebayPicks` — rather than a restatement of an announcement. A set's
   announcement facts belong on ONE page; everything else should be something
   only this site can compute.
