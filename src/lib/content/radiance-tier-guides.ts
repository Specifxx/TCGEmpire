// Three Radiance price guides published on release day (2026-10-23 SEO sprint),
// each written for ONE query that no page owned (docs/seo-keyword-map.md rows
// added the same day):
//
//   riftbound-radiance-epic-cards      "riftbound radiance epic cards"
//   riftbound-radiance-alt-art-cards   "riftbound radiance alt art cards"
//   riftbound-radiance-legends         "riftbound radiance legends price"
//
// Every figure is the cheapest in-stock US listing in the public data export of
// 23 Oct 2026 02:07 UTC (data/public/cards.json + data/public/listings), counted
// by a script, never typed from memory. They are dated in the copy ("on release
// day") because they are listings on one day, not values; the galleries under
// each table carry today's prices. No forecast: the only forward-looking line is
// what Vendetta actually did after its own launch, already published in
// /blog/riftbound-radiance-card-list.
//
// Category "guide": guides never carry the Radiance pre-order CTA
// (CURRENT-STATE, "Posts shared on Reddit…").
import type { Article } from "../articles";

const DAY = "2026-10-23";

export const RADIANCE_TIER_GUIDES: Article[] = [
  {
    slug: "riftbound-radiance-epic-cards",
    category: "guide",
    title: "Riftbound Radiance Epic Cards: All 28, Priced",
    excerpt:
      "All 28 Riftbound Radiance Epic cards with release-day prices, cheapest store first: Blade of the Exile leads at $40, the median Epic is $5.25.",
    author: "RiftCompare",
    date: DAY,
    readMins: 6,
    tags: ["radiance", "epic", "rarity", "prices", "card list"],
    hero: {
      src: "/radiance-spoilers/neeko-blending-in.jpg",
      alt: "Neeko, Blending In, the Radiance Epic numbered 167/167 and one of the three dearest Epics on release day",
    },
    summary: [
      "**Radiance has 28 Epic cards:** 14 units, 8 gears and 6 spells, numbered inside the main set (no overnumbers).",
      "**On release day the cheapest US listing for an Epic ranged from $1.25 to $40.00.** The median Epic was $5.25; seven Epics started at $10 or more.",
      "**Three cards carry the tier:** Blade of the Exile ($40.00), Hexplosive Minefield ($24.95) and Neeko, Blending In ($24.90).",
      "**Every Epic was in stock at 33 to 43 stores** across our six markets, so the cheapest copy is usually not at the first store you check.",
    ],
    faq: [
      {
        q: "How many Epic cards are in Riftbound Radiance?",
        a: "28: 14 units, 8 gears and 6 spells. All are main-set numbers between 021/167 and 167/167. Nine of the Epic champion units also have an alternate-art Showcase printing with an \"a\" number, which is a different card for pricing.",
      },
      {
        q: "What is the most expensive Radiance Epic?",
        a: "On release day (23 October 2026) it was Blade of the Exile, 150/167, a Calm gear, with a cheapest US listing of $40.00. Hexplosive Minefield ($24.95) and Neeko, Blending In ($24.90) followed.",
      },
      {
        q: "What is the cheapest Radiance Epic?",
        a: "Zero Point Inflection, 069/167, a Mind gear, at $1.25 for the cheapest US listing on release day. Twelve of the 28 Epics started under $5.",
      },
      {
        q: "Are Radiance Epic prices going to drop?",
        a: "We don't predict prices. What we can say is what the last set did: Vendetta's median single lost 56% between its first week and mid-October, and cards between $1 and $20 lost 57%. A price alert tells you when a card reaches the number you want to pay.",
      },
    ],
    embeds: [
      {
        title: "Every Radiance Epic, with today's prices",
        note: "Today's cheapest listing in your market on each tile; the table in this guide is release day's.",
        slugs: [
          "blade-of-the-exile-rad-150-167",
          "hexplosive-minefield-rad-142-167",
          "neeko-blending-in-rad-167-167",
          "demacian-standard-rad-156-167",
          "realm-of-death-rad-144-167",
          "seraphic-wyvern-rad-092-167",
          "mordekaiser-dominating-rad-137-167",
          "resplendent-rostrum-rad-046-167",
          "dockside-lock-up-rad-136-167",
          "the-ball-rad-146-167",
          "last-caress-rad-154-167",
          "ekko-revolutionary-rad-021-167",
          "angler-wyrm-rad-113-167",
          "riven-deserter-rad-114-167",
          "evelynn-consuming-rad-090-167",
          "jarvan-iv-martial-paragon-rad-091-167",
          "ziggs-short-fused-rad-023-167",
          "transpositionist-rad-115-167",
          "seraphine-not-alone-rad-138-167",
          "encore-rad-152-167",
          "whirling-twirligig-rad-022-167",
          "orianna-mechanical-marvel-rad-068-167",
          "k-sante-dauntless-rad-045-167",
          "chronobreak-rad-140-167",
          "ntofo-strikes-rad-148-167",
          "hunting-blind-rad-044-167",
          "clocktower-guardian-rad-067-167",
          "zero-point-inflection-rad-069-167",
        ],
      },
    ],
    browseCta: {
      href: "/sets/radiance",
      label: "Every Radiance card, sortable by price →",
      blurb: "The whole set with prices in your market; filter the rarity to Epic.",
    },
    body: `Epic is the highest rarity inside Radiance's main numbering (001/167 to 167/167). Above it sit the Showcase printings: alternate arts, overnumbers and signed Legends, which have [their own guide](/guides/riftbound-radiance-alt-art-cards) and [a signature-card breakdown](/blog/riftbound-radiance-signature-cards). This page is just the 28 Epics, with what each one cost on release day.

## Every Radiance Epic, release-day prices

The price is the cheapest in-stock US listing in our data on **23 October 2026**, the day Radiance went on sale, with the number of stores (across all six markets) that had it in stock. Store comparisons on each card page list stores cheapest first by item price, with the delivered total where the store publishes its postage.

| # | Card | Type | Domain | Cheapest US | Stores in stock |
| --- | --- | --- | --- | --- | --- |
| 150 | [Blade of the Exile](/card/blade-of-the-exile-rad-150-167) | Gear | Calm | $40.00 | 36 |
| 142 | [Hexplosive Minefield](/card/hexplosive-minefield-rad-142-167) | Spell | Fury | $24.95 | 39 |
| 167 | [Neeko, Blending In](/card/neeko-blending-in-rad-167-167) | Unit | Colorless | $24.90 | 34 |
| 156 | [Demacian Standard](/card/demacian-standard-rad-156-167) | Gear | Body | $14.97 | 36 |
| 144 | [Realm of Death](/card/realm-of-death-rad-144-167) | Spell | Fury | $12.56 | 37 |
| 092 | [Seraphic Wyvern](/card/seraphic-wyvern-rad-092-167) | Unit | Body | $10.00 | 43 |
| 137 | [Mordekaiser, Dominating](/card/mordekaiser-dominating-rad-137-167) | Unit | Order | $10.00 | 41 |
| 046 | [Resplendent Rostrum](/card/resplendent-rostrum-rad-046-167) | Gear | Calm | $9.99 | 39 |
| 136 | [Dockside Lock-Up](/card/dockside-lock-up-rad-136-167) | Gear | Order | $9.99 | 42 |
| 146 | [The Ball](/card/the-ball-rad-146-167) | Gear | Calm | $9.90 | 37 |
| 154 | [Last Caress](/card/last-caress-rad-154-167) | Spell | Body | $8.10 | 38 |
| 021 | [Ekko, Revolutionary](/card/ekko-revolutionary-rad-021-167) | Unit | Fury | $8.00 | 42 |
| 113 | [Angler Wyrm](/card/angler-wyrm-rad-113-167) | Unit | Chaos | $6.00 | 42 |
| 114 | [Riven, Deserter](/card/riven-deserter-rad-114-167) | Unit | Chaos | $5.50 | 40 |
| 090 | [Evelynn, Consuming](/card/evelynn-consuming-rad-090-167) | Unit | Body | $5.00 | 39 |
| 091 | [Jarvan IV, Martial Paragon](/card/jarvan-iv-martial-paragon-rad-091-167) | Unit | Body | $5.00 | 40 |
| 023 | [Ziggs, Short-Fused](/card/ziggs-short-fused-rad-023-167) | Unit | Fury | $4.88 | 39 |
| 115 | [Transpositionist](/card/transpositionist-rad-115-167) | Unit | Chaos | $4.49 | 38 |
| 138 | [Seraphine, Not Alone](/card/seraphine-not-alone-rad-138-167) | Unit | Order | $4.00 | 41 |
| 152 | [Encore](/card/encore-rad-152-167) | Spell | Mind | $3.75 | 33 |
| 022 | [Whirling Twirligig](/card/whirling-twirligig-rad-022-167) | Gear | Fury | $3.66 | 38 |
| 068 | [Orianna, Mechanical Marvel](/card/orianna-mechanical-marvel-rad-068-167) | Unit | Mind | $3.51 | 33 |
| 045 | [K'Sante, Dauntless](/card/k-sante-dauntless-rad-045-167) | Unit | Calm | $3.00 | 39 |
| 140 | [Chronobreak](/card/chronobreak-rad-140-167) | Spell | Fury | $3.00 | 35 |
| 148 | [Ntofo Strikes](/card/ntofo-strikes-rad-148-167) | Spell | Calm | $3.00 | 42 |
| 044 | [Hunting Blind](/card/hunting-blind-rad-044-167) | Gear | Calm | $2.92 | 38 |
| 067 | [Clocktower Guardian](/card/clocktower-guardian-rad-067-167) | Unit | Mind | $2.70 | 39 |
| 069 | [Zero Point Inflection](/card/zero-point-inflection-rad-069-167) | Gear | Mind | $1.25 | 33 |

[[embed:0]]

## What the list shows

**Gear leads the tier.** Four of the five dearest Epics are not units: two gears and two spells, with Neeko the only unit in the top three. Blade of the Exile is an [Equip](/keywords/equip) gear, and Radiance's new gear keyword, Deploy, has [its own explainer](/guides/riftbound-deploy-explained).

**Fury and Calm have the most Epics,** six each. Body has five, Mind four, Chaos and Order three each, and Neeko is the one Colorless Epic. Neutral cards like her can go in a deck of any domain, which is part of why she is wanted; [the Colorless domain page](/domains/colorless) lists every such card.

**A champion's Epic and its alt art are different cards.** Nine of the Epic champion units, from Ekko, Revolutionary to Seraphine, Not Alone, also have an "a" printing at Showcase rarity. On release day those cost 1.2 to 6 times as much as the Epic itself. Check the collector number before you buy.

## What each Epic does

The 28 Epics, grouped by domain, with each card's cost (and Might for units) as printed. The summaries are ours; open a card for its exact rules text.

**Fury (6).** [Hexplosive Minefield](/card/hexplosive-minefield-rad-142-167) (2-cost Action spell) kills any number of your own Bomb tokens and brings back that many on one battlefield at end of turn, which is why it is priced like a build-around: it only works in a Bomb deck. [Realm of Death](/card/realm-of-death-rad-144-167) (2) shrinks an enemy unit, grows a friendly one and has them deal damage to each other. [Chronobreak](/card/chronobreak-rad-140-167) (2) banishes your own units and replays them where they were. [Ekko, Revolutionary](/card/ekko-revolutionary-rad-021-167) (5 cost, 4 Might) enters ready with Assault. [Ziggs, Short-Fused](/card/ziggs-short-fused-rad-023-167) (5, 5) drops a Bomb gear token when played. [Whirling Twirligig](/card/whirling-twirligig-rad-022-167) (4-cost gear) turns gear and units into tokens.

**Calm (6).** [Blade of the Exile](/card/blade-of-the-exile-rad-150-167) (3-cost gear) is an Equip card whose equip cost can be paid by exhausting a friendly unit. [The Ball](/card/the-ball-rad-146-167) (5) is a Deploy gear with Ganking. [Hunting Blind](/card/hunting-blind-rad-044-167) (4) is a Deploy gear that can pull an enemy unit to its battlefield and gives your units there Shield 2. [Resplendent Rostrum](/card/resplendent-rostrum-rad-046-167) (8) draws and channels a rune. [K'Sante, Dauntless](/card/k-sante-dauntless-rad-045-167) (4, 4) doubles a unit's Shield when he attacks or defends, and [Ntofo Strikes](/card/ntofo-strikes-rad-148-167) (2-cost Action spell) gives Shield 2 and then deals damage equal to the Shield.

**Body (5).** [Demacian Standard](/card/demacian-standard-rad-156-167) (2) is a Deploy gear that pumps an attacker. [Seraphic Wyvern](/card/seraphic-wyvern-rad-092-167) (7, 7) channels an extra exhausted rune whenever you channel. [Jarvan IV, Martial Paragon](/card/jarvan-iv-martial-paragon-rad-091-167) (4, 4) gives your Deploy gear Action timing. [Evelynn, Consuming](/card/evelynn-consuming-rad-090-167) (5, 5) has Ambush, and [Last Caress](/card/last-caress-rad-154-167) (2-cost Reaction spell) lets your next unit be played to any battlefield.

**Mind (4).** [Encore](/card/encore-rad-152-167) (3) is a choose-two spell. [Orianna, Mechanical Marvel](/card/orianna-mechanical-marvel-rad-068-167) (5, 5) discounts a gear once a turn while she is at a battlefield. [Clocktower Guardian](/card/clocktower-guardian-rad-067-167) (8, 8) Predicts 3 and has a Deathknell that can play your top card free. [Zero Point Inflection](/card/zero-point-inflection-rad-069-167) (9-cost gear) draws two for each card you play until your hand grows too big.

**Chaos (3) and Order (3).** [Angler Wyrm](/card/angler-wyrm-rad-113-167) (8, 8, Deflect) forces an opponent to move a unit to its battlefield; [Riven, Deserter](/card/riven-deserter-rad-114-167) (5, 5) grows when your other units exhaust; [Transpositionist](/card/transpositionist-rad-115-167) (6, 4) swaps a unit for a smaller one. In Order, [Mordekaiser, Dominating](/card/mordekaiser-dominating-rad-137-167) (9, 8) can discard to kill a unit or gear, [Dockside Lock-Up](/card/dockside-lock-up-rad-136-167) (6) is a Deploy gear that banishes a unit, and [Seraphine, Not Alone](/card/seraphine-not-alone-rad-138-167) (5, 1) makes Recruit tokens and grows with your exhausted units.

**Colorless (1).** [Neeko, Blending In](/card/neeko-blending-in-rad-167-167) (6, 4) is the deckbuilding card: with her in your deck you choose additional legends. Riot's 9 October errata changed "choose 3" to "choose up to 3" ([the errata write-up](/blog/riftbound-radiance-patch-notes-errata)).

## The top ten in every market

The same release-day snapshot, cheapest in-stock listing per market in local currency. A market's cheapest copy can come from a single store, so compare on the card page before buying.

| Card | US | Australia | UK | Canada | Singapore | EU |
| --- | --- | --- | --- | --- | --- | --- |
| Blade of the Exile | $40.00 | A$62.60 | £30.00 | C$39.99 | S$55.69 | €42.65 |
| Hexplosive Minefield | $24.95 | A$40.00 | £5.00 | C$25.00 | S$34.75 | €7.98 |
| Neeko, Blending In | $24.90 | A$36.69 | £12.00 | C$28.00 | S$33.62 | €10.95 |
| Demacian Standard | $14.97 | A$30.00 | £5.00 | C$20.51 | S$20.85 | €4.90 |
| Realm of Death | $12.56 | A$20.25 | £8.00 | C$17.21 | S$16.96 | €9.96 |
| Seraphic Wyvern | $10.00 | A$30.00 | £7.00 | C$13.70 | S$13.92 | €7.99 |
| Mordekaiser, Dominating | $10.00 | A$20.00 | £4.50 | C$13.50 | S$20.74 | €5.88 |
| Resplendent Rostrum | $9.99 | A$21.90 | £4.00 | C$13.69 | S$13.92 | €6.54 |
| Dockside Lock-Up | $9.99 | A$12.51 | £3.50 | C$13.69 | S$13.91 | €3.99 |
| The Ball | $9.90 | A$15.49 | £7.97 | C$12.00 | S$13.62 | €9.28 |

Two things stand out. **Blade of the Exile was the dearest Epic everywhere,** in every one of the six markets. And **the UK and EU lows were often far below the US,** most of all for Hexplosive Minefield (£5.00 and €7.98 against $24.95) and Demacian Standard (£5.00 and €4.90 against $14.97). On release day a few stores price a new set from their own stock before the market settles, and those listings are the ones a comparison finds.

## How we measured

Every figure here comes from our public data export of 23 October 2026 (02:07 UTC), the day Radiance went on sale. "Cheapest" is the lowest in-stock listing for that exact printing in that market, from the stores we track; "stores in stock" counts each store once per market across all six. They are listing prices from our two imports a day, not sales, and they change through the day: the gallery above is today's.

## Buying Radiance Epics

- **Compare before you pay.** With 33 to 43 stores carrying each Epic, the spread between the cheapest and the dearest store is wide; each card page lists them cheapest first.
- **Buy what you'll play now and wait on the rest.** Vendetta's cards between $1 and $20 lost a median 57% between launch week and mid-October ([the numbers](/blog/riftbound-radiance-card-list)). That is history, not a forecast for Radiance.
- **Let the price come to you.** A [price alert](/alerts) emails you when a card falls to your number.
- **Whole decklist?** [Best Basket](/tools/best-basket) splits it across stores so you pay postage as few times as possible.`,
  },
  {
    slug: "riftbound-radiance-alt-art-cards",
    category: "guide",
    title: "Radiance Alt Art Cards: All 19, Priced",
    excerpt:
      "Every Riftbound Radiance alt art card (the 'a' numbers): 19 printings, release-day prices from $0.31 to $29.41 and how each compares with its base card.",
    author: "RiftCompare",
    date: DAY,
    readMins: 6,
    tags: ["radiance", "alt art", "showcase", "prices", "collecting"],
    hero: {
      src: "/radiance-spoilers/seraphine-not-alone.jpg",
      alt: "Seraphine, Not Alone, a Radiance Epic whose alternate-art printing 138a/167 was the second-dearest alt art on release day",
    },
    summary: [
      "**Radiance has 19 alternate-art printings,** numbered with an \"a\": 18 champion units plus one signed Legend, Seraphine 174a*.",
      "**Excluding the signed Seraphine, the cheapest US listing ran from $0.31 to $29.41 on release day,** with a median of $14.59.",
      "**The dearest alt arts were Riven, Broken Blade 043a ($29.41) and Seraphine, Not Alone 138a ($23.99).**",
      "**An alt art is not the base card.** On release day most cost 3 to 17 times their base printing, Ziggs, Explosive 63 times; Jarvan IV, Royal Heir 133a was cheaper than its base.",
    ],
    faq: [
      {
        q: "How many alt art cards are in Riftbound Radiance?",
        a: "19 printings carry an \"a\" in the collector number: 18 champion units (two each for Ekko, Ziggs, Orianna, Riven, K'Sante, Seraphine, Evelynn, Jarvan IV and Mordekaiser) and Seraphine, Starry-Eyed Songstress 174a*/167, a signed Legend. Alternate-art runes are a separate cycle and are not counted here.",
      },
      {
        q: "What does the 'a' mean on a Riftbound card number?",
        a: "It marks an alternate-art printing of the main-set card with the same number: 043a/167 is the alternate art of 043/167. The rules text is the same; the rarity is Showcase and the price is its own.",
      },
      {
        q: "What is the most expensive Radiance alt art?",
        a: "The signed Seraphine 174a*/167, at $1,040.99 for the cheapest US listing on release day, from a single US store. Among the unsigned alt arts, Riven, Broken Blade 043a/167 led at $29.41.",
      },
      {
        q: "Is an alt art worth more than the regular card?",
        a: "Usually, but not always. On release day 17 of the 18 unsigned Radiance alt arts were listed above their base printing, from about 1.2 times (Ekko, Revolutionary) to 63 times (Ziggs, Explosive, a $0.15 Rare). Jarvan IV, Royal Heir 133a was the exception, listed below its base. We don't predict where they go next.",
      },
    ],
    embeds: [
      {
        title: "Every Radiance alt art, with today's prices",
        note: "Today's cheapest listing in your market on each tile; the table in this guide is release day's.",
        slugs: [
          "riven-broken-blade-rad-043a-167",
          "seraphine-not-alone-rad-138a-167",
          "riven-deserter-rad-114a-167",
          "mordekaiser-twice-slain-rad-020a-167",
          "evelynn-consuming-rad-090a-167",
          "mordekaiser-dominating-rad-137a-167",
          "ziggs-short-fused-rad-023a-167",
          "seraphine-inspiring-rad-065a-167",
          "jarvan-iv-martial-paragon-rad-091a-167",
          "evelynn-in-control-rad-109a-167",
          "k-sante-dauntless-rad-045a-167",
          "orianna-mechanical-marvel-rad-068a-167",
          "ekko-revolutionary-rad-021a-167",
          "ziggs-explosive-rad-112a-167",
          "ekko-ingenious-rad-061a-167",
          "k-sante-courageous-rad-086a-167",
          "orianna-exquisite-rad-042a-167",
          "jarvan-iv-royal-heir-rad-133a-167",
          "seraphine-starry-eyed-songstress-rad-174as-167",
        ],
      },
    ],
    browseCta: {
      href: "/cards/printing/alternate-art",
      label: "Every alternate-art printing, all sets →",
      blurb: "Alt arts from every Riftbound set, with prices in your market.",
    },
    body: `Radiance's alternate arts are the printings with an **"a"** in the collector number. Each one is a main-set card in different art, at Showcase rarity, with the same rules text. If you want the wider picture of how Showcase, Signature and Overnumbered differ, [the variant glossary](/guides/riftbound-variant-glossary) explains each; this guide is only Radiance's alt arts and what they cost on the day the set went on sale.

## Every Radiance alt art next to its base card

Prices are the cheapest in-stock US listing in our data on **23 October 2026**. The base column is the main-set printing with the same number.

| Alt art | Card | Domain | Alt art, cheapest US | Base printing | Base, cheapest US |
| --- | --- | --- | --- | --- | --- |
| 043a | [Riven, Broken Blade](/card/riven-broken-blade-rad-043a-167) | Calm | $29.41 | [043 (Rare)](/card/riven-broken-blade-rad-043-167) | $1.84 |
| 138a | [Seraphine, Not Alone](/card/seraphine-not-alone-rad-138a-167) | Order | $23.99 | [138 (Epic)](/card/seraphine-not-alone-rad-138-167) | $4.00 |
| 114a | [Riven, Deserter](/card/riven-deserter-rad-114a-167) | Chaos | $17.99 | [114 (Epic)](/card/riven-deserter-rad-114-167) | $5.50 |
| 020a | [Mordekaiser, Twice Slain](/card/mordekaiser-twice-slain-rad-020a-167) | Fury | $17.00 | [020 (Rare)](/card/mordekaiser-twice-slain-rad-020-167) | $2.00 |
| 090a | [Evelynn, Consuming](/card/evelynn-consuming-rad-090a-167) | Body | $16.98 | [090 (Epic)](/card/evelynn-consuming-rad-090-167) | $5.00 |
| 137a | [Mordekaiser, Dominating](/card/mordekaiser-dominating-rad-137a-167) | Order | $16.00 | [137 (Epic)](/card/mordekaiser-dominating-rad-137-167) | $10.00 |
| 023a | [Ziggs, Short-Fused](/card/ziggs-short-fused-rad-023a-167) | Fury | $15.00 | [023 (Epic)](/card/ziggs-short-fused-rad-023-167) | $4.88 |
| 065a | [Seraphine, Inspiring](/card/seraphine-inspiring-rad-065a-167) | Mind | $15.00 | [065 (Rare)](/card/seraphine-inspiring-rad-065-167) | $0.90 |
| 091a | [Jarvan IV, Martial Paragon](/card/jarvan-iv-martial-paragon-rad-091a-167) | Body | $14.99 | [091 (Epic)](/card/jarvan-iv-martial-paragon-rad-091-167) | $5.00 |
| 109a | [Evelynn, In Control](/card/evelynn-in-control-rad-109a-167) | Chaos | $14.18 | [109 (Rare)](/card/evelynn-in-control-rad-109-167) | $1.00 |
| 045a | [K'Sante, Dauntless](/card/k-sante-dauntless-rad-045a-167) | Calm | $10.73 | [045 (Epic)](/card/k-sante-dauntless-rad-045-167) | $3.00 |
| 068a | [Orianna, Mechanical Marvel](/card/orianna-mechanical-marvel-rad-068a-167) | Mind | $10.00 | [068 (Epic)](/card/orianna-mechanical-marvel-rad-068-167) | $3.51 |
| 021a | [Ekko, Revolutionary](/card/ekko-revolutionary-rad-021a-167) | Fury | $9.99 | [021 (Epic)](/card/ekko-revolutionary-rad-021-167) | $8.00 |
| 112a | [Ziggs, Explosive](/card/ziggs-explosive-rad-112a-167) | Chaos | $9.42 | [112 (Rare)](/card/ziggs-explosive-rad-112-167) | $0.15 |
| 061a | [Ekko, Ingenious](/card/ekko-ingenious-rad-061a-167) | Mind | $6.00 | [061 (Rare)](/card/ekko-ingenious-rad-061-167) | $0.41 |
| 086a | [K'Sante, Courageous](/card/k-sante-courageous-rad-086a-167) | Body | $5.81 | [086 (Rare)](/card/k-sante-courageous-rad-086-167) | $1.00 |
| 042a | [Orianna, Exquisite](/card/orianna-exquisite-rad-042a-167) | Calm | $4.99 | [042 (Rare)](/card/orianna-exquisite-rad-042-167) | $1.00 |
| 133a | [Jarvan IV, Royal Heir](/card/jarvan-iv-royal-heir-rad-133a-167) | Order | $0.31 | [133 (Rare)](/card/jarvan-iv-royal-heir-rad-133-167) | $0.59 |
| 174a* | [Seraphine, Starry-Eyed Songstress](/card/seraphine-starry-eyed-songstress-rad-174as-167) | Mind | $1,040.99 | [174* (signed)](/card/seraphine-starry-eyed-songstress-rad-174s-167) | $2,312.54 |

[[embed:0]]

## Reading the table

**The alt art is priced as its own card.** Ziggs, Explosive is a $0.15 Rare at 112/167 and a $9.42 alt art at 112a/167. Searching a store for the card's name alone can show you either, so check the number on the listing.

**Every unsigned alt art is a champion unit.** No Radiance gear, spell or non-champion unit got an "a" printing in the main set, which is why the table reads like a roll call of the nine Legends' champions. The runes have an alternate-art cycle of their own (R01A to R06A), which this guide leaves out.

**Base rarity doesn't decide the alt-art price.** The two dearest alt arts, Riven, Broken Blade and Seraphine, Not Alone, have a Rare and an Epic behind them. Nine of the 18 unsigned alt arts are alternates of Rares, nine of Epics.

**One alt art is a signed Legend.** Seraphine, Starry-Eyed Songstress 174a*/167 combines the alternate art with an artist's signature, and on release day only one US store listed it. [The Seraphine signature guide](/blog/riftbound-radiance-seraphine-signature) covers both of her signed printings.

**A $0.31 Showcase is not a mistake in our table,** it is one store's listing: Jarvan IV, Royal Heir 133a was in stock at 24 stores across the six markets on release day, and the US low was below the base Rare's. One-store lows like this tend not to last, so read the full comparison on the card page before you count on it.

## Release-day prices in every market

Cheapest in-stock listing in local currency, 23 October 2026. The signed Seraphine is left out here; her prices are in [the Seraphine signature guide](/blog/riftbound-radiance-seraphine-signature).

| Alt art | US | Australia | UK | Canada | Singapore | EU |
| --- | --- | --- | --- | --- | --- | --- |
| Riven, Broken Blade 043a | $29.41 | A$46.50 | £23.23 | C$29.99 | S$39.70 | €15.00 |
| Seraphine, Not Alone 138a | $23.99 | A$37.54 | £8.00 | C$24.99 | S$33.40 | €6.49 |
| Riven, Deserter 114a | $17.99 | A$31.42 | £12.00 | C$19.99 | S$26.44 | €16.00 |
| Mordekaiser, Twice Slain 020a | $17.00 | A$27.25 | £5.00 | C$20.00 | S$25.64 | €5.45 |
| Evelynn, Consuming 090a | $16.98 | A$26.59 | £10.00 | C$20.00 | S$22.92 | €6.92 |
| Mordekaiser, Dominating 137a | $16.00 | A$28.50 | £14.00 | C$19.99 | S$27.83 | €12.00 |
| Ziggs, Short-Fused 023a | $15.00 | A$22.51 | £7.00 | C$2.00 | S$20.89 | €8.90 |
| Seraphine, Inspiring 065a | $15.00 | A$8.00 | £6.50 | C$19.99 | S$6.98 | €3.98 |
| Jarvan IV, Martial Paragon 091a | $14.99 | A$23.46 | £11.00 | C$19.99 | S$20.87 | €8.00 |
| Evelynn, In Control 109a | $14.18 | A$23.45 | £9.50 | C$19.43 | S$19.14 | €8.39 |
| K'Sante, Dauntless 045a | $10.73 | A$21.50 | £4.00 | C$14.70 | S$14.49 | €5.00 |
| Orianna, Mechanical Marvel 068a | $10.00 | A$35.00 | £7.00 | C$13.70 | S$34.25 | €7.98 |
| Ekko, Revolutionary 021a | $9.99 | A$15.64 | £8.48 | C$13.69 | S$13.91 | €9.87 |
| Ziggs, Explosive 112a | $9.42 | A$15.00 | £7.00 | C$12.91 | S$12.72 | €7.00 |
| Ekko, Ingenious 061a | $6.00 | A$9.39 | £4.00 | C$8.22 | S$8.35 | €4.50 |
| K'Sante, Courageous 086a | $5.81 | A$14.00 | £4.59 | C$7.96 | S$7.84 | €4.90 |
| Orianna, Exquisite 042a | $4.99 | A$7.82 | £4.48 | C$6.84 | S$6.96 | €5.28 |
| Jarvan IV, Royal Heir 133a | $0.31 | A$1.00 | £0.24 | C$0.42 | S$0.42 | €0.29 |

Single-store lows show up here too: a C$2.00 Ziggs, Short-Fused 023a in Canada and an A$8.00 Seraphine, Inspiring 065a in Australia sit far below the same card's price in the other markets. They are real listings on the day, and one store's stock, so they may not last.

## The champions behind the alt arts

All 18 unsigned alt arts are champion units, two for each of the nine Radiance Legends' champions. That pairing is the useful way to read them: a player building around a Legend often wants the matching champion units in the same art treatment.

- **Riven:** [Broken Blade](/card/riven-broken-blade-rad-043a-167) (Calm) chooses a different bonus each time she exhausts, and [Deserter](/card/riven-deserter-rad-114a-167) (Chaos) grows as your other units exhaust. Both alt arts were among the four dearest.
- **Seraphine:** [Not Alone](/card/seraphine-not-alone-rad-138a-167) (Order) makes Recruit tokens, and [Inspiring](/card/seraphine-inspiring-rad-065a-167) (Mind) has Disarm 2 and draws when you exhaust three units at once.
- **Mordekaiser:** [Twice Slain](/card/mordekaiser-twice-slain-rad-020a-167) (Fury) has Accelerate and Assault 3, and [Dominating](/card/mordekaiser-dominating-rad-137a-167) (Order) kills a unit or gear for a discard.
- **Evelynn:** [Consuming](/card/evelynn-consuming-rad-090a-167) (Body) has Ambush, and [In Control](/card/evelynn-in-control-rad-109a-167) (Chaos) has Disarm and can score from a facedown card.
- **Ziggs:** [Short-Fused](/card/ziggs-short-fused-rad-023a-167) (Fury) and [Explosive](/card/ziggs-explosive-rad-112a-167) (Chaos) both make Bomb gear tokens, the Deploy gear the Ziggs Legend is built on.
- **Jarvan IV:** [Martial Paragon](/card/jarvan-iv-martial-paragon-rad-091a-167) (Body) gives Deploy gear Action timing; [Royal Heir](/card/jarvan-iv-royal-heir-rad-133a-167) (Order) has Assault and Tank.
- **K'Sante:** [Dauntless](/card/k-sante-dauntless-rad-045a-167) (Calm) doubles Shield, and [Courageous](/card/k-sante-courageous-rad-086a-167) (Body) has Accelerate and Shield 2.
- **Orianna:** [Mechanical Marvel](/card/orianna-mechanical-marvel-rad-068a-167) (Mind) discounts gear, and [Exquisite](/card/orianna-exquisite-rad-042a-167) (Calm) has Shield but needs a friendly gear to deal combat damage.
- **Ekko:** [Revolutionary](/card/ekko-revolutionary-rad-021a-167) (Fury) enters ready with Assault, and [Ingenious](/card/ekko-ingenious-rad-061a-167) (Mind) returns a unit to hand as he arrives and has Ganking.

The Legends themselves, and their own Showcase printings, are in [the Radiance Legends guide](/guides/riftbound-radiance-legends); the Epic base cards of nine of these alt arts are in [the Epic guide](/guides/riftbound-radiance-epic-cards).

## How we measured

All prices come from our public data export of 23 October 2026 (02:07 UTC), release day: the lowest in-stock listing of that exact printing per market, from the stores we track. They are listing prices from our two imports a day. Because an alt art and its base share a name, our matching keys on the collector number, which is also what to check on a listing before you buy.

## Buying Radiance alt arts

- **Every card page lists stores cheapest first by item price,** with the delivered total shown where the store publishes its postage.
- **Set an [alert](/alerts)** on the alt art you want rather than checking it daily.
- **Opening packs for one?** The [pack simulator](/games/pack-sim) opens virtual Radiance packs at the set's rarity mix, and the [box EV calculator](/tools/box-ev) shows what a box's singles add up to at today's prices.`,
  },
  {
    slug: "riftbound-radiance-legends",
    category: "guide",
    title: "Riftbound Radiance Legends: All 9, Priced",
    excerpt:
      "All nine Riftbound Radiance Legends and every printing of each: base Rare, Showcase overnumber and signed copy, with release-day prices from $0.19.",
    author: "RiftCompare",
    date: DAY,
    readMins: 6,
    tags: ["radiance", "legends", "prices", "deckbuilding", "card list"],
    hero: {
      src: "/radiance-spoilers/orianna-lady-of-clockwork.jpg",
      alt: "Orianna, Lady of Clockwork, the Radiance Legend with the dearest base printing on release day",
    },
    summary: [
      "**Radiance has nine Legends,** each printed as a base Rare (139/167 to 155/167), a Showcase overnumber (168/167 to 176/167) and a signed copy with a \"*\".",
      "**The base Legends were cheap on release day:** from $0.19 (Ziggs) to $4.98 (Orianna) for the cheapest US listing, in stock at 30 to 34 stores each.",
      "**The overnumbers started at $94.00 (Jarvan IV) and the dearest was Riven at $369.47.**",
      "**The signed copies are a different market:** Seraphine 174* led at $2,312.54, and most had fewer than ten stores in stock.",
    ],
    faq: [
      {
        q: "Who are the Riftbound Radiance Legends?",
        a: "Nine: Ekko, Boy Who Shattered Time; Ziggs, Hexplosives Expert; Mordekaiser, Iron Revenant; Orianna, Lady of Clockwork; K'Sante, Pride of Nazumah; Seraphine, Starry-Eyed Songstress; Evelynn, Agony's Embrace; Jarvan IV, Exemplar of Demacia; and Riven, The Exile.",
      },
      {
        q: "What is the cheapest Radiance Legend?",
        a: "Ziggs, Hexplosives Expert, 141/167, at $0.19 for the cheapest US listing on release day (23 October 2026), followed by Ekko, Boy Who Shattered Time at $0.38. Every base Legend started under $5.",
      },
      {
        q: "Which Radiance Legend printing is the most expensive?",
        a: "Seraphine, Starry-Eyed Songstress 174*/167, the signed overnumber, at $2,312.54 for the cheapest US listing on release day. Her alternate-art signed printing, 174a*/167, was $1,040.99.",
      },
      {
        q: "Do I need the Showcase Legend to play it?",
        a: "No. The base Rare, the Showcase overnumber and the signed copy are the same card in play; only the art, the number and the price differ. For a deck, the base printing does the job.",
      },
    ],
    embeds: [
      {
        title: "The nine Radiance Legends (base printings), with today's prices",
        note: "Today's cheapest listing in your market; open a card for its Showcase and signed printings.",
        slugs: [
          "orianna-lady-of-clockwork-rad-145-167",
          "riven-the-exile-rad-149-167",
          "mordekaiser-iron-revenant-rad-143-167",
          "seraphine-starry-eyed-songstress-rad-151-167",
          "jarvan-iv-exemplar-of-demacia-rad-155-167",
          "evelynn-agony-s-embrace-rad-153-167",
          "k-sante-pride-of-nazumah-rad-147-167",
          "ekko-boy-who-shattered-time-rad-139-167",
          "ziggs-hexplosives-expert-rad-141-167",
        ],
      },
      {
        title: "The Showcase overnumbers, with today's prices",
        slugs: [
          "riven-the-exile-rad-173-167",
          "evelynn-agony-s-embrace-rad-175-167",
          "mordekaiser-iron-revenant-rad-170-167",
          "seraphine-starry-eyed-songstress-rad-174-167",
          "orianna-lady-of-clockwork-rad-171-167",
          "ziggs-hexplosives-expert-rad-169-167",
          "ekko-boy-who-shattered-time-rad-168-167",
          "k-sante-pride-of-nazumah-rad-172-167",
          "jarvan-iv-exemplar-of-demacia-rad-176-167",
        ],
      },
    ],
    browseCta: {
      href: "/cards/type/legend",
      label: "Every Riftbound Legend, all sets →",
      blurb: "Legends from every set, sortable by price in your market.",
    },
    body: `A Legend is the card a Riftbound deck is built around, and Radiance brings nine of them. Each Legend comes in three printings: the **base Rare** in the main set, a **Showcase overnumber** numbered past 167, and a **signed** Showcase with a "*" after the number (Seraphine also has a signed alternate art, 174a*). They are the same card in play. This guide is the price of each, on the day the set went on sale.

## The nine Legends, every printing

Prices are the cheapest in-stock US listing in our data on **23 October 2026**; "stores" is how many stores across our six markets had that printing in stock.

| Legend | Domain | Base Rare | Showcase overnumber | Signed |
| --- | --- | --- | --- | --- |
| [Orianna, Lady of Clockwork](/card/orianna-lady-of-clockwork-rad-145-167) | Calm | 145: $4.98 (30 stores) | [171](/card/orianna-lady-of-clockwork-rad-171-167): $140.00 (22) | [171*](/card/orianna-lady-of-clockwork-rad-171s-167): $500.00 (16) |
| [Riven, The Exile](/card/riven-the-exile-rad-149-167) | Calm | 149: $3.81 (31) | [173](/card/riven-the-exile-rad-173-167): $369.47 (25) | [173*](/card/riven-the-exile-rad-173s-167): too few listings to quote |
| [Mordekaiser, Iron Revenant](/card/mordekaiser-iron-revenant-rad-143-167) | Fury | 143: $2.93 (32) | [170](/card/mordekaiser-iron-revenant-rad-170-167): $200.00 (15) | [170*](/card/mordekaiser-iron-revenant-rad-170s-167): $949.05 (15) |
| [Seraphine, Starry-Eyed Songstress](/card/seraphine-starry-eyed-songstress-rad-151-167) | Mind | 151: $2.50 (34) | [174](/card/seraphine-starry-eyed-songstress-rad-174-167): $200.00 (14) | [174*](/card/seraphine-starry-eyed-songstress-rad-174s-167): $2,312.54 (7) |
| [Jarvan IV, Exemplar of Demacia](/card/jarvan-iv-exemplar-of-demacia-rad-155-167) | Body | 155: $1.43 (30) | [176](/card/jarvan-iv-exemplar-of-demacia-rad-176-167): $94.00 (19) | [176*](/card/jarvan-iv-exemplar-of-demacia-rad-176s-167): $905.19 (8) |
| [Evelynn, Agony's Embrace](/card/evelynn-agony-s-embrace-rad-153-167) | Body | 153: $1.14 (30) | [175](/card/evelynn-agony-s-embrace-rad-175-167): $230.00 (21) | [175*](/card/evelynn-agony-s-embrace-rad-175s-167): $1,799.00 (8) |
| [K'Sante, Pride of Nazumah](/card/k-sante-pride-of-nazumah-rad-147-167) | Calm | 147: $0.97 (30) | [172](/card/k-sante-pride-of-nazumah-rad-172-167): $100.00 (23) | [172*](/card/k-sante-pride-of-nazumah-rad-172s-167): $1,304.33 (8) |
| [Ekko, Boy Who Shattered Time](/card/ekko-boy-who-shattered-time-rad-139-167) | Fury | 139: $0.38 (31) | [168](/card/ekko-boy-who-shattered-time-rad-168-167): $124.58 (14) | [168*](/card/ekko-boy-who-shattered-time-rad-168s-167): $1,100.00 (7) |
| [Ziggs, Hexplosives Expert](/card/ziggs-hexplosives-expert-rad-141-167) | Fury | 141: $0.19 (32) | [169](/card/ziggs-hexplosives-expert-rad-169-167): $130.00 (22) | [169*](/card/ziggs-hexplosives-expert-rad-169s-167): $1,600.00 (9) |

[[embed:0]]

## What the prices say, and what they don't

**For a deck, the base Rare is the card.** Every base Legend started under $5 on release day, and each was in stock at 30 to 34 stores, so the cheapest copy is rarely at the store you'd check first. The price comparison on each card page lists them cheapest first by item price.

**The overnumbers are about 28 to 680 times the base price.** Riven, The Exile's base Rare was the second-dearest base Legend ($3.81), and his overnumber 173/167 was the dearest overnumber at $369.47. Ziggs had the cheapest base ($0.19) and an overnumber at $130.00. The price of the art is not the price of the card in play.

**The signed copies are thinly listed.** Most were in stock at fewer than ten stores on release day, so one listing can move the "cheapest" figure a long way. Signed Riven 173* had too few US listings for a figure we'd stand behind. [Every Radiance signature card](/blog/riftbound-radiance-signature-cards) has who signed each and the first prices since 17 October.

[[embed:1]]

## What each Legend does

Summaries are ours; every card page carries the printed rules text.

**Fury.** [Ekko, Boy Who Shattered Time](/card/ekko-boy-who-shattered-time-rad-139-167) uses Empower: once Empowered, he can Disempower to make your next unit this turn cost 2 less, at the price of that unit dying at end of turn. [Ziggs, Hexplosives Expert](/card/ziggs-hexplosives-expert-rad-141-167) pays and exhausts to play a Bomb gear token, which has Deploy and blows up for 2 when it dies. [Mordekaiser, Iron Revenant](/card/mordekaiser-iron-revenant-rad-143-167) banishes a unit or gear from your trash to add power that only pays for units or gear.

**Calm.** [Orianna, Lady of Clockwork](/card/orianna-lady-of-clockwork-rad-145-167) turns one of your gears into a unit with Might equal to its cost at the start of your Main Phase. [Riven, The Exile](/card/riven-the-exile-rad-149-167) makes units you play to battlefields you control enter ready. [K'Sante, Pride of Nazumah](/card/k-sante-pride-of-nazumah-rad-147-167) gives a unit Assault equal to its Shield for the turn.

**Body.** [Evelynn, Agony's Embrace](/card/evelynn-agony-s-embrace-rad-153-167) draws a card once a turn when you play a card from face down (and discards if it's not your turn). [Jarvan IV, Exemplar of Demacia](/card/jarvan-iv-exemplar-of-demacia-rad-155-167) moves a friendly unit to a battlefield when you play a Deploy gear there.

**Mind.** [Seraphine, Starry-Eyed Songstress](/card/seraphine-starry-eyed-songstress-rad-151-167) can be exhausted with three friendly units to make a spell cost 2 less.

Four of the nine mention gear (Ziggs, Jarvan IV, Orianna and Mordekaiser), and two of those, Ziggs and Jarvan IV, are built on Deploy. That is the set's theme, and [the Deploy explainer](/guides/riftbound-deploy-explained) covers how a Deploy gear lives and dies on a battlefield.

## The base Legends in every market

Cheapest in-stock listing in local currency, 23 October 2026.

| Legend | US | Australia | UK | Canada | Singapore | EU |
| --- | --- | --- | --- | --- | --- | --- |
| Orianna, Lady of Clockwork | $4.98 | A$7.25 | £0.50 | C$0.99 | S$6.72 | €0.35 |
| Riven, The Exile | $3.81 | A$5.80 | £0.50 | C$0.99 | S$5.14 | €0.35 |
| Mordekaiser, Iron Revenant | $2.93 | A$4.20 | £0.50 | C$0.99 | S$3.96 | €0.35 |
| Seraphine, Starry-Eyed Songstress | $2.50 | A$8.40 | £0.50 | C$0.99 | S$5.58 | €0.35 |
| Jarvan IV, Exemplar of Demacia | $1.43 | A$2.25 | £0.50 | C$0.99 | S$1.93 | €0.35 |
| Evelynn, Agony's Embrace | $1.14 | A$2.50 | £0.50 | C$0.99 | S$1.54 | €0.35 |
| K'Sante, Pride of Nazumah | $0.97 | A$1.80 | £0.50 | C$0.99 | S$1.31 | €0.35 |
| Ekko, Boy Who Shattered Time | $0.38 | A$0.50 | £0.30 | C$0.30 | S$0.51 | €0.35 |
| Ziggs, Hexplosives Expert | $0.19 | A$0.50 | £0.15 | C$0.26 | S$0.26 | €0.35 |

The flat £0.50, C$0.99 and €0.35 rows are what they look like: on release day, at least one store in each of those markets listed every base Legend at one price, so the cheapest copy there was the same whatever the Legend. The US, Australian and Singapore lows are where the Legends were actually priced apart.

## The Showcase overnumbers in every market

| Overnumber | US | Australia | UK | Canada | Singapore | EU |
| --- | --- | --- | --- | --- | --- | --- |
| Riven 173 | $369.47 | A$475.00 | £225.00 | C$399.99 | S$422.09 | €322.57 |
| Evelynn 175 | $230.00 | A$367.76 | £120.00 | C$315.10 | S$327.21 | €175.00 |
| Mordekaiser 170 | $200.00 | A$312.99 | £95.00 | C$159.99 | S$278.47 | €130.00 |
| Seraphine 174 | $200.00 | A$424.70 | £110.00 | C$274.00 | S$362.02 | €240.00 |
| Orianna 171 | $140.00 | A$219.09 | £68.00 | C$191.80 | S$194.93 | €99.00 |
| Ziggs 169 | $130.00 | A$250.39 | £100.00 | C$178.10 | S$175.50 | €119.60 |
| Ekko 168 | $124.58 | A$188.98 | £65.00 | C$99.99 | S$184.96 | €95.00 |
| K'Sante 172 | $100.00 | A$139.00 | £60.00 | C$137.00 | S$150.75 | €85.00 |
| Jarvan IV 176 | $94.00 | A$148.50 | £55.43 | C$128.78 | S$126.90 | €55.00 |

Riven's overnumber led in all six markets, and Jarvan IV's was the cheapest in four of them (the US, the UK, Singapore and the EU); K'Sante's was cheaper in Australia and Ekko's in Canada.

## Which printing to buy

The three printings are one card in a game, so the question is only what you are paying for.

- **To play the Legend,** buy the base Rare. On release day the nine base Legends together cost $18.33 at the cheapest US listing of each, less than any single overnumber.
- **For the art,** the Showcase overnumber is the one numbered past the set (168/167 to 176/167). The nine together came to $1,588.05 on release day; the cheapest, Jarvan IV at $94.00, was still about 66 times his base Rare.
- **For the signature,** check the asterisk on the number and the listing's photos. With most signed copies in stock at fewer than ten stores, the cheapest listing on a given day is one store's price; set an alert and compare across all six markets before you commit.

## How we measured

All prices come from our public data export of 23 October 2026 (02:07 UTC), the day Radiance went on sale: the lowest in-stock listing of each exact printing per market, from the stores we track, with each store counted once per market. They are listing prices from our two imports a day, not sales. A signed printing with only a handful of listings is shown as "too few listings" rather than given a figure we can't stand behind.

## Picking a Radiance Legend

- **Each Legend's champion page gathers that champion's cards from every set:** [Ekko](/champions/ekko), [Seraphine](/champions/seraphine), [K'Sante](/champions/ksante) and the rest are linked from [the champions index](/champions).
- **Radiance's new keywords** shape several of these Legends' decks: [Deploy](/guides/riftbound-deploy-explained), [Disarm](/guides/riftbound-disarm-explained) and [Show Off](/guides/riftbound-showoff-explained).
- **Price the whole deck** in the [deck pricer](/deck) or let [Best Basket](/tools/best-basket) split it across stores so you pay postage as few times as possible.
- **Waiting for a Showcase to come down?** A [price alert](/alerts) emails you when it reaches your number. We don't forecast prices; [the Vendetta numbers](/blog/riftbound-radiance-card-list) show what the last set's cards did after launch.`,
  },
];
