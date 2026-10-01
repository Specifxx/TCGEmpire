import type { PokemonPost } from "../types";

// A data post: every figure is a [[pk:…]] block or a {{fact}} token computed
// from the US catalogue when the page renders. The prose around them carries
// no digits and names no set, so it stays true whatever the next import says.

export const boosterBoxVsEtbVsBoosterBundle: PokemonPost = {
  slug: "booster-box-vs-etb-vs-booster-bundle",
  title: "Booster Box vs ETB vs Booster Bundle: Price per Pack",
  excerpt:
    "Which Pokémon sealed product costs least per booster pack? The cheapest box, ETB and bundle in each recent set, divided by the packs inside.",
  author: "RiftCompare",
  date: "2026-10-01",
  status: "draft",
  kind: "data",
  tags: ["Price per pack", "Booster boxes", "Elite Trainer Boxes", "Booster bundles"],
  summary: [
    "{{perPackLine}}",
    "{{packCountsLine}}",
    "Every figure is the cheapest open US listing we track divided by the booster packs inside, item price only, {{asOf}}.",
    "For every product with a pack count, in your own market, see [price per pack](/pokemon/price-per-pack).",
  ],
  body: `
Buying booster packs inside a sealed product comes down to one sum: what you pay, divided by the packs you get. A booster box, an Elite Trainer Box and a booster bundle each wrap a different number of packs in a different amount of cardboard, and their prices move apart from one set to the next. This post does that sum for each recent set we price, using the cheapest open listing we track in the United States for each product.

None of the figures below were typed in. Each table is computed from the same catalogue that runs our [Pokémon sealed prices](/pokemon/sealed), every time this page is rebuilt, so the post and the price pages always agree. The tables use US prices: every product we price is a TCGplayer catalogue entry, and TCGplayer's listings are US listings. If you buy somewhere else, the [price per pack](/pokemon/price-per-pack) page ranks products in your own market.

## What each product holds

A **booster box** is a sealed carton of booster packs, sold to stores as one unit. A standard booster box holds booster packs and nothing else: no sleeves, no dice, no promo card. An enhanced booster box adds promos, and its pack count is read only from its contents list. Either way it is the largest of the three by a long way.

An **Elite Trainer Box** bundles booster packs with sleeves, energy cards, dice, condition markers and a storage box with dividers. Part of its price pays for those extras, which matters to a player who needs them and not at all to a collector who only opens packs.

The **Pokémon Center Elite Trainer Box** is the official store's own version of the ETB, usually with extra booster packs and a stamped promo card. We set it against the regular box in [a separate comparison](/pokemon/blog/pokemon-center-etb-vs-elite-trainer-box).

A **booster bundle** is a small sealed pack of booster packs with no extras at all. It is the smallest of the three, and the easiest to compare, because what you pay is almost entirely for packs.

Here is how many packs each one most often holds across the recent sets:

[[pk:pack-counts]]

The count comes from the product's own published contents list whenever it has one. Two of these shapes can also be counted from the name, because each is that size by definition: a booster bundle, and a booster box from a main expansion. An enhanced booster box, whose count varies, never is. A product whose contents list includes packs that are not standard boosters gets no count at all, so it never shows a per-pack figure that would mislead.

## Price per pack, set by set

Each row below is one recent set. Each cell takes the cheapest product of that kind with an open listing and a pack count, and divides its price by the packs inside. The lowest figure in a row is in bold.

[[pk:per-pack-by-set]]

A dash is not a zero. It means we have no open US listing for that product, or no pack count we can read, so there is nothing honest to divide. Some sets have no booster box or no booster bundle in English at all, and some products have no open listing on the day the figures are dated.

## Why the three rarely line up

The per-pack figure carries everything the price pays for. That is the main reason the three products seldom agree.

- A standard booster box spreads its price over the most packs and adds nothing else, so there are no extras inside its figure. An enhanced booster box with a known count carries the cost of its promos in its figure.
- An Elite Trainer Box carries the cost of its accessories in every pack. If you would buy sleeves and dice anyway, part of that cost is something you were going to spend; if you would not, it is cost with no packs behind it.
- A booster bundle has no extras either, but it holds the fewest packs, so a small change in its price moves its per-pack figure the most.
- Listings for each product move on their own. One can climb while another from the same set stays put, and the cheapest listing can change hands from one seller to another overnight.

None of this says which product you should buy. It says what each one costs per pack at the cheapest listing we track, on the day the figures are dated, and leaves the rest to you.

## What the figure leaves out

Price per pack is a narrow comparison, and it is only useful if you know what it ignores.

- **Postage.** Every price is the item price, postage extra. A cheap listing with expensive postage can cost more in total than a dearer one that ships free, so check the listing itself before you buy.
- **The extras.** Sleeves, dice, a storage box or a promo card are useful to some buyers and not to others. The figure counts packs only.
- **Stock.** A listing counts only while it is open. One we have not re-checked recently shows as unknown, never as in stock, and stays out of these tables.
- **Pre-orders.** A pre-order price is not something you can open yet, so pre-orders are left out of every per-pack figure.
- **Half boxes.** A half booster box never stands in for a full box in the booster box column.
- **What packs contain.** Packs from different sets are not the same to every buyer, and we hold no data on what a pack is likely to contain. Comparing per pack across sets compares prices, nothing more.

## How these figures are made

The rules behind every table on this page come straight from the code that runs the section:

[[pk:method-constants]]

Outside the United States, TCGplayer's market price appears on our pages as a converted reference, marked with ≈, never as a price you can buy at. The full method, including how an eBay listing is matched to a product, is in [how we price Pokémon sealed](/pokemon/blog/how-we-price-pokemon-sealed).

## Where to compare

The tables above cover the recent sets only. For every product with a pack count, in your own market, see [price per pack](/pokemon/price-per-pack). To compare one kind across every set we price, start from [booster boxes](/pokemon/booster-boxes), [Elite Trainer Boxes](/pokemon/elite-trainer-boxes) or [booster bundles](/pokemon/booster-bundles). Every product page shows each market's cheapest listing side by side, and the [set pages](/pokemon/sets) group each release's products together.
`,
  faq: [
    {
      q: "Which costs least per pack: a booster box, an ETB or a booster bundle?",
      a: "{{perPackLine}} These are US prices {{asOf}}: the cheapest open listing we track for each product, divided by the booster packs inside.",
    },
    {
      q: "How many booster packs are in a Pokémon booster box?",
      a: "The most common count among the recent booster boxes is {{boxPacks}} booster packs. A half box holds half as many and never stands in for a full one, and an enhanced box is counted only from its contents list.",
    },
    {
      q: "How many packs are in an Elite Trainer Box?",
      a: "The most common count among the recent Elite Trainer Boxes is {{etbPacks}} booster packs, read from each box's published contents list. A Pokémon Center ETB from the same sets most often holds {{pcEtbPacks}}.",
    },
    {
      q: "How many packs are in a booster bundle?",
      a: "The most common count among the recent booster bundles is {{bundlePacks}} booster packs, with nothing else inside.",
    },
    {
      q: "Does the price per pack include postage?",
      a: "No. Every figure is the item price at the cheapest open listing we track, postage extra. Check the listing itself for postage before you buy.",
    },
  ],
  ebay: [
    { label: "Pokémon booster boxes", query: "booster box" },
    { label: "Elite Trainer Boxes", query: "Elite Trainer Box" },
    { label: "Pokémon booster bundles", query: "booster bundle" },
  ],
};
