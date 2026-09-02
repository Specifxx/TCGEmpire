// File-based content for the Blog and Guides sections. Authored by us (not user
// input), rendered with the lightweight <Markdown> component. To publish a new
// article, add an entry here.
import type { Country } from "./country";
import { SEO_PACK_ARTICLES } from "./content/seo-pack-articles";


export type ArticleCategory = "blog" | "guide";

// An eBay affiliate search rendered in the article's "Shop this guide" strip
// (ArticleShopStrip). `query` is the eBay search; the strip localises the eBay
// domain to the visitor's market and affiliate-tags the link.
//
// `label` is the visible anchor text and must NOT name a country — the strip
// swaps the eBay domain per market, so "Booster boxes on eBay UK" would be a lie
// to four of the five markets. Name the PRODUCT, not the action: "Vendetta booster
// boxes" beats "Click here to buy". Two to four links is the working range; past
// that the strip reads as a link farm rather than a recommendation.
export interface ShopLink {
  label: string;
  query: string;
}

// An embedded card gallery rendered inside an article (ArticleView queries the DB and
// renders real CardTiles — click opens the QuickView popup / card page). Two modes:
//  - `slugs`: explicit card list (missing slugs are skipped silently, so a post never
//    breaks on a card that isn't imported yet).
//  - `chaseSet`: auto-select the CHASE-tier printings of a set (Showcase/Epic rarity,
//    signature "*" numbers, alt-art variants) — self-populates as reveals land.
export interface ArticleEmbed {
  title: string;
  note?: string;
  slugs?: string[];
  chaseSet?: string; // set code, e.g. "VEN"
  // Chase sub-tier for chaseSet mode (omit = every chase-tier printing):
  //  - "signature": "*"-numbered prints with the stamped artist signature.
  //  - "overnumbered": collector number beyond the set total (e.g. 167/166), plus
  //    SP-numbered specials.
  //  - "promo": promo printings of the set's cards.
  //  - "altart": alternate-art printings (variant letter, e.g. 021a).
  //  - "epic": in-set Epic-rarity base prints — the "hidden chase" tier.
  chaseTier?: "signature" | "overnumbered" | "promo" | "altart" | "epic";
  // Every (non-promo) card of a set, ordered by collector number — the full
  // spoiler-tracker gallery. Grows automatically as reveals are imported.
  setAll?: string;
  // Render the gallery with a client-side filter bar (domain/rarity/type + search
  // + a "most recently added" sort). Best paired with setAll on a large set.
  filterable?: boolean;
  // Rules-text query: cards whose ability text contains this string (optionally
  // scoped to a set) — e.g. "[Empower]" collects every Empower card as reveals land.
  rulesContain?: string;
  rulesSet?: string;
  // COMPETITIVE STAPLES — the cards played across the real tournament lists in
  // prisma/meta-decks.json, ordered by how many of those decks run them.
  //
  // Exists so a "best cards" article does not have to hard-code a ranking that is
  // wrong the next time the metagame is re-cut. The gallery is derived from the
  // same seed file /decks and the archetype pages read, so it CANNOT show a card
  // that isn't genuinely in a tournament list, and it re-orders itself when the
  // lists are updated. `minDecks` is the floor for inclusion (default 2 — a card
  // in one list is that deck's card, not a staple).
  metaStaples?: boolean | { minDecks?: number };
  take?: number; // default 12
}

// A CSS-cropped close-up of one region of a real card's official image (no
// derivative image files — pure presentation). The card is resolved by the same
// queries as galleries (explicit slugs, or first match of a rules-text query), so a
// close-up can never show a card that isn't genuinely in the database.
export interface ArticleCloseUp {
  caption: string;
  slugs?: string[]; // explicit card (first one found in the DB wins)
  rulesContain?: string; // …or the first card whose rules text contains this
  rulesSet?: string;
  topPct?: number; // top edge of the crop, % of full card height (default 56)
  heightPct?: number; // crop height, % of full card height (default 30)
}

export interface Article {
  slug: string;
  category: ArticleCategory;
  // Written but NOT published. A draft is filtered out of every public surface —
  // the /blog and /guides indexes, both feeds, the sitemap, the Google News
  // section, the related-posts rail and the /llm mirrors — and its page renders
  // noindex. It stays reachable by direct URL so it can be previewed and shared
  // for review before going live.
  //
  // This exists because ARTICLES had no unpublished state at all: adding an entry
  // put it in the sitemap and the news feed on the next deploy. That makes it
  // impossible to land a post that still has facts to verify without publishing
  // the unverified version first — and a run of half-finished posts appearing at
  // once is the "scaled content abuse" shape lib/posts.ts already warns about.
  //
  // Publishing is therefore a deliberate one-line edit (delete the flag), not a
  // side effect of writing the file.
  draft?: boolean;
  title: string;
  excerpt: string;
  author: string;
  date: string; // ISO (YYYY-MM-DD) — first published
  updated?: string; // ISO (YYYY-MM-DD) — last substantive edit; defaults to `date`
  readMins: number;
  tags: string[];
  body: string; // markdown
  // Optional monetisation: eBay searches relevant to THIS article (rendered as a
  // "Shop this guide" strip). Omit = no strip.
  //
  // PLACEMENT: by default the strip renders after the body and above the FAQ. An
  // article can position it instead by putting `[[shop]]` on its own line in
  // `body` — right after the section that creates the buying decision, which is
  // where intent actually peaks (after a decklist, under a price table, at the
  // end of a "which should I buy" comparison). A body that places the marker
  // suppresses the default copy, so the strip renders exactly once either way.
  shop?: ShopLink[];
  // Opt in to the tailored eBay unit (chase cards + their cheapest live listing,
  // with thumbnails) under the body. Deliberately per-article rather than
  // site-wide: it only belongs on pages whose readers are already shopping.
  // Optionally scope it to a set code; defaults to the current set.
  ebayPicks?: boolean | { setCode?: string; heading?: string };
  // Optional embedded card gallery (real CardTiles → QuickView popup on click).
  embed?: ArticleEmbed;
  // Multiple galleries. Position each inside `body` with a `[[embed:N]]` marker on
  // its own line (N = index into this array); unplaced embeds render after the body.
  embeds?: ArticleEmbed[];
  // Card-image close-ups, positioned in `body` with `[[closeup:N]]` markers.
  closeups?: ArticleCloseUp[];
  // Override for the "Ready to buy?" CTA at the end of the article — lets a guide
  // point somewhere more specific than the generic card database (e.g. a browse
  // view pre-filtered to the mechanic it just explained, or the Index). Omit for
  // the default /browse CTA.
  browseCta?: { href: string; label: string; blurb: string };
  // Attach a LIVE, market-specific data section (stores stocking Riftbound in
  // that market right now, cheapest/priciest cards, listing counts) rendered
  // after the body by ArticleMarketData. Used on the per-country buying guides,
  // which were thin and shaped alike; this gives each one real, current,
  // genuinely different information instead of more prose.
  // See docs/adsense-remediation.md § Phase 12.
  marketData?: Country;
  // Structured Q&A. This is now the SINGLE source for both the FAQPage JSON-LD
  // and the VISIBLE FAQ section (components/ArticleFaq.tsx) — an article carrying
  // `faq` must NOT also hand-write a "## … FAQ" markdown section in `body`, or the
  // page shows the same questions twice. Older articles still have the markdown
  // copy; those are being migrated, and the duplicate is why this field exists.
  faq?: { q: string; a: string }[];
  // Answer-first summary rendered above the body (components/AnswerBox.tsx) and
  // reused as the article's TL;DR. 2-5 short bullets, inline markdown allowed —
  // this is the block a featured snippet or an AI answer engine lifts, so lead
  // with the answer rather than context.
  summary?: string[];
  // Featured image, shown at the top of the article (ArticleView) and in the
  // homepage "Latest" teaser (LatestPosts) — NOT the OG/social image, which is
  // always a generated branded card regardless of this field (opengraph-image.tsx).
  // Either a site-relative path into public/ (so the build-time optimiser has a
  // manifest entry for it) or a full URL already used for card art elsewhere in
  // the app (riftcompare.com/... re-hosted specials, or cdn.riftscribe.gg — both
  // already allow-listed for next/image in next.config.js). REQUIRED descriptive
  // alt text either way.
  hero?: { src: string; alt: string };
  // Attach the LIVE "most expensive cards right now" table (ArticleTopValue) for
  // one market. Used by the most-expensive-cards listicle instead of typing a
  // top-10 into the body, which would be stale within a week — see that
  // component's header for the full reasoning.
  topValue?: { country: Country; take?: number; heading?: string };
  // ItemList JSON-LD for a LISTICLE — the ranked entities the article is about.
  // Only set this where the page genuinely IS a list (a ranked comparison, a
  // top-N); an ItemList on an explainer is markup that describes something the
  // page doesn't have. Keep the entries and their order identical to the visible
  // table, because that is what validation cross-checks.
  itemList?: { name: string; items: { name: string; description?: string; url?: string }[] };
}

export const ARTICLES: Article[] = [
  {
    slug: "riftbound-deck-archetypes-guide",
    category: "guide",
    title: "Riftbound Deck Archetypes: A Complete Guide",
    excerpt:
      "Aggro, Tempo, Midrange and six more specific tags on top of them — every real Riftbound deck archetype in the current metagame, and which to build first. Want today's actual decklists instead? See the meta decks, priced.",
    author: "RiftCompare",
    date: "2026-08-30",
    readMins: 10,
    tags: ["deckbuilding", "archetypes", "meta", "beginner", "strategy"],
    hero: {
      src: "/blog/riftbound-deck-archetypes-guide.png",
      alt: "Riftbound deck archetypes guide — Aggro, Tempo, Midrange and six more, color-coded",
    },
    summary: [
      "**Nine named archetypes appear in the current metagame, but only three are real pillars**: Aggro, Tempo and Midrange. Every one of the ten tournament decklists we track is fundamentally one of those three.",
      "**The other six labels — Combo, Disruption, Value, Gear, Spell, Reach — are always a more specific tag on top of one of the big three**, never a category by themselves (e.g. \"Aggro / Combo\", \"Spell Tempo\").",
      "**Aggro and Tempo are tied for the most-played, at 4 of the 10 tracked decks each; Midrange has 3.** The current field's one Tier 1 deck (Irelia, Blade Dancer) is Tempo.",
      "**Domain choice and archetype are linked**, not independent — most competitive lists commit to one or two of Riftbound's seven domains, and the current decks span six of them (every domain but Colorless).",
      "Looking for actual decklists rather than the strategy behind them? **[See the real, live-priced meta decks](/decks).**",
    ],
    itemList: {
      name: "Riftbound deck archetypes",
      items: [
        { name: "Aggro", description: "Cheap units, a low curve, and a race to end the game before the opponent's expensive cards matter.", url: "/decks/archetype/aggro" },
        { name: "Tempo", description: "Spend every turn more efficiently than the opponent can answer.", url: "/decks/archetype/tempo" },
        { name: "Midrange", description: "Bigger, more efficient cards than Aggro, while still faster than a pure control shell.", url: "/decks/archetype/midrange" },
        { name: "Combo", description: "An Aggro deck whose win condition is a specific card interaction.", url: "/decks/archetype/combo" },
        { name: "Disruption", description: "An Aggro deck built to deny the opponent's plan as much as execute its own.", url: "/decks/archetype/disruption" },
        { name: "Value", description: "A Midrange deck built to grind out a card-advantage edge over a long game.", url: "/decks/archetype/value" },
        { name: "Gear", description: "A Midrange deck built around equipment rather than raw unit stats.", url: "/decks/archetype/gear" },
        { name: "Spell", description: "A Tempo deck that wins through spell-heavy swings rather than board stats.", url: "/decks/archetype/spell" },
        { name: "Reach", description: "A Tempo deck carrying threats that can close the game from outside combat.", url: "/decks/archetype/reach" },
      ],
    },
    faq: [
      { q: "How many domains can a Riftbound deck run?", a: "One or two, in practice. Nothing in the printed rules caps it lower than that, but your 12 runes have to match your deck's domains to reliably cast your cards, and every archetype in the current tournament metagame we track commits to exactly one or two — usually two." },
      { q: "What's the actual difference between Aggro and Tempo in Riftbound?", a: "Aggro tries to end the game before the opponent's expensive cards matter, accepting a worse late game for a faster clock. Tempo also plays proactively, but its goal is staying ahead on board turn after turn rather than racing flat out — it's often willing to trade a slower start for a more efficient one. The two overlap enough that some real decks are tagged both (Aggro / Tempo) rather than purely one or the other." },
      { q: "What archetype should a beginner build first?", a: "Aggro is usually the easiest to learn on: the game plan is straightforward to execute, and mistakes are cheaper because you're rarely committing your whole turn to one expensive card. That's a starting-point recommendation, not a rule — Tempo and Midrange are just as legitimate if the playstyle appeals to you more." },
      { q: "How many Riftbound deck archetypes are there?", a: "Nine named archetypes show up across the real tournament decklists we track, but three of them — Aggro, Tempo and Midrange — are the actual pillars. The other six (Combo, Disruption, Value, Gear, Spell, Reach) are more specific tags layered onto one of those three, not separate categories of their own." },
      { q: "How much does a competitive Riftbound deck cost?", a: "It depends entirely on which list and which market you're buying in — the honest number changes daily as prices move. The meta decks page prices every real tournament list live, cheapest first, and the budget deckbuilding guide covers how to cut that cost without leaving the archetype you want to play." },
    ],
    browseCta: {
      href: "/decks",
      label: "See today's real, live-priced meta decks →",
      blurb: "Every list on the meta decks page is a real tournament result, priced card-for-card in your own market — including the cheapest place to buy the whole thing right now.",
    },
    body: `Search "Riftbound deck" and you'll get two different answers depending on what you actually want. If you want to see what people are winning with **right now** — real tournament lists, priced card-for-card in your own currency — that's [our meta decks page](/decks), updated as results come in. If you're trying to figure out **which kind of deck to build in the first place**, that's this page: what the real archetypes are, what actually separates them, and which one fits how you want to play.

## What a deck needs, in 30 seconds

Every Riftbound tournament deck is the same shape: a **Legend**, a **Champion**, a ~40-card main deck of Units/Gear/Spells, 12 **Runes** matching your domains, 3 **Battlefields**, and a side deck of up to 10 — 66 cards all up since the July 2026 rules update raised the side deck from 8. If any of that is new to you, **[the full anatomy of a deck](/guides/how-a-riftbound-deck-is-built)** covers it card type by card type. This page assumes you know the parts and is about a different question: which *strategy* to build around them.

## Pick a domain (or two) first

Riftbound has seven domains — Fury, Calm, Mind, Body, Chaos, Order and Colorless — and almost every competitive deck commits to one or two of them, since your 12 runes have to match. Domain is a real constraint on archetype: it's not that any domain can be any archetype, it's that a domain's own cards tend to reward a particular way of playing. Fury's cheap, aggressive cards pull toward Aggro; Mind's card-advantage tools pull toward Midrange and Value; and so on. Every domain gets its own breakdown — **[Fury](/decks/domain/fury)**, **[Calm](/decks/domain/calm)**, **[Mind](/decks/domain/mind)**, **[Body](/decks/domain/body)**, **[Chaos](/decks/domain/chaos)** and **[Order](/decks/domain/order)** — each with the real decks currently playing it and what they cost to build. (Colorless isn't a domain you build a deck *in* — no domain pair commits to it in the current metagame — but colorless cards slot into any list regardless of your domains, which is why they're the format's closest thing to universal staples.)

## The archetypes, compared

Nine named archetypes show up across the ten real tournament decklists we track, but they're not nine equal categories. **Every single one of the ten decks is fundamentally Aggro, Tempo or Midrange** — the other six labels (Combo, Disruption, Value, Gear, Spell, Reach) never stand alone; each one is a more specific tag layered onto one of those three. "Aggro / Combo" is an Aggro deck whose plan happens to be a specific card interaction. "Spell Tempo" is a Tempo deck that wins through spells rather than board stats. Knowing that changes how you should read the list below: the first three rows are real, separate ways to build; the next six are flavors of them.

| Archetype | Playstyle | Real example right now | Domains it's shown up in |
| --- | --- | --- | --- |
| **[Aggro](/decks/archetype/aggro)** | Cheap units, a low curve, and a race to end the game before the opponent's expensive cards matter. | Kennen, Heart of the Tempest (Tier 2) | Body, Calm, Chaos, Fury, Order |
| **[Tempo](/decks/archetype/tempo)** | Spend every turn more efficiently than the opponent can answer, staying ahead on board rather than racing flat out. | Irelia, Blade Dancer (Tier 1 — the field's benchmark) | Body, Calm, Chaos, Mind |
| **[Midrange](/decks/archetype/midrange)** | Bigger, more efficient cards than Aggro plays, while still moving faster than a pure control shell. | Viktor, Herald of the Arcane (Tier 3) | Body, Fury, Mind, Order |
| **[Combo](/decks/archetype/combo)** | An Aggro deck whose win condition is a specific card interaction rather than raw pressure alone. | Akali, Rogue Assassin (Aggro / Combo) | Calm, Fury |
| **[Disruption](/decks/archetype/disruption)** | An Aggro deck that spends as much energy denying the opponent's plan as executing its own. | Kennen, Heart of the Tempest — same deck as the Aggro row above | Chaos, Order |
| **[Value](/decks/archetype/value)** | A Midrange deck built to grind out a card-advantage edge over a long game rather than close fast. | Viktor, Herald of the Arcane — same deck as the Midrange row above | Mind, Order |
| **[Gear](/decks/archetype/gear)** | A Midrange deck built around equipment rather than raw unit stats — a toolbox of repeatable effects. | Jayce, Defender of Tomorrow (Gear Midrange) | Body, Mind |
| **[Spell](/decks/archetype/spell)** | A Tempo deck that wins through spell-heavy swings instead of board stats doing the work. | Diana, Scorn of the Moon (Spell Tempo, Tier 2) | Chaos, Mind |
| **[Reach](/decks/archetype/reach)** | A Tempo deck carrying threats that can close the game from outside straight combat. | Ezreal, Prodigal Explorer (Tempo / Reach) | Chaos, Mind |

Every archetype name links to its own page — the real decks in that group, what they cost to build in your market right now, and where to buy every card.

## Which should you build first?

There's no universally correct answer here — this is guidance, not a rule — but a few honest starting points:

- **New to competitive Riftbound?** Start with **Aggro**. It's the most forgiving archetype to learn on: your deck's plan is simple to execute, your mistakes are cheaper (a misplayed 2-drop costs less than a misplayed 6-drop), and it teaches you the game's tempo and combat math faster than any other shell.
- **Like reacting to what your opponent does, not just executing a plan?** **Tempo** or **Disruption** reward reading the board and adjusting turn to turn, rather than following a fixed script.
- **Prefer a deck that's forgiving of a bad matchup?** **Midrange** — and specifically **Value** — trades some explosiveness for a deck that rarely has a truly unwinnable game plan against anything.
- **Want a defined "I did the thing" moment?** **Combo** is the one archetype built around a specific interaction actually coming together, which is a different kind of satisfying than grinding out small edges all game.
- **Building on a budget?** Archetype and budget aren't the same axis — see the next section — but as a rule of thumb, a low curve means more commons and uncommons and fewer expensive chases, which usually (not always) makes Aggro the cheaper shelf to buy into.

## Budget vs. chasing the meta

Tier 1 isn't always the right target for your first deck. A Tier 1 list is the highest expected finish, but it's also the most-copied — which means its key cards are the most contested and often the most expensive. **[Best budget Riftbound decks](/guides/budget-riftbound-decks)** covers how to build something genuinely competitive without chasing the priciest cards in the format, and **[the most-played cards in the current metagame](/guides/best-riftbound-cards)** shows you which staples show up across multiple lists — the cards worth owning regardless of which single archetype you land on.

Once you've picked a list, don't price it card-by-card across a dozen different stores. **[Best Basket](/tools/best-basket)** takes the whole decklist and works out the store split that's actually cheapest once postage is counted — not just the cheapest total if every store magically shipped free.

## One thing that doesn't change your choice

Every set released so far — Origins, Origins: Proving Grounds, Spirit Forged, Unleashed and Vendetta — is currently legal in every format, and no rotation policy has been announced. That means an archetype you build today isn't on a clock: **[does Riftbound rotate?](/guides/riftbound-format-legality-rotation)** has the full picture, but the short version is that your deck stays legal for as long as the cards in it do, which so far has been indefinitely.

## Where the real decklists live

Everything above is about *choosing* an archetype. Once you have, **[the meta decks page](/decks)** is where the actual, current, real tournament lists live — every card, every domain split, priced live in your own market, with the cheapest place to buy each one. That's the page for "what is everyone actually playing" — this one was for "what should I play."`,
  },
  // ── Radiance (Set 5) — the one released set with no coverage at all until now.
  // Deliberately category "blog", not "guide": news-sitemap.xml only admits blog
  // posts inside a 2-day window, and a set announcement is exactly the piece that
  // benefits from fast crawl. Every figure below is from lib/constants.ts's SETS
  // entry or Riot's published roadmap — nothing about the card list is invented,
  // because nothing about the card list has been revealed.
  {
    slug: "riftbound-radiance-what-we-know",
    category: "blog",
    title: "Riftbound Radiance: Release Date & What's Confirmed",
    excerpt:
      "Riftbound: Radiance lands 23 October 2026 with 180 confirmed cards and five new champion Legends. Every confirmed detail and what's still unrevealed.",
    author: "RiftCompare",
    date: "2026-08-27",
    readMins: 7,
    tags: ["radiance", "news", "set", "release date", "seraphine"],
    hero: {
      src: "/blog/riftbound-radiance-what-we-know.png",
      alt: "Riftbound Radiance — Set 5, releasing 23 October 2026 with 180 confirmed cards",
    },
    summary: [
      "**Radiance releases 23 October 2026** — the fifth Riftbound set, and the next one you will actually be able to buy.",
      "**180 cards, confirmed by Riot** — 66 of them Showcase treatments — the second-largest Riftbound set so far, behind only Origins.",
      "**Five new champion Legends are confirmed, with four more still unrevealed**: Seraphine, Evelynn, Ekko, Ziggs and Jarvan IV.",
      "**The card list has not been revealed.** Anyone showing you Radiance decklists today is guessing — we will publish the gallery the day it is real.",
      "**One Radiance card already exists in print**: Seraphine, Not Alone shipped inside the T1 Signature Edition months early, which is why it is not tournament-legal yet.",
    ],
    faq: [
      {
        q: "When does Riftbound Radiance release?",
        a: "23 October 2026. It is the fifth Riftbound set, following Origins, Origins: Proving Grounds, Spirit Forged, Unleashed and Vendetta.",
      },
      {
        q: "How many cards are in Riftbound Radiance?",
        a: "180, confirmed by Riot — 66 of those are Showcase treatments. That is larger than Vendetta's 166 and smaller than Origins' 298, making it the second-biggest Riftbound set so far. Expect Signature and overnumbered printings beyond the 180, the same way every previous set has had chase printings beyond its base count.",
      },
      {
        q: "Which champions are in Riftbound Radiance?",
        a: "Five new champion Legends are confirmed: Seraphine, Evelynn, Ekko, Ziggs and Jarvan IV. Riot has also said four more champions are still to be revealed. The full card list has not been published, so the rest of the set — including which existing champions get new printings — is not yet known.",
      },
      {
        q: "Can I see the Radiance card list yet?",
        a: "No. The card list has not been revealed. RiftCompare publishes a full, filterable gallery with live prices the moment cards are officially confirmed — that is what happened with Vendetta, and Radiance will be handled the same way.",
      },
      {
        q: "Is there a Radiance card I can already buy?",
        a: "Sort of. Seraphine, Not Alone is a Radiance card that shipped early inside the Riftbound x T1 2025 Worlds Champion Collection, so copies exist before the set does. It is not legal for sanctioned play until Radiance actually releases on 23 October 2026.",
      },
      {
        q: "Should I buy Vendetta cards before Radiance releases?",
        a: "It depends on whether you are buying to play or to collect. A new set changes what decks want, which moves prices in both directions — the mechanisms behind that are covered in our guide to why Riftbound prices change. What we will not do is predict specific cards.",
      },
    ],
    // Seraphine's T1 printing is a real, catalogued card (prisma/manual-cards.json),
    // so this resolves today. If it ever stops resolving, resolveEmbed omits the
    // tile rather than rendering a broken one.
    embeds: [
      {
        title: "The one Radiance card already in print",
        note: "Seraphine, Not Alone shipped inside the T1 Signature Edition before her own set. Drawing-only, so she carries no store price until copies reach the secondary market.",
        slugs: ["seraphine-not-alone-t1s-005-005-promo"],
      },
    ],
    browseCta: {
      href: "/release-dates",
      label: "See the Radiance countdown →",
      blurb: "The exact time remaining until release, plus every set date we track.",
    },
    body: `**Riftbound: Radiance releases on 23 October 2026.** It is Set 5, it runs to a confirmed **180 cards** (66 of them Showcase treatments), and it brings **five new champion Legends** — with four more still unrevealed. That is the confirmed core — and this page is deliberately limited to what is actually confirmed, because the card list has not been revealed and the internet is already full of Radiance "leaks" that are nothing of the sort.

## Radiance at a glance

| | |
| --- | --- |
| **Set number** | 5 |
| **Release date** | 23 October 2026 |
| **Card count** | 180 (66 Showcase), confirmed |
| **New champion Legends** | Seraphine, Evelynn, Ekko, Ziggs, Jarvan IV (+4 unrevealed) |
| **Set code** | RAD |
| **Card list revealed?** | **No** |

## Where Radiance sits in the release order

Riftbound has shipped five sets so far — Origins (298 cards), Origins: Proving Grounds (24), Spirit Forged (221), Unleashed (219) and Vendetta (166). Radiance is the sixth release and the fifth mainline set.

Radiance reverses a shrink. The previous set was the smallest mainline release to date, and Radiance lands at a confirmed **180 cards** — second only to Origins among everything shipped so far. That matters more than it sounds. **A bigger set spreads the print run across more cards**, which generally means each individual chase card is scarcer relative to demand — the same dynamic that keeps Origins' top cards expensive despite Origins being the largest set of all. The full release calendar, including what follows Radiance, is in our **[set roadmap](/blog/riftbound-2027-set-roadmap)**, and the complete release order is in **[every Riftbound set, in order](/guides/riftbound-sets-in-order)**.

## The five champions

Riot has confirmed five new champion Legends: **Seraphine**, **Evelynn**, **Ekko**, **Ziggs** and **Jarvan IV** — and said four more are still to be revealed, for nine new Legends across the set in total.

All five named champions are League of Legends champions without an existing Riftbound Legend, so each one is a genuine debut rather than a reprint. Riot hasn't said whether the same is true of the remaining four. What has *not* been said is which domains any of them sit in, what their abilities do, or which existing champions get new printings alongside them — and we are not going to guess, because a wrong domain guess is the kind of thing people build purchase decisions on. When the reveals land, they will appear on the **[Radiance set page](/sets/radiance)** with live prices, exactly as Vendetta's did.

If you want the wider picture of who is already in the game, we maintain **[which League of Legends champions are in Riftbound](/guides/league-of-legends-champions-in-riftbound)**.

## The odd one out: a Radiance card that already exists

Here is the genuinely strange detail about this set, and the one thing about Radiance you can look up right now.

**Seraphine, Not Alone is a Radiance card — and it has already been printed.** She was one of the five cards in the **[Riftbound x T1 2025 Worlds Champion Collection](/blog/riftbound-t1-worlds-champion-collection)**, distributed through a Riot Merch Store drawing months before her own set ships.

[[embed:0]]

That creates a situation with no precedent in Riftbound: a card that physically exists, that people own, and that **is not legal for sanctioned play** — because the set it belongs to has not released. Anyone who won a T1 box is holding a card they cannot play until 23 October.

It is also a small, useful signal about the set. Seraphine being pulled forward for a marquee collaboration suggests she is a headline card in Radiance rather than a background one. That is inference, not confirmation — but it is inference from a real, verifiable fact rather than from a rumour.

## What this means if you buy cards

Three things are worth thinking about before release, and none of them require knowing the card list.

**Launch windows are the most volatile pricing a set ever has.** In the first weeks after a release, a huge amount of product is opened at once while nobody yet knows which cards matter. Prices swing hard on very few trades. If you are buying to play rather than to speculate, waiting past the initial rush usually means better information and calmer prices — the full mechanism is in **[why Riftbound card prices change](/guides/why-riftbound-card-prices-change)**.

**Sealed is comparable before singles are.** Booster boxes and preconstructed products are usually listed and priceable before singles exist, so if you intend to open Radiance rather than buy into it, the **[sealed comparison](/sealed)** is where to watch first. Whether opening is actually the cheaper route is a question our **[box EV guide](/guides/riftbound-booster-box-ev-worth-ripping-or-buying-singles)** answers properly — and the honest answer usually depends on the singles market that does not exist yet.

**A new set moves the old ones.** Radiance will change what decks want, which moves Vendetta and Unleashed prices in both directions — up for cards the new archetypes need, down for cards they replace. Watching **[price movers](/movers)** through the launch window tells you which is happening far more reliably than predicting it in advance.

## What we will publish, and when

We are not going to run Radiance speculation. What we will do, on the day the reveals are real:

- **The full card gallery**, filterable by domain, rarity and type, straight from our database.
- **Live prices on every card**, compared across every store we track in each market's own currency.
- **The chase tiers** — Signature, overnumbered, alternate-art and promo printings — as they are confirmed.

Until then, the **[release calendar](/release-dates)** has the exact time remaining, and **[the Vendetta set page](/sets/vendetta)** shows what that coverage looks like once a set is actually out.`,
  },
  // ── Format legality. "Standard format" and "format legal" returned zero matches
  // across the whole corpus before this, despite being the question behind every
  // expensive-card purchase. Scoped carefully: Riot has published a ban list but
  // NOT a rotation policy, and this article says so plainly rather than inventing
  // one — same rule /editorial-policy states for rules content.
  {
    slug: "riftbound-format-legality-rotation",
    category: "guide",
    title: "Does Riftbound Rotate? Card Legality Explained",
    excerpt:
      "Every Riftbound set released so far is still legal, and Riot has not announced a rotation. Here's what that actually means before you spend money on a chase card — and what would change it.",
    author: "RiftCompare",
    date: "2026-08-27",
    readMins: 6,
    tags: ["rules", "format", "rotation", "banlist", "buying guide"],
    hero: {
      src: "/blog/riftbound-format-legality-rotation.png",
      alt: "Riftbound format legality — all five released sets are currently legal, with bans the only removal mechanism",
    },
    summary: [
      "**No Riftbound set has rotated out.** All five released sets are currently legal in Standard.",
      "**Riot has not published a rotation policy.** That is not the same as promising there will never be one — and we are not going to pretend it is.",
      "**Bans are the only mechanism removing cards today**, and they are applied narrowly, a handful of cards at a time.",
      "**Standard and 2v2 have separate ban lists.** A card legal in one can be banned in the other.",
      "**The buying implication:** treat legality as current fact, not a permanent guarantee, and size expensive purchases accordingly.",
    ],
    faq: [
      {
        q: "Does Riftbound have rotation?",
        a: "Not today. No Riftbound set has rotated out of legality, and every set released so far — Origins, Origins: Proving Grounds, Spirit Forged, Unleashed and Vendetta — is currently legal in Standard. Riot has not published a rotation policy either way, so nobody can tell you what happens in 2028.",
      },
      {
        q: "Are Origins cards still legal in Riftbound?",
        a: "Yes. Origins is the launch set and its cards remain legal in Standard, apart from the small number that appear on the ban list. Age alone has not removed any card from play.",
      },
      {
        q: "What is the difference between a ban and a rotation?",
        a: "A ban removes one named card because it is causing a problem — it is targeted and rare. A rotation removes whole sets at once on a schedule, regardless of whether their cards are causing problems. Riftbound currently uses bans and does not use rotation.",
      },
      {
        q: "Are Standard and 2v2 ban lists the same?",
        a: "No, they are separate. A card can be legal in 1v1 Standard and banned in 2v2, or the reverse — Master Yi, Wuju Bladesman is the clearest current example, banned in 2v2 only. Check the format you actually play.",
      },
      {
        q: "Could my expensive Riftbound cards become unplayable?",
        a: "A ban is possible for any card, though bans have been applied narrowly so far. A rotation would be a much bigger change and has not been announced. The sensible position is that legality is a current fact rather than a permanent guarantee, which is worth factoring into how much you spend on a single card.",
      },
    ],
    browseCta: {
      href: "/guides/riftbound-banlist-explained",
      label: "See the current ban list →",
      blurb: "Every banned card, the format it is banned in, and what it means for your deck.",
    },
    body: `If you are about to spend real money on a Riftbound chase card, there is one question underneath the purchase: **will this card still be legal in a year?**

Here is the honest, current answer — including the part most sites skip, which is what nobody actually knows.

## The short version

**Riftbound does not rotate today.** Every set released so far is legal in Standard:

| Set | Code | Legal in Standard? |
| --- | --- | --- |
| Origins | OGN | Yes |
| Origins: Proving Grounds | OGS | Yes |
| Spirit Forged | SFD | Yes |
| Unleashed | UNL | Yes |
| Vendetta | VEN | Yes |

The only cards not legal are the specific ones on the **[ban list](/guides/riftbound-banlist-explained)** — a small, named set, not a whole generation of cards.

## Rotation and bans are not the same thing

These get conflated constantly, and the difference matters a lot for what you buy.

**A ban is a scalpel.** It removes one named card because that card is distorting the format. It is targeted, it is rare, and it is announced with a reason. Riftbound's **[July 2026 ban wave](/blog/riftbound-july-2026-ban-list-update)** is the most recent example.

**A rotation is a scheduled amputation.** It removes entire sets at once on a calendar, whether or not their cards were causing any problem at all. Cards that were perfectly reasonable simply stop being legal because of their age. Several long-running card games work this way; Riftbound, so far, does not.

The practical difference: a ban is a small risk spread across thousands of cards, most of which will never be touched. A rotation is a certainty applied to everything you own from a given set, on a known date.

## What Riot has and hasn't said

This is where we are going to be more careful than most coverage of this question.

**What is confirmed:** there is a ban list, it is maintained, it covers Standard and 2v2 separately, and it has been applied narrowly — a handful of cards at a time, with stated reasoning. Riot's approach to bans has been described as minimal intervention: act on genuine problems, and accept that this often means not acting at all.

**What is not confirmed:** anything about rotation. Riot has not published a rotation policy, a rotation schedule, or a statement ruling rotation out. That silence is genuinely ambiguous, and we are not going to resolve it for you by guessing.

You will find sites confidently telling you Riftbound "will never rotate" or "rotates after four sets". Both are inventions. **[Our editorial policy](/editorial-policy)** is that we publish rules and legality claims only where we can point at something official — and on rotation specifically, there is nothing to point at.

## Why a game this young leaves the question open

Riftbound launched in 2026 and has five released sets with four more announced through 2027. That is a relevant piece of context, because rotation is a problem that only becomes worth solving once a card pool gets large.

A game with five sets has a manageable format. A game with fifteen has a very different one — more cards to balance, a higher barrier for new players, and more pressure to reprint. Every card game that eventually adopted rotation did so after the pool grew, not at launch. **[The 2027 roadmap](/blog/riftbound-2027-set-roadmap)** shows the pool roughly doubling over the next eighteen months, with Legacy alone at around 346 cards.

None of that is evidence rotation is coming. It is the reason the question is worth keeping open rather than answering prematurely in either direction.

## What this means for buying

Three practical positions, in rough order of how much money is at stake.

**For cards you buy to play,** legality today is what matters and today is settled. Build what you want from any released set; check the ban list for the format you actually play, since **[Standard and 2v2 differ](/guides/riftbound-banlist-explained)**.

**For a single expensive chase card,** treat current legality as a fact with an unknown expiry rather than a guarantee. That is not a reason to avoid buying — it is a reason to size the purchase so that a rules change would be disappointing rather than damaging. The same logic applies to any collectible whose value depends partly on rules that someone else controls, and it is covered further in **[are Riftbound cards a real investment?](/blog/are-riftbound-cards-a-real-investment)**.

**For cards you already own,** a ban usually moves the price immediately and downward, but rarely to zero — a card banned in one format can stay legal in another and stay collectable regardless. **[Price movers](/movers)** is where that reaction shows up first.

## What would change this article

We will update this page when any of the following happens, and not before: Riot publishes a rotation policy; a set is announced as rotating out; or the ban list changes materially. Until one of those, the answer to "does Riftbound rotate?" is a straightforward **no, and nothing has been announced** — which is a more useful answer than a confident guess in either direction.`,
  },
  {
    slug: "best-riftbound-cards",
    category: "guide",
    title: "Best Riftbound Cards: What Winning Decks Play",
    excerpt:
      "Which Riftbound cards are actually the best? Not an opinion — the 48 cards that show up across the real tournament decklists in the current metagame, counted, ranked by how many decks run them, and priced live.",
    author: "RiftCompare",
    date: "2026-08-10",
    readMins: 7,
    tags: ["best cards", "meta", "staples", "deckbuilding", "buying"],
    summary: [
      "**\"Best\" here means most-played, measured.** We counted every card across the real tournament decklists we track and ranked them by how many separate decks run them — no personal ratings.",
      "**48 cards appear in two or more of the 10 lists.** 20 appear in three or more. The most-played card in the format right now is **Stacked Deck**, in half of them.",
      "**Spells dominate**: 22 of the 48 are spells, against 15 units, 7 battlefields, 2 gear and 2 champion cards.",
      "**Most-played is not most-expensive.** If you want the grails instead, that is a [different list](/guides/most-valuable-riftbound-cards) — and the two barely overlap.",
    ],
    itemList: {
      name: "Most-played Riftbound cards in the current metagame",
      items: [
        { name: "Stacked Deck", description: "Played in 5 of the 10 tournament decklists we track — the most-played card in the format.", url: "/card/stacked-deck-ogn-183-298" },
        { name: "Irelia, Fervent", description: "The only champion card played across three separate decks.", url: "/card/irelia-fervent-sfd-057-221" },
        { name: "Bellows Breath", description: "In three of the ten lists, at up to three copies.", url: "/card/bellows-breath-sfd-080-221" },
        { name: "Stupefy", description: "In three of the ten lists, at up to three copies.", url: "/card/stupefy-ogn-095-298" },
        { name: "Tideturner", description: "The most-played unit outside a deck's own champion package.", url: "/card/tideturner-ogn-199-298" },
        { name: "Zhonya's Hourglass", description: "One of only two gear cards shared across three decks.", url: "/card/zhonya-s-hourglass-ogn-077-298" },
        { name: "Seat of Power", description: "One of seven battlefields that recur across the field.", url: "/card/seat-of-power-sfd-217-221" },
      ],
    },
    embeds: [
      {
        title: "Every card played in two or more meta decks",
        note: "Pulled live from our database and ordered by how many of the tracked tournament decklists run each card — the most-played first. Tap any card for its full text, every printing, and the cheapest store right now.",
        metaStaples: { minDecks: 2 },
        take: 48,
      },
      {
        title: "The core: cards in three or more decks",
        note: "The tighter cut — cards that turned up in at least three separate lists, across different archetypes and different legends.",
        metaStaples: { minDecks: 3 },
        take: 24,
      },
    ],
    browseCta: {
      href: "/decks",
      label: "See the decklists these cards come from",
      blurb: "Every list on this page is a real tournament result, priced card-for-card in your own market — including the cheapest place to buy the whole deck right now.",
    },
    shop: [
      { label: "Riftbound singles on eBay", query: "Riftbound TCG single cards" },
      { label: "Riftbound Origins singles", query: "Riftbound Origins single card" },
    ],
    faq: [
      {
        q: "What are the best cards in Riftbound?",
        a: "Measured by how often they actually appear in winning decklists, the most-played cards in the current metagame are Stacked Deck (in 5 of the 10 tournament lists we track), then a group of twenty cards that each appear in three, including Bellows Breath, Stupefy, Tideturner, Charm, Defy, Discipline, En Garde, Cleave, Hidden Blade, Star-Crossed, Zhonya's Hourglass and Irelia, Fervent. That is a measurement of play rate, not a power rating.",
      },
      {
        q: "How did you decide which cards are best?",
        a: "By counting. We take the real tournament decklists tracked on our meta decks page, count how many separate decks play each card, and rank by that number. A card in one list is that deck's card; a card in several is a staple. Nothing on this page is a personal rating, and no card appears that is not in a real list.",
      },
      {
        q: "Are the best cards the most expensive ones?",
        a: "Largely no, and that surprises people. Play rate and price are driven by different things — a common spell that every deck wants can cost less than a chase Epic almost nobody plays, because the Epic's price comes from scarcity and art. Our most valuable Riftbound cards guide covers the price side separately.",
      },
      {
        q: "Why are most of the best cards spells?",
        a: "It is what the counting shows: 22 of the 48 shared cards are spells, against 15 units, 7 battlefields, 2 gear and 2 champion cards. Units and champion cards tend to be specific to whichever legend a deck is built around, so they are less likely to be shared between decks — spells and battlefields are the slots different decks agree on.",
      },
      {
        q: "How often does this list change?",
        a: "It re-cuts whenever the underlying decklists do. The gallery on this page is generated from the same decklist data our meta decks pages use, so when a new tournament list is added the counts and the order here update with it rather than going stale.",
      },
      {
        q: "What is the cheapest way to buy these cards?",
        a: "Open any card above and compare every store we track on delivered cost, or paste a full list into the deck builder to price it in one pass. Buying a spread of cheap staples from one store usually beats buying each from its individually cheapest store once postage is counted.",
      },
    ],
    body: `Ask which Riftbound cards are "best" and you will get ten different answers, most of them somebody's opinion. This page takes the boring route instead: **we counted**.

Every decklist on our [meta decks page](/decks) is a real tournament result. Take all ten, count how many separate decks play each card, and rank by that number. A card that shows up in one list is that deck's card. A card that shows up in five, across different archetypes and different legends, is a card the format has agreed on — and that is a claim you can check rather than take on trust.

## How this list was built

- **Source:** the tournament decklists on [/decks](/decks), tracked from published event results.
- **Sample:** 10 decks, spanning ten different archetypes from aggro through to value midrange.
- **Rule:** count each card once per deck, however many copies it runs. Runes are excluded — every deck in a domain runs the same rune base, so counting them would tell you nothing.
- **Cut-off:** two decks minimum. Below that it is not a staple, it is a preference.

That produces **48 cards**. Twenty of them appear in three decks or more.

One caveat on the gallery below: it is drawn from our own card database, so a card we have not catalogued a printing for yet will be counted here but will not have a tile. That is deliberate — showing a tile for a card we cannot price would be worse than showing one fewer.

## The most-played cards in Riftbound

[[embed:0]]

The single most-played card in the format is **Stacked Deck**, in five of the ten lists — no other card is in more than three. Below it sits a broad, flat tier: twenty cards each appearing in three separate decks, which is what a healthy, unsettled format looks like rather than one with a single obvious best card.

## What the counting shows

Three things stand out, and all three are just arithmetic on the table above.

**Spells are the shared language.** 22 of the 48 are spells, against 15 units, 7 battlefields, 2 gear and 2 champion cards. That gap is not subtle, and it has a straightforward explanation: units and champion cards are chosen to fit whichever legend a deck is built around, so they rarely cross between decks. Spells are the slots different decks independently arrive at.

**Champion cards almost never cross over.** Only two make the list at all — Irelia, Fervent in three decks and Rek'Sai, Breacher in two. Everything else in the champion slot is specific to its own list, which is what you would expect when each deck is built around a different legend.

**Battlefields consolidate hard.** Each deck runs three battlefields, so the ten lists have thirty battlefield slots between them — and only seven distinct battlefields recur across more than one deck. If you are buying, that is a short list doing a lot of work.

Twenty-five of the 48 are run at the full three copies in at least one list, so "buy one" and "buy a playset" are different budgets. Every card above shows its cheapest live price, and the [card database](/browse) will compare every store on delivered cost.

## The core, if you are buying in

[[embed:1]]

These are the cards that turned up in three or more separate decks. If you are new and want the cards least likely to be wasted whatever you end up building, start here rather than with the expensive ones — and check the [cheapest way to start guide](/guides/cheapest-way-to-start-riftbound) for the wider version of that argument.

[[shop]]

## "Best" is not the same as "most valuable"

This is the part worth being clear about, because the two lists barely overlap.

Play rate and price are set by different forces. A common spell that eight decks want can cost less than an Epic almost nobody plays, because the Epic's price comes from print scarcity and art rather than from anyone putting it in a deck. Neither number is wrong — they answer different questions.

- If you want to know what to **play**, this page is the list.
- If you want to know what is **worth money**, see [the most valuable Riftbound cards](/guides/most-valuable-riftbound-cards) and [the most expensive grails](/blog/most-expensive-riftbound-cards).
- If you want the current **chase printings** specifically, [Vendetta's chase tiers](/blog/riftbound-vendetta-chase-cards-so-far) breaks those out by tier.

## Keeping this honest

The gallery above is generated from the decklist data itself, not typed into this page. When a new tournament list lands, the counts and the order change with it — and a card that is not in a real list cannot appear here at all, because there is nothing for it to be counted from.

What this page deliberately does not do is tell you *why* any of these cards is good. That is a claim about how the cards play, and the honest place to check it is the card itself: open any tile above for its printed text, every printing, and what it costs right now. If you want the strategy layer, the [best Vendetta decks guide](/guides/best-riftbound-vendetta-decks) covers the archetypes these cards are assembled into.
`,
  },
  {
    slug: "is-riftbound-worth-getting-into",
    category: "blog",
    title: "Is Riftbound Worth Getting Into? An Honest Look",
    excerpt:
      "Thinking about picking up Riftbound: League of Legends TCG? An honest, hype-free look at what the game is, what it costs to start, and who it's for.",
    author: "RiftCompare",
    date: "2026-06-12",
    readMins: 4,
    tags: ["beginners", "opinion", "buying"],
    body: `Riftbound — the League of Legends Trading Card Game — is one of the newest TCGs around, and "should I get into it?" is the question we hear most. Here's an honest answer, without the hype.

## What you're actually getting

Riftbound is a strategy card game set in the League of Legends universe. You build a deck around a **Legend** (your champion), across the game's domains — Fury, Calm, Mind, Body, Chaos, Order and Colorless — and battle for control of battlefields. If you enjoy deckbuilding and tactical card games (or you already love League's characters), it lands in a very familiar, very satisfying place.

## The good

- **It's early.** Getting in now means learning the game as the community grows and the meta is still wide open — a genuinely fun time to play.
- **The IP is huge.** League's characters and art carry real appeal, and the card art is gorgeous.
- **You don't need to spend big to play.** Preconstructed decks and Proving Grounds kits give you a complete, playable deck cheaply.

## The honest caveats

- **It's a new game**, so the local scene depends on where you live — check whether stores near you run events before you go deep.
- **Like any TCG, it can get expensive** if you chase chase-cards. The good news: you rarely *need* them to play well.

## What it costs to start

The cheapest route in is a **preconstructed or Proving Grounds deck** — a ready-to-play deck out of the box. From there you upgrade card-by-card with **singles**, which is far cheaper than ripping boxes hoping to pull what you need. Want to know the real cost? Drop a decklist into our **[deck pricer](/deck)** and it totals every card at the cheapest live price.

## Who it's for

If you like building decks, enjoy League, or want to get into a TCG on the ground floor, Riftbound is an easy yes. If you only want a quick filler game with no collecting, it might be more than you're after.

## Try before you spend

You can get a feel for the cards completely free: play **[Riftle](/riftle)**, our daily card game, and read **[Riftbound for beginners](/guides/riftbound-for-beginners)**. When you're ready to buy, **[compare every store](/browse)** so you start out paying the least.`,
  },
  {
    slug: "buying-singles-vs-opening-packs",
    category: "blog",
    title: "Buying Singles vs Opening Packs: Smart-Money Guide",
    excerpt:
      "Should you buy the exact Riftbound cards you want, or open packs and hope? The maths, the fun factor, and how to decide every time.",
    author: "RiftCompare",
    date: "2026-06-11",
    readMins: 4,
    tags: ["buying", "singles", "sealed", "value"],
    body: `It's the eternal TCG question: do you buy the **singles** you need, or open **packs** and chase them? Here's how to decide — every time.

## The case for singles

If you want **specific cards** — to finish a deck, complete a playset, or grab a chase card — buying singles is almost always cheaper than opening packs to find them. You pay for exactly what you want, with zero variance. Look any card up on the **[database](/browse)** and buy the cheapest copy across stores.

## The case for packs

Opening packs is **fun** — the rip, the chase, the surprise. Packs and boxes also make sense if you want to draft, collect sealed product, or you genuinely enjoy the gamble. Just go in knowing the expected value: on average a box returns less than the sum of the singles inside, because you're paying for the experience.

## The maths in one line

A booster box has a fixed *expected value* spread across many random cards. If you need a few particular cards, you'll usually pay **less** buying those singles directly than opening boxes hoping to hit them. Curious about a specific set? Our **[Box EV calculator](/tools/box-ev)** works out a box's expected value from live singles prices, so you can see whether opening is +EV before you buy.

## A simple rule of thumb

- **Building or upgrading a deck?** → Buy **[singles](/browse)**.
- **Want the opening experience, to draft, or to collect sealed?** → Buy a box — and **[compare box prices first](/sealed)**.
- **Not sure?** → Run the **[Box EV calculator](/tools/box-ev)** and let the numbers decide.

Either way, the smart move is the same: compare prices before you spend. That's the whole reason RiftCompare exists.`,
  },
  {
    slug: "how-to-store-and-protect-riftbound-cards",
    category: "guide",
    title: "How to Store & Protect Your Riftbound Cards",
    excerpt:
      "Sleeves, top-loaders, binders and boxes — a plain-English guide to keeping your Riftbound cards (and their value) in mint condition.",
    author: "RiftCompare",
    date: "2026-06-12",
    readMins: 5,
    tags: ["collecting", "guide", "condition", "storage"],
    body: `A Riftbound card's condition is a big part of its value — a Near Mint copy can be worth far more than a played one. Here's how to protect your cards properly, whether you're holding a chase card or just keeping a deck tidy.

## Why condition matters

Prices on RiftCompare assume **Near Mint (NM)** — the benchmark condition. As cards pick up whitening, scratches, dents or bends they drop through Lightly Played, Moderately Played, Heavily Played and Damaged, and each step down means a lower price. Protecting a card is the cheapest way to protect its value.

## The basics: sleeves

Every card you care about should be in a **sleeve**. There are two main types:

- **Penny sleeves** — cheap, thin, soft plastic. Perfect as a first layer for storage and bulk.
- **Deck sleeves** — sturdier, often coloured or art-printed, made for shuffling and play. If you're actually playing with a deck, these are what you want.

For valuable cards, the collector standard is **double-sleeving**: a snug "perfect fit" inner sleeve, then a standard sleeve over the top, so dust and moisture can't creep in.

## For valuable singles: top-loaders & one-touches

- **Top-loaders** are rigid plastic holders that stop a sleeved card from bending — ideal for posting cards or storing your best singles.
- **Magnetic "one-touch" holders** are premium display cases for your grails (signatures, chase alt-arts). Make sure you buy the right thickness for foils or thicker cards.

Never put an unsleeved card straight into a top-loader — the card can rub against the plastic.

## For collections: binders & boxes

- **Binders** with side-loading pockets are great for sets and showing off a collection. Avoid old PVC binders (they can damage cards over time) — look for acid-free, side-loading pages.
- **Storage/deck boxes** keep bulk and built decks organised. Keep everything somewhere cool, dry and out of direct sunlight — heat and UV fade cards and warp foils.

## Foils need extra care

Foil cards are more prone to **curving** as the foil layer reacts to humidity. Double-sleeving helps them lie flat, and storing them under light, even pressure (in a packed binder page or a tight box) keeps them straight.

## Quick checklist

- Sleeve everything you care about; double-sleeve the good stuff.
- Top-loader or one-touch for valuable singles and anything you post.
- Acid-free, side-loading binders for sets; cool, dry, dark storage.
- Keep foils flat and away from humidity.

Looking after your cards keeps them at the condition our prices assume — so when you check a card's value on the **[database](/browse)**, that's the value you'll actually get. New to buying? Start with **[where to buy Riftbound cards](/guides/where-to-buy-riftbound-cards)**.`,
  },
  {
    slug: "understanding-riftbound-card-rarity",
    category: "guide",
    title: "Understanding Riftbound Card Rarity & Printings",
    excerpt:
      "Common to Showcase, alt-arts, Signatures, Overnumbered and promos — what every Riftbound rarity and special printing means, and why it changes the price.",
    author: "RiftCompare",
    date: "2026-06-11",
    readMins: 5,
    tags: ["collecting", "guide", "rarity", "printings"],
    body: `Two copies of the "same" Riftbound card can have very different prices — because they're different *printings*. Here's how rarity and special treatments work, so you always know exactly what you're buying.

## The rarity ladder

Every base Riftbound card has a rarity, shown on RiftCompare with a coloured badge:

- **Common** — the backbone of the set; cheap and plentiful.
- **Uncommon** — a step up in scarcity.
- **Rare** — less common, often deck staples.
- **Epic** — scarcer still, and home to many chase cards.
- **Showcase** — special alternate-art treatments; the rarest pulls and usually the priciest.

Higher rarity generally means a higher price, but **playability** matters too — a Rare that defines the meta can cost more than an Epic nobody plays.

## Special printings (and how we label them)

Beyond rarity, the same card can appear in several printings. RiftCompare labels each one right in the card name so you're never guessing:

- **Alt Art** — an alternate-artwork version of a card (collector numbers like *112a*). Plays identically to the base card; priced as a collectible.
- **Showcase** — the premium alt-art treatment (see above).
- **Signature** — artist-signed, "overnumbered" cards marked with a *★* in the collector number (e.g. *223★/221*). Among the rarest cards in the game.
- **Overnumbered** — cards numbered beyond the set's base count (e.g. *238/219*) — special chase pulls.
- **Promo** — limited printings from prereleases, organised play and events. A promo shares the base card's art and number but trades at its own price.

## Why the same card has multiple prices

Because each printing is, to a collector, a different card. The **base print** is what you want for a deck — it plays the same and costs the least. The fancy versions (alt-art, Signature, promo) cost more because they're scarcer, not because they're better in play. On any **[card page](/browse)** the printing is spelled out in the title, so you can pick exactly the version you mean to buy.

## The practical takeaway

- **Building a deck?** Buy the cheapest base print — it plays identically.
- **Collecting?** Decide which treatment you're chasing (alt-art, Signature, promo) and confirm the label before you buy.
- **Selling?** Make sure you list the right printing — mixing them up is the most common pricing mistake.

Want to see the chase cards in action? Read **[the most valuable Riftbound cards](/guides/most-valuable-riftbound-cards)**, then **[browse the database](/browse)** and sort by price.`,
  },
  {
    slug: "how-to-sell-riftbound-cards",
    category: "blog",
    title: "How to Sell Riftbound Cards for the Best Price",
    excerpt:
      "Sitting on Riftbound cards you don't need? Here's how to price them accurately, where to sell, and how to get the most for your singles and sealed.",
    author: "RiftCompare",
    date: "2026-06-09",
    readMins: 5,
    tags: ["selling", "prices"],
    body: `Got a stack of Riftbound cards gathering dust — duplicates, cards from a deck you've moved on from, or pulls you don't need? Here's how to turn them into cash (or store credit) and get a fair price.

## 1. Price your cards accurately first

Before you list anything, find out what your cards are actually worth **today**. Look each one up on the **[card database](/browse)** to see its live price across every store we track. A few things to get right:

- **The exact printing.** Base, alt-art, Showcase, Signature, Overnumbered and promo versions all trade at very different prices. RiftCompare labels each printing in the card name so you can match yours precisely.
- **Condition.** Near Mint (NM) is the benchmark; lightly to heavily played copies sell for less. Be honest — it builds trust and avoids returns.
- **Which cards are worth listing now.** Check the **[price movers](/movers)** — if one of your cards is spiking this week, that's the one to list first.

## 2. Choose where to sell

- **eBay and local stores.** For high-value chase cards, a wider audience can help — just factor in fees and postage when you compare your net.
- **Local trading groups and Discord communities.** Lower fees than a marketplace, but you're on your own for buyer trust and shipping protection.

## 3. Set a competitive price

The cards that sell fastest are the ones priced at or just under the cheapest comparable listing. Open the card on RiftCompare, see the lowest current price, and pitch yours accordingly:

- **Want a fast sale?** Undercut the cheapest in-stock listing slightly.
- **Not in a hurry?** Price at market and wait — especially if the card is trending up.
- **Selling a whole deck?** Price it as a bundle with the **[deck pricer](/deck)** so buyers can see the value at a glance.

## 4. Ship smart and build a reputation

- Use a rigid mailer and a sleeve + top-loader so cards arrive in the condition you described.
- Post quickly and communicate — repeat buyers come from good experiences.
- Bundle small cards together so postage doesn't eat the value of a cheap sale.

Ready to list? **[Browse the database](/browse)** to price your collection first. Selling to fund your next deck? See **[where to buy Riftbound cards](/guides/where-to-buy-riftbound-cards)** to spend it well.`,
  },
  {
    slug: "beginner-mistakes-buying-riftbound-cards",
    category: "blog",
    title: "5 Beginner Mistakes Buying Riftbound Cards",
    excerpt:
      "New to buying Riftbound singles? Avoid these five common — and expensive — mistakes, and you'll build your collection for a lot less.",
    author: "RiftCompare",
    date: "2026-06-09",
    readMins: 5,
    tags: ["beginners", "buying", "tips"],
    body: `Getting into Riftbound: League of Legends TCG is exciting — but it's easy to overspend when you're new. Here are the five mistakes we see most often, and how to dodge every one.

## 1. Buying from the first store you find

The same Riftbound card can cost wildly different amounts from shop to shop, and stock changes daily. Buying from the first store you land on is the quickest way to overpay. Instead, **[search the card database](/browse)** and you'll see the lowest live price across every store we track, sorted cheapest-first, with a one-click link straight to the shop.

## 2. Ignoring shipping

A card that's 50c cheaper isn't a deal if it adds postage from a separate store. Always compare the **delivered** cost, not just the sticker price — RiftCompare shows an estimated shipping figure per shop, and buying several cards from one store often unlocks free shipping and beats splitting your order across three.

## 3. Buying the wrong printing

Alt-art, Showcase, Signature, Overnumbered and promo versions of a card can cost many times more than the base print — and they play identically. If you just want the card for your deck, buy the cheap base version. RiftCompare labels each printing right in the card name, so you always know exactly which one you're adding to cart.

## 4. Ripping boxes hoping to pull what you need

Opening booster boxes is fun, but if you need **specific** cards to finish a deck, buying those singles directly is almost always cheaper than chasing them in packs. Save sealed for when you want the opening experience or to collect — and even then, **[compare box prices](/sealed)** first. See our breakdown: **[singles vs sealed](/guides/riftbound-singles-vs-sealed)**.

## 5. Overpaying during hype spikes

Prices jump around tournaments and new-set launches. Paying the first (inflated) number you see during a spike is a classic beginner trap. Check the **[price movers](/movers)** to see whether a card is riding a spike or sitting at a fair price, and set a price alert (tap the heart on any card) to get an email when it drops back down.

## The one habit that fixes all five

Compare before you buy. Set your country at the top of the page, **[open the card database](/browse)**, look up what you want, and click through to the cheapest store. Do that every time and you'll build the same collection for a lot less.

New to the game entirely? Start with **[Riftbound for beginners](/guides/riftbound-for-beginners)**, then come back and shop smart.`,
  },
  {
    slug: "where-to-buy-riftbound-cards",
    marketData: "AU",
    // Positioned at the guide's own "Ready to buy?" heading via [[shop]] — the
    // reader has already picked their region and settled singles-vs-sealed by
    // then, so it is the one point in a six-section guide where every reader is
    // simultaneously decided and still on the page. Both product types are
    // offered because the section immediately above splits on exactly that.
    shop: [
      { label: "Riftbound singles", query: "Riftbound TCG singles" },
      { label: "Riftbound booster boxes", query: "Riftbound booster box" },
      { label: "Vendetta singles & sealed", query: "Riftbound Vendetta" },
    ],
    category: "guide",
    title: "Where to Buy Riftbound Cards (6 Markets, 100+ Stores)",
    excerpt:
      "The complete guide to buying Riftbound: League of Legends TCG cards — singles and sealed — in Australia, the United States, the United Kingdom, Singapore, Canada and the EU, and how to always find the cheapest price.",
    author: "RiftCompare",
    date: "2026-06-08",
    updated: "2026-08-24",
    hero: {
      src: "/blog/where-to-buy-riftbound-cards.png",
      alt: "Where to buy Riftbound cards — 6 markets and over 100 tracked stores, singles and sealed",
    },
    readMins: 9,
    tags: ["buying", "guide", "stores", "singles", "sealed"],
    body: `Want to buy **Riftbound: League of Legends TCG** cards but not sure where to start? Whether you're chasing a single chase card, completing a deck, or grabbing a sealed booster box, this guide covers exactly **where to buy Riftbound cards** in **Australia, the United States, the United Kingdom, Singapore, Canada and the EU** — over 100 tracked stores between them — and how to make sure you never overpay.

The short version: prices for the same card vary a lot between shops and change daily, so the smartest move is to **[compare every store at once on RiftCompare](/browse)** and buy from whichever is cheapest in your country. Here's how to do it region by region.

## How to find the cheapest Riftbound card price

1. **[Search the card database](/browse)** and open the card you want.
2. Each card shows the **lowest live price across every store we track**, sorted cheapest-first, with a one-click link straight to the shop.
3. Use the **country switcher** (top of the page) to set your region — prices then show in your local currency (AUD, USD, GBP, SGD, CAD or EUR), sourced from local stores, so what you see is what you'll actually pay.

You can also **[price a whole deck at once](/deck)** or **[compare sealed products](/sealed)** like booster boxes and Proving Grounds.

## 🇦🇺 Buying Riftbound cards in Australia

Australia has a healthy spread of Riftbound retailers — dedicated TCG shops, hobby stores and local game stores (LGS) — plus eBay Australia for harder-to-find singles. Because postage and stock differ wildly between shops, the cheapest *delivered* price is rarely the first shop you check.

- **Singles:** [Browse the card database](/browse) with the country set to **Australia** to see the lowest AUD price across Australian stores and eBay AU.
- **Sealed:** booster boxes, packs and Proving Grounds kits are on the **[sealed page](/sealed)**.
- **Tip:** many AU stores offer free shipping over a threshold — buying a few cards from one shop can beat splitting an order across three.

## 🇺🇸 Buying Riftbound cards in the United States

The US is the deepest Riftbound market by far — thousands of in-stock singles across dozens of stores, plus eBay US and the big marketplaces. That depth means the best deals are out there, but only if you compare.

- Switch the country to the **United States** and **[search the database](/browse)** for live USD prices across US stores, eBay US and major marketplaces.
- Sealed product (booster boxes, cases, Proving Grounds) is on the **[sealed page](/sealed)**.
- **Tip:** for high-value chase cards, condition matters — we surface Near-Mint English prices so you're comparing like for like, not a cheaper played or foreign-language copy.

## 🇬🇧 Buying Riftbound cards in the United Kingdom

UK players can buy Riftbound singles in GBP from a growing list of British TCG retailers, with eBay UK filling the gaps. Buying from UK stores avoids customs and import fees.

- Set the country to the **United Kingdom** and **[browse singles](/browse)** for live GBP prices across UK stores and eBay UK.
- **[Sealed products](/sealed)** are listed too.
- **Tip:** the UK singles market is still maturing, so for some cards a converted reference price is shown until a genuine in-stock GBP listing appears — always confirm on the retailer's page before buying.

## 🇸🇬 Buying Riftbound cards in Singapore

Riftbound arrived in Southeast Asia with Singapore's card shops stocking up fast, plus eBay Singapore filling in the gaps.

- Switch the country to **Singapore** and **[browse the database](/browse)** for live SGD prices across Singapore stores and eBay SG.
- Where no local store has a card in stock yet, TCGplayer's market price converts to SGD as a clearly-marked reference — never mistaken for a local listing.
- **Tip:** stores without their own webstore yet are still listed on the **[stores we track](/stores/tracked)** page and start showing prices the moment they sell online — worth a bookmark if you're chasing a card from a specific shop.

## 🇨🇦 Buying Riftbound cards in Canada

Canada has a large and growing Riftbound retailer base, with prices that swing 30–50% between stores once shipping is counted.

- Set the country to **Canada** and **[search the database](/browse)** for live CAD prices across Canadian stores.
- **[Sealed product](/sealed)** — boxes and packs — is compared the same way.
- **Tip:** with dozens of stores tracked, free-shipping thresholds do a lot of the work — RiftCompare factors each store's threshold into the ranking automatically, so you're comparing what you'd actually pay, not just the sticker price.

## 🇪🇺 Buying Riftbound cards in the EU

The eurozone is priced as **one market**, not one per country — a card listed in Rotterdam is the same EUR price to a buyer in Madrid, with no conversion and no customs, because the eurozone shares both a currency and a customs union.

- Switch the country to **Europe (EU)** and **[browse the database](/browse)** for live EUR prices sourced from real eurozone stores across Austria, Spain, Portugal, the Netherlands, Germany and Italy.
- **Tip:** postage estimates shown are domestic rates. Buying across a border inside the EU needs no currency conversion or customs form, but postage itself still runs higher — check the store's shipping-policy link for the real rate before you buy. See the full **[EU buying breakdown](/blog/buy-riftbound-cards-europe)** for the exact stores and why eleven is the honest number right now, not a hundred.

## Singles vs sealed: which should you buy?

- **Buying specific cards** (to finish a deck or grab a chase card)? Buy **singles** — it's almost always cheaper than ripping packs and chasing the card you need. Start on the **[card database](/browse)**.
- **Want the opening experience, or to invest/collect?** Buy **sealed** — booster boxes and Proving Grounds. Compare box prices on the **[sealed page](/sealed)**.

## Tips for buying Riftbound cards safely

- **Compare delivered cost, not just the sticker price** — shipping can flip which store is cheapest.
- **Check the condition** — Near Mint (NM) is standard; played copies should cost less.
- **Watch for the right printing** — alt-art, Showcase, Signature, Overnumbered and promo versions all trade at different prices, so make sure you're buying the exact one you want.
- **Buy the English print** unless you specifically want another language — non-English copies are cheaper but aren't the same card.

## Ready to buy?

Set your country, **[open the card database](/browse)**, find your card, and click through to the cheapest store. New to Riftbound? Browse our other **[guides](/guides)** or check the current **[meta decks](/decks)** to see what's worth building.

[[shop]]

## Buying in a specific market?

Deeper dives per region — real store counts, presale links and payment tips: **[Australia](/blog/buy-riftbound-cards-australia)** · **[United States](/blog/buy-riftbound-cards-us)** · **[United Kingdom](/blog/buy-riftbound-cards-uk)** · **[Singapore](/blog/riftbound-price-comparison-singapore)** · **[Canada](/blog/buy-riftbound-cards-canada)** · **[the EU](/blog/buy-riftbound-cards-europe)**.

## Where to buy Riftbound FAQ

**Where is the cheapest place to buy Riftbound cards?** There isn't one shop that's always cheapest — it changes per card and per market, which is why RiftCompare compares every store we track at once and ranks them by total delivered cost rather than sticker price.

**Can I buy Riftbound cards near me?** Local game stores stock sealed product and often singles, and many also sell online. The [stores we track](/stores/tracked) page lists every retailer in the comparison by market, so you can see which of them are local to you.

**Is it cheaper to buy Riftbound singles or sealed product?** For a specific card you've already chosen, singles are almost always cheaper — sealed means paying for many cards you didn't need. Sealed makes sense when you want the experience of opening packs.

**Do Riftbound prices differ between countries?** Yes, and not just by exchange rate. Regional allocation, local stock levels and import costs all matter — see [why Riftbound prices change](/guides/why-riftbound-card-prices-change). RiftCompare prices each market in its own currency from stores that actually ship there.

**Does RiftCompare sell cards directly?** No — RiftCompare is a price-comparison tool that links you through to the retailer with the best price; you always buy from the store itself.

## Why our prices are accurate for each market

Many overseas-hosted stores quietly show prices in whichever currency their server thinks you are
browsing from. We always request each store's price **for the market it serves**, so the number you
see is what you would actually pay locally — no surprise conversion at checkout, and no comparing an
Australian store's AUD price against a US store's USD one as if they were the same figure. That is
also why the comparison never converts between currencies to declare a winner: we rank within a
market, on delivered cost.
`,
    faq: [
      { q: "Where is the cheapest place to buy Riftbound cards?", a: "There isn't one shop that's always cheapest — it changes per card and per market. RiftCompare compares every store it tracks at once and ranks them by total delivered cost (price plus postage) rather than sticker price." },
      { q: "Can I buy Riftbound cards near me?", a: "Local game stores stock sealed product and often singles, and many also sell online. RiftCompare's \"stores we track\" page lists every retailer in the comparison grouped by market, so you can see which are local to you." },
      { q: "Is it cheaper to buy Riftbound singles or sealed product?", a: "For a specific card you've already chosen, singles are almost always cheaper — sealed means paying for many cards you didn't need. Sealed makes sense when you want the experience of opening packs." },
      { q: "Do Riftbound prices differ between countries?", a: "Yes, and not just by exchange rate. Regional allocation, local stock levels and import costs all affect price. RiftCompare prices each market in its own currency from stores that actually ship there." },
      { q: "Does RiftCompare sell cards directly?", a: "No — RiftCompare is a price-comparison tool that links you through to the retailer with the best price; you always buy from the store itself." },
      { q: "Which countries does RiftCompare cover?", a: "Six markets: Australia, the United States, the United Kingdom, Singapore, Canada and the EU (priced as one eurozone market in EUR). Each is priced in its own currency from stores that actually ship there — over 100 tracked stores across all six." },
    ],
  },
  {
    slug: "cheapest-riftbound-booster-boxes",
    marketData: "US",
    category: "guide",
    title: "Cheapest Riftbound Booster Boxes & Sealed",
    excerpt:
      "How to find the cheapest Riftbound: League of Legends TCG booster boxes and sealed product across Australia, the US, the UK, Singapore, Canada and the EU — and whether boxes or singles are better value.",
    author: "RiftCompare",
    date: "2026-06-08",
    readMins: 5,
    tags: ["buying", "guide", "sealed", "booster box"],
    body: `Booster boxes are the most exciting — and most expensive — way to buy into **Riftbound: League of Legends TCG**. But box prices swing a lot between shops and over time, so before you buy, it pays to compare. This guide covers **where to find the cheapest Riftbound booster boxes** and sealed product in **Australia, the United States, the United Kingdom, Singapore, Canada and the EU**.

## Compare every sealed price in one place

Head to the **[sealed products page](/sealed)** to see live prices for booster boxes, booster packs, Proving Grounds kits and other sealed Riftbound product across the stores we track — sorted so the cheapest is easy to spot. Set the **country switcher** to your region first so prices show in your local currency (AUD, USD, GBP, SGD, CAD or EUR).

## By region

- **🇦🇺 Australia:** Riftbound boxes sell out fast at launch — compare AUD prices across Australian stores on the **[sealed page](/sealed)** and watch for restocks.
- **🇺🇸 United States:** the deepest market — the most competitive box pricing is usually here. Compare USD prices and check shipping.
- **🇬🇧 United Kingdom:** UK retailers price sealed in GBP; buying domestically avoids import duty.
- **🇸🇬 Singapore:** a growing roster of local sellers, several trading primarily through Instagram or Carousell rather than a storefront — compare SGD prices on the **[sealed page](/sealed)** to catch them alongside the traditional shops.
- **🇨🇦 Canada:** one of the newer markets we track — compare CAD prices across Canadian stockists and factor in shipping between provinces.
- **🇪🇺 Europe (EU):** priced in EUR across the single market, so a box listed in the Netherlands is buyable at that price from Spain with no conversion and no import duty — compare the whole eurozone at once on the **[sealed page](/sealed)**.

## Booster box vs singles: which is better value?

- **If you want specific cards** (to finish a deck or grab a chase card), **[buying singles](/browse) is almost always cheaper** than ripping boxes hoping to pull them.
- **If you want the opening experience, to draft, or to collect/invest**, a sealed box is the way — just buy it at the best price.

## Tips before you buy a box

- **Check the price history feel** — box prices often spike at launch and settle later; if you're not in a rush, waiting can save money.
- **Factor in shipping** — a slightly dearer box with free postage can beat a cheaper one plus delivery.
- **Buy from reputable stockists** — we link straight to each store so you can check their returns and shipping policy.

[[shop]]

Ready to buy? **[Compare Riftbound booster box prices now](/sealed)**, or if you only need a few cards, **[search the singles database](/browse)** instead.`,
    // A US-market sealed guide (marketData: "US") that had no buy path at all.
    // Worth more than most: /sealed carries no eBay rows outside AU (eBay sealed
    // is pinned to the AU marketplace in sealed-import.ts), so until that is fixed
    // this strip is the ONLY eBay sealed route a US reader has. Four links because
    // the product types are genuinely distinct purchases, not four phrasings of one.
    shop: [
      { label: "Riftbound booster boxes", query: "Riftbound booster box" },
      { label: "Booster packs", query: "Riftbound booster pack" },
      { label: "Proving Grounds kits", query: "Riftbound Proving Grounds" },
      { label: "Vendetta sealed", query: "Riftbound Vendetta sealed" },
    ],
  },
  {
    slug: "most-valuable-riftbound-cards",
    // Graded is deliberately first, and is the reason this strip earns its place:
    // slabbed cards are the one category our own comparison structurally cannot
    // cover — no tracked Shopify store lists PSA/BGS copies — so for a reader who
    // has just finished reading about chase printings, eBay is not a duplicate of
    // the card database, it's the only place the thing they now want exists.
    shop: [
      { label: "Graded Riftbound cards (PSA & BGS)", query: "Riftbound PSA graded" },
      { label: "Signature & alt-art printings", query: "Riftbound signature alt art" },
      { label: "Vendetta chase cards", query: "Riftbound Vendetta chase" },
    ],
    // Chase-card readers are shopping by sight; the tailored unit shows the set's
    // actual chase cards with live listings rather than a generic search box.
    ebayPicks: true,
    category: "guide",
    title: "The Most Valuable Riftbound Cards & Chase Cards",
    excerpt:
      "What makes a Riftbound: League of Legends TCG card valuable — the chase rares, alt-arts, Showcase, Signature and promo printings — and how to check any card's live price.",
    author: "RiftCompare",
    date: "2026-06-08",
    readMins: 5,
    tags: ["collecting", "guide", "chase cards", "value"],
    body: `Every **Riftbound: League of Legends TCG** set has its chase cards — the ones collectors and players pay a premium for. This guide explains **what makes a Riftbound card valuable** and how to find the most expensive cards and check their live price.

## See the most valuable cards right now

The fastest way to spot the chase cards is to **[browse the card database](/browse)** and sort by price (high to low). That surfaces the current most-valuable Riftbound singles in your region, with live prices across every store we track.

## What makes a Riftbound card valuable?

- **Rarity** — Epic and **Showcase** cards are scarcer than Commons and Uncommons, so they command higher prices.
- **Alt-art printings** — alternate-art versions (collector numbers like *120a*) of popular cards are prized by collectors.
- **Signature cards** — artist-signed, overnumbered "Signature" printings are some of the rarest pulls in the game.
- **Overnumbered / secret cards** — cards numbered beyond the set's base count are special chase pulls.
- **Promos** — organized-play, prerelease and Nexus Night promo printings are limited and often sought-after.
- **Playability** — a card that defines the **[current meta](/decks)** holds value because players need playsets of it.

On RiftCompare, each of these printings is labelled in the card's name (e.g. *(Alt Art)*, *(Signature)*, *(Promo)*) so you always know exactly which version you're looking at.

## Buying and selling chase cards safely

- **Compare across stores** — high-value cards have the widest price spread, so comparing saves the most here. Open any card to see **every store's price** sorted cheapest-first.
- **Mind the condition** — Near Mint (NM) is the benchmark; played copies should cost noticeably less.
- **Buy the English print** unless you specifically want another language — foreign copies are cheaper but aren't the same card.

[[shop]]
- **Check the exact printing** — make sure you're buying the alt-art / signature / promo you actually want, not the base card (or vice versa).

Want to find your grail? **[Browse every Riftbound card](/browse)** and sort by price, or read our **[guide to where to buy Riftbound cards](/guides/where-to-buy-riftbound-cards)** for the best place to buy in your region.

## Most valuable Riftbound cards FAQ

**Which Riftbound cards are worth the most?** The top of the market is dominated by chase printings — Showcase alt-arts, Overnumbered prints and signed cards — rather than by the strongest gameplay cards. The list above is generated from live prices across every store we track and changes as the market moves.

**Are Riftbound cards worth anything?** Most individual cards are worth very little; value is concentrated in a small number of scarce printings. That's normal for a trading card game and is why a whole-collection figure usually comes down to a handful of cards.

**What makes a Riftbound card valuable?** Scarcity first, then desirability — how rarely the printing appears per box, how sought-after the champion or art is, and condition. Playability matters for ordinary singles but much less for chase prints. See [why Riftbound prices change](/guides/why-riftbound-card-prices-change).

**Should I get my Riftbound cards graded?** Grading mainly matters for high-value chase cards in excellent condition, since the fee is fixed regardless of what the card is worth. For ordinary singles it rarely makes sense. See **[the PSA & BGS grading guide](/guides/riftbound-psa-bgs-grading-guide)** for how the two services compare and what graders actually look at.

**Do Riftbound cards go up in value over time?** Some have and some haven't. Riftbound is a young game without a long price record, so treat any confident claim about future value sceptically — RiftCompare reports live prices and history rather than predictions.`,
    faq: [
      { q: "Which Riftbound cards are worth the most?", a: "The top of the market is dominated by chase printings — Showcase alt-arts, Overnumbered prints and signed cards — rather than by the strongest gameplay cards. RiftCompare's list is generated from live prices across every store it tracks and changes as the market moves." },
      { q: "Are Riftbound cards worth anything?", a: "Most individual cards are worth very little; value is concentrated in a small number of scarce printings. That's normal for a trading card game, and it's why a whole-collection figure usually comes down to a handful of cards." },
      { q: "What makes a Riftbound card valuable?", a: "Scarcity first, then desirability — how rarely the printing appears per box, how sought-after the champion or art is, and the card's condition. Playability matters for ordinary singles but much less for chase prints." },
      { q: "Should I get my Riftbound cards graded?", a: "Grading mainly matters for high-value chase cards in excellent condition, since the grading fee is fixed regardless of what the card is worth. For ordinary singles it rarely makes financial sense." },
      { q: "Do Riftbound cards go up in value over time?", a: "Some have and some haven't. Riftbound is a young game without a long price record, so treat confident claims about future value sceptically. RiftCompare reports live prices and price history rather than predictions." },
    ],
  },
  {
    slug: "riftbound-psa-bgs-grading-guide",
    shop: [
      { label: "Graded Riftbound cards (PSA & BGS)", query: "Riftbound PSA graded" },
      { label: "Signature & alt-art printings", query: "Riftbound signature alt art" },
    ],
    category: "guide",
    title: "Riftbound PSA & BGS Grading Guide",
    excerpt:
      "How to get Riftbound cards graded — PSA vs BGS, the grading scale, what graders look for, and whether it's worth it for your card.",
    author: "RiftCompare",
    date: "2026-08-21",
    readMins: 7,
    tags: ["collecting", "grading", "guide", "condition", "chase cards", "buying"],
    summary: [
      "**PSA and BGS are the two grading services collectors use for Riftbound** — neither is affiliated with Riot Games or UVS Games; they grade physical trading cards from any game.",
      "**PSA gives one overall grade, 1 (Poor) to 10 (Gem Mint)**, and is the most widely recognised, most liquid grading name in the hobby.",
      "**BGS gives four subgrades — centering, corners, edges, surface — plus an overall grade**; a card with all four subgrades at 10 earns BGS's famous Black Label.",
      "**Grading is worth it for Riftbound's chase tiers** — Signature, Showcase and Overnumbered printings — not for ordinary singles, where the flat submission fee usually costs more than the card is worth.",
    ],
    faq: [
      {
        q: "Should I get my Riftbound cards graded?",
        a: "Usually only your highest-value chase cards — Signature printings, Showcase alt-arts, Overnumbered prints — since the submission fee is fixed no matter what the card is worth. For an ordinary single, grading rarely pays for itself.",
      },
      {
        q: "PSA or BGS — which is better for Riftbound?",
        a: "PSA is the more widely recognised name and the deeper resale market, which matters for liquidity when you eventually sell. BGS's four subgrades give a more granular picture of a card's condition, which some collectors prefer for display-grade copies. Neither service is exclusive to Riftbound — both grade cards from any trading card game.",
      },
      {
        q: "What do graders actually look at?",
        a: "Four things: centering (how evenly the border frames the art on all sides), corners (sharpness, no whitening or rounding), edges (no nicks, roughness or whitening), and surface (no scratches, print lines, or indentations). PSA folds these into one overall number; BGS scores each separately as a subgrade.",
      },
      {
        q: "How much does it cost to grade a Riftbound card, and how long does it take?",
        a: "Both PSA and BGS run multiple submission tiers priced by turnaround speed and the card's declared value, and both change their pricing and wait times fairly often — check the current fees and turnaround directly on PSA's or Beckett's own site before submitting, rather than trusting a number from anywhere else.",
      },
      {
        q: "Is a Riftbound card officially graded by Riot or UVS Games?",
        a: "No. PSA and BGS are independent third-party companies with no affiliation to Riftbound's publishers — they'll grade a Riftbound card exactly the way they grade a card from any other game.",
      },
    ],
    browseCta: {
      href: "/guides/most-valuable-riftbound-cards",
      label: "See which cards are worth grading →",
      blurb: "The chase tiers — Signature, Showcase, Overnumbered — where grading fees are most likely to pay off.",
    },
    body: `**PSA and BGS** are the two names collectors mean when they talk about "getting a card graded" — independent companies with no affiliation to Riot Games or UVS Games, which grade physical trading cards from any game, Riftbound included. Here's how the two services differ, what graders are actually looking at, and when grading a Riftbound card is worth the fee.

## Why grade a card at all

Grading does two things: it locks the card in a tamper-evident case (a "slab") that protects it from further wear, and it puts an independent, numeric condition grade on it that a buyer doesn't have to take your word for. For a raw (ungraded) single, condition is a judgement call the seller makes at listing time — see [the Riftbound condition guide](/guides/riftbound-card-condition-guide) for how that works. A graded slab replaces that judgement call with a third party's number, which is worth something specifically on cards expensive enough that buyers want that certainty.

## PSA vs BGS

- **PSA (Professional Sports Authenticator)** grades on a single 1-10 scale — Poor at the bottom, Gem Mint 10 at the top — collapsing centering, corners, edges and surface into one overall number. It's the most widely recognised grading name in the hobby, and that recognition tends to translate into the deepest, most liquid resale market for a graded card.
- **BGS (Beckett Grading Services)** grades all four criteria separately as subgrades, then combines them into an overall grade in half-point increments. A card that scores a perfect 10 on every subgrade earns BGS's **Black Label** — a genuinely rare result that carries real premium over an ordinary 10. The subgrades give a more granular read on exactly where a card falls short, which matters more to some collectors than the single PSA number does.

Neither is objectively "better" — PSA's name recognition usually wins on resale liquidity, BGS's subgrades win on detail. Some collectors submit their most valuable pulls to both over time and compare.

## What graders actually look at

Both services score the same four things, whether or not they show it as one number or four:

- **Centering** — how evenly the printed border frames the card's art and text on all four sides. A card that looks fine at a glance can still be noticeably off-center under close inspection.
- **Corners** — sharp, undamaged corners with no whitening, fraying or rounding.
- **Edges** — clean edges with no nicks, roughness or whitening where the card's colour gives way to white card stock.
- **Surface** — no scratches, indentations, print lines or other marks across the front or back.

You can check the first three yourself before submitting: hold the card up to a light and compare the border margins on all four sides for centering, and run a finger lightly along the edges and corners (never the printed surface) to feel for damage a photo might miss.

## Is it worth it for Riftbound specifically?

Grading only makes financial sense once a card's raw value clears the submission fee by a comfortable margin — so it's a question of which Riftbound printings are worth enough to clear that bar. That's [the same chase tier as the rest of the value conversation](/guides/most-valuable-riftbound-cards): Signature printings, Showcase alt-arts and Overnumbered prints, not ordinary Commons or Uncommons. Riftbound is still a young game without a long graded-sales history the way an established TCG has, so treat any specific resale-premium claim for a graded Riftbound card skeptically — the graded aftermarket for this game is still forming.

## Before you submit

- **Never touch the printed surface with bare fingers** — oils transfer and can affect the surface grade. Handle a card by its edges only, or wear cotton gloves.
- **Sleeve it immediately** in a fresh penny sleeve, then a rigid toploader — a card that arrives at the grader already damaged in shipping grades exactly as it arrives.
- **Don't try to "fix" a card** — trimming, pressing or cleaning a card before submission is grading fraud at every major service and will get the card rejected or the submitter banned, not a better grade.
- **Check current fees and turnaround on the grader's own site** before submitting — both PSA and BGS run multiple tiers priced by speed and declared card value, and both change pricing and wait times often enough that any number printed elsewhere, including here, risks being stale by the time you read it.

## Grading FAQ

**Should I get my Riftbound cards graded?** Usually only your highest-value chase cards — Signature printings, Showcase alt-arts, Overnumbered prints — since the submission fee is fixed no matter what the card is worth. For an ordinary single, grading rarely pays for itself.

**PSA or BGS — which is better for Riftbound?** PSA's name recognition tends to mean deeper resale liquidity; BGS's four subgrades give a more granular read on condition. Neither is exclusive to Riftbound — both grade cards from any trading card game.

**What do graders actually look at?** Centering, corners, edges and surface — PSA folds these into one overall number, BGS scores each as a separate subgrade.

**Is a Riftbound card officially graded by Riot or UVS Games?** No — PSA and BGS are independent companies with no affiliation to Riftbound's publishers.

[[shop]]

Not sure whether your card clears the bar? **[Check its live raw price across every store we track](/browse)** first — if it's nowhere near the chase tier, save the submission fee and enjoy the card raw.`,
  },
  {
    slug: "riftbound-for-beginners",
    category: "guide",
    title: "Riftbound for Beginners: How to Start",
    excerpt:
      "New to Riftbound: League of Legends TCG? Here's how the game works, how to start playing, and exactly what to buy first without overspending.",
    author: "RiftCompare",
    date: "2026-06-08",
    updated: "2026-08-13",
    readMins: 5,
    tags: ["beginners", "guide", "how to start"],
    hero: {
      src: "/signature-cards/renekton-butcher-of-the-sands-ven190.jpg",
      alt: "Renekton, Butcher of the Sands — a real Riftbound Signature card, hand-signed by its artist",
    },
    summary: [
      "**Riftbound is Riot Games' physical League of Legends card game**, published in English by UVS Games — a real, official product, not a fan project.",
      "**The cheapest way in is a ready-to-play product** (a preconstructed deck or a Proving Grounds kit), not a booster box.",
      "**Five sets are out so far**: Origins, Origins: Proving Grounds, Spirit Forged, Unleashed and Vendetta — see [every set in order](/guides/riftbound-sets-in-order) for the full picture, including what's next.",
      "Coming from League of Legends itself rather than another card game? [Here's how the two connect](/guides/is-there-a-league-of-legends-card-game).",
    ],
    faq: [
      {
        q: "What do I need to start playing Riftbound?",
        a: "A single preconstructed deck or Proving Grounds kit is enough to play your first game — it comes complete and ready to play, no singles required.",
      },
      {
        q: "Is Riftbound expensive to get into?",
        a: "Not if you start right. A preconstructed deck is a fixed, modest cost, and you can upgrade it one card at a time with cheap singles rather than buying booster boxes hoping to pull what you need.",
      },
      {
        q: "How many Riftbound sets are there for a beginner to worry about?",
        a: "Five have released — Origins, Origins: Proving Grounds, Spirit Forged, Unleashed and Vendetta — but you don't need to know all of them to start. A single starter deck from any set is a complete, playable game on its own.",
      },
      {
        q: "Do I need to learn the full rules before buying anything?",
        a: "No — buy or borrow a starter deck first, then learn by playing. RiftCompare's interactive learn page walks through a full game step by step if you want the rules before you sit down.",
      },
    ],
    body: `**Riftbound** is the **League of Legends Trading Card Game** from Riot Games (published in English by UVS Games). If you're brand new, here's how to start playing — and exactly what to buy first without overspending.

## What is Riftbound?

Riftbound is a collectible card game set in the League of Legends universe. You build a deck around a **Legend** (your champion) using cards across the game's domains — **Fury, Calm, Mind, Body, Chaos, Order** and Colorless — and card types like **Units, Spells, Gear, Runes and Battlefields**. Five sets have released so far: **Origins (OGN)**, **Origins: Proving Grounds**, **Spirit Forged (SFD)**, **Unleashed (UNL)** and **Vendetta (VEN)** — see [every Riftbound set in order](/guides/riftbound-sets-in-order) if you want the full picture, including what's coming next. Coming from the video game rather than another card game? [Here's exactly how Riftbound connects to League of Legends](/guides/is-there-a-league-of-legends-card-game).

Want the full rules before you buy anything? The **[interactive learn page](/learn)** walks through a whole game step by step, domain by domain, free and with no signup.

## The easiest way to start

1. **Grab a ready-to-play product.** A preconstructed deck or a Proving Grounds kit gives you a complete, playable deck out of the box — the cheapest way in. Compare prices on the **[sealed products page](/sealed)**.
2. **Learn the deck**, then upgrade it card-by-card with **[singles](/browse)** — far cheaper than buying booster boxes hoping to pull what you need.
3. **Find the cheapest copies** with RiftCompare — see our **[where to buy Riftbound cards guide](/guides/where-to-buy-riftbound-cards)**.

## What to buy first (on a budget)

- **A preconstructed / Proving Grounds deck** — instant playability.
- **A handful of singles** to upgrade weak spots — look up exact prices on the **[card database](/browse)**.
- **Skip the chase cards at first** — alt-arts and Signatures look great but aren't needed to play well.

## Tips for new players

- **Browse the meta** on the **[decks page](/decks)** to see what top players run — and what it costs to build.
- **Price it before you buy** — drop a decklist into the **[deck pricer](/deck)** to see the full cost across stores before committing.

Ready to dive in? **[Browse the Riftbound card database](/browse)** or **[compare sealed products](/sealed)** to get started.`,
  },
  // ── Cross-game onboarding trio (2026-09-02) ─────────────────────────────────
  // Three guides aimed at players/collectors coming FROM another TCG, not total
  // hobby beginners — riftbound-for-beginners already owns that query. Each one
  // does two jobs: a SAFE, structural comparison (resource system, deck size,
  // chase-print tier) to build quick intuition, and a heavy focus on the two
  // things a crossover reader actually wants answered — where real Riftbound
  // cards are sold, and what the price landscape looks like — since that's
  // RiftCompare's own product, not just an explainer topic. Comparisons are
  // deliberately kept at "same shape, not identical rules" (no claim that a
  // Domain literally IS a Magic color, etc.) and every rules claim routes to
  // /guides/riftbound-rules-explained or /learn rather than re-deriving Riftbound
  // rules from scratch here. No invented crossover promos/collabs — there are
  // none; the comparison is genre-level (both are real, physical TCGs with a
  // singles market), not a claimed partnership.
  {
    slug: "pokemon-collector-to-riftbound",
    category: "guide",
    title: "From Pokémon to Riftbound: A Collector's Guide",
    excerpt:
      "New to Riftbound from Pokémon? How the two compare, where to actually buy Riftbound cards, and what to expect on price.",
    author: "RiftCompare",
    date: "2026-09-02",
    readMins: 6,
    tags: ["beginners", "how to start", "collecting", "buying guide", "pokemon"],
    shop: [
      { label: "Riftbound starter decks", query: "Riftbound starter deck" },
      { label: "Riftbound Signature cards", query: "Riftbound Signature card" },
    ],
    summary: [
      "**Riftbound is a real, physical trading card game from Riot Games** (published in English by UVS Games) — the same game-store-and-online buying pattern Pokémon collectors already know, not a digital-only spinoff.",
      "**The cheapest way in is a ready-to-play preconstructed deck**, the same role a Pokémon theme deck plays — not a booster box.",
      "**Riftbound's chase tier — Signature, Showcase and alternate-art prints — plays the same role Illustration Rares and Secret Rares do in Pokémon**, and Signature cards are hand-signed by the card's real artist.",
      "**RiftCompare compares live Riftbound prices** across [AU, US, UK, SG, CA and EU stores plus eBay](/stores/tracked), the same way a Pokémon collector already checks TCGplayer or eBay before buying.",
    ],
    faq: [
      {
        q: "Is Riftbound a real physical card game, or is it digital/app-based?",
        a: "It's a real, printed trading card game from Riot Games, published in English by UVS Games and sold through game stores and online singles marketplaces — the same channels Pokémon cards move through, not an app or a digital collectible.",
      },
      {
        q: "How does Riftbound's resource system compare to Pokémon Energy?",
        a: "Pokémon attacks are powered by Energy cards attached to your Pokémon; Riftbound's plays are powered by Runes tied to your deck's Domains (Fury, Calm, Mind, Body, Chaos and Order). The shape is similar — a resource type you commit to before the game starts — but the mechanics aren't identical, so treat it as a starting intuition, not a direct swap. The full rules are in Riftbound Rules Explained or the interactive learn page.",
      },
      {
        q: "What's the Riftbound equivalent of a Pokémon Illustration Rare or Secret Rare?",
        a: "Riftbound's own chase tier: Showcase prints, alternate art, and Signature cards — hand-signed by the card's original artist. Understanding Riftbound Card Rarity covers exactly where each tier sits and what drives its premium.",
      },
      {
        q: "What should a Pokémon collector buy first to try Riftbound?",
        a: "A single preconstructed deck or Proving Grounds kit — complete and playable out of the box, the same role a Pokémon theme deck plays. Riftbound for Beginners and The Cheapest Way to Start Riftbound both cover what to buy first without overspending.",
      },
      {
        q: "Are there any official Pokémon x Riftbound crossover cards?",
        a: "No — Riftbound is a Riot Games property set in the League of Legends universe, unrelated to Pokémon or The Pokémon Company. Nothing here claims or implies an official crossover; the comparison is about how the two hobbies work, not a shared product.",
      },
    ],
    browseCta: {
      href: "/browse",
      label: "Search the Riftbound card database →",
      blurb: "Every card, every printing, with live prices compared across every store and market we track.",
    },
    embed: {
      title: "Cards worth knowing, whichever game you're coming from",
      note: "The real competitive staples right now, pulled live from our database — ordered by how many tracked tournament decklists run each one. Tap any card for its full text, every printing, and the cheapest store today.",
      metaStaples: { minDecks: 2 },
      take: 12,
    },
    body: `If you collect or play Pokémon, you already know the rhythm: theme decks to learn on, singles to fill out a build, a chase tier that makes a binder page worth showing off, and a habit of checking prices across a few sites before you actually buy anything. **Riftbound: League of Legends TCG** — Riot Games' real, physical card game, published in English by UVS Games — runs on the same rhythm. Here's how the two connect, and how to actually find and buy real Riftbound cards without overpaying.

## Riftbound is a real card game, not a spinoff

This is the first thing worth being clear on: Riftbound is a genuine, in-print trading card game, sold through game and hobby stores and online singles marketplaces the same way Pokémon is — not a mobile tie-in, not a digital-only collectible, not a fan project. It's set in the League of Legends universe, so the "roster" is champions you may already recognize from the game rather than a new cast to learn from zero. If you want the full picture of what it is and how it plays, the **[interactive learn page](/learn)** walks through a complete game step by step, free, with no signup.

## How the pieces map onto what you already know

Nothing here is a claim that the two games are mechanically identical — they aren't — but the *shape* will feel familiar:

| Pokémon | Riftbound | The honest difference |
| --- | --- | --- |
| Energy cards power your attacks | **Runes** tied to your deck's **Domains** power your plays | Domains (Fury, Calm, Mind, Body, Chaos, Order) are a color-identity-style constraint you commit to before building, closer to a deck archetype than a 1-for-1 Energy swap |
| Your active/bench Pokémon | Your **Legend** and **Champion**, plus **Units** on the board | A Legend anchors your whole deck's identity the way a lead Pokémon doesn't quite |
| Theme decks | Preconstructed decks / Proving Grounds kits | Same job: a complete, playable deck out of the box |
| Illustration Rare / Secret Rare | **Showcase**, alternate art, **Signature** prints | Signature cards are hand-signed by the card's real artist — a direct analog to a signed slab a Pokémon collector already knows the appeal of |
| Rotation (Standard) | No announced rotation | Every set released so far stays legal — see **[does Riftbound rotate?](/guides/riftbound-format-legality-rotation)** |

For the real rules rather than the shorthand version, **[Riftbound Rules Explained](/guides/riftbound-rules-explained)** is the hub, and **[how a Riftbound deck is actually built](/guides/how-a-riftbound-deck-is-built)** covers deck construction card type by card type.

## How to actually get Riftbound cards

This is usually the real question once the "is this a real game" part is settled. The buying pattern is close to what you already do for Pokémon:

1. **Start with a ready-to-play product.** A preconstructed deck or Proving Grounds kit is the cheapest, fastest way in — complete and playable, no singles required. Compare current listings on the **[sealed products page](/sealed)**.
2. **Fill in the gaps with singles**, not more booster boxes. Upgrading a starter deck card-by-card is far cheaper than gambling on packs for the one card you actually want — the same logic that makes singles-hunting worthwhile in Pokémon. Search the **[card database](/browse)**.
3. **Compare before you buy.** Riftbound cards are sold across a real, spread-out market — independent game stores, TCGplayer-style listings, and eBay — in six currency markets (Australia, the US, the UK, Singapore, Canada and the EU). RiftCompare tracks all of it live, the same job a Pokémon collector already asks TCGplayer or eBay comps to do. See **[every store we track](/stores/tracked)**.

**[Where to Buy Riftbound Cards](/guides/where-to-buy-riftbound-cards)** covers all six markets and 100+ stores in one place if you want the full breakdown before you commit to a first purchase.

## What things cost, and how to keep track

Prices move daily, the same way a hot Pokémon set's prices do in its first weeks — which is exactly why a live comparison tool is more useful than a number frozen at publish time. A few honest guideposts instead of a stale price list:

- **Ready-to-play products are the predictable, budget-friendly entry point** — a fixed cost, no pack-opening variance.
- **Booster boxes are the highest-variance route**, the same trade-off as a Pokémon booster box: you might pull the chase card, you might not.
- **Chase prints (Signature, Showcase, alt-art) carry a real premium**, the same way an Illustration Rare does over its base print — **[understanding Riftbound card rarity](/guides/understanding-riftbound-card-rarity)** explains exactly what separates each tier.
- **Watch price movement, don't just check once.** The **[daily movers page](/movers)** shows what's trending up or down right now, the same instinct that keeps a Pokémon collector refreshing a marketplace watchlist.

## Where to start

**[Riftbound for Beginners](/guides/riftbound-for-beginners)** is the fastest path from "curious" to "playing" — what to buy first and how much to spend. **[The Cheapest Way to Start Riftbound](/guides/cheapest-way-to-start-riftbound)** compares every realistic entry point on cost. And when you're ready to actually shop, **[browse the full card database](/browse)** or **[compare sealed products](/sealed)** — every price is live, and every store is one you can actually buy from.`,
  },
  {
    slug: "one-piece-tcg-to-riftbound",
    category: "guide",
    title: "From One Piece TCG to Riftbound: A Collector's Guide",
    excerpt:
      "New to Riftbound from the One Piece Card Game? How the two compare, where to buy real Riftbound cards, and what to expect on price.",
    author: "RiftCompare",
    date: "2026-09-02",
    readMins: 6,
    tags: ["beginners", "how to start", "collecting", "buying guide", "one piece"],
    shop: [
      { label: "Riftbound starter decks", query: "Riftbound starter deck" },
      { label: "Riftbound Vendetta singles", query: "Riftbound Vendetta" },
    ],
    summary: [
      "**Riftbound is a real, physical trading card game from Riot Games** (published in English by UVS Games) — sold through the same game stores and online singles marketplaces the One Piece Card Game already moves through.",
      "**Both are genuinely recent games** — One Piece TCG launched in 2022, Riftbound in 2026 — so the early-set scarcity and chase-print dynamics will feel familiar rather than needing a decade of set history to understand.",
      "**A Riftbound deck is built around a Legend and Champion**, similar in feel to how a One Piece deck is built around its Leader card, even though the mechanics differ.",
      "**RiftCompare compares live Riftbound prices** across [AU, US, UK, SG, CA and EU stores plus eBay](/stores/tracked) — the same live-comparison habit a One Piece TCG buyer already has for a fast-moving new set.",
    ],
    faq: [
      {
        q: "Is Riftbound similar to the One Piece Card Game in how new it is?",
        a: "Yes, more than most comparisons — the One Piece Card Game launched in 2022 and Riftbound in 2026, so both are genuinely early in their print history rather than decades-deep formats. If you're used to how a One Piece set's early scarcity and chase prints behave, Riftbound's current five-set catalogue will feel like familiar territory.",
      },
      {
        q: "How does Riftbound's Legend and Champion compare to a One Piece Leader?",
        a: "A One Piece deck is built around its Leader card, which sets the deck's identity and colors. A Riftbound deck is built around a Legend and Champion, which similarly anchor its Domains (Fury, Calm, Mind, Body, Chaos, Order) and overall plan. The feel is close; the exact rules aren't identical — see how a Riftbound deck is actually built for the real mechanics.",
      },
      {
        q: "What's the Riftbound equivalent of a One Piece Leader/Secret Rare parallel?",
        a: "Riftbound's chase tier: Showcase prints, alternate art, and Signature cards, hand-signed by the card's original artist. Understanding Riftbound Card Rarity covers where each tier sits and what drives its price.",
      },
      {
        q: "Where can I actually buy Riftbound singles and sealed product?",
        a: "The same kind of channels the One Piece Card Game sells through — independent game stores and online singles marketplaces, in six currency markets (Australia, the US, the UK, Singapore, Canada and the EU). Where to Buy Riftbound Cards covers all of them, and RiftCompare tracks live prices across every one.",
      },
      {
        q: "Are there any official One Piece x Riftbound crossover cards?",
        a: "No — Riftbound is a Riot Games property set in the League of Legends universe and One Piece TCG is published by Bandai; the two are unrelated. This guide compares how the two hobbies work, not a claimed partnership.",
      },
    ],
    browseCta: {
      href: "/browse",
      label: "Search the Riftbound card database →",
      blurb: "Every card, every printing, with live prices compared across every store and market we track.",
    },
    embed: {
      title: "Cards worth knowing, whichever game you're coming from",
      note: "The real competitive staples right now, pulled live from our database — ordered by how many tracked tournament decklists run each one. Tap any card for its full text, every printing, and the cheapest store today.",
      metaStaples: { minDecks: 2 },
      take: 12,
    },
    body: `The One Piece Card Game trained a whole generation of collectors on what it's like to get into a card game while it's still young — chasing early-set scarcity, watching a fresh secondary market form in real time, learning a Leader's identity before you've memorized the full card pool. **Riftbound: League of Legends TCG**, Riot Games' real, physical card game (published in English by UVS Games), is at a similar point in its own life right now. Here's how the two connect, and — the part that actually matters once you're curious — how to find and buy real Riftbound cards without overpaying.

## Riftbound is a real card game, not a spinoff

Riftbound is a genuine, in-print trading card game sold through game and hobby stores and online singles marketplaces, the same way the One Piece Card Game is — not a mobile tie-in, not a digital-only collectible. It's set in the League of Legends universe, built around champions rather than the Straw Hats, but the *hobby* — opening packs, building around a leader-style card, hunting a chase print — will feel immediately familiar. The **[interactive learn page](/learn)** walks through a complete game step by step, free, no signup.

## How the pieces map onto what you already know

Not a claim that the two games play identically — they don't — but the shape rhymes:

| One Piece TCG | Riftbound | The honest difference |
| --- | --- | --- |
| DON!! cards fuel your plays | **Runes** tied to your deck's **Domains** fuel yours | Domains (Fury, Calm, Mind, Body, Chaos, Order) shape which cards your deck can reliably cast, closer to a color identity than a direct DON!! swap |
| Your Leader card sets your deck's identity | Your **Legend** and **Champion** set yours | A Legend anchors the whole deck the way a Leader does, without being rules-identical |
| Life cards instead of a life total | (Different win-condition structure) | Worth learning properly rather than assuming a 1-for-1 — see the rules guide below |
| Starter decks | Preconstructed decks / Proving Grounds kits | Same job: complete, playable, no singles required |
| Secret Rare / Leader parallels | **Showcase**, alternate art, **Signature** prints | Signature cards are hand-signed by the card's real artist |

For the real rules, **[Riftbound Rules Explained](/guides/riftbound-rules-explained)** is the hub, and **[how a Riftbound deck is actually built](/guides/how-a-riftbound-deck-is-built)** covers construction card type by card type — worth reading properly rather than assuming the analogy above is exact.

## How to actually get Riftbound cards

Once "is this a real game" is settled, this is the actual question. The buying pattern is close to what a One Piece TCG buyer already does:

1. **Start with a ready-to-play product.** A preconstructed deck or Proving Grounds kit is the cheapest, fastest way in — complete out of the box. Compare current listings on the **[sealed products page](/sealed)**.
2. **Fill in the gaps with singles.** Upgrading a starter deck card-by-card beats gambling on packs for one specific card — the same logic that makes singles-hunting worthwhile in a fast-moving new TCG. Search the **[card database](/browse)**.
3. **Compare across the real market.** Riftbound sells through independent game stores, TCGplayer-style listings and eBay, across six currency markets (Australia, the US, the UK, Singapore, Canada and the EU). RiftCompare tracks all of it live. See **[every store we track](/stores/tracked)**.

**[Where to Buy Riftbound Cards](/guides/where-to-buy-riftbound-cards)** covers all six markets and 100+ stores in one place.

## What things cost, and how to keep track

Both games share the same early-life pricing pattern: prices move fast while the card pool and player base are still settling, which makes a snapshot number stale within days. A few honest guideposts instead:

- **Ready-to-play products are the predictable entry point** — fixed cost, no pack-opening variance.
- **Booster boxes are the highest-variance route** — the trade-off you already know from chasing a Leader parallel.
- **Chase prints carry a real premium.** **[Understanding Riftbound card rarity](/guides/understanding-riftbound-card-rarity)** explains exactly what separates Showcase, alternate art and Signature.
- **Watch price movement, don't just check once** — the **[daily movers page](/movers)** shows what's trending right now, the same habit that keeps a young TCG's secondary market legible.

## Where to start

**[Riftbound for Beginners](/guides/riftbound-for-beginners)** is the fastest path from curious to playing. **[The Cheapest Way to Start Riftbound](/guides/cheapest-way-to-start-riftbound)** compares every realistic entry point on cost. When you're ready to shop, **[browse the full card database](/browse)** or **[compare sealed products](/sealed)** — every price is live, every store is one you can actually buy from.`,
  },
  {
    slug: "mtg-to-riftbound",
    category: "guide",
    title: "From Magic: The Gathering to Riftbound: A Player's Guide",
    excerpt:
      "New to Riftbound from Magic: The Gathering? How the two compare, where to buy singles, and what live Riftbound prices actually look like.",
    author: "RiftCompare",
    date: "2026-09-02",
    readMins: 7,
    tags: ["beginners", "how to start", "deckbuilding", "buying guide", "mtg"],
    shop: [
      { label: "Riftbound singles", query: "Riftbound TCG singles" },
      { label: "Riftbound starter decks", query: "Riftbound starter deck" },
    ],
    summary: [
      "**Riftbound is a real, physical trading card game from Riot Games** (published in English by UVS Games) — sold through the same LGS-and-online singles market Magic players already live in.",
      "**Domains work a little like Magic's colors**: a deck commits to one or two of Fury, Calm, Mind, Body, Chaos or Order, and your 12 Runes have to match, the same way a manabase has to match your colors.",
      "**No rotation has been announced** — every set released so far (Origins, Origins: Proving Grounds, Spirit Forged, Unleashed, Vendetta) stays legal, closer to how Magic's Eternal formats behave than Standard.",
      "**RiftCompare's whole job is what a Magic player already does on TCGplayer** — comparing real listings across independent stores (plus eBay) to find delivered cost, not just sticker price, live across [six currency markets](/stores/tracked).",
    ],
    faq: [
      {
        q: "Do Riftbound Domains work like Magic's five colors?",
        a: "Structurally, yes — a deck commits to one or two of Riftbound's Domains (Fury, Calm, Mind, Body, Chaos, Order, plus Colorless), and your 12 Runes have to match, the same discipline a Magic manabase enforces around its colors. The mechanics aren't identical, so treat it as a starting intuition — Riftbound Rules Explained and the interactive learn page have the real rules.",
      },
      {
        q: "Does Riftbound have a rotating Standard-style format?",
        a: "No rotation has been announced. Every set released so far — Origins, Origins: Proving Grounds, Spirit Forged, Unleashed and Vendetta — is currently legal everywhere, closer to how a Magic Eternal format behaves than Standard. Does Riftbound rotate? covers the full picture, including the banlist, which does exist.",
      },
      {
        q: "How big is a Riftbound deck compared to a Magic deck?",
        a: "A Riftbound deck runs a Legend, a Champion, a roughly 40-card main deck of Units/Gear/Spells, 12 Runes, 3 Battlefields and a side deck of up to 10 — different totals from Magic's 60-card (or 100-card Commander) format, but the same idea of a defined, legal deck shape. How a Riftbound deck is actually built breaks down every part.",
      },
      {
        q: "Where do Riftbound prices actually come from?",
        a: "The same kind of real, independent secondary market Magic singles trade on — game stores and online marketplaces (plus eBay), across six currency markets: Australia, the US, the UK, Singapore, Canada and the EU. RiftCompare tracks live listings across all of them and ranks by total delivered cost, not just sticker price.",
      },
      {
        q: "Are there any official Magic x Riftbound crossover cards?",
        a: "No — Riftbound is a Riot Games property and Magic: The Gathering is published by Wizards of the Coast; the two are unrelated products. This guide compares how the two hobbies work, not a claimed partnership.",
      },
    ],
    browseCta: {
      href: "/browse",
      label: "Search the Riftbound card database →",
      blurb: "Every card, every printing, with live prices compared across every store and market we track.",
    },
    embed: {
      title: "Cards worth knowing, whichever game you're coming from",
      note: "The real competitive staples right now, pulled live from our database — ordered by how many tracked tournament decklists run each one. Tap any card for its full text, every printing, and the cheapest store today.",
      metaStaples: { minDecks: 2 },
      take: 12,
    },
    body: `Magic players already have the instincts a new TCG rewards: read the whole card before you judge it, check a real market price before you buy, and don't assume a mechanic works the way you'd guess until you've read the actual rules text. **Riftbound: League of Legends TCG** — Riot Games' real, physical card game, published in English by UVS Games — is worth that same treatment. Here's the honest comparison, and how to actually find and buy real Riftbound cards without overpaying.

## Riftbound is a real card game, not a spinoff

Riftbound is a genuine, in-print trading card game, sold through game stores and online singles marketplaces the same way Magic is — not a mobile app, not a digital-only collectible. It's set in the League of Legends universe rather than Magic's multiverse, built around champions instead of planeswalkers. If you'd rather read the real rules than a comparison table, the **[interactive learn page](/learn)** walks through a complete game step by step, free, no signup, and **[Riftbound Rules Explained](/guides/riftbound-rules-explained)** is the full hub.

## How the pieces map onto what you already know

Structural similarity, not a rules match — the analogy is meant to build intuition fast, not to substitute for the real text:

| Magic: The Gathering | Riftbound | The honest difference |
| --- | --- | --- |
| Lands produce mana in 5 colors | **Runes** tied to **Domains** power your plays | 7 Domains (Fury, Calm, Mind, Body, Chaos, Order, plus Colorless) rather than 5 colors; a deck commits to one or two, same discipline as a manabase |
| A 60-card deck (100 for Commander) | A ~40-card main deck + 12 Runes + 3 Battlefields + up to 10 side deck | Different totals, same idea of a fixed, legal deck shape — **[the full anatomy](/guides/how-a-riftbound-deck-is-built)** |
| Standard rotates; Eternal formats don't | No announced rotation | Every set so far stays legal — closer to how Magic's Eternal formats behave |
| A banned/restricted list | A real banlist | **[The banlist explained](/guides/riftbound-banlist-explained)** and the **[July 2026 update](/blog/riftbound-july-2026-ban-list-update)** |
| Foils, alternate arts, Secret Lairs | **Showcase**, alternate art, **Signature** prints | Signature cards are hand-signed by the card's real artist |
| TCGplayer market price | RiftCompare's live comparison | The exact habit you already have, applied to a different game |

## How to actually get Riftbound cards

The buying pattern will feel immediately familiar:

1. **Start with a ready-to-play product** if you want to learn the game cheaply — a preconstructed deck or Proving Grounds kit, no singles required. Compare current listings on the **[sealed products page](/sealed)**.
2. **Buy singles for a real deck**, the way you'd build a Magic deck around a specific list rather than crack packs hoping to hit it. Search the **[card database](/browse)**, or price a whole decklist at once with the **[deck pricer](/deck)**.
3. **Compare across the real market**, exactly like checking TCGplayer before a Magic purchase. Riftbound sells through independent game stores, marketplace listings and eBay, across six currency markets (Australia, the US, the UK, Singapore, Canada and the EU). RiftCompare ranks by total delivered cost — postage included where a store publishes it, not just the sticker price. See **[every store we track](/stores/tracked)**.

**[Where to Buy Riftbound Cards](/guides/where-to-buy-riftbound-cards)** covers all six markets and 100+ stores in one place, and **[Best Basket](/tools/best-basket)** splits a full decklist across stores to find the cheapest combined order once shipping is counted — the same problem a multi-store Magic order has.

## What things cost, and how to keep track

No fabricated numbers here — prices move daily and any figure printed today would be stale by the time you read it, which is exactly why a live tool beats a listicle. What's stable instead:

- **Ready-to-play products are the fixed-cost entry point** — no pack-opening variance.
- **Chase prints carry a real premium.** **[Understanding Riftbound card rarity](/guides/understanding-riftbound-card-rarity)** covers exactly what separates a base print from Showcase, alternate art and Signature — the closest Riftbound equivalent to a Magic foil-vs-nonfoil or Secret Lair premium.
- **Watch price movement, not just a single snapshot** — the **[daily movers page](/movers)** shows what's trending up or down right now, the same signal a Magic player reads off a price-tracking tool.
- **A deck's real cost is total delivered cost, not the sum of sticker prices** — the same lesson every Magic player learns the first time postage eats a "cheap" multi-store order.

## Where to start

**[Riftbound for Beginners](/guides/riftbound-for-beginners)** is the fastest path from curious to playing. **[The Cheapest Way to Start Riftbound](/guides/cheapest-way-to-start-riftbound)** compares every realistic entry point on cost, and **[Riftbound deck archetypes](/guides/riftbound-deck-archetypes-guide)** is the deckbuilding-strategy version of this guide once you're past the basics. When you're ready to shop, **[browse the full card database](/browse)** or **[compare sealed products](/sealed)** — every price is live.`,
  },
  {
    slug: "riftbound-singles-vs-sealed",
    // The whole article is one decision, and it resolves in the paragraph the
    // marker follows — so the strip offers both branches rather than picking for
    // the reader. Two links, one per answer; adding more would re-open a question
    // the article just closed.
    shop: [
      { label: "Riftbound singles", query: "Riftbound TCG singles" },
      { label: "Riftbound booster boxes", query: "Riftbound booster box" },
    ],
    category: "guide",
    title: "Riftbound Singles vs Sealed: What's Better Value?",
    excerpt:
      "Should you buy Riftbound singles or sealed booster boxes? A simple breakdown of when each makes sense and how to get the best value.",
    author: "RiftCompare",
    date: "2026-06-08",
    readMins: 4,
    tags: ["buying", "guide", "singles", "sealed", "value"],
    body: `Should you buy **Riftbound** singles or sealed booster boxes? It depends on your goal. Here's a simple breakdown to help you spend wisely.

## Buy singles when…

- You want **specific cards** to build or finish a deck.
- You're chasing a particular **alt-art, Signature or promo** card.
- You want the **cheapest path** to a competitive deck — buying the exact cards you need almost always beats ripping boxes.

Look up any card's live price across stores on the **[card database](/browse)**, and price a whole list at once with the **[deck pricer](/deck)**.

## Buy sealed when…

- You enjoy the **opening experience** or want to draft.
- You're **collecting or investing** and want unopened product.
- You're after the occasional **chase pull** and don't mind the variance.

Compare booster box and pack prices on the **[sealed products page](/sealed)** — see our **[cheapest booster boxes guide](/guides/cheapest-riftbound-booster-boxes)**.

## The value reality

A booster box has a fixed expected value spread across many cards. If you only need a few specific cards, you'll usually pay **less by buying those singles directly** than by opening boxes and hoping. If you value the experience or want everything sealed, boxes win. There's no wrong answer — just buy whichever at the best price, which is exactly what RiftCompare is for.

[[shop]]

## Bottom line

- **Building a deck?** → **[Buy singles](/browse).**
- **Opening / collecting / investing?** → **[Buy sealed](/sealed).**

Either way, **compare prices first** — see **[where to buy Riftbound cards](/guides/where-to-buy-riftbound-cards)**.`,
  },
  {
    slug: "budget-riftbound-decks",
    category: "guide",
    title: "Best Budget Riftbound Decks & How to Build Cheap",
    excerpt:
      "How to build a competitive Riftbound: League of Legends TCG deck on a budget — and price every card before you buy.",
    author: "RiftCompare",
    date: "2026-06-08",
    readMins: 5,
    tags: ["decks", "guide", "budget"],
    body: `You don't need a huge budget to play **Riftbound** competitively. Here's how to build a strong deck cheaply — and price it before you buy.

## Start from a known list

The quickest budget route is to start from a proven decklist and trim the expensive cards. Browse current **[meta and preconstructed decks](/decks)** — each shows a **live build cost** so you can see what a deck costs in your region before committing.

## Price your deck before you buy

Paste any decklist into the **[deck pricer](/deck)** and it matches every card to its cheapest live price across stores, then totals it up. Tweak the list, re-price, and watch the cost drop — the fastest way to find the cheapest version of a deck.

## Budget-building tips

- **Lean on Commons and Uncommons** — they do most of the work for a fraction of chase-rare prices.
- **Use base printings, not alt-arts** — the base card plays identically for far less. RiftCompare labels each printing in the card name so you can pick the cheap base version on the **[card database](/browse)**.
- **Buy singles, not boxes** — for a specific list, singles are almost always cheaper.
- **Consolidate orders** — buying several cards from one store can unlock free shipping and beat splitting an order.
- **Price the whole list first** — the **[deck pricer](/deck)** totals a decklist across every store before you commit to buying.

[[shop]]

## Then find the cheapest cards

Once you've locked a list, **[search the database](/browse)** for each card and buy from whichever store is cheapest — or read our **[where to buy Riftbound cards guide](/guides/where-to-buy-riftbound-cards)** for the best option in your region.

Build smart, compare prices, and you'll have a competitive Riftbound deck without overspending.`,
    // Placed mid-article: the tips list above is where a budget builder decides
    // WHAT to buy (commons, base printings, singles over boxes), so the buy path
    // belongs there rather than under the FAQ. Bulk lots are deliberately first —
    // they're the genuinely budget-shaped eBay category and the one a reader can't
    // get from our own store comparison, which prices singles individually.
    shop: [
      { label: "Riftbound card lots & bundles", query: "Riftbound TCG card lot" },
      { label: "Budget singles — Commons & Uncommons", query: "Riftbound TCG singles" },
      { label: "Vendetta singles", query: "Riftbound Vendetta single" },
    ],
  },
  {
    slug: "how-a-riftbound-deck-is-built",
    category: "guide",
    title: "How a Riftbound Deck Is Built",
    excerpt:
      "Legend, Champion, main deck, runes, battlefields and the 10-card side deck — the anatomy of a Riftbound deck, explained with real examples.",
    author: "RiftCompare",
    date: "2026-06-06",
    updated: "2026-08-04",
    readMins: 4,
    tags: ["beginner", "deckbuilding"],
    body: `New to Riftbound deckbuilding? A constructed deck is made of a few distinct parts. Here's how the current tournament lists are put together.

## The parts of a deck

- **Legend (1)** — your identity card. It sets your deck's direction and which Champion you build around (e.g. *Master Yi, Wuju Bladesman*).
- **Champion (1)** — your signature unit, tied to your legend (e.g. *Master Yi, Tempered*).
- **Main deck (~40 cards)** — your **Units**, **Gear** and **Spells**. This is where most of your strategy lives.
- **Runes (12)** — your resource cards. Their colours must match your deck's **domains**.
- **Battlefields (3)** — the locations you contest during the game.
- **Side deck (up to 10)** — extra cards you can swap in between games at tournaments. This went up from 8 in the [July 2026 tournament rules update](https://playriftbound.com/en-us/news/announcements/july-2026-tournament-rules-update-changelog/), effective **24 July 2026**.

Add it up and a full tournament list is **66 cards** (56 in the main deck plus a full 10-card side deck).

Two rules govern what can go in that side deck:

- **No Runes, Legends or Battlefields.** Those live in their own zones and can't be sideboarded.
- **The 3-copy limit is shared.** You may run at most 3 copies of a card across your main deck and side deck *combined* — 3 in the main leaves you 0 in the side.

## Domains and runes

Riftbound has seven domains — **Fury, Calm, Mind, Body, Chaos, Order** and **Colorless**. Most competitive decks commit to **one or two** domains (for example *Master Yi* is Body/Calm, while *Irelia* is Calm/Chaos). Your 12 runes are split to match those domains, which is how you reliably cast your cards.

## Building on a budget

A deck's cost is dominated by a handful of chase cards — the commons, runes and battlefields are cheap. On every **[meta deck page](/decks)** we show the build cost broken down card-by-card and priced in your own market, so you can see exactly where the money goes and where to save. Want to tweak a list? Open it in the **[Deck Builder](/deck)** to re-price your own version.

## Mulligan: keep or ship your opening hand

After you draw your opening hand you get one chance to mulligan — shuffle back any number of cards and redraw that many. A good keep usually has:

- **Enough runes to cast your early plays** — a hand with no resources, or all resources and no spells, is a mulligan.
- **Something to do on your first few turns** — a cheap unit or a tempo spell so you're not passing turns.
- **A plan that matches your domains** — if your runes can't cast the expensive cards in hand, ship the dead weight.

Against aggressive decks, keep cheap blockers and removal; against slower decks, you can keep a slightly greedier hand with your stronger mid-game cards.

## Sideboarding between games

At tournaments you play best-of-three, and between games you can swap up to your full side deck (**10 cards** since 24 July 2026, up from 8) in and out. The idea is to tune your deck to the matchup: bring in extra removal against go-wide decks, more resilient threats against control, or anti-aggro tools when you're on the back foot. Plan your swaps **before** the event — for each common matchup, decide which cards come out and which come in, so you're not guessing at the table.

The two extra slots are worth more than they look. Eight slots usually forced you to cover only the two or three matchups you expected most; ten lets you keep a dedicated answer for a fourth deck without cutting your core plan, which is exactly why the change landed alongside Vendetta and its sideboard-oriented designs.

Want to try these ideas out before committing? **[Price the final deck](/deck)** across every store first, so you know exactly what the build costs before you buy.`,
  },
  {
    slug: "best-basket-cheapest-riftbound-deck",
    category: "guide",
    title: "Best Basket: The Cheapest Way to Buy a Riftbound Deck",
    excerpt:
      "Pricing every card at its own cheapest store usually means paying postage a dozen times over. Best Basket finds the store split that's actually cheapest delivered — here's exactly how it works.",
    author: "RiftCompare",
    date: "2026-08-24",
    readMins: 6,
    tags: ["best basket", "deckbuilding", "buying", "guide", "shipping"],
    hero: {
      src: "/blog/best-basket-cheapest-riftbound-deck.png",
      alt: "Best Basket — the cheapest way to buy a Riftbound deck, comparing an optimised store split against the naive per-card total",
    },
    summary: [
      "**The naive way to buy a deck — each card from whichever store has it cheapest — is usually NOT the cheapest way once shipping is counted.** A 40-card list priced that way can easily spread across a dozen stores, each charging its own postage.",
      "**Best Basket solves a different problem**: not \"what's the cheapest price per card\" but \"what's the cheapest way to buy the WHOLE list\", factoring in every store's shipping cost and free-shipping threshold.",
      "**It's a RiftCompare Premium tool**, and shows you the naive-split cost right alongside its optimised one, so the saving is a number you can check, not a claim.",
      "Just pricing a list, not buying it yet? **[The free deck pricer](/deck)** needs no account at all.",
    ],
    browseCta: {
      href: "/tools/best-basket",
      label: "Try Best Basket →",
      blurb: "Paste a decklist or use your wishlist and see the cheapest way to buy the whole thing.",
    },
    body: `Price a 40-card Riftbound deck the obvious way — open each card, buy it from whichever store is cheapest — and you'll usually end up with an order spread across eight, ten, sometimes fifteen different stores. Each one charges its own shipping. The "cheapest" card-by-card total quietly stops being the cheapest total once postage lands on top of it a dozen times.

**[Best Basket](/tools/best-basket)** exists to fix exactly that. It's a RiftCompare Premium tool that takes a full decklist and works out the cheapest way to buy *all of it*, not the cheapest way to buy each card in isolation.

## The problem, concretely

Say a 40-card list has its cheapest matches spread across 12 different stores. Buy it that way and you're paying 12 separate shipping charges — plus 12 separate deliveries to track, 12 separate free-shipping thresholds you're not close enough to hit, and a much higher chance one store is out of stock by the time you check out.

Consolidate the same list into, say, 3 or 4 stores instead, and you often come out **cheaper overall** even though a few individual cards cost a little more than their absolute lowest listing — because you're paying shipping 3 or 4 times instead of 12, and you're more likely to clear each store's free-shipping threshold along the way. That trade-off — a few cents more per card against dramatically less postage — is exactly the calculation nobody wants to do by hand across a 40-card list and a dozen stores' worth of shipping policies.

## How Best Basket actually works

1. **Give it a list.** Paste any decklist in standard list format, or point it at your own wishlist/watchlist from your account. If you got here from a deck page, your list is often already pre-filled.
2. **It prices every viable store split** — not just the single cheapest store for each card, but combinations of stores that carry enough of the list to be worth consolidating into, each with its real shipping cost and free-shipping threshold applied.
3. **It shows you the comparison, not just the answer.** The result names the store split, the total delivered cost, and — right alongside it — what the "naive" per-card-cheapest approach would have cost and how many stores it would have needed. You can see the saving, not just be told one exists.
4. **You check out at each store yourself.** Best Basket tells you where to buy; it doesn't process the order. Every store in the plan gets a direct link.

## Best Basket vs. the free deck pricer

RiftCompare has two related tools, and it's worth knowing which one you actually want:

- **[The deck pricer](/deck)** — free, no account needed. Prices every card in a list at its own cheapest store and adds it up. Good for a quick "what's this deck worth" check.
- **[Best Basket](/tools/best-basket)** — a Premium tool. Solves the harder, more useful question: what's the cheapest way to actually *buy* the list, once you stop pretending shipping is free.

If you're pricing a list out of curiosity, the deck pricer is enough. If you're actually about to place an order, Best Basket is the one that saves you real money.

## When it matters most

- **Full 40-card decks**, where the naive approach realistically does spread across a dozen-plus stores.
- **Cheap-to-mid-value staples** — commons and uncommons where postage is a large fraction of the card's own price, so consolidating a handful of $1-2 cards into one store's order genuinely moves the total.
- **Rebuilding after a rotation or ban**, when you're replacing several cards at once rather than one at a time.

It matters least for a single chase card or a short shopping list of two or three cards — there's no split to optimise when everything's coming from one order anyway.

## Try it

**[Open Best Basket](/tools/best-basket)**, paste in a decklist — your own, or one from the current **[meta decks](/decks)** — and see the store split for yourself. If you'd rather just price a list with no account, **[the deck pricer](/deck)** does that part for free.`,
    faq: [
      { q: "Is Best Basket free?", a: "No — Best Basket is a RiftCompare Premium tool. Upgrade and it's included alongside the Bulk Pricer, Value Finder, Rising Cards and the full Deal Finder list." },
      { q: "Does Best Basket account for shipping?", a: "Yes — that's the whole point. Buying each card from its individual cheapest store usually spreads an order over a dozen stores and buries the saving in postage. Best Basket prices every viable split across the stores that stock your list, including each store's shipping cost and free-shipping thresholds, and ranks results by what you'd actually pay delivered." },
      { q: "What can I paste into Best Basket?", a: "Any decklist in standard list format, or your own wishlist/watchlist from your RiftCompare account. It matches by card name and set/collector number where given." },
      { q: "Do I need Premium just to price a list, not buy it?", a: "No — the free deck pricer at /deck needs no account at all if you only want per-card prices. Premium is only needed for Best Basket's store-split optimisation." },
      { q: "How much can Best Basket actually save on a full deck?", a: "It depends on the list and current stock, which is why the tool shows the real comparison rather than a fixed percentage: the naive per-card-cheapest total and store count, right next to its optimised split. Savings are largest on full 40-card lists heavy on cheap commons, where postage is a large share of each card's price." },
    ],
  },
  {
    slug: "riftbound-booster-box-ev-worth-ripping-or-buying-singles",
    // Placed at the rip-or-buy verdict rather than the article's end: the closing
    // section walks back from the decision into caveats, so a reader who has
    // already made up their mind has left by then. Both branches offered, since
    // the section above concludes that either can be right.
    shop: [
      { label: "Riftbound booster boxes", query: "Riftbound booster box" },
      { label: "Riftbound singles", query: "Riftbound TCG singles" },
    ],
    category: "guide",
    title: "Riftbound Box EV Explained: Should You Rip or Buy Singles?",
    excerpt:
      "Booster box \"EV\" gets thrown around a lot, but most explanations skip the part that actually matters: when the math tells you to stop ripping and start buying singles.",
    author: "RiftCompare",
    date: "2026-07-01",
    readMins: 5,
    tags: ["expected-value", "booster-box", "sealed-product", "buying-guide"],
    body: `## What "EV" Actually Means for a Riftbound Booster Box

Expected value, in this context, is a simple idea wearing a fancy name: if you opened a very large number of Riftbound booster boxes and sold every single card you pulled at going market rates, EV is the average dollar amount you'd end up with per box. It's not a prediction of what any one box will give you - it's a long-run average across pull rates, rarity slots, and card-by-card market prices.

That distinction matters because most people evaluate a single box like it's a lottery ticket, then get emotional when it under-performs. EV isn't about your box. It's about the population of boxes your box was drawn from. One box can crush the average because you hit a sought-after alt-art or rare foil. Another box can land well below it because every slot resolves into a card nobody wants. Both outcomes are "normal" - they're just two draws from the same distribution.

The reason EV is worth calculating at all is that it turns a vague feeling ("boxes feel expensive right now") into a number you can actually compare against the box's price. That comparison is the whole game.

## How to Calculate Booster Box EV (Without Doing It By Hand)

The manual version of this math is: list every card that can appear in a box, weight each one by its pull probability at its rarity slot, multiply by current market price, and sum it all up. In practice nobody wants to build that spreadsheet themselves, and it goes stale the moment prices move, which in a young TCG can be often.

That's exactly the gap the [Box EV calculator](/tools/box-ev) is built to close - it keeps the pull-rate assumptions and pricing inputs in one place and does the weighted sum for you, so you can see a current EV estimate for a set instead of reconstructing it from scratch. Treat the output as a working estimate, not a guarantee: pull-rate data for newer sets is sometimes less mature, and market prices for singles can shift faster than any calculator updates. Use it to get in the right neighborhood, then sanity-check with your own read of the market.

### The Number That Actually Matters: EV vs. Box Price

Once you have an EV estimate, the only comparison that matters is EV relative to what boxes are actually selling for. If EV is meaningfully above the going box price, ripping is at least mathematically defensible - you're being compensated for the variance. If EV is at or below box price, you're paying for the entertainment of opening packs, not for value, and that's a fine trade to make consciously but a bad one to make by accident.

This is where box price shopping earns its keep. EV is a fixed-ish number for a given set at a given moment, but the price you pay for the box is not fixed at all - it varies by retailer, by whether it's in stock, and by how much a seller is marking up scarcity. Checking prices across sellers before you buy on the [sealed product comparison page](/sealed) can be the difference between a box that's a reasonable gamble and one that's a bad bet dressed up as a good one, purely because of where you bought it.

## When Buying Singles Beats Opening a Box

EV math generally favors singles-buying in a few recurring situations. If you want specific cards - a particular character or a card for a deck you're building - box-ripping is an inefficient way to get them. You're paying for an entire distribution of outcomes when what you actually want is one or two specific outcomes. Buying exactly the singles you need almost always costs less and removes all the variance.

EV also tends to compress as a set matures. Early after a set's release, uncertainty and hype can push EV estimates around in ways that occasionally favor ripping. As a set ages, prices on individual cards settle, supply catches up with demand, and box EV typically drifts toward (or under) box price - because that gap is exactly what sellers and the market correct over time. A box that looked like a reasonable rip on release week isn't necessarily one months later.

And if you're simply risk-averse - you'd rather know exactly what you're getting for your money - singles-buying is the correct choice regardless of what EV says. EV being favorable doesn't mean any individual box will be; it means the average box will be, and you might not get an average box.

[[shop]]

## Using EV as a Decision Tool, Not a Guarantee

The healthiest way to use box EV is as one input alongside your own goals, not as a green light to rip. Ask what you're actually optimizing for: a specific card, a fun opening experience, or the best expected return on money spent. Each of those has a different right answer, and EV only speaks directly to the last one.

A workable routine: check current EV estimates with the [Box EV calculator](/tools/box-ev), compare that against real box prices on the [sealed page](/sealed), and if you're weighing whether to hold cards or sell into current demand, glance at broader price trends on the [RiftCompare Index](/market) before deciding. If EV clears box price by a comfortable margin and you're fine with variance, ripping is defensible. If it doesn't, or if you already know which cards you want, buying singles is usually the smarter money - even if it's the less exciting choice.`,
  },
  {
    slug: "how-to-find-riftbound-arbitrage-opportunities",
    category: "guide",
    title: "How to Find Riftbound Arbitrage",
    excerpt:
      "\"Arbitrage\" gets thrown around a lot in TCG circles - here's what it really means for Riftbound cards, and how to tell a genuine price gap from a mirage.",
    author: "RiftCompare",
    date: "2026-07-01",
    readMins: 5,
    tags: ["arbitrage", "price-comparison", "riftbound", "reselling"],
    body: `## What Arbitrage Actually Means for a Riftbound Card

Arbitrage, stripped of the jargon, is just this: the same card is priced differently in two places at the same time, and you profit from the gap by buying where it's cheap and selling (or using it) where it's worth more. In stock trading this happens in fractions of a second. In a physical card game like Riftbound, it happens because the market is fragmented - dozens of local game stores, several major online retailers, marketplace sellers, and singles vendors all pricing the same card independently, often without looking at each other.

That fragmentation is the whole opportunity. No single seller has a complete view of what every other seller is charging, and most aren't updating prices in real time. A booster box or a chase single can sit underpriced at one shop for weeks simply because nobody there re-checked the market after a set's early buzz died down or picked back up.

It's worth being precise about what arbitrage is *not*. It's not predicting that a card will "moon" next month - that's speculation, a different (and riskier) game. Arbitrage is about a gap that exists right now, verifiably, between two real listings you could act on today.

## Where Real Price Gaps Come From

Understanding the *cause* of a gap tells you how durable it is, which matters more than the gap itself.

### Stale Listings

Plenty of retailers, especially smaller ones, set a price and don't touch it for a long stretch. If demand for a card rises elsewhere, their listing becomes a bargain by neglect, not by any coupon or promotion. These gaps can last a surprisingly long time, but they also vanish instantly the moment the store's owner does a price sweep.

### Regional and Currency Differences

Riftbound is sold through retailers in different countries and currencies, and shipping costs, import duties, and local demand all shift what "fair price" looks like in each market. A card can be genuinely cheaper landed-cost in one region even after shipping, but this kind of gap eats into margin fast once you account for delivery time and return risk.

### Sealed vs. Singles Mispricing

Sometimes the arbitrage isn't card-to-card, it's structural: a [sealed product](/sealed) is priced below what its contents are worth if you value the guaranteed hits inside at current singles prices. This is one of the more durable gap types, because it requires a store to notice singles prices moving before they reprice their sealed inventory, and many simply don't watch it closely.

### Condition and Grading Mismatches

A raw card listed like a played copy but actually in near-mint condition, or a graded slab priced like the raw version because a lister didn't notice the grade, creates a real but narrow arbitrage window that closes as soon as someone corrects the listing.

## How to Use a Price-Comparison Tool to Find Gaps Fast

Manually checking five or six retailers for every card you're curious about doesn't scale, which is the entire reason a comparison tool is useful here rather than optional. [RiftCompare's Deal Finder](/tools/deal-finder) exists to do the tedious part - pulling current listings across sources into one view - so you can spend your time on judgment instead of tab-switching.

### A Practical Workflow

1. Start broad in [the card database](/browse) to identify cards where you already have some conviction about demand - competitively played staples, chase rares, or cards tied to a deck archetype that's gaining traction.
2. Run those cards through the [Deal Finder](/tools/deal-finder) to see the spread between the lowest and highest current listings side by side.
3. Before acting, ask why the gap exists. If you can't come up with a plausible reason (stale listing, regional pricing, sealed-vs-singles drift), treat that as a yellow flag rather than free money - sometimes a "cheap" listing is cheap because it's out of stock, misprinted, or a different card variant entirely.
4. Factor in the cost of doing the trade at all: shipping both directions, marketplace fees if you're reselling, and the time value of capital tied up in inventory. A gap that looks like 20% often shrinks to single digits once real costs are included.

## Realistic Expectations: What Arbitrage Can and Can't Do

The honest version of this: arbitrage in a TCG market is a volume-and-diligence game, not a jackpot game. Gaps tend to be modest per card and close relatively quickly once a few people notice them, which is exactly what happened in every collectible market that came before this one. The people who do well at it check consistently, act quickly when a real gap appears, and don't overpay in fees or shipping to chase a thin margin.

It also doesn't require a large bankroll to start. Watching a handful of cards you already understand, comparing listings regularly, and only acting when the math clearly works after costs is a sustainable approach. Treat any comparison tool as a way to see the market faster and more completely than you could by hand - not as a guarantee that every gap it surfaces is worth taking.`,
  },
  {
    slug: "understanding-the-riftcompare-index-methodology",
    category: "guide",
    title: "What Is the RiftCompare Index? How It's Calculated",
    excerpt:
      "A plain-English breakdown of what the RiftCompare Index tracks, how it's built from a basket of cards, and why it's a better health check than any single card's price.",
    author: "RiftCompare",
    date: "2026-07-01",
    readMins: 4,
    tags: ["riftcompare-index", "methodology", "riftbound-tcg", "market-data"],
    body: `## What the RiftCompare Index Actually Measures

The RiftCompare Index is a single number meant to answer one question: *is the Riftbound secondary market, taken as a whole, worth more or less than it used to be?* It is not the price of any one card, and it isn't an average of "everything for sale." It's a tracked basket of specific cards whose combined value is rebased to a starting point, so the day-to-day movement of that basket tells you something about market direction rather than about one chase card getting hot.

Think of it the way a stock index works. The S&P 500 doesn't tell you what any single company is worth - it tells you whether large-cap US equities broadly went up or down. The Index on [/market](/market) is built the same way for Riftbound singles: a fixed group of cards, tracked on a regular cadence, combined into one line you can watch over time.

This matters because individual card prices are noisy. A single copy selling low because a seller needed cash fast, or high because two collectors got into a bidding war, can make a card's price chart look dramatic without meaning anything about the format or the game's overall health. An index smooths that out by design.

## How the Basket of Cards Is Chosen

Not every card in Riftbound belongs in the Index, and that's intentional. A useful index needs cards that are actually liquid - meaning they trade often enough that a snapshot price reflects real transactions, not a single stale listing sitting untouched for weeks.

In practice that means the basket leans toward:

- Cards with consistent trading volume across multiple listings, rather than cards that rarely change hands
- A spread across rarity tiers, so the Index isn't just tracking mythic-rarity chase cards while ignoring the commons and uncommons that make up most of what people actually buy and sell
- Cards that have been available long enough to have a real price history, rather than something that hit the market yesterday

The goal is representativeness, not completeness. Trying to include every printed card would let thinly-traded, hard-to-price cards drag the number around based on one or two outlier sales. A smaller, deliberately chosen basket produces a steadier, more trustworthy signal.

### Why the Basket Doesn't Change Every Week

If the basket shifted constantly, the Index would stop being comparable to itself over time. Part of the value of an index is that you can look at it in six months and know it's still measuring roughly the same thing it was measuring today. Basket composition is reviewed periodically rather than adjusted in response to short-term hype around any one card.

## How the Index Actually Combines Prices — Chain-Linking

Every card in the basket gets a price snapshot on a regular cadence - effectively a periodic "closing price" pulled from tracked listings and completed sales.

The naive way to turn a basket of prices into one number is: average them each snapshot, then rebase the first snapshot to a round starting value like 100. That's how a lot of simple indices work, and it's how an earlier version of this one worked. It has a real flaw, though: the basket isn't fixed forever - it's the 200 most-searched cards *right now*, and that list moves as the metagame shifts and, especially, whenever a new set releases and a wave of newly-revealed cards suddenly gets searched heavily. A plain average jumps the instant a differently-priced card enters or leaves the basket, whether or not anything anyone actually owns changed price at all - which makes the naive version misleading at exactly the moment it matters most, a set launch.

The fix is called **chain-linking**, and real financial indices use the same idea to absorb constituent changes without a discontinuity. Instead of averaging price *levels* at each snapshot, the Index computes each snapshot's *percentage move* using only the cards that have a tracked price at both that snapshot and the previous one - then multiplies that move onto a running total that starts at 100.

The practical effect: a card that just entered the basket - a brand-new set's card climbing into the top 200 by search, say - has no earlier price to compare against, so it simply sits out the calculation for the snapshot it debuts on. It starts contributing from the *next* charted snapshot onward, once it has two consecutive tracked prices to form a ratio from. The basket can turn over completely over months and the Index still won't move on that account alone - only real price changes do.

This is also why the Index is most useful looked at over stretches of time rather than a single snapshot. The earliest stretch of the chart - back when only a handful of cards had any tracked price yet - is thinner than the rest for exactly that reason: fewer cards means more weight riding on each one. Chain-linking still keeps that stretch honest (a card joining never jumps the level, whether it's card three or card three hundred), it's just a noisier read of the market than a later week with the full basket reporting. The trend across weeks and months is where the signal lives.

## A Concrete Example: A New Set's Launch

Say Origins, Spirit Forged and Unleashed cards make up most of the Index the week before a new set releases, each trading in an ordinary $5-$40 range. The set launches, hype cards get searched heavily, and within two or three weeks several of its cards - some already trading at $80 and up - climb into the top 200 by search and enter the basket.

Under a plain average, that alone would drag the Index's level up sharply the moment those cards entered, even though none of the *older* cards had moved at all - a false signal blamed on "the market," when it was really just new, expensive cards joining the average. Under chain-linking, those new cards have no price before their own release, so they aren't part of any snapshot-to-snapshot return until they've been tracked for two consecutive snapshots. The Index keeps telling the same story it was already telling about the older cards, and the new set's cards only start moving the number once there's an actual prior price to compare against.

## The Exact Formula

The plain-English version above is what you need to interpret the number day to day. This is the literal arithmetic, published because a health check you can't check isn't much of one - and it's exactly what the code computes, not a simplified stand-in for it.

**1. Constituents.** The 200 cards on RiftCompare with the highest recorded search count that currently have a live price in the selected market.

**2. Weight.** Each constituent's raw weight is \`1 + searchCount\` (the +1 means a market with zero recorded searches still produces a valid weight instead of dividing by zero). Every raw weight is then capped at 20% of the basket's total raw weight - a card whose raw weight would be worth more than a fifth of the whole basket is clipped down to exactly that fifth. Call constituent *i*'s resulting weight \`w[i]\`, and the sum of every constituent's weight \`W\`.

**3. Per-snapshot price.** \`p[i, t]\` is constituent *i*'s lowest tracked live price on snapshot *t*, carried forward from its last known price when this exact snapshot has no fresh reading for it (so a card briefly out of stock doesn't vanish from the calculation).

**4. Starting point.** The series starts at the first snapshot \`t0\` where *any* constituent has a tracked price at all - as far back as the data goes, full stop. \`Index(t0) = 100\`.

**5. Chain-linked step.** For each snapshot \`t\` after \`t0\`, let \`C\` be the set of constituents priced at both \`t\` and the previous *charted* snapshot \`t'\`:

\`return = ( Σ w[i]·p[i,t] for i in C ) ÷ ( Σ w[i]·p[i,t'] for i in C )\`

\`Index(t) = Index(t') × return\`

That's the whole thing - five steps, no persisted state, recomputed from scratch every time from the raw tracked prices, nothing set-specific hard-coded anywhere in it. Step 5 is the literal answer to "what happens when a new set releases": a card with no price at \`t'\` is outside \`C\` for that step by construction, so it cannot affect \`return\` no matter how differently it's priced from the rest of the basket - it only starts actually moving the number from its first two consecutive tracked prices onward. Notice \`C\` doesn't need to be *most* of the basket - it just needs to be non-empty. An earlier version of this formula also required \`C\` to clear a coverage threshold before trusting a step, on the theory that a thin \`C\` meant an untrustworthy reading. It didn't actually add any protection beyond what the exclusion rule above already gives for free, and it meant the chart started later than the real data did - so it's gone.

**Regions.** The Index defaults to the US market. Every other tracked region (AU, UK, SG, CA, EU) runs the exact same five-step computation independently, in that region's own currency - pick one from the Market selector on the page.

## Index vs. Movers: Two Different Questions

It's worth being explicit about what the Index is *not* for, because [/movers](/movers) exists to answer a genuinely different question. Movers is about which individual cards changed price the most recently - the specific singles that jumped or dropped week over week, useful if you're trying to time a buy or sell on a particular card.

The Index doesn't try to do that job. It won't tell you that one card spiked because of a tournament result or a reprint rumor. What it tells you is whether the *format as a whole* is trending up or down. A card can be a huge mover in either direction while the Index barely budges, because it's one card out of a basket. Conversely, the Index can drift steadily even when no single card is making headlines that week - that's often the more meaningful signal, since it reflects broad, sustained demand rather than one card's news cycle.

If you're deciding whether to buy a specific card right now, check Movers. If you're trying to understand whether Riftbound singles in general have gotten more or less expensive since you started collecting, the Index is the number to watch.

## Using the Index as a New Collector

If you're still getting oriented in the game itself, it's worth pairing this with our [beginner's guide to Riftbound](/guides/riftbound-for-beginners) before you lean too heavily on market data - understanding what makes a card mechanically strong or scarce will help you interpret *why* the Index moves the way it does, not just that it moved.

Used honestly, the Index is a health check, not a trading signal. It won't tell you when to buy a specific card. It will tell you, over time, whether the market you're buying into is expanding or contracting.
`,
  },
  {
    slug: "riftbound-set-checklist-how-to-complete-a-set",
    category: "guide",
    title: "Completing a Riftbound Set on a Budget",
    excerpt:
      "Chasing a full Riftbound set doesn't have to drain your wallet. Here's the order to buy in, when packs beat singles, and how to track what's left.",
    author: "RiftCompare",
    date: "2026-07-01",
    readMins: 5,
    tags: ["set-completion", "budget-collecting", "vendetta", "singles-vs-packs"],
    body: `Completing a full Riftbound set sounds simple until you're three months in, sitting on a pile of commons you already had four of, still missing the two rares that matter. Set completion is a resource-allocation problem, not a shopping spree, and treating it that way is what separates collectors who finish a set for a reasonable amount versus ones who spend twice as much and still have gaps. This guide walks through the actual order of operations that keeps a full-set goal affordable.

## Which Cards Should You Chase First?

The instinct is to buy whatever's cheapest first because it feels like easy progress. Do the opposite. Start with the cards that are hardest to find affordably later, and leave the common filler for last.

### Identify the true chase cards early

In any set, a small number of cards carry most of the price weight - usually the ones that show up in competitive decks, plus a handful of alternate arts or high-rarity pulls that collectors specifically hunt regardless of playability. Before you buy anything, spend twenty minutes looking through [decks](/decks) to see which cards from the set you're targeting actually show up in played lists. A card that's both scarce and playable will only get harder to find cheap as the set ages and more players need copies for their own decks. A card that's scarce but not played is more likely to soften in price over time once the initial hype fades, so there's less urgency to grab it this week.

This matters specifically for a set like [Vendetta](/sets/vendetta): sets with a strong competitive card or two tend to have those specific singles hold value while the rest of the set drifts down, so knowing which is which changes your whole buying order.

### Then work down by rarity, not by "cards I don't have yet"

Once you've flagged the two or three real chase cards, go rarity tier by rarity tier - highest first. Commons and uncommons are nearly always the cheapest way to fill gaps and they're the ones that show up in bulk lots and pack openings anyway, so you'll likely accumulate a chunk of them passively. Don't spend early budget on a common single when you're statistically likely to open or trade for it later at no extra cost.

---

## Should You Buy Packs or Singles?

This is the question that actually determines your total spend, and the honest answer is "it depends on how far into the set you are," not a blanket rule either way.

### Early in a set's life, packs can make sense

If a set is new and you're starting from zero, sealed packs give you broad coverage across commons and uncommons in one purchase, plus a shot at the higher-rarity cards you'd otherwise pay a premium for as singles. The math only works, though, if you're realistic that most packs return mid-value cards and the odds of pulling your actual chase card in any given pack are low. Treat pack-opening as a way to build your common/uncommon base and generate trade fodder, not as your plan for landing the expensive singles.

### Late in completion, singles almost always win

Once you're down to a "want list" of specific missing cards - which happens fast if you're being selective - buying singles is nearly always cheaper than buying more packs and hoping. At that stage every pack you open is a bet against increasingly bad odds, since you already have most of what a pack could give you. Use the [card database](/browse) to check what a specific missing card is trading for as a single before you buy another pack chasing it; comparing that price against realistic pack odds usually makes the decision obvious.

### The crossover point

A rough rule that holds up across most trading card sets: once your remaining want-list is under roughly 15-20% of the set, singles are the more efficient path almost every time. Above that, a mix of a few packs for coverage plus targeted singles for known chase cards tends to be the most budget-friendly combination.

## How Do You Track Progress Without Losing Track of What You've Spent?

The part collectors underestimate isn't finding cards, it's keeping an accurate picture of what's left and what it's costing.

- Keep a simple running list split into three buckets: "have," "need - common priority," and "need - chase card," so you're not re-checking the same commons over and over.
- Check prices on cards still on your want-list periodically rather than buying the moment you spot them, since single-card prices for non-chase cards tend to soften a few weeks to months after a set's release as more copies enter circulation.
- Revisit [decks](/decks) occasionally as the competitive scene settles - a card that wasn't played at launch sometimes becomes relevant later, which can shift your priority order mid-project.
- Set a soft budget per month rather than per card. Chase cards will occasionally spike in price for a stretch; a monthly cap keeps you from overpaying during a spike out of impatience.

## Is It Worth Finishing Every Last Common?

Honestly, weigh this against your actual goal. If you want a complete set for the satisfaction of it, then yes, the last few commons matter as much as the chase rares even though they're worth very little individually. If your real goal is having a playable, presentable collection, the last handful of low-value commons are often not worth the shipping cost of a single-card order and are better picked up opportunistically in a bulk lot or a trade. Being honest about which goal you actually have will save you more money than any single buying tactic on this list.`,
  },
  {
    slug: "riftbound-vendetta-unit-gear-decrees",
    category: "blog",
    title: "Vendetta's New Card Types: Unit-Gear & Decrees",
    excerpt:
      "Vendetta adds two new card concepts — Unit-Gear, both a unit and a piece of gear, and Decrees, a cycle of rivalry spells. Here's how they work.",
    author: "RiftCompare",
    date: "2026-07-07",
    updated: "2026-07-07",
    readMins: 4,
    tags: ["vendetta", "card types", "gameplay", "unit-gear", "decrees"],
    body: `![Riftbound: Vendetta — out now](/vendetta-hero.png)

Alongside its new mechanics, Riftbound: Vendetta (out **31 July 2026**) introduces two new card concepts: **Unit-Gear** and **Decrees**. Both are built around the set's rivalry theme, and both change how you think about deck slots.

## Unit-Gear — a card that's both

**A Unit-Gear counts as both a unit and a piece of gear.** That dual identity is the whole point: it can be played and interacted with as either type, so anything that cares about units *or* gear can work with it.

Why it matters for deckbuilding: a card that fills two roles is a flexible slot. Unit-Gear cards let you run fewer dead draws — the same card can be a body on the board or an equipment payoff depending on what the game needs, which is exactly the flexibility that survives a shifting meta.

## Decrees — spells built on rivalry

**Decrees are a cycle of spells designed around Domain rivalries.** Each Domain gets its own Decree, and each one is built to strike hardest against cards of its **opposite colour** — the mechanical expression of Vendetta's whole "rivalries ignite" theme.

In practice, Decrees are targeted answers: if the field is full of a particular Domain, its rival's Decree is a sharp, on-colour way to punish it. Expect them to shape sideboard-style choices and Domain match-ups as the meta forms.

## The bigger picture

Both card types feed Vendetta's rivalry identity — Domains pitted against their opposites, champions against their nemeses. Pair them with the set's new mechanics (**[Flow](/guides/riftbound-flow-explained)**, **[Burn](/guides/riftbound-burn-explained)** and **[Empower](/guides/riftbound-empower-explained)**) and there's a lot of new deckbuilding space to explore. Our **[Vendetta deckbuilding guide](/guides/building-for-riftbound-vendetta)** digs into what to build, and the **[Vendetta set page](/sets/vendetta)** tracks live prices on every card as it releases.`,
  },
  {
    slug: "building-for-riftbound-vendetta",
    category: "guide",
    title: "Building for Riftbound Vendetta",
    excerpt:
      "How Vendetta's new mechanics and domain pairings point toward fresh Riftbound archetypes — plus the champions, chase cards and value to watch as early singles start trading.",
    author: "RiftCompare",
    date: "2026-07-07",
    updated: "2026-07-31",
    readMins: 6,
    tags: ["vendetta", "deckbuilding", "strategy", "synergies", "meta", "guide"],
    shop: [
      { label: "Jayce singles — the Empower champion", query: "Riftbound Jayce" },
      { label: "Mel singles", query: "Riftbound Mel" },
      { label: "Vendetta singles on eBay", query: "Riftbound Vendetta" },
    ],
    browseCta: {
      href: "/sets/vendetta",
      label: "Shop Vendetta cards now →",
      blurb: "Every confirmed card, with live prices as early singles and stores list them.",
    },
    embed: {
      title: "Three of Vendetta's new Legends",
      note: "Ambessa, Jayce and Mel — straight from our live database. Tap a card for its page and live prices.",
      slugs: ["ambessa-the-wolf-ven-084", "jayce-brilliant-inventor-ven-068", "mel-newly-awakened-ven-069"],
    },
    body: `![Riftbound: Vendetta — out now](/vendetta-hero.png)

All 166 Riftbound: Vendetta cards are out — the set released worldwide on **31 July 2026**. There's still no solved metagame (that only comes from a real, settled tournament scene), but the confirmed mechanics, champions and domain pairings already point clearly toward the decks that will define the early set — and you can start acquiring the pieces today instead of waiting for launch day. Here's how to think about building for Vendetta right now.

## Start with the new domain pairings

![Vendetta's new domain pairings — Fury + Calm, Mind + Body, and Chaos + Order](/vendetta-domains.png)

Vendetta is built around **rival domains forced together**:

- **Fury + Calm** (red + green)
- **Mind + Body** (blue + orange)
- **Chaos + Order** (purple + yellow)

Each pairing marries two colours that usually pull in opposite directions, so the deckbuilding challenge — and the fun — is finding the cards that make the tension work. If you're new to how a Riftbound deck comes together, start with **[how a Riftbound deck is built](/guides/how-a-riftbound-deck-is-built)**.

## Let the mechanics suggest the archetypes

The three new mechanics (each with its own guide: **[Flow](/guides/riftbound-flow-explained)**, **[Burn](/guides/riftbound-burn-explained)** and **[Empower](/guides/riftbound-empower-explained)**) each hint at a deck style:

- **Flow → recursion / value decks.** Because Flow plays cards from your trash, decks that fill and re-use the trash get a second life out of every card. Prioritise cards that discard, cycle or sacrifice with upside.
- **Burn → fuel or disruption.** Self-Burn stocks your trash fast for Flow payoffs; opponent-Burn is a genuine mill and disruption angle. Early on, Burn is most reliable as *fuel* for your own engine.
- **Empower → scaling threats.** Empower rewards curving out and then paying to upgrade. Look for cheap Empower units you can deploy early and grow into finishers.

Combine them and the through-line is clear: **Vendetta rewards patient, grindy decks that get stronger over a long game** rather than pure aggression.

## Watch the champion rivalries

Nine new Legends arrive, including **Nasus, Renekton, Akali, Mel, Ambessa, Zed and Shen** — many as literal rivalries (Nasus/Renekton, Shen/Zed). Champion Legends anchor a deck's identity, so the first strong archetypes will likely be built directly around these debuts. The **[Shen vs Zed Showdown Deck](/sealed)** is also the cheapest way to try two ready-made lists head-to-head.

## What to look out for (and where to save)

- **Chase cards will spike at launch.** Signed Overnumbered Legends and the 22 Rival Overnumber diptychs are the premium collectibles — expect launch-week prices to run hot, then settle. If you can wait, you'll usually pay less.
- **Watch the movers.** As the meta forms, cards that enable a strong new deck climb fast. Keep the **[price movers](/movers)** open in the weeks after release.
- **Price your list before you buy.** Drop your planned deck into the **[deck pricer](/deck)** to total every card at the cheapest live price across stores, in your currency.
- **Sealed vs singles.** For a brand-new set, singles are usually the cheaper route to a specific deck — see **[singles vs sealed](/guides/riftbound-singles-vs-sealed)**.

## We'll keep this updated

The whole set is out and trading, so this is genuinely the moment to start assembling a shell. The first Vendetta events have now been played and we'll add concrete decklists as the field settles. For three ready-to-build archetype blueprints with the shell for each, see **[Best Riftbound Vendetta Decks](/guides/best-riftbound-vendetta-decks)**. For the full set overview and live card prices, see the **[Vendetta set page](/sets/vendetta)** as they land.`,
  },
  {
    slug: "best-riftbound-vendetta-decks",
    category: "guide",
    title: "Best Riftbound Vendetta Decks",
    excerpt:
      "Three full 40-card Riftbound Vendetta decks — Flow Value, Burn and Empower Midrange — with decklists, side decks and where to buy the pieces now singles are trading.",
    author: "RiftCompare",
    date: "2026-07-07",
    updated: "2026-07-31",
    readMins: 11,
    tags: ["vendetta", "decks", "deckbuilding", "strategy", "synergies", "meta", "guide"],
    shop: [
      { label: "Jayce singles — the Empower champion", query: "Riftbound Jayce" },
      { label: "Mel singles", query: "Riftbound Mel" },
      { label: "Vendetta singles on eBay", query: "Riftbound Vendetta" },
      { label: "Vendetta booster boxes", query: "Riftbound Vendetta booster box" },
    ],
    // Early singles are trading (Pre-Rift + early marketplace listings) but there's
    // still no real tournament data for Vendetta specifically — so the honest CTA
    // is "go buy the pieces on the set page", not a fabricated netdeck link.
    browseCta: {
      href: "/sets/vendetta",
      label: "Shop Vendetta cards now →",
      blurb: "Every confirmed card, priced live as early singles and stores list them.",
    },
    embeds: [
      {
        title: "Every Flow card in Vendetta",
        note: "Every officially revealed Vendetta card with the Flow keyword — the Flow Value shell above is built from these. Tap a card for its page and live prices.",
        rulesContain: "[Flow]",
        rulesSet: "VEN",
        take: 12,
      },
      {
        title: "Every Burn card in Vendetta",
        note: "Every officially revealed Vendetta card with the Burn keyword — the enablers and payoffs for the Burn / Disruption shell.",
        rulesContain: "[Burn]",
        rulesSet: "VEN",
        take: 12,
      },
      {
        title: "Jayce & Mel — the Empower Legends",
        note: "Vendetta's two Empower-anchored Legends, straight from our live database.",
        slugs: ["jayce-brilliant-inventor-ven-068", "mel-newly-awakened-ven-069"],
      },
      {
        title: "Every Empower card in Vendetta",
        note: "Every Vendetta card with the Empower keyword — build the Empower Midrange shell around these.",
        rulesContain: "[Empower]",
        rulesSet: "VEN",
        take: 12,
      },
    ],
    body: `![Three Riftbound Vendetta archetypes to build — Flow Value, Burn, and Empower Midrange](/vendetta-archetypes.png)

Riftbound: Vendetta released worldwide on **31 July 2026** and is out now. Every one of the set's 166 cards is officially confirmed, so this is the moment to actually start acquiring the pieces for the decks you want to build. Below are three strong archetype blueprints, each grounded in Vendetta's confirmed mechanics and domain pairings, with the synergies that make them tick, real card visuals for each, and how to pilot them.

An honest note up front: these are **blueprints, not netdecks**. Vendetta is out and the first events have been played, but the metagame is days old — early results still look a lot like Unleashed, with established legends adapting rather than new Vendetta legends taking over. Nasus was the first Vendetta legend to actually win a tournament, and Diana took Sideways Showdown: CN vs World on 25 July. We give you the shell — the roles each deck needs, built from confirmed cards — and we point you at the real lists on our **[meta decks page](/decks)** as the field settles.

## First, the deckbuilding rules (the quick version)

Every legal Riftbound deck is built around one thing: your **Legend**. The Legend sets your identity and the **domains** you can build in, and every card you run has to be castable by your **runes** — your rune base has to produce the domains your cards demand. Two rules of thumb keep a deck legal and consistent:

- **Stay in your Legend's domains.** A Fury/Calm Legend runs Fury and Calm cards; you can't splash a card whose domain your runes can't pay for.
- **Keep your rune base focused.** The more domains you stretch across, the less reliably you cast on curve. Vendetta's two-domain pairings are the sweet spot.

New to this? Read **[how a Riftbound deck is built](/guides/how-a-riftbound-deck-is-built)** first — it covers Legends, runes and domains in full.

## What makes a deck "synergistic" (and what doesn't)

![What good synergy looks like — a repeatable Setup, Engine, Payoff, Recur loop](/vendetta-synergy-loop.png)

"Synergy" gets thrown around for any two cards that look nice together. A real synergy is an **engine** — a repeatable loop where each piece feeds the next, so the deck gets stronger the longer the game runs. That's exactly where Vendetta's new mechanics point:

- **Setup** — cheap enablers that fill your trash or lay down gear.
- **Engine** — the loop itself: **Burn** feeds **Flow**, and gear re-readies for value.
- **Payoff** — cash the loop in: **Empower** a threat, or replay a big card from the trash.
- **Recur** — Flow buys your enablers back, and you do it again.

If your combo only works once, it's a nice card — not a synergy. Every deck below is built around one of these loops.

Each archetype below now includes a full **40-card example build** (plus battlefields, runes and a **10-card side deck** — a real 66-card total once you add the Legend, using the larger side deck that came in with the [July 2026 tournament rules update](https://playriftbound.com/en-us/news/announcements/july-2026-tournament-rules-update-changelog/) on 24 July 2026). These are **RiftCompare's own homebrew constructions**, not official spoiled decklists or tournament results — we built them by pairing each Vendetta Legend with proven cards from Riftbound's existing pool (the game doesn't rotate, so Origins/Spirit Forged/Unleashed staples are just as legal as brand-new Vendetta cards). Treat them as a genuine starting point to buy toward today, not a solved list — swap in Vendetta-specific support as more of it gets confirmed.

## Archetype 1 — Flow Value (Fury + Calm)

**Identity:** grind the game long, recur your best cards, and win on raw card advantage.

**The engine:** the purest expression of **Burn + Flow**. Self-Burn stocks your trash quickly; Flow lets you replay from it, so every card effectively gets used twice. Against aggro you trade and rebuy; against control you never run out of gas.

**The shell (built from confirmed cards):**
- **Legend:** a Fury/Calm Legend with a recursion or trash payoff.
- **4–6 enablers:** cheap cards that Burn your own deck or cycle to fill the trash.
- **3–4 Flow payoffs:** your best units and spells that you *want* to replay from the trash.
- **6–8 interaction:** removal and combat tricks to survive to the long game.
- **Runes:** an even Fury/Calm base — you need both colours online reliably.

**Example 40-card build — "Nasus, Curator of the Sands" (RiftCompare homebrew, not an official or tournament list):**

Nasus anchors the shell on Calm's inevitability, splashing a single copy of his rival Renekton as a Fury finisher — exactly the "forced rivalry" tension Vendetta's domain pairings are built around.

- **Legend:** Nasus, Curator of the Sands
- **Units (16):** 3× Scuttle Crab · 3× Tideturner · 3× Trevor Snoozebottom · 2× Evelynn, Entrancing · 2× Irelia, Fervent · 2× Disarming Rake · 1× Renekton, Butcher of the Sands (rival splash)
- **Gear (5):** 3× Boots of Swiftness · 2× Zhonya's Hourglass
- **Spells (19):** 3× Charm · 3× Defy · 3× Discipline · 3× Back Off · 3× En Garde · 2× Not So Fast · 2× Punch First
- **Battlefields (3):** Abandoned Hall · Targon's Peak · Star Spring
- **Runes (12):** 9× Calm Rune · 3× Fury Rune
- **Side deck (10):** 1× Not So Fast · 1× Disarming Rake · 2× Star-Crossed · 2× Stare Down · 2× Whiteflame Protector · 2× Unyielding Spirit

*(Not So Fast and Disarming Rake are capped at one copy here because the main deck already runs two of each — the 3-copy limit counts main deck and side deck together.)*

**How to play it:** you're the grinder. Trade early, don't over-commit into removal, and treat your trash as a second hand — sequence so the cards you Burn are the ones Flow most wants back.

[[embed:0]]

## Archetype 2 — Burn / Disruption (Chaos + Order)

**Identity:** the aggressive, disruptive take on Burn — attack the opponent's deck as a clock while self-Burn powers your own payoffs.

**The engine:** Chaos/Order leans into the **opponent-facing** side of Burn. You chip their deck directly (Riftbound's take on mill) while using self-Burn to fuel Empower and Flow payoffs. Two-pronged: they're racing your clock *and* your board.

**The shell:**
- **Legend:** a Chaos/Order Legend that rewards Burn or aggression.
- **4–6 Burn pieces:** a mix of opponent-deck Burn and self-Burn fuel.
- **3–4 payoffs:** threats paid off by a full trash or by Empower.
- **6–8 tempo/removal:** to protect your clock.
- **Runes:** Chaos/Order base, tuned toward whichever colour holds your Burn.

**Example 40-card build — "Zed, Master of Shadows" (RiftCompare homebrew, not an official or tournament list):**

Zed carries the aggression on Chaos, splashing a single copy of his rival Shen — again leaning into the built-in rivalry — for a disciplined Order finisher.

- **Legend:** Zed, Master of Shadows
- **Units (16):** 3× Ravenbloom Student · 3× Hwei, Brooding Painter · 2× Vex, Apathetic · 2× Traveling Merchant · 3× Watchful Sentry · 2× Black Rose Dignitary · 1× Shen, Eye of Twilight (rival splash)
- **Gear (5):** 3× Baited Hook · 2× Guardian Angel
- **Spells (19):** 3× Gust · 3× Stacked Deck · 2× Hard Bargain · 2× Moonfall · 3× Sacrifice · 3× Mirror Image · 2× Hidden Blade · 1× Turn to Dust
- **Battlefields (3):** Zaun Warrens · Ravenbloom Conservatory · Aspirant's Climb
- **Runes (12):** 7× Chaos Rune · 5× Order Rune
- **Side deck (10):** 2× Turn to Dust · 1× Moonfall · 2× Star-Crossed · 2× Deathgrip · 2× Safety Inspector · 1× Singularity

**How to play it:** apply pressure on two axes. Don't tunnel on decking them out — the deck-Burn is a clock that forces bad decisions, while your board usually closes the game. Highest skill ceiling of the three, and the easiest to mis-sequence.

[[embed:1]]

## Archetype 3 — Empower Midrange (Mind + Body)

**Identity:** deploy efficient bodies early, then pay to **Empower** them into late-game threats. The most "fair" and beginner-friendly of the three — and the one with the most revealed support already.

**The engine:** **Empower** rewards curving out and then reinvesting. Two revealed Legends already point the way:

- **Jayce, Brilliant Inventor** — a rare dual-domain **Mind/Body** Legend built around **gear that stays on the board**. When he readies he picks up a combat mode, so decks that tap and re-ready gear squeeze extra value every turn.
- **Mel** — a **Mind** Legend whose **Empower** (pay energy) makes your Might-reduction effects trigger twice. Build a package of "shrink their unit" spells and each one does double duty.

**The shell:**
- **Legend:** Jayce (gear/value) or Mel (Might-reduction).
- **6–8 efficient units:** cheap bodies that are fine early and great once Empowered.
- **3–4 Empower payoffs / gear:** the cards you reinvest energy into.
- **4–6 Might-reduction or removal:** doubly good under Mel.
- **Runes:** Mind-heavy with a Body splash (or the reverse for a Jayce build).

**Example 40-card build — "Jayce, Brilliant Inventor" (RiftCompare homebrew, not an official or tournament list):**

Jayce is the rare Legend who's dual-domain out of the gate, so this shell runs an even Mind/Body base rather than a splash. Prefer Mel's Might-reduction angle instead? Swap the Body slots below for more single-target removal and lean Mind-heavy — same shell, different payoff.

- **Legend:** Jayce, Brilliant Inventor
- **Champion:** Jayce, Hammer in Hand
- **Units (16):** 3× Clockwork Keeper · 3× Lonely Poro · 2× First Mate · 3× Karthus, Eternal · 3× Glasc Mixologist · 2× Vi, Peacekeeper
- **Gear (6):** 3× Trinity Force · 2× Shepherd's Heirloom · 1× B.F. Sword
- **Spells (17):** 3× Punch First · 3× Challenge · 3× Riposte · 3× Sacrifice · 3× Mirror Image · 2× Hidden Blade
- **Battlefields (3):** Grove of the God-Willow · Seat of Power · Windswept Hillock
- **Runes (12):** 6× Body Rune · 6× Mind Rune
- **Side deck (10):** 2× Deathgrip · 2× Safety Inspector · 2× Salvage · 2× Unyielding Spirit · 2× Fiora, Peerless

**How to play it:** curve out, but don't rush your energy. The trap is spending everything early — hold energy to Empower at the right moment so a cheap unit becomes the biggest threat on the board.

[[embed:2]]

[[embed:3]]

## Piloting any of these decks

- **Mulligan for your engine, not your payoff.** A hand with enablers and a way to start the loop beats a hand of finishers you can't fuel yet.
- **Protect the engine.** Once your loop is running the game is yours — bait or answer removal before committing the key piece.
- **Sequence around energy.** Empower and Flow both want energy banked; plan the turn you go over the top.

## What to watch as the full release (31 July) approaches

- **Flow Value:** which cheap self-Burn enabler and Flow payoff pairing real pilots settle on — that's what defines the deck in practice.
- **Burn:** how fast the opponent-Burn clock actually plays out at the table, and whether it's a real win condition or just disruption.
- **Empower:** how players sequence Jayce/Mel support, and how expensive the strongest Empower effects turn out to be to use well.

We'll update this guide with concrete lists as a real meta forms — and keep an eye on the **[price movers](/movers)**, since the cards that enable the first strong decks climb fastest at launch.

## Buy into a shell now, before the launch-week rush

Early singles are already trading, which means you don't have to wait until 31 July to start — the **[Vendetta set page](/sets/vendetta)** has live prices on every confirmed card as they list. Once you've settled on a shell, drop it into the **[deck pricer](/deck)** to total every card at the cheapest live price across stores, in your currency — the fastest way to build a new-set deck without overpaying in the launch rush. For a brand-new set, **[singles are usually cheaper than sealed](/guides/riftbound-singles-vs-sealed)** for a specific deck.

For the full picture, read the **[Empower](/guides/riftbound-empower-explained)**, **[Flow](/guides/riftbound-flow-explained)** and **[Burn](/guides/riftbound-burn-explained)** guides, and track live prices on the **[Vendetta set page](/sets/vendetta)** as cards release.`,
  },
  {
    slug: "riftbound-banlist-explained",
    category: "guide",
    title: "Riftbound Ban List Explained",
    excerpt:
      "The complete, up-to-date Riftbound banlist — every card currently banned from competitive constructed play, the new Constructed 2v2 ban list, the official reason for each ban, and live prices for all of them.",
    author: "RiftCompare",
    date: "2026-07-16",
    updated: "2026-07-17",
    readMins: 6,
    tags: ["banlist", "competitive", "rules", "guide"],
    shop: [
      { label: "Riftbound singles on eBay", query: "Riftbound TCG singles" },
    ],
    // Explicit slugs — a curated, verified list rather than a rules-text match, so
    // this can never silently include or drop a card as the database grows. A slug
    // that doesn't resolve is simply omitted (see resolveEmbed), never a broken card.
    // Positioned inline via [[embed:N]] (plural `embeds` array), right under each
    // list, so readers see the real cards next to the text explaining them.
    embeds: [
      {
        title: "July 2026 additions",
        note: "The 4 cards added to the banlist on 17 July 2026 (effective 24 July), with live prices across every store RiftCompare tracks.",
        slugs: [
          "stealthy-pursuer-ogn-177-298",
          "the-arena-s-greatest-ogn-290-298",
          "aspirant-s-climb-ogn-276-298",
          "master-wuju-bladesman-starter-ogs-019-024",
        ],
      },
      {
        title: "The original 7 banned cards",
        note: "The cards banned from Riftbound's first banlist (31 March 2026), with live prices across every store RiftCompare tracks.",
        slugs: [
          "scrapheap-ogn-182-298",
          "draven-vanquisher-sfd-020-221",
          "draven-vanquisher-sfd-020a-221",
          "called-shot-sfd-122-221",
          "fight-or-flight-ogn-168-298",
          "the-dreaming-tree-ogn-292-298",
          "obelisk-of-power-ogn-284-298",
          "reaver-s-row-ogn-285-298",
        ],
      },
    ],
    body: `Riftbound's first banlist landed on **31 March 2026**, when Riot Games banned seven cards from competitive constructed play. On **17 July 2026** Riot announced a second wave — four more bans, effective **24 July 2026** — plus a brand-new **Constructed 2v2 ban list**. Here's the complete, current picture: every banned card, why each was banned, and what it means if you own one.

## July 2026 update: 4 more bans + a new 2v2 ban list

Effective **24 July 2026**, Riot added three cards to the Standard banlist and opened a separate ban list for the Constructed 2v2 format:

**Added to the Standard banlist:**
- **Stealthy Pursuer** (Origins) — enabled a near-infinite Unit combo with Eye of the Herald and Renata Glasc, Industrialist, generating infinite Recruits as early as turn 3. Riot called it out during Vendetta's own preview season once the community found it, and confirmed internal testing showed it stayed consistent even though technically disruptable — "a harsh check on the metagame."
- **The Arena's Greatest** (Origins, Battlefield) — very popular, but Riot judged it had bent the structure of competitive play in an unhealthy direction.
- **Aspirant's Climb** (Origins, Battlefield) — banned alongside The Arena's Greatest for the same structural reason.

**New: Constructed 2v2 ban list.** This is the first time Riot has published a ban list specific to the 2v2 format. It starts as the entire Standard banlist (everything above and below) plus one additional card:
- **Master Yi, Wuju Bladesman** (Legend) — banned in 2v2 only; legal in 1v1 Standard.

Riot's own words on how they decide a ban: *"there are three questions we ask ourselves when considering whether to ban a card: is this card overrepresented in an unhealthy way? Are the problems with this card likely to get better or worse over time? Does this card promote unhealthy play patterns?"* Going forward, Riot says any ban that applies to both formats will say so explicitly — otherwise assume a new Standard ban does **not** automatically apply to 2v2, and vice versa.

[[embed:0]]

## The original 7 banned cards (31 March 2026)

- **Scrapheap** (Origins) — enabled "Miracle Decks": drawing and playing large numbers of cards at heavily discounted cost.
- **Called Shot** (Spiritforged) — the same Miracle Deck problem as Scrapheap.
- **Draven, Vanquisher** (Spiritforged) — a straight power outlier; the design team has called it an outright mistake.
- **Reaver's Row** (Origins) — synergised too well with Draven and encouraged non-interactive play patterns.
- **Fight or Flight** (Origins) — limited to rein in Chaos decks' overall power level.
- **The Dreaming Tree** (Origins) — provided so much card flow it tipped the balance toward specific deck styles.
- **Obelisk of Power** (Origins) — banned for its sheer ubiquity; it was in nearly every competitive list.

[[embed:1]]

## What "banned" actually means

A banned card can't be included in a deck for **competitive constructed play** — organized tournaments and ranked events run under Riot's official rules. It doesn't necessarily mean your local game store's casual nights follow the same list; check with your local organizer if you're unsure, since casual play often runs looser rules than sanctioned events. And as of July 2026, "banned" isn't one list any more — a card can be banned in Standard, in 2v2 only, or (per Riot) in both if a future update says so explicitly.

## Does a ban affect a card's price?

It can go either way. A ban can crash a card's price as competitive demand dries up, or it can hold steady (or even rise) on casual and collector demand if the card is popular outside tournament play — especially for a splashy legendary printing like Draven, Vanquisher. Rather than guess, check the live numbers: every banned card above links to its own RiftCompare page with current pricing and price history across every market we track.

## Why ban lists matter for deckbuilding

If you're building a deck today, none of the cards above are legal in sanctioned events for their listed format(s) — plan around their absence rather than building toward them. If you already own one, it's still a real card for casual games, or worth checking the price on if you're thinking of selling.

We'll update this guide the moment any further changes to either ban list are announced.

*Ban reasoning summarized from Riot Games' official announcements (31 March 2026 and 17 July 2026) and community coverage of Riftbound's ban history.*`,
  },
  {
    slug: "riftbound-july-2026-ban-list-update",
    category: "blog",
    title: "Riftbound's July 2026 Ban List Update",
    excerpt:
      "Riot's second Riftbound ban wave: Stealthy Pursuer, The Arena's Greatest and Aspirant's Climb — plus a new 2v2 ban list led by Master Yi.",
    author: "RiftCompare",
    date: "2026-07-17",
    updated: "2026-07-31",
    readMins: 4,
    tags: ["banlist", "news", "competitive", "rules", "vendetta"],
    shop: [
      { label: "Riftbound singles on eBay", query: "Riftbound TCG singles" },
    ],
    embed: {
      title: "The 4 new bans",
      note: "The cards added to Riftbound's banlist on 17 July 2026, with live prices across every store RiftCompare tracks.",
      slugs: [
        "stealthy-pursuer-ogn-177-298",
        "the-arena-s-greatest-ogn-290-298",
        "aspirant-s-climb-ogn-276-298",
        "master-wuju-bladesman-starter-ogs-019-024",
      ],
    },
    body: `Riot dropped a surprise mid-cycle ban announcement today, ahead of Vendetta's own 31 July release — three new Standard bans, and the first-ever ban list built specifically for **Constructed 2v2**. Here's exactly what changed and why.

## The headline: an infinite combo got caught

**Stealthy Pursuer** is the standout ban, and the reason is a real, documented combo — not a vague power-level complaint. Paired with **Eye of the Herald** and **Renata Glasc, Industrialist**, it enables an infinite Unit loop that generates infinite Recruits as early as turn 3. Riot flagged its intent to ban it back during Vendetta's own preview season, once the community had already found the interaction. Their reasoning: internal testing showed the combo stays consistent even though it's technically disruptable, making it "a harsh check on the metagame" — the kind of turn-three "do you have the answer?" moment that isn't fun for either player.

## Two Battlefields go with it

**The Arena's Greatest** and **Aspirant's Climb** — both Origins Battlefields — are banned too. Riot's own framing is more about structural health than raw power: both cards were "very popular, but not necessarily to the extent that we would feel the need to act," yet Riot judged they'd bent the shape of competitive play in an unhealthy direction.

## A first: the Constructed 2v2 ban list

This is the more structurally significant change. Riftbound has run one shared banlist since launch; as of today, **2v2 Constructed gets its own list** — starting as the full Standard banlist plus one extra card:

- **Master Yi, Wuju Bladesman** (Legend) — banned in 2v2 only. Still fully legal in 1v1 Standard.

Riot says any future ban that's meant to apply to both formats will say so explicitly, so don't assume a Standard-only announcement automatically carries over to 2v2 (or vice versa) going forward.

## When it takes effect

All of the above took **effect on 24 July 2026**, a week before Vendetta released on 31 July.

[[embed:0]]

## What this means if you own these cards

Same as any ban: these cards stay perfectly playable outside sanctioned events (casual tables, most local game store nights), and whether the price moves depends on how much of each card's demand was competitive versus casual/collector. Check the live price and history on each card page above rather than guessing.

For the complete, always-current picture — including March's original 7 bans — see our **[full Riftbound banlist guide](/guides/riftbound-banlist-explained)**, which we update the moment anything changes.

*Ban reasoning and effective dates are Riot Games' own words from their 17 July 2026 announcement.*`,
  },
  // IMAGE SLOT (author): under "## How the drawing actually works", a screenshot of
  // the Riot Merch Store entry form once registration opens on 14 August would make
  // the "this is a form, not a checkout" point concrete — and it is OUR screenshot,
  // not Riot's marketing art. Save to public/blog/t1-drawing-entry-form.png and add:
  //   ![The Riot Merch Store drawing registration form for the T1 2025 Worlds Champion Signature Edition](/blog/t1-drawing-entry-form.png)
  {
    slug: "riftbound-t1-worlds-champion-collection",
    category: "blog",
    title: "Riftbound × T1 Worlds Champion Collection",
    excerpt:
      "Riot's first single-team Riftbound collab: a signed Signature Edition (US$360) and a US$70 Player Bundle honouring T1's sixth Worlds title.",
    author: "RiftCompare",
    date: "2026-07-17",
    // Rewritten 9 Aug 2026: the drawing timetable and prices are published, the
    // five collection printings are now in our database, and the original text's
    // "Seraphine isn't catalogued yet" line was stale. A companion post
    // (/blog/riftbound-t1-signature-edition-drawing) briefly carried the dated
    // registration logistics so the two didn't compete for the same query; once
    // that window closed (17 Aug 2026) it was retired and its still-evergreen
    // analysis (scarcity math, Player Bundle comparison) merged in here — see the
    // AdSense remediation Phase 26 note in next.config.js.
    updated: "2026-08-25",
    readMins: 5,
    tags: ["news", "collectibles", "esports"],
    shop: [
      { label: "Riftbound singles on eBay", query: "Riftbound TCG singles" },
    ],
    embeds: [
      {
        title: "The collection's own printings (T1S 001-005)",
        note: "Drawing-only prints with all-new art in a bespoke frame, including Faker's serialised Galio. No store sells these, so they carry no price until copies reach the secondary market.",
        slugs: [
          "ambessa-the-wolf-t1s-001-005-promo",
          "xin-zhao-vigilant-t1s-002-005-promo",
          "galio-indefatigable-t1s-003-005-promo",
          "galio-indefatigable-t1s-003s-005-promo",
          "miss-fortune-buccaneer-t1s-004-005-promo",
          "seraphine-not-alone-t1s-005-005-promo",
        ],
      },
      {
        title: "The retail printings of the same champions",
        note: "The regular, buyable version of each card T1 selected — live prices across every store we track.",
        slugs: [
          "ambessa-the-wolf-ven-084",
          "xin-zhao-vigilant-sfd-176-221",
          "galio-indefatigable-unl-171-219",
          "miss-fortune-buccaneer-ogn-193-298",
        ],
      },
    ],
    body: `> **Registration for the English Signature Edition is closed.** The window ran 14-17 August 2026; selection emails went out from 20 August, with boxes arriving from 2 September. This page is the lasting product explainer — what the collection is, what's in it, what actually makes it scarce, and what it costs — for anyone who missed the window, is deciding on the still-open Player Bundle drawing, or just wants to know what these cards are.

Riot did something in July it had never done in Riftbound before: partner with a single esports team, rather than the league as a whole, on a dedicated card collection. The **Riftbound × T1 2025 Worlds Champion Collection** honours T1's sixth World Championship title — and third in a row — with signed, serialised cards picked by the players themselves.

## Two products, two very different audiences

**T1 2025 Worlds Champion Signature Edition — US$360.** The collector's version, capped at **10,125 copies per language** (English, Chinese, Korean; CN¥2,025 and KR₩500,000 respectively). Every box contains one card serial-numbered from 1 to 2025 — the year of the title — carrying a gold-stamped signature from the player who chose it. All five cards use a foiling effect made specifically for this release, and the packaging is built to be displayed rather than stored.

**T1 2025 Worlds Champion Player Bundle — US$70.** The version for people who want to sleeve these up and play them (CN¥399, KR₩100,000). Same five champions in different art, with no serialisation and no signature, plus a Sleeves Pack, a Deckbox, a Binder and a Metal Die — one die in ten is a black-and-gold variant.

## The 5 cards — each hand-picked by a player

Every card was personally chosen by the corresponding member of T1's championship roster:

- **Choi "Doran" Hyeon-jun** → Ambessa, The Wolf — Body, 4 energy, 4 might, with Empower 3
- **Moon "Oner" Hyeon-joon** → Xin Zhao, Vigilant — Order, 3 energy, 4 might, with Tank
- **Lee "Faker" Sang-hyeok** → Galio, Indefatigable — Order, 3 energy, 6 might, with Deflect and Tank
- **Lee "Gumayusi" Min-hyeong** → Miss Fortune, Buccaneer — Chaos, 4 energy, 4 might
- **Ryu "Keria" Min-seok** → Seraphine, Not Alone — Order, 5 energy, 1 might

[[embed:0]]

All six printings — the five cards plus Faker's serialised Galio, numbered T1S 001/005 through 005/005 — are now catalogued on RiftCompare, so each has a real page ready for the moment secondary-market listings appear.

**One caveat on Seraphine.** Seraphine, Not Alone comes from **Radiance**, Riftbound's fifth set, which does not release until 23 October 2026 (see [the set roadmap](/blog/riftbound-2027-set-roadmap)). Until then it is not legal for sanctioned play, so a Player Bundle bought to actually play with arrives with one card you cannot yet use.

## How to actually get one

Both products are distributed through a **drawing on the Riot Merch Store**, not a normal storefront sale — you register inside a window and Riot selects entrants afterwards, rather than it being first-come, first-served. The English Signature Edition's registration window (14-17 August 2026) is now closed; if you entered, Riot's selection emails went out from 20 August, in waves, and boxes began arriving from 2 September. The **Player Bundle follows later in the year with its own drawing**, date not yet announced. Chinese and Korean editions are handled separately in-region.

The one rule worth remembering for the Player Bundle drawing when it opens: Riot has confirmed there is **no Catch Up pool** — everyone who enters has the same chance regardless of prior entries or purchases, so a long purchase history buys nothing here, and neither does missing the Signature Edition window.

## What actually makes these cards valuable

Four things, and only one of them is the price tag.

**The print run is fixed and small, and there is no reprint lever.** Riot capped this at 10,125 boxes per language before a single copy shipped. A set that sells out is normally followed by a reprint, a second wave or a promo distribution of the same art. None of those exist here — the collection commemorates a specific championship, and the serial range is literally the year.

**The serial number is a one-of-one.** Every serialised card is unique: there is exactly one #0001 Galio in English and there will never be another. The three language editions are numbered separately, so a #0001 Galio exists once in English, once in Chinese and once in Korean. Riot's own returns policy makes the point better than any analysis — a damaged serialised card cannot be replaced with an identical copy, so the remedy is a full refund of the whole set. That is a company saying, in a support policy, that it cannot manufacture a second one.

**There is no retail channel at all.** Every other Riftbound product we track has a shop price, which anchors resale: you can always see what a booster box costs at retail and judge a listing against it. This collection has no retail price — the only public number is the US$360 Riot charged drawing winners, and that stopped being obtainable the moment registration closed. Price discovery happens entirely on the secondary market, starting from nothing. We will report what that produces on the card pages below rather than guess at it here.

**The category itself is walled off.** In the same month, Riot said it has [no plans to put serialisation into booster packs](/blog/riftbound-august-2026-state-of-the-game-takeaways). Serialised Riftbound cards are therefore not a thing that will exist in the ordinary product line — they are a thing that exists in dedicated collector releases, of which this is the first.

And one thing that does **not** make them valuable: playability. These are the same five champions you can already buy as ordinary singles for cents apiece — and Seraphine isn't tournament-legal until Radiance releases in October. Nobody is paying US$360 for a 3-cost 6-might Galio. They are paying for the object.

## Signature Edition vs Player Bundle: which is the better buy?

For most people who just like the cards, the Player Bundle — and it isn't close on a per-dollar basis.

The gap is worth doing as arithmetic rather than as "a fifth of the price". US$360 minus US$70 is **US$290**, and that US$290 buys exactly three things: the serialisation, the gold-stamped signature and the foiling treatment made for this release. Everything else — the five champions, exclusive art, an object you can hold — is in both.

US$70 gets you the same five champions in their own exclusive art, plus sleeves, a deckbox, a binder and a metal die. If your reason for wanting this collection is "I want Faker's Galio on my shelf", the Player Bundle does that for a fifth of the price; if it is "I want a numbered card that only 2,025 people can own", it does not do that at all, and nothing else will.

Worth pricing the third option honestly too: the ordinary retail printings of four of these five champions are in our database right now and cost cents. If what you want is to **play** these cards, that is the entire cost.

## Should you expect these on RiftCompare?

Yes, but as a secondary market rather than a retail one. Nothing in this collection is sold through the stores we price, so there is no launch-day listing to compare; what will appear is resale — sealed boxes and loose serialised cards on [the sealed comparison](/sealed) and on individual card pages, once copies actually change hands. Both product types now carry Riot's published US price as their reference, so the useful question after the drawing is "how far above US$360 is the cheapest listing", not just "what is the cheapest listing".

What is trackable *today* is the ordinary retail printing of each champion T1 picked. If the collection has you wanting Faker's Galio or Doran's Ambessa and you would rather spend cents than US$360, those are below.

[[embed:1]]

## Why it is scarce, in one paragraph

Each box holds exactly one serialised card in a 1-2025 range, and five champions share that range — 5 x 2,025 is 10,125, the published print run for each language. So any one champion (Faker's Galio, say) exists in roughly **2,025 serialised English copies**, not 10,125, with about 6,075 worldwide across the three languages. Add a capped run with no reprint planned, a signature stamped in gold, and no retail channel to anchor a price against, and you have the four things that actually drive a collectible's scarcity — the full breakdown is above. What you do **not** get is playability you could not buy for cents.

For the wider context on where serialised and premium prints sit in this game, see [the variant and finish glossary](/guides/riftbound-variant-glossary) — and note that Riot has said it has [no plans to serialise cards in booster packs](/blog/riftbound-august-2026-state-of-the-game-takeaways), which makes this collection a deliberate one-off rather than a preview.

---

*Sources: Riot Games' [T1 2025 Worlds Champion Collection announcement](https://playriftbound.com/en-us/news/announcements/the-riftbound-x-t1-2025-worlds-champion-collection/) (contents, print run, prices) and the [August Merch Store Updates](https://playriftbound.com/en-us/news/announcements/august-merch-store-updates/) post of 6 August 2026 (drawing window). Product details are Riot's; the card data, analysis and market commentary are ours.*`,
  },
  {
    slug: "jayce-mel-riftbound-empower-explained",
    category: "guide",
    title: "Jayce & Mel: Vendetta's New Champion Printings",
    excerpt:
      "Every confirmed Jayce and Mel printing in Riftbound, including two brand-new Vendetta cards — real stats, domains and rarities, not speculation.",
    author: "RiftCompare",
    date: "2026-07-16",
    updated: "2026-07-31",
    readMins: 5,
    tags: ["vendetta", "jayce", "mel", "empower", "guide"],
    shop: [
      { label: "Jayce singles", query: "Riftbound Jayce" },
      { label: "Vendetta booster boxes", query: "Riftbound Vendetta booster box" },
    ],
    // Positioned inline via [[embed:0]] (plural `embeds` array), right under the
    // paragraph confirming the printings — explicit slugs (curated, verified list),
    // so this can never silently include a wrong card. A slug that stops resolving
    // is simply omitted (see resolveEmbed), never a broken tile.
    embeds: [
      {
        title: "Every confirmed Jayce and Mel printing",
        note: "Live prices across every store we track — tap a card for its full comparison.",
        slugs: [
          "jayce-man-of-progress-sfd-084-221",
          "jayce-man-of-progress-sfd-084-221-promo",
          "jayce-man-of-progress-ven-175",
          "jayce-brilliant-inventor-ven-068",
          "jayce-brilliant-inventor-ven-068a",
          "jayce-hammer-in-hand-ven-088",
          "jayce-hammer-in-hand-ven-088a",
          "mel-newly-awakened-ven-069",
          "mel-newly-awakened-ven-069a",
        ],
      },
    ],
    body: `Jayce and Mel are two of the most-searched Riftbound names right now, tied to **[Vendetta's Empower mechanic](/guides/riftbound-empower-explained)**. Here's exactly what's confirmed today across both champions — real card data pulled straight from our database, not speculation.

## Jayce: five printings and counting

Jayce now has confirmed printings across two sets:

- **Jayce, Man of Progress** (Spiritforged, SFD 084/221) — the original printing. Rare, **Mind** domain, 4 energy for 4 might. Also has a **Promo** variant of the same card.
- **Jayce, Man of Progress** (Vendetta, VEN 175/166) — a Vendetta reprint of the same card, same stats.
- **Jayce, Brilliant Inventor** (Vendetta, VEN 068/166) — a brand-new printing. **Epic**, **Mind** domain, 6 energy for 6 might.
- **Jayce, Hammer in Hand** (Vendetta, VEN 088/166) — a second brand-new printing, this time **Rare**, **Body** domain, 4 energy for 5 might.

[[embed:0]]

## Is either of these a Jayce Legend card?

Worth clearing up the confusion behind that search: in Riftbound, a **Legend** is the single card you build your whole deck around, chosen before the game starts — a distinct card type from a **Champion**, a powerful unit you play *during* the game. Every confirmed Jayce printing above — old and new — is card type **Unit** (a Champion), not Legend. Legend cards are also typically titled by an epithet rather than the champion's own name (Jinx's Legend, for instance, is printed as "Loose Cannon"), so we can't rule out a Jayce-aligned Legend under an unrelated title with total certainty — but nothing bearing his name is a Legend today.

## Why Jayce spans two domains

Jayce's two brand-new Vendetta printings split neatly across Empower's two home domains — Mind (Brilliant Inventor) and Body (Hammer in Hand) — see the **[full Empower guide](/guides/riftbound-empower-explained)** for why that pairing matters. That's a real, confirmed reason he keeps coming up in the same breath as the mechanic, even before we know which (if any) of his printings actually carries the Empower keyword.

## Mel, Newly Awakened — now confirmed

Mel's first confirmed printing is real: **Mel, Newly Awakened** (Vendetta, VEN 069/166) — **Epic**, **Mind** domain, 4 energy for 4 might, with an alternate-art variant too. She sits one collector number after Jayce's Brilliant Inventor printing (068/069), both Mind, both Epic — a strong sign the two are meant to be played together.

## When will these have prices?

Vendetta released on **31 July 2026**, so these printings now carry live prices — tap any card above for its full store-by-store comparison. The gallery above will show real prices the moment they do, the same as every card on RiftCompare.

## Keep track of both

Bookmark this page — it updates as new Jayce or Mel printings land in the database, with live prices across every store we track. For the rest of Vendetta's new mechanics, see **[Flow explained](/guides/riftbound-flow-explained)** and **[Burn explained](/guides/riftbound-burn-explained)**, and see **[every Vendetta card with live prices](/sets/vendetta)**.`,
  },
  {
    slug: "riftbound-empower-explained",
    ebayPicks: { heading: "Vendetta singles on eBay right now" },
    category: "guide",
    title: "Riftbound Empower Explained: How the Empower Mechanic Works",
    excerpt:
      "A complete guide to Riftbound's Empower mechanic — a card that gains new abilities after it's already in play. How it works and how to build around it.",
    author: "RiftCompare",
    date: "2026-07-08",
    updated: "2026-07-31",
    readMins: 5,
    tags: ["vendetta", "mechanics", "empower", "disempower", "gameplay", "guide"],
    // Backs both the FAQPage JSON-LD and the "## Empower FAQ" body section
    // below — kept as one source so the two can't drift apart (added the
    // Empower-vs-Empowered question requested for the empower cluster work).
    faq: [
      { q: "What is Empower in Riftbound?", a: "Empower gives a card the potential to gain new abilities once it's already in play, usually by paying an extra cost on a later turn — a cheap play now, a bigger payoff later." },
      { q: "How does the Empower mechanic work?", a: "Play the card normally — it enters as a modest, often cheap unit or permanent. On a later turn, pay its Empower cost (printed in brackets in the rules box) to trigger the upgrade: bigger stats, a new ability, or an on-board effect. Some Empower cards can be upgraded more than once if the card allows it." },
      { q: "What's the difference between Empower and Empowered?", a: "Empower is the keyword/action — paying a cost to trigger a card's upgrade. Empowered is the status that results from it: a permanent flag that sticks to the card afterwards, which other cards can check for (an 'Empowered' dependent ability only turns on while the card has that status). You Empower a card once; it stays Empowered until it leaves the board or is Disempowered." },
      { q: "What is Disempower?", a: "The reverse of Empower — an instruction or cost on some cards that strips the Empowered status from a card. You can't Disempower a card that isn't currently Empowered." },
      { q: "Is Empower permanent?", a: "Yes. Empowered is a status that sticks to a card indefinitely — it lasts until the card leaves the board, or until something Disempowers it." },
      { q: "Is Empower only in Vendetta?", a: "It's introduced as a new mechanic in the Vendetta set. Cards from earlier sets can still support an Empower deck, but the keyword itself is new here." },
      { q: "Is Empower the same as levelling up a champion?", a: "No — Empower is a general mechanic that upgrades a card in play by paying a cost, not a champion-only level system." },
      { q: "How is Empower different from Flow and Burn?", a: "Empower grows a card you already control; Flow plays cards from your trash; Burn sends cards to the trash. All three are new in Vendetta and designed to combo." },
    ],
    shop: [
      { label: "Jayce singles — the Empower champion", query: "Riftbound Jayce" },
      { label: "Mel singles", query: "Riftbound Mel" },
      { label: "Vendetta booster boxes", query: "Riftbound Vendetta booster box" },
    ],
    // Same filter the embed below uses (rules text contains "[Empower]", scoped to
    // VEN) — so the CTA and the embed always show the identical set of cards.
    browseCta: {
      href: "/browse?rules=%5BEmpower%5D&rulesSet=VEN",
      label: "Browse every Empower card →",
      blurb: "Every Vendetta card with the Empower keyword, filterable and sortable, with live prices across every store we track.",
    },
    // Auto-collects every officially revealed VEN card whose rules text carries
    // [Empower] — real cards, real images, tap → card page. Grows through spoilers.
    embed: {
      title: "Every Empower card in Vendetta",
      note: "Every Vendetta card with the Empower keyword — tap a card for its page and live prices across every store we track.",
      rulesContain: "[Empower]",
      rulesSet: "VEN",
      take: 12,
    },
    // Zoomed crop of a real Empower card's rules text (resolved from the DB — the
    // first officially imported [Empower] card), so the guide can point at the
    // printed line itself instead of describing it in the abstract.
    closeups: [
      {
        caption: "The printed Empower line on a real Vendetta card — the bracketed cost is what you pay on a later turn to unlock the upgrade.",
        rulesContain: "[Empower]",
        rulesSet: "VEN",
        topPct: 54,
        heightPct: 32,
      },
    ],
    body: `![Vendetta's new mechanics — Flow, Burn and Empower](/vendetta-mechanics.png)

**Empower** is one of three new mechanics arriving with **[Riftbound: Vendetta](/sets/vendetta)** on **31 July 2026**. It's quickly become one of the most searched-for parts of the set — so here's a complete, plain-English guide to what the Empower mechanic does and how to play around it. For the quick rules reference and every Empower card in the set, see the **[Empower keyword page](/keywords/empower)**.

## What is Empower in Riftbound?

**Empower gives a card the potential to gain new abilities once it's already in play — usually by paying an additional cost on a later turn.** Instead of a card doing everything the moment it lands, an Empower card can be played cheaply now and then "levelled up" afterwards, adding might, an effect, or a new keyword.

Think of it as a two-stage card: stage one gets a body on the board; stage two, when you have the energy to spare, unlocks its full power.

## How the Empower mechanic works, step by step

1. **Play the card normally.** It enters as a modest, often cheap unit or permanent.
2. **Bank your energy.** Empower effects generally ask for an extra cost — so you plan a later turn where you can afford to activate it.
3. **Empower it.** Pay the cost to trigger the upgrade: bigger stats, a new ability, or an on-board effect.
4. **Repeat where allowed.** Some Empower cards are designed to keep scaling, rewarding a long game.

Because the payoff is deferred, Empower changes your *sequencing* more than your *shopping list*: the skill is knowing which turn to hold up energy for the upgrade instead of over-committing your hand.

## What Empower looks like on the card

Here's the actual printed text on a revealed Vendetta card — the **[Empower]** keyword sits in the rules box with its activation cost in brackets. When you see this line, read it as: *base card now, upgrade later for the bracketed price.*

[[closeup:0]]

## Why Empower is strong

- **It's flexible.** One card is both a cheap early play and a late-game threat, so you draw fewer dead cards.
- **It rewards planning.** Good Empower players think two turns ahead — a real skill-testing mechanic rather than a "play it and forget it" one.
- **It scales.** In grindy games, an Empowered board keeps getting bigger while an opponent's tempo deck runs out of gas.

## Empowered is a status, and Disempower removes it

Riot's own Core Rules confirm exactly how this works under the hood, so here's the precise version rather than the loose one: **Empowered is a status** that sticks to a card indefinitely — it does nothing by itself, but other abilities can check for it (that's the **Empowered** keyword: a *dependent* ability that only turns on while the card has the status). A card stays Empowered until it leaves the board, or until something **Disempowers** it — the exact reverse of Empower, removing the status outright. You can't Disempower a card that isn't Empowered in the first place, and some Vendetta cards use "disempower a card" as their own cost or instruction, so expect to see decks built around stripping an opponent's upgrade, not just stacking your own.

## Building an Empower deck

Empower leans toward **Mind and Body** styles of play — champions like **Jayce** and **Mel** who want to bank resources and go over the top later. It pairs naturally with the set's other new mechanics: **[Flow](/guides/riftbound-flow-explained)** keeps refuelling your options from the trash, and even **[Burn](/guides/riftbound-burn-explained)** can feed a long game plan. The common thread is **patience and value** over raw early aggression.

A few deckbuilding rules of thumb:

- **Curve for the double-spend.** Leave room in your mana curve to both play *and* Empower in the same few turns.
- **Protect the payoff.** Your Empowered threat is the game — hold up an answer or bait removal before you commit the upgrade.
- **Don't over-Empower.** Sinking every turn into one unit can be greedy; sometimes a second body wins faster.

For a full archetype breakdown, see the **[best Vendetta decks guide](/guides/best-riftbound-vendetta-decks)** and the **[Vendetta deckbuilding guide](/guides/building-for-riftbound-vendetta)**.

## Empower FAQ

**What is Empower in Riftbound?** Empower gives a card the potential to gain new abilities once it's already in play, usually by paying an extra cost on a later turn — a cheap play now, a bigger payoff later.

**How does the Empower mechanic work?** Play the card normally — it enters as a modest, often cheap unit or permanent. On a later turn, pay its Empower cost (printed in brackets in the rules box) to trigger the upgrade: bigger stats, a new ability, or an on-board effect. Some Empower cards can be upgraded more than once if the card allows it.

**What's the difference between Empower and Empowered?** Empower is the keyword/action — paying a cost to trigger a card's upgrade. Empowered is the status that results from it: a permanent flag that sticks to the card afterwards, which other cards can check for (an "Empowered" dependent ability only turns on while the card has that status). You Empower a card once; it stays Empowered until it leaves the board or is Disempowered.

**What is Disempower?** The reverse of Empower — an instruction or cost on some cards that strips the Empowered status from a card. You can't Disempower a card that isn't currently Empowered.

**Is Empower permanent?** Yes. Empowered is a status that sticks to a card indefinitely — it lasts until the card leaves the board, or until something Disempowers it.

**Is Empower only in Vendetta?** It's introduced as a new mechanic in the Vendetta set. Cards from earlier sets can still support an Empower deck, but the keyword itself is new here.

**Is Empower the same as levelling up a champion?** No — Empower is a general mechanic that upgrades a card in play by paying a cost, not a champion-only level system.

**How is Empower different from Flow and Burn?** Empower grows a card you already control; **[Flow](/guides/riftbound-flow-explained)** plays cards from your trash; **[Burn](/guides/riftbound-burn-explained)** sends cards to the trash. All three are new in Vendetta and designed to combo.

## Get ready for Empower cards

Empower cards are live with real prices on the **[Vendetta set page](/sets/vendetta)** — and RiftCompare shows the cheapest delivered price across every store, so you can build your Empower deck for the least. Want to see the whole set at a glance? Browse the **[Vendetta card gallery](/sets/vendetta/gallery)** — all 166 cards on one page with images and prices.`,
  },
  {
    slug: "riftbound-flow-explained",
    category: "guide",
    title: "Riftbound Flow Explained: How the Flow Mechanic Works",
    excerpt:
      "Riftbound Flow lets you cast a card straight from your trash instead of your hand — how the mechanic works, deckbuilding tips, and every Flow card in Vendetta.",
    author: "RiftCompare",
    date: "2026-07-08",
    updated: "2026-08-19",
    readMins: 4,
    tags: ["vendetta", "mechanics", "flow", "gameplay", "guide"],
    faq: [
      { q: "What is Flow in Riftbound?", a: "Flow is a Vendetta keyword that lets you play a card straight from your trash instead of your hand — your discarded and used cards become a second pool of plays rather than being gone for good." },
      { q: "How does the Flow mechanic work?", a: "A card printed with Flow can be cast from the trash the same way you'd cast it from hand, often for its normal cost — so anything that fills your trash first (discarding, cycling, or the Burn mechanic) sets Flow up to cash in later." },
      { q: "Is Flow only in Vendetta?", a: "Yes — Flow is introduced as a brand-new keyword in the Vendetta set; it doesn't appear on cards from earlier sets." },
      { q: "How is Flow different from Empower and Burn?", a: "Flow plays cards from your trash; Burn sends cards to your trash; Empower upgrades a card that's already in play." },
    ],
    shop: [
      { label: "Chaos singles — the recursion domain", query: "Riftbound Chaos" },
      { label: "Vendetta booster boxes", query: "Riftbound Vendetta booster box" },
    ],
    // Same filter the embed below uses, so the CTA and the embed can never show a
    // different set of cards. Mirrors the Empower guide, whose CTA into live prices
    // is part of why it converts.
    browseCta: {
      href: "/browse?rules=%5BFlow%5D&rulesSet=VEN",
      label: "Browse every Flow card →",
      blurb: "Every Vendetta card with the Flow keyword, filterable and sortable, with live prices across every store we track.",
    },
    embed: {
      title: "Every Flow card in Vendetta",
      note: "Every officially revealed Vendetta card with the Flow keyword — tap a card for its page.",
      rulesContain: "[Flow]",
      rulesSet: "VEN",
      take: 12,
    },
    // Zoomed crop of a real Flow card's rules text (resolves from the DB — the
    // first officially imported [Flow] card; renders nothing until one exists).
    closeups: [
      {
        caption: "The printed Flow line on a real Vendetta card — it can be cast straight from the trash for the cost shown.",
        rulesContain: "[Flow]",
        rulesSet: "VEN",
        topPct: 54,
        heightPct: 32,
      },
    ],
    body: `![Vendetta's new mechanics — Flow, Burn and Empower](/vendetta-mechanics.png)

**Flow** is one of three new mechanics in **[Riftbound: Vendetta](/sets/vendetta)** (out **31 July 2026**). It turns your trash from a graveyard into a resource — here's exactly how the Flow mechanic works and how to build around it. For the quick rules reference and every Flow card in the set, see the **[Flow keyword page](/keywords/flow)**.

## What is Flow in Riftbound?

**Flow lets you play a card from your trash instead of from your hand.** Cards you've used, discarded or had destroyed aren't gone — with Flow, they become a second pool of plays. It draws on the League champions who fuel their kits with Energy: your spent cards keep on working.

## What Flow looks like on the card

Here's the actual printed text on a revealed Vendetta card — the **[Flow]** keyword sits in the rules box, telling you the card can be cast from the trash instead of the hand.

[[closeup:0]]

## How the Flow mechanic works, step by step

1. **Get the card into your trash.** Flow only works from the trash, so the card has to get there first — by being played and used, discarded, destroyed, or deliberately sent there with **[Burn](/guides/riftbound-burn-explained)**.
2. **Read the Flow cost.** The **[Flow]** line in the rules box tells you what it costs to replay the card from the trash. Often it is the card's normal cost; some printings modify it.
3. **Play it straight from the trash.** On a later turn, pay that cost and cast the card out of the trash exactly as you would from hand — no extra permission needed.
4. **Line up the next one.** A good Flow turn usually sets up the following one, so track what is still sitting in the trash and in what order you want it back.

### Why Flow is strong

- **Your trash is a second hand.** Cards you have already spent are still live resources, so you effectively draw from two places at once.
- **It punishes removal.** Killing your unit does not really answer it if you can replay it — Flow decks are miserable to grind down.
- **It rewards knowledge.** Flow favours players who track what is in the trash and sequence replays for maximum value.

## Building a Flow deck

Flow is the recursion engine of Vendetta. Its best partner is **[Burn](/guides/riftbound-burn-explained)**, which stocks your trash quickly — Burn fills it, Flow cashes it in. Deckbuilding pointers:

- **Enable it.** Include cheap ways to get cards into the trash early so Flow is online when you need it.
- **Grind the long game.** Flow decks win by out-valuing opponents over time, not by racing — plan for longer games.
- **Watch trash hate.** Effects that exile or shuffle away the trash are your weakness; play around them.

See how Flow fits full decklists in the **[best Vendetta decks guide](/guides/best-riftbound-vendetta-decks)**.

## Flow vs Empower vs Burn

**Flow** plays cards from your trash; **[Burn](/guides/riftbound-burn-explained)** sends cards to the trash; **[Empower](/guides/riftbound-empower-explained)** grows a card already in play. They're designed to combo.

## Flow FAQ

**What is Flow in Riftbound?** Flow is a Vendetta keyword that lets you play a card straight from your trash instead of your hand — your discarded and used cards become a second pool of plays rather than being gone for good.

**How does the Flow mechanic work?** A card printed with Flow can be cast from the trash the same way you'd cast it from hand, often for its normal cost — so anything that fills your trash first (discarding, cycling, or the Burn mechanic) sets Flow up to cash in later.

**Is Flow only in Vendetta?** Yes — Flow is introduced as a brand-new keyword in the Vendetta set; it doesn't appear on cards from earlier sets.

**How is Flow different from Empower and Burn?** Flow plays cards from your trash; **[Burn](/guides/riftbound-burn-explained)** sends cards to your trash; **[Empower](/guides/riftbound-empower-explained)** upgrades a card that's already in play.

Flow cards are live with real prices on the **[Vendetta set page](/sets/vendetta)** — compare every store on RiftCompare so you build your Flow deck for the cheapest total. Want to see the whole set at a glance? Browse the **[Vendetta card gallery](/sets/vendetta/gallery)** — all 166 cards on one page with images and prices.`,
  },
  {
    slug: "riftbound-burn-explained",
    category: "guide",
    title: "Riftbound Burn Explained: How the Burn Mechanic Works",
    excerpt:
      "A complete guide to Burn — the Riftbound: Vendetta mechanic that sends cards to the trash, both to fuel your own synergies and to attack your opponent's deck.",
    author: "RiftCompare",
    date: "2026-07-08",
    updated: "2026-07-31",
    readMins: 4,
    tags: ["vendetta", "mechanics", "burn", "gameplay", "guide"],
    faq: [
      { q: "What is Burn in Riftbound?", a: "Burn sends cards from a Main Deck to the trash — either your own (self-Burn, to fuel Flow and other trash-payoffs) or your opponent's (a mill-style deck attack)." },
      { q: "Is Burn the same as mill?", a: "Deck-attack Burn (burning an opponent's deck) is Riftbound's version of a mill strategy. Self-Burn is a different use of the same keyword — filling your own trash on purpose." },
      { q: "Is Burn only in Vendetta?", a: "Yes — Burn is introduced as a new keyword in the Vendetta set." },
      { q: "How is Burn different from Flow and Empower?", a: "Burn sends cards to the trash; Flow plays them back out of the trash; Empower grows a card that's already in play. The three are designed to combo." },
    ],
    shop: [
      { label: "Vendetta booster boxes", query: "Riftbound Vendetta booster box" },
      { label: "Riftbound singles on eBay", query: "Riftbound TCG singles" },
    ],
    // Same filter the embed below uses — see the Flow guide's note.
    browseCta: {
      href: "/browse?rules=%5BBurn%5D&rulesSet=VEN",
      label: "Browse every Burn card →",
      blurb: "Every Vendetta card with the Burn keyword, filterable and sortable, with live prices across every store we track.",
    },
    embed: {
      title: "Every Burn card in Vendetta",
      note: "Every officially revealed Vendetta card with the Burn keyword — tap a card for its page.",
      rulesContain: "[Burn]",
      rulesSet: "VEN",
      take: 12,
    },
    // Zoomed crop of a real Burn card's rules text (resolves from the DB — the
    // first officially imported [Burn] card; renders nothing until one exists).
    closeups: [
      {
        caption: "The printed Burn line on a real Vendetta card — the number shown is how many cards get sent to the trash.",
        rulesContain: "[Burn]",
        rulesSet: "VEN",
        topPct: 54,
        heightPct: 32,
      },
    ],
    body: `![Vendetta's new mechanics — Flow, Burn and Empower](/vendetta-mechanics.png)

**Burn** is one of three new mechanics in **[Riftbound: Vendetta](/sets/vendetta)** (out **31 July 2026**). It has two very different uses — here's how the Burn mechanic works and how to build around it. For the quick rules reference and every Burn card in the set, see the **[Burn keyword page](/keywords/burn)**.

## What is Burn in Riftbound?

**Burn sends cards from a Main Deck to the trash.** Which deck it targets is what makes it interesting:

- **Self-Burn** — some cards burn *your own* deck. That sounds bad, but it's the fastest way to stock your trash for **[Flow](/guides/riftbound-flow-explained)** and other trash-payoffs.
- **Deck attack (mill)** — other cards burn your *opponent's* deck, chipping away at what they'll draw. It's Riftbound's take on a mill strategy.

## What Burn looks like on the card

Here's the actual printed text on a revealed Vendetta card — the **[Burn]** keyword sits in the rules box with the number of cards it sends to the trash.

[[closeup:0]]

## How the Burn mechanic works, step by step

1. **Check which deck it burns.** Read the **[Burn]** line carefully — self-Burn hits your own Main Deck, deck-attack Burn hits your opponent's. This single word changes the whole plan.
2. **Note the number.** The value printed with the keyword is how many cards go from the top of that deck to the trash.
3. **Send them to the trash.** Burned cards are not exiled — they land in the trash, where **[Flow](/guides/riftbound-flow-explained)** and other trash-payoffs can still reach them.
4. **Cash it in.** If you burned your own deck, that trash is now fuel. If you burned theirs, you are that many cards closer to decking them out.

## How to build with Burn

Burn is a toolbox mechanic — how you use it depends on your plan:

- **As fuel:** pair self-Burn with **[Flow](/guides/riftbound-flow-explained)**. Burn fills the trash, Flow replays from it — the core value engine of the set.
- **As a clock:** lean into opponent-Burn to win by decking them out. Watch how fast the clock actually is before committing to it as your only win condition — mill needs enough Burn to close the game.
- **Mind the downside:** self-Burn thins your own deck, so make sure you're getting more value back than you lose.

Full decklists that use Burn are in the **[best Vendetta decks guide](/guides/best-riftbound-vendetta-decks)**.

## Burn vs Flow vs Empower

**Burn** sends cards to the trash; **[Flow](/guides/riftbound-flow-explained)** plays them back out; **[Empower](/guides/riftbound-empower-explained)** grows a card already in play. They're designed to combo.

## Burn FAQ

**What is Burn in Riftbound?** Burn sends cards from a Main Deck to the trash — either your own (self-Burn, to fuel Flow and other trash-payoffs) or your opponent's (a mill-style deck attack).

**Is Burn the same as mill?** Deck-attack Burn (burning an opponent's deck) is Riftbound's version of a mill strategy. Self-Burn is a different use of the same keyword — filling your own trash on purpose.

**Is Burn only in Vendetta?** Yes — Burn is introduced as a new keyword in the Vendetta set.

**How is Burn different from Flow and Empower?** Burn sends cards to the trash; **[Flow](/guides/riftbound-flow-explained)** plays them back out of the trash; **[Empower](/guides/riftbound-empower-explained)** grows a card that's already in play. The three are designed to combo.

Burn cards are live with real prices on the **[Vendetta set page](/sets/vendetta)** — RiftCompare compares every store so you pay the cheapest delivered price. Browse the whole set visually in the **[Vendetta card gallery](/sets/vendetta/gallery)**.`,
  },
  {
    slug: "riftbound-combat-keywords-explained",
    category: "guide",
    title: "Riftbound Combat Keywords Explained",
    excerpt:
      "A plain-English guide to Riftbound's six combat keywords — Tank, Shield, Deflect, Assault, Backline and Ganking — how each one changes damage assignment or movement, and how to build a defensive (or aggressive) shell around them.",
    author: "RiftCompare",
    date: "2026-08-12",
    readMins: 6,
    tags: ["combat", "keywords", "rules", "deckbuilding", "guide"],
    faq: [
      { q: "What's the difference between Tank and Backline?", a: "Tank must be assigned lethal combat damage first among your units; Backline must be assigned it last. They're direct opposites, and combining both on different units gives you a controlled front line and back line." },
      { q: "What's the difference between Shield and Assault?", a: "Shield gives bonus Might only while a unit is defending; Assault gives the same kind of bonus only while it's attacking. A unit only ever benefits from one of the two in a given combat." },
      { q: "Does Deflect stop targeting outright?", a: "No — Deflect is a tax, not a block. It adds a mandatory extra Power cost every time an opponent's spell or ability targets the Deflect card; they can still pay it and target anyway." },
      { q: "Does Ganking give a unit an extra move?", a: "No — it widens the destinations a unit's existing standard move can reach (battlefield to battlefield, not just through base), it doesn't grant an additional movement action." },
      { q: "Can a unit have more than one of these keywords?", a: "Yes — nothing stops a card from combining, say, Tank and Shield, making it both the unit that has to be hit first AND tougher while defending." },
      { q: "Are these keywords new to Vendetta?", a: "No — Tank, Shield, Deflect, Assault, Backline and Ganking are core Riftbound combat rules, not mechanics introduced by a specific set, unlike Empower, Flow and Burn." },
    ],
    embeds: [
      {
        title: "Cards printed with Tank",
        note: "Real, officially catalogued cards whose rules text carries the Tank keyword.",
        rulesContain: "[Tank]",
        rulesSet: "VEN",
        take: 6,
      },
      {
        title: "Cards printed with Shield",
        note: "Real, officially catalogued cards whose rules text carries the Shield keyword.",
        rulesContain: "[Shield",
        rulesSet: "VEN",
        take: 6,
      },
    ],
    body: `Six of Riftbound's keywords exist purely to change what happens during combat — who has to be hit, how much Might a unit is really swinging with, and where a unit is even allowed to move. None of the six are new to a single set the way Empower, Flow and Burn are; they're part of the core combat rules, and each has its own quick-reference page with a live "every card" list — this guide is the plain-English walkthrough of how they interact.

## Tank: forces damage toward itself

**A unit with Tank must be assigned lethal combat damage before any of your other units that don't have Tank.** It's the classic "hit me first" ability — an attacker literally isn't allowed to assign damage anywhere else on your board until every Tank unit you control has already taken lethal. If you have more than one Tank unit, the attacker chooses which takes it. Full reference: **[Tank keyword page](/keywords/tank)**.

[[embed:0]]

## Shield: tougher on defense only

**Shield [X] gives a unit +X Might, but only while it's defending in combat.** The bonus disappears the instant combat ends or the unit stops being the defender — it does nothing on offense, and nothing outside a fight. Multiple sources of Shield on one unit simply add together. Full reference: **[Shield keyword page](/keywords/shield)**.

[[embed:1]]

## Deflect: a tax on being targeted

**Deflect [X] makes an opponent pay X extra Power, of any domain, every time their spell or ability targets the card with Deflect.** It doesn't stop them from targeting it — it just makes doing so more expensive, which is often enough to make a removal spell not worth casting at all.

## Assault: tougher on offense only

**Assault [X] is Shield's mirror image — +X Might, but only while the unit is attacking.** Where Shield rewards sitting back and letting the opponent walk into your wall, Assault rewards initiating combat yourself. A unit can't benefit from both Shield and Assault in the same combat, since it's never attacking and defending at once.

## Backline: forces damage away from itself

**Backline is Tank's opposite — a unit with it must be assigned lethal damage LAST, after every other unit you control without Backline already has.** It's the keyword for protecting something you don't want to lose in a small skirmish: a value engine, a card-draw source, anything you'd rather keep alive through the fight than sacrifice early.

## Ganking: battlefield-to-battlefield movement

**Ganking lets a unit's standard move go directly from one battlefield to another, instead of being limited to your base or an adjacent location.** It's purely additive — it never removes a move a unit already had, it just opens up a shortcut. That makes it valuable the moment your units are spread across more than one battlefield: reinforcing a fight, or bailing out of a losing one, without routing back through base first.

## Building a defensive shell (or an aggressive one)

**A defensive board** wants Tank on your cheapest, most expendable unit (so it absorbs the first hit), Backline on whatever you actually care about keeping, and Shield scattered across units you expect to be defending regularly. **An aggressive board** wants Assault on your biggest attackers and Ganking on anything you need to reposition into a fresh fight. Deflect works for either plan — it's valuable on any unit that's already doing its job and you don't want removed.

None of these six replace deckbuilding fundamentals — a great Tank unit still needs a reasonable body underneath the keyword. But knowing exactly what each one does (and doesn't do) is the difference between reading a card correctly and guessing.

Every combat-keyword card is live with real prices — browse **[Tank](/keywords/tank)**, **[Shield](/keywords/shield)**, **[Deflect](/keywords/deflect)**, **[Assault](/keywords/assault)**, **[Backline](/keywords/backline)** and **[Ganking](/keywords/ganking)** on their own reference pages, or see the full **[Riftbound keywords glossary](/keywords)** for every mechanic in the game.`,
  },
  {
    slug: "riftbound-timing-keywords-explained",
    category: "guide",
    title: "Riftbound Timing Keywords Explained",
    excerpt:
      "How Action, Reaction, Hidden and Ambush change WHEN a Riftbound card can be played — instant-speed tricks, facedown surprise plays, and dropping a unit into a fight already in progress.",
    author: "RiftCompare",
    date: "2026-08-12",
    readMins: 5,
    tags: ["timing", "keywords", "rules", "deckbuilding", "guide"],
    faq: [
      { q: "What's the actual difference between Action and Reaction?", a: "Reaction includes everything Action grants — permission to play during a Showdown — plus the additional permission to play during a Closed state, Riftbound's most restrictive, truly any-time timing window. A card only needs Reaction to get both." },
      { q: "Can you play a Hidden card the turn you hide it?", a: "No — a hidden card only gains its free cost and Reaction-speed timing starting the next turn, not immediately." },
      { q: "Can Ambush put a unit on an empty battlefield?", a: "No — Ambush specifically requires a battlefield where you already control one or more units; an empty battlefield isn't a valid Ambush destination." },
      { q: "Do these keywords change what a card does?", a: "No — all four are pure permissions. They change when and where a card can be played, never its actual effect once it resolves." },
      { q: "Are Action, Reaction, Hidden and Ambush new to Vendetta?", a: "No — they're core Riftbound timing rules, not set-specific mechanics like Empower, Flow and Burn." },
    ],
    embeds: [
      {
        title: "Cards printed with Reaction",
        note: "Real, officially catalogued cards whose rules text carries the Reaction keyword.",
        rulesContain: "[Reaction]",
        rulesSet: "VEN",
        take: 6,
      },
      {
        title: "Cards printed with Ambush",
        note: "Real, officially catalogued cards whose rules text carries the Ambush keyword.",
        rulesContain: "[Ambush]",
        rulesSet: "VEN",
        take: 6,
      },
    ],
    body: `Riftbound splits a turn into states — Open, Showdown, Closed — and most cards can only be played during your own Open state, on your own turn. Four keywords exist purely to carve out exceptions to that: Action, Reaction, Hidden and Ambush. None change what a card does — only when and, for two of them, where it can be played.

## Action: permission to play during a Showdown

**Action lets a card or ability be played or activated during a Showdown, even on your opponent's turn** — a state that would otherwise lock most cards out. It's pure permission: an Action unit still has to be played to a base or a battlefield you control, exactly like normal. Full reference: **[Action keyword page](/keywords/action)**.

## Reaction: true instant speed

**Reaction includes everything Action grants, plus permission to play during a Closed state** — Riftbound's tightest timing window, and the closest thing the game has to a universal "any time" instant. A Reaction card can respond on either player's turn, which is what makes Reaction cards feel like tricks and counters rather than ordinary plays. Full reference: **[Reaction keyword page](/keywords/reaction)**.

[[embed:0]]

## Hidden: pay now, play later as a surprise

**Hidden lets you pay a cost to place a card facedown at a battlefield you control.** From the next turn on, that facedown card gains Reaction and can be played for free — your opponent has no idea what it is until it resolves. The tradeoff: targeting from a Hidden play is usually restricted to the battlefield it was hidden at, since the card already committed to a location the moment it went facedown. Full reference: **[Hidden keyword page](/keywords/hidden)**.

## Ambush: dropping into an ongoing fight

**Ambush lets a unit be played to a battlefield where you already control units** — normally off-limits, since units can usually only go to your base or somewhere you already have presence — and grants it Reaction for that specific play. Full reference: **[Ambush keyword page](/keywords/ambush)**.

[[embed:1]]

## Building a tempo deck around timing keywords

Hidden and Ambush are natural partners: hide a threat one turn, then Ambush a second unit into the same fight the next, and your opponent has to play around two unknowns instead of one visible board. Reaction abilities that Add resources let you hold energy back and still cover a cost you didn't fully plan for. None of these four keywords do anything on their own — their value is entirely in disrupting what an opponent thinks they know about the board, which is exactly why a deck built around them rewards patient, information-heavy play over straightforward curve-outs.

See the full **[Riftbound keywords glossary](/keywords)** for every mechanic in the game, including the set's headline new keywords in the **[Empower](/guides/riftbound-empower-explained)**, **[Flow](/guides/riftbound-flow-explained)** and **[Burn](/guides/riftbound-burn-explained)** guides.`,
  },
  {
    slug: "riftbound-growth-keywords-explained",
    category: "guide",
    title: "Riftbound Growth Keywords Explained",
    excerpt:
      "Eight Riftbound keywords built around scaling up over the course of a game — XP thresholds, playing multiple cards a turn, equipping gear, card selection and death triggers, all explained in plain English.",
    author: "RiftCompare",
    date: "2026-08-12",
    readMins: 7,
    tags: ["deckbuilding", "keywords", "rules", "guide"],
    faq: [
      { q: "How do you gain the XP that Level checks for?", a: "Hunt is the most direct source — it grants XP whenever a unit with Hunt Conquers or Holds a battlefield, defaulting to 1 XP unless a higher value is printed." },
      { q: "Does Legion need two cards WITH Legion to turn on?", a: "No — playing any one other card that turn satisfies every Legion ability you control, not just a matching pair." },
      { q: "What's the difference between Equip and Weaponmaster?", a: "Equip is something you pay for and activate yourself, on your own timing. Weaponmaster automatically offers a discounted equip the instant a unit with that keyword is played — no separate activation needed." },
      { q: "Does Accelerate do anything once a unit is already on the board?", a: "No — it only affects how the unit enters (readied instead of exhausted); it has no function afterward." },
      { q: "Does Deathknell trigger if a permanent is recalled instead of dying?", a: "No — Deathknell specifically watches for the permanent being Killed and sent to the trash. If that death is replaced by something else, like a recall, the trigger never fires." },
      { q: "Are any of these eight keywords new to Vendetta?", a: "No — Legion, Level, Hunt, Weaponmaster, Equip, Accelerate, Vision and Deathknell are all core Riftbound rules, not set-specific mechanics like Empower, Flow and Burn." },
    ],
    embeds: [
      {
        title: "Cards printed with Weaponmaster",
        note: "Real, officially catalogued cards whose rules text carries the Weaponmaster keyword.",
        rulesContain: "[Weaponmaster]",
        rulesSet: "VEN",
        take: 6,
      },
      {
        title: "Cards printed with Deathknell",
        note: "Real, officially catalogued cards whose rules text carries the Deathknell keyword.",
        rulesContain: "[Deathknell]",
        rulesSet: "VEN",
        take: 6,
      },
    ],
    body: `Where the combat keywords decide who takes damage and the timing keywords decide when a card can be played, this cluster of eight is about the long game — scaling a board up, banking XP toward a threshold, arming a unit with gear, and turning a card's death into an advantage instead of a loss.

## Legion: rewards playing more than one card a turn

**A Legion ability is dormant until you've played a second card the same turn — then it stays active for the rest of that turn.** It's a running condition, not a one-time trigger, and playing any single other card turns on every Legion ability you control at once. Full reference: **[Legion keyword page](/keywords/legion)**.

## Level: a running XP threshold

**A Level [N] ability is active for as long as your XP total stays at N or more,** and goes inactive the instant it drops below — including if the card changes controller and the new controller doesn't meet the threshold. It's a long-game investment: unremarkable early, and only worth its full text once your XP engine catches up. Full reference: **[Level keyword page](/keywords/level)**.

## Hunt: the XP engine behind Level

**Hunt X grants that much XP whenever the unit with it Conquers OR Holds a battlefield** — both winning a fight and simply keeping a battlefield you already hold can trigger it, so a Hunt unit that sticks around keeps paying out turn after turn. It's the most direct way to reach the thresholds Level cards check for. Full reference: **[Hunt keyword page](/keywords/hunt)**.

## Weaponmaster: free equipping on entry

**When you play a unit with Weaponmaster, you may immediately choose an Equipment card you control and attach it, paying the Equip cost at a discount.** It only does something if you already have Gear sitting around — a payoff for a deck that plays Equipment early and expects to arm a threat later. Full reference: **[Weaponmaster keyword page](/keywords/weaponmaster)**.

[[embed:0]]

## Equip: attaching gear on your own timing

**Equip [Cost] is an activated ability on Gear cards — pay it, choose a unit you control, and the Gear attaches to it.** It's the manual version of what Weaponmaster automates: you control exactly when it happens, rather than only getting the option the turn a Weaponmaster unit lands. Full reference: **[Equip keyword page](/keywords/equip)**.

## Accelerate: pay more now, act immediately

**Accelerate lets you pay an optional extra cost as you play a unit so it enters the board readied instead of exhausted** — meaning it can attack or block right away instead of sitting out its first turn. It only matters at the moment of playing the card; once the unit's on the board, Accelerate has already done its job. Full reference: **[Accelerate keyword page](/keywords/accelerate)**.

## Vision: card selection on entry

**Vision triggers when the permanent with it is played, letting its controller Predict** — look at the top card of their deck and choose whether to keep it there or Recycle it away. It doesn't draw an extra card; it just smooths out what you're about to draw next, and it's most valuable stacked across several sources. Full reference: **[Vision keyword page](/keywords/vision)**.

## Deathknell: turning a death into value

**Deathknell is short for "when I die, [Effect]" — it fires when the permanent is Killed and actually sent to the trash,** not if that death is replaced by something else (a recall, for instance). It rewards a deck that's happy to trade a unit away, or even sacrifice it deliberately, because the death itself is the payoff. Full reference: **[Deathknell keyword page](/keywords/deathknell)**.

[[embed:1]]

## How these eight fit together

Hunt feeds Level. Legion rewards a low, wide curve of cheap cards. Equip and Weaponmaster both want a Gear-heavy shell, just on different timings. Accelerate and Vision are both about smoothing out a game plan rather than winning it outright — one skips downtime, the other skips a bad draw. Deathknell is the odd one out: it's the only keyword here that wants a unit gone, not scaled up, which makes it a natural fit alongside sacrifice effects and trades you were happy to make anyway.

See the full **[Riftbound keywords glossary](/keywords)** for every mechanic in the game, or the **[Empower](/guides/riftbound-empower-explained)**, **[Flow](/guides/riftbound-flow-explained)** and **[Burn](/guides/riftbound-burn-explained)** guides for Vendetta's three headline new mechanics.`,
  },
  {
    slug: "riftbound-game-actions-explained",
    category: "guide",
    title: "Riftbound Game Actions Explained",
    excerpt:
      "The verbs Riftbound cards actually use inside their ability text — Buff, Stun, Predict, Add, Repeat, Temporary, Unique and Mighty — explained precisely, straight from the Core Rules.",
    author: "RiftCompare",
    date: "2026-08-12",
    readMins: 6,
    tags: ["rules", "keywords", "beginners", "guide"],
    faq: [
      { q: "What's the difference between a Keyword and a Game Action in Riftbound?", a: "A Keyword is a standalone bracketed line on a card, like [Tank] or [Empower]. A Game Action is a verb used INSIDE other cards' ability text — 'Buff a unit', 'Add [2]', 'Stun a unit' — that Riot's Core Rules still defines precisely, even though it isn't its own keyword line." },
      { q: "Can you Buff a unit that already has a Buff counter?", a: "You can still choose it, but no additional counter is placed — a unit can only hold one Buff counter at a time unless a specific effect says otherwise." },
      { q: "Does a Stunned unit still need full damage to die?", a: "Yes — being Stunned only removes a unit's Might from that combat's damage; it still needs damage equal to its full Might to actually be killed." },
      { q: "Is Mighty something a card grants me?", a: "No — Mighty is a derived threshold. Any unit with 5 or more current Might automatically counts as Mighty, and stops the instant that total drops." },
      { q: "Does Unique do anything once the game has started?", a: "No — Unique is purely a deckbuilding restriction (only one copy of that named card per deck). It has zero effect once the game is underway." },
      { q: "What happens if you Repeat a spell's effect?", a: "Paying the Repeat cost as you play a spell or ability makes its instructions execute a second time on resolution — and the choices for that second execution don't have to match the first." },
    ],
    body: `Not every precise rule in Riftbound is a bracketed keyword line. Riot's Core Rules also defines a set of "Game Actions" — verbs that show up inside OTHER cards' ability text, like "Buff a unit" or "Add [2]" — with the same rigor as a full keyword. This guide covers eight of them: the ones that show up most often once you start reading real cards closely.

## Buff: a single counter, not a stacking bonus

**Buffing places a Buff counter on a chosen unit — but only if it doesn't already have one.** A unit can hold just one Buff counter at a time by default, so re-Buffing an already-Buffed unit doesn't add anything further; it can still be chosen, the instruction just doesn't do more. Some cards check whether a Buff actually landed ("if it was buffed this way...") before triggering a bonus. Full reference: **[Buff keyword page](/keywords/buff)**.

## Stun: skips one combat, doesn't kill

**A Stunned unit doesn't contribute its Might to combat damage that turn** — it's a binary status, on or off, and re-Stunning an already-Stunned unit does nothing further. Stunned wears off automatically at end-of-turn cleanup, and a Stunned unit still needs damage equal to its full Might to actually die — Stun is a tempo tool for winning one fight, not permanent removal. Full reference: **[Stun keyword page](/keywords/stun)**.

## Predict: looking before you draw

**Predicting shows you the top card of your own Main Deck and lets you choose to keep it there or Recycle it away.** "Predict X" does this for X cards at once. It doesn't draw anything — it's pure card selection, most commonly triggered by the [Vision](/keywords/vision) keyword. Full reference: **[Predict keyword page](/keywords/predict)**.

## Add: putting resources in your pool

**Adding puts Energy or Power into your Rune Pool** — "Add [2]" means 2 Energy, a domain letter means Power of that domain. Abilities that Add resolve immediately rather than passing priority, which is what makes an Add ability with Reaction so flexible: it can be activated the instant a cost needs paying, mid-resolution of something else entirely. Full reference: **[Add keyword page](/keywords/add)**.

## Repeat: running a spell's effect twice

**Paying "Repeat [Cost]" as you play a spell or ability lets its instructions execute a second time on resolution** — the choices for that second execution (targets, modes) don't have to match the first. Multiple instances of Repeat can each be paid separately, for one additional execution per instance. Full reference: **[Repeat keyword page](/keywords/repeat)**.

## Temporary: built to last exactly one round

**A permanent with Temporary is automatically killed at the very start of its controller's next Beginning Phase, before scoring.** It gets the rest of the turn it entered on, plus reaches the start of the following one — then it's gone. It's how Riftbound prints a self-cleaning, one-cycle effect. Full reference: **[Temporary keyword page](/keywords/temporary)**.

## Unique: a deckbuilding rule, not a gameplay effect

**Unique restricts a deck to only one card of that exact name.** Unlike everything else in this guide, it does absolutely nothing once a game has started — it's checked purely when a deck list is validated. Full reference: **[Unique keyword page](/keywords/unique)**.

## Mighty: a threshold, not a keyword you're granted

**A unit "is Mighty" automatically whenever its current Might is 5 or greater**, and stops being Mighty the instant that total drops — there's no separate status to track, it's derived live from the number. Cards that check "while I'm Mighty..." turn their bonus on and off with the unit's stats. Full reference: **[Mighty keyword page](/keywords/mighty)**.

## Why these matter even though they're not "keywords"

Reading a Riftbound card correctly means reading these verbs precisely, not intuitively — "Buff" doesn't stack past one counter the way a generic "+1/+1" might in another game, and "Stun" doesn't kill even though it feels like it should. Getting a Game Action's exact rule wrong is one of the most common ways a new player misreads what a card actually does.

See the full **[Riftbound keywords glossary](/keywords)** for every mechanic in the game — combat keywords like Tank and Shield are in the **[Combat Keywords guide](/guides/riftbound-combat-keywords-explained)**, and Vendetta's three headline new mechanics are in the **[Empower](/guides/riftbound-empower-explained)**, **[Flow](/guides/riftbound-flow-explained)** and **[Burn](/guides/riftbound-burn-explained)** guides.`,
  },
  {
    slug: "riftbound-vendetta-overnumbers-explained",
    category: "guide",
    title: "Riftbound Vendetta Overnumbers Explained",
    excerpt:
      "What are Overnumbered and Rival Overnumber cards in Riftbound: Vendetta? A guide to the set's premium chase cards — the signed Legend variants and the 22 rivalry diptychs — and why collectors want them.",
    author: "RiftCompare",
    date: "2026-07-09",
    updated: "2026-07-31",
    readMins: 3,
    tags: ["vendetta", "overnumber", "collecting", "chase cards", "guide"],
    shop: [
      { label: "Vendetta singles on eBay", query: "Riftbound Vendetta" },
      { label: "Origins Overnumbered chase cards", query: "Riftbound Overnumbered" },
      { label: "Vendetta booster cases", query: "Riftbound Vendetta booster case" },
    ],
    // Every Overnumbered VEN printing (both the 9 signed Legends and the 22 Rival
    // reprints), straight from the DB — CardTile renders each one's full credentialed
    // name (e.g. "Nasus, Curator of the Sands (Overnumbered)"), so this is also the
    // internal link that ties a specific champion's name to "Overnumbered" for search.
    // Kept as `embeds` (not the singular `embed`) so the [[embed:0]] marker below can
    // place it mid-body, right after the two chase-tier sections it illustrates.
    embeds: [
      {
        title: "Every Overnumbered Vendetta card",
        note: "All 31 Overnumbered printings — the 9 signed Legends and the 22 Rival reprints — straight from our live database. Tap any card for its page and live prices.",
        chaseSet: "VEN",
        chaseTier: "overnumbered",
        take: 40,
      },
    ],
    body: `![Riftbound: Vendetta — out now](/vendetta-hero.png)

The most-searched collectibles in **[Riftbound: Vendetta](/sets/vendetta)** are its **Overnumbers** — the set's premium chase cards. Here's what they are, who has one, and why collectors want them.

## What is an Overnumbered card?

An **Overnumbered** card is a special printing whose collector number sits *above* the set's base numbering — a signal that it's a rarer, showcase-tier version of a card. In Vendetta, that's everything numbered **167 and up** (the set proper runs 1-166).

## The 9 signed Legend Overnumbers

Nine new champion **Legends** each get their own signed Overnumbered variant — a premium printing carrying an in-universe signature treatment, and the top-end pulls of the whole set:

- **[Akali, Rogue Assassin](/card/akali-rogue-assassin-ven-189s-166)**
- **[Renekton, Butcher of the Sands](/card/renekton-butcher-of-the-sands-ven-190s-166)**
- **[Zed, Master of Shadows](/card/zed-master-of-shadows-ven-191s-166)**
- **[Nasus, Curator of the Sands](/card/nasus-curator-of-the-sands-ven-192s-166)**
- **[Shen, Eye of Twilight](/card/shen-eye-of-twilight-ven-193s-166)**
- **[Jayce, Defender of Tomorrow](/card/jayce-defender-of-tomorrow-ven-194s-166)**
- **[Mel, Soul's Reflection](/card/mel-soul-s-reflection-ven-195s-166)**
- **[Ambessa, Matriarch of War](/card/ambessa-matriarch-of-war-ven-196s-166)**
- **[Kennen, Heart of the Tempest](/card/kennen-heart-of-the-tempest-ven-197s-166)**

## Rival Overnumbers — the rivalry diptychs

Vendetta's rivalries theme gets its own chase cycle: **22 Rival Overnumbers** — reprints of existing champion cards with a premium treatment. Each is half of a **diptych**, a pair designed to sit side by side, so a rivalry like **[Nasus](/card/nasus-guardian-of-knowledge-ven-178) vs [Renekton](/card/renekton-brute-ven-177)** or **[Shen](/card/shen-scourge-of-shadows-ven-170) vs [Zed](/card/zed-from-the-shadows-ven-169)** is displayed as a matched set. Collectors chase both halves to complete the pair, which is exactly what makes them desirable (and pricey).

[[embed:0]]

## Why collectors care

- **Scarcity:** Overnumbered and Rival printings appear far less often than base cards, so they command the highest prices in the set.
- **Display value:** the diptych design rewards owning and displaying the pair — a collecting hook base cards don't have.
- **Champion appeal:** the signed Legends are the marquee champions of the set, which concentrates demand.

## Buying them without overpaying

Premium chase cards spike hardest in the launch rush and vary a lot store to store. The moment Vendetta releases, RiftCompare compares every Overnumber's live price across 60+ stores in AU, the US and the UK — cheapest delivered first — on the **[Vendetta set page](/sets/vendetta)**. Watch the **[price movers](/movers)** too; the chase cards climb fastest at launch.

For the full picture of the set, read the **[complete card gallery](/blog/every-riftbound-vendetta-card-revealed)**. Vendetta released on 31 July 2026 — browse **[every card with live prices](/sets/vendetta)**.`,
  },
  {
    slug: "riftbound-vendetta-chase-cards-so-far",
    ebayPicks: { heading: "These chase cards on eBay right now" },
    category: "blog",
    title: "Riftbound Vendetta Chase Cards — Every Tier",
    excerpt:
      "Vendetta is out. Every chase-card tier — signed Legends, Rival Overnumbers, Showcases, alt-arts and Epic sleepers — with a live gallery and real prices.",
    author: "RiftCompare",
    date: "2026-07-10",
    updated: "2026-07-31",
    readMins: 6,
    tags: ["vendetta", "chase cards", "overnumber", "collecting", "prices"],
    shop: [
      { label: "Vendetta chase cards on eBay", query: "Riftbound Vendetta Overnumbered" },
      { label: "Vendetta signature cards", query: "Riftbound Vendetta signature" },
      { label: "Vendetta booster boxes", query: "Riftbound Vendetta booster box" },
    ],
    // Self-populating tier galleries: each [[embed:N]] marker in the body renders
    // the matching gallery of real, imported VEN printings — no card is ever named
    // or shown before it's really in the database.
    embeds: [
      {
        title: "Signature Legends",
        note: "Every '*'-numbered Signature printing in our database — tap any card for its page and live prices across every store we track.",
        chaseSet: "VEN",
        chaseTier: "signature",
        take: 24,
      },
      {
        title: "Overnumbered & special chases",
        note: "Every card numbered beyond the set total (or SP-numbered) that we've imported — tap a card for its live price comparison.",
        chaseSet: "VEN",
        chaseTier: "overnumbered",
        take: 24,
      },
      {
        title: "Vendetta promo cards",
        note: "Promo printings (prerelease, Nexus Night, organized play). This gallery grows as each promo is confirmed and imported.",
        chaseSet: "VEN",
        chaseTier: "promo",
        take: 24,
      },
      {
        title: "Alternate-art chases",
        note: "Every alt-art printing in our database, with live prices.",
        chaseSet: "VEN",
        chaseTier: "altart",
        take: 24,
      },
      {
        title: "Epic-rarity picks",
        note: "The in-set Epics — historically one or two of these become the sleeper chases of a set.",
        chaseSet: "VEN",
        chaseTier: "epic",
        take: 24,
      },
    ],
    body: `![Riftbound: Vendetta — out now](/vendetta-hero.png)

**Riftbound: Vendetta is out.** Singles are trading, stores are listing, and the set's **chase cards** — the premium pulls that drive box prices — now have real prices instead of predictions.

This post breaks the chase down **tier by tier**, from the rarest pull down. Every tier has a live gallery of the real printings we've imported: tap any card to open its page and see its price compared across every store we track, in your own market's currency.

> **Prices move fastest in the weeks right after a launch.** Before paying the first number you see, check the card's full comparison — and read **[why Riftbound prices change](/guides/why-riftbound-card-prices-change)** for what actually drives those moves.

## Tier 1: Signature Legends

The top of the pyramid. A **Signature** card carries a **"\\*" in its collector number** (like Spiritforged's 223\\*/221) and the **artist's stamped signature** on the art — the rarest, most contested pulls in any Riftbound set, and the cards that headline box openings.

Vendetta's Signature Legends cover the set's marquee champions, including **Akali, Zed, Shen, Mel, Jayce, Kennen and Renekton**. These are consistently the most expensive singles in the set by a wide margin.

[[embed:0]]

## Tier 2: Overnumbered chases

An **Overnumbered** card carries a collector number *beyond* the set's total — Vendetta is a 166-card set, so anything numbered **167/166 or higher** is printed at a much lower rate than the set proper. (New to Overnumbers? Read **[our full explainer](/guides/riftbound-vendetta-overnumbers-explained)**.)

The set includes champion Overnumbers for **Vi, Jinx, Jayce, Viktor, Rengar, Kha'Zix, Gangplank and Illaoi**, a run of Overnumbered spell and gear reprints with premium treatments, and **SP-numbered specials** like **Ahri, Inquisitive** that sit outside the main numbering entirely — plus the Overnumbered treatments for **Swain, Irelia, Ambessa, Mel, Kennen, Akali and Nasus**.

One demand note that still holds: **rival pairs with connecting artwork** get priced as a *pair* — the scarcer half sets the cost of completing the display piece.

[[embed:1]]

## Tier 3: Promo cards

**Promos** — prerelease stamps, Nexus Night packs and organized-play printings — are the wildcard tier: print runs are small, distribution is event-bound, and the best ones routinely outprice regular chase cards (Origins' OP promos are the precedent). The gallery below holds every Vendetta promo we've confirmed and imported, and grows as more are distributed through events.

[[embed:2]]

## Tier 4: Alternate-art chases

The broadest premium pool: **alt-art printings** of the set's champions and key spells, marked with a letter after the collector number (021a, 138a, …). Both faces of the Showdown Deck rivalry get one — **Zed, From the Shadows** and **Shen, Leader of the Kinkou Order** — alongside **Akali, Renekton, Nasus, Jayce, Mel, Kennen and Ambessa**.

Alt-arts are where art taste drives price more than playability: historically the champions with the biggest fanbases (and the cleanest full-art treatments) hold value even when the base card sees no play.

[[embed:3]]

## Tier 5: The Epic-rarity sleepers

The tier collectors overlook — and shouldn't. In **Origins** the pattern was set by **Kai'Sa**: an Epic that was both *strong in play* and *genuinely beautiful*, and it out-priced plenty of flashier pulls. The way to spot the Vendetta equivalent: an Epic champion that headlines a real deck **and** looks good enough that players want the exact copy they play with.

The champion Epics include **Akali, Deadly Weapon** and **Zed, From the Shadows** (the aggro headliners), **Shen, Leader of the Kinkou Order** (the Showdown Deck's other face), **Nasus, Ascended**, **Jayce, Brilliant Inventor**, **Mel, Newly Awakened** and **Ambessa, Respected and Feared**. If one of these defines the early meta, its base Epic print is the value pick against its alt-art.

[[embed:4]]

## Which chases are actually most expensive

Now that the set is out, you don't need anyone's prediction — you can just look:

- **[Vendetta set page](/sets/vendetta)** — every card in the set with live prices, sortable by value.
- **[Most valuable Riftbound cards](/guides/most-valuable-riftbound-cards)** — the top of the whole market, generated from live prices.
- **[Price movers](/movers)** — which chases are climbing or cooling right now.

What demand structure tells you, and what the data can confirm as it accumulates:

1. **Marquee-champion Signatures and Overnumbers** — Jinx, Vi and Akali have the broadest collector bases from League and Arcane.
2. **Completed Rival pairs** — connecting art means the market prices the *pair*, and the scarcer half sets the cost of completion.
3. **Showdown-deck rivals (Zed/Shen)** — the faces of the set's headline product tend to see outsized demand in every tier they appear in.
4. **The Kai'Sa-pattern Epic** — whichever Epic champion ends up both meta-defining and pretty.

## How to buy chase cards without overpaying

- **Compare before you buy.** The same chase card is often priced very differently between stores once postage is counted. Every card page ranks stores by **total delivered cost**, not sticker price.
- **Expect launch-window volatility.** The first weeks after release see the widest, fastest-moving prices a set will ever have — lots of product is being opened at once while the meta is still unsettled.
- **Check stock depth, not just price.** A low headline price at one shop with no stock elsewhere is a thinner market than it looks.
- **Watch instead of guessing.** Save a card to **[price watch](/browse)** and get told when it moves rather than refreshing manually.

See the full **[Vendetta card gallery](/blog/every-riftbound-vendetta-card-revealed)**, browse **[every card with live prices](/sets/vendetta)**.`,
  },
  {
    slug: "buy-riftbound-cards-europe",
    marketData: "EU",
    category: "blog",
    title: "Riftbound Card Prices Europe — Every EU Store, in EUR",
    excerpt:
      "Compare Riftbound singles across the eurozone stores that actually stock them — live EUR prices ranked by total delivered cost. Free, updated daily.",
    author: "RiftCompare",
    date: "2026-08-23",
    updated: "2026-08-24",
    readMins: 4,
    tags: ["europe", "spain", "buying guide", "price comparison", "riftbound singles", "eur"],
    hero: {
      src: "/blog/buy-riftbound-cards-europe.png",
      alt: "Riftbound card prices in Europe — eleven real eurozone stores compared, priced natively in EUR",
    },
    shop: [
      { label: "Riftbound singles on eBay", query: "Riftbound singles" },
      { label: "Vendetta booster boxes", query: "Riftbound Vendetta booster box" },
    ],
    body: `Buying **Riftbound cards in Europe** has an advantage no other market has, and most European players do not use it: the shop with the best price on your card does not have to be in your country.

## Why the EU is priced as one market, not twenty

The eurozone shares a currency **and** a customs union. A card listed at €4.20 by a shop in Rotterdam is €4.20 to a buyer in Madrid — no conversion, no import duty, no customs form. So "the cheapest listing in Europe" is a real, buyable number, in a way that "the cheapest listing in Germany" mostly was not: no single member state has enough Riftbound stores to make a proper comparison out of.

That is exactly why RiftCompare treats the whole eurozone as one market. Switch to **Europe (EU)** in the country selector and every price on the site is in EUR, sourced from stores that will actually ship to you.

## The stores we compare

Eleven, across six countries, all priced natively in euro:

- **🇦🇹 Austria:** Mana Market EU
- **🇪🇸 Spain:** Universe TCG, El Duelista
- **🇵🇹 Portugal:** End Turn
- **🇳🇱 Netherlands:** Lichcards
- **🇩🇪 Germany:** Trinket Mage, Battle Bear Saarbrücken, Nordic Legends
- **🇮🇹 Italy:** T-REX TCG, GS-GameOn, Timetwister Games

Every one of them stocks real Riftbound singles — hundreds of cards each, not a booster box and a playmat. The **[full tracked-store list](/stores/tracked)** has them all, and **eBay Spain** listings sit alongside them on each card page.

### Why eleven and not a hundred

Because eleven is how many there are. We swept 421 European shop domains for this, and most European card shops sell Riftbound **sealed product** — booster boxes, displays, champion decks — and no singles at all through their own website.

The reason is structural, and it is worth knowing if you are hunting a specific card: European singles trading is concentrated on **Cardmarket** and **CardTrader**, the big pan-European marketplaces, rather than on individual shop websites the way it is in the US. The eleven shops above are the ones running a full singles inventory on their own storefront.

We would rather list eleven shops that have your card than a hundred that do not.

## How to find the cheapest Riftbound single in Europe

1. **[Search the card database](/browse)** — every card shows its lowest live EUR price.
2. **Open the card** for the store-by-store breakdown, in stock and ranked by what you would actually pay delivered.
3. **Click straight through** to the exact listing and buy from the cheapest seller.

Buying a whole deck? The **[deck pricer](/deck)** takes a full list and works out the cheapest way to buy all of it across every store at once, consolidating orders so you are not paying postage five times.

## One honest caveat about shipping

Our delivered-cost ranking uses each store's **domestic** postage estimate. Inside your own country that is close to right. Buying across a border — Spain from the Netherlands — postage runs several times higher, even though the item price needs no conversion and clears no customs. So treat a cross-border result as "cheapest item price, check their postage", and use the shipping-policy link on the store's row for the real current rate. Nine of the eleven publish one.

We would rather tell you that than quietly show you a number that flatters us.

## A note on where this market came from

A Spanish shop wrote to us asking to be listed, and said the Spanish market was growing fast and worth covering. They were right, and this market is the result. We swept 421 eurozone shop domains looking for real singles inventory, in Spanish, German, Italian, Dutch and French — the eleven above are what actually clears the bar. Most European card shops sell sealed product only through their own site, and a good chunk of the rest run on shop platforms we cannot yet read prices from (PrestaShop, WooCommerce). That is a gap on our side, not a shortage of European shops, and it is the next thing we are fixing.

Run a European store selling Riftbound? **[Get listed free](/stores/suggest)** — free listing, more customers.

Shopping from **[Australia](/blog/buy-riftbound-cards-australia)**, **[the US](/blog/buy-riftbound-cards-us)**, **[the UK](/blog/buy-riftbound-cards-uk)**, **[Singapore](/blog/riftbound-price-comparison-singapore)** or **[Canada](/blog/buy-riftbound-cards-canada)**? We have a dedicated breakdown for those markets too — or see the **[full multi-market guide](/guides/where-to-buy-riftbound-cards)**.`,
  },
  {
    slug: "riftbound-price-comparison-singapore",
    marketData: "SG",
    category: "blog",
    title: "Riftbound Card Prices Singapore — 11 Stores",
    excerpt:
      "Compare Riftbound card prices across Singapore stores, eBay SG and TCGplayer — live SGD prices ranked by total delivered cost. Free, updated daily.",
    author: "RiftCompare",
    date: "2026-07-10",
    updated: "2026-07-10",
    readMins: 4,
    tags: ["singapore", "announcement", "price comparison", "riftbound singles", "sgd"],
    shop: [
      { label: "Riftbound singles on eBay", query: "Riftbound singles" },
      { label: "Vendetta booster boxes", query: "Riftbound Vendetta booster box" },
    ],
    body: `Singapore, welcome to the Rift. **RiftCompare — the Riftbound: League of Legends TCG price comparison — is now live in Singapore**, with every price in **Singapore dollars (SGD)** and updated daily.

Riftbound officially arrived in Southeast Asia this month, and Singapore's card shops are stocking up fast — which means the same card can be listed at very different prices depending on where you look. That's exactly the problem RiftCompare solves: search any card and see every store's live price side by side, ranked by what you'd actually pay.

## What you get in Singapore

- **Live SGD prices for every Riftbound card** — the full database, every set from Origins to the upcoming [Vendetta](/sets/vendetta), each card showing the cheapest live price in Singapore dollars.
- **11 Singapore stores tracked** — Hideout, Action Point Games, 1Collectibles TCG, Flagship Games, SC Collection, Mana Pro, OneMtg, Card Arena, Dueller's Point, Caesar Cards and Zoomies Gaming (see the full [stores we track](/stores/tracked) list). Stores without a webstore yet are listed and start showing prices the moment they sell online.
- **eBay Singapore** — every card is also checked against [ebay.com.sg] listings, so marketplace deals show up right next to local store prices.
- **TCGplayer reference pricing** — for cards no local store has in stock yet, we show TCGplayer's market price converted to SGD as an honest reference (clearly a reference, never pretending to be a local listing).
- **Everything else RiftCompare does** — [price history charts](/movers) on every card, the [sealed products comparison](/sealed), the [deck pricer](/deck) that prices a whole 40-card list in one click, and [price-drop alerts](/browse).

## How to buy Riftbound cards cheaper in Singapore

1. **[Search or browse the database](/browse)** — every card shows its lowest live SGD price.
2. **Open a card** to see the full store-by-store comparison, in stock and ranked by price.
3. **Click through and buy** from whichever store is cheapest — RiftCompare links straight to the exact listing.

The site auto-detects Singapore visitors, so prices load in SGD from your first visit — or pick 🇸🇬 Singapore from the country selector at the top any time.

## Perfect timing: Vendetta launches July 31

The new set, **[Riftbound: Vendetta](/sets/vendetta)**, releases **31 July 2026** — the first major set launch since Riftbound reached Southeast Asia. Every revealed card is already browsable, [chase cards are mapped tier by tier](/blog/riftbound-vendetta-chase-cards-so-far), and the moment Vendetta singles hit Singapore shelves their prices land here, compared across every store above.

If you run a Singapore card store and want your Riftbound listings compared (free listing, more customers), **[suggest your store](/stores/suggest)** — we're actively expanding local coverage as the SEA scene grows.

Happy hunting — and pay less for the cards you want. Start at the **[card database](/browse)** or jump straight to the **[Vendetta set page](/sets/vendetta)**.`,
  },
  {
    slug: "buy-riftbound-cards-australia",
    marketData: "AU",
    category: "blog",
    title: "Riftbound Card Prices Australia — 19 Stores",
    excerpt:
      "Compare Riftbound card prices across Australian stores — live AUD prices at 19 AU retailers plus eBay AU, ranked by total delivered cost. Free, updated daily.",
    author: "RiftCompare",
    date: "2026-07-10",
    updated: "2026-07-10",
    readMins: 4,
    tags: ["australia", "buying guide", "price comparison", "riftbound singles", "aud"],
    shop: [
      { label: "Riftbound singles on eBay", query: "Riftbound singles" },
      { label: "Vendetta booster boxes", query: "Riftbound Vendetta booster box" },
    ],
    body: `Looking to **buy Riftbound cards in Australia** without overpaying? The same single can differ by 30–50% between Australian stores once postage is counted — and with 19 local stores selling Riftbound singles, nobody has time to check them all. That's the whole point of RiftCompare.

## Why Australians use RiftCompare

- **Every AU store in one search.** We track live AUD prices at Cherry Collectables, Ozzie Collectables, The Final Boss Collectables, Plenty of Games, The Adventurers Guild, Mana Market, Steel City Games, Cardbot, Good Games (and Good Games Adelaide), Vault Games, Mint Collectables, The Card Hub Australia, PokéBox, Spellroo Gaming, Spindown, 88 Games Arena, Elemental Arcade and Fluke & Box — plus **eBay Australia** ([full list](/stores/tracked)).
- **Ranked by what you actually pay.** Australia is where postage decides the deal: a $1.50 card with $3.95 tracked shipping isn't cheap. Every comparison ranks stores by **total delivered cost**, with each store's free-shipping threshold factored in automatically.
- **Prices refresh daily** — and [price history charts](/movers) on every card show whether you're buying a spike or a dip.
- **Whole-deck pricing.** The [deck pricer](/deck) takes a full 40-card list and works out the cheapest way to buy it across every store, consolidating orders to dodge multiple postage charges.
- **100% free.** No account needed to compare.

## How to find the cheapest Riftbound card prices in Australia

1. **[Search the database](/browse)** — every card shows its lowest live AUD price.
2. **Open the card** for the full store-by-store table, in-stock and ranked by delivered cost.
3. **Click through and buy** — we link straight to the exact listing at the store.

## Vendetta is coming — July 31

**[Riftbound: Vendetta](/sets/vendetta)** releases 31 July 2026, and week-one prices always move fast. Every revealed card is already browsable, the [chase cards are mapped tier by tier](/blog/riftbound-vendetta-chase-cards-so-far), and launch-day prices land here compared across every store above. Set a [price watch](/browse) and we'll tell you when a card's price moves.

Run an Aussie store selling Riftbound? **[Get listed free](/stores/suggest)** — more visibility, more customers. Everyone else: start at the **[card database](/browse)** and pay less for your next pickup.

Buying from overseas, or curious about other markets? See **[the US](/blog/buy-riftbound-cards-us)**, **[the UK](/blog/buy-riftbound-cards-uk)**, or the **[full multi-market guide](/guides/where-to-buy-riftbound-cards)**.`,
  },
  {
    slug: "buy-riftbound-cards-us",
    marketData: "US",
    category: "blog",
    title: "Riftbound Card Prices USA — Stores & eBay",
    excerpt:
      "Compare Riftbound card prices across US stores, TCGplayer and eBay — live USD prices ranked by total delivered cost. Free, updated daily.",
    author: "RiftCompare",
    date: "2026-07-10",
    updated: "2026-07-10",
    readMins: 4,
    tags: ["united states", "buying guide", "price comparison", "riftbound singles", "tcgplayer"],
    shop: [
      { label: "Riftbound singles on eBay", query: "Riftbound singles" },
      { label: "Vendetta booster boxes", query: "Riftbound Vendetta booster box" },
    ],
    body: `If you **buy Riftbound cards in the US**, you already know the problem: TCGplayer says one price, eBay says another, and the local game store's webstore says a third. The US has the deepest Riftbound market in the world — which means the biggest spreads between sellers, and the most money left on the table if you only check one site.

## Why US players use RiftCompare

- **TCGplayer, eBay AND independent stores in one comparison.** We track live USD prices at 33 US stores — The Mythic Store, Danireon Cards & Games, Gear Gaming, Misty Mountain Games, Hobbiesville, NP Collectibles, The CG Realm, Bards & Cards, PunkOuter Games, GG Legends, The Booster Box, Cardboard and Die, Cape Fear Collectibles, Mystery MTG, OneStopTCG and more ([full list](/stores/tracked)) — alongside **TCGplayer's market price** and **eBay** listings, side by side.
- **The independents frequently beat TCGplayer.** Market price is an average, not a floor — our comparison regularly surfaces indie-store listings well under it on the exact same card.
- **Prices refresh daily**, with [price history](/movers) on every card so you can tell a real dip from a spike, plus [price movers](/movers) to catch cards climbing early.
- **Whole-deck pricing.** The [deck pricer](/deck) prices a complete list across every store at once and finds the cheapest combination of orders.
- **Free, no signup** to compare.

## How to find the cheapest Riftbound singles in the US

1. **[Search any card](/browse)** — the lowest live USD price shows instantly.
2. **Open the card** for the full comparison: every store, eBay and the TCGplayer market price, ranked by total cost including shipping.
3. **Click straight through** to the exact listing and buy from whoever's cheapest.

## Vendetta launches July 31 — don't pay the week-one tax

**[Riftbound: Vendetta](/sets/vendetta)** drops 31 July 2026. Chase-card prices move fastest in the weeks after release — the [chase-card tier breakdown](/blog/riftbound-vendetta-chase-cards-so-far) shows what to hunt, and every card's price is compared here across all of the above the moment singles list.

Run a US store selling Riftbound? **[Get listed free](/stores/suggest)**. Everyone else: start at the **[card database](/browse)** and stop paying the first price you see.

Shopping from **[Australia](/blog/buy-riftbound-cards-australia)** or **[the UK](/blog/buy-riftbound-cards-uk)**? We've got a dedicated breakdown for your market too — or see the **[full multi-market guide](/guides/where-to-buy-riftbound-cards)**.`,
  },
  {
    slug: "buy-riftbound-cards-uk",
    marketData: "UK",
    category: "blog",
    title: "Riftbound Card Prices UK — Compare 14 Stores & eBay",
    excerpt:
      "Compare Riftbound card prices across UK stores and eBay UK — live GBP prices ranked by total delivered cost. Free, updated daily.",
    author: "RiftCompare",
    date: "2026-07-10",
    updated: "2026-07-31",
    readMins: 4,
    tags: ["united kingdom", "buying guide", "price comparison", "riftbound singles", "gbp"],
    shop: [
      { label: "Riftbound singles on eBay", query: "Riftbound singles" },
      { label: "Vendetta booster boxes", query: "Riftbound Vendetta booster box" },
    ],
    body: `Want to **buy Riftbound cards in the UK** without importing at painful exchange rates — or overpaying locally? The UK Riftbound scene is growing fast, stock is patchier than in the US, and that's exactly when price comparison matters most: the store that has your card in stock isn't always the one charging a fair price for it.

## Why UK players use RiftCompare

- **14 UK stores plus eBay UK, one search.** We track live GBP prices at Total Cards, Axion Now, Card Goblin, Thistle Tavern, Spellbound Games, Forbidden Planet, Zatu Games, Boards & Swords, Goblin Gaming, The Card Vault, Gathering Games, Harlequins Games, Travelling Man and Monster Card Corner ([full list](/stores/tracked)) — with **eBay UK** listings right alongside.
- **Everything in pounds.** Prices display in GBP, ranked by **total delivered cost** including each store's postage and free-shipping threshold. When no UK shop stocks a card, we show TCGplayer's market price converted to GBP as an honest reference — clearly marked, never pretending to be a local listing.
- **Daily updates + [price history](/movers)** on every card, so you can see the trend before you commit.
- **Whole-deck pricing.** The [deck pricer](/deck) works out the cheapest way to buy an entire list across every UK store, consolidating postage.
- **Completely free.**

## How to find the cheapest Riftbound singles in the UK

1. **[Search the card database](/browse)** — every card shows its lowest live GBP price.
2. **Open the card** for the store-by-store breakdown, in-stock and ranked by what you'd actually pay delivered.
3. **Click through to the exact listing** and buy from the cheapest seller.

## Vendetta releases July 31 — UK presales are live

**[Riftbound: Vendetta](/sets/vendetta)** released on 31 July 2026 and UK stores are listing it now. Every revealed card is browsable now, the [chase cards are mapped tier by tier](/blog/riftbound-vendetta-chase-cards-so-far), and the moment Vendetta singles hit UK shelves their prices land here, compared across every store above.

Run a UK store selling Riftbound? **[Get listed free](/stores/suggest)** — free listing, more customers. Everyone else: start at the **[card database](/browse)** and keep more of your budget for the cards themselves.

Shopping from **[Australia](/blog/buy-riftbound-cards-australia)** or **[the US](/blog/buy-riftbound-cards-us)**? We've got a dedicated breakdown for your market too — or see the **[full multi-market guide](/guides/where-to-buy-riftbound-cards)**.`,
  },
  {
    slug: "buy-riftbound-cards-canada",
    marketData: "CA",
    category: "blog",
    title: "Riftbound Card Prices Canada — 20 Stores",
    excerpt:
      "Compare Riftbound card prices across Canadian stores — live CAD prices at 20 Canadian retailers, ranked by total delivered cost. Free, updated daily.",
    author: "RiftCompare",
    date: "2026-07-30",
    updated: "2026-07-30",
    readMins: 4,
    tags: ["canada", "buying guide", "price comparison", "riftbound singles", "cad"],
    shop: [
      { label: "Riftbound singles on eBay", query: "Riftbound singles" },
      { label: "Vendetta booster boxes", query: "Riftbound Vendetta booster box" },
    ],
    body: `Looking to buy Riftbound cards in Canada? With 20 Canadian stores now selling Riftbound singles — and prices that can swing 30-50% between them once shipping is counted — checking them all by hand isn't realistic. That's what RiftCompare does for you.

## Why Canadians use RiftCompare

- **20 Canadian stores in one search.** We track live CAD prices at The Trading Card Shop, Face to Face Games, 401 Games, GT Games, Invasion Inc, Obsidian Games, Enter the Battlefield, Black Knight Games, Bento Gaming, Jack's On Queen, Banana Games & Hobby, Always Games, Derpy Cards, Empire Trading, Toy Snowman, Esper Cards & Games, Red Riot Games, Level Up Games, Danireon Cards & Games and Hobbiesville ([full list](/stores/tracked)).
- **Ranked by what you actually pay.** Every comparison ranks stores by total delivered cost, with each store's free-shipping threshold factored in automatically.
- **Prices refresh daily** — and [price history charts](/movers) on every card show whether you're buying a spike or a dip.
- **Whole-deck pricing.** The [deck pricer](/deck) takes a full 40-card list and works out the cheapest way to buy it across every store, consolidating orders to dodge multiple shipping charges.
- **100% free.** No account needed to compare.

## How to find the cheapest Riftbound card prices in Canada

1. **[Search the database](/browse)** — every card shows its lowest live CAD price.
2. **Open the card** for the full store-by-store table, in stock and ranked by delivered cost.
3. **Click through and buy** — we link straight to the exact listing at the store.

## Vendetta is coming — July 31

[Riftbound: Vendetta](/sets/vendetta) releases 31 July 2026, and week-one prices always move fast. Every revealed card is already browsable, the [chase cards are mapped tier by tier](/blog/riftbound-vendetta-chase-cards-so-far), and launch-day prices land here compared across every Canadian store above. Set a price watch and we'll tell you when a card's price moves.

Run a Canadian store selling Riftbound? [Get listed free](/stores/suggest) — more visibility, more customers. Everyone else: start at the [card database](/browse) and pay less for your next pickup.

Shopping from [Australia](/blog/buy-riftbound-cards-australia), [the US](/blog/buy-riftbound-cards-us), [the UK](/blog/buy-riftbound-cards-uk) or [Singapore](/blog/riftbound-price-comparison-singapore)? We've got a dedicated breakdown for those markets too — or see the [full multi-market guide](/guides/where-to-buy-riftbound-cards).`,
  },
  {
    slug: "riftcompare-launches-in-the-eu",
    marketData: "EU",
    category: "blog",
    title: "RiftCompare Is Now Live in the EU",
    excerpt:
      "RiftCompare's sixth market is here: the eurozone, priced natively in EUR from eleven real EU stores — not a UK conversion. What changed and why.",
    author: "RiftCompare",
    date: "2026-08-24",
    updated: "2026-08-24",
    readMins: 6,
    tags: ["europe", "announcement", "news", "eur", "price comparison"],
    hero: {
      src: "/blog/riftcompare-launches-in-the-eu.png",
      alt: "RiftCompare is now live in the EU — the sixth priced market, eleven real eurozone stores, priced natively in EUR",
    },
    summary: [
      "**RiftCompare now prices the eurozone as its own market** — EUR, sourced from eleven real EU stores, not a converted UK price.",
      "**Before this, an EU visitor saw a UK price with a currency label swapped** — same GBP stores, same GBP-shaped postage, just relabelled in EUR. That's gone.",
      "**The eurozone is priced as ONE market, not per country**, because it shares both a currency and a customs union — a genuinely buyable price across borders in a way a single-country market couldn't be.",
      "It exists because **a Spanish store asked us to cover their market** — see [where to buy in the EU](/blog/buy-riftbound-cards-europe) for the full store list and how to use it.",
    ],
    shop: [
      { label: "Riftbound singles on eBay", query: "Riftbound singles" },
      { label: "Vendetta booster boxes", query: "Riftbound Vendetta booster box" },
    ],
    body: `**RiftCompare now has a real EU market.** Switch the country selector to **Europe (EU)** and every price is EUR, sourced from real eurozone stores — not a UK price with a currency symbol swapped, which is what an EU visitor saw here until now.

## What actually changed

Before today, an EU shopper landed on RiftCompare and got routed to the **UK market**: real UK stores, real GBP stock — just displayed to you in EUR at a rough conversion rate, because it was the closest currency and postage match RiftCompare had. That number was honest about being a conversion, but it was still, structurally, someone else's market wearing your currency.

As of this market, that's gone for eurozone visitors. **Europe (EU) is now its own priced market**, the sixth alongside Australia, the US, the UK, Singapore and Canada — with its own real store inventory, its own EUR prices, and no conversion step in between.

| | Before | Now |
| --- | --- | --- |
| Currency shown | EUR (display only) | EUR (native) |
| Stores priced | UK stores (GBP inventory) | 11 real eurozone stores |
| What "cheapest" meant | Cheapest in the UK, relabelled | Cheapest actually in the eurozone |
| Cross-border buying | N/A — it was one country's stock | Real — same currency, same customs union |

## Why the whole eurozone is one market, not one per country

This is the part worth understanding, because it's not how any of RiftCompare's other markets work. Every other market on the site is one country. The EU is roughly twenty.

We tried the single-country version first: **Germany, added and removed on the same day** in August. Not because German stores don't exist — because one country's worth of them wasn't enough to build a real price comparison out of. A market with three or four stores in it isn't a comparison, it's a coincidence.

The eurozone fixes that structurally, not by trying harder to find German stores, but by asking a different question. Eurozone countries share a **currency** and a **customs union**. A store in Rotterdam selling at €4.20 is €4.20 to a buyer in Madrid — no conversion, no import duty, no customs form. That means "the cheapest EUR listing anywhere in the eurozone" is a genuinely buyable number, in a way "the cheapest listing in one specific country" mostly wasn't. Pool the stores across the whole currency union and you get a market deep enough to actually compare — eleven real stores, across six countries, rather than three in one.

## The honest version of "eleven stores"

We didn't stop at eleven because eleven was easy. We swept **421 eurozone shop domains** — Spanish, German, Italian, Dutch, French and English searches — for anything selling Riftbound. Most of what we found sells **sealed product only**: booster boxes, displays, champion decks, no singles through their own site at all. Eleven is what's left once you filter for stores that actually run a real singles inventory on their own storefront, confirmed on a live probe.

That number will grow — we're actively working through stores running on platforms (WooCommerce, PrestaShop) our importer doesn't read yet, which is most of what's left. It won't come from lowering the bar.

## Why this shipped now

A Spanish card store wrote to us directly, asking to be listed and pointing out that the Spanish Riftbound scene was growing fast. They were right, and pulling that thread — "how many EU stores actually sell singles" — is what turned into this market. If you run a European store and want to be part of the comparison, **[the listing form is free](/stores/suggest)**.

## What this doesn't cover yet — and won't pretend to

The biggest source of real Riftbound singles trading in Europe isn't any of the eleven stores above — it's **Cardmarket** and **CardTrader**, the two pan-European marketplaces most European collectors already use. RiftCompare doesn't price those yet. Cardmarket's terms require their written permission before their price data can be shown elsewhere, and we're not going to quietly work around that — so it's off until that permission is in place, not hidden behind a flag hoping nobody notices. When it lands, we'll say so here.

## Try it

Set the country selector to **🇪🇺 Europe (EU)**, or if you're browsing from inside the eurozone it should already have picked it up automatically. **[See the full store-by-store EU buying guide](/blog/buy-riftbound-cards-europe)** for exactly which eleven stores, what they carry, and the one honest caveat about cross-border shipping. Or just **[search any card](/browse)** and see the EUR price for yourself.

Buying from outside the eurozone? RiftCompare also covers **[Australia](/blog/buy-riftbound-cards-australia)**, **[the US](/blog/buy-riftbound-cards-us)**, **[the UK](/blog/buy-riftbound-cards-uk)**, **[Singapore](/blog/riftbound-price-comparison-singapore)** and **[Canada](/blog/buy-riftbound-cards-canada)** — or see the **[full multi-market guide](/guides/where-to-buy-riftbound-cards)**.`,
    faq: [
      { q: "Does RiftCompare support the EU?", a: "Yes — the eurozone is RiftCompare's sixth priced market, added alongside Australia, the US, the UK, Singapore and Canada. Prices are in EUR, sourced from eleven real eurozone stores across Austria, Spain, Portugal, the Netherlands, Germany and Italy." },
      { q: "Is the EU price just a currency conversion?", a: "No, not anymore. Before this market existed, EU visitors saw UK store prices (GBP) converted and displayed in EUR. The EU is now its own market with its own real store inventory priced natively in EUR — no conversion step." },
      { q: "Why is the EU one market instead of one per country?", a: "The eurozone shares a currency and a customs union, so a price in one member state is a real, buyable number to a shopper in another — no conversion, no import duty. That let us pool stores across the whole eurozone into one comparison deep enough to be useful, rather than splitting them into single-country markets too thin to compare." },
      { q: "Does RiftCompare show Cardmarket prices?", a: "Not yet. Cardmarket's terms require their written permission before their price data can be redisplayed elsewhere, and RiftCompare doesn't have that yet, so it isn't shown. The eleven stores currently tracked run their own independent storefronts." },
      { q: "How many EU stores does RiftCompare track?", a: "Eleven, across six countries — three in Germany, three in Italy, two in Spain, and one each in Austria, Portugal and the Netherlands — after sweeping 421 eurozone shop domains for stores that carry a real singles inventory, not just sealed product." },
    ],
  },
  {
    slug: "best-riftbound-price-comparison-sites",
    category: "blog",
    title: "Best Riftbound Price Comparison Sites, Ranked",
    excerpt:
      "TCGplayer, Cardmarket, Bilgewater Market and more — every real Riftbound price site compared on coverage, delivered cost, and live vs. reference pricing.",
    author: "RiftCompare",
    date: "2026-08-24",
    updated: "2026-08-24",
    readMins: 13,
    tags: ["price comparison", "comparison", "tcgplayer", "cardmarket", "best sites", "tools", "buying guide"],
    hero: {
      src: "/blog/best-riftbound-price-comparison-sites.png",
      alt: "Best Riftbound price comparison sites ranked — 10 sites scored on 5 criteria, RiftCompare #1",
    },
    summary: [
      "**RiftCompare ranks #1** on the criteria that actually decide where you should buy: independent-store coverage across six real markets, delivered cost (not sticker price), and exact-printing matching. We explain exactly why below, scored against nine other real, named sites — not a strawman.",
      "**The insight most of these sites won't tell you:** several of the biggest names in Riftbound price tracking — Magical Meta, Riftbound Stats, and TCGplayer's own market price — are reading the SAME underlying number. Check three different \"price trackers\" and you can see one figure three times, not three independent opinions.",
      "**Marketplaces (TCGplayer, Cardmarket, eBay) show you THEIR sellers' prices**, not the market's. That's a completely different question from \"who's cheapest right now, everywhere, delivered to me\" — which is the one this list is actually built to answer.",
      "This is our own tool, so read the ranking with that in mind — every claim below is checkable in a couple of minutes. **[Run a card you already know the price of](/browse)** and see for yourself.",
    ],
    itemList: {
      name: "Best Riftbound price comparison sites, ranked",
      items: [
        { name: "RiftCompare", description: "Live prices from independent stores across 6 real markets, ranked by delivered cost, matched by exact printing.", url: "/browse" },
        { name: "TCGplayer", description: "The largest US Riftbound marketplace and the reference price most other trackers actually re-display.", url: "https://www.tcgplayer.com/categories/trading-and-collectible-card-games/riftbound-league-of-legends-trading-card-game" },
        { name: "Cardmarket", description: "Europe's dominant TCG marketplace, VAT-inclusive pricing across the eurozone.", url: "https://www.cardmarket.com" },
        { name: "TCGCompare", description: "A multi-TCG comparison app covering 1,000+ stores, with a dedicated Riftbound section geared toward sealed product.", url: "https://www.tcgcompare.com/riftbound" },
        { name: "Bilgewater Market", description: "A Riftbound-dedicated price database with CN/EN dual-market tracking and a peer-to-peer trade board.", url: "https://bilgewatermarket.com" },
        { name: "eBay", description: "The largest global marketplace for Riftbound singles and sealed, with no dedicated price-comparison tooling of its own.", url: "https://www.ebay.com" },
        { name: "TCG Snoop", description: "A multi-TCG comparison engine covering 30+ Australian stores — real, but single-market and not Riftbound-specific.", url: "https://www.tcgsnoop.com.au" },
        { name: "Magical Meta", description: "A deck builder and tier-list site with a Riftbound price tracker built on TCGplayer's market price.", url: "https://magicalmeta.ink/riftbound" },
        { name: "Riftbound Stats", description: "A competitive decklist and meta database with a daily TCGplayer-based price tracker attached.", url: "https://www.riftboundstats.com" },
        { name: "PriceCharting", description: "A historical and graded-card price guide built from past eBay sales — useful for collectors, not for finding today's cheapest listing.", url: "https://www.pricecharting.com/console/riftbound-origins" },
      ],
    },
    shop: [
      { label: "Riftbound singles on eBay", query: "Riftbound singles" },
      { label: "Vendetta booster boxes", query: "Riftbound Vendetta booster box" },
    ],
    body: `Search "Riftbound price comparison" or the name of pretty much any of these sites and you'll find a handful of genuinely different tools that all sound like they answer the same question. They don't. Some show you a marketplace's own listings. Some show you a reference price copied from somewhere else. Only a few actually compare independent stores against each other and tell you what you'd really pay, delivered.

We ranked ten real sites — by name, on stated criteria — against the one question that actually matters when you're about to spend money: **if I search for this exact card right now, which of these tells me the truth about who's cheapest?**

## How we scored these

Five criteria, all checkable in a couple of minutes on any of these sites:

1. **Independent-store coverage** — does it compare prices across multiple separate stores, or show one marketplace's own sellers?
2. **Delivered cost** — does the ranking include shipping, or just the sticker price?
3. **Live vs. reference pricing** — is the number a real in-stock listing, or a market-price estimate pulled from somewhere else?
4. **Exact-printing precision** — does it distinguish Signature, Overnumbered, Showcase and alt-art printings, or lump "a copy of this card" together?
5. **Market breadth** — how many countries/currencies does it actually price natively, versus converting or defaulting to one?

## The ranking

### 1. RiftCompare

**[RiftCompare](/browse)** compares live prices from **independent stores across six real markets** — Australia, the US, the UK, Singapore, Canada and the EU — each priced natively in its own currency, plus eBay and TCGplayer reference pricing where a market has thin local coverage. Every comparison ranks by **total delivered cost** (price plus shipping, with free-shipping thresholds factored in automatically), and every match is by **exact printing** — a Signature or Overnumbered chase card is never confused with the base print.

That combination — independent stores, delivered cost, exact printing, six real markets — is the actual gap every other name on this list has in at least one place. None of them clear all five criteria at once. It's also completely free, with no signup required to compare, and it's the only one on this list that adds a deal finder, a value screener, a whole-deck pricer (Best Basket), price-drop alerts and a weekly price-movers digest on top of the comparison itself.

### 2. TCGplayer

TCGplayer is the largest dedicated Riftbound marketplace and the industry-standard US reference price — genuinely the biggest, deepest Riftbound inventory that exists in one place, and several of the other tools on this list (see #8 and #9) build their entire price tracker on top of TCGplayer's number rather than sourcing their own. That's the catch: TCGplayer's price is **its own marketplace's listings**, not a comparison across other stores, and its "market price" is often a rolling average rather than a specific in-stock item you can click and buy right now. It's US-centric — genuinely useful internationally, but not natively priced in every other currency RiftCompare's six markets are, the way a real local market is.

### 3. Cardmarket

Cardmarket is Europe's dominant TCG marketplace, VAT-inclusive and deep in exactly the region RiftCompare's own EU coverage is newest and thinnest (see our [honest EU store list](/blog/buy-riftbound-cards-europe) — eleven independent stores, not a hundred). Like TCGplayer, it's a marketplace showing **its own sellers**, not a cross-store comparison — you're seeing Cardmarket listings, not Cardmarket-versus-everyone-else. If most of your buying is in the eurozone and you're comfortable with a marketplace model, it's a genuinely strong option; it just answers a different question than "who's cheapest across every store that ships to me."

### 4. TCGCompare

TCGCompare is a real multi-TCG comparison app with a dedicated Riftbound section, publicly claiming coverage of 1,000+ stores and price alerts across the US, UK, Canada and Europe — genuinely the broadest raw store count on this list. Its public-facing content leans heavily toward **sealed product** (booster boxes, starter decks) rather than singles-level comparison, and we couldn't confirm it applies the same exact-printing precision or delivered-cost ranking to individual card listings that it does to sealed product. If you're comparing box prices across a huge net of stores, it's worth checking; for a specific single's exact printing, verify what you're actually being shown.

### 5. Bilgewater Market

Bilgewater Market is the most genuinely Riftbound-native name on this list — a dedicated Riftbound price database with a real, differentiated feature nobody else here has: **dual CN/EN market tracking** and a **peer-to-peer trade board** spanning 17 currencies across a long list of regions. If you're trading directly with other collectors, especially across the English/Chinese print divide, it's a real, useful tool with no equivalent on this list. What it isn't is a live multi-store comparison engine — its core price is a market reference plus classifieds-style buy/sell listings, not a ranked, delivered-cost comparison across many independent storefronts.

### 6. eBay

eBay is the largest global marketplace touching Riftbound, and its sheer reach means a genuinely cheap listing does turn up there — but it has no Riftbound-specific tooling at all. No printing-precision matching, no delivered-cost ranking, no market-specific pricing beyond whichever eBay domain you happen to be on. It's a source RiftCompare itself pulls into its own comparison rather than a comparison tool in its own right.

### 7. TCG Snoop

TCG Snoop is a real, solid multi-TCG price comparison engine — Magic, Pokémon, Yu-Gi-Oh, Lorcana, One Piece and Riftbound — across 30+ Australian stores. It does the actual job (independent-store comparison) well for the one market it covers. The gap is scope: it's Australia-only, and Riftbound is one of several games it tracks rather than the thing it's built around, so depth on Riftbound specifically — chase-printing precision, set-by-set tooling — isn't its focus the way it is for a Riftbound-dedicated tool.

### 8. Magical Meta

Magical Meta is primarily a deck builder and meta/tier-list site, with a Riftbound price tracker attached that runs on **TCGplayer's market price** — hourly refreshed, but the same underlying US number as TCGplayer itself, not an independent read. Its deck builder, set explorer and sealed-product tracker are genuinely useful tools for building and pricing a list; for finding the cheapest place to actually buy a card, you're seeing TCGplayer's number with a different layout around it.

### 9. Riftbound Stats

Riftbound Stats markets itself around competitive data — 12,000+ decklists across 90+ events — with a price tracker layered on top, again sourced from **daily TCGplayer updates** rather than an independent multi-store read. For meta analysis and tournament data it's a strong, dedicated resource; for pricing, it's the same TCGplayer reference number showing up a third time on this list.

### 10. PriceCharting

PriceCharting is a historical and graded-card price guide, built from **past eBay sales** rather than live current listings. It's genuinely useful for a different job entirely — "what has this graded card actually sold for over time" — which none of the other nine tools on this list answer well. It is not the right tool for "who has this in stock and what would I pay right now," which is the question everything else on this list is trying to answer.

## The ranking at a glance

| Site | Independent stores | Delivered cost | Live pricing | Exact printing | Markets |
| --- | --- | --- | --- | --- | --- |
| **RiftCompare** | ✓ | ✓ | ✓ | ✓ | AU, US, UK, SG, CA, EU |
| TCGplayer | — (own listings) | — | Mostly | Partial | US-centric |
| Cardmarket | — (own listings) | — | ✓ | Partial | EU-centric |
| TCGCompare | ✓ (sealed-focused) | Unconfirmed | ✓ | Unconfirmed | US, UK, CA, EU |
| Bilgewater Market | — (reference + trade board) | — | Reference | — | CN, EN |
| eBay | — (own listings) | — | ✓ | — | Global, unranked |
| TCG Snoop | ✓ | Unconfirmed | ✓ | Unconfirmed | AU only |
| Magical Meta | — (TCGplayer-sourced) | — | Mostly | — | US-centric |
| Riftbound Stats | — (TCGplayer-sourced) | — | Mostly | — | US-centric |
| PriceCharting | — (historical) | — | Historical | Partial | Global, unranked |

## Why RiftCompare actually wins this

Strip away the branding and every name on this list falls into one of three buckets: a **marketplace** showing you its own sellers (TCGplayer, Cardmarket, eBay), a **reference-price re-display** built on top of one of those marketplaces (Magical Meta, Riftbound Stats, and PriceCharting for historical sales), or a genuine **comparison tool** that's either narrower in scope (TCG Snoop, one market) or a different kind of tool entirely (Bilgewater Market's trade board, TCGCompare's sealed-product focus).

RiftCompare is built to answer one specific, narrow question as well as it possibly can: **for this exact card, in my market, right now, who's actually cheapest once shipping is counted — and is that a real listing I can click and buy?** Every other tool on this list answers something adjacent to that. None of them answer that exact question across six real markets with delivered-cost ranking and exact-printing precision. That's not a marketing claim — it's the gap in the table above.

## See it for yourself

The fastest way to judge any of this is to pick a card you already know the price of and check it. **[Search the card database](/browse)** — free, no signup — or if you buy or sell regularly, **[Deal Finder](/tools/deal-finder)** surfaces the gaps between all of the above automatically instead of making you check each one by hand.

## FAQ

**Is RiftCompare better than TCGplayer for Riftbound prices?** For finding the cheapest place to buy right now, yes — RiftCompare compares TCGplayer's own listings against independent stores and eBay in your market, ranked by delivered cost, rather than showing only TCGplayer's own inventory. TCGplayer itself remains the deepest single marketplace and the reference price much of the rest of the industry is built on.

**Does Cardmarket list Riftbound cards?** Cardmarket is a general TCG marketplace and Europe's largest, so Riftbound listings do appear there as the game grows. RiftCompare doesn't currently show Cardmarket's prices — their terms require written permission before their price data can be redisplayed elsewhere, and that permission isn't in place yet.

**What is Bilgewater Market?** A Riftbound-dedicated price database and trade board, tracking both English and Chinese-market prices with a peer-to-peer buy/sell board across many currencies. It's a genuinely different tool from RiftCompare — closer to a reference price plus classifieds than a live multi-store comparison.

**Is TCG Snoop good for Riftbound?** It's a real, solid multi-TCG comparison engine for the Australian market specifically, covering 30+ AU stores across several card games including Riftbound. It doesn't cover other countries, and Riftbound is one of several games it tracks rather than its focus.

**Why do so many Riftbound price trackers show the same number?** Because several of them — including Magical Meta and Riftbound Stats — build their price tracker directly on top of TCGplayer's market price rather than an independent read of the market. Checking three of those tools back to back can show the same figure three times, not three independent opinions.

**Is RiftCompare free to use?** Yes, entirely. The card database, price comparison, price-drop alerts and the weekly price-movers digest are free with no account needed. Premium adds the full deal-finder and value-finder lists on top of the free single-best-pick view.`,
  },
  {
    slug: "every-riftbound-vendetta-card-revealed",
    ebayPicks: { heading: "Vendetta chase cards on eBay right now" },
    category: "blog",
    title: "Riftbound Vendetta Card List: All 166 Cards",
    excerpt:
      "The complete Riftbound Vendetta card list and gallery — all 166 main-set cards plus Showcase alt-arts, Overnumbers and promos, with live prices.",
    author: "RiftCompare",
    date: "2026-07-10",
    updated: "2026-08-19",
    readMins: 3,
    tags: ["vendetta", "spoilers", "card gallery", "card list", "news"],
    faq: [
      {
        q: "How many cards are in Riftbound Vendetta?",
        a: "166 main-set cards, officially confirmed and all revealed. That's the base count — the set also has alternate-art Showcase printings, Overnumbered chase cards (numbered beyond 166), SP-numbered specials, a rune cycle and Nexus Night promos on top of the 166.",
      },
      {
        q: "When did Riftbound Vendetta release?",
        a: "31 July 2026. It was the third mainline Riftbound set, following Origins and Spirit Forged, and introduced three new mechanics: Empower, Flow and Burn.",
      },
      {
        q: "Where can I see every Vendetta card in one place?",
        a: "The gallery embedded in this article, or the full sortable Vendetta set page — both pull live from our database and show launch-day and current prices across every store we track.",
      },
      {
        q: "What are Vendetta's new mechanics?",
        a: "Empower (a card gains a new ability once it's in play), Flow (play a card straight from your trash instead of your hand), and Burn (send cards to your trash to fuel Flow). Each has its own explainer guide linked below.",
      },
    ],
    shop: [
      { label: "Vendetta booster boxes", query: "Riftbound Vendetta booster box" },
      { label: "Vendetta singles on eBay", query: "Riftbound Vendetta" },
    ],
    // The full set gallery — every non-promo VEN card in the database, in collector
    // order. Self-populating: new official reveals appear here automatically.
    embeds: [
      {
        title: "All 166 Vendetta cards — complete",
        note: "Every officially confirmed card, straight from our live database — filter by domain, rarity or type. Tap any card for its page, rules text and live prices across every store we track.",
        setAll: "VEN",
        filterable: true,
        take: 400,
      },
    ],
    body: `This is the **complete Riftbound Vendetta card list and gallery** — all 166 main-set cards, officially confirmed, embedded live from our database in collector-number order. Vendetta released **31 July 2026** and this is the complete base set.

The set runs **166 main-set cards** plus alternate-art Showcase printings, Overnumbered chase cards (numbered beyond 166), SP-numbered specials, runes and tokens. The mechanics are new too — read up on **[Empower](/guides/riftbound-empower-explained)**, **[Flow](/guides/riftbound-flow-explained)** and **[Burn](/guides/riftbound-burn-explained)** while you browse.

Tap any card below to open its full page: rules text, printings, price history, and live store prices — compared across every store we track in Australia, the US, the UK, Singapore, Canada and the EU.

[[embed:0]]

## Keep going

- **[Chase cards, tier by tier](/blog/riftbound-vendetta-chase-cards-so-far)** — Overnumbers, alt-arts and the sleeper Epics worth hunting.
- **[Vendetta card gallery](/sets/vendetta/gallery)** — every card on one page, filterable, with live prices.
- **[Vendetta set page](/sets/vendetta)** — the full sortable card list with live prices at release.
- **[Radiance release date](/release-dates)** — Set 5 lands 23 October 2026.
- **[Nexus Night promo cards](/blog/riftbound-vendetta-nexus-night-promo-cards)** — every promo confirmed for Vendetta's season, tracked as they're revealed.`,
  },
  {
    slug: "riftbound-pre-rift-rules-explained",
    category: "guide",
    title: "Riftbound Pre-Rift Rules Explained",
    excerpt:
      "Pre-Rift events let you crack open a new Riftbound set and build a deck before street date — but the deck-building rules are different from Constructed. Here's exactly how Sealed works: deck size, copy limits and domain rules.",
    author: "RiftCompare",
    date: "2026-07-26",
    updated: "2026-07-31",
    readMins: 4,
    tags: ["rules", "pre-rift", "sealed", "vendetta", "guide"],
    browseCta: {
      href: "/sets/vendetta",
      label: "See every Vendetta card's price →",
      blurb: "All 166 confirmed cards, ranked by the cheapest live price across every store we track.",
    },
    body: `Pre-Rift events are your first chance to crack open a brand-new Riftbound set and build a deck with it — before the set is even on shelves. Riftbound: Vendetta's Pre-Rift window ran 24–31 July 2026, the week before the set's 31 July street date. But the deck you build at a Pre-Rift plays by different rules than a normal Constructed deck — here's exactly how.

## Pre-Rift is a Sealed event, not Constructed

At a Pre-Rift, you don't bring your own deck. The store hands you sealed product — booster packs — and you build your deck from whatever you open, on the spot. You can't add cards from your own collection; the entire deck comes from what's in front of you.

That single rule changes everything else about deck-building for the event.

## The Sealed deck-building rules

- **Minimum deck size: 25 cards** (not the higher Constructed minimum) — though nothing stops you running more if you opened enough playables.
- **No 3-copy limit.** Constructed decks cap most cards at 3 copies; Sealed removes that cap entirely. If you crack four copies of the same card, you can run all four.
- **Up to 3 domains.** Sealed decks can draw from three domains of cards and Runes — one more than a typical two-domain Constructed build, to make room for whatever you happen to open.
- **A Legend or Signature card covers two domains.** If you open and run one, it counts toward two of your three domain slots, freeing up your card pool.

## Why this is worth knowing before you go

Pre-Rift decks reward flexibility over a tuned gameplan — you're building around what you open, not what you planned. Go in with an open mind about domain pairings rather than expecting to force a specific Constructed archetype; the format is designed to make every pod's packs playable, not to reward hoarding one domain.

If you're gearing up for a set's own Pre-Rift week, our **[Vendetta card database](/sets/vendetta)** has live prices on every confirmed card the moment it's buyable.

## Common questions

**Is Pre-Rift the same as the official release?** No — Pre-Rift is an early, in-store-only Sealed event the week before a set's street date. The set isn't generally available at retail until the official release date.

**Can I use cards from my own collection at a Pre-Rift?** No — Sealed decks are built entirely from the packs you open at the event itself.

**Is there a maximum deck size?** The rules set a *minimum* (25 cards); you can play more if you have enough playables, though most Sealed pools land close to the minimum.

**Where do these rules come from?** Riot's own [Pre-Rift guide](https://riftbound.gg/vendetta-pre-rift/) and [Rules Hub](https://playriftbound.com/en-us/rules-hub/) — check there for the full, current wording before an event, since organized-play rules can be updated between sets.`,
  },
  {
    slug: "riftbound-2026-regional-qualifier-los-angeles",
    category: "blog",
    title: "Riftbound Regional Qualifier: Los Angeles",
    excerpt:
      "The final Riftbound Regional Qualifier of 2026 lands at the LA Convention Center, Sept 25–27 — venue, tickets, requirements and exclusive promos.",
    author: "RiftCompare",
    date: "2026-07-26",
    updated: "2026-07-26",
    readMins: 3,
    tags: ["news", "esports", "tournament", "regional qualifier", "los angeles"],
    browseCta: {
      href: "/sets/vendetta",
      label: "See every Vendetta card's price →",
      blurb: "Track Vendetta prices now — regional-exclusive promos usually surface online in the weeks after an event.",
    },
    body: `Riftbound's competitive scene has its next big stop: the **Riftbound Regional Qualifier: Los Angeles**, running **September 25–27, 2026** at the **Los Angeles Convention Center**. It's the final Regional Qualifier of the year, run by UVS Games, and tickets are on sale now via Eventbrite.

## The details

- **Dates:** Friday 25 – Sunday 27 September 2026, 12pm–6pm each day
- **Venue:** Los Angeles Convention Center, Los Angeles, CA
- **Organizer:** UVS Games
- **Tickets:** via [Eventbrite](https://www.eventbrite.com/e/riftbound-regional-qualifier-los-angeles-tickets-1992778924407) — Competitor and Premium Competitor badge tiers are available, each with different tournament access and perks
- **Requirement:** a valid Riot Account is required to participate in Riftbound Organized Play

## What Premium badge holders get

Regional Qualifier weekends usually come with exclusive, event-only promos, and LA is no exception — Premium Competitor badges reportedly include an exclusive **Crystal Rose Sona, Harmonious playmat**, plus a **Jayce, Brilliant Inventor** promo stamped with a Vendetta Gold treatment. If chase promos like this are your thing, badge tier matters — check the Eventbrite listing for the exact current perks before you buy, since organized-play promos can be adjusted close to the event.

## Should you go if you're not competing?

Regional Qualifiers are also where a lot of early Vendetta singles and promos change hands in person, well before some of that supply reaches online stores. If you're chasing a specific **[Crystal Rose card](/guides/riftbound-vendetta-crystal-rose-cards)** or an event-exclusive promo, keep an eye on our Vendetta prices in the weeks after — that's usually when regional-exclusive prints start showing up for sale online and we start tracking them.

## Common questions

**Do I need a Riot Account to compete?** Yes — a valid Riot Account is required for all Riftbound Organized Play, including Regional Qualifiers.

**Is this the last Regional Qualifier of 2026?** Based on current event listings, yes — Los Angeles is the final stop of the year's Regional Qualifier circuit.

**Where do I buy tickets?** Through [Eventbrite](https://www.eventbrite.com/e/riftbound-regional-qualifier-los-angeles-tickets-1992778924407) — badge tiers determine what tournament access and event perks you get.

*Event details are from UVS Games' and the venue's own listings — always confirm current dates, badge tiers and requirements on [Eventbrite](https://www.eventbrite.com/e/riftbound-regional-qualifier-los-angeles-tickets-1992778924407) before you book travel.*`,
  },
  {
    slug: "riftbound-vendetta-crystal-rose-cards",
    category: "guide",
    title: "Riftbound Vendetta's Crystal Rose Cards",
    excerpt:
      "Vendetta's Crystal Rose line brings six Wild Rift skins to physical cards for the first time — Kai'Sa, Sona, Ahri, Sett, Ezreal and Lux. Here's every card, what makes them different from a normal alt-art, and live prices across every store we track.",
    author: "RiftCompare",
    date: "2026-07-26",
    updated: "2026-07-26",
    readMins: 4,
    tags: ["vendetta", "crystal rose", "alt art", "collecting", "chase cards"],
    shop: [{ label: "Crystal Rose cards on eBay", query: "Riftbound Crystal Rose" }],
    browseCta: {
      href: "/sets/vendetta",
      label: "See every Vendetta card's price →",
      blurb: "All 166 confirmed cards plus every alt-art and promo, ranked by cheapest live price.",
    },
    embed: {
      title: "The 6 Crystal Rose alt-arts, priced live",
      note: "Kai'Sa, Sona, Ahri, Sett, Ezreal and Lux — Vendetta's Wild Rift crossover cards, straight from our live database.",
      slugs: [
        "kai-sa-survivor-ven",
        "sona-harmonious-ven",
        "ahri-inquisitive-ven",
        "sett-brawler-ven",
        "ezreal-prodigy-ven",
        "lux-crownguard-ven",
      ],
    },
    body: `Riftbound: Vendetta's boosters hide six special alt-art cards celebrating League of Legends' Wild Rift **Crystal Rose** skin line — the first time these looks have appeared on physical cards. If you've pulled one, or you're hunting a specific one, here's what makes them different from Vendetta's regular alt-arts, and what they're trading for right now.

## The six Crystal Rose cards

- **Kai'Sa, Survivor**
- **Sona, Harmonious**
- **Ahri, Inquisitive**
- **Sett, Brawler**
- **Ezreal, Prodigy**
- **Lux, Crownguard**

## How they're numbered and pulled

Unlike Vendetta's other alt-art printings (which carry a lettered variant of a normal collector number, e.g. "021a"), the six Crystal Rose cards are numbered **SP1 through SP6** — their own dedicated range, separate from the set's regular 1–166 checklist. Riot's own reasoning: the "Overnumber" treatment is reserved for art created specifically for Riftbound, and Crystal Rose art is ported from Wild Rift, so it gets its own numbering instead.

Despite the different numbering, they pull at the **same rate as any other alt-art card** in Vendetta boosters — there's no separate box or bundle required to chase them. Any booster you open has a shot at one.

## Why Kai'Sa and Ezreal stand out

Two of the six — **Kai'Sa, Survivor** and **Ezreal, Prodigy** — are reprints of cards that were already strong and notoriously hard to get before Vendetta. A second printing via the Crystal Rose line means more copies in circulation, which is good news if you've been trying to complete a deck around either of them without paying a premium for the original print.

## Live prices

Every Crystal Rose card's cheapest current price, ranked across every store RiftCompare tracks, is below — tap any card for the full comparison, including eBay.

## Common questions

**Are Crystal Rose cards rarer than a normal alt-art?** No — Riot's own guidance is that they appear at the same rate as Vendetta's other alt-art pulls, not as a rarer "Overnumber"-style pull.

**Do I need a special product to get one?** No — they're distributed through regular Vendetta booster packs, the same as any other alt-art.

**Is this Riftbound's first Wild Rift crossover?** It's the first time these specific Wild Rift Crystal Rose looks have been brought to physical Riftbound cards.

*Card names, numbering and distribution details are from Riot's own Vendetta reveal coverage — see [Riftbound's official site](https://riftbound.gg/riftbound-vendetta-wild-rift-crystal-rose-alt-art-cards/) for the original announcement.*`,
  },
  {
    slug: "why-riftbound-card-prices-change",
    category: "guide",
    title: "Why Riftbound Card Prices Change",
    excerpt:
      "Why one Riftbound set costs more than another, why prices tend to fall after a launch, why a card costs a different amount in Australia than the US, and which events actually move the market. A plain explanation of the forces behind the numbers.",
    author: "RiftCompare",
    date: "2026-07-31",
    updated: "2026-07-31",
    readMins: 8,
    tags: ["prices", "market", "price history", "buying guide", "riftbound"],
    browseCta: {
      href: "/movers",
      label: "See what's moving right now →",
      blurb: "Price movers tracks which Riftbound cards are climbing and cooling across every store we compare.",
    },
    body: `"Why is Riftbound so expensive?" "When will prices drop?" "Why is one set cheaper than a newer one?" These are some of the most-asked questions about the game, and most answers you'll find are guesses.

This guide explains the **mechanisms** — the things that actually push a Riftbound card's price up or down — so you can read the market yourself instead of taking anyone's word for it. Where a number matters, we point you at the **live** figure on RiftCompare rather than printing one here that would be stale within days.

> **Important framing:** this is a description of how a collectible market behaves. It is not investment advice, and nothing here is a prediction about what any specific card will do next.

## Why one set costs more than another

The single biggest driver is **supply against demand**, and supply is mostly a function of two things:

- **How much was printed.** A set that shipped in larger quantities has more copies chasing the same number of players.
- **How long it stayed in print.** A set that has been available for many months keeps accumulating opened product. A set that stopped being restocked stops accumulating.

Demand pulls the other way. A set holding cards that are central to strong decks keeps a floor under its prices, because players actually need those cards to play. A set whose cards have been superseded loses that floor even if very little of it was printed.

This is why a **newer set can genuinely be cheaper than an older one**. Newness isn't the driver — availability is. At launch, a huge amount of product is opened in a short window, which is usually the moment a set's singles are at their most available.

You can check this yourself right now rather than trusting the explanation: open **[Origins](/sets/origins)**, **[Spirit Forged](/sets/spiritforged)**, **[Unleashed](/sets/unleashed)** and **[Vendetta](/sets/vendetta)** side by side and compare what the same rarity tier actually costs in each.

## What usually happens to prices after a set launches

Launch weeks are unusual, and it helps to know why. Three things happen at once:

1. **Supply spikes.** Pre-release events, launch-day boxes and the first wave of online orders all get opened within days. More copies hit the market in that window than at any later point.
2. **Demand also spikes**, but unevenly — concentrated on a small number of chase cards and whatever the early decks want.
3. **Nobody knows the format yet.** Prices in week one reflect speculation about what will be good, not results.

The practical consequence is that **the widest, most volatile pricing you'll ever see for a set is in its first few weeks**. Cards that look essential on reveal day sometimes settle far lower once the meta is actually played; cards nobody rated can climb sharply once a deck built around them wins something.

If you are buying to *play* rather than to speculate, waiting past the first rush of a launch usually means better information and calmer prices. If you are buying a specific chase card you want to own regardless, the launch window is when the most copies are being opened and listed at once.

## Why chase cards move differently from the rest of a set

A set's ordinary cards and its chase cards are effectively two different markets.

Ordinary singles are priced by **playability**. If a card is in good decks, people need copies; if it rotates out of favour, demand falls away and the price follows.

Chase cards — Showcase alt-arts, Overnumbered prints, signed cards — are priced by **scarcity and desirability**, largely independent of whether the card is good. That means they:

- Fall much more slowly when a set floods the market, because far fewer exist per box opened.
- Are far more sensitive to condition and to grading.
- Can move on things that have nothing to do with gameplay — a popular champion, a striking piece of art, a crossover.

Riftbound's own chase tiers are explained in **[Overnumbers explained](/guides/riftbound-vendetta-overnumbers-explained)** and **[understanding card rarity](/guides/understanding-riftbound-card-rarity)**. The **[most valuable Riftbound cards](/guides/most-valuable-riftbound-cards)** page tracks where the top of that market currently sits.

## Why the same card costs a different amount in different countries

This one surprises people, and it isn't just currency conversion. A card's price in a given market is shaped by:

- **How much product was allocated there.** Distribution isn't even across regions.
- **How many local stores stock it.** Fewer local sellers means less price competition.
- **Import and freight costs**, which get passed through to shelf prices.
- **Whether buying from overseas is realistic**, once postage and any duties are counted.

This is exactly why RiftCompare prices each market in its own currency from stores that actually ship there, rather than converting one market's price and calling it your price. Switch markets with the country selector and the whole site re-prices: **[Australia](/blog/buy-riftbound-cards-australia)**, the **[US](/blog/buy-riftbound-cards-us)**, the **[UK](/blog/buy-riftbound-cards-uk)**, **[Singapore](/blog/riftbound-price-comparison-singapore)** and **[Canada](/blog/buy-riftbound-cards-canada)** each have their own guide.

## The events that actually move prices

Most days, nothing much happens. Prices move on identifiable events:

- **A restock or reprint.** New supply into a market that had run dry is the fastest way for a price to fall.
- **Selling out.** The reverse — when stores stop being able to restock, the remaining listings set the price.
- **A ban or errata.** A card that stops being legal, or whose text changes, reprices almost immediately. See **[the banlist explained](/guides/riftbound-banlist-explained)**.
- **Tournament results.** A deck winning a visible event moves the cards that deck needs, often within a day.
- **A new set landing.** Cards from older sets that combo with new ones can climb; cards that get a strictly better replacement fall.

Note what is *not* on that list: reveal-day hype on its own, and social-media speculation. Both move prices briefly, and both frequently unwind.

## How to watch the market yourself

You don't have to take any of this on trust — the whole point of RiftCompare is that you can check.

- **[Price movers](/movers)** — which cards are climbing or cooling right now, per market.
- **[The RiftCompare Index](/market)** — the market as a whole rather than one card. Methodology is documented in **[how the Index works](/guides/understanding-the-riftcompare-index-methodology)**.
- **Any card page** — the full store-by-store table ranked by delivered cost, plus that card's price history chart as it accumulates.
- **[Price watch](/browse)** — save a card and get told when it moves, instead of checking manually.

## "Should I buy now or wait?"

We deliberately won't answer that for you, and you should be sceptical of anyone who does confidently. What we can tell you is what to look at:

- **If you need the card to play a deck**, the cost of waiting is not playing. Buy the cheapest delivered listing and move on.
- **If you're buying a chase card you want to own**, availability matters more than timing — check how many stores actually have it in stock, not just the headline price.
- **If you're buying because you think it will be worth more later**, understand you're taking a position in a young market with no guarantees, and size it accordingly.

On that last point, our position is straightforward: we report what the market is doing, including when it's falling. We don't publish price predictions or tell people what to speculate on. If you want the market data behind a decision, it's all on the site for free.

## Riftbound price FAQ

**Why are Riftbound cards so expensive?** Usually it's limited supply meeting concentrated demand — a card that's needed in strong decks, or a chase print that appears rarely per box. Price also varies by market depending on local stock and import costs, so "expensive" can mean something different depending where you're buying.

**When do Riftbound prices usually drop?** The most reliable driver of a price fall is new supply — a restock or reprint reaching a market that had run short. Beyond that, the heavy opening that happens around a set's launch is when the most copies enter circulation at once.

**Why is a newer Riftbound set cheaper than an older one?** Newness isn't what sets price — availability is. A newly launched set has a large amount of product being opened in a short window, while an older set may have stopped being restocked. Compare any two sets directly on their set pages to see the current picture.

**Do Riftbound cards go up in value?** Some have and some haven't, and past movement doesn't establish what any card will do next. Riftbound is a young game with no long price record yet, which is precisely why we publish live data and price history rather than forecasts.

**Why is the same card a different price in Australia than in the US?** Regional allocation, how many local stores carry it, import and freight costs, and how much local price competition exists. RiftCompare prices each market separately from stores that genuinely ship there rather than converting a single global price.

**What makes a Riftbound chase card expensive?** Scarcity and desirability rather than playability. Showcase alt-arts, Overnumbered prints and signed cards appear far less often per box, so they hold value better when a set floods the market — and they're much more sensitive to condition.

**Does a ban or errata change card prices?** Yes, usually fast. A card that loses legality in a format loses the demand attached to that format, and cards that replace it in decks tend to rise at the same time.

**Does RiftCompare give investment advice?** No. We report live prices, price history and market movement across every store we track. We don't publish predictions or recommend cards to buy as investments.`,
    faq: [
      { q: "Why are Riftbound cards so expensive?", a: "Usually it's limited supply meeting concentrated demand — a card that's needed in strong decks, or a chase print that appears rarely per box. Price also varies by market depending on local stock and import costs, so \"expensive\" can mean something different depending where you're buying." },
      { q: "When do Riftbound prices usually drop?", a: "The most reliable driver of a price fall is new supply — a restock or reprint reaching a market that had run short. Beyond that, the heavy opening that happens around a set's launch is when the most copies enter circulation at once." },
      { q: "Why is a newer Riftbound set cheaper than an older one?", a: "Newness isn't what sets price — availability is. A newly launched set has a large amount of product being opened in a short window, while an older set may have stopped being restocked. Compare any two sets directly on their set pages to see the current picture." },
      { q: "Do Riftbound cards go up in value?", a: "Some have and some haven't, and past movement doesn't establish what any card will do next. Riftbound is a young game with no long price record yet, which is why RiftCompare publishes live data and price history rather than forecasts." },
      { q: "Why is the same card a different price in Australia than in the US?", a: "Regional allocation, how many local stores carry it, import and freight costs, and how much local price competition exists. RiftCompare prices each market separately from stores that genuinely ship there rather than converting a single global price." },
      { q: "What makes a Riftbound chase card expensive?", a: "Scarcity and desirability rather than playability. Showcase alt-arts, Overnumbered prints and signed cards appear far less often per box, so they hold value better when a set floods the market — and they're much more sensitive to condition." },
      { q: "Does a ban or errata change card prices?", a: "Yes, usually fast. A card that loses legality in a format loses the demand attached to that format, and the cards that replace it in decks tend to rise at the same time." },
    ],
  },
  {
    slug: "cheapest-way-to-start-riftbound",
    category: "guide",
    title: "The Cheapest Way to Start Riftbound",
    excerpt:
      "Every realistic way into Riftbound compared on cost: a ready-to-play deck, a starter product, singles for one deck, or a booster box. What each actually gets you, what to skip first, and how to check live prices in your own market.",
    author: "RiftCompare",
    date: "2026-07-31",
    updated: "2026-07-31",
    readMins: 7,
    tags: ["beginner", "buying guide", "budget", "riftbound", "how to start"],
    shop: [
      { label: "Riftbound decks on eBay", query: "Riftbound deck" },
      { label: "Riftbound singles", query: "Riftbound singles" },
    ],
    browseCta: {
      href: "/deck",
      label: "Price a full deck →",
      blurb: "Paste a decklist and the deck pricer finds the cheapest way to buy all of it across every store at once.",
    },
    body: `The most common question from people looking at Riftbound isn't "is it good?" — it's some version of **"how do I get in without wasting money?"** That's a fair question for any trading card game, and it deserves a straight answer rather than a sales pitch.

This guide compares every realistic route in, what each one actually gets you, and how to check the current cost **in your own market** rather than trusting a number typed into an article months ago.

> **The short version:** if you want to play against a friend, a ready-to-play two-player product is the cheapest single purchase that gets two functioning decks on the table. If you want to build one specific deck, buying **singles** is almost always cheaper than opening packs to find them. Booster boxes are for people who want to open packs — they are not the cheap way to get cards you've already chosen.

## The four ways in

### 1. A ready-to-play deck product

The lowest-friction start. You get a playable deck out of the box with no deckbuilding decisions and no missing pieces. Riftbound's **Showdown Decks** are built specifically for this — they're the game's first ready-to-play *two-player* product, so a single purchase covers both sides of a game. The debut pairing is **Shen vs Zed**.

**Best for:** learning the game, playing with a partner or housemate, deciding whether you like it before spending more.
**Watch out for:** a precon is a starting point, not a competitive list. You'll want to upgrade it if you keep playing.

### 2. Singles for one deck you've chosen

Pick a deck, buy exactly the cards it needs, play it. This is how most established players actually acquire cards, and for a *specific* list it's nearly always the cheapest route — you're paying for the cards you want instead of gambling on finding them.

Use the **[deck pricer](/deck)**: paste a full list and it works out the cheapest way to buy all of it across every store at once, consolidating orders so you aren't paying postage five separate times. Start from **[budget Riftbound decks](/guides/budget-riftbound-decks)** if you don't have a list yet.

**Best for:** anyone who knows roughly what they want to play.
**Watch out for:** postage. Five cheap cards from five different shops can cost more than one slightly dearer order. The deck pricer accounts for this; buying by hand often doesn't.

### 3. A starter / entry sealed product

Products like **Proving Grounds** sit between a precon and a booster box — some ready-to-play content plus some opening. Current contents and live pricing for entry products are on the **[sealed page](/sealed)**.

**Best for:** people who want *some* of the opening experience without committing to a box.

### 4. A booster box

The most product, the most opening, and the highest single outlay. A box is the right purchase if the **opening itself** is what you want, or if you're deliberately chasing a set's chase cards at launch.

It is **not** the cheap way to assemble a specific deck. Opening packs to find three copies of one card means buying — and paying for — a large number of cards you didn't need. We wrote the maths out in **[booster box EV: worth ripping, or buy singles?](/guides/riftbound-booster-box-ev-worth-ripping-or-buying-singles)**.

**Best for:** the experience of opening; launch-window chase hunting.
**Watch out for:** treating it as a shortcut to a deck. It usually isn't.

## The cheapest route, by what you actually want

- **"I want to try the game with a friend."** One ready-to-play two-player product. Cheapest possible path to two real decks.
- **"I want to play one deck properly."** Singles for that list, bought through the **[deck pricer](/deck)**.
- **"I want to open packs."** A box — but buy it because you want to open it, not because you expect it to be cheaper than singles.
- **"I want to collect the art."** Singles, targeting the specific alt-arts you like. See **[understanding card rarity](/guides/understanding-riftbound-card-rarity)**.

## What to skip at first

- **Don't buy multiple boxes before you've played.** The most common expensive mistake, and the one most posted about by people regretting it.
- **Don't buy chase cards on reveal-day hype.** Launch-week prices are the most speculative you'll ever see — see **[why prices change](/guides/why-riftbound-card-prices-change)**.
- **Don't buy sleeves and accessories before you own a deck.** They'll still be there later.
- **Don't buy an older set's product without checking it's actually cheaper.** Sometimes it is; sometimes it isn't. Compare **[Origins](/sets/origins)**, **[Spirit Forged](/sets/spiritforged)**, **[Unleashed](/sets/unleashed)** and **[Vendetta](/sets/vendetta)** directly.

## Postage is the part people forget

The sticker price is not the price. A card listed at $2 with $4 tracked shipping costs more than the same card at $4 with free post — and if you're assembling a deck across several shops, postage can quietly become the largest line on the bill.

Every price comparison on RiftCompare ranks stores by **total delivered cost**, with free-shipping thresholds factored in automatically. That's the number that matters, and it frequently reorders the list.

## Starting in your market

Riftbound's availability and pricing genuinely differ by country. Each of these guides lists the stores we actually track locally, priced in local currency:

- **[Australia](/blog/buy-riftbound-cards-australia)**
- **[United States](/blog/buy-riftbound-cards-us)**
- **[United Kingdom](/blog/buy-riftbound-cards-uk)**
- **[Singapore](/blog/riftbound-price-comparison-singapore)**
- **[Canada](/blog/buy-riftbound-cards-canada)**

## Then what?

Once you've played a few games, **[Riftbound for beginners](/guides/riftbound-for-beginners)** covers the rules side, and **[how a Riftbound deck is built](/guides/how-a-riftbound-deck-is-built)** explains deck construction so you can upgrade what you started with rather than replacing it.

## Starting Riftbound FAQ

**What is the cheapest way to start playing Riftbound?** A ready-to-play deck product is the cheapest single purchase that gets you playing, and a two-player product like a Showdown Deck covers both sides of a game in one buy. If you already know which deck you want to play, buying singles for that specific list is usually cheaper than opening packs to find the same cards.

**Are Riftbound starter and precon decks worth it?** As a way to start, yes — they get you a functioning deck with no missing pieces and no deckbuilding required. They aren't competitive lists out of the box, so treat one as a base to upgrade rather than a finished deck.

**Is it cheaper to buy singles or booster packs?** For a specific card you've already decided you want, singles are cheaper nearly every time — packs mean paying for a lot of cards you didn't need on top of the one you did. Packs make sense when the opening itself is what you want.

**How much does it cost to start Riftbound?** It depends entirely on the route and your market, which is why we don't print a figure here that would be wrong next week. Check live prices for entry products on the sealed page and for singles through the deck pricer, both in your own currency.

**Do I need a booster box to start?** No. A box is the largest single outlay of any route in and is aimed at people who want to open packs. You can play the game properly without ever buying one.

**Should I buy the newest set or an older one to start?** Either works. Newer isn't automatically more expensive and older isn't automatically cheaper — availability drives price more than age does. Compare the set pages directly before assuming.`,
    faq: [
      { q: "What is the cheapest way to start playing Riftbound?", a: "A ready-to-play deck product is the cheapest single purchase that gets you playing, and a two-player product like a Showdown Deck covers both sides of a game in one buy. If you already know which deck you want to play, buying singles for that specific list is usually cheaper than opening packs to find the same cards." },
      { q: "Are Riftbound starter and precon decks worth it?", a: "As a way to start, yes — they get you a functioning deck with no missing pieces and no deckbuilding required. They aren't competitive lists out of the box, so treat one as a base to upgrade rather than a finished deck." },
      { q: "Is it cheaper to buy singles or booster packs?", a: "For a specific card you've already decided you want, singles are cheaper nearly every time — packs mean paying for a lot of cards you didn't need on top of the one you did. Packs make sense when the opening itself is what you want." },
      { q: "How much does it cost to start Riftbound?", a: "It depends on the route in and on your market. Entry sealed products, precons, singles and booster boxes all sit at different price points, and each market has its own local pricing — check live prices on RiftCompare in your own currency rather than relying on a fixed figure." },
      { q: "Do I need a booster box to start?", a: "No. A booster box is the largest single outlay of any route in and is aimed at people who want to open packs. You can play the game properly without ever buying one." },
      { q: "Should I buy the newest set or an older one to start?", a: "Either works. Newer isn't automatically more expensive and older isn't automatically cheaper — availability drives price more than age does, so compare the set pages directly before assuming." },
    ],
  },
  {
    slug: "riftbound-rules-explained",
    category: "guide",
    title: "Riftbound Rules Explained",
    excerpt:
      "A hub for how Riftbound actually works: the keywords introduced in Vendetta, the chase-print numbering, deck construction, the banlist, and the event formats — each linked to a full guide.",
    author: "RiftCompare",
    date: "2026-07-31",
    updated: "2026-07-31",
    readMins: 4,
    tags: ["rules", "keywords", "how to play", "riftbound", "guide"],
    browseCta: {
      href: "/keywords",
      label: "Browse keywords →",
      blurb: "Every Riftbound keyword we've documented, with the cards that use it.",
    },
    body: `Riftbound's rules questions cluster around a handful of things: the newer keywords, what the odd collector numbers mean, how decks are legally built, and what's currently banned. This page is the index — each section links to the full guide rather than repeating it here.

> **On sourcing:** we only publish rules explanations where we can point at Riot's own rules text or official reveal coverage. Where a keyword is printed on cards but hasn't been documented officially in a form we can cite, we list the name without inventing what it does. That's why this hub covers some keywords in depth and simply names others.

## The Vendetta keywords

Vendetta introduced three mechanics, and they generate the bulk of current rules searches:

- **[Empower explained](/guides/riftbound-empower-explained)** — upgrading a card that's already in play by paying an extra cost later. Also see the worked example in **[Jayce & Mel: Empower in practice](/guides/jayce-mel-riftbound-empower-explained)**.
- **[Flow explained](/guides/riftbound-flow-explained)** — playing cards straight from your trash, turning discarded cards into a second pool of plays.
- **[Burn explained](/guides/riftbound-burn-explained)** — sending cards to the trash, either your own to fuel Flow-style payoffs, or an opponent's as a deck attack.


## New card concepts

- **[Unit-Gear and Decrees](/blog/riftbound-vendetta-unit-gear-decrees)** — two card concepts Vendetta introduced.
- **[Overnumbers explained](/guides/riftbound-vendetta-overnumbers-explained)** — what a collector number beyond the set total means, and how signed and Overnumbered prints differ.
- **[Understanding card rarity](/guides/understanding-riftbound-card-rarity)** — the rarity tiers, and where Showcase and alt-art printings sit.

## Deckbuilding rules

- **[How a Riftbound deck is built](/guides/how-a-riftbound-deck-is-built)** — deck construction, Legends, and how the pieces fit together.
- **[Building for Vendetta](/guides/building-for-riftbound-vendetta)** — deckbuilding with the new set's cards and domain pairings.

## What's currently legal

- **[The banlist explained](/guides/riftbound-banlist-explained)** — how bans work and what they mean for your decks.
- **[The July 2026 ban list update](/blog/riftbound-july-2026-ban-list-update)** — the most recent changes.

Bans and errata move prices as well as decks — **[why Riftbound prices change](/guides/why-riftbound-card-prices-change)** covers that side.

## Event formats

- **[Pre-Rift rules explained](/guides/riftbound-pre-rift-rules-explained)** — how Riftbound's launch-event format works.

## Keyword reference

Individual keyword pages, each with the real cards that use it, live under **[/keywords](/keywords)**. Cards themselves are searchable in the **[card database](/browse)**, and every card page shows its full rules text alongside live prices.

## New to the game entirely?

Start with **[Riftbound for beginners](/guides/riftbound-for-beginners)** for the basics, then **[the cheapest way to start](/guides/cheapest-way-to-start-riftbound)** for what to actually buy first.

## Riftbound rules FAQ

**What is Empower in Riftbound?** Empower gives a card the potential to gain new abilities once it's already in play, usually by paying an extra cost on a later turn — a cheap play now, a bigger payoff later. Full detail in the Empower guide.

**What is Flow in Riftbound?** Flow is a Vendetta keyword that lets you play a card straight from your trash instead of your hand, so discarded and used cards become a second pool of plays rather than being gone for good.

**What is Burn in Riftbound?** Burn sends cards from a Main Deck to the trash — either your own, to fuel Flow and other trash payoffs, or your opponent's as a deck attack.

**What does Overnumbered mean on a Riftbound card?** It's a collector number that runs past the set's stated total — for example a number higher than the set size — marking a chase printing that sits outside the main numbered run. The Overnumbers guide covers how these differ from signed prints.

**Where can I find Riftbound's current banned cards?** The banlist guide explains how bans work, and the July 2026 update covers the most recent changes.`,
    faq: [
      { q: "What is Empower in Riftbound?", a: "Empower gives a card the potential to gain new abilities once it's already in play, usually by paying an extra cost on a later turn — a cheap play now, a bigger payoff later." },
      { q: "What is Flow in Riftbound?", a: "Flow is a Vendetta keyword that lets you play a card straight from your trash instead of your hand, so your discarded and used cards become a second pool of plays rather than being gone for good." },
      { q: "What is Burn in Riftbound?", a: "Burn sends cards from a Main Deck to the trash — either your own (to fuel Flow and other trash payoffs) or your opponent's (a deck attack)." },
      { q: "What does Overnumbered mean on a Riftbound card?", a: "It's a collector number that runs past the set's stated total, marking a chase printing that sits outside the main numbered run. Overnumbered prints and signed prints are distinct — the Overnumbers guide covers the difference." },
      { q: "Where can I find Riftbound's current banned cards?", a: "RiftCompare's banlist guide explains how bans work in Riftbound, and the July 2026 ban list update covers the most recent changes." },
    ],
  },
  {
    slug: "riftbound-vendetta-nexus-night-promo-cards",
    category: "blog",
    title: "Vendetta Nexus Night Promo Cards: All 7 Confirmed",
    excerpt:
      "Vendetta's weekly Nexus Night events hand out a 25-card promo cycle led by Mel, Newly Awakened. 7 of 25 confirmed so far, with live prices.",
    author: "RiftCompare",
    date: "2026-08-01",
    updated: "2026-08-19",
    readMins: 4,
    tags: ["vendetta", "nexus night", "promo", "chase cards", "collecting"],
    shop: [
      { label: "Vendetta Nexus Night promos on eBay", query: "Riftbound Vendetta Nexus Night promo" },
      { label: "Mel Newly Awakened promo", query: "Riftbound Mel Newly Awakened promo" },
    ],
    browseCta: {
      href: "/sets/vendetta",
      label: "See every Vendetta printing's price →",
      blurb: "All 166 confirmed cards plus every alt-art, Signature and promo, ranked by cheapest live price.",
    },
    embeds: [
      {
        title: "The chase card: Mel, Newly Awakened",
        note: "The confirmed chase card for Vendetta's Nexus Night season — tap through for the live price comparison.",
        slugs: ["mel-newly-awakened-ven-069b-166-promo"],
      },
      {
        title: "The 6 promo runes",
        note: "Fury, Calm, Mind, Body, Chaos and Order — the promo printing of Vendetta's rune cycle, straight from our live database.",
        slugs: [
          "fury-rune-ven-r01b-promo",
          "calm-rune-ven-r02b-promo",
          "mind-rune-ven-r03b-promo",
          "body-rune-ven-r04b-promo",
          "chaos-rune-ven-r05b-promo",
          "order-rune-ven-r06b-promo",
        ],
      },
    ],
    body: `![Riftbound: Vendetta — out now](/vendetta-hero.png)

**Nexus Nights** are Riftbound's weekly casual events, run at local game stores on whatever day works best for each store — a demo or a casual event, not a competitive tournament. Vendetta's Nexus Night season brings its own **25-card promo cycle** to chase, headlined by a genuine chase card. Riot confirms the cards in waves rather than all at once, so this post tracks exactly what's real right now — no guessing at cards that haven't actually been shown yet.

## The chase card: Mel, Newly Awakened

The confirmed chase card for Vendetta's Nexus Night season is **Mel, Newly Awakened** — a promo printing (**069b/166**) of the existing Champion Unit, alongside her regular base print and alt-art. It carries the same **"When you play me, draw 1"** ability and Empower payoff as the original, just in the Nexus Night promo treatment.

[[embed:0]]

## The 6 promo runes

Alongside Mel, the full **rune cycle** — Fury, Calm, Mind, Body, Chaos and Order — gets its own Nexus Night promo printing (**R01b** through **R06b**), matching the same treatment Vendetta's base runes already have. These are common pulls in the pack, but a full set completes the cycle.

[[embed:1]]

## What's still unconfirmed

Riot's own Nexus Night promo page states there are **25 total promo cards** across the season, but as of this post only Mel and the 6 runes have actual confirmed art — **7 of the 25**. The rest of the page currently shows placeholder cards standing in for reveals that haven't landed yet ("*these cards are used as placeholders… we will update this section soon with the promo tagged cards*"), so we're deliberately not listing or imagining names for them here. We'll add each one the moment it's genuinely confirmed, the same way we did for these seven.

## How to get Nexus Night promos

Find your nearest Riftbound local game store and show up for their weekly Nexus Night — completing a demo or event earns a **3-card promo pack**. The specific day and format varies by store, so check with your local shop directly. Promo availability is while supplies last, so earlier weeks of the season are your best shot at any specific card.

## Nexus Night promo FAQ

**What is the Vendetta Nexus Night chase card?** Mel, Newly Awakened (069b/166) — a promo printing of the existing Mel, Newly Awakened Champion Unit.

**How many Nexus Night promo cards are there for Vendetta?** Riot says 25 total across the season. Only 7 (Mel plus the 6 promo runes) have confirmed art as of this post.

**How do I get Nexus Night promo cards?** Attend your local game store's weekly Nexus Night event — completing a demo or casual event earns a 3-card promo pack. Day and format vary by store.

**Are Nexus Night promos worth anything?** Promo prints are historically one of Riftbound's more volatile chase tiers — small, event-bound print runs can outprice regular chase cards once a season's supply dries up. Check each card's live page for the current picture rather than trusting a fixed number.

*Card reveals and event details are from Riot's own Nexus Night coverage — see [riftbound.gg's promo card page](https://riftbound.gg/riftbound-vendetta-nexus-night-promo-cards/) for the original.*`,
    faq: [
      { q: "What is the Vendetta Nexus Night chase card?", a: "Mel, Newly Awakened (069b/166) — a promo printing of the existing Mel, Newly Awakened Champion Unit." },
      { q: "How many Nexus Night promo cards are there for Vendetta?", a: "Riot says 25 total across the season. Only 7 (Mel plus the 6 promo runes) have confirmed art as of this post." },
      { q: "How do I get Nexus Night promo cards?", a: "Attend your local game store's weekly Nexus Night event — completing a demo or casual event earns a 3-card promo pack. Day and format vary by store." },
      { q: "Are Nexus Night promos worth anything?", a: "Promo prints are historically one of Riftbound's more volatile chase tiers — small, event-bound print runs can outprice regular chase cards once a season's supply dries up. Check each card's live page for the current picture." },
    ],
  },
  // ── August 2026 announcement coverage ──────────────────────────────────────
  // Three posts covering Riot's 4 Aug 2026 "Products and Sets into 2027" and
  // "August 2026 State of the Game" announcements. Written from the
  // announcements plus press coverage and summarised in our own words — no copy
  // is reproduced from Riot's articles, and each post attributes and links back
  // to the original.
  //
  // IMAGE SLOTS (author to fill): each post ships the generated branded hero
  // (scripts/gen-blog-heroes.ts). Riot's own diagrams and card art are NOT
  // hotlinked. Where a screenshot would genuinely help, the spot is marked with
  // an IMAGE SLOT comment above the article — drop the file into public/blog/
  // and add a markdown image line at the noted heading.
  {
    slug: "riftbound-2027-set-roadmap",
    category: "blog",
    title: "Riftbound's 2027 Set Roadmap",
    excerpt:
      "Riot has mapped Riftbound's releases through 2027 — Radiance, Legacy, The Reckoning and two unnamed sets. What each means for buyers.",
    author: "RiftCompare",
    date: "2026-08-04",
    readMins: 7,
    tags: ["news", "set", "release", "prices"],
    hero: {
      src: "/blog/riftbound-2027-set-roadmap.png",
      alt: "Riftbound 2027 set roadmap — Radiance, Legacy and The Reckoning release windows on RiftCompare",
    },
    summary: [
      "**Four dated releases** are now on the calendar: Radiance (23 Oct 2026), Legacy (29 Jan 2027), a boxed deck product in Feb 2027, and The Reckoning (30 Apr 2027).",
      "**Sets 8 and 9** are placeholder slots for Q3 and Q4 2027 — no names, champions or themes announced.",
      "**Legacy is the one to plan around.** At 346 cards it is far larger than anything so far, it is the first set designed for draft, and it changes what is inside a booster pack.",
      "Set size is the number buyers should watch: a bigger set spreads the same demand across more slots, which usually means cheaper commons and pricier chase cards.",
      "Nothing here is on sale yet. [Set a price alert](/alerts) rather than pre-ordering blind.",
    ],
    faq: [
      {
        q: "When does Riftbound Radiance release?",
        a: "Radiance, the fifth Riftbound set, is scheduled for 23 October 2026 with a confirmed 180 cards (66 Showcase). Preview season and Pre-Rift launch events run in the weeks before it.",
      },
      {
        q: "What is the next Riftbound set after Radiance?",
        a: "Legacy, Set 6, scheduled for 29 January 2027. It is the largest set announced so far at roughly 346 cards and is the first one built specifically with drafting in mind.",
      },
      {
        q: "How many Riftbound sets are planned for 2027?",
        a: "Four release slots. Legacy in January and The Reckoning in April are named and dated; two further sets are pencilled in for Q3 and Q4 2027 with no names, champions or themes revealed yet.",
      },
      {
        q: "Should I pre-order 2027 Riftbound sealed product now?",
        a: "There is nothing to pre-order for the 2027 sets yet, and launch-window sealed has historically been at its most expensive in the first days after release. Track the price rather than committing early.",
      },
    ],
    browseCta: {
      href: "/sealed",
      label: "Compare sealed prices →",
      blurb: "Booster boxes, packs and bundles ranked cheapest-first across every store we track.",
    },
    body: `Riot published two announcements on 4 August 2026 — a product and set rundown through 2027, and an August State of the Game. Between them, the Riftbound release calendar is now visible about fifteen months ahead, which is the longest runway the game has had.

This post is the buyer's-eye view: what is coming, when, and which of it should change what you do with your money. If you want the mechanical detail on Legacy specifically, that has [its own post](/blog/riftbound-legacy-pack-changes-and-card-templating).

## The calendar at a glance

| Set | # | Release | Cards | The short version |
| --- | --- | --- | --- | --- |
| **Radiance** | 5 | 23 Oct 2026 | 180 | Seraphine, Evelynn, Ekko, Ziggs and Jarvan IV, +4 unrevealed; a step up in size from Vendetta |
| **Legacy** | 6 | 29 Jan 2027 | ~346 | Region-driven themes across six factions; built for draft; new pack composition |
| *(boxed decks)* | — | Feb 2027 | — | Four new decks built around Legacy champions |
| **The Reckoning** | 7 | 30 Apr 2027 | ~264 | Centred on League's biggest champions |
| **Set 8** | 8 | Q3 2027 | — | Placeholder — nothing announced |
| **Set 9** | 9 | Q4 2027 | — | Placeholder — nothing announced |

Two things stand out before any of the detail. First, the cadence is roughly quarterly and now stated in advance, which is a meaningful change from finding out a set's date a few weeks ahead. Second, set sizes are moving around a lot — 180, then 346, then 264 — and set size is the single most underrated variable in what a card ends up costing.

## Radiance (Set 5) — 23 October 2026

Radiance is the near-term one, and the only set on this list you will be buying this year. It brings Seraphine, Evelynn, Ekko, Ziggs and Jarvan IV, plus four more champions still unrevealed, in a confirmed 180-card pool (66 Showcase) — a step up from [Vendetta's](/sets/vendetta) 166.

The pattern we have watched through four launches now is consistent enough to plan around: sealed is at its most expensive in the launch window, chase singles spike hardest in the first fortnight, and the mid-value playables drift down for about a month as supply catches up. [Why Riftbound prices change](/guides/why-riftbound-card-prices-change) sets out the mechanics behind that.

If you intend to open Radiance rather than buy singles, the honest comparison is [box EV against the singles market](/tools/box-ev) once prices exist — not vibes about how good the set looks.

## Legacy (Set 6) — 29 January 2027

Legacy is the set to actually plan around, for three separate reasons.

**It is enormous.** Around 346 cards is roughly double Radiance and more than double Vendetta. A bigger set means each individual card is a smaller slice of the print run, which historically pushes commons and uncommons cheaper while concentrating value at the top of the rarity ladder.

**It is built for draft.** Riot has described Legacy as the first set designed specifically with drafting in mind. Draft-first design tends to mean more playable commons and a flatter power curve — good for players, and usually bad for the price of any single common.

**The packs themselves change.** A common slot is being replaced with a slot that is either a Legend or a Battlefield, at roughly even odds. That takes Legacy boosters from seven commons to six, and it applies to Legacy and every set after it.

That last one has real consequences for pull rates and therefore for prices, and it gets [a full write-up here](/blog/riftbound-legacy-pack-changes-and-card-templating).

A boxed product with four new decks built around Legacy champions follows in February 2027. On past form, precon decks are the cheapest legitimate route to a specific champion's core cards, and worth pricing against [buying those singles individually](/guides/riftbound-singles-vs-sealed).

## The Reckoning (Set 7) — 30 April 2027

The Reckoning lands three months after Legacy at around 264 cards, built around League's biggest champions. "Biggest champions" is the phrase collectors should note — the most expensive cards in this game have consistently been premium treatments of the most popular characters, not the mechanically strongest cards. [The most expensive Riftbound cards](/blog/most-expensive-riftbound-cards) shows what that looks like in the current market.

## Sets 8 and 9 — Q3 and Q4 2027

These are placeholders. No names, no champions, no themes — just two slots on a calendar, confirming the quarterly cadence continues to the end of 2027.

That is genuinely useful information even without detail, because it tells you rotation and reprint pressure will keep arriving on a predictable schedule. It is not information you can trade on.

## What this actually means if you're buying

**Set size is your best early signal.** Legacy at ~346 cards will dilute individual pull rates more than any set so far. If you are buying commons and uncommons to build decks, Legacy should be the cheapest set per card the game has had. If you are chasing premium prints, the opposite applies.

**Dates announced this far out move.** Fifteen months of runway is a plan, not a promise. Treat the 2027 dates as directional and the October 2026 date as firm.

**Nothing here is a reason to buy today.** There is no 2027 product to buy yet, and the announcement itself does not change the value of anything already in your collection. The one thing worth doing now is deciding which champions you care about, so you can [watchlist their cards](/alerts) before the next preview season rather than during it.

**Watch the run-up, not the launch.** Prices on existing cards move when a new set is previewed, because a champion returning in a new set drives demand for their older printings. [The daily movers](/movers) is where that shows up first.

## How we'll track it

Every set gets a page on RiftCompare the moment its cards are catalogued, with live prices across every store we track. You can [browse the sets we already cover](/sets), watch [the daily movers](/movers) for the run-up, and use [the deal finder](/tools/deal-finder) when launch-window pricing is at its most scattered — the gap between the cheapest and dearest store is widest in the first week of a set, which is exactly when most people buy without checking.

---

*Source: Riot Games' official announcements of 4 August 2026 — [Products and Sets into 2027](https://playriftbound.com/en-us/news/announcements/products-and-sets-into-2027/) and the [August 2026 State of the Game](https://playriftbound.com/en-us/news/announcements/august-2026-state-of-the-game/). Set names, dates and card counts are Riot's; the analysis and price commentary are ours. Release dates announced this far ahead are subject to change — check the official post for the current schedule.*`,
  },

  // IMAGE SLOT (author): under "## What's actually changing in a Legacy pack",
  // a photo of a current Vendetta pack's contents laid out — ours, not Riot's —
  // would make the seven-to-six change concrete. Save to
  // public/blog/legacy-pack-contents.png and add:
  //   ![A Riftbound Vendetta booster pack's contents laid out, showing the seven common slots that Legacy reduces to six](/blog/legacy-pack-contents.png)
  {
    slug: "riftbound-legacy-pack-changes-and-card-templating",
    category: "blog",
    title: "Riftbound Legacy: Pack & Templating Changes",
    excerpt:
      "Legacy trades a common for a Legend or Battlefield slot, is the first set built for draft, and changes how card text is written — plain language.",
    author: "RiftCompare",
    date: "2026-08-04",
    readMins: 8,
    tags: ["news", "rules", "mechanics", "gameplay", "set"],
    hero: {
      src: "/blog/riftbound-legacy-pack-changes-and-card-templating.png",
      alt: "Riftbound Legacy pack composition and card templating changes explained on RiftCompare",
    },
    summary: [
      "**Packs change from Legacy onward:** one common slot becomes a slot that is either a Legend or a Battlefield, at roughly even odds. Six commons per pack instead of seven.",
      "Showcase Legends and Battlefields keep using an Overnumber slot — they do **not** appear in the new slot.",
      "**Legacy is the first set designed for draft**, which usually means more playable commons and a flatter power curve.",
      "**Card text is being retemplated:** targets get a distinct background, triggered abilities get an arrow, and the wording around playing cards is being tidied up.",
      "None of this errata's your existing cards. Old printings stay legal and stay readable.",
    ],
    faq: [
      {
        q: "How many commons are in a Riftbound Legacy booster pack?",
        a: "Six. From Legacy onward, one of the seven common slots becomes a dedicated slot that contains either a Legend or a Battlefield, at roughly a 50/50 split.",
      },
      {
        q: "Do Showcase Legends appear in the new Legend/Battlefield slot?",
        a: "No. Showcase Legends and Battlefields continue to occupy one of the Overnumber slots rather than the new dedicated slot, so the new slot does not change your odds of pulling a Showcase print.",
      },
      {
        q: "Do the templating changes errata my existing Riftbound cards?",
        a: "No. The changes are to how new cards are printed and worded, not to what old cards do. Existing printings remain legal and play exactly as they did.",
      },
      {
        q: "What does it mean that Legacy is 'built for draft'?",
        a: "The set is designed so that opening packs and building a deck from them is a first-class way to play, rather than a side mode. In practice that usually means more commons that are genuinely playable and fewer cards that only make sense in a constructed deck.",
      },
    ],
    browseCta: {
      href: "/guides/riftbound-variant-glossary",
      label: "Read the variant glossary →",
      blurb: "Legends, Battlefields, Overnumbers, Showcase prints — what each one is and how to tell them apart.",
    },
    body: `Riot's 4 August announcements covered a lot of ground, and the part with the most direct consequence for anyone opening packs got the least airtime: from Legacy onward, what is inside a Riftbound booster changes.

Here is what is actually changing, and what each change does for you at the table and at the till.

## What's actually changing in a Legacy pack

One common slot is being replaced by a slot that contains either a Legend or a Battlefield, at roughly even odds between the two. Legacy packs therefore contain **six commons instead of seven**, and this composition carries forward to every set after Legacy.

| | Today (through Radiance) | Legacy onward |
| --- | --- | --- |
| Common slots | 7 | 6 |
| Dedicated Legend/Battlefield slot | — | 1 (~50/50 split) |
| Where Showcase Legends/Battlefields appear | Overnumber slot | Overnumber slot (unchanged) |

That last row is the one people miss, so it is worth stating plainly: **the new slot does not improve your odds of pulling a Showcase Legend or Battlefield.** Those premium prints still come out of an Overnumber slot exactly as they do now. The new slot is about supply of the ordinary printings.

## Why a dedicated Legend/Battlefield slot matters

Legends and Battlefields are structural cards. You cannot build a deck without a Legend, and Battlefields shape how a game is actually contested. Under the current composition, whether a pack gives you one is luck.

Guaranteeing one per pack does three things:

**It makes a pack a more complete unit.** Open six packs and you have six Legends or Battlefields — enough raw material to build something. Under the old composition you might open six packs and be unable to field a deck at all.

**It raises the floor on sealed play.** This is the change that makes draft viable, which is presumably the point.

**It changes relative scarcity.** More Legends and Battlefields per box means the base printings of those card types should be cheaper, all else equal. Commons become slightly scarcer per pack, though with roughly 346 cards in Legacy there will be far more distinct commons chasing those six slots — so we would still expect Legacy commons to be cheap in absolute terms. [How rarity and printings work](/guides/understanding-riftbound-card-rarity) covers the tiers this sits on top of.

## Legacy is built for draft

Riot describes Legacy as the first Riftbound set designed specifically for drafting. That is a design statement rather than a rules change, but it has knock-on effects worth naming.

Draft-first sets generally carry **more playable commons**, because a format where you build from what you open falls apart if most commons are filler. They tend to have a **flatter power curve**, because a single overwhelming card ruins a draft pod. And they usually include more **self-contained mechanics** that work without a specific partner card.

For constructed players, a draft-focused set is a mixed bag: deeper playable card pool, fewer format-warping bombs. For anyone buying singles, it usually means the interesting money sits in premium treatments rather than in raw playables.

## The templating changes

Separately from the pack change, Riot is updating how card text is presented. Three changes were called out.

### Targets get their own background

Rules text that refers to a target will carry a distinct backing behind it, so you can see at a glance what a card is pointing at.

This is the kind of change that sounds cosmetic and is not. Most misplays in a chain-based game come from misreading *what* an effect applies to, not *what* it does. Making the target visually distinct from the effect is a readability fix aimed squarely at the most common category of mistake.

### An arrow for triggered abilities

Triggered abilities get an arrow marking which ability the trigger belongs to.

Riftbound has accumulated a lot of keywords that modify a following ability — the timing and permission words that sit at the start of a line. Once a card has two abilities and one of them is conditional, working out which keyword governs which ability is genuinely ambiguous from text alone. An arrow that draws the association explicitly removes that guesswork.

### Cleaning up "play"

The wording around playing cards is being tidied up for consistency.

"Play" is one of those words that accretes meanings in a card game — playing from hand, putting into play, an effect that plays something for you — and once different cards use it slightly differently, rules questions multiply. A consistency pass here is unglamorous maintenance that prevents a category of future confusion.

## What this means for cards you already own

Nothing changes about them. These are changes to how future cards are printed and worded, not errata to existing ones. Your Origins and Vendetta cards stay legal, stay readable, and do exactly what they did yesterday.

You will end up with a collection where older cards use the old templating and newer ones use the new — normal for any long-running card game, and the reason the [full rules explainer](/guides/riftbound-rules-explained) is worth a bookmark.

## What this means for prices

Honestly: less than the headline suggests, and not immediately.

**Templating changes are price-neutral.** They do not alter what a card does, so they do not alter what it is worth.

**The pack change is mildly deflationary for Legend and Battlefield base printings** and mildly the opposite for commons per-pack — but Legacy's size cuts the other way hard enough that we would not bet on Legacy commons being expensive.

**The draft focus is the real variable.** If Legacy drafting takes off, demand for sealed Legacy product stays high for far longer than the usual launch spike, because stores keep buying boxes to run events. That is the pattern worth watching, and it will show up in [sealed pricing](/sealed) well before it shows up anywhere else.

None of it is actionable in August 2026. It is actionable in January 2027, and the useful thing to do between now and then is decide which Legacy champions you care about so you are not competing with everyone else on preview day. Set up [a price alert](/alerts) and let it come to you.

---

*Source: Riot Games' [Products and Sets into 2027](https://playriftbound.com/en-us/news/announcements/products-and-sets-into-2027/), published 4 August 2026. The pack composition, draft focus and templating updates are Riot's announcements; the explanations and the price commentary are ours. Card images and diagrams from the original post are not reproduced here — see Riot's article for those.*`,
  },

  // IMAGE SLOT (author): under "## 2. 2v2 is a roadmap item now, not a side mode",
  // a photo from a local 2v2 event would ground the section. Save to
  // public/blog/riftbound-2v2-event.png and add:
  //   ![Four players mid-game at a Riftbound 2v2 table at a local game store](/blog/riftbound-2v2-event.png)
  {
    slug: "riftbound-august-2026-state-of-the-game-takeaways",
    category: "blog",
    title: "Riftbound's August 2026 State of the Game",
    excerpt:
      "Riot's August State of the Game covered ban philosophy, 2v2, collector products and language rollout — the takeaways that change what to buy and track.",
    author: "RiftCompare",
    date: "2026-08-04",
    readMins: 7,
    tags: ["news", "competitive", "banlist", "collecting", "meta"],
    hero: {
      src: "/blog/riftbound-august-2026-state-of-the-game-takeaways.png",
      alt: "Riftbound August 2026 State of the Game takeaways — bans, 2v2, collector products and languages",
    },
    summary: [
      "**Bans stay rare by design.** The stated philosophy is minimal intervention, and minimal often means none — the team would rather let a format evolve than act early.",
      "**2v2 is a real roadmap item** with a target of being fun, fair and balanced by 2028, plus its own constructed ban list. Set 6's champion decks are meant to work in 2v2 out of the box.",
      "**Collector products yes, serialised boosters no.** Riot wants dedicated collector releases, but says it has no plans to put serialisation into booster packs.",
      "**New languages are paused** in the short term while the most recent additions bed in.",
      "The buying takeaway: a rare-bans policy makes competitive staples hold value longer than in games that ban aggressively.",
    ],
    faq: [
      {
        q: "Does Riftbound ban cards often?",
        a: "No, and that appears to be deliberate. The team's stated approach is minimal intervention — acting only to correct what it considers an emergency, and frequently choosing not to act on the view that the format will sort itself out.",
      },
      {
        q: "Is Riftbound getting official 2v2 support?",
        a: "Yes. The team has said it wants 2v2 to be fun, fair and balanced by 2028, has created a constructed 2v2 ban list, and has designed Set 6's champion decks to work well in 2v2 straight out of the box.",
      },
      {
        q: "Will Riftbound booster packs contain serial-numbered cards?",
        a: "Riot has said it has no plans to put serialisation on cards in booster packs. It does intend to make dedicated collector-focused products separately.",
      },
      {
        q: "Is Riftbound adding more languages?",
        a: "Not in the short term. The team has said each new language adds logistical complexity and it is pausing further additions while establishing the languages most recently added.",
      },
    ],
    browseCta: {
      href: "/guides/riftbound-banlist-explained",
      label: "See the current ban list →",
      blurb: "Every currently banned Riftbound card, why it went, and what it means for deckbuilding.",
    },
    body: `Alongside the 2027 product rundown, Riot published an August State of the Game on 4 August 2026 — largely a developer Q&A. Most of it is philosophy rather than announcement, which makes it easy to skim past and, for anyone spending money on this game, more useful than the product news.

Here are the five things worth extracting.

## 1. Bans stay rare, on purpose

The stated approach is minimal intervention: act only to correct what the team considers an emergency, and accept that "minimal" will frequently mean doing nothing at all, on the view that a format will keep evolving on its own.

That is a real position, and it is not the industry norm. Plenty of card games ban aggressively to keep a format churning. Riftbound is saying it would rather be slow.

**Why this matters for your wallet:** in a game that bans aggressively, competitive staples carry permanent policy risk — a card can lose most of its value overnight. A stated preference for rare intervention means Riftbound staples should hold value more reliably than in games with a heavier hand. It does not mean bans stop; [July's ban list update](/blog/riftbound-july-2026-ban-list-update) was real and did move prices. It means they should stay uncommon enough that "will this get banned" is not the first question you ask about a $60 card.

## 2. 2v2 is a roadmap item now, not a side mode

The team has put a date on it: the goal is for 2v2 to be fun, fair and balanced **by 2028**. Two concrete steps are already visible — a constructed 2v2 ban list exists, and Set 6's champion decks are designed to work well in 2v2 without modification.

A separate ban list is the tell. You do not maintain a second banned-cards list for a format you consider a curiosity; you maintain it for a format you intend to support competitively.

**Why this matters:** formats create demand. If 2v2 becomes a supported competitive format, cards that are mediocre in 1v1 and strong in 2v2 get a second demand curve — and those cards are, right now, cheap. That is a slow, speculative thesis rather than a trade, but it is the kind of thing worth noticing eighteen months early rather than eighteen months late. [The movers dashboard](/movers) is where it would first become visible.

## 3. Collector products yes, serialised boosters no

Two statements that sit together. Riot describes Riftbound as a game first — meant to be accessible to players — while also wanting to make special collector products, for both Riftbound and League more broadly. And it says it has **no plans to put serialisation on cards in booster packs**.

This is a clearer product philosophy than most publishers state out loud. Serial-numbered chase cards in boosters are the standard lever for driving sealed sales to collectors, and it is being explicitly declined; collector demand is instead meant to be served by dedicated products.

**Why this matters:** it changes what sealed product is *for*. If boosters are not the vehicle for the rarest collectibles, then buying boxes is a proposition about playables and ordinary chase prints — which is a proposition you can actually evaluate with [a box EV calculation](/tools/box-ev) rather than a lottery ticket you cannot price. It also suggests the top of the market stays where it is today: premium treatments of popular champions, which is exactly what [the most expensive cards list](/blog/most-expensive-riftbound-cards) currently shows.

## 4. New languages are on pause

Each additional language adds real logistical complexity — printing, distribution, rules translation, organised play support — and the team is holding off on new ones in the short term while the most recent additions establish themselves.

**Why this matters:** language availability drives which regional markets get proper distribution, and regional distribution drives price. If you buy across borders, the practical read is that the current market map is stable for a while — the five markets we track are not about to be joined by a wave of new ones, and cross-border buying will keep being a question of [shipping and currency conversion](/blog/currency-conversion-fees) rather than of new regional supply.

## 5. What we'd actually do with any of this

Not much this week, which is the honest answer to most announcement posts.

The two things that are genuinely actionable:

**Stop treating competitive staples as ban-risk assets.** If you have been avoiding expensive meta cards because of policy risk, that risk is being explicitly managed downward. It is not zero.

**Note which cards are quietly good in 2v2.** Nothing to buy yet. But 2028 targets get built toward in 2027, and the cards that benefit are currently priced as if the format does not exist.

Everything else — the collector product philosophy, the language pause — is context for reading future announcements rather than a reason to move money now. Which is fine. Most State of the Game posts are.

---

*Source: Riot Games' [August 2026 State of the Game](https://playriftbound.com/en-us/news/announcements/august-2026-state-of-the-game/), published 4 August 2026, and the accompanying [Products and Sets into 2027](https://playriftbound.com/en-us/news/announcements/products-and-sets-into-2027/). The developer positions summarised above are Riot's; the interpretation and price commentary are ours. Where we have paraphrased a stated position, read the original for the full wording.*`,
  },
  // ───────────────────────────────────────────────────────────────────────────
  // August 2026 trending batch — ALL DRAFTS. Every one carries [TODO] markers
  // where a fact needs verifying against Riot's own announcement; none of them
  // may be published until those are resolved and the overlap noted on each is
  // settled (five of the six have an existing page targeting the same query).
  // ───────────────────────────────────────────────────────────────────────────
  {
    slug: "riftbound-vendetta-vault-endless-riches",
    draft: true,
    category: "blog",
    title: "Riftbound Vendetta Vault & Endless Riches Explained",
    excerpt:
      "What the Riftbound Vendetta Vault is, what the Endless Riches card does, and how both fit with Unleashed boosters — plus whether the Vault is worth it.",
    author: "RiftCompare",
    date: "2026-08-08",
    readMins: 5,
    tags: ["vendetta", "unleashed", "sealed", "buying", "news"],
    shop: [
      { label: "Vendetta sealed product", query: "Riftbound Vendetta booster box" },
      { label: "Unleashed boosters", query: "Riftbound Unleashed booster" },
    ],
    summary: [
      "**The Vendetta Vault is a sealed product**, not a set — [TODO: confirm exact product type, contents and RRP].",
      "**Endless Riches is the card people are searching for.** [TODO: confirm its exact name, rarity, set code and collector number.]",
      "**[TODO: confirm the Unleashed relationship]** — whether the Vault contains Unleashed boosters, Vendetta boosters, or both.",
      "**Nothing in this post is confirmed yet.** Every factual claim is marked for verification against Riot's announcement.",
    ],
    faq: [
      {
        q: "What is the Riftbound Vendetta Vault?",
        a: "A sealed Riftbound product tied to the Vendetta set. [TODO: confirm the product type, exactly what it contains, its RRP and its release date before publishing this answer.]",
      },
      {
        q: "What does Endless Riches do in Riftbound?",
        a: "[TODO: confirm the card's full rules text, cost, type and domain. Do not paraphrase from community reporting — use the official card image or Riot's own reveal.]",
      },
      {
        q: "Is the Vendetta Vault worth buying?",
        a: "That depends on its contents against the price of the same cards bought as singles, which is exactly what our box EV tool measures. [TODO: run the numbers once contents and RRP are confirmed.]",
      },
      {
        q: "How does the Vendetta Vault relate to Unleashed?",
        a: "[TODO: confirm. Searches pair the Vault with Unleashed boosters, so the relationship needs stating explicitly — whether the Vault includes Unleashed product, or the two are simply being compared by buyers.]",
      },
    ],
    browseCta: {
      href: "/sets/vendetta",
      label: "See the Vendetta set →",
      blurb: "Every Vendetta card with live prices across every store we track.",
    },
    body: `> **This post is a draft skeleton.** The Vendetta Vault and Endless Riches are trending faster than they are documented, and nothing below has been verified against an official source yet. Every factual claim is marked **[TODO]**. Do not publish until they are resolved.

The **Riftbound Vendetta Vault** is a sealed product tied to the Vendetta set, and **Endless Riches** is the card driving most of the search interest around it. **[TODO: write the real one-paragraph answer here once contents are confirmed — this intro is the featured-snippet target, so it must state plainly what the Vault is, what is in it, and what Endless Riches does.]**

## What the Vendetta Vault is

**[TODO: confirm all of the following before publishing.]**

- **Product type:** [TODO — box set, collector bundle, or something else]
- **Contents:** [TODO — full component list]
- **RRP:** [TODO — per region]
- **Release date:** [TODO]
- **Print run:** [TODO — is it limited?]

For the set itself, the **[Vendetta set page](/sets/vendetta)** already carries live prices on all 166 main-set cards, and the **[complete card gallery](/blog/every-riftbound-vendetta-card-revealed)** covers what is in the set proper.

## Endless Riches, the card

**[TODO: this is the highest-value section of the post — it is what most of the search traffic is actually looking for. Fill in from the official card image, not community reporting.]**

- **Full name:** [TODO]
- **Set and collector number:** [TODO]
- **Rarity:** [TODO]
- **Type and domain:** [TODO]
- **Rules text:** [TODO — quote exactly]

**[TODO: add a /card/ link to the Endless Riches card page once it is imported into the database.]**

### Why it is being searched for

**[TODO: confirm the actual reason — is it a chase card, a combo piece, a price spike, or a rules controversy? The framing of this whole post depends on the answer.]**

If it turns out to be a chase-tier printing, it belongs alongside the ones we already track in **[Vendetta's chase cards](/blog/riftbound-vendetta-chase-cards-so-far)**.

## How it fits with Unleashed

Searches pair the Vault with **Unleashed boosters**, which needs explaining rather than assuming.

**[TODO: confirm the relationship.]** The two plausible readings are that the Vault physically contains Unleashed product, or that buyers are simply weighing the Vault against Unleashed boosters as alternative purchases. These lead to completely different posts, so resolve this before writing the section.

The **[Unleashed set page](/sets/unleashed)** has live prices for that set either way.

## Is the Vault worth buying?

The method here does not depend on the unknowns, so it is worth stating even while the numbers are missing: a sealed product is worth buying when its contents cost more bought individually than the product costs sealed, plus whatever you value the sealed experience at.

Once contents and RRP are confirmed, run them through the **[box EV calculator](/tools/box-ev)**, which totals a sealed product's expected value from live singles prices. That turns "is it worth it" from an opinion into a number.

**[TODO: run this and state the result, with the date the prices were sampled.]**

[[shop]]

## Where to buy it cheapest

Once it is on sale, the Vault will be price-compared the same way as every other sealed product — see **[sealed product prices](/sealed)** for live comparisons across every store we track.

**[TODO: confirm which retailers are carrying it, and whether it is a Riot Merch Store exclusive like the T1 collection.]**

---

*Every claim above is unverified. Check [the official Riftbound site](https://playriftbound.com) and replace each [TODO] before this post goes live.*`,
  },
  {
    slug: "riftbound-sets-in-order",
    category: "guide",
    title: "Every Riftbound Set, In Order (And What's Next)",
    excerpt:
      "Origins through Vendetta, in release order, with the real card count for each — plus Radiance's confirmed date and where to check what's beyond it.",
    author: "RiftCompare",
    date: "2026-08-13",
    readMins: 5,
    tags: ["sets", "guide", "origins", "vendetta", "radiance"],
    hero: {
      src: "/signature-cards/jayce-defender-of-tomorrow-ven194.jpg",
      alt: "Jayce, Defender of Tomorrow — a real Riftbound Signature card from Vendetta, the newest released set",
    },
    summary: [
      "**Five sets are out today, in this order**: Origins, Origins: Proving Grounds, Spirit Forged, Unleashed, then Vendetta (31 Jul 2026).",
      "**Origins is the biggest so far** — 298 base cards, plus 54 Showcase treatments on top.",
      "**Radiance (Set 5) is next**, dated 23 October 2026 with a confirmed 180 cards (66 Showcase) — the only future set with a confirmed date right now.",
      "Everything after Radiance (Legacy, The Reckoning, two unnamed sets) is covered in full in the [2027 set roadmap](/blog/riftbound-2027-set-roadmap) — this page sticks to what's already out.",
    ],
    faq: [
      {
        q: "How many Riftbound sets are there?",
        a: "Five sets have released as of August 2026: Origins, Origins: Proving Grounds, Spirit Forged, Unleashed and Vendetta. A sixth, Radiance, is dated for 23 October 2026, and four more are announced for later in 2027 without full detail yet — see the 2027 set roadmap for those.",
      },
      {
        q: "What was the first Riftbound set?",
        a: "Origins (set code OGN) — the foundational set the game launched with, and still the largest by card count at 298 base cards.",
      },
      {
        q: "What is the newest Riftbound set?",
        a: "Vendetta is the newest set that has actually released, on 31 July 2026, with 166 cards. Radiance is dated for 23 October 2026 but hasn't released yet.",
      },
      {
        q: "When is the next Riftbound set?",
        a: "Radiance, 23 October 2026 — a confirmed 180 cards (66 Showcase), with five new champion Legends confirmed so far and four more still unrevealed: Seraphine, Evelynn, Ekko, Ziggs and Jarvan IV.",
      },
      {
        q: "Which Riftbound set has the most cards?",
        a: "Origins, at 298 base cards (352 once you count its 54 Showcase alternate printings) — more than any set released since. Spirit Forged and Unleashed are the next-largest, both in the 220s.",
      },
    ],
    browseCta: {
      href: "/sets",
      label: "Browse every set →",
      blurb: "Every Riftbound set on one page, with live prices the moment a set's cards are catalogued.",
    },
    body: `Riftbound has released five sets so far, always in the same order shops and players refer to them in. Here's that order, with the real card count for each straight from our own database — not a marketing figure — plus what's actually confirmed to come next.

## The sets, in order

| # | Set | Code | Cards | Released |
| --- | --- | --- | --- | --- |
| 1 | **[Origins](/sets/origins)** | OGN | 298 (+54 Showcase) | Launch set |
| 2 | **Origins: Proving Grounds** | OGS | 24 | Shortly after Origins |
| 3 | **Spirit Forged** | SFD | 221 (+66 Showcase) | — |
| 4 | **[Unleashed](/sets/unleashed)** | UNL | 219 (+61 Showcase) | — |
| 5 | **[Vendetta](/sets/vendetta)** | VEN | 166 | 31 Jul 2026 |
| 6 | **[Radiance](/release-dates)** | RAD | 180 total (66 Showcase) | 23 Oct 2026 |

The **Cards** column is each released set's own printed total — the denominator on every card in it. Origins collector numbers run 001/298 to 298/298, so Origins is 298; Spirit Forged cards are numbered out of /221 and Unleashed out of /219. That number is checkable on any single card you own, which is why we use it in preference to a catalogue row count: printings above the total (Signatures, over-numbered chase cards, promos) are real cards but they are not part of the base run, and counting them inflates a set. Radiance hasn't shipped, so there's no collector number to check yet — its 180 is Riot's own confirmed total, of which 66 are Showcase treatments, unlike the "+N Showcase" figures above it, which are printings on top of an already-released base count. We don't have confirmed release dates for Origins, Proving Grounds, Spirit Forged or Unleashed — Riot didn't publish exact street dates for those the way it later did for Vendetta and Radiance — but the order above is the order every set list, deck legality note and "what's next" post on the game agrees on.

## Origins — the launch set

[Origins](/sets/origins) is where Riftbound started, and it's still the biggest set by a wide margin: 298 base cards across every domain, plus 54 additional Showcase-rarity alternate printings of cards that already exist in the base 298 — 352 individual printings in total once you count both. If you want the full breakdown by rarity, domain and card type, we've written that up separately: [what's actually in the Origins set](/guides/whats-in-the-riftbound-origins-set).

## Origins: Proving Grounds — the smallest set

At 24 cards, Proving Grounds is by far the smallest Riftbound release to date — closer to a focused companion set than a full expansion. It shares Origins' set-code family (OGS) and released not long after it.

## Spirit Forged and Unleashed

The next two sets, Spirit Forged (SFD) and Unleashed (UNL), are similarly sized to each other: 221 and 219 base cards respectively, each with its own run of Showcase alternate printings (66 for Spirit Forged, 61 for Unleashed) on top. Between them they're the sets most current decks outside the newest formats are still built from.

Unleashed is the one worth a closer look if you're buying rather than just cataloguing — two of the four most expensive cards in the game come out of it. Browse the whole set card-by-card, with live prices, on the [Unleashed set page](/sets/unleashed).

## Vendetta — the current set

[Vendetta](/sets/vendetta) released on 31 July 2026 with 166 cards and introduced three new mechanics — Empower, Flow and Burn — none of which existed in any earlier set. It's the most recent set that's actually out, and the one every card page, price chart and deal on RiftCompare treats as "current" until Radiance lands.

## What's next: Radiance and beyond

[Radiance](/release-dates) — Set 5 — is dated for **23 October 2026** with a confirmed 180 cards (66 Showcase) and five new champion Legends named so far — Seraphine, Evelynn, Ekko, Ziggs and Jarvan IV — with four more still unrevealed. It's the only future set with a real, Riot-confirmed release date right now.

Beyond Radiance, Riot has mapped out the rest of 2027 — Legacy (Set 6, 29 Jan 2027, its biggest set yet at roughly 346 cards), The Reckoning (Set 7, 30 Apr 2027), and two further unnamed sets pencilled in for Q3 and Q4 2027. Rather than repeat those details here — and risk them drifting out of sync if Riot's dates move — the full breakdown, with what each set means for buyers, lives in the **[2027 set roadmap](/blog/riftbound-2027-set-roadmap)**.

## Track prices as new sets land

Every set gets its own page on RiftCompare the moment its cards are catalogued, with live prices compared across every store we track in your market. [Browse every set](/sets), or [set a price alert](/alerts) on a card or champion you're watching so you hear about it the moment a price moves — new-set launches are exactly when that matters most.`,
  },
  {
    slug: "whats-in-the-riftbound-origins-set",
    category: "guide",
    title: "What's in the Riftbound Origins Set?",
    excerpt:
      "298 base cards, 54 Showcase alternates, and exactly how they split across rarity, domain and card type — the real numbers from Riftbound's first and biggest set.",
    author: "RiftCompare",
    date: "2026-08-13",
    readMins: 6,
    tags: ["sets", "guide", "origins", "rarity", "collecting"],
    hero: {
      src: "https://cdn.riftscribe.gg/cards/originals/ogn-305-298-8e1d15a18d1dffb2.png",
      alt: "Yasuo, Unforgiven — a Showcase-rarity card from the Riftbound Origins set",
    },
    summary: [
      "**298 base cards**, numbered 001/298 through 298/298 with no gaps — Origins is still the largest Riftbound set released.",
      "**Rarity splits 88 Common / 84 Uncommon / 84 Rare / 42 Epic** across the base set, plus 54 Showcase-rarity alternate printings layered on top (352 total printings).",
      "**Units are the largest card type** at 142, well ahead of Spells (84), Gear (30), Battlefields (24), Legends (12) and Runes (6).",
      "All seven domains are represented — Fury and Calm lead at 49 cards each, Colorless sits lowest at 28.",
    ],
    faq: [
      {
        q: "How many cards are in the Riftbound Origins set?",
        a: "298 base cards, numbered 001/298 through 298/298. Counting the 54 additional Showcase-rarity alternate printings, there are 352 distinct Origins printings in total.",
      },
      {
        q: "What is the rarity breakdown of Origins?",
        a: "88 Common, 84 Uncommon, 84 Rare and 42 Epic across the 298 base cards — plus 54 Showcase-tier alternate printings of cards that already exist at one of those four rarities.",
      },
      {
        q: "How many Legend cards are in Origins?",
        a: "12 — the smallest card-type count in the set, well behind Units (142), Spells (84), Gear (30), Battlefields (24) and Runes (6).",
      },
      {
        q: "Which domain has the most cards in Origins?",
        a: "Fury and Calm are tied for the most at 49 cards each, followed by Mind and Body at 45 each, Chaos and Order at 41 each, and Colorless at 28.",
      },
    ],
    browseCta: {
      href: "/sets/origins",
      label: "Browse every Origins card →",
      blurb: "All 298 base cards and 54 Showcase printings, with live prices across every store we track.",
    },
    body: `Origins is Riftbound's first and, to date, biggest set. Here's exactly what's in it — not an estimate, the real counts from our own catalogue, broken down the way a set list actually gets used: by rarity, by domain and by card type.

## The headline number: 298 base cards

Origins' collector numbers run from 001/298 to 298/298 with no gaps — a clean, complete base set of 298 cards. On top of that, 54 cards also have a **Showcase**-rarity alternate printing: a premium treatment of a card that already exists in the base 298, not a new card. Counting both, there are **352 individual Origins printings** in our database.

That makes Origins comfortably the largest Riftbound set so far — see [every set in order](/guides/riftbound-sets-in-order) for how it compares to what came after.

## Rarity breakdown

| Rarity | Cards |
| --- | --- |
| Common | 88 |
| Uncommon | 84 |
| Rare | 84 |
| Epic | 42 |
| **Base total** | **298** |
| Showcase (alternate printings) | 54 |

Commons are the largest single tier at 88, but Uncommon and Rare are printed in almost identical numbers — 84 each — which is worth knowing if you're trying to gauge how "rare" a Rare-tier Origins card actually is relative to the rest of the set.

## Card type breakdown

| Type | Cards |
| --- | --- |
| Unit | 142 |
| Spell | 84 |
| Gear | 30 |
| Battlefield | 24 |
| Legend | 12 |
| Rune | 6 |

Units make up almost half the base set on their own. Legends — the champion cards that anchor a deck — are deliberately the scarcest type at just 12, and Runes are scarcer still at 6.

## Domain breakdown

| Domain | Cards |
| --- | --- |
| Fury | 49 |
| Calm | 49 |
| Mind | 45 |
| Body | 45 |
| Chaos | 41 |
| Order | 41 |
| Colorless | 28 |

Every domain gets real support in Origins — the spread runs from 28 (Colorless, which is expected to be the thinnest since it's usable in any deck rather than a deck's core identity) up to 49 for Fury and Calm.

## See the actual cards

Numbers are useful for planning a collection goal, but the fastest way to see what's actually printed is to browse the set itself: every Origins card, its live price across every store we track, and its full rules text.

[Browse the Origins set](/sets/origins) · [Origins card gallery](/sets/origins/gallery)

If you're building toward a specific rarity or domain, the [rarity and printings guide](/guides/understanding-riftbound-card-rarity) covers what separates a Showcase alternate from the base printing it comes from — worth reading before you go chasing one.`,
  },
  {
    slug: "riftbound-card-condition-guide",
    category: "guide",
    title: "Riftbound Card Condition Guide",
    excerpt:
      "What separates Near Mint from Lightly Played, why grading affects the price you should pay, and the real value multipliers RiftCompare uses for each condition tier.",
    author: "RiftCompare",
    date: "2026-08-13",
    readMins: 6,
    tags: ["condition", "grading", "guide", "collecting", "buying"],
    hero: {
      src: "/signature-cards/kennen-heart-of-the-tempest-ven197.jpg",
      alt: "Kennen, Heart of the Tempest — a real Riftbound Signature card, the kind of premium print worth careful handling",
    },
    summary: [
      "**Five condition tiers, standard across the TCG hobby**: Near Mint, Lightly Played, Moderately Played, Heavily Played, Damaged — Riftbound cards use the same scale as every other trading card game.",
      "**Prices on RiftCompare assume Near Mint** unless a listing says otherwise — that's the benchmark every store's headline price is quoted against.",
      "**Condition is a real price multiplier, not a vague discount**: a Lightly Played card is worth roughly 85% of the same card Near Mint; Damaged drops to around 40%.",
      "Grading is always the seller's judgement call — the same card can get graded differently by two different stores, so check listing photos on anything but a cheap common.",
    ],
    faq: [
      {
        q: "What does NM mean for a Riftbound card?",
        a: "Near Mint — a card with no visible wear: sharp corners, no scratches or scuffs, no whitening on the edges or back. It's the benchmark condition every store's headline price assumes unless stated otherwise.",
      },
      {
        q: "What's the difference between Lightly Played and Moderately Played?",
        a: "Lightly Played (LP) means minor wear only — a little edge whitening or a faint scuff, nothing that affects how the card looks from a normal distance. Moderately Played (MP) is a step up: visible scratches, more noticeable whitening, or light surface wear you'd spot without looking closely.",
      },
      {
        q: "Does card condition actually affect the price?",
        a: "Yes, substantially. As a rough guide, Lightly Played typically prices around 85% of Near Mint, Moderately Played around 70%, Heavily Played around 55%, and Damaged around 40% — though individual stores set their own exact discounts.",
      },
      {
        q: "Who decides a card's condition grade?",
        a: "The seller, at the point of listing — Riftbound doesn't have a centralised third-party grading body the way some other collectibles do. That's why the same card can be graded slightly differently by two different stores; check listing photos before buying anything above a low-value common.",
      },
      {
        q: "Should I buy graded (slabbed) Riftbound cards?",
        a: "Third-party grading (PSA and similar) exists for Riftbound's highest-value chase cards, but it's a separate market from raw (ungraded) singles pricing, and most cards you'll buy day-to-day are traded raw. Treat a graded card's price as its own thing rather than a multiple of the raw price.",
      },
    ],
    browseCta: {
      href: "/browse",
      label: "Browse Riftbound cards →",
      blurb: "Every card's live price across every store we track — Near Mint unless a listing says otherwise.",
    },
    body: `Every Riftbound price you see — on RiftCompare or anywhere else — is quoted against a condition grade, whether or not the store says so out loud. Here's what each grade actually means, and why it should change what you're willing to pay.

## The five condition tiers

Riftbound singles use the same five-tier condition scale as most other modern trading card games:

| Grade | Full name | What it looks like |
| --- | --- | --- |
| **NM** | Near Mint | No visible wear — sharp corners, clean surface, no edge whitening. The benchmark condition. |
| **LP** | Lightly Played | Minor wear only: a touch of edge whitening or a faint scuff, not obvious at a glance. |
| **MP** | Moderately Played | Visible scratches or scuffing, more noticeable whitening, wear you'd spot without looking closely. |
| **HP** | Heavily Played | Significant wear — creasing, heavier whitening, rounded or damaged corners. Still whole and playable. |
| **DMG** | Damaged | Structural damage: tears, water damage, heavy creasing, writing, or anything beyond cosmetic wear. |

**Near Mint is the benchmark.** Unless a listing explicitly says otherwise, assume a quoted price is for a Near Mint copy — that's the condition every price comparison on RiftCompare, and effectively every store's headline price, is quoted against.

## Why condition changes what you should pay

Condition isn't a vague "a bit cheaper" — it's a real, fairly consistent discount off the Near Mint price. As a rough guide across the hobby:

- **Lightly Played** — around 85% of Near Mint
- **Moderately Played** — around 70% of Near Mint
- **Heavily Played** — around 55% of Near Mint
- **Damaged** — around 40% of Near Mint

Those are typical ranges, not a fixed rule — individual stores set their own condition discounts, and a genuinely rare or expensive card can hold its value at a lower grade better than a cheap common does, simply because demand for that specific card is higher regardless of condition.

## Grading is a judgement call, not a certificate

Unlike some collectibles markets, raw Riftbound singles don't go through a centralised third-party grader before they're sold — the store or the seller assigns the condition at the point of listing, based on their own eye and their own standards. That means:

- **The same physical card can get graded differently by two stores.** One might call a card Lightly Played where another calls it Near Mint.
- **Photos matter more than the label.** On anything above a cheap common, look at the actual listing photos rather than trusting the grade alone — especially for corners and edges, where wear is easiest to miss in a low-resolution photo and easiest to spot in a good one.
- **"NM/M" or "NM-M" listings** (Near Mint to Mint) are common shorthand for "as good as it gets" — factory-fresh, no handling wear at all.

## Third-party grading (slabbed cards)

Riftbound's highest-value chase cards — Signature printings, alt-arts, cards tied to popular champions — increasingly get sent to third-party grading services (PSA and similar), which assign a numeric grade and seal the card in a protective case. That's a genuinely different market from raw singles: a graded card's price reflects both the card and the grade, and doesn't move as a simple multiple of the raw Near Mint price. If you're buying to collect rather than to play, it's worth deciding up front whether you want raw or graded copies — the two markets can diverge significantly on a card's most expensive printings. See **[the PSA & BGS grading guide](/guides/riftbound-psa-bgs-grading-guide)** for how the two services differ and whether it's worth it for a specific card.

## Buying with condition in mind

When you're comparing prices — on RiftCompare or anywhere else — the condition grade is doing as much work as the number next to it. A "cheap" Moderately Played listing next to a Near Mint one at a similar price isn't actually the better deal.

[Browse every Riftbound card](/browse) for live prices across every store we track, or read [how to store and protect your cards](/guides/how-to-store-and-protect-riftbound-cards) so the condition you buy at is the condition you still have next year.`,
  },
  {
    slug: "is-there-a-league-of-legends-card-game",
    category: "guide",
    title: "Is There a League of Legends Card Game?",
    excerpt:
      "Searching for a League of Legends card game? Riftbound is Riot's real, physical trading card game set in the League universe — official, in stores now, with real LoL champions as playable cards.",
    author: "RiftCompare",
    date: "2026-08-13",
    readMins: 6,
    tags: ["beginners", "guide", "league of legends", "new player"],
    hero: {
      src: "/signature-cards/zed-master-of-shadows-ven191.jpg",
      alt: "Zed, Master of Shadows — a real, hand-signed Riftbound Signature card of the League of Legends champion",
    },
    summary: [
      "**Yes — it's called Riftbound.** A real, physical trading card game from Riot Games, published in English by UVS Games, set in the League of Legends universe.",
      "**It's official, not a fan project** — the same company that makes League of Legends made this, and it's sold in game stores worldwide.",
      "**Real League champions are playable cards.** Ahri, Jinx, Yasuo, Zed, Lux and dozens more already have Riftbound cards — see [which champions are in Riftbound](/guides/league-of-legends-champions-in-riftbound).",
      "**It's a different kind of game.** No client to install, no matchmaking — Riftbound is a turn-based strategy card game you play with a physical deck, closer to a board game night than a MOBA.",
    ],
    faq: [
      {
        q: "Is there a League of Legends card game?",
        a: "Yes — it's called Riftbound: League of Legends TCG. It's a real, physical trading card game made by Riot Games (the studio behind League of Legends) and published in English by UVS Games. It's an official product, sold in game and hobby stores, not a fan-made spinoff.",
      },
      {
        q: "What is Riftbound?",
        a: "Riftbound is a collectible card game set in the League of Legends universe. Players build a deck around a Legend — a champion from League of Legends — using cards drawn from the game's six domains (Fury, Calm, Mind, Body, Chaos, Order) plus Colorless, and card types including Units, Spells, Gear, Runes and Battlefields.",
      },
      {
        q: "Is Riftbound made by Riot Games?",
        a: "Yes. Riftbound is Riot Games' own physical trading card game, published in English by UVS Games — it isn't a third-party or unofficial product.",
      },
      {
        q: "Can I play as my favourite League of Legends champion in Riftbound?",
        a: "Many League champions already have real Riftbound cards, and more are added with every new set — see the full, always-current list on the champions page to check yours specifically.",
      },
      {
        q: "How is Riftbound different from League of Legends the video game?",
        a: "They share a universe and characters, but they're different kinds of games entirely. League of Legends is a live, real-time multiplayer video game you play online. Riftbound is a turn-based physical card game — you build a deck, shuffle real cards, and play across a table (or online through unofficial simulators), with no client, matchmaking or reflexes involved.",
      },
      {
        q: "How do I start playing Riftbound?",
        a: "The cheapest way in is a preconstructed starter deck — it's complete and playable out of the box. See the full beginner's guide for exactly what to buy first.",
      },
    ],
    browseCta: {
      href: "/learn",
      label: "Learn to play, free →",
      blurb: "An interactive, step-by-step walkthrough of a full Riftbound game — no signup, no rules book required.",
    },
    body: `If you searched something like "LoL card game" or "is there a League of Legends card game" and landed here — yes. It's called **Riftbound**, and it's real: an official, physical trading card game from Riot Games, the same studio that makes League of Legends.

## So, is there a League of Legends card game?

Yes. **Riftbound: League of Legends TCG** is a genuine, in-print trading card game — not a fan project, not a mobile spin-off, not a mod. It's published in English by UVS Games, sold through game and hobby stores the same way Magic: The Gathering or Pokémon are, and it's set directly in the League of Legends universe: the same champions, the same world, translated into a deck-building card game you play with real cards across a table.

If you've played League of Legends and are curious whether "there's a card game version," the honest short answer is: yes, and it's had real, dedicated sets released regularly since launch — five so far, with [more already dated](/guides/riftbound-sets-in-order).

## What Riftbound actually is

Riftbound is a collectible card game built around **Legends** — champion cards that anchor your deck. You've likely recognised the name already: Legends are drawn from League of Legends' own champion roster. Around them, you build a deck using cards from six **domains** — Fury, Calm, Mind, Body, Chaos and Order, plus a Colorless pool any deck can use — and several card types: Units, Spells, Gear, Runes and Battlefields.

That's the whole shape of it. Two players build decks, take turns, and use their Legend and supporting cards to out-manoeuvre each other — the same kind of structure you'd recognise from any strategy card game, just wearing League of Legends' characters and world.

## How it connects to the game you already know

The connection isn't just cosmetic. Real League of Legends champions are the actual playable Legend cards — **Ahri, Jinx, Yasuo, Zed, Lux, Ezreal, Katarina, Vi, Caitlyn, Jhin** and dozens more already have real, released Riftbound cards, and every new set adds champions who didn't have cards before. Radiance, the next confirmed set, adds five more: Seraphine, Evelynn, Ekko, Ziggs and Jarvan IV.

If you're wondering whether your specific main made the cut, the [champions page](/champions) is a live, always-current list — every League champion with a Riftbound card, how many cards they have, and what those cards cost right now.

## What's different from the video game

It's worth being upfront about this, because the two products don't play anything alike:

- **No client, no matchmaking.** League of Legends is a live online video game. Riftbound is a physical (and, through community tools, digital-simulator) card game — you build a deck ahead of time and play it out, turn by turn, rather than queuing into a live match.
- **Strategy over reflexes.** There's no mechanical skill ceiling the way there is with last-hitting or skillshots — the game is decided by deckbuilding decisions and the choices you make each turn.
- **A collection, not an account.** Progress in Riftbound is physical cards you own, not an account you level up. That's also why prices matter — which is the entire reason RiftCompare exists.

If that sounds appealing rather than off-putting, the crossover tends to land well: the same champion identities and world-building, in a genre that rewards patient, considered play over reaction time.

## How to start playing

You don't need to know the full rule set before you touch a card. The fastest way in:

1. **Get a starter product.** A preconstructed deck gives you a complete, playable deck immediately — no guessing what to buy. Compare prices on the [sealed products page](/sealed).
2. **Learn by playing.** The [interactive learn page](/learn) walks through a full game step by step, domain by domain, free and with no signup — good either before or after your first real game.
3. **Upgrade with singles, not boxes.** Once you know what your deck wants, [individual cards](/browse) are the cheapest way to improve it — far cheaper than opening boosters hoping to pull what you need.

For the fuller walkthrough — what to buy first, what to skip, and how to budget your first purchase — see the [complete beginner's guide](/guides/riftbound-for-beginners).

## Where to buy

Once you're ready to buy anything — a starter deck, a booster box, or your first few singles — RiftCompare compares live prices across every store we track in your market, so you're not stuck taking the first price you find. [Browse the card database](/browse) or [compare sealed products](/sealed) to get started.`,
  },
  {
    slug: "league-of-legends-champions-in-riftbound",
    category: "guide",
    title: "Which League of Legends Champions Are in Riftbound?",
    excerpt:
      "Ahri, Jinx, Yasuo, Zed and dozens more League of Legends champions already have real Riftbound cards, with more added every set. Here's how the champion system works, and how to check if yours does.",
    author: "RiftCompare",
    date: "2026-08-13",
    readMins: 5,
    tags: ["champions", "guide", "league of legends", "new player"],
    hero: {
      src: "https://cdn.riftscribe.gg/cards/originals/ogn-303-298-83981e813ecd5837.png",
      alt: "Ahri, Nine-Tailed Fox — a Showcase-rarity Riftbound card from the Origins set",
    },
    summary: [
      "**Dozens of League of Legends champions already have real Riftbound cards** as Legends — the champion that anchors a deck — with more added in every new set.",
      "**Recognisable names already in the game** include Ahri, Jinx, Yasuo, Zed, Lux, Ezreal, Katarina, Vi, Caitlyn and Jhin.",
      "**Radiance, the next set, adds five more**: Seraphine, Evelynn, Ekko, Ziggs and Jarvan IV.",
      "The exact, always-current list — every champion with a card, how many, and live prices — is on the [champions page](/champions), not a static list that goes stale.",
    ],
    faq: [
      {
        q: "Are League of Legends champions playable in Riftbound?",
        a: "Yes — a League of Legends champion becomes a Legend card in Riftbound, the card that anchors and identifies your deck. Dozens of champions already have real cards, and more are added with every new set.",
      },
      {
        q: "How many League of Legends champions are in Riftbound?",
        a: "Dozens so far, and the number grows with every set — Riftbound only adds a champion once real cards for them exist, rather than announcing one in advance. See the champions page for the exact, always-current count and list.",
      },
      {
        q: "Is my favourite League of Legends champion in Riftbound?",
        a: "Check the champions page — it's a live list built directly from the card database, so it's always accurate to what's actually printed, rather than a list that can go stale.",
      },
      {
        q: "What is a Legend card in Riftbound?",
        a: "A Legend is the champion card your deck is built around — the closest thing Riftbound has to League of Legends' own champion select. Your Legend shapes what domains and strategies your deck leans into.",
      },
      {
        q: "Do champions get new cards in every Riftbound set?",
        a: "Existing champions can get additional printings and treatments, and each new set has historically introduced champions who didn't have a Riftbound card before — Radiance, the next set, adds five: Seraphine, Evelynn, Ekko, Ziggs and Jarvan IV.",
      },
    ],
    browseCta: {
      href: "/champions",
      label: "See every champion with a card →",
      blurb: "The full, live list — every League of Legends champion with a Riftbound card, how many, and today's cheapest price.",
    },
    body: `If you play League of Legends and are wondering whether your main made it into Riftbound, there's a good chance they already have — and if not yet, there's a real chance they will.

## How champions work in Riftbound

Every League of Legends champion who appears in Riftbound does so as a **Legend** card — the card your entire deck is built around. It's the closest thing Riftbound has to picking a champion in League of Legends itself: your Legend sets the tone for which [domains](/learn) (Fury, Calm, Mind, Body, Chaos, Order) and strategies your deck leans into.

Champions aren't added speculatively. A champion gets real Riftbound cards through an actual set release, not an announcement — which means the list of "who's in Riftbound" only ever reflects cards that genuinely exist and are genuinely buyable.

## Champions already in the game

Dozens of League of Legends champions already have real, released Riftbound cards. Recognisable names already in the game include:

**Ahri**, **Jinx**, **Yasuo**, **Zed**, **Lux**, **Ezreal**, **Katarina**, **Vi**, **Caitlyn**, **Jhin**, **Lee Sin**, **Darius**, **Garen**, **Jayce**, **Mel**, **Ashe**, **Sett** — and that's a small sample, not the full list. New champions have joined with every set released so far.

## Who's next: Radiance's new champions

The next confirmed set, [Radiance](/release-dates), adds **five** champions who don't have a Riftbound Legend card yet: **Seraphine**, **Evelynn**, **Ekko**, **Ziggs** and **Jarvan IV**. If one of those is your main, Radiance — dated 23 October 2026 — is when you'll be able to build around them.

## Check if your main is in Riftbound

Rather than trying to keep a static list current (champions are added with every set, so any fixed list here would be out of date within weeks), the **[champions page](/champions)** is a live table built directly from the card database: every League of Legends champion with a Riftbound card, exactly how many cards they have, and today's cheapest price for each. It's the one place this list can't go stale.

## Start with a champion you already know

If you're coming from League of Legends and want the easiest way in, starting with a Legend you already have hours on is a genuinely good approach — you already understand their identity and strengths, which carries over into how they play as a Legend. See [Riftbound for beginners](/guides/riftbound-for-beginners) for how to build your first deck around one, or [what Riftbound actually is](/guides/is-there-a-league-of-legends-card-game) if you're still getting your bearings.`,
  },
  {
    slug: "shen-eye-of-twilight-signature-underrated-vendetta",
    category: "blog",
    title: "Shen's Underrated Vendetta Signature Card",
    excerpt:
      "Our case for why the Shen, Eye of Twilight Signature — collectors call it \"Armpit Boi\" — deserves more attention. Opinion, with real prices.",
    author: "RiftCompare",
    date: "2026-08-13",
    readMins: 5,
    tags: ["opinion", "vendetta", "chase cards", "signature", "shen"],
    hero: {
      src: "/signature-cards/shen-eye-of-twilight-ven193.jpg",
      alt: "Shen, Eye of Twilight Signature (VEN 193★/166) — the tightly-cropped \"Armpit Boi\" art, hand-signed by artist Oscar Vega",
    },
    summary: [
      "**This is opinion, not a price call.** The numbers below are real and current; the case for \"underrated\" is our read on them, not a guarantee.",
      "**Shen, Eye of Twilight (VEN 193★/166)** is currently US$544.66 / A$816.70 / £618.70 / S$895.78 / C$746.18 — already a genuinely expensive card, not a hidden cheap one.",
      "**The case rests on three real things**: an unusually tight, distinctive art crop (hence the nickname), a thin two-store market that hasn't fully priced in how hard it may get to find, and Shen's broad popularity as a League of Legends champion.",
      "**A close comparable — Ambessa, Matriarch of War's Signature — trades at a similar price on similarly thin stock**, so this isn't a case of Shen being cheap next to its peers. It's a case that the whole tier might have room to move.",
    ],
    faq: [
      {
        q: "What is the Shen \"Armpit Boi\" card in Riftbound?",
        a: "It's the community nickname for Shen, Eye of Twilight (VEN 193★/166) — Shen's Signature-tier Legend printing from Vendetta, hand-signed by artist Oscar Vega. The nickname comes from the art's unusually tight crop, framed around a raised-arm pose.",
      },
      {
        q: "Is Shen, Eye of Twilight expensive?",
        a: "Yes — it's currently priced around US$545 / A$817, in line with other Vendetta Signature Legends, not a bargain-bin card. \"Underrated\" here refers to our view that it has room to move further, not that it's currently cheap.",
      },
      {
        q: "Is the Shen Signature a good investment?",
        a: "That's genuinely a matter of opinion, and we'd rather be straight about that than pretend otherwise. Riftbound doesn't have a long enough price history for confident predictions, and RiftCompare's role is to report real, live prices — this article is our take, not a guarantee.",
      },
      {
        q: "Why is it called \"Armpit Boi\"?",
        a: "It's a collector nickname for the card's art — an unusually tight, cropped composition built around Shen's raised arm — rather than an official Riot name.",
      },
    ],
    browseCta: {
      href: "/card/shen-eye-of-twilight-ven-193s-166",
      label: "See live prices for this card →",
      blurb: "Current price across every store we track, updated as the market moves.",
    },
    body: `A quick disclosure before anything else: **this is our opinion**, not a price call you should treat as guaranteed. Riftbound doesn't have the price history to make confident predictions about anything, and we say so on every valuation piece we publish. What follows is our honest read on one specific card, with the real numbers shown alongside it so you can weigh it yourself.

## The card

**Shen, Eye of Twilight** (VEN 193★/166) is Shen's Signature-tier Legend printing from [Vendetta](/sets/vendetta) — a Calm-domain Legend whose printed ability reads: *"ACTION: Give a friendly unit Tank this turn."* Like every Signature printing, it carries a real hand-signature from its artist, Oscar Vega, over a premium alternate-art treatment. It's the reason Signature cards sit at the very top of Riftbound's rarity ladder: each one is a physically unique object, not just a scarce print run.

Collectors have taken to calling it **"Armpit Boi"** — and having looked at the actual card, it's an accurate description, not an exaggeration. The art is an unusually tight, close-cropped composition built around Shen's raised arm, a bolder crop than most Legend art goes for. It's a distinctive piece specifically because of that choice, not despite it.

## The real numbers

As of publishing, Shen, Eye of Twilight is priced at:

| Market | Price |
| --- | --- |
| Australia | A$816.70 |
| United States | US$544.66 |
| United Kingdom | £618.70 |
| Singapore | S$895.78 |
| Canada | C$746.18 |

That's already a serious price — this is not a card sitting cheap and unnoticed. It's also thinly stocked: only **two stores** carry it right now across the markets we track. [Check the live price](/card/shen-eye-of-twilight-ven-193s-166) before it moves.

There's a second, separate "Shen, Eye of Twilight" printing (193/166, without the signature) at a much lower price — that's a different, non-signed Showcase alternate-art, not the same card. If you're chasing the signed one specifically, check the collector number carries the ★.

## The case for underrated

Here's our reasoning, laid out plainly as reasoning rather than fact:

**The art is doing something few other Legends do.** Most Legend art plays it safe with a fuller, more conventional character portrait. This one commits fully to an unconventional crop, which is exactly the kind of choice that tends to age into being more sought-after, not less, once a set's early-days pricing settles down.

**The stock is thin enough that the current price may not hold.** Two stores carrying a card at all six of RiftCompare's tracked markets is a genuinely small sample — a market that thin can reprice quickly in either direction the moment even one of those listings sells or a new buyer starts actively looking.

**Shen's reach as a League of Legends champion is broad.** He's one of the more enduringly popular characters in League's own roster, which matters here specifically because signature Legend prices tend to track character demand as much as in-game strategic relevance.

## What this isn't

We checked the closest comparable we could find — **Ambessa, Matriarch of War**'s Signature printing, also from Vendetta — and it's priced within a similar band on similarly thin stock (around US$495 / A$727, two stores). So this isn't a claim that Shen's Signature is mispriced against its direct peers; it currently isn't. The case here is broader: that Vendetta's Signature Legends as a tier, Shen's included, may not have finished settling into their real price yet — and if that's right, a card with this card's specific combination of distinctive art, thin stock and character popularity is a reasonable one to have on a watchlist.

## Make your own call

We'd rather show you the real numbers and our actual reasoning than tell you what to do with them. If you want to track it, [set a price alert](/alerts) rather than committing based on any one article — ours included.`,
  },
  // The 2026 SEO content pack — the five briefed articles plus the four
  // AI-visibility target pages and the variant glossary. Kept in their own file
  // so the batch stays reviewable; spread here so every existing surface (the
  // /blog and /guides indexes, the sitemap's `content` section, the feeds, the
  // related-posts module, the /llm markdown mirrors) picks them up unchanged.
  {
    slug: "every-ahri-card-in-riftbound",
    category: "blog",
    title: "Every Ahri Card in Riftbound",
    excerpt:
      "Twelve Ahri printings across three cards, from US$8.95 to US$3,420.28 — including two prints that look identical except for a signature worth US$3,046.",
    author: "RiftCompare",
    date: "2026-08-15",
    readMins: 6,
    tags: ["ahri", "champions", "collecting", "chase cards"],
    hero: {
      src: "https://cdn.riftscribe.gg/cards/originals/ogn-303-star-298-d34b6d90cc0eee6c.png",
      alt: "Ahri, Nine-Tailed Fox (OGN 303*/298) — the Signature printing, the most expensive Riftbound card tracked",
    },
    summary: [
      "**There are twelve Ahri printings**, and they are not twelve versions of one card — they are three different cards: Nine-Tailed Fox, Inquisitive and Alluring.",
      "**The range is enormous.** US$8.95 for the base Ahri, Inquisitive; US$3,420.28 for the Signature Nine-Tailed Fox. That is the same champion, roughly 382 times apart.",
      "**Ahri holds the top two spots** in the whole Riftbound market — the OGN Signature Legend and the SFD Signature Unit.",
      "**One printed signature is worth about US$3,046.** OGN 303/298 and 303*/298 are the same art, rules and rarity; only the asterisk and the signature across the artwork differ.",
    ],
    closeups: [
      {
        caption: "The white scrawl across the artwork is the artist's signature (Airi Pan). It is the only visible difference between the US$374.22 printing and the US$3,420.28 one.",
        slugs: ["ahri-nine-tailed-fox-ogn-303s-298"],
        topPct: 34,
        heightPct: 28,
      },
    ],
    embeds: [
      {
        title: "All twelve Ahri printings",
        note: "Grouped by card and printing. Prices are live and in your own market — click any card for every store that stocks it.",
        slugs: [
          "ahri-nine-tailed-fox-ogn-303s-298",
          "ahri-inquisitive-sfd-227s-221",
          "ahri-inquisitive-sfd-227-221",
          "ahri-nine-tailed-fox-ogn-303-298",
          "ahri-nine-tailed-fox-ogn-255-298",
          "ahri-nine-tailed-fox-ogn-255-298-promo",
          "ahri-alluring-ogn-066-298",
          "ahri-alluring-ogn-066-298-promo",
          "ahri-inquisitive-ven",
          "ahri-inquisitive-ogn-119a-298",
          "ahri-alluring-ogn-066a-298",
          "ahri-inquisitive-ogn-119-298",
        ],
        take: 12,
      },
    ],
    shop: [
      { label: "Ahri singles", query: "Riftbound Ahri" },
      { label: "Ahri Signature", query: "Riftbound Ahri signature" },
    ],
    faq: [
      {
        q: "How many Ahri cards are there in Riftbound?",
        a: "Twelve printings as of 15 August 2026, spread across three distinct cards: Ahri, Nine-Tailed Fox (a Calm Legend), Ahri, Inquisitive (a Mind Unit) and Ahri, Alluring (a Calm Champion Unit). The rest of the twelve are alternate arts, promos and Signature versions of those three.",
      },
      {
        q: "What is the most expensive Ahri card?",
        a: "Ahri, Nine-Tailed Fox OGN 303*/298 — the Signature printing — at US$3,420.28, which is also the most expensive Riftbound card we track. Ahri, Inquisitive SFD 227*/221 is second at US$3,089.05.",
      },
      {
        q: "What is the cheapest Ahri card?",
        a: "Ahri, Inquisitive OGN 119/298, the base Epic printing, at US$8.95 with eleven stores stocking it. It is the same character and the same rules text as printings costing hundreds of times more.",
      },
      {
        q: "Why are two Ahri cards with the same number priced so differently?",
        a: "Check for an asterisk. OGN 303/298 is US$374.22 and OGN 303*/298 is US$3,420.28. The asterisk marks a Signature printing, which carries the artist's signature across the artwork. The art, the rules and the rarity are otherwise identical.",
      },
      {
        q: "Which Ahri card should I buy to actually play with?",
        a: "The cheapest printing of whichever card your deck wants, because printings are interchangeable in play. Ahri, Inquisitive at US$8.95 plays exactly the same as the US$3,089.05 Signature of the same card. Premium printings are a collecting decision, not a competitive one.",
      },
    ],
    browseCta: {
      href: "/browse?q=Ahri",
      label: "Compare every Ahri printing →",
      blurb: "All twelve, side by side, with live prices from every store we track in your market.",
    },
    body: `
Ahri is the most valuable champion in Riftbound, and it is not close. She holds **both** of the top two spots in the entire market. She is also, at the other end, one of the cheapest champions you can put in a deck.

Both of those things are true at once, and the gap between them is the whole story of how Riftbound pricing works.

## Three different cards, not one

The first thing that trips people up: "an Ahri card" is ambiguous, because there are **three separate cards** with her name on them.

| Card | Type | Domain | First printed in |
| --- | --- | --- | --- |
| **Ahri, Nine-Tailed Fox** | Legend | Calm | Origins |
| **Ahri, Inquisitive** | Unit | Mind | Origins |
| **Ahri, Alluring** | Champion Unit | Calm | Origins |

They do different things and go in different decks. A listing that just says "Ahri" tells you almost nothing — you need the collector number.

## The full range

Across those three cards there are **twelve printings**, and the spread is extraordinary:

| Printing | Card | Live US price |
| --- | --- | --- |
| OGN 303*/298 | Nine-Tailed Fox *(Signature)* | **US$3,420.28** |
| SFD 227*/221 | Inquisitive *(Signature)* | US$3,089.05 |
| SFD 227/221 | Inquisitive | US$640.00 |
| OGN 303/298 | Nine-Tailed Fox | US$374.22 |
| OGN 255/298 | Nine-Tailed Fox *(promo)* | US$269.00 |
| OGN 066/298 | Alluring *(promo)* | US$173.55 |
| VEN SP3/006 | Inquisitive | US$92.48 |
| OGN 119a/298 | Inquisitive *(alt art)* | US$16.90 |
| OGN 066a/298 | Alluring *(alt art)* | US$10.25 |
| OGN 119/298 | Inquisitive | **US$8.95** |

Top to bottom that is a factor of roughly **382**. Same champion, same artwork in several cases, same rules text.

[[embed:0]]

## The US$3,046 signature

The clearest illustration in the game sits inside this list. **Ahri, Nine-Tailed Fox** was printed twice at collector number 303:

| | OGN 303/298 | OGN 303*/298 |
| --- | --- | --- |
| Artwork | Identical | Identical |
| Rules text | Identical | Identical |
| Rarity | Showcase | Showcase |
| Artist signature | — | Printed across the art |
| **Live US price** | US$374.22 | **US$3,420.28** |

[[closeup:0]]

That white scrawl is the entire difference. It is worth about **US$3,046**, or roughly nine times the price of the unsigned card.

This is why the asterisk in a collector number matters more than almost anything else when you are buying. If a listing photo is low-resolution and the seller has written only "Ahri Showcase", you are looking at two possible cards an order of magnitude apart in value. Ask for the number.

The same pattern repeats on **Ahri, Inquisitive** in Spirit Forged: SFD 227/221 is US$640.00 and SFD 227*/221 is US$3,089.05 — about 4.8 times, for the same reason.

[[shop]]

## What this means if you are buying

**To play: buy the cheapest printing.** Printings are interchangeable at the table. Ahri, Inquisitive at **US$8.95** does exactly what the US$3,089.05 Signature does. Eleven stores stock the cheap one, so you will not struggle to find it.

**To collect: decide which of the three cards you actually want**, then pick a tier within it. The Legend is the flagship; Inquisitive is the one with the strongest premium market in two sets; Alluring is the accessible one, with a Showcase alternate art at **US$10.25** that looks far more expensive than it is.

**Whatever you do, buy by collector number.** Every real difference in this article is a number, not a name.

## Related reading

- [Riftbound variant glossary](/guides/riftbound-variant-glossary) — where the collector number and the asterisk live, and how to spot a Signature.
- [The most expensive Riftbound cards](/blog/most-expensive-riftbound-cards) — the full top of the market, live.
- [League of Legends champions in Riftbound](/guides/league-of-legends-champions-in-riftbound) — who else has made it into the game.
`,
  },
  {
    slug: "are-riftbound-cards-a-real-investment",
    category: "blog",
    title: "Are Riftbound Cards a Real Investment?",
    excerpt:
      "Our Riftbound price tracking only goes back eleven days. What that means for anyone asking if these cards are an investment — real numbers, no guessing.",
    author: "RiftCompare",
    date: "2026-08-15",
    readMins: 9,
    tags: ["investing", "opinion", "market analysis", "risk", "collecting"],
    hero: {
      src: "https://cdn.riftscribe.gg/cards/originals/ogn-303-star-298-d34b6d90cc0eee6c.png",
      alt: "Ahri, Nine-Tailed Fox (OGN 303*/298), the Signature printing — priced nine times its unsigned twin, and the clearest real example of where Riftbound value actually sits today",
    },
    summary: [
      "**This is analysis, not financial advice — and the honest headline finding is that nobody has enough data yet to give real investment advice about Riftbound cards.** Our own price tracking, which follows the game's most-traded singles, only goes back eleven days as of this writing.",
      "**We can't tell you the 7-day or 30-day return, because those numbers don't exist yet.** Not \"we won't say\" — the data literally isn't there. Neither window has enough price history behind it yet.",
      "**What we can show you is real and current:** which printings already carry genuine scarcity premiums (one card is worth 9× its twin for a single printed signature), how volatile a market this thin already looks, and exactly what it costs to buy and sell.",
      "**If you already own cards and want to know what they're worth, that's a different — and answerable — question.** [Set a free price alert](/alerts) rather than guessing.",
    ],
    faq: [
      {
        q: "Are Riftbound cards a good investment?",
        a: "Nobody can honestly answer that yet, ourselves included. Riftbound has released five sets, the newest of which is two weeks old, and our own price tracking only goes back to 4 August 2026. There is no multi-year track record to point to, up or down. What we can tell you is what the market looks like today: real prices, real fees, real volatility. Whether today's prices look smart in five years is not something the data can answer yet.",
      },
      {
        q: "What actually makes a Riftbound card valuable right now?",
        a: "Print scarcity, almost entirely. A Signature printing (marked with an asterisk in the collector number) or an over-numbered chase print can be worth many times its plain twin — Ahri, Nine-Tailed Fox goes from US$374.22 unsigned to US$3,420.28 signed, identical art and rules. That's a real, observable premium for scarcity today. It is not evidence that the premium will still be there next year — nobody has owned these long enough to know.",
      },
      {
        q: "What fees will I actually pay if I sell a Riftbound card?",
        a: "It depends where you sell. eBay's final value fee for trading cards is commonly around 13.25%, charged on the total including shipping. TCGplayer charges a tiered marketplace commission plus separate payment processing, netting most sellers somewhere in the low-to-mid 80% of the sale price before shipping costs. A direct trade or local sale avoids commission entirely but gives up buyer protection.",
      },
      {
        q: "Can a Riftbound card lose value overnight through no fault of the card?",
        a: "Yes, and it's already happened. On 24 July 2026, Riot banned three cards from Standard play — Stealthy Pursuer, The Arena's Greatest and Aspirant's Climb — and introduced a separate ban list for Constructed 2v2. A card that's competitively banned doesn't stop existing, but it loses the demand that comes from being playable, which is a risk that doesn't exist for a closed, no-longer-published collectible like a vintage trading card.",
      },
    ],
    browseCta: {
      href: "/alerts",
      label: "Track what you already own →",
      blurb: "Free price alerts across every store we track — the honest alternative to guessing whether now is the time to sell.",
    },
    closeups: [
      {
        caption: "The white signature across the artwork is the entire visible difference between this US$3,420.28 card and its US$374.22 unsigned twin. That gap is real and current. Whether it's still there in a year is exactly the kind of thing an 11-day-old market can't tell you.",
        slugs: ["ahri-nine-tailed-fox-ogn-303s-298"],
        topPct: 34,
        heightPct: 28,
      },
    ],
    embeds: [
      {
        title: "The cards named in this article",
        note: "Every price above is live and checkable — click through to see every store selling each printing, in your own market.",
        slugs: [
          "ahri-nine-tailed-fox-ogn-303-298",
          "ahri-nine-tailed-fox-ogn-303s-298",
          "ahri-nine-tailed-fox-ogn-255-298",
          "ahri-nine-tailed-fox-ogn-255-298-promo",
          "diana-scorn-of-the-moon-unl-197-219",
          "diana-scorn-of-the-moon-unl-197-219-promo",
        ],
        take: 6,
      },
    ],
    body: `Type "are Pokémon cards a real investment" into a search engine and you'll find guides pulling on three decades of PSA grading volumes and named auction sales to answer it — Pikachu Illustrator, Charizard's climb, all of it dated, sourced, arguable but *checkable*.

Type the same question with "Riftbound" instead, and there's no honest way to answer it the same way. Not because we don't want to. Because the data doesn't exist yet.

That absence is itself the most useful thing we can tell you, so we're going to open with it rather than bury it, and then show you everything we actually *can* verify: today's real prices, today's real volatility, and today's real cost of doing business — none of which requires pretending we have a track record we don't.

## Eleven days is not a track record

We track prices for a basket of 200 of the game's most-traded singles — the broad market data behind everything else on the site. The catch is how little history sits behind it.

Here's what that price data actually shows, as of this writing:

| | |
| --- | --- |
| Tracking began | **4 August 2026** |
| History so far | 11 days |
| Change since start | +11.6% |
| 1-day change | +0.4% |
| **7-day change** | **null — not enough history** |
| **30-day change** | **null — not enough history** |

That's not a rounding artifact or a display bug. It's the honest state of the underlying data: neither the 7-day nor the 30-day change can be computed at all yet, because neither window has completed. We could report "up 11.6%" as if it means something — plenty of sites would — but eleven days of a thinly-traded, brand-new market isn't a return, it's noise that hasn't had time to average out.

For scale: Riftbound has released five sets. The newest, Vendetta, came out on 31 July 2026 — two weeks before this article. We don't even have confirmed release dates for four of the other five sets in our own database, because Riot never published exact street dates for them. A market needs years to show whether an asset holds value; this one hasn't finished its first month.

## What we can actually say, versus what we can't

| | Riftbound cards (today) | S&P 500 |
| --- | --- | --- |
| Track record | 11 days of price data | ~100 years |
| Historical average annual return | Unknown — insufficient data | Roughly 10%/year nominal, long-run average |
| Minimum entry | Cents to low dollars for most cards | Fraction of a share via most brokers |
| Liquidity | Thin — see the spread example below | Extremely deep, sub-cent spreads |
| Typical selling cost | 2%–13.25%+ depending on venue | ~0.03%–0.20% fund expense ratio, or a few dollars in brokerage fees |
| Regulatory protection | None (unregulated collectibles market) | SIPC/regulator-backed depending on jurisdiction |
| Can the asset itself be banned/devalued by the publisher | Yes — has already happened once | Not applicable |

We're showing you this table specifically *because* half of it can't be filled in. That's the point. A guide that fills in "expected return" for Riftbound with a confident-sounding number is making it up. We'd rather show you an empty cell than a fabricated one.

## Where the real value already sits: print scarcity

None of the above means nothing is measurable. Scarcity premiums between different printings of the *same card* are real, current, and easy to verify yourself — you don't need years of history to see that two otherwise-identical objects are priced differently today.

The clearest example in the whole game: **Ahri, Nine-Tailed Fox**, printed both with and without a Signature — the artist's actual signature, stamped across the art.

| Printing | Signature? | Live US price |
| --- | --- | --- |
| OGN 303/298 | No | US$374.22 |
| OGN 303*/298 | Yes | **US$3,420.28** |

[[closeup:0]]

Same art, same rules, same rarity tier. The signature alone accounts for roughly **US$3,046** of the difference — about 9 times the unsigned price. That's a real, observable, checkable fact about today's market. It is not a prediction about tomorrow's.

A second, sharper trap sits in the same data: **promo status**, which — unlike a Signature asterisk or an over-numbered collector number — leaves no visible mark on the number itself.

| Card | Number | Promo? | Live US price |
| --- | --- | --- | --- |
| Ahri, Nine-Tailed Fox | 255/298 | No | US$2.99 |
| Ahri, Nine-Tailed Fox | 255/298 | Yes | US$269.00 |
| Diana, Scorn of the Moon | 197/219 | No | US$0.18 |
| Diana, Scorn of the Moon | 197/219 | Yes | **US$1,899.99** |

The Diana pair is the extreme case: two cards, identical collector number, roughly **10,000 times** apart in price, and the only difference is a promo flag you can't see by reading the number. If you're pricing anything more valuable than pocket change, check the listing's promo status specifically — the number alone won't warn you.

[[embed:0]]

## What volatility looks like in a market this young

An 11-day-old, thinly-traded market is not going to behave like a mature one, and it doesn't. The daily volatility across the cards we track sits at **2.11%** — for comparison, a mature equity index typically runs closer to 1% on an ordinary day. Of the 200 cards we track, 89 are up, 76 are down and 35 are unchanged as of this writing — nothing close to a one-directional market.

Individual cards move far harder than the aggregate. As of this writing, several of the cards we track have moved more than 100% in a week: Rhasa the Sunderer (OGN 195/298) is up 415% over 7 days on a US$3.93 card, and multiple others are up well over 100% in the same window. These aren't chase cards — they're cheap ones, which is exactly the point: in a thin market, a handful of trades at a new price can swing the reported price enormously, in either direction, on cards worth a few dollars just as easily as on five-figure Signatures.

Liquidity friction shows up even inside a single day. Take Defy (OGN 045/298) — currently the listings for this one card, on the same day, in the same market, range from **US$3.93 to US$11.00**: nearly a 3x spread for the identical printing. That's not a typo or a stale listing; it's what "price discovery" looks like before a market has had time to converge. We deliberately track a broad, liquid basket of cards to smooth this kind of noise out of the overall picture — but the noise is still there in any individual card you might actually try to buy or sell.

## What it costs to actually buy or sell one

Whatever the price on a card page says, it isn't what you'll net if you sell, and it isn't the last dollar you'll spend if you buy. Real numbers, by venue:

| Venue | Seller pays | Notes |
| --- | --- | --- |
| **eBay** | ~13.25% final value fee | Charged on item price *plus* shipping |
| **TCGplayer** | Tiered commission + payment processing | Nets most sellers roughly 80–85% of sale price before shipping |
| **Direct/local sale** | 0% commission | No buyer protection either side |

None of that includes shipping, packaging, or — if you're selling across a border — currency conversion, which typically costs a further few percent depending on how you're paid. [TCGplayer fees, explained in full](/blog/tcgplayer-fees) and [currency conversion costs](/blog/currency-conversion-fees) both break these down further if you're weighing where to sell.

## Grading: a separate market, not a multiplier

Riftbound doesn't have a centralised third-party grading body for raw card sales — the seller assigns the condition at the point of listing, based on their own judgement, which means the same physical card can be labelled differently by two different stores. [Our condition guide](/guides/riftbound-card-condition-guide) covers what each grade actually means.

Third-party grading (PSA and similar) does exist for Riftbound's highest-value chase cards, but it's its own market, running on its own pricing logic, layered on top of the raw singles market rather than a fixed multiple of it. Don't assume a graded card is simply "raw price × some standard number" — check the graded market for that specific card directly.

## A risk that doesn't exist for a closed collectible

Riftbound is an actively developed, competitively played game, which cuts both ways. The upside: it's built on League of Legends, one of the most-played games in the world, with a real organised competitive scene — [UVS Games ran the most recent Regional Qualifier in Los Angeles](/blog/riftbound-2026-regional-qualifier-los-angeles) in September, requiring a linked Riot Account to enter. That's genuine, ongoing investment in the game as a product, not just as a card set.

The downside: Riot can change the rules under you, and already has. On **24 July 2026**, a week before Vendetta released, [Riot banned three cards from Standard play](/blog/riftbound-july-2026-ban-list-update) — Stealthy Pursuer (over a documented infinite combo), The Arena's Greatest and Aspirant's Climb — and introduced a separate ban list for Constructed 2v2 starting with Master Yi, Wuju Bladesman. A banned card doesn't vanish from existence, but it loses whatever demand came from being tournament-legal. That's a live-game risk that a closed, no-longer-printed vintage collectible simply doesn't carry, and it's worth weighing against any scarcity premium a card currently holds.

## What we'd actually suggest

Not "buy" and not "don't." Three practical things that don't require a track record we don't have:

**If you're buying:** treat every purchase as buying a card you like, at a price you'd be fine never seeing again — because right now, nobody can tell you what it'll be worth later, including us. Compare the printing carefully (asterisk, over-numbering, and *especially* promo status) before you pay a premium.

**If you're selling:** run the real fee math before you list anywhere — eBay's ~13.25% final value fee versus TCGplayer's tiered commission is the difference between a good and a bad sale on the same card.

**If you already own cards and just want to know what they're worth without checking daily:** that's a genuinely answerable question, unlike the investment question. [Set a free price alert](/alerts) and let the number come to you.

We built the price tracking, the price history, and the alerts specifically because we think a market this new deserves honest tools instead of confident-sounding guesses. We'll revisit this piece once there's actually enough history to say more.
`,
  },
  {
    slug: "riftcompare-premium-explained",
    category: "blog",
    title: "RiftCompare Premium: Every Feature Explained",
    excerpt:
      "Everything RiftCompare Premium includes — Value Finder, Rising Cards, the full Deal Finder and Bulk Pricer — with pricing, screenshots and honest FAQs.",
    author: "RiftCompare",
    date: "2026-08-20",
    updated: "2026-08-26",
    readMins: 11,
    tags: ["premium", "pricing", "tools", "value finder", "deal finder"],
    hero: {
      src: "/blog/riftcompare-premium-explained.png",
      alt: "The RiftCompare logo beside a gold Premium badge, on a dark green-and-blue gradient background",
    },
    summary: [
      "**RiftCompare Premium is $9.99/mo or $79.99/yr** (works out to about $6.67/mo, a 33% saving) — with a 14-day free trial and cancel-anytime billing through Stripe.",
      "**It unlocks 5 tools outright**: the Bulk Pricer, Best Basket, Value Finder screener, Rising Cards (full list), and the full Deal Finder (full list, 4 views). The Condition Impact Calculator is free with any account, no Premium needed.",
      "**It also removes every ad sitewide**, automatically, the moment you subscribe.",
      "**Price comparison itself stays free for everyone** — Premium is entirely about the pro tools, never about seeing prices.",
      "**You can also get a week of Premium for free** just by sending us feedback at [/feedback](/feedback), no card required.",
    ],
    browseCta: {
      href: "/premium",
      label: "See RiftCompare Premium →",
      blurb: "Full pricing, the live feature list, and the tier comparison table — updated as we ship new tools.",
    },
    faq: [
      {
        q: "How much does RiftCompare Premium cost?",
        a: "$9.99/month, or $79.99/year if you pay annually (about $6.67/month, a 33% saving versus paying monthly — $119.88 over a year). Both plans start with a 14-day free trial; a card is required up front and it auto-converts to the paid price unless you cancel first.",
      },
      {
        q: "What do you actually get with RiftCompare Premium?",
        a: "Five tools you can't otherwise use at all — the Bulk Pricer, Best Basket, Value Finder screener, the full Rising Cards list, and the full Deal Finder (all four views) — plus a completely ad-free site. The Condition Impact Calculator isn't in that list — it's free with any account.",
      },
      {
        q: "Is price comparison free without Premium?",
        a: "Yes, entirely. Searching, browsing every card, comparing live prices across every store and eBay, the deck builder, trade calculator, box EV calculator, the RiftCompare Index and price movers are all free with no account at all. Premium is exclusively about the pro tools listed above and an ad-free site.",
      },
      {
        q: "What's the difference between a free account and Premium?",
        a: "A free account (no card, just an email) adds price alerts and your portfolio tracker (value history, cost-basis P&L, CSV export) on top of the fully-free tier. Premium is the paid step above that — it's the only tier with the Bulk Pricer, Best Basket, Value Finder, the full Rising Cards and Deal Finder lists, and an ad-free site.",
      },
      {
        q: "Is there a free trial?",
        a: "Yes — 14 days, on both the monthly and annual plan. It needs a card up front and converts automatically to the plan's normal price after 14 days unless you cancel before then.",
      },
      {
        q: "Can I get RiftCompare Premium for free?",
        a: "You can earn free Premium two ways, no card required either way: submit feedback once at riftcompare.com/feedback and it unlocks a full week automatically, or share your referral link from your profile and every friend who creates a free account earns you 3 days.",
      },
      {
        q: "Can I cancel RiftCompare Premium anytime?",
        a: "Yes. Cancel anytime from your account and your benefits run through to the end of the period you already paid for — there's no lock-in and no penalty. If you resubscribe later, note that your price is locked in for as long as you stay subscribed, so it never rises even as new tools get added.",
      },
      {
        q: "Does Premium remove ads on RiftCompare?",
        a: "Yes — every page is completely ad-free the moment you're Premium. It's automatic; there's nothing to switch on separately.",
      },
    ],
    itemList: {
      name: "What's included with RiftCompare Premium",
      items: [
        { name: "Bulk Pricer", description: "Price an entire want-list or collection at once, each card matched to its cheapest live store price.", url: "/bulk-pricer" },
        { name: "Best Basket", description: "The cheapest way to actually buy a whole decklist — the store split with the lowest landed cost, postage included.", url: "/tools/best-basket" },
        { name: "Value Finder screener", description: "Every card trading below its own 30-day average right now, ranked by discount.", url: "/tools/value-finder" },
        { name: "Rising Cards (full list)", description: "Cards ranked by demand and price-timing signals — free accounts see only the top pick.", url: "/tools/rising" },
        { name: "Deal Finder (full list)", description: "Every cross-store, cross-region and eBay pricing gap we track, sortable — free accounts see only the top pick.", url: "/tools/deal-finder" },
        { name: "Ad-free site", description: "No ads on any page, sitewide, automatically.", url: "/premium" },
      ],
    },
    body: `RiftCompare's price comparison — search, browse, live prices across every store and eBay, the deck builder, the trade calculator, box EV, the Index and daily movers — has always been free, and stays free. This post is about the other thing: **what you actually get if you pay for RiftCompare Premium**, screenshot by screenshot, with nothing rounded up or left vague.

Short version: Premium is $9.99/mo (or $79.99/yr), and it unlocks five tools you can't use at all otherwise and removes every ad on the site. (The Condition Impact Calculator used to be on that list too — it's free now.) Here's the full breakdown.

## How much does RiftCompare Premium cost?

![The RiftCompare Premium pricing card — $4.99/month, plus the full list of what's included](/blog/premium/00-pricing-cards.png)

| Plan | Price | Works out to | Trial |
| --- | --- | --- | --- |
| Monthly | $9.99/month | $9.99/month | 14 days free |
| Annual | $79.99/year | ≈ $6.67/month (**33% off**, vs $119.88/yr paying monthly) | 14 days free |

Both plans run through Stripe, need a card up front for the trial, and auto-convert to the paid price after 14 days unless you cancel first. Subscribe once and **your price is locked in for good** — it doesn't rise later even as new tools ship, which is worth knowing given how much has been added to Premium since launch.

Cancellation is genuinely no-friction: cancel anytime, and your benefits simply run to the end of the period you already paid for.

## What's free, what needs a free account, and what needs Premium

Everything below is real, current, and reflects exactly what each tier gets — not a marketing simplification.

| Feature | No account | Free account | Premium |
| --- | --- | --- | --- |
| Compare prices across every store + eBay | ✓ | ✓ | ✓ |
| Full card database, search & browse | ✓ | ✓ | ✓ |
| Deck builder, trade calculator & box EV | ✓ | ✓ | ✓ |
| RiftCompare Index & daily movers | ✓ | ✓ | ✓ |
| Condition Impact Calculator | ✓ | ✓ | ✓ |
| Price alerts | — | ✓ | ✓ |
| Portfolio tracker — history, P&L, CSV export | — | ✓ | ✓ |
| Deal Finder | Top pick | Top pick | Full list |
| Rising Cards | Top pick | Top pick | Full list |
| Value Finder screener | — | — | ✓ |
| Bulk Pricer | — | — | ✓ |
| Best Basket — cheapest store split, postage included | — | — | ✓ |
| Ad-free experience | — | — | ✓ |

The pattern is deliberate: **nothing about seeing a price is ever gated.** A free account adds the things every serious collector eventually wants (alerts and a portfolio); Premium is entirely the pro tools and an ad-free site on top of that.

## The 5 tools you only get with Premium

### 1. Value Finder screener

![The Value Finder tool — a screener for Riftbound cards trading below their own 30-day average price](/blog/premium/03-value-finder.png)

Value Finder scans every card in the database and surfaces the ones trading **below their own 30-day average right now**, ranked by how far below their usual price they sit — not just by today's dip. It's a mean-reversion signal built for value buyers and flippers: the cards here aren't necessarily cheap in absolute terms, they're cheap *relative to their own recent history*, which is a meaningfully different (and harder to eyeball) signal than "biggest % drop today."

This is Premium-only outright — a free account doesn't get even a teaser of it.

### 2. Rising Cards — the full list

![The Rising Cards tool, showing its market toggle and demand/price-timing methodology](/blog/premium/04-rising-cards.png)

Rising Cards ranks cards by a composite of **demand and price-timing signals** — search interest that's high or actively rising, combined with a card sitting near its own recent low rather than one that's already spiked. The scoring is transparent (not a black box) and backtested. Free accounts and anonymous visitors can see the #1 pick; Premium unlocks the full ranked list plus the per-market toggle (switch between Global and each country RiftCompare tracks).

### 3. Deal Finder — all four views, full list

![The Deal Finder tool, with its four tabs: Worth more on eBay, Underpriced vs TCGplayer, Cheapest on eBay, and Cross-region](/blog/premium/05-deal-finder.png)

Deal Finder is the one built specifically around arbitrage — the same card, priced meaningfully differently in two places RiftCompare tracks at the same time. It has four separate views:

- **Worth more on eBay** — cards that sell for more on eBay than the cheapest tracked store currently charges (useful if you're deciding whether to sell)
- **Underpriced vs TCGplayer** — cards cheaper elsewhere than TCGplayer's own listing
- **Cheapest on eBay** — the reverse: cards where eBay is currently the cheapest place to buy
- **Cross-region** — cards priced meaningfully cheaper in a different market RiftCompare tracks

Every gap is computed from **live listings, not a reference price**, and ranked by delivered cost (price plus estimated shipping) rather than sticker price alone — a $2 saving that costs $5 more to ship isn't a real saving, and Deal Finder already knows that. Free accounts get the top result only; Premium gets the full, sortable list across all four views.

### 4. Bulk Pricer

Paste an entire want-list, trade pile or full collection, and Bulk Pricer matches **every card to its cheapest live store price at once**, with a running total. If you've ever priced out a stack of 40 cards one search at a time, this is the tool that turns it into one paste.

(The **Condition Impact Calculator** — value a card across NM/LP/MP/HP/DMG — is free for everyone, so it's not counted among the five tools here.)

### 5. Best Basket

Bulk Pricer answers "what does this list cost"; Best Basket answers the harder, more useful question — **what's the cheapest way to actually buy the whole thing**. Paste a decklist or point it at your own wishlist, and it prices every viable split across the stores that carry your list, each with its real shipping cost and free-shipping threshold applied, then shows you the delivered total next to what the naive per-card-cheapest approach would have cost.

The two tools solve genuinely different problems: Bulk Pricer is about knowing a value, Best Basket is about actually placing the order for the least money once postage stops being pretend-free.

## Everything, at a glance

![RiftCompare Premium's member dashboard: quick links to every unlocked tool](/blog/premium/01-premium-header.png)

![The full tier comparison table and every Premium feature card, side by side](/blog/premium/02-feature-cards-bottom.png)

## Two free ways to get Premium without paying

You don't have to subscribe to try it:

- **[Invite a friend](/profile)** — share your referral link, and every friend who creates a free account earns you **3 days of Premium**, free.
- **[Submit feedback once](/feedback)** — a bug report, a feature request, anything genuinely useful — and it unlocks a full **week of Premium, free**, no card required either.

Neither of these requires ever entering a payment method. If Premium turns out to not be for you, both simply expire with nothing charged.

## Who should actually pay for it

Being straightforward here, since the point of this post is accuracy over hype: if you only ever check a handful of card prices before buying, the free tier already does that job completely — you'd be paying for tools you won't open. Premium earns its price for three kinds of RiftCompare users specifically:

1. **Active buyers who want an edge** — Value Finder and Rising Cards exist to surface opportunities you would not have found by browsing normally.
2. **Anyone pricing or buying a whole list at a time** — the Bulk Pricer turns a tedious, repetitive pricing task into one paste, and Best Basket does the equivalent for actually buying the list at the lowest landed cost.

If neither of those describes how you use the site, the free tier — which still includes full price comparison, alerts and a portfolio tracker — is genuinely not a downgrade. That's a deliberate design choice, not a limitation we're hoping you won't notice.
`,
  },
  ...SEO_PACK_ARTICLES,
];

// PUBLISHED articles only. Every public surface goes through here — the indexes,
// both feeds, the sitemap, the authors pages, the /llm mirrors — so filtering
// drafts once, at the source, covers all of them.
export function getArticles(category?: ArticleCategory): Article[] {
  const list = ARTICLES.filter((a) => !a.draft && (!category || a.category === category));
  return [...list].sort((a, b) => (a.date < b.date ? 1 : -1));
}

// Resolves drafts too, deliberately: a draft has to be reachable by direct URL to
// be reviewed before publication. The page renders it noindex, and nothing links
// to it, so it cannot be found without the URL.
export function getArticle(slug: string): Article | undefined {
  return ARTICLES.find((a) => a.slug === slug);
}

/**
 * Response headers that keep a DRAFT out of the index.
 *
 * A draft still has [TODO] markers in its body. The HTML pages at /blog/<slug>
 * and /guides/<slug> already noindex those (metadata `robots: { index: false,
 * follow: true }`) so they stay reachable for review without being indexed — but
 * those same pages advertise the markdown mirrors as a `text/markdown`
 * rel=alternate, and the mirrors were serving the identical unfinished text at
 * HTTP 200 with no robots signal at all. The noindexed page was pointing
 * crawlers straight at an indexable copy of itself.
 *
 * A header rather than a 404, deliberately, on both counts: `metadata.robots`
 * does not exist for a non-HTML response, so X-Robots-Tag is the only way to say
 * this; and the HTML side's reasoning — reachable by direct URL for review, never
 * indexed — applies unchanged to the mirror. Published posts get {} and are
 * unaffected.
 */
export function draftNoindexHeaders(slug: string): Record<string, string> {
  return getArticle(slug)?.draft ? { "X-Robots-Tag": "noindex, follow" } : {};
}
