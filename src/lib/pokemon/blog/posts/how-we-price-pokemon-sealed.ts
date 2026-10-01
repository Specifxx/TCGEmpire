import type { PokemonPost } from "../types";

// The method post. Its prose describes what the code does, rule by rule, and
// must change when the code does: eBay matching (lib/pokemon/ebay-match.ts and
// ebay.ts's search filter), the stale-row rule (lib/sealed-offers.ts, quoted
// through a token), references below the comparison (board.ts), pack counts
// (packs.ts) and price per pack (value.ts). Cardmarket is named only by the
// coverage block, and only when it has rows. The same holds for every claim
// that eBay is searched now: the summary bullet and FAQs that say so quote
// {{ebayMarkets}} or {{importLine}}, which exist only when eBay holds rows, so
// they drop with the importer off. The matching rules stay, as method.

export const howWePricePokemonSealed: PokemonPost = {
  slug: "how-we-price-pokemon-sealed",
  title: "How We Price Pokémon Sealed: Sources, Packs and eBay",
  excerpt:
    "Where our Pokémon sealed prices come from, how eBay listings are matched to a product, how booster packs are counted, and what we leave out on purpose.",
  author: "RiftCompare",
  date: "2026-10-01",
  status: "draft",
  kind: "method",
  tags: ["Method", "Sources", "eBay matching", "Pack counts"],
  summary: [
    "{{coverageLine}}",
    "{{sourcesLine}}",
    "A listing not re-checked within {{offerStaleHours}} hours shows as unknown, never as in stock, and references such as TCGplayer's market price sit below the comparison, never in it.",
    "We search eBay for matching listings in {{ebayMarkets}}; {{ebaySearchOnly}} gets a link to an eBay search only.",
  ],
  body: `
Every price in our Pokémon section comes from a small number of sources, read once a day and put through the same rules. This page sets those rules out in full: where each figure comes from, how an eBay listing is matched to a product, how booster packs are counted, and what we leave out on purpose. The numbers on it are computed from the catalogue each time the page is rebuilt, like every other figure in the section, so they describe the data as it stands on the day they are dated.

## What we cover

[[pk:coverage]]

The catalogue is English-language sealed product: booster boxes, Elite Trainer Boxes, booster bundles, collections, tins, blisters, packs and decks. Every product is a TCGplayer catalogue entry, so one box is one product here whichever shop or seller lists it. Some products are left out by design: distributor cases and displays, which are a reseller's unit rather than a buyer's; combinations TCGplayer builds by joining several products into one listing; code cards; and Japanese, Korean and Chinese products. Every product we price is on [all Pokémon sealed](/pokemon/sealed).

## Where the prices come from

**TCGplayer.** Its own published price data gives us, for every product, the cheapest listing on TCGplayer and TCGplayer's market price. TCGplayer's listings are US listings, so they appear in the United States only.

**eBay.** A tracked eBay price comes from our own search of eBay for the cheapest listing that matches the product. That search runs for booster boxes, Elite Trainer Boxes, Pokémon Center ETBs, booster bundles, and Ultra-Premium and Super-Premium Collections from recent sets, plus pre-orders. It covers fixed-price listings in new condition that the seller will deliver to the market in question. eBay allows a limited number of searches a day, shared with the rest of the site, so products are searched in rotation: the ones never checked come first, then the ones checked longest ago.

**eBay searches.** Every product, tracked or not, also links to a search of the visitor's own eBay site. A search shows everything listed there; it is not a price we have checked, and we never present it as one.

## How an eBay listing is matched to a product

A wrong match would put a false cheapest price on the page, while a missed one costs nothing, because the page still offers the eBay search. So a listing counts only when all of these hold:

- Its title names every distinctive word of the product's name: the words that make it this product and not another one.
- It names the right product type. A half box never stands in for a booster box, and a regular Elite Trainer Box never for a Pokémon Center one, or the other way round.
- It does not name a different set.
- It shows no sign of being something else: a lot of several items, an empty or opened box, an accessory, a damaged or graded item, or a product in another language.
- Its price is at least a floor set for its product type, and at least half of TCGplayer's market price where there is one, so a mislabelled single card or an empty box cannot pass as the product.

Of the listings that pass, the cheapest by item price plus the postage the seller states wins, after any listing priced far below all the others is set aside as an outlier. Counting the stated postage at this step means a listing cannot win by moving its price into postage.

## Which listings count, and when they go stale

A listing is open while it is in stock and we have checked it recently. One we have not re-checked within the window below shows as unknown, never as in stock, and only an open listing can set the headline price of a product. Listings are ranked cheapest first by item price. Postage is extra: eBay rows show the postage the seller states beside the price, and every other price is the item price alone.

[[pk:method-constants]]

## References sit below the comparison

TCGplayer's market price is shown on our product pages, but never inside the comparison: it sits below it as a reference. Outside the United States it is converted with an approximate exchange rate and marked with ≈, because it is a US figure in another currency, not a price anyone there is asking. A reference never sets a headline price and never ranks against a listing.

## How booster packs are counted

Price per pack needs a pack count, and a wrong count would make every per-pack figure built on it wrong. So a count comes from the product's own published contents list whenever it has one. Only a few shapes are counted from the name, each because it is that size by definition: a single booster pack, a blister that states its pack count, a booster bundle, and a booster box from a main expansion, with a half box counted as half. An enhanced booster box, whose count varies, is not counted from its name.

A product whose contents list includes packs that are not standard boosters gets no count, because a per-pack figure would mean nothing. Everything else without a contents list gets no count either. We would rather show a dash than a guess.

Price per pack is then the cheapest open listing divided by the pack count, rounded to the cent. Pre-orders are left out of every per-pack ranking, and a half box never stands for the booster box of its set. Our [price per pack](/pokemon/price-per-pack) rankings and the [booster box vs ETB vs booster bundle](/pokemon/blog/booster-box-vs-etb-vs-booster-bundle) and [Pokémon Center ETB vs Elite Trainer Box](/pokemon/blog/pokemon-center-etb-vs-elite-trainer-box) comparisons all run on these counts.

## What we leave out on purpose

- **Suggested retail prices.** Published figures disagree with each other, and until each one has a source we can cite, we show none.
- **What items sold for.** Every price you can compare is a listing, not what an item sold for. TCGplayer's market price is TCGplayer's own figure, shown only as a reference.
- **Predictions.** We say nothing about where a price goes next, up or down.
- **What packs contain.** We hold no data on what a pack is likely to contain, so nothing here compares sets by their cards.
- **Total cost.** We rank by item price, not by what an order costs once postage is added, because postage depends on the seller, the buyer and the rest of the basket.

## Corrections

RiftCompare is built and run by one person, Bill, and this section is new. If a price or a pack count looks wrong, the [contact page](/contact) reaches him directly, and a fix to the data reaches every page that shows it. More about the site and how it is run is on the [about page](/about).
`,
  faq: [
    {
      q: "Where do the prices come from?",
      a: "{{sourcesLine}}",
    },
    {
      q: "How often are the prices updated?",
      a: "Once a day. {{importLine}} The prices in this post are {{asOf}}.",
    },
    {
      q: "When does a listing count as out of date?",
      a: "When we have not re-checked it within {{offerStaleHours}} hours. It then shows as unknown, never as in stock, and it cannot set a product's headline price.",
    },
    {
      q: "Which eBay markets do you search?",
      a: "We search eBay for matching listings in {{ebayMarkets}}. In {{ebaySearchOnly}} we search for no listing of our own, and every product links to a search of eBay instead.",
    },
    {
      q: "Do these prices show what boxes sold for?",
      a: "No. Every price you can compare is a listing, not what an item sold for. TCGplayer's market price appears as a reference below the comparison, never as a price you can buy at.",
    },
    {
      q: "How do you count the booster packs in a product?",
      a: "From the product's own published contents list whenever it has one. Only a single pack, a blister that states its count, a booster bundle and a main-expansion booster box are counted from the name; anything else without a contents list gets no count rather than a guess.",
    },
  ],
  ebay: [
    { label: "Pokémon sealed", query: "sealed" },
    { label: "Pokémon booster boxes", query: "booster box" },
  ],
};
