// File-based content for the Blog and Guides sections. Authored by us (not user
// input), rendered with the lightweight <Markdown> component. To publish a new
// article, add an entry here.

export type ArticleCategory = "blog" | "guide";

export interface Article {
  slug: string;
  category: ArticleCategory;
  title: string;
  excerpt: string;
  author: string;
  date: string; // ISO (YYYY-MM-DD)
  readMins: number;
  tags: string[];
  body: string; // markdown
}

export const ARTICLES: Article[] = [
  {
    slug: "welcome-to-riftcompareau",
    category: "blog",
    title: "Welcome to RiftCompareAU",
    excerpt:
      "What RiftCompareAU is, why we built it, and how it helps Australian Riftbound players find the cheapest cards.",
    author: "RiftCompareAU",
    date: "2026-06-06",
    readMins: 2,
    tags: ["news", "about"],
    body: `RiftCompareAU is a free price-comparison tool for **Riftbound: League of Legends TCG**, built for Australian players.

Riftbound is exciting, but tracking down the cheapest copy of a card across a dozen different stores is tedious — every shop prices differently, stock changes daily, and overseas sites quietly show you the wrong currency. We built RiftCompareAU to do that legwork for you.

## What you can do here

- **[Browse the card database](/browse)** — every Riftbound card, with the lowest live price across Australian stores.
- **[Compare sealed products](/sealed)** — booster boxes, packs, Proving Grounds and more, priced across shops.
- **[Explore meta decks](/decks)** — real top-finishing tournament lists, with a live "build cost" so you know what it costs to assemble.
- **[Buy & sell on the forum](/forum)** — post want-to-buy / want-to-sell listings and trade directly with other AU collectors.

## How prices work

We pull live prices from public Australian store feeds (and eBay AU) and always request the **Australian price**, so what you see is what you'd actually pay locally. Each card links straight out to the cheapest store so you can buy in a couple of clicks.

We're just getting started — the database, decks and price coverage grow every day. Spotted something off, or want a store added? Use the [contact form](/contact) or the [forum](/forum). Thanks for stopping by, and happy hunting.`,
  },
  {
    slug: "unleashed-meta-snapshot-june-2026",
    category: "blog",
    title: "Riftbound Unleashed Meta Snapshot — June 2026",
    excerpt:
      "The decks defining the Unleashed metagame right now, from the current tournament data — and what each costs to build in Australia.",
    author: "RiftCompareAU",
    date: "2026-06-06",
    readMins: 3,
    tags: ["meta", "decks"],
    body: `The **Unleashed** metagame has settled into a clear top tier. Here's a snapshot of the most-played and best-performing legends right now, based on tournament results aggregated by [riftDecks.com](https://riftdecks.com/legends).

## Tier 1 — the decks to beat

- **Master Yi, Wuju Bladesman** (Body/Calm) — the defining aggro-tempo deck: cheap units backed by combat tricks to close games fast.
- **Irelia, Blade Dancer** (Calm/Chaos) — flexible tempo with a deep spell package that snowballs the board.
- **LeBlanc, Deceiver** (Mind/Order) — go-wide midrange that floods cheap units and converts with value.

## Tier 2 — strong and popular

- **Diana, Scorn of the Moon** (Chaos/Mind) — spell-tempo built around burst finishers like Moonfall.
- **Fiora, Grand Duelist** (Body/Order) — wide, aggressive units that duel down blockers and race.
- **Vex, Gloomist** (Calm/Chaos) — evasive threats plus a deep trick suite to dominate combat.

## See the full lists (and build cost)

Every one of these is a real, legal tournament list on our **[Meta Decks page](/decks)** — card-by-card, split into Legend, Champion, Main Deck, Battlefields, Runes and Sideboard, with a live **build cost** priced across Australian stores so you can see exactly what it takes to assemble.

Decklists are sourced from riftDecks.com and refresh with the metagame — we'll post a new snapshot as the meta shifts.`,
  },
  {
    slug: "how-a-riftbound-deck-is-built",
    category: "guide",
    title: "How a Riftbound Deck Is Built",
    excerpt:
      "Legend, Champion, main deck, runes, battlefields and sideboard — the anatomy of a Riftbound deck, explained with real examples.",
    author: "RiftCompareAU",
    date: "2026-06-06",
    readMins: 4,
    tags: ["beginner", "deckbuilding"],
    body: `New to Riftbound deckbuilding? A constructed deck is made of a few distinct parts. Here's how the current tournament lists are put together.

## The parts of a deck

- **Legend (1)** — your identity card. It sets your deck's direction and which Champion you build around (e.g. *Master Yi, Wuju Bladesman*).
- **Champion (1)** — your signature unit, tied to your legend (e.g. *Master Yi, Tempered*).
- **Main deck (~40 cards)** — your **Units**, **Gear** and **Spells**. This is where most of your strategy lives.
- **Runes (12)** — your resource cards. Their colours must match your deck's **domains**.
- **Battlefields (3)** — the locations you contest during the game.
- **Sideboard (up to 8)** — extra cards you can swap in between games at tournaments.

Add it up and a full tournament list is **64 cards** (56 in the main deck plus the sideboard).

## Domains and runes

Riftbound has seven domains — **Fury, Calm, Mind, Body, Chaos, Order** and **Colorless**. Most competitive decks commit to **one or two** domains (for example *Master Yi* is Body/Calm, while *Irelia* is Calm/Chaos). Your 12 runes are split to match those domains, which is how you reliably cast your cards.

## Building on a budget

A deck's cost is dominated by a handful of chase cards — the commons, runes and battlefields are cheap. On every **[meta deck page](/decks)** we show the build cost broken down card-by-card and priced across Australian stores, so you can see exactly where the money goes and where to save. Want to tweak a list? Open it in the **[Deck Builder](/deck)** to re-price your own version.

This guide is a work in progress — we'll expand it with mulligan and sideboarding tips as the section grows.`,
  },
  {
    slug: "where-to-buy-riftbound-australia",
    category: "guide",
    title: "Where to Buy Riftbound Cards in Australia",
    excerpt:
      "How to find the cheapest Riftbound singles and sealed product in Australia — and how RiftCompareAU does the comparison for you.",
    author: "RiftCompareAU",
    date: "2026-06-06",
    readMins: 3,
    tags: ["buying", "australia"],
    body: `Riftbound is sold by a growing number of Australian game stores, and prices for the same card can vary a lot from shop to shop. Here's how to buy smart.

## Singles vs sealed

- **Singles** are individual cards — the cheapest way to get exactly what your deck needs. Browse them in our **[card database](/browse)**, where each card shows the lowest live AU price and links straight to the store.
- **Sealed** product (booster boxes, packs, Proving Grounds, Nexus Night packs) is better for opening and collecting. Compare it on the **[Sealed Products page](/sealed)**.

## Why our prices are accurate for Australia

Many overseas-hosted stores quietly show prices in the wrong currency depending on where their server thinks you are. We always request the **Australian** price from each store, so the numbers you see are what you'd actually pay locally — no surprise currency conversion at checkout.

## Tips for the cheapest basket

1. **Check the build cost on a deck page.** It already finds the cheapest copy of each card across every store we track.
2. **Watch shipping.** A card that's 20c cheaper isn't a win if it adds postage from a separate store — we show an estimated shipping figure per shop.
3. **Use the [forum](/forum).** Other AU players list cards for sale (often below retail), and you can post a want-to-buy for anything you're chasing.

We currently compare a wide range of Australian stores plus eBay AU, and we add more regularly. If your favourite shop is missing, let us know via [contact](/contact) — this guide will grow as coverage does.`,
  },
];

export function getArticles(category?: ArticleCategory): Article[] {
  const list = category ? ARTICLES.filter((a) => a.category === category) : ARTICLES;
  return [...list].sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function getArticle(slug: string): Article | undefined {
  return ARTICLES.find((a) => a.slug === slug);
}
