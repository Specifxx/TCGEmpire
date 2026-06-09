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
    slug: "where-to-buy-riftbound-cards",
    category: "guide",
    title: "Where to Buy Riftbound Cards (Australia, NZ, US & UK)",
    excerpt:
      "The complete guide to buying Riftbound: League of Legends TCG cards — singles and sealed — in Australia, New Zealand, the United States and the United Kingdom, and how to always find the cheapest price.",
    author: "RiftCompare",
    date: "2026-06-08",
    readMins: 6,
    tags: ["buying", "guide", "stores", "singles", "sealed"],
    body: `Want to buy **Riftbound: League of Legends TCG** cards but not sure where to start? Whether you're chasing a single chase card, completing a deck, or grabbing a sealed booster box, this guide covers exactly **where to buy Riftbound cards** in **Australia, New Zealand, the United States and the United Kingdom** — and how to make sure you never overpay.

The short version: prices for the same card vary a lot between shops and change daily, so the smartest move is to **[compare every store at once on RiftCompare](/browse)** and buy from whichever is cheapest in your country. Here's how to do it region by region.

## How to find the cheapest Riftbound card price

1. **[Search the card database](/browse)** and open the card you want.
2. Each card shows the **lowest live price across every store we track**, sorted cheapest-first, with a one-click link straight to the shop.
3. Use the **country switcher** (top of the page) to set your region — prices then show in your local currency (AUD, NZD, USD or GBP), sourced from local stores, so what you see is what you'll actually pay.

You can also **[price a whole deck at once](/deck)** or **[compare sealed products](/sealed)** like booster boxes and Proving Grounds.

## 🇦🇺 Buying Riftbound cards in Australia

Australia has a healthy spread of Riftbound retailers — dedicated TCG shops, hobby stores and local game stores (LGS) — plus eBay Australia for harder-to-find singles. Because postage and stock differ wildly between shops, the cheapest *delivered* price is rarely the first shop you check.

- **Singles:** [Browse the card database](/browse) with the country set to **Australia** to see the lowest AUD price across Australian stores and eBay AU.
- **Sealed:** booster boxes, packs and Proving Grounds kits are on the **[sealed page](/sealed)**.
- **Tip:** many AU stores offer free shipping over a threshold — buying a few cards from one shop can beat splitting an order across three.

## 🇳🇿 Buying Riftbound cards in New Zealand

New Zealand's Riftbound scene is growing fast, with several Kiwi TCG stores stocking singles in NZD. Buying locally avoids international shipping and currency surprises.

- Set the country switcher to **New Zealand** and **[browse singles](/browse)** to compare live NZD prices across NZ stores.
- For boxes and packs, check the **[sealed products page](/sealed)**.
- **Tip:** NZ stock can be thinner than AU/US for rare cards — wishlist the ones you want so you're ready when they're listed.

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

## Singles vs sealed: which should you buy?

- **Buying specific cards** (to finish a deck or grab a chase card)? Buy **singles** — it's almost always cheaper than ripping packs and chasing the card you need. Start on the **[card database](/browse)**.
- **Want the opening experience, or to invest/collect?** Buy **sealed** — booster boxes and Proving Grounds. Compare box prices on the **[sealed page](/sealed)**.

## Tips for buying Riftbound cards safely

- **Compare delivered cost, not just the sticker price** — shipping can flip which store is cheapest.
- **Check the condition** — Near Mint (NM) is standard; played copies should cost less.
- **Watch for the right printing** — alt-art, Showcase, Signature, Overnumbered and promo versions all trade at different prices, so make sure you're buying the exact one you want.
- **Buy the English print** unless you specifically want another language — non-English copies are cheaper but aren't the same card.

## Ready to buy?

Set your country, **[open the card database](/browse)**, find your card, and click through to the cheapest store. New to Riftbound? Browse our other **[guides](/guides)** or check the current **[meta decks](/decks)** to see what's worth building.`,
  },
  {
    slug: "cheapest-riftbound-booster-boxes",
    category: "guide",
    title: "Cheapest Riftbound Booster Boxes & Sealed (AU, NZ, US & UK)",
    excerpt:
      "How to find the cheapest Riftbound: League of Legends TCG booster boxes and sealed product across Australia, New Zealand, the US and the UK — and whether boxes or singles are better value.",
    author: "RiftCompare",
    date: "2026-06-08",
    readMins: 5,
    tags: ["buying", "guide", "sealed", "booster box"],
    body: `Booster boxes are the most exciting — and most expensive — way to buy into **Riftbound: League of Legends TCG**. But box prices swing a lot between shops and over time, so before you buy, it pays to compare. This guide covers **where to find the cheapest Riftbound booster boxes** and sealed product in **Australia, New Zealand, the United States and the United Kingdom**.

## Compare every sealed price in one place

Head to the **[sealed products page](/sealed)** to see live prices for booster boxes, booster packs, Proving Grounds kits and other sealed Riftbound product across the stores we track — sorted so the cheapest is easy to spot. Set the **country switcher** to your region first so prices show in your local currency (AUD, NZD, USD or GBP).

## By region

- **🇦🇺 Australia:** Riftbound boxes sell out fast at launch — compare AUD prices across Australian stores on the **[sealed page](/sealed)** and watch for restocks.
- **🇳🇿 New Zealand:** fewer stockists than AU, so comparing NZD prices is the easiest way to avoid overpaying.
- **🇺🇸 United States:** the deepest market — the most competitive box pricing is usually here. Compare USD prices and check shipping.
- **🇬🇧 United Kingdom:** UK retailers price sealed in GBP; buying domestically avoids import duty.

## Booster box vs singles: which is better value?

- **If you want specific cards** (to finish a deck or grab a chase card), **[buying singles](/browse) is almost always cheaper** than ripping boxes hoping to pull them.
- **If you want the opening experience, to draft, or to collect/invest**, a sealed box is the way — just buy it at the best price.

## Tips before you buy a box

- **Check the price history feel** — box prices often spike at launch and settle later; if you're not in a rush, waiting can save money.
- **Factor in shipping** — a slightly dearer box with free postage can beat a cheaper one plus delivery.
- **Buy from reputable stockists** — we link straight to each store so you can check their returns and shipping policy.

Ready to buy? **[Compare Riftbound booster box prices now](/sealed)**, or if you only need a few cards, **[search the singles database](/browse)** instead.`,
  },
  {
    slug: "most-valuable-riftbound-cards",
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
- **Check the exact printing** — make sure you're buying the alt-art / signature / promo you actually want, not the base card (or vice versa).

Want to find your grail? **[Browse every Riftbound card](/browse)** and sort by price, or read our **[guide to where to buy Riftbound cards](/guides/where-to-buy-riftbound-cards)** for the best place to buy in your region.`,
  },
  {
    slug: "riftbound-for-beginners",
    category: "guide",
    title: "Riftbound for Beginners: How to Start & What to Buy First",
    excerpt:
      "New to Riftbound: League of Legends TCG? Here's how the game works, how to start playing, and exactly what to buy first without overspending.",
    author: "RiftCompare",
    date: "2026-06-08",
    readMins: 5,
    tags: ["beginners", "guide", "how to start"],
    body: `**Riftbound** is the **League of Legends Trading Card Game** from Riot Games (published in English by UVS Games). If you're brand new, here's how to start playing — and exactly what to buy first without overspending.

## What is Riftbound?

Riftbound is a collectible card game set in the League of Legends universe. You build a deck around a **Legend** (your champion) using cards across the game's domains — **Fury, Calm, Mind, Body, Chaos, Order** and Colorless — and card types like **Units, Spells, Gear, Runes and Battlefields**. Sets so far include **Origins (OGN)**, **Proving Grounds**, **Spirit Forged (SFD)** and **Unleashed (UNL)**.

## The easiest way to start

1. **Grab a ready-to-play product.** A preconstructed deck or a Proving Grounds kit gives you a complete, playable deck out of the box — the cheapest way in. Compare prices on the **[sealed products page](/sealed)**.
2. **Learn the deck**, then upgrade it card-by-card with **[singles](/browse)** — far cheaper than buying booster boxes hoping to pull what you need.
3. **Find the cheapest copies** with RiftCompare — see our **[where to buy Riftbound cards guide](/guides/where-to-buy-riftbound-cards)**.

## What to buy first (on a budget)

- **A preconstructed / Proving Grounds deck** — instant playability.
- **A handful of singles** to upgrade weak spots — look up exact prices on the **[card database](/browse)**.
- **Skip the chase cards at first** — alt-arts and Signatures look great but aren't needed to play well.

## Tips for new players

- **Want to test a deck before buying?** Print proxies with the **[proxy sheet tool](/proxy)**, then buy the real cards once you've settled on a list.
- **Browse the meta** on the **[decks page](/decks)** to see what top players run — and what it costs to build.

Ready to dive in? **[Browse the Riftbound card database](/browse)** or **[compare sealed products](/sealed)** to get started.`,
  },
  {
    slug: "riftbound-singles-vs-sealed",
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
- **Test before you buy** — print a deck with the **[proxy sheet tool](/proxy)**, make sure you like it, then buy the real cards.

## Then find the cheapest cards

Once you've locked a list, **[search the database](/browse)** for each card and buy from whichever store is cheapest — or read our **[where to buy Riftbound cards guide](/guides/where-to-buy-riftbound-cards)** for the best option in your region.

Build smart, compare prices, and you'll have a competitive Riftbound deck without overspending.`,
  },
  {
    slug: "welcome-to-riftcompareau",
    category: "blog",
    title: "Welcome to RiftCompare",
    excerpt:
      "What RiftCompare is, why we built it, and how it helps Australian Riftbound players find the cheapest cards.",
    author: "RiftCompare",
    date: "2026-06-06",
    readMins: 2,
    tags: ["news", "about"],
    body: `RiftCompare is a free price-comparison tool for **Riftbound: League of Legends TCG**, built for Australian players.

Riftbound is exciting, but tracking down the cheapest copy of a card across a dozen different stores is tedious — every shop prices differently, stock changes daily, and overseas sites quietly show you the wrong currency. We built RiftCompare to do that legwork for you.

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
    author: "RiftCompare",
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
    author: "RiftCompare",
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
      "How to find the cheapest Riftbound singles and sealed product in Australia — and how RiftCompare does the comparison for you.",
    author: "RiftCompare",
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
