import type { PokemonPost } from "../types";

// A data post on the two Elite Trainer Boxes a set can have. Pack counts and
// prices come from the etb-vs-pc-etb and pack-counts blocks; the prose only
// restates what lib/pokemon/kinds.ts says each kind is, and how the counts and
// the eBay matching work (packs.ts, ebay-match.ts).

export const pokemonCenterEtbVsEliteTrainerBox: PokemonPost = {
  slug: "pokemon-center-etb-vs-elite-trainer-box",
  title: "Pokémon Center ETB vs Elite Trainer Box: Packs and Price",
  excerpt:
    "The Pokémon Center Elite Trainer Box against the regular ETB, set by set: booster packs in each from the published contents, and the cheapest listing.",
  author: "RiftCompare",
  date: "2026-10-01",
  status: "draft",
  kind: "data",
  tags: ["Elite Trainer Boxes", "Pokémon Center", "Price per pack"],
  summary: [
    "{{etbPcPacksLine}}",
    "{{etbVsPcLine}}",
    "{{pcEtbGapLine}}",
    "Both are compared at the cheapest open US listing we track, item price only, {{asOf}}. Every ETB we price is on [Elite Trainer Box prices](/pokemon/elite-trainer-boxes).",
  ],
  body: `
A set can come with two Elite Trainer Boxes that look almost the same: the regular one, sold through stores, and the Pokémon Center version, the official store's own. They share a name and most of what is inside, so the question a buyer has is a simple one. What does the Pokémon Center box add, and what does it cost per pack?

This post sets the two side by side for each recent set that has both, using the contents TCGplayer publishes for these boxes and the cheapest open listing we track in the United States. Nothing in the tables is typed by hand: they are computed from the same catalogue as our [Elite Trainer Box prices](/pokemon/elite-trainer-boxes) each time the page is rebuilt, so they always match what the price pages show.

## What the two boxes share

An Elite Trainer Box bundles booster packs with sleeves, energy cards, dice, condition markers and a storage box with dividers. Those are the parts of the box a player keeps using after the packs are opened, and both versions carry them. If you are choosing between the two for the accessories, there is little to choose.

## What the Pokémon Center version adds

The Pokémon Center Elite Trainer Box is the official store's own version of the ETB, usually with extra booster packs and a stamped promo card. We hold no data on the promo card, so it plays no part in anything below. The extra packs are the part we can measure. Here are the most common counts of each kind across the recent sets, with where each count was read:

[[pk:pack-counts]]

{{etbPcPacksLine}}

Both counts come from published contents lists, so neither is a guess. Neither kind of Elite Trainer Box is ever counted from its name: without a contents list, a box gets no count and no per-pack figure. The same happens when a contents list includes packs that are not standard boosters, because a per-pack figure would then mean nothing.

## Set by set

Each row is a recent set with both boxes. For each box we show its pack count, the cheapest open US listing we track, and that price divided by its packs. When TCGplayer lists more than one version of a box, such as two cover designs, the table uses the cheapest and names it in brackets.

[[pk:etb-vs-pc-etb]]

A dash means there is no open US listing for that box, or no pack count we can read, so there is nothing to divide. A box that has not been released yet is left out altogether.

## Reading the comparison

More packs do not always mean a lower price per pack. The two boxes are listed by different sellers at different prices, and the Pokémon Center box comes out lower per pack only when its extra price, spread over its extra packs, is less than the regular box's own price per pack. Either box can end up ahead, and the table shows which did for each set on the day the figures are dated.

There is one thing a per-pack figure cannot show, and that is the stamped promo card. Some buyers want the Pokémon Center box for that card alone, and for them the per-pack comparison is beside the point. We hold no price for the promo card on its own, so this post does not try to put a figure on it, and neither do our product pages.

The other thing it cannot show is how easy each box is to find. A listing is only in our tables while it is open, so a box that is hard to buy in the United States simply shows a dash, rather than an old price that no longer holds.

## What else to check before you buy

- **Postage.** Every price is the item price, postage extra. A listing for either box can look cheaper until postage is added at checkout.
- **The version.** When a set has more than one cover design, the cheapest listing is for one of them. If you want a particular design, open its product page, where each version has its own prices.
- **Stock.** Only open listings count. A listing we have not re-checked recently shows as unknown and is left out.
- **Pre-orders.** A pre-order price is not something you can open yet, so a box that is still a pre-order stays out of the comparison.
- **Your market.** These are US prices. Our product pages show the cheapest listing we track in each market, with TCGplayer's market price as a converted reference outside the US, marked with ≈.

## How the prices are matched

Prices come from the cheapest open listing we track, the same figure each product page leads with. On eBay, a regular Elite Trainer Box listing never stands in for a Pokémon Center one, or the other way round: a listing has to name the right version of the box to count. That keeps a cheaper regular box from appearing as the Pokémon Center price, which would make the extra packs look free. The full method is in [how we price Pokémon sealed](/pokemon/blog/how-we-price-pokemon-sealed).

## Where to compare

[Elite Trainer Box prices](/pokemon/elite-trainer-boxes) lists every ETB and Pokémon Center ETB we price, set by set, with its pack count and price per pack. [Price per pack](/pokemon/price-per-pack) ranks them against booster boxes and bundles, and [booster box vs ETB vs booster bundle](/pokemon/blog/booster-box-vs-etb-vs-booster-bundle) compares the three side by side for each recent set. To see one release's whole range, start from the [set pages](/pokemon/sets) or [all Pokémon sealed](/pokemon/sealed).
`,
  faq: [
    {
      q: "How many packs are in a Pokémon Center ETB?",
      a: "The most common count among the recent Pokémon Center ETBs is {{pcEtbPacks}} booster packs, read from each box's published contents list.",
    },
    {
      q: "How many packs are in a regular Elite Trainer Box?",
      a: "The most common count among the recent Elite Trainer Boxes is {{etbPacks}} booster packs, read from each box's published contents list.",
    },
    {
      q: "Which costs less per pack, the Pokémon Center ETB or the regular ETB?",
      a: "{{etbVsPcLine}} These are US prices {{asOf}}, at the cheapest open listing we track for each box.",
    },
    {
      q: "How much more does the Pokémon Center ETB cost?",
      a: "{{pcEtbGapLine}} The gap moves with the listings, so check each box's own page before you buy.",
    },
    {
      q: "What else does the Pokémon Center ETB include?",
      a: "It usually adds a stamped promo card as well as the extra booster packs. The sleeves, energy cards, dice, condition markers and storage box are what a regular Elite Trainer Box holds too.",
    },
  ],
  ebay: [
    { label: "Pokémon Center Elite Trainer Boxes", query: "Pokemon Center Elite Trainer Box" },
    { label: "Elite Trainer Boxes", query: "Elite Trainer Box" },
  ],
};
