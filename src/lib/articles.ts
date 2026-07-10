// File-based content for the Blog and Guides sections. Authored by us (not user
// input), rendered with the lightweight <Markdown> component. To publish a new
// article, add an entry here.

export type ArticleCategory = "blog" | "guide";

// An eBay affiliate search rendered in the article's "Shop this guide" strip
// (ArticleShopStrip). `query` is the eBay search; the strip localises the eBay
// domain to the visitor's market and affiliate-tags the link.
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
  //  - "overnumbered": collector number beyond the set total (e.g. 167/166), plus
  //    SP-numbered specials — the top-end pulls.
  //  - "altart": alternate-art printings (variant letter, e.g. 021a).
  //  - "epic": in-set Epic-rarity base prints — the "hidden chase" tier.
  chaseTier?: "overnumbered" | "altart" | "epic";
  // Rules-text query: cards whose ability text contains this string (optionally
  // scoped to a set) — e.g. "[Empower]" collects every Empower card as reveals land.
  rulesContain?: string;
  rulesSet?: string;
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
  title: string;
  excerpt: string;
  author: string;
  date: string; // ISO (YYYY-MM-DD) — first published
  updated?: string; // ISO (YYYY-MM-DD) — last substantive edit; defaults to `date`
  readMins: number;
  tags: string[];
  body: string; // markdown
  // Optional monetisation: eBay searches relevant to THIS article (rendered as a
  // "Shop this guide" strip under the body). Omit = no strip.
  shop?: ShopLink[];
  // Optional embedded card gallery (real CardTiles → QuickView popup on click).
  embed?: ArticleEmbed;
  // Multiple galleries. Position each inside `body` with a `[[embed:N]]` marker on
  // its own line (N = index into this array); unplaced embeds render after the body.
  embeds?: ArticleEmbed[];
  // Card-image close-ups, positioned in `body` with `[[closeup:N]]` markers.
  closeups?: ArticleCloseUp[];
}

export const ARTICLES: Article[] = [
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

You can get a feel for the cards completely free: play **[Riftle](/riftle)**, our daily card game, print test decks with the **[proxy tool](/proxy)**, and read **[Riftbound for beginners](/guides/riftbound-for-beginners)**. When you're ready to buy, **[compare every store](/browse)** so you start out paying the least.`,
  },
  {
    slug: "buying-singles-vs-opening-packs",
    category: "blog",
    title: "Buying Singles vs Opening Packs: The Smart-Money Guide",
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
    slug: "riftbound-price-movers-how-to-track",
    category: "blog",
    title: "What's Moving in Riftbound This Week — and How to Track It",
    excerpt:
      "Riftbound card prices change every day. Here's how to spot which singles are spiking, which are dropping, and where the best-value buys are — before everyone else does.",
    author: "RiftCompare",
    date: "2026-06-11",
    readMins: 4,
    tags: ["news", "prices", "movers", "investing"],
    body: `Riftbound card prices are never still. A card that defines a winning deck at the weekend can jump 30% by Monday; a reprint or a cooling meta can send another sliding. If you buy and sell singles, knowing **which way prices are moving** is half the battle — and we built a page to show you exactly that.

## Track the movers in one place

Head to the **[Price Movers page](/movers)** to see, for your region, this week's:

- **📈 Biggest risers** — the cards spiking up the most over the last 7 days.
- **📉 Biggest drops** — the singles that have fallen the most, often the best time to buy.
- **💎 Best value right now** — cards trading furthest below their recent high.

Every figure is the live local price in your currency (AUD, NZD, USD or GBP), compared across the stores we track and updated daily. Switch your country at the top of the page to see your market's movers.

## Why prices move

- **The metagame.** When a deck starts winning events, demand for its key cards spikes. Watch the **[meta decks page](/decks)** and you'll often see a card climb right after a strong tournament weekend.
- **Supply.** New set releases, restocks and reprints add supply and usually cool prices; cards that stop being printed drift up.
- **Hype and spoilers.** Anticipation for an upcoming set can move prices on related cards before a single pack is opened.

## How to use this as a buyer

- **Buying to play?** Check the drops and best-value lists first — you'll often find the card you need is cheaper than it was a week ago.
- **Completing a set or chasing a grail?** Set a price alert: tap the heart on any card to get an email when it falls.
- **Always compare delivered cost.** A spiking headline price still varies store to store — open the card to see every shop ranked cheapest-first.

## How to use this as a seller

If you have cards sitting in a binder, the risers list tells you what's worth listing right now. Post them on the **[forum](/forum)** or, if you're a verified seller, in the **[marketplace](/marketplace)** while demand is hot.

Want to dive in? **[See this week's Riftbound price movers](/movers)**, or **[browse the full database](/browse)** and sort by price to find your next pickup.`,
  },
  {
    slug: "riftbound-vendetta-next-set",
    category: "blog",
    title: "Riftbound Vendetta: The Next Set & How to Be Ready",
    excerpt:
      "Vendetta is the next Riftbound: League of Legends TCG set. Here's what a new set release means for prices, and how to be ready to grab cards the moment it drops.",
    author: "RiftCompare",
    date: "2026-06-10",
    readMins: 4,
    tags: ["news", "set", "vendetta", "release"],
    body: `**Vendetta (VEN)** is the next set on the Riftbound: League of Legends TCG release calendar, following Origins, Proving Grounds, Spirit Forged and Unleashed. Its sealed product — booster boxes and packs — is landing now and already listed on RiftCompare; the singles follow the moment cards release. A new set is the single biggest event for card prices, so it pays to be ready.

## Track Vendetta on RiftCompare

We've already set up the **[Vendetta set page](/sets/vendetta)**. The moment cards are released, every VEN single will appear there with live prices compared across stores — so you can find the cheapest copy of any new card from day one, in your local currency.

## What a new set means for prices

- **Launch-day volatility.** Sealed product and the first chase singles tend to spike at release when supply is tight, then settle over the following weeks as stock catches up. If you're not in a rush, waiting often saves money.
- **Meta shake-up.** New cards reshape the **[metagame](/decks)**. Cards that enable a strong new deck can climb fast — keep an eye on the **[price movers](/movers)** in the weeks after release.
- **Ripple effects on older sets.** A new set can raise demand for older cards that combo with it, and cool cards it replaces.

## How to be ready

1. **Wishlist now.** Browse the **[card database](/browse)** and wishlist the cards you already know you want — you'll get an email if a price drops.
2. **Compare sealed early.** VEN booster boxes and packs are listing now — the **[sealed page](/sealed)** ranks them cheapest-first across stores. Boxes move quickly at launch.
3. **Have your deck ready to price.** Drop your planned list into the **[deck builder](/deck)** so you can re-price it the moment the new cards go live.
4. **Don't overpay in the rush.** Launch hype pushes prices up; RiftCompare always shows you the cheapest delivered price so you never pay the first number you see.

Vendetta sealed is live now, and the singles will populate the **[Vendetta page](/sets/vendetta)** as cards release — we'll post a meta snapshot here on the blog as the set lands. In the meantime, **[browse the current sets](/browse)** or read **[where to buy Riftbound cards](/guides/where-to-buy-riftbound-cards)** to get familiar with how it all works.`,
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
    tags: ["selling", "marketplace", "forum", "prices"],
    body: `Got a stack of Riftbound cards gathering dust — duplicates, cards from a deck you've moved on from, or pulls you don't need? Here's how to turn them into cash (or store credit) and get a fair price.

## 1. Price your cards accurately first

Before you list anything, find out what your cards are actually worth **today**. Look each one up on the **[card database](/browse)** to see its live price across every store we track. A few things to get right:

- **The exact printing.** Base, alt-art, Showcase, Signature, Overnumbered and promo versions all trade at very different prices. RiftCompare labels each printing in the card name so you can match yours precisely.
- **Condition.** Near Mint (NM) is the benchmark; lightly to heavily played copies sell for less. Be honest — it builds trust and avoids returns.
- **Which cards are worth listing now.** Check the **[price movers](/movers)** — if one of your cards is spiking this week, that's the one to list first.

## 2. Choose where to sell

- **The RiftCompare forum.** Post a free **want-to-sell** listing on the **[forum](/forum)** — it reaches players actively looking to buy, with no listing fees. Great for singles, bulk and trades.
- **The RiftCompare marketplace.** If you sell regularly, becoming a **[verified seller](/marketplace)** puts your listings right inside the price comparison, in front of buyers at the moment they're choosing where to buy.
- **eBay and local stores.** For high-value chase cards, a wider audience can help — just factor in fees and postage when you compare your net.

## 3. Set a competitive price

The cards that sell fastest are the ones priced at or just under the cheapest comparable listing. Open the card on RiftCompare, see the lowest current price, and pitch yours accordingly:

- **Want a fast sale?** Undercut the cheapest in-stock listing slightly.
- **Not in a hurry?** Price at market and wait — especially if the card is trending up.
- **Selling a whole deck?** Price it as a bundle with the **[deck pricer](/deck)** so buyers can see the value at a glance.

## 4. Ship smart and build a reputation

- Use a rigid mailer and a sleeve + top-loader so cards arrive in the condition you described.
- Post quickly and communicate — repeat buyers come from good experiences.
- Bundle small cards together so postage doesn't eat the value of a cheap sale.

Ready to list? **[Post on the forum](/forum)** or **[browse the database](/browse)** to price your collection first. Selling to fund your next deck? See **[where to buy Riftbound cards](/guides/where-to-buy-riftbound-cards)** to spend it well.`,
  },
  {
    slug: "beginner-mistakes-buying-riftbound-cards",
    category: "blog",
    title: "5 Beginner Mistakes When Buying Riftbound Cards (and How to Avoid Them)",
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

## Mulligan: keep or ship your opening hand

After you draw your opening hand you get one chance to mulligan — shuffle back any number of cards and redraw that many. A good keep usually has:

- **Enough runes to cast your early plays** — a hand with no resources, or all resources and no spells, is a mulligan.
- **Something to do on your first few turns** — a cheap unit or a tempo spell so you're not passing turns.
- **A plan that matches your domains** — if your runes can't cast the expensive cards in hand, ship the dead weight.

Against aggressive decks, keep cheap blockers and removal; against slower decks, you can keep a slightly greedier hand with your stronger mid-game cards.

## Sideboarding between games

At tournaments you play best-of-three, and between games you can swap up to your full sideboard (8 cards) in and out. The idea is to tune your deck to the matchup: bring in extra removal against go-wide decks, more resilient threats against control, or anti-aggro tools when you're on the back foot. Plan your swaps **before** the event — for each common matchup, decide which cards come out and which come in, so you're not guessing at the table.

Want to test these ideas without buying in first? Print a list with the **[proxy sheet tool](/proxy)**, practise your mulligans and sideboard plan, then **[price the final deck](/deck)** and buy the cheapest copies across stores.`,
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
  {
    slug: "riftbound-booster-box-ev-worth-ripping-or-buying-singles",
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

## Using EV as a Decision Tool, Not a Guarantee

The healthiest way to use box EV is as one input alongside your own goals, not as a green light to rip. Ask what you're actually optimizing for: a specific card, a fun opening experience, or the best expected return on money spent. Each of those has a different right answer, and EV only speaks directly to the last one.

A workable routine: check current EV estimates with the [Box EV calculator](/tools/box-ev), compare that against real box prices on the [sealed page](/sealed), and if you're weighing whether to hold cards or sell into current demand, glance at broader price trends on the [RiftCompare Index](/market) before deciding. If EV clears box price by a comfortable margin and you're fine with variance, ripping is defensible. If it doesn't, or if you already know which cards you want, buying singles is usually the smarter money - even if it's the less exciting choice.`,
  },
  {
    slug: "how-to-find-riftbound-arbitrage-opportunities",
    category: "guide",
    title: "Riftbound Card Arbitrage: How to Actually Spot a Real Price Gap",
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

Manually checking five or six retailers for every card you're curious about doesn't scale, which is the entire reason a comparison tool is useful here rather than optional. [RiftCompare's arbitrage finder](/tools/arbitrage) exists to do the tedious part - pulling current listings across sources into one view - so you can spend your time on judgment instead of tab-switching.

### A Practical Workflow

1. Start broad in [the card database](/browse) to identify cards where you already have some conviction about demand - competitively played staples, chase rares, or cards tied to a deck archetype that's gaining traction.
2. Run those cards through the [arbitrage finder](/tools/arbitrage) to see the spread between the lowest and highest current listings side by side.
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

Think of it the way a stock index works. The S&P 500 doesn't tell you what any single company is worth - it tells you whether large-cap US equities broadly went up or down. The Index on [/market](/market) is built the same way for Riftbound singles: a fixed group of cards, tracked every day, combined into one line you can watch over time.

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

## How Daily Snapshots and Rebasing Work

Every card in the basket gets a price snapshot on a regular cadence - effectively a daily "closing price" pulled from tracked listings and completed sales. Those individual snapshots are combined into a single basket value for that day.

That raw basket value, in dollars, isn't very readable on its own - it's just a sum of a bunch of card prices, and the actual dollar figure doesn't mean much by itself. So the Index gets **rebased**: the very first snapshot is set to a round starting value (this is standard practice for any price index, financial or otherwise), and every day after that is expressed relative to that starting point.

The practical effect is that you read the Index as a percentage move from its starting line, not as a dollar amount. If the Index is above its starting value, the basket of tracked cards is worth more in aggregate than when tracking began. If it's below, the basket is worth less. The specific starting number itself is arbitrary - what matters is the trend line it produces.

This is also why the Index is most useful looked at over stretches of time rather than a single day. One day's snapshot can wobble for the same reasons a single card's price can wobble - a slow listing day, a temporary gap in completed sales for a card or two in the basket. The trend across weeks and months is where the signal lives.

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
    title: "Completing a Riftbound Set on a Budget: A Collector's Plan",
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
    slug: "riftbound-vendetta-everything-you-need-to-know",
    category: "blog",
    title: "Riftbound Vendetta: Everything You Need to Know",
    excerpt:
      "Riftbound: Vendetta lands 31 July 2026 with nine new Legends, three new mechanics, new card types and two-player Showdown Decks. Here's the complete rundown — and how to be ready.",
    author: "RiftCompare",
    date: "2026-07-07",
    updated: "2026-07-07",
    readMins: 6,
    tags: ["news", "vendetta", "set", "release", "guide"],
    body: `![Riftbound: Vendetta — releases 31 July 2026](/vendetta-hero.png)

Vendetta is the next Riftbound: League of Legends TCG set, and it's a big one — a rivalries-themed expansion built around clashing champions like **Nasus vs Renekton** and **Shen vs Zed**. Here's everything that's been confirmed, in one place.

## Release date

**Riftbound: Vendetta releases on 31 July 2026**, with in-store **Pre-Rift** launch events kicking off from **24 July**. It's the first Riftbound set to launch simultaneously worldwide in English and Simplified Chinese.

Sealed product — booster boxes and packs — is already listing, and you can compare it cheapest-first on our **[sealed page](/sealed)** right now. The singles will populate the **[Vendetta set page](/sets/vendetta)** with live prices the moment cards release.

## What's in the set

- **160+ cards**, including **50+ Showcase cards** and **nine new Champion Legends**.
- Champions making their Riftbound debut include **Nasus, Renekton, Akali, Mel, Ambessa, Zed and Shen**.
- **Signed Overnumbered variants** for the nine Legends, plus **22 Rival Overnumbers** — diptych cards that celebrate League's greatest rivalries and are designed to be displayed as a pair.

## Three new mechanics

Vendetta introduces **Flow**, **Burn** and **Empower** — three mechanics that add whole new ways to play. We break each one down in **[Vendetta's new mechanics explained](/blog/riftbound-vendetta-new-mechanics-flow-burn-empower)**, but in short:

- **Flow** lets you play cards from your trash instead of your hand.
- **Burn** sends cards from a deck to the trash — to fuel your own synergies, or to attack your opponent's deck directly.
- **Empower** lets a card gain new abilities once it's in play, often after paying a cost.

## New card types

Vendetta also adds two new card concepts — **Unit-Gear** (a card that counts as both a unit and a piece of gear) and **Decrees** (a cycle of rivalry spells). Full detail in **[Vendetta's new card types](/blog/riftbound-vendetta-unit-gear-decrees)**.

## A new way to play: Showdown Decks

Vendetta debuts **Showdown Decks** — Riftbound's first ready-to-play **two-player** product, so two people can open one box and battle straight away. The first pairing is fittingly **Shen versus Zed**.

## New domain pairings

![Vendetta's new domain pairings — Fury + Calm, Mind + Body, and Chaos + Order](/vendetta-domains.png)

Vendetta leans into new two-domain colour pairings for deckbuilding: **Fury + Calm** (red + green), **Mind + Body** (blue + orange) and **Chaos + Order** (purple + yellow) — rival domains forced together. If you're planning a deck, our **[Vendetta deckbuilding guide](/guides/building-for-riftbound-vendetta)** walks through what the new mechanics and pairings point toward.

## How to be ready

1. **Wishlist now.** Browse the **[card database](/browse)** and wishlist what you already want — you'll get an alert if a price drops.
2. **Compare sealed early.** VEN boxes move fast at launch; the **[sealed page](/sealed)** ranks them cheapest-first across stores.
3. **Have your deck ready to price.** Drop a list into the **[deck pricer](/deck)** so you can total it the moment cards go live.
4. **Don't overpay in the rush.** Launch hype pushes prices up — RiftCompare always shows the cheapest delivered price so you never pay the first number you see.

More cards are still being revealed ahead of launch, and we'll keep this updated as they are. In the meantime, track everything on the **[Vendetta set page](/sets/vendetta)**.`,
  },
  {
    slug: "riftbound-vendetta-new-mechanics-flow-burn-empower",
    category: "blog",
    title: "Riftbound Vendetta's New Mechanics Explained: Flow, Burn & Empower",
    excerpt:
      "Vendetta introduces three new Riftbound mechanics — Flow, Burn and Empower. Here's what each one does and how it changes the way you build and play.",
    author: "RiftCompare",
    date: "2026-07-07",
    updated: "2026-07-07",
    readMins: 5,
    tags: ["vendetta", "mechanics", "gameplay", "guide"],
    body: `![Vendetta's three new mechanics — Flow, Burn and Empower](/vendetta-mechanics.png)

Riftbound: Vendetta (out **31 July 2026**) adds three brand-new mechanics — **Flow**, **Burn** and **Empower**. Each opens up a new way to play, and together they push the set toward value, recursion and building-up-over-time strategies. Here's what each one does.

## Flow — play from your trash

**Flow lets you play cards from your trash instead of from your hand.** It draws on the League champions who fuel their kits with Energy — your used and discarded cards become a second resource pool rather than dead weight.

In practice, your trash stops being a graveyard and becomes a toolbox. Cards that get used, discarded or destroyed can come back into play, so Flow decks reward you for cycling through cards quickly and knowing what's waiting to be replayed. **→ Full guide: [Riftbound Flow explained](/guides/riftbound-flow-explained).**

## Burn — send cards to the trash

**Burn sends cards from a Main Deck to the trash.** There are two sides to it:

- **Self-Burn** — some cards burn *your own* deck to fuel synergies. If Flow rewards a full trash, Burn is one of the fastest ways to fill it.
- **Deck attack** — other cards burn your *opponent's* deck directly, chipping away at what they'll draw. It's Riftbound's take on a mill strategy.

Burn and Flow are natural partners: Burn stocks the trash, Flow cashes it in. **→ Full guide: [Riftbound Burn explained](/guides/riftbound-burn-explained).**

## Empower — grow a card after it's down

**Empower gives a card the potential to gain new abilities once it's in play, often after paying a cost.** You can get a unit on the board one turn, then amplify its might or add an effect on a later turn.

That changes sequencing: an Empower card can be a cheap early play *and* a late-game threat, so you're rewarded for planning two turns ahead rather than dumping your hand. **→ Full guide: [Riftbound Empower explained](/guides/riftbound-empower-explained).**

## How they fit together

The three mechanics reward **patience and recursion** over raw tempo. Burn fills the trash, Flow replays from it, and Empower turns early plays into scaling threats. Expect Vendetta decks that grind out long games and get stronger the longer they run.

Want to know what to build with them? Read our **[Vendetta deckbuilding guide](/guides/building-for-riftbound-vendetta)**, see the **[new card types](/blog/riftbound-vendetta-unit-gear-decrees)** that support them, or get the full picture in **[everything you need to know about Vendetta](/blog/riftbound-vendetta-everything-you-need-to-know)**. Prices on every card go live on the **[Vendetta set page](/sets/vendetta)** as it releases.`,
  },
  {
    slug: "riftbound-vendetta-unit-gear-decrees",
    category: "blog",
    title: "Riftbound Vendetta's New Card Types: Unit-Gear and Decrees",
    excerpt:
      "Vendetta adds two new card concepts to Riftbound — Unit-Gear, which is both a unit and a piece of gear, and Decrees, a cycle of rivalry spells. Here's how they work.",
    author: "RiftCompare",
    date: "2026-07-07",
    updated: "2026-07-07",
    readMins: 4,
    tags: ["vendetta", "card types", "gameplay", "unit-gear", "decrees"],
    body: `![Riftbound: Vendetta — releases 31 July 2026](/vendetta-hero.png)

Alongside its new mechanics, Riftbound: Vendetta (out **31 July 2026**) introduces two new card concepts: **Unit-Gear** and **Decrees**. Both are built around the set's rivalry theme, and both change how you think about deck slots.

## Unit-Gear — a card that's both

**A Unit-Gear counts as both a unit and a piece of gear.** That dual identity is the whole point: it can be played and interacted with as either type, so anything that cares about units *or* gear can work with it.

Why it matters for deckbuilding: a card that fills two roles is a flexible slot. Unit-Gear cards let you run fewer dead draws — the same card can be a body on the board or an equipment payoff depending on what the game needs, which is exactly the flexibility that survives a shifting meta.

## Decrees — spells built on rivalry

**Decrees are a cycle of spells designed around Domain rivalries.** Each Domain gets its own Decree, and each one is built to strike hardest against cards of its **opposite colour** — the mechanical expression of Vendetta's whole "rivalries ignite" theme.

In practice, Decrees are targeted answers: if the field is full of a particular Domain, its rival's Decree is a sharp, on-colour way to punish it. Expect them to shape sideboard-style choices and Domain match-ups as the meta forms.

## The bigger picture

Both card types feed Vendetta's rivalry identity — Domains pitted against their opposites, champions against their nemeses. Pair them with the set's new mechanics (**[Flow, Burn and Empower](/blog/riftbound-vendetta-new-mechanics-flow-burn-empower)**) and there's a lot of new deckbuilding space to explore. Our **[Vendetta deckbuilding guide](/guides/building-for-riftbound-vendetta)** digs into what to build, and the **[Vendetta set page](/sets/vendetta)** tracks live prices on every card as it releases.`,
  },
  {
    slug: "building-for-riftbound-vendetta",
    category: "guide",
    title: "Building for Riftbound Vendetta: Decks, Synergies & What to Look Out For",
    excerpt:
      "How Vendetta's new mechanics and domain pairings point toward fresh Riftbound archetypes — plus the champions, chase cards and value to watch as the set rolls out.",
    author: "RiftCompare",
    date: "2026-07-07",
    updated: "2026-07-07",
    readMins: 6,
    tags: ["vendetta", "deckbuilding", "strategy", "synergies", "meta", "guide"],
    body: `![Riftbound: Vendetta — releases 31 July 2026](/vendetta-hero.png)

Riftbound: Vendetta (out **31 July 2026**) is still being spoiled card-by-card, so nobody has a solved metagame yet. But the confirmed mechanics, champions and domain pairings already point clearly toward the kinds of decks that will define the early set. Here's how to think about building for Vendetta — and what to watch as more cards drop.

## Start with the new domain pairings

![Vendetta's new domain pairings — Fury + Calm, Mind + Body, and Chaos + Order](/vendetta-domains.png)

Vendetta is built around **rival domains forced together**:

- **Fury + Calm** (red + green)
- **Mind + Body** (blue + orange)
- **Chaos + Order** (purple + yellow)

Each pairing marries two colours that usually pull in opposite directions, so the deckbuilding challenge — and the fun — is finding the cards that make the tension work. If you're new to how a Riftbound deck comes together, start with **[how a Riftbound deck is built](/guides/how-a-riftbound-deck-is-built)**.

## Let the mechanics suggest the archetypes

The three new mechanics (full breakdown in **[Flow, Burn & Empower explained](/blog/riftbound-vendetta-new-mechanics-flow-burn-empower)**) each hint at a deck style:

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

More cards are still being revealed before the 31 July launch, so treat this as a living guide — we'll add concrete decklists and synergies as the set fully spoils. For the full set overview, read **[everything you need to know about Vendetta](/blog/riftbound-vendetta-everything-you-need-to-know)**, and track live prices on the **[Vendetta set page](/sets/vendetta)** the moment cards go live.`,
  },
  {
    slug: "best-riftbound-vendetta-decks",
    category: "guide",
    title: "Best Riftbound Vendetta Decks: Archetypes, Synergies & How to Build Them",
    excerpt:
      "Three strong deck blueprints for Riftbound Vendetta — Flow Value, Burn and Empower Midrange — with the synergies that make them work, how to build them legally, and how to pilot them. Updated through spoiler season.",
    author: "RiftCompare",
    date: "2026-07-07",
    updated: "2026-07-07",
    readMins: 9,
    tags: ["vendetta", "decks", "deckbuilding", "strategy", "synergies", "meta", "guide"],
    body: `![Three Riftbound Vendetta archetypes to build — Flow Value, Burn, and Empower Midrange](/vendetta-archetypes.png)

Riftbound: Vendetta lands **31 July 2026**, and its preview season is revealing cards through mid-July — so this is the moment to plan the decks you'll build on day one. Below are three strong archetype blueprints, each grounded in Vendetta's confirmed mechanics and domain pairings, with the synergies that make them tick and how to pilot them.

An honest note up front: only the first cards are spoiled so far (like **Jayce, Brilliant Inventor** and **Mel**), so these are **blueprints, not netdecks**. We give you the shell — the roles each deck needs — and we'll drop the exact lists in as cards are revealed. Bookmark it; it updates through spoiler season.

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

## Archetype 1 — Flow Value (Fury + Calm)

**Identity:** grind the game long, recur your best cards, and win on raw card advantage.

**The engine:** the purest expression of **Burn + Flow**. Self-Burn stocks your trash quickly; Flow lets you replay from it, so every card effectively gets used twice. Against aggro you trade and rebuy; against control you never run out of gas.

**The shell (fill exact cards as they spoil):**
- **Legend:** a Fury/Calm Legend with a recursion or trash payoff.
- **4–6 enablers:** cheap cards that Burn your own deck or cycle to fill the trash.
- **3–4 Flow payoffs:** your best units and spells that you *want* to replay from the trash.
- **6–8 interaction:** removal and combat tricks to survive to the long game.
- **Runes:** an even Fury/Calm base — you need both colours online reliably.

**How to play it:** you're the grinder. Trade early, don't over-commit into removal, and treat your trash as a second hand — sequence so the cards you Burn are the ones Flow most wants back.

## Archetype 2 — Burn / Disruption (Chaos + Order)

**Identity:** the aggressive, disruptive take on Burn — attack the opponent's deck as a clock while self-Burn powers your own payoffs.

**The engine:** Chaos/Order leans into the **opponent-facing** side of Burn. You chip their deck directly (Riftbound's take on mill) while using self-Burn to fuel Empower and Flow payoffs. Two-pronged: they're racing your clock *and* your board.

**The shell:**
- **Legend:** a Chaos/Order Legend that rewards Burn or aggression.
- **4–6 Burn pieces:** a mix of opponent-deck Burn and self-Burn fuel.
- **3–4 payoffs:** threats paid off by a full trash or by Empower.
- **6–8 tempo/removal:** to protect your clock.
- **Runes:** Chaos/Order base, tuned toward whichever colour holds your Burn.

**How to play it:** apply pressure on two axes. Don't tunnel on decking them out — the deck-Burn is a clock that forces bad decisions, while your board usually closes the game. Highest skill ceiling of the three, and the easiest to mis-sequence.

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

**How to play it:** curve out, but don't rush your energy. The trap is spending everything early — hold energy to Empower at the right moment so a cheap unit becomes the biggest threat on the board.

## Piloting any of these decks

- **Mulligan for your engine, not your payoff.** A hand with enablers and a way to start the loop beats a hand of finishers you can't fuel yet.
- **Protect the engine.** Once your loop is running the game is yours — bait or answer removal before committing the key piece.
- **Sequence around energy.** Empower and Flow both want energy banked; plan the turn you go over the top.

## What to watch as spoilers drop (6–17 July)

- **Flow Value:** the best cheap self-Burn enabler and the marquee Flow payoff — those two cards define the deck.
- **Burn:** how fast the opponent-Burn clock actually is, and whether it's a real win condition or just disruption.
- **Empower:** more Mind/Body support around Jayce and Mel, and how expensive the strongest Empower effects are.

We'll update this guide with concrete lists as those land — and keep an eye on the **[price movers](/movers)**, since the cards that enable the first strong decks climb fastest at launch.

## Price your list before you buy

The moment you've got a list, drop it into the **[deck pricer](/deck)** to total every card at the cheapest live price across stores, in your currency — the fastest way to build a new-set deck without overpaying in the launch rush. For a brand-new set, **[singles are usually cheaper than sealed](/guides/riftbound-singles-vs-sealed)** for a specific deck.

For the full picture, read **[everything you need to know about Vendetta](/blog/riftbound-vendetta-everything-you-need-to-know)** and the **[new mechanics explained](/blog/riftbound-vendetta-new-mechanics-flow-burn-empower)**, and track live prices on the **[Vendetta set page](/sets/vendetta)** as cards release.`,
  },
  {
    slug: "riftbound-vendetta-countdown-how-long-until-release",
    category: "blog",
    title: "Riftbound Vendetta Countdown: How Long Until Release?",
    excerpt:
      "Riftbound: Vendetta drops 31 July 2026, with Pre-Rift launch events from 24 July. Here's the live countdown, the key dates, and exactly how to be ready on day one.",
    author: "RiftCompare",
    date: "2026-07-08",
    updated: "2026-07-08",
    readMins: 3,
    tags: ["news", "vendetta", "release", "countdown"],
    body: `![Riftbound: Vendetta — releases 31 July 2026](/vendetta-hero.png)

The wait for **Riftbound: Vendetta** is nearly over. The set releases on **31 July 2026**, and in-store **Pre-Rift** launch events begin on **24 July** — so the real buying window opens in days, not weeks.

We built a live, ticking countdown so you always know exactly how long is left:

> **⏳ [See the live Vendetta release countdown →](/vendetta-countdown)**

It counts down to release day in your own timezone, second by second — bookmark it and check back.

## The key dates

- **24 July 2026** — Pre-Rift launch events begin in participating stores. First chance to open packs and play with Vendetta cards.
- **31 July 2026** — Full worldwide retail release. Singles start appearing at stores, and the **[Vendetta set page](/sets/vendetta)** begins filling with live prices.

## Why the countdown matters for buyers

New-set launches follow a predictable price curve: chase cards and format staples spike hardest in the **first week** while supply is thin, then settle as more product hits shelves. Knowing exactly when release lands lets you plan — grab what you need early if you're playing at launch, or wait out the initial spike if you're only collecting.

Either way, RiftCompare shows the **cheapest delivered price across every store** the moment cards go live, so you never pay the first (inflated) number you see.

## How to be ready in three steps

1. **Wishlist now.** Add the cards you already know you want from the **[database](/browse)** — you'll be alerted if a price moves.
2. **Compare sealed early.** VEN boxes sell fast at launch; the **[sealed page](/sealed)** ranks them cheapest-first right now.
3. **Have your deck list ready.** Draft it with our **[Vendetta deckbuilding guide](/guides/building-for-riftbound-vendetta)** and **[best Vendetta decks](/guides/best-riftbound-vendetta-decks)**, then price it in one click with the **[deck pricer](/deck)** on release day.

For the complete rundown of what's in the set, read **[everything you need to know about Vendetta](/blog/riftbound-vendetta-everything-you-need-to-know)**. Then **[watch the countdown](/vendetta-countdown)** — it's almost here.`,
  },
  {
    slug: "should-you-buy-riftbound-origins-before-vendetta",
    category: "blog",
    title: "Should You Buy Origins Before Vendetta Drops?",
    excerpt:
      "A new set changes prices across the whole game. Here's how a Vendetta launch typically moves Origins prices — and whether to buy the singles you want now or wait.",
    author: "RiftCompare",
    date: "2026-07-06",
    updated: "2026-07-06",
    readMins: 4,
    tags: ["buying", "vendetta", "value", "opinion"],
    body: `A new set doesn't just add cards — it moves the price of the cards you already own or want. With **[Vendetta](/sets/vendetta)** landing 31 July, a lot of buyers are asking the same thing: *do I grab my Origins singles now, or wait?* Here's how to think about it.

## What a new set typically does to older singles

There's no single rule, but a few patterns show up again and again when a TCG expansion drops:

- **Attention shifts to the new set.** Demand — and hype-driven prices — concentrate on the newest cards at launch, which can soften prices on the previous set for a while.
- **Format staples hold or climb.** Older cards that stay legal and see play in the new meta don't get cheaper just because a new set exists — sometimes they rise as new decks want them.
- **Reprints reset prices.** If a card from an older set gets reprinted or a functionally similar card appears, the old version can drop. Nothing about this is confirmed for Vendetta — treat it as a risk to watch, not a certainty.

## So: buy now or wait?

**Buy now if** the card is something you'll actually use and you don't want to risk it climbing — playable staples rarely get dramatically cheaper, and waiting can cost you.

**Wait if** you're only collecting, the card isn't urgent, and you'd rather see whether launch-week attention softens Origins prices first.

The honest answer for most people: **buy what you'll play, wait on what you don't need yet.**

## Let the data decide instead of guessing

You don't have to predict any of this — you can watch it:

- **[Price movers](/movers)** shows what's climbing and falling right now, so you can see a trend forming instead of guessing.
- **[Wishlist](/browse)** a card and get alerted when its price actually moves.
- The **[RiftCompare Index](/market)** tracks the whole market's direction day to day.

When you're ready to buy, **[compare every store](/browse)** so you pay the cheapest delivered price — the single biggest saving is almost always *where* you buy, not *when*.

Planning a Vendetta deck that mixes old and new cards? Our **[best Vendetta decks guide](/guides/best-riftbound-vendetta-decks)** shows which Origins and Unleashed cards the new archetypes want — those are the ones worth locking in early.`,
  },
  {
    slug: "riftbound-vendetta-launch-week-buying-checklist",
    category: "blog",
    title: "Riftbound Vendetta Launch-Week Buying Checklist",
    excerpt:
      "Pre-Rift events start 24 July and Vendetta releases 31 July. Use this launch-week checklist so you buy smart, avoid the hype tax, and never overpay in the rush.",
    author: "RiftCompare",
    date: "2026-07-04",
    updated: "2026-07-04",
    readMins: 4,
    tags: ["buying", "vendetta", "release", "guide"],
    body: `Launch week is the most expensive time to buy a new set on impulse — and the best time to buy it *well* if you have a plan. Here's a simple checklist to get through Vendetta's launch (Pre-Rift from **24 July**, release **31 July**) without overpaying.

## Before launch (this week)

- **Decide your goal.** Playing at launch, collecting, or investing? Each points to a different buy. Be honest about which you are.
- **Draft your deck list.** Use the **[Vendetta deckbuilding guide](/guides/building-for-riftbound-vendetta)** and **[best Vendetta decks](/guides/best-riftbound-vendetta-decks)** so you know exactly which cards you need before prices spike.
- **Wishlist your targets.** Add them from the **[database](/browse)** so a price drop pings you automatically.
- **Check sealed now.** If you want boxes, the **[sealed page](/sealed)** already ranks VEN sealed cheapest-first — lock in before launch-week scarcity.

## At launch (24–31 July)

- **Don't buy the first price you see.** Launch-day listings are the highest they'll be. Always **[compare delivered prices across stores](/browse)** first — shipping included.
- **Watch the movers.** The **[price movers](/movers)** page shows what's spiking in real time; the hottest chase cards climb fastest, so decide whether to grab early or wait them out.
- **Price your whole deck at once.** Drop your list into the **[deck pricer](/deck)** — it totals every card at the cheapest live price in your currency, so you buy the whole thing for the least.
- **Switch to your region.** Prices show in AUD, NZD, USD or GBP — make sure you're seeing *your* market's real cost, delivered.

## After the dust settles

- **Re-check in week two.** Once more product hits shelves, non-chase singles usually ease. If a card wasn't urgent, this is often the cheaper moment.
- **Sell into the hype if you're flipping.** If you opened boxes, launch-week demand is when duplicates fetch the most — see **[how to sell Riftbound cards](/blog/how-to-sell-riftbound-cards)**.

## The one rule that always saves money

Wherever you are in that timeline, the biggest lever is *where* you buy, not *when*. The same card can vary a lot between stores once shipping is included — RiftCompare exists to surface the cheapest delivered option every time.

Keep the **[live countdown](/vendetta-countdown)** handy, and read **[everything you need to know about Vendetta](/blog/riftbound-vendetta-everything-you-need-to-know)** so nothing about the set catches you off guard.`,
  },
  {
    slug: "riftbound-empower-explained",
    category: "guide",
    title: "Riftbound Empower Explained: How the Empower Mechanic Works",
    excerpt:
      "A complete guide to Empower — the Riftbound: Vendetta mechanic that lets a card gain new abilities after it's in play. How it works, why it's strong, and how to build around it.",
    author: "RiftCompare",
    date: "2026-07-08",
    updated: "2026-07-10",
    readMins: 5,
    tags: ["vendetta", "mechanics", "empower", "gameplay", "guide"],
    shop: [
      { label: "Jayce singles — the Empower champion", query: "Riftbound Jayce" },
      { label: "Mel singles", query: "Riftbound Mel" },
      { label: "Vendetta booster box presales", query: "Riftbound Vendetta booster box" },
    ],
    // Auto-collects every officially revealed VEN card whose rules text carries
    // [Empower] — real cards, real images, tap → card page. Grows through spoilers.
    embed: {
      title: "Empower cards revealed so far",
      note: "Every officially revealed Vendetta card with the Empower keyword — tap a card for its page and live prices the moment stores list it.",
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

**Empower** is one of three new mechanics arriving with **[Riftbound: Vendetta](/sets/vendetta)** on **31 July 2026**. It's quickly become one of the most searched-for parts of the set — so here's a complete, plain-English guide to what the Empower mechanic does and how to play around it.

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

## Building an Empower deck

Empower leans toward **Mind and Body** styles of play — champions like **Jayce** and **Mel** who want to bank resources and go over the top later. It pairs naturally with the set's other new mechanics: **[Flow](/guides/riftbound-flow-explained)** keeps refuelling your options from the trash, and even **[Burn](/guides/riftbound-burn-explained)** can feed a long game plan. The common thread is **patience and value** over raw early aggression.

A few deckbuilding rules of thumb:

- **Curve for the double-spend.** Leave room in your mana curve to both play *and* Empower in the same few turns.
- **Protect the payoff.** Your Empowered threat is the game — hold up an answer or bait removal before you commit the upgrade.
- **Don't over-Empower.** Sinking every turn into one unit can be greedy; sometimes a second body wins faster.

For a full archetype breakdown, see the **[best Vendetta decks guide](/guides/best-riftbound-vendetta-decks)** and the **[Vendetta deckbuilding guide](/guides/building-for-riftbound-vendetta)**.

## Empower FAQ

**Is Empower only in Vendetta?** It's introduced as a new mechanic in the Vendetta set. Cards from earlier sets can still support an Empower deck, but the keyword itself is new here.

**Is Empower the same as levelling up a champion?** No — Empower is a general mechanic that upgrades a card in play by paying a cost, not a champion-only level system.

**How is Empower different from Flow and Burn?** Empower grows a card *you already control*; **[Flow](/guides/riftbound-flow-explained)** plays cards *from your trash*; **[Burn](/guides/riftbound-burn-explained)** sends cards *to* the trash. Read all three together in **[Vendetta's new mechanics explained](/blog/riftbound-vendetta-new-mechanics-flow-burn-empower)**.

## Get ready for Empower cards

Empower cards will list with live prices on the **[Vendetta set page](/sets/vendetta)** the moment they release — and RiftCompare shows the cheapest delivered price across every store, so you can build your Empower deck for the least. Keep an eye on the **[live countdown](/vendetta-countdown)** — it's almost here.`,
  },
  {
    slug: "riftbound-flow-explained",
    category: "guide",
    title: "Riftbound Flow Explained: Playing Cards From Your Trash",
    excerpt:
      "A complete guide to Flow — the Riftbound: Vendetta mechanic that lets you play cards from your trash instead of your hand. How it works and how to build around it.",
    author: "RiftCompare",
    date: "2026-07-08",
    updated: "2026-07-08",
    readMins: 4,
    tags: ["vendetta", "mechanics", "flow", "gameplay", "guide"],
    shop: [
      { label: "Chaos singles — the recursion domain", query: "Riftbound Chaos" },
      { label: "Vendetta booster box presales", query: "Riftbound Vendetta booster box" },
    ],
    embed: {
      title: "Flow cards revealed so far",
      note: "Every officially revealed Vendetta card with the Flow keyword — tap a card for its page.",
      rulesContain: "[Flow]",
      rulesSet: "VEN",
      take: 12,
    },
    body: `![Vendetta's new mechanics — Flow, Burn and Empower](/vendetta-mechanics.png)

**Flow** is one of three new mechanics in **[Riftbound: Vendetta](/sets/vendetta)** (out **31 July 2026**). It turns your trash from a graveyard into a resource — here's exactly how the Flow mechanic works and how to build around it.

## What is Flow in Riftbound?

**Flow lets you play a card from your trash instead of from your hand.** Cards you've used, discarded or had destroyed aren't gone — with Flow, they become a second pool of plays. It draws on the League champions who fuel their kits with Energy: your spent cards keep on working.

## How the Flow mechanic works

- **Your trash is a second hand.** A card with Flow can be cast straight out of the trash, often for its normal or a modified cost.
- **Fill the trash on purpose.** The more cards in your trash, the more Flow options you have — so effects that discard, cycle or **[Burn](/guides/riftbound-burn-explained)** your own deck actively *help* a Flow deck.
- **Know what's waiting.** Flow rewards players who track what's in the trash and sequence replays for maximum value.

## Building a Flow deck

Flow is the recursion engine of Vendetta. Its best partner is **[Burn](/guides/riftbound-burn-explained)**, which stocks your trash quickly — Burn fills it, Flow cashes it in. Deckbuilding pointers:

- **Enable it.** Include cheap ways to get cards into the trash early so Flow is online when you need it.
- **Grind the long game.** Flow decks win by out-valuing opponents over time, not by racing — plan for longer games.
- **Watch trash hate.** Effects that exile or shuffle away the trash are your weakness; play around them.

See how Flow fits full decklists in the **[best Vendetta decks guide](/guides/best-riftbound-vendetta-decks)**.

## Flow vs the other new mechanics

**[Empower](/guides/riftbound-empower-explained)** upgrades a card in play; **[Burn](/guides/riftbound-burn-explained)** sends cards to the trash; **Flow** plays them back out of it. All three are covered together in **[Vendetta's new mechanics explained](/blog/riftbound-vendetta-new-mechanics-flow-burn-empower)**.

Flow cards will show live prices on the **[Vendetta set page](/sets/vendetta)** as they release — compare every store on RiftCompare so you build your Flow deck for the cheapest total. Track the **[live countdown](/vendetta-countdown)** to release day.`,
  },
  {
    slug: "riftbound-burn-explained",
    category: "guide",
    title: "Riftbound Burn Explained: Mill and Self-Fuel in Vendetta",
    excerpt:
      "A complete guide to Burn — the Riftbound: Vendetta mechanic that sends cards to the trash, both to fuel your own synergies and to attack your opponent's deck.",
    author: "RiftCompare",
    date: "2026-07-08",
    updated: "2026-07-08",
    readMins: 4,
    tags: ["vendetta", "mechanics", "burn", "gameplay", "guide"],
    shop: [
      { label: "Vendetta booster box presales", query: "Riftbound Vendetta booster box" },
      { label: "Riftbound singles on eBay", query: "Riftbound TCG singles" },
    ],
    body: `![Vendetta's new mechanics — Flow, Burn and Empower](/vendetta-mechanics.png)

**Burn** is one of three new mechanics in **[Riftbound: Vendetta](/sets/vendetta)** (out **31 July 2026**). It has two very different uses — here's how the Burn mechanic works and how to build around it.

## What is Burn in Riftbound?

**Burn sends cards from a Main Deck to the trash.** Which deck it targets is what makes it interesting:

- **Self-Burn** — some cards burn *your own* deck. That sounds bad, but it's the fastest way to stock your trash for **[Flow](/guides/riftbound-flow-explained)** and other trash-payoffs.
- **Deck attack (mill)** — other cards burn your *opponent's* deck, chipping away at what they'll draw. It's Riftbound's take on a mill strategy.

## How to build with Burn

Burn is a toolbox mechanic — how you use it depends on your plan:

- **As fuel:** pair self-Burn with **[Flow](/guides/riftbound-flow-explained)**. Burn fills the trash, Flow replays from it — the core value engine of the set.
- **As a clock:** lean into opponent-Burn to win by decking them out. Watch how fast the clock actually is before committing to it as your only win condition — mill needs enough Burn to close the game.
- **Mind the downside:** self-Burn thins your own deck, so make sure you're getting more value back than you lose.

Full decklists that use Burn are in the **[best Vendetta decks guide](/guides/best-riftbound-vendetta-decks)**.

## Burn vs Flow vs Empower

**Burn** sends cards to the trash; **[Flow](/guides/riftbound-flow-explained)** plays them back out; **[Empower](/guides/riftbound-empower-explained)** grows a card already in play. They're designed to combo — read all three in **[Vendetta's new mechanics explained](/blog/riftbound-vendetta-new-mechanics-flow-burn-empower)**.

Burn cards will list with live prices on the **[Vendetta set page](/sets/vendetta)** as they release — RiftCompare compares every store so you pay the cheapest delivered price. Keep the **[live countdown](/vendetta-countdown)** handy.`,
  },
  {
    slug: "riftbound-vendetta-card-list",
    category: "guide",
    title: "Riftbound Vendetta Card List — Everything Confirmed So Far",
    excerpt:
      "A living tracker of what's confirmed for Riftbound: Vendetta — the new champions, card count, mechanics, product line-up and release date — updated as official reveals land ahead of 31 July 2026.",
    author: "RiftCompare",
    date: "2026-07-09",
    updated: "2026-07-09",
    readMins: 4,
    tags: ["vendetta", "card list", "set", "news", "guide"],
    body: `![Riftbound: Vendetta — releases 31 July 2026](/vendetta-hero.png)

Chasing the full **Riftbound: Vendetta** card list? Cards are still being revealed ahead of the **31 July 2026** launch, so this page tracks everything that's officially confirmed — and we update it as new reveals drop. For the full price list, the **[Vendetta set page](/sets/vendetta)** fills with every card the moment singles go live.

## The set at a glance

- **Release:** 31 July 2026 (worldwide). In-store **Pre-Rift** launch events run from **24 July**.
- **Size:** 160+ cards, including 50+ Showcase cards.
- **New champion Legends:** nine, including **Nasus, Renekton, Akali, Mel, Ambessa, Zed and Shen**.
- **Chase cards:** signed Overnumbered variants for the nine Legends, plus **22 Rival Overnumbers** — diptych cards built to be displayed as a pair. Full detail in **[Vendetta Overnumbers explained](/guides/riftbound-vendetta-overnumbers-explained)**.

## New mechanics (confirmed)

Vendetta adds three mechanics — each has its own full guide:

- **[Flow](/guides/riftbound-flow-explained)** — play cards from your trash.
- **[Burn](/guides/riftbound-burn-explained)** — send cards to the trash (to fuel yourself, or attack an opponent's deck).
- **[Empower](/guides/riftbound-empower-explained)** — upgrade a card after it's already in play.

Read all three together in **[Vendetta's new mechanics explained](/blog/riftbound-vendetta-new-mechanics-flow-burn-empower)**.

## New card types & products

- **Unit-Gear** and **Decrees** — two new card concepts. See **[new card types explained](/blog/riftbound-vendetta-unit-gear-decrees)**.
- **Showdown Decks** — Riftbound's first ready-to-play **two-player** product; the debut pairing is **Shen vs Zed**.
- **New domain pairings** for deckbuilding: **Fury + Calm**, **Mind + Body**, and **Chaos + Order**.

## How to track the full list

Card-by-card reveals roll out right up to launch. Rather than reprint an unofficial list that goes stale hourly, we point you to the two places that stay correct:

1. **The [Vendetta set page](/sets/vendetta)** — populates with every card + live prices the moment singles release.
2. **This tracker** — we keep the confirmed set facts above current as official reveals land.

Planning a deck already? Our **[best Vendetta decks guide](/guides/best-riftbound-vendetta-decks)** shows which archetypes the confirmed mechanics point toward, and the **[deckbuilding guide](/guides/building-for-riftbound-vendetta)** covers synergies. And keep the **[live countdown](/vendetta-countdown)** handy — it's almost here.`,
  },
  {
    slug: "riftbound-vendetta-overnumbers-explained",
    category: "guide",
    title: "Riftbound Vendetta Overnumbers & Rival Cards Explained",
    excerpt:
      "What are Overnumbered and Rival Overnumber cards in Riftbound: Vendetta? A guide to the set's premium chase cards — the signed Legend variants and the 22 rivalry diptychs — and why collectors want them.",
    author: "RiftCompare",
    date: "2026-07-09",
    updated: "2026-07-09",
    readMins: 3,
    tags: ["vendetta", "overnumber", "collecting", "chase cards", "guide"],
    shop: [
      { label: "Vendetta presale listings", query: "Riftbound Vendetta presale" },
      { label: "Origins Overnumbered chase cards", query: "Riftbound Overnumbered" },
      { label: "Vendetta booster case presales", query: "Riftbound Vendetta booster case" },
    ],
    body: `![Riftbound: Vendetta — releases 31 July 2026](/vendetta-hero.png)

The most-searched collectibles in **[Riftbound: Vendetta](/sets/vendetta)** are its **Overnumbers** — the set's premium chase cards. Here's what they are and why they matter.

## What is an Overnumbered card?

An **Overnumbered** card is a special printing whose collector number sits *above* the set's base numbering — a signal that it's a rarer, showcase-tier version of a card. In Vendetta, the nine new champion **Legends** each get a **signed Overnumbered variant**: a premium printing carrying an in-universe signature treatment. These are the top-end pulls of the set.

## Rival Overnumbers — the rivalry diptychs

Vendetta's rivalries theme gets its own chase cycle: **22 Rival Overnumbers**. Each is half of a **diptych** — a pair of cards designed to sit side by side, so a rivalry like **Nasus vs Renekton** or **Shen vs Zed** is displayed as a matched set. Collectors chase both halves to complete the pair, which is exactly what makes them desirable (and pricey).

## Why collectors care

- **Scarcity:** Overnumbered and Rival printings appear far less often than base cards, so they command the highest prices in the set.
- **Display value:** the diptych design rewards owning and displaying the pair — a collecting hook base cards don't have.
- **Champion appeal:** the signed Legends are the marquee champions of the set, which concentrates demand.

## Buying them without overpaying

Premium chase cards spike hardest in the launch rush and vary a lot store to store. The moment Vendetta releases, RiftCompare compares every Overnumber's live price across 60+ stores in AU, NZ, the US and the UK — cheapest delivered first — on the **[Vendetta set page](/sets/vendetta)**. Watch the **[price movers](/movers)** too; the chase cards climb fastest at launch.

For the full picture of the set, read **[everything you need to know about Vendetta](/blog/riftbound-vendetta-everything-you-need-to-know)** and the **[Vendetta card list tracker](/guides/riftbound-vendetta-card-list)**. Keep the **[live countdown](/vendetta-countdown)** handy — Vendetta drops 31 July 2026.`,
  },
  {
    slug: "riftbound-vendetta-synergies-with-existing-cards",
    category: "blog",
    title: "Vendetta Synergies: How the New Mechanics Combo With Cards You Already Own",
    excerpt:
      "Flow, Burn and Empower don't arrive in a vacuum — they slot into shells that already exist. A detailed look at how Vendetta's new mechanics combo with current Origins, Unleashed and Spiritforged cards, domain by domain.",
    author: "RiftCompare",
    date: "2026-07-09",
    updated: "2026-07-09",
    readMins: 7,
    tags: ["vendetta", "synergies", "combos", "deckbuilding", "gameplay"],
    shop: [
      { label: "Zhonya's Hourglass & Calm gear", query: "Riftbound Zhonya's Hourglass" },
      { label: "Vendetta booster box presales", query: "Riftbound Vendetta booster box" },
    ],
    body: `![Vendetta's synergy loop — Burn fills the trash, Flow cashes it in](/vendetta-synergy-loop.png)

The most valuable thing to work out before a set drops isn't which new cards are strongest — it's which cards you **already own** suddenly get better. Vendetta's three mechanics (**[Flow](/guides/riftbound-flow-explained)**, **[Burn](/guides/riftbound-burn-explained)**, **[Empower](/guides/riftbound-empower-explained)**) are all engine pieces, and engines need supporting cards. Here's a domain-by-domain look at the synergies, using real cards already in the game.

> **A note on timing:** Vendetta cards are still being revealed, so this is pre-release analysis grounded in the *confirmed* mechanics and *existing* cards — the exact numbers get finalised on the **[Vendetta set page](/sets/vendetta)** at launch. Every card named below is a real card you can look up today.

## The core engine: Burn + Flow (Chaos)

The tightest built-in synergy is **Burn feeding Flow**, and **Chaos** — Riftbound's death-and-recursion domain — already has the pieces. Chaos cards like **Morbid Return**, **Cemetery Attendant** and the **Scrapheap** gear are all built around the trash; they're exactly the kind of cards a Flow/Burn shell wants.

The loop works like this:

1. **Burn** a few cards from your own deck into the trash (cheap self-Burn enablers).
2. **Flow** replays the best of them straight out of the trash.
3. Chaos's existing trash-payoffs (return effects, "cards in trash matter" units) reward you for having a full graveyard the whole time.

If you already run a Chaos recursion deck, Flow is the payoff you've been missing — it turns "cards I used" into a second hand. Watch for the cheapest self-Burn enabler at launch; that single card decides how fast the engine spins. (We track exactly that on the **[price movers](/movers)** page — enabler cards spike first.)

## Empower ramp: Mind + Body (Jayce & Mel)

Vendetta's confirmed **Mind + Body** pairing and its **Empower** mechanic point at the same place: bank resources, then go over the top. **Mind** already has the ramp and card-advantage tools — **Energy Conduit** gear, **Consult the Past**, apprentice-style units like **Eager Apprentice** — and Empower is what you spend that banked energy on.

The synergy is a curve, not a combo: play a cheap Empower unit early, use Mind's ramp to bank energy, then **Empower it into a threat** on a later turn while your opponent has tapped out. Champions like **Jayce** and **Mel** (both arriving in Vendetta) are built to headline exactly this Mind/Body "durdle then explode" plan, and existing Mind ramp is the connective tissue.

## Decrees & the domain war: Chaos + Order

**Decrees** are a cycle of spells built to punish a card's **opposite domain**, and the confirmed **Chaos + Order** pairing is where that rivalry is sharpest. If your local meta is full of one domain, its rival's Decree is a sharp, on-colour answer — which makes Decrees a **sideboard-style lever** more than a combo piece.

Existing removal and tempo spells set the baseline they have to beat: **Order** already has clean answers like **Cull the Weak** and **Hidden Blade**; **Chaos** has disruptive spells like **Rebuke** and **Gust**. Decrees will slot in alongside these as the "hate card" for the match-up, so a deck that already plays a flexible spell base gets the most out of them.

## Unit-Gear: flexibility that rewards gear payoffs

A **Unit-Gear** counts as both a unit and a piece of gear, so it turns on *anything* that already cares about gear. Every domain has gear payoffs today — **Fury's** aggressive equipment (**Iron Ballista**, **Sun Disc**), **Calm's** protective gear (**Zhonya's Hourglass**, **Mask of Foresight**), **Order's** buff pieces (**Forge of the Future**, **Symbol of the Solari**) — and a Unit-Gear is a body *and* a gear trigger in one slot.

The synergy is deckbuilding efficiency: Unit-Gear lets a gear-payoff deck run fewer dead draws, because the same card is a threat when you need a board and an equipment trigger when you need value. If you built a gear-matters deck in Spiritforged or Unleashed, Unit-Gear is a straight upgrade to your curve.

## Rivalry pairings: the champion synergies

Vendetta's whole identity is **rivalries**, and the confirmed champion pairings are synergy prompts in themselves:

- **Nasus vs Renekton** — the sibling rivalry; expect Body/Fury cards that scale (Nasus's classic "grow over time" identity pairs naturally with Empower).
- **Shen vs Zed** — order versus shadow; the debut **Showdown Deck** is built around this exact clash, so it's the ready-made on-ramp to the set's mechanics.

## How to build around this at launch

1. **Audit your trash-matters and gear-matters cards** — those decks get the biggest Vendetta upgrade.
2. **Draft your list now** with the **[Vendetta deckbuilding guide](/guides/building-for-riftbound-vendetta)** and **[best Vendetta decks](/guides/best-riftbound-vendetta-decks)**.
3. **Price the whole deck in one click** with the **[deck pricer](/deck)** on release day, so you buy the new pieces for the least across every store.

Read the mechanics in full — **[Flow](/guides/riftbound-flow-explained)**, **[Burn](/guides/riftbound-burn-explained)**, **[Empower](/guides/riftbound-empower-explained)** — and keep the **[live countdown](/vendetta-countdown)** handy. Vendetta drops **31 July 2026**, and the moment it does we'll compare every card's price across AU, NZ, US &amp; UK on the **[Vendetta set page](/sets/vendetta)**.`,
  },
  {
    slug: "riftbound-vendetta-chase-cards-so-far",
    category: "blog",
    title: "Riftbound Vendetta Chase Cards So Far: What Collectors Should Hunt",
    excerpt:
      "Spoiler season is live — here's every Vendetta chase-card tier confirmed so far (signed Overnumbered Legends, connecting-art Rival Overnumbers, 50+ Showcases), which champions are teased, and how to buy them without paying the hype tax.",
    author: "RiftCompare",
    date: "2026-07-10",
    updated: "2026-07-10",
    readMins: 5,
    tags: ["vendetta", "chase cards", "overnumber", "collecting", "news"],
    shop: [
      { label: "Vendetta presale listings", query: "Riftbound Vendetta presale" },
      { label: "Overnumbered chase cards (current sets)", query: "Riftbound Overnumbered" },
      { label: "Vendetta booster box presales", query: "Riftbound Vendetta booster box" },
    ],
    // Self-populating tier galleries: each [[embed:N]] marker in the body renders
    // the matching gallery of real, imported VEN printings — no card is ever named
    // or shown before it's really in the database, and each tier fills as the
    // official-gallery importer adds reveals.
    embeds: [
      {
        title: "Overnumbered & special chases revealed so far",
        note: "Every card numbered beyond the set (or SP-numbered) currently in our database — tap a card for its page and live prices the moment stores list it.",
        chaseSet: "VEN",
        chaseTier: "overnumbered",
        take: 24,
      },
      {
        title: "Alternate-art chases revealed so far",
        note: "Every alt-art printing currently in our database — the gallery grows as reveals land.",
        chaseSet: "VEN",
        chaseTier: "altart",
        take: 24,
      },
      {
        title: "Epic-rarity picks revealed so far",
        note: "The in-set Epics — history says one or two of these become the sleeper chases of the set.",
        chaseSet: "VEN",
        chaseTier: "epic",
        take: 24,
      },
    ],
    body: `![Riftbound: Vendetta — releases 31 July 2026](/vendetta-hero.png)

Vendetta spoiler season is running right now (reveals through mid-July), and the picture of the set's **chase cards** — the premium pulls that drive box prices — is coming into focus. This post breaks the chase down **tier by tier**, with a live gallery of real revealed cards under each tier: tap any card to open its page and see live prices the moment stores list it.

## Tier 1: Overnumbered chases

The top of the pyramid. An **Overnumbered** card carries a collector number *beyond* the set's total — Vendetta is a 166-card set, so anything numbered **167/166 or higher** is printed at a much lower rate than the set proper. (New to Overnumbers? Read **[our full explainer](/guides/riftbound-vendetta-overnumbers-explained)**.)

What's confirmed so far from the official gallery: champion Overnumbers for **Vi, Jinx, Jayce, Viktor, Rengar, Kha'Zix, Gangplank and Illaoi**, a run of Overnumbered spell and gear reprints (Death Mark-style staples with premium treatments), and **SP-numbered specials** like **Ahri, Inquisitive** that sit outside the main numbering entirely. Riot has also teased the treatment for **Swain, Irelia, Ambessa, Mel, Kennen, Akali and Nasus** via card backs — the gallery below updates automatically as each one is officially revealed and imported.

Two demand notes: **rival pairs with connecting artwork** get priced as a *pair* (the scarcer half sets the completion cost), and **signed Overnumbered Legends** are the likeliest single most expensive pulls of the set.

[[embed:0]]

## Tier 2: Alternate-art chases

The broadest premium pool: **alt-art printings** of the set's champions and key spells, marked with a letter after the collector number (021a, 138a, …). Fourteen are confirmed already — both faces of the Showdown Deck rivalry get one (**Zed, From the Shadows** and **Shen, Leader of the Kinkou Order**), alongside **Akali, Renekton, Nasus, Jayce, Mel, Kennen and Ambessa**.

Alt-arts are where art taste drives price more than playability: historically the champions with the biggest fanbases (and the cleanest full-art treatments) hold value even when the base card sees no play.

[[embed:1]]

## Tier 3: The Epic-rarity sleepers

The tier collectors overlook — and shouldn't. In **Origins** the pattern was set by **Kai'Sa**: an Epic that was both *strong in play* and *genuinely beautiful*, and it out-priced plenty of flashier pulls. The way to spot the Vendetta equivalent: an Epic champion that headlines a real deck **and** looks good enough that players want the exact copy they play with.

The candidates so far: **Akali, Deadly Weapon** and **Zed, From the Shadows** (the aggro headliners), **Shen, Leader of the Kinkou Order** (the Showdown Deck's other face), and **Nasus, Ascended**, **Jayce, Brilliant Inventor**, **Mel, Newly Awakened** and **Ambessa, Respected and Feared** rounding out the champion Epics. If one of these ends up defining the early meta, its base Epic print is the value pick against its alt-art.

[[embed:2]]

## Which chases will be most contested

No prices exist yet (presales aside), so the honest guide is demand structure, not numbers:

1. **Marquee-champion Overnumbers** — Jinx, Vi and Akali have the broadest collector bases from League and Arcane; their signed Overnumbers are the likeliest top of the set.
2. **Completed Rival pairs** — connecting art means the market prices the *pair*, and the scarcer half sets the cost of completion.
3. **Showdown-deck rivals (Zed/Shen)** — the faces of the set's headline product tend to see outsized early demand, in every tier they appear in.
4. **The Kai'Sa-pattern Epic** — whichever Epic champion ends up both meta-defining and pretty. Watch week-one play data, not just pull rates.

## How to buy them without the hype tax

- **Presales**: listings are already up on eBay. Presales can lock a price before launch spikes — but only buy from high-rating sellers and treat quoted prices as speculative until product ships.
- **Day one**: chase singles spike hardest in week one. The moment Vendetta releases, every card's price lands on the **[Vendetta set page](/sets/vendetta)** compared across every store — check it before paying the first number you see.
- **Watch the movers**: the **[price movers](/movers)** page shows which chases are climbing or cooling in real time once data starts flowing.

Track the countdown on the **[live release countdown](/vendetta-countdown)**, see the full **[Vendetta card list tracker](/guides/riftbound-vendetta-card-list)**, and read **[everything you need to know](/blog/riftbound-vendetta-everything-you-need-to-know)** for the rest of the set.`,
  },
];

export function getArticles(category?: ArticleCategory): Article[] {
  const list = category ? ARTICLES.filter((a) => a.category === category) : ARTICLES;
  return [...list].sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function getArticle(slug: string): Article | undefined {
  return ARTICLES.find((a) => a.slug === slug);
}
