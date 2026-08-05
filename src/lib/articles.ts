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
// to five of the six markets. Name the PRODUCT, not the action: "Vendetta booster
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
  // Featured image, shown at the top of the article and used as the OG image
  // fallback. Site-relative path into public/ (so the build-time optimiser has a
  // manifest entry for it) plus REQUIRED descriptive alt text.
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

If you have cards sitting in a binder, the risers list tells you what's worth listing right now. List them in the **[marketplace](/marketplace)** while demand is hot.

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
    tags: ["selling", "marketplace", "prices"],
    body: `Got a stack of Riftbound cards gathering dust — duplicates, cards from a deck you've moved on from, or pulls you don't need? Here's how to turn them into cash (or store credit) and get a fair price.

## 1. Price your cards accurately first

Before you list anything, find out what your cards are actually worth **today**. Look each one up on the **[card database](/browse)** to see its live price across every store we track. A few things to get right:

- **The exact printing.** Base, alt-art, Showcase, Signature, Overnumbered and promo versions all trade at very different prices. RiftCompare labels each printing in the card name so you can match yours precisely.
- **Condition.** Near Mint (NM) is the benchmark; lightly to heavily played copies sell for less. Be honest — it builds trust and avoids returns.
- **Which cards are worth listing now.** Check the **[price movers](/movers)** — if one of your cards is spiking this week, that's the one to list first.

## 2. Choose where to sell

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

Ready to list? **[Sell on the marketplace](/marketplace)** or **[browse the database](/browse)** to price your collection first. Selling to fund your next deck? See **[where to buy Riftbound cards](/guides/where-to-buy-riftbound-cards)** to spend it well.`,
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

Set your country, **[open the card database](/browse)**, find your card, and click through to the cheapest store. New to Riftbound? Browse our other **[guides](/guides)** or check the current **[meta decks](/decks)** to see what's worth building.

[[shop]]

## Buying in a specific market?

Deeper dives per region — real store counts, presale links and payment tips: **[Australia](/blog/buy-riftbound-cards-australia)** · **[New Zealand](/blog/buy-riftbound-cards-nz)** · **[United States](/blog/buy-riftbound-cards-us)** · **[United Kingdom](/blog/buy-riftbound-cards-uk)**. Just want the cheapest single right now? **[See where to buy singles](/blog/where-to-buy-riftbound-singles)**.

## Where to buy Riftbound FAQ

**Where is the cheapest place to buy Riftbound cards?** There isn't one shop that's always cheapest — it changes per card and per market, which is why RiftCompare compares every store we track at once and ranks them by total delivered cost rather than sticker price.

**Can I buy Riftbound cards near me?** Local game stores stock sealed product and often singles, and many also sell online. The [stores we track](/stores/tracked) page lists every retailer in the comparison by market, so you can see which of them are local to you.

**Is it cheaper to buy Riftbound singles or sealed product?** For a specific card you've already chosen, singles are almost always cheaper — sealed means paying for many cards you didn't need. Sealed makes sense when you want the experience of opening packs.

**Do Riftbound prices differ between countries?** Yes, and not just by exchange rate. Regional allocation, local stock levels and import costs all matter — see [why Riftbound prices change](/guides/why-riftbound-card-prices-change). RiftCompare prices each market in its own currency from stores that actually ship there.

**Does RiftCompare sell cards directly?** RiftCompare is primarily a price-comparison tool that links you to the retailer, and it also runs its own peer-to-peer [Marketplace](/marketplace) where verified sellers list cards, with payment held until delivery is confirmed.

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
      { q: "Does RiftCompare sell cards directly?", a: "RiftCompare is primarily a price-comparison tool that links you through to the retailer. It also runs its own peer-to-peer Marketplace where verified sellers list cards, with payment held until delivery is confirmed." },
    ],
  },
  {
    slug: "cheapest-riftbound-booster-boxes",
    marketData: "US",
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

**Should I get my Riftbound cards graded?** Grading mainly matters for high-value chase cards in excellent condition, since the fee is fixed regardless of what the card is worth. For ordinary singles it rarely makes sense.

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

- **Browse the meta** on the **[decks page](/decks)** to see what top players run — and what it costs to build.
- **Price it before you buy** — drop a decklist into the **[deck pricer](/deck)** to see the full cost across stores before committing.

Ready to dive in? **[Browse the Riftbound card database](/browse)** or **[compare sealed products](/sealed)** to get started.`,
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
    slug: "welcome-to-riftcompareau",
    category: "blog",
    title: "Welcome to RiftCompare",
    excerpt:
      "What RiftCompare is, why we built it, and everything it now covers — card and sealed prices, decks, tools and games — across AU, NZ, US, UK and Singapore.",
    author: "RiftCompare",
    date: "2026-07-15",
    readMins: 5,
    tags: ["news", "about"],
    body: `RiftCompare is a free price-comparison tool for **Riftbound: League of Legends TCG**. We started as an Australia-only project; today RiftCompare tracks live prices across **Australia, New Zealand, the US, the UK, Singapore and Canada**, and has grown well past a simple price table.

## The problem we built this to solve

Riftbound is exciting, but tracking down the cheapest copy of a specific card across dozens of independent stores is genuinely tedious — every shop prices differently, stock changes daily, overseas sites quietly show you the wrong currency, and postage costs can flip which store is actually cheapest once you account for shipping. RiftCompare does that legwork automatically: search a card once, and see every store's live price side by side, ranked by **total delivered cost** (price plus postage, with free-shipping thresholds factored in), refreshed daily.

## What you can do here

- **[Browse the card database](/browse)** — every Riftbound single, filterable by set, domain, rarity and type, with live prices in your market.
- **[Buy Riftbound singles](/singles)** — the fastest path from "which card do I need" to "who's cheapest right now."
- **[Compare sealed products](/sealed)** — booster boxes, packs, Proving Grounds and more, priced across shops.
- **[Explore meta decks](/decks)** — real top-finishing tournament lists, with a live "build cost" so you know exactly what it costs to assemble each one.
- **[The RiftCompare Index](/market)** and **[price movers](/movers)** — a daily read on the whole Riftbound singles market, and which cards are spiking, cooling, or quietly undervalued.
- **[Deck pricer](/deck)** — paste or build a decklist and price the entire thing across every store in one pass.
- **Tools** — an arbitrage/deal finder and a box-EV calculator.
- **[Riftle](/riftle)** — our free daily Wordle-style "guess the card" game, plus an Unlimited mode.
- **[Buy & sell on the marketplace](/marketplace)** — trade directly with verified sellers.
- **Wishlist, price alerts and portfolio tracking** — for a free account, track the cards you want, get notified on price drops, and value your whole collection.

## How prices work

We pull live prices directly from each store's public product feed (and eBay) in that market's own currency — never converted or estimated — so what you see is what you'd actually pay locally. Prices refresh daily, and every listing links straight out to the store so you can buy in a couple of clicks. Where we don't yet have a local listing for a card, we point you to an eBay search for it rather than leaving the page empty.

## Where we're still growing

Store coverage is deepest in Australia and growing fastest in the US, UK and Singapore — we're actively finding and adding new stores in every market. If a store you use is missing, or something looks wrong, tell us via the [contact form](/contact). Thanks for stopping by, and happy hunting.`,
  },
  {
    slug: "unleashed-meta-snapshot-june-2026",
    category: "blog",
    title: "Riftbound Unleashed Meta Snapshot — June 2026",
    excerpt:
      "The six decks defining the Unleashed metagame — champion, key cards, archetype and what each actually costs to build, priced live across every store we track.",
    author: "RiftCompare",
    date: "2026-07-15",
    readMins: 6,
    tags: ["meta", "decks"],
    body: `The **Unleashed** metagame has settled into a clear top tier. Here's a breakdown of the six most-played and best-performing legends, based on tournament results aggregated by [riftDecks.com](https://riftdecks.com/legends) — what each deck actually does, its key cards, and a link to the full list with a live **build cost** priced across every store we track.

## Tier 1 — the decks to beat

**[Master Yi, Wuju Bladesman](/decks/master-yi-wuju-bladesman)** (Body/Calm) — the defining aggro-tempo deck. It runs Master Yi, Tempered behind a wall of cheap, resilient units (Lonely Poro, Scuttle Crab, First Mate) and closes with Zhonya's Hourglass and Trinity Force turning a single big threat into a game-ending combat trick. It wants to win the early board and never give it back.

**[Irelia, Blade Dancer](/decks/irelia-blade-dancer)** (Calm/Chaos) — flexible tempo built around Irelia, Fervent, backed by Guardian Angel and Boots of Swiftness to keep her attacking through removal. Scuttle Crab and Tideturner give it the same resilient-unit foundation as Yi, but with a deeper trick suite that snowballs the board rather than racing it.

**LeBlanc, Deceiver** (Mind/Order) — midrange that goes wide and converts with value. LeBlanc, Fragmented sets up disruptive plays alongside Soaring Scout, Watchful Sentry and Black Rose Dignitary, with Baited Hook picking off whatever the board state doesn't already answer.

## Tier 2 — strong and popular

**[Diana, Scorn of the Moon](/decks/diana-scorn-of-the-moon)** (Chaos/Mind) — spell-tempo built around Diana, Lunari. It leans on Ravenbloom Student and Tideturner for board presence, with Hwei, Brooding Painter adding a second angle of pressure once the spell package takes over.

**Fiora, Grand Duelist** (Body/Order) — wide, aggressive units (Pit Rookie, First Mate, Spectral Matron) that duel down blockers and race, equipped with B.F. Sword, Shepherd's Heirloom and Baited Hook to keep Fiora, Victorious swinging through anything that tries to trade with her.

**Vex, Gloomist** (Calm/Chaos) — evasive tempo/control. Vex, Apathetic backed by Scuttle Crab, Tideturner and Trevor Snoozebottom, with Boots of Swiftness protecting the pieces that actually close the game once the board is stabilized.

## See the full lists (and build cost)

Every deck above is a real, legal tournament list on our **[Meta Decks page](/decks)** — card-by-card, split into Legend, Champion, Main Deck, Battlefields, Runes and Side Deck, with a live **build cost** priced across every store RiftCompare tracks (not just Australia — the build cost adapts to your own market). Click through to any deck above to see the exact 40+ cards and what assembling it would cost you today.

Decklists are sourced from riftDecks.com and refresh with the metagame — we'll post a new snapshot as the tier list shifts.`,
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

A deck's cost is dominated by a handful of chase cards — the commons, runes and battlefields are cheap. On every **[meta deck page](/decks)** we show the build cost broken down card-by-card and priced across Australian stores, so you can see exactly where the money goes and where to save. Want to tweak a list? Open it in the **[Deck Builder](/deck)** to re-price your own version.

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
      "Riftbound: Vendetta lands 31 July 2026 with nine new Legends, three new mechanics, new card types and two-player Showdown Decks. Every card is now confirmed — here's the complete rundown.",
    author: "RiftCompare",
    date: "2026-07-07",
    updated: "2026-07-31",
    readMins: 6,
    tags: ["news", "vendetta", "set", "release", "guide"],
    body: `![Riftbound: Vendetta — out now](/vendetta-hero.png)

Vendetta is the next Riftbound: League of Legends TCG set, and it's a big one — a rivalries-themed expansion built around clashing champions like **Nasus vs Renekton** and **Shen vs Zed**. Here's everything that's been confirmed, in one place.

## Release date

**Riftbound: Vendetta released on 31 July 2026** and is out now. In-store **Pre-Rift** launch events ran from **24 July**. It's the first Riftbound set to launch simultaneously worldwide in English and Simplified Chinese.

Sealed product — booster boxes and packs — is already listing, and you can compare it cheapest-first on our **[sealed page](/sealed)** right now. The singles will populate the **[Vendetta set page](/sets/vendetta)** with live prices the moment cards release.

## What's in the set

- **166 main-set cards** (all officially confirmed), including **50+ Showcase cards** and **nine new Champion Legends**.
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

**All 166 main-set cards are out.** Vendetta released worldwide on 31 July 2026. Browse every one of them, live, on the **[Vendetta set page](/sets/vendetta)**, or see the **[complete card gallery](/blog/every-riftbound-vendetta-card-revealed)**.`,
  },
  {
    slug: "riftbound-vendetta-new-mechanics-flow-burn-empower",
    category: "blog",
    title: "Riftbound Vendetta's New Mechanics Explained: Flow, Burn & Empower",
    excerpt:
      "Vendetta introduces three new Riftbound mechanics — Flow, Burn and Empower. Here's what each one does and how it changes the way you build and play.",
    author: "RiftCompare",
    date: "2026-07-07",
    updated: "2026-07-17",
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

**Empower gives a card the potential to gain new abilities once it's in play, often after paying a cost.** You can get a unit on the board one turn, then amplify its might or add an effect on a later turn. Under the hood, Empower sets a persistent **Empowered** status on the card — it sticks around until the card leaves play or something **Disempowers** it (the exact reverse, stripping the status). Riot's Core Rules confirm Disempower is its own action, so expect some Vendetta cards to attack an opponent's Empowered threat directly instead of just racing it.

That changes sequencing: an Empower card can be a cheap early play *and* a late-game threat, so you're rewarded for planning two turns ahead rather than dumping your hand. **→ Full guide: [Riftbound Empower explained](/guides/riftbound-empower-explained).**

## How they fit together

The three mechanics reward **patience and recursion** over raw tempo. Burn fills the trash, Flow replays from it, and Empower turns early plays into scaling threats. Expect Vendetta decks that grind out long games and get stronger the longer they run.

Vendetta's Core Rules also add a smaller, one-off action worth knowing: **Skip**, a replacement effect that erases a named part of a turn entirely — no triggers, no procedures, it just doesn't happen. So far it's on a single card rather than a full mechanic, but it's a genuinely new category of effect for the game.

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
    body: `![Riftbound: Vendetta — out now](/vendetta-hero.png)

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

The whole set is out and trading, so this is genuinely the moment to start assembling a shell. The first Vendetta events have now been played and we'll add concrete decklists as the field settles. For three ready-to-build archetype blueprints with the shell for each, see **[Best Riftbound Vendetta Decks](/guides/best-riftbound-vendetta-decks)**. For the full set overview, read **[everything you need to know about Vendetta](/blog/riftbound-vendetta-everything-you-need-to-know)**, and track live prices on the **[Vendetta set page](/sets/vendetta)** as they land.`,
  },
  {
    slug: "best-riftbound-vendetta-decks",
    category: "guide",
    title: "Best Riftbound Vendetta Decks: Archetypes, Synergies & How to Build Them",
    excerpt:
      "Three full 40-card Riftbound Vendetta decks — Flow Value, Burn and Empower Midrange — with example decklists, 10-card side decks, real card visuals, and how to start buying into each one now that Vendetta singles are trading.",
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

For the full picture, read **[everything you need to know about Vendetta](/blog/riftbound-vendetta-everything-you-need-to-know)** and the **[new mechanics explained](/blog/riftbound-vendetta-new-mechanics-flow-burn-empower)**, and track live prices on the **[Vendetta set page](/sets/vendetta)** as cards release.`,
  },
  {
    slug: "riftbound-vendetta-countdown-how-long-until-release",
    category: "blog",
    title: "Riftbound Vendetta Release Date — Out Now (31 July 2026)",
    excerpt:
      "Riftbound: Vendetta drops 31 July 2026, with Pre-Rift launch events from 24 July. Here are the key dates, what's in the set, and where to buy it now that it's out.",
    author: "RiftCompare",
    date: "2026-07-08",
    updated: "2026-07-31",
    readMins: 3,
    tags: ["news", "vendetta", "release", "release date"],
    body: `![Riftbound: Vendetta — out now](/vendetta-hero.png)

**Riftbound: Vendetta is out.** The set released worldwide on **31 July 2026**, with in-store **Pre-Rift** launch events from **24 July** — so singles were already changing hands a week before the official street date.

> **🔥 [See every Vendetta card with live prices →](/sets/vendetta)**

Every card in the set is priced across every store we track, ranked by what you'd actually pay delivered. And if you're already looking past this set: **[Radiance (Set 5) lands 23 October 2026](/radiance-countdown)**.

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

For the complete rundown of what's in the set, read **[everything you need to know about Vendetta](/blog/riftbound-vendetta-everything-you-need-to-know)**. Then browse **[every Vendetta card with live prices](/sets/vendetta)**.`,
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
    updated: "2026-07-31",
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
- **Sell into the hype if you're selling.** If you opened boxes, launch-week demand is when duplicates fetch the most — see **[how to sell Riftbound cards](/blog/how-to-sell-riftbound-cards)**.

## The one rule that always saves money

Wherever you are in that timeline, the biggest lever is *where* you buy, not *when*. The same card can vary a lot between stores once shipping is included — RiftCompare exists to surface the cheapest delivered option every time.

Vendetta is out now — browse **[every card with live prices](/sets/vendetta)**, and read **[everything you need to know about Vendetta](/blog/riftbound-vendetta-everything-you-need-to-know)** so nothing about the set catches you off guard.`,
  },
  {
    slug: "riftbound-banlist-explained",
    category: "guide",
    title: "Riftbound Ban List Explained: Every Currently Banned Card",
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
    title: "Riftbound's July 2026 Ban List: Stealthy Pursuer, Two Battlefields Banned — Plus a New 2v2 Ban List",
    excerpt:
      "Riot just announced Riftbound's second ban wave: Stealthy Pursuer (over an infinite Recruit combo), The Arena's Greatest and Aspirant's Climb, effective 24 July — and a brand-new Constructed 2v2 ban list starting with Master Yi, Wuju Bladesman.",
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
  {
    slug: "riftbound-t1-worlds-champion-collection",
    category: "blog",
    title: "Riftbound × T1: The 2025 Worlds Champion Collection Explained",
    excerpt:
      "Riot's first-ever single-team Riftbound collaboration: a serialised, player-signed Signature Edition and a playable Player Bundle honouring T1's sixth World Championship. Here's what's in each, and the five champions T1 themselves picked.",
    author: "RiftCompare",
    date: "2026-07-17",
    readMins: 4,
    tags: ["news", "collectibles", "esports"],
    shop: [
      { label: "Riftbound singles on eBay", query: "Riftbound TCG singles" },
    ],
    // Ambessa (VEN, unreleased — no prices yet) plus the three already-released base
    // printings T1 picked. Seraphine, Not Alone isn't catalogued on RiftCompare yet
    // (not yet imported/revealed as a standalone printing), so it's named in the
    // text but has no embed — never a broken link.
    embed: {
      title: "The 5 champions T1 picked (base printings)",
      note: "The regular, buyable printing of each card T1 selected — not the limited Signature/Player Bundle art, which isn't sold through stores.",
      slugs: [
        "ambessa-the-wolf-ven-084",
        "galio-indefatigable-unl-171-219",
        "miss-fortune-buccaneer-ogn-193-298",
        "xin-zhao-vigilant-sfd-176-221",
      ],
    },
    body: `Riot just did something it's never done in Riftbound before: partner with a single esports team, rather than the league as a whole, on a dedicated card collection. The **Riftbound × T1 2025 Worlds Champion Collection** honours T1's sixth World Championship title — and third straight — with signed, serialised cards picked by the players themselves.

## Two products, two very different audiences

**T1 2025 Worlds Champion Signature Edition** — the premium collector's version. Riot is capping production hard: only **10,125 copies per language** (English, Chinese, Korean), each including one card serial-numbered from 1 to 2025 (marking the championship year) with a gold-stamped signature from the corresponding player. The five cards also get a new foiling effect made specifically for this collection.

**T1 2025 Worlds Champion Player Bundle** — the accessible version, for people who actually want to play with these cards. Same five champions with different (non-serialised, non-signed) art, plus a Sleeves Pack, Deckbox, Binder, and a Metal Die — 1 in every 10 dies is a special black-and-gold variant.

## The 5 cards — each hand-picked by a player

Every card was personally chosen by the corresponding member of T1's championship roster:

- **Choi "Doran" Hyeon-jun** → Ambessa, The Wolf
- **Lee "Faker" Sang-hyeok** → Galio, Indefatigable
- **Lee "Gumayusi" Min-hyeong** → Miss Fortune, Buccaneer
- **Ryu "Keria" Min-seok** → Seraphine, Not Alone
- **Moon "Oner" Hyeon-joon** → Xin Zhao, Vigilant

[[embed:0]]

Seraphine, Not Alone isn't in our card database yet — it hasn't been officially catalogued as a standalone printing outside this reveal, so we can't show a price for it yet. We'll add it the moment it's tracked.

## How to actually get one

Both products are distributed through a **drawing on the Riot Merch Store**, not a normal storefront sale — you enter, you don't just add to cart. The Signature Edition's drawing opens in **August 2026**; the Player Bundle follows later in the year, with more details still to come.

## Should you expect these on RiftCompare?

Not directly — the Signature Edition and Player Bundle art are exclusive to this collection and distributed by drawing, so they won't show up as a normal store listing we can price-compare (any secondary-market copies that surface later on eBay would, like any other collectible). What *is* already trackable right now is the regular base printing of each of the four cataloged champions above — worth a look if the collection has you wanting the "normal" version of Faker's or Doran's pick while you wait on the drawing.

*Product details (print run, contents, availability) are from Riot's own announcement and reporting on it — see the collection's own page on [Riftbound's official site](https://playriftbound.com) for the latest.*`,
  },
  {
    slug: "jayce-mel-riftbound-empower-explained",
    category: "guide",
    title: "Jayce & Mel in Riftbound: Vendetta's New Champion Printings",
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

Bookmark this page — it updates as new Jayce or Mel printings land in the database, with live prices across every store we track. For the full picture of Vendetta's new mechanics, see **[Flow, Burn and Empower explained](/blog/riftbound-vendetta-new-mechanics-flow-burn-empower)**, and see **[every Vendetta card with live prices](/sets/vendetta)**.`,
  },
  {
    slug: "riftbound-empower-explained",
    ebayPicks: { heading: "Vendetta singles on eBay right now" },
    category: "guide",
    title: "Riftbound Empower Explained: How the Empower Mechanic Works",
    excerpt:
      "A complete guide to Empower — the Riftbound: Vendetta mechanic that lets a card gain new abilities after it's in play. How it works, why it's strong, and how to build around it.",
    author: "RiftCompare",
    date: "2026-07-08",
    updated: "2026-07-31",
    readMins: 5,
    tags: ["vendetta", "mechanics", "empower", "disempower", "gameplay", "guide"],
    faq: [
      { q: "What is Empower in Riftbound?", a: "Empower gives a card the potential to gain new abilities once it's already in play, usually by paying an extra cost on a later turn — a cheap play now, a bigger payoff later." },
      { q: "Is Empower permanent?", a: "Yes. Empowered is a status that sticks to a card indefinitely — it lasts until the card leaves the board, or until something Disempowers it." },
      { q: "What is Disempower?", a: "The reverse of Empower — an instruction or cost on some cards that strips the Empowered status from a card. You can't Disempower a card that isn't currently Empowered." },
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

**Is Empower only in Vendetta?** It's introduced as a new mechanic in the Vendetta set. Cards from earlier sets can still support an Empower deck, but the keyword itself is new here.

**Is Empower the same as levelling up a champion?** No — Empower is a general mechanic that upgrades a card in play by paying a cost, not a champion-only level system.

**How is Empower different from Flow and Burn?** Empower grows a card *you already control*; **[Flow](/guides/riftbound-flow-explained)** plays cards *from your trash*; **[Burn](/guides/riftbound-burn-explained)** sends cards *to* the trash. Read all three together in **[Vendetta's new mechanics explained](/blog/riftbound-vendetta-new-mechanics-flow-burn-empower)**.

**What is Disempower?** It's the reverse of Empower — an instruction or cost on some cards that strips the Empowered status from a card, turning off whatever effect its Empowered ability was granting. You can't Disempower something that isn't currently Empowered.

**What is Empower in Riftbound?** Empower gives a card the potential to gain new abilities once it's already in play, usually by paying an extra cost on a later turn — a cheap play now, a bigger payoff later.

**Is Empower permanent?** Yes. Empowered is a status that sticks to a card indefinitely — it lasts until the card leaves the board, or until something Disempowers it.

## Get ready for Empower cards

Empower cards are live with real prices on the **[Vendetta set page](/sets/vendetta)** — and RiftCompare shows the cheapest delivered price across every store, so you can build your Empower deck for the least. Want to see the whole set at a glance? Browse the **[Vendetta card gallery](/sets/vendetta/gallery)** — all 166 cards on one page with images and prices.`,
  },
  {
    slug: "riftbound-flow-explained",
    category: "guide",
    title: "Riftbound Flow Explained: How the Flow Mechanic Works",
    excerpt:
      "A complete guide to Flow — the Riftbound: Vendetta mechanic that lets you play cards from your trash instead of your hand. How it works and how to build around it.",
    author: "RiftCompare",
    date: "2026-07-08",
    updated: "2026-07-31",
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

## Flow FAQ

**What is Flow in Riftbound?** Flow is a Vendetta keyword that lets you play a card straight from your trash instead of your hand — your discarded and used cards become a second pool of plays rather than being gone for good.

**How does the Flow mechanic work?** A card printed with Flow can be cast from the trash the same way you'd cast it from hand (often for its normal cost) — so anything that fills your trash first (discarding, cycling, or the **[Burn](/guides/riftbound-burn-explained)** mechanic) sets Flow up to cash in later.

**Is Flow only in Vendetta?** Yes — Flow is introduced as a brand-new keyword in the Vendetta set; it doesn't appear on cards from earlier sets.

**How is Flow different from Empower and Burn?** **Flow** plays cards *from* your trash; **[Burn](/guides/riftbound-burn-explained)** sends cards *to* your trash; **[Empower](/guides/riftbound-empower-explained)** upgrades a card that's already *in play*. Read all three together in **[Vendetta's new mechanics explained](/blog/riftbound-vendetta-new-mechanics-flow-burn-empower)**.

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

**Burn** sends cards to the trash; **[Flow](/guides/riftbound-flow-explained)** plays them back out; **[Empower](/guides/riftbound-empower-explained)** grows a card already in play. They're designed to combo — read all three in **[Vendetta's new mechanics explained](/blog/riftbound-vendetta-new-mechanics-flow-burn-empower)**.

## Burn FAQ

**What is Burn in Riftbound?** Burn sends cards from a Main Deck to the trash — either your own (self-Burn, to fuel Flow and other trash-payoffs) or your opponent's (a mill-style deck attack).

**Is Burn the same as mill?** Deck-attack Burn (burning an opponent's deck) is Riftbound's version of a mill strategy. Self-Burn is a different use of the same keyword — filling your own trash on purpose.

**Is Burn only in Vendetta?** Yes — Burn is introduced as a new keyword in the Vendetta set.

**How is Burn different from Flow and Empower?** Burn sends cards to the trash; **[Flow](/guides/riftbound-flow-explained)** plays them back out of the trash; **[Empower](/guides/riftbound-empower-explained)** grows a card that's already in play. The three are designed to combo.

Burn cards are live with real prices on the **[Vendetta set page](/sets/vendetta)** — RiftCompare compares every store so you pay the cheapest delivered price. Browse the whole set visually in the **[Vendetta card gallery](/sets/vendetta/gallery)**.`,
  },
  {
    slug: "riftbound-vendetta-card-list",
    category: "guide",
    title: "Riftbound Vendetta Card List — All 166 Cards Confirmed",
    excerpt:
      "The complete, confirmed Riftbound: Vendetta card list — every one of the 166 main-set cards, the new champions, mechanics and product line-up, ahead of the 31 July 2026 release.",
    author: "RiftCompare",
    date: "2026-07-09",
    updated: "2026-07-31",
    readMins: 4,
    tags: ["vendetta", "card list", "set", "news", "guide"],
    body: `![Riftbound: Vendetta — out now](/vendetta-hero.png)

Chasing the full **Riftbound: Vendetta** card list? **Riftbound: Vendetta is out.** It released worldwide on **31 July 2026**, and all 166 main-set cards are live with real prices. This page rounds up everything confirmed about the set; for the actual card-by-card list with images, see the **[complete card gallery](/blog/every-riftbound-vendetta-card-revealed)**, and the **[Vendetta set page](/sets/vendetta)** fills in live prices the moment singles go on sale.

## The set at a glance

- **Release:** 31 July 2026 (worldwide). In-store **Pre-Rift** launch events run from **24 July**.
- **Size:** 166 main-set cards, plus 50+ Showcase alternate-art printings, Overnumbered chase cards, runes and promos.
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

## Where to see the full list

- **[The complete card gallery](/sets/vendetta/gallery)** — every one of the 166 cards, with images and live prices, filterable by domain, rarity and type.
- **The [Vendetta set page](/sets/vendetta)** — the same full list, plus live prices from every store we track.

Planning a deck already? Our **[best Vendetta decks guide](/guides/best-riftbound-vendetta-decks)** shows which archetypes the confirmed mechanics point toward, and the **[deckbuilding guide](/guides/building-for-riftbound-vendetta)** covers synergies. And browse **[every Vendetta card with live prices](/sets/vendetta)**.

## Vendetta card list FAQ

**How many cards are in Riftbound: Vendetta?** The main set is 166 cards, plus Showcase alternate-art printings, Overnumbered chase cards, runes and promos on top of that base numbering.

**When was Riftbound: Vendetta released?** 31 July 2026 worldwide, with in-store Pre-Rift launch events running from 24 July 2026.

**How many Legends are in Vendetta?** Nine, including Nasus, Renekton, Akali, Mel, Ambessa, Zed and Shen.

**What new mechanics does Vendetta add?** Three: [Flow](/guides/riftbound-flow-explained) (play cards from your trash), [Burn](/guides/riftbound-burn-explained) (send cards to the trash) and [Empower](/guides/riftbound-empower-explained) (upgrade a card already in play).

**Where can I see every Vendetta card with prices?** The [Vendetta set page](/sets/vendetta) shows the full list with live prices from every store we track, in your own market's currency.`,
    faq: [
      { q: "How many cards are in Riftbound: Vendetta?", a: "The main set is 166 cards, plus Showcase alternate-art printings, Overnumbered chase cards, runes and promos on top of that base numbering." },
      { q: "When was Riftbound: Vendetta released?", a: "31 July 2026 worldwide, with in-store Pre-Rift launch events running from 24 July 2026." },
      { q: "How many Legends are in Vendetta?", a: "Nine, including Nasus, Renekton, Akali, Mel, Ambessa, Zed and Shen." },
      { q: "What new mechanics does Vendetta add?", a: "Three: Flow (play cards from your trash), Burn (send cards to the trash, your own or an opponent's) and Empower (upgrade a card that's already in play by paying an extra cost later)." },
      { q: "Where can I see every Vendetta card with prices?", a: "The Vendetta set page on RiftCompare shows the full card list with live prices from every store it tracks, in your own market's currency." },
    ],
  },
  {
    slug: "riftbound-vendetta-overnumbers-explained",
    category: "guide",
    title: "Riftbound Vendetta Overnumbers & Rival Cards Explained",
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

- **[Akali, Rogue Assassin](/card/rogue-assassin-ven-189)**
- **[Renekton, Butcher of the Sands](/card/butcher-of-the-sands-ven-190)**
- **[Zed, Master of Shadows](/card/master-of-shadows-ven-191)**
- **[Nasus, Curator of the Sands](/card/curator-of-the-sands-ven-192)**
- **[Shen, Eye of Twilight](/card/eye-of-twilight-ven-193)**
- **[Jayce, Defender of Tomorrow](/card/defender-of-tomorrow-ven-194)**
- **[Mel, Soul's Reflection](/card/soul-s-reflection-ven-195)**
- **[Ambessa, Matriarch of War](/card/matriarch-of-war-ven-196)**
- **[Kennen, Heart of the Tempest](/card/heart-of-the-tempest-ven-197)**

## Rival Overnumbers — the rivalry diptychs

Vendetta's rivalries theme gets its own chase cycle: **22 Rival Overnumbers** — reprints of existing champion cards with a premium treatment. Each is half of a **diptych**, a pair designed to sit side by side, so a rivalry like **[Nasus](/card/nasus-guardian-of-knowledge-ven-178) vs [Renekton](/card/renekton-brute-ven-177)** or **[Shen](/card/shen-scourge-of-shadows-ven-170) vs [Zed](/card/zed-from-the-shadows-ven-169)** is displayed as a matched set. Collectors chase both halves to complete the pair, which is exactly what makes them desirable (and pricey).

[[embed:0]]

## Why collectors care

- **Scarcity:** Overnumbered and Rival printings appear far less often than base cards, so they command the highest prices in the set.
- **Display value:** the diptych design rewards owning and displaying the pair — a collecting hook base cards don't have.
- **Champion appeal:** the signed Legends are the marquee champions of the set, which concentrates demand.

## Buying them without overpaying

Premium chase cards spike hardest in the launch rush and vary a lot store to store. The moment Vendetta releases, RiftCompare compares every Overnumber's live price across 60+ stores in AU, NZ, the US and the UK — cheapest delivered first — on the **[Vendetta set page](/sets/vendetta)**. Watch the **[price movers](/movers)** too; the chase cards climb fastest at launch.

For the full picture of the set, read **[everything you need to know about Vendetta](/blog/riftbound-vendetta-everything-you-need-to-know)** and the **[Vendetta card list tracker](/guides/riftbound-vendetta-card-list)**. Vendetta released on 31 July 2026 — browse **[every card with live prices](/sets/vendetta)**.`,
  },
  {
    slug: "riftbound-vendetta-synergies-with-existing-cards",
    category: "blog",
    title: "Vendetta Synergies: How the New Mechanics Combo With Cards You Already Own",
    excerpt:
      "Flow, Burn and Empower don't arrive in a vacuum — they slot into shells that already exist. A detailed look at how Vendetta's new mechanics combo with current Origins, Unleashed and Spiritforged cards, domain by domain.",
    author: "RiftCompare",
    date: "2026-07-09",
    updated: "2026-07-31",
    readMins: 7,
    tags: ["vendetta", "synergies", "combos", "deckbuilding", "gameplay"],
    shop: [
      { label: "Zhonya's Hourglass & Calm gear", query: "Riftbound Zhonya's Hourglass" },
      { label: "Vendetta booster boxes", query: "Riftbound Vendetta booster box" },
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

Read the mechanics in full — **[Flow](/guides/riftbound-flow-explained)**, **[Burn](/guides/riftbound-burn-explained)**, **[Empower](/guides/riftbound-empower-explained)** — and browse **[every Vendetta card with live prices](/sets/vendetta)**. Vendetta drops **31 July 2026**, and the moment it does we'll compare every card's price across AU, NZ, US &amp; UK on the **[Vendetta set page](/sets/vendetta)**.`,
  },
  {
    slug: "riftbound-vendetta-chase-cards-so-far",
    ebayPicks: { heading: "These chase cards on eBay right now" },
    category: "blog",
    title: "Riftbound Vendetta Chase Cards — Every Tier, With Live Prices",
    excerpt:
      "Vendetta is out. Here's every chase-card tier in the set — signed Signature Legends, connecting-art Rival Overnumbers, Showcases, alt-arts and the Epic sleepers — each with a live gallery and real prices compared across every store.",
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

See the full **[Vendetta card list](/guides/riftbound-vendetta-card-list)**, browse **[every card with live prices](/sets/vendetta)**, or read **[everything you need to know about the set](/blog/riftbound-vendetta-everything-you-need-to-know)**.`,
  },
  {
    slug: "riftbound-price-comparison-singapore",
    marketData: "SG",
    category: "blog",
    title: "Riftbound Card Prices Singapore — Compare 11 SG Stores",
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
    title: "Riftbound Card Prices Australia — Compare 19 AU Stores",
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
    slug: "buy-riftbound-cards-nz",
    marketData: "NZ",
    category: "blog",
    title: "Riftbound Card Prices NZ — Compare 10 NZ Stores",
    excerpt:
      "Compare Riftbound card prices across New Zealand stores — live NZD prices at 10 NZ retailers, ranked by total delivered cost. Free, updated daily.",
    author: "RiftCompare",
    date: "2026-07-29",
    updated: "2026-07-29",
    readMins: 4,
    tags: ["new zealand", "buying guide", "price comparison", "riftbound singles", "nzd"],
    shop: [
      { label: "Riftbound singles on eBay", query: "Riftbound singles" },
      { label: "Vendetta booster boxes", query: "Riftbound Vendetta booster box" },
    ],
    body: `Looking to **buy Riftbound cards in New Zealand** without overpaying? NZ has a smaller Riftbound scene than Australia, which makes price comparison matter even more — fewer stockists means less natural price competition, so the gap between the cheapest and most expensive NZ store for the same card is often bigger, not smaller.

## Why New Zealanders use RiftCompare

- **Every NZ store in one search.** We track live NZD prices at Card Masters, TCG Collector NZ, Card Merchant NZ, Iron Knight Gaming, Calico Keep, Card Bot NZ, Gaming DNA, Bea Games, Shuffle n Cut Games and Game Roost ([full list](/stores/tracked)).
- **eBay Australia ships to NZ.** New Zealand has no eBay marketplace of its own, so wherever a card's NZ store price runs high, we also surface eBay AU listings as a real alternative — converted and ranked alongside the local stores, not hidden in a separate tab.
- **Ranked by what you actually pay.** Every comparison ranks stores by **total delivered cost** — price plus postage, with free-shipping thresholds factored in automatically.
- **Prices refresh daily** — [price history charts](/movers) on every card show whether you're buying a spike or a dip.
- **Whole-deck pricing.** The [deck pricer](/deck) takes a full 40-card list and works out the cheapest way to buy it across every store, consolidating orders to dodge multiple postage charges.
- **100% free.** No account needed to compare.

## How to find the cheapest Riftbound card prices in NZ

1. **[Search the database](/browse)** — every card shows its lowest live NZD price.
2. **Open the card** for the full store-by-store table, in-stock and ranked by delivered cost, including eBay AU.
3. **Click through and buy** — we link straight to the exact listing at the store.

## Vendetta is coming — July 31

**[Riftbound: Vendetta](/sets/vendetta)** releases 31 July 2026, and week-one prices always move fast. Every revealed card is already browsable, the [chase cards are mapped tier by tier](/blog/riftbound-vendetta-chase-cards-so-far), and launch-day prices land here compared across every store above. Set a [price watch](/browse) and we'll tell you when a card's price moves.

Run an NZ store selling Riftbound? **[Get listed free](/stores/suggest)** — more visibility, more customers. Everyone else: start at the **[card database](/browse)** and pay less for your next pickup.

Buying from overseas, or curious about other markets? See **[Australia](/blog/buy-riftbound-cards-australia)**, **[the US](/blog/buy-riftbound-cards-us)**, **[the UK](/blog/buy-riftbound-cards-uk)**, or the **[full multi-market guide](/guides/where-to-buy-riftbound-cards)**.`,
  },
  {
    slug: "buy-riftbound-cards-us",
    marketData: "US",
    category: "blog",
    title: "Riftbound Card Prices USA — Stores, TCGplayer & eBay",
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

Shopping from **[Australia](/blog/buy-riftbound-cards-australia)**, **[New Zealand](/blog/buy-riftbound-cards-nz)** or **[the UK](/blog/buy-riftbound-cards-uk)**? We've got a dedicated breakdown for your market too — or see the **[full multi-market guide](/guides/where-to-buy-riftbound-cards)**.`,
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

Shopping from **[Australia](/blog/buy-riftbound-cards-australia)**, **[New Zealand](/blog/buy-riftbound-cards-nz)** or **[the US](/blog/buy-riftbound-cards-us)**? We've got a dedicated breakdown for your market too — or see the **[full multi-market guide](/guides/where-to-buy-riftbound-cards)**.`,
  },
  {
    slug: "buy-riftbound-cards-canada",
    marketData: "CA",
    category: "blog",
    title: "Riftbound Card Prices Canada — Compare 20 Canadian Stores",
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

Shopping from [Australia](/blog/buy-riftbound-cards-australia), [the US](/blog/buy-riftbound-cards-us), [New Zealand](/blog/buy-riftbound-cards-nz), [the UK](/blog/buy-riftbound-cards-uk) or [Singapore](/blog/riftbound-price-comparison-singapore)? We've got a dedicated breakdown for those markets too — or see the [full multi-market guide](/guides/where-to-buy-riftbound-cards).`,
  },
  {
    slug: "every-riftbound-vendetta-card-revealed",
    ebayPicks: { heading: "Vendetta chase cards on eBay right now" },
    category: "blog",
    title: "Every Riftbound Vendetta Card Revealed — All 166 Confirmed",
    excerpt:
      "The complete Riftbound Vendetta card list and gallery — all 166 main-set cards officially confirmed, plus Showcase alt-arts, Overnumbers, runes and promos, embedded live from our database. Tap any card for its page and launch-day prices.",
    author: "RiftCompare",
    date: "2026-07-10",
    updated: "2026-07-31",
    readMins: 3,
    tags: ["vendetta", "spoilers", "card gallery", "card list", "news"],
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
    body: `This is the **complete Riftbound Vendetta card list and gallery** — all 166 main-set cards, officially confirmed, embedded live from our database in collector-number order. Vendetta is out — this is the complete base set, released 31 July 2026.

**Vendetta releases 31 July 2026.** The set runs **166 main-set cards** plus alternate-art Showcase printings, Overnumbered chase cards (numbered beyond 166), SP-numbered specials, runes and tokens. The mechanics are new too — read up on **[Empower](/guides/riftbound-empower-explained)**, **[Flow](/guides/riftbound-flow-explained)** and **[Burn](/guides/riftbound-burn-explained)** while you browse.

Tap any card below to open its full page: rules text, printings, price history, and live store prices the moment Vendetta singles go on sale — compared across every store we track in Australia, New Zealand, the US, the UK, Singapore and Canada.

[[embed:0]]

## Keep going

- **[Chase cards, tier by tier](/blog/riftbound-vendetta-chase-cards-so-far)** — Overnumbers, alt-arts and the sleeper Epics worth hunting.
- **[Vendetta card gallery](/sets/vendetta/gallery)** — every card on one page, filterable, with live prices.
- **[Vendetta set page](/sets/vendetta)** — the full sortable card list with live prices at release.
- **[Radiance release date](/radiance-countdown)** — Set 5 lands 23 October 2026.
- **[Everything you need to know about Vendetta](/blog/riftbound-vendetta-everything-you-need-to-know)** — products, mechanics, rivalries and release details in one read.`,
  },
  {
    slug: "where-to-buy-riftbound-singles",
    category: "blog",
    title: "Where to Buy Riftbound Singles — The Cheapest Place to Buy Single Cards",
    excerpt:
      "The complete guide to buying Riftbound: League of Legends TCG singles: what singles are, singles vs packs, how to find the cheapest price for any card across stores in AU, NZ, US, UK, Singapore & Canada, and how to buy safely. Free, updated daily.",
    author: "RiftCompare",
    date: "2026-07-14",
    updated: "2026-07-14",
    readMins: 5,
    tags: ["singles", "buying guide", "price comparison", "riftbound", "how to buy"],
    shop: [
      { label: "Riftbound singles on eBay", query: "Riftbound singles" },
      { label: "Vendetta singles", query: "Riftbound Vendetta" },
    ],
    body: `Want to **buy Riftbound singles** — the exact cards your deck needs, without opening pack after pack? This is the complete guide: what singles are, why they beat packs for deckbuilding, and — most importantly — **how to find the cheapest price for any Riftbound single**, compared across every store at once.

> **The short version:** search any card on the **[RiftCompare singles hub](/singles)**, see every store's live price ranked by what you'd actually pay delivered, and buy from the cheapest. It's free, covers Australia, New Zealand, the US, the UK, Singapore and Canada, and updates daily.

## What are Riftbound singles?

A "single" is one individual card from the **Riftbound: League of Legends TCG**, sold on its own instead of sealed inside a booster pack or box. Champions, spells, gear, runes, alt-arts, chase cards — any of them can be bought as a single from a store or marketplace that has pulled and listed it.

Singles are how nearly every competitive TCG player actually builds decks. Packs are for the fun of opening (and for gambling on chase pulls); singles are for getting the specific three copies of a card your list calls for, reliably and usually far cheaper than chasing them through packs.

## Singles vs. packs: which is cheaper?

For **a specific card you want**, singles win almost every time. Opening packs to find one card means buying — and paying for — dozens of cards you didn't need, plus the odds are against you. A single is a known price for the exact card.

Packs and sealed product still make sense when you want the **experience** of opening, or you're speculating on a whole set's chase cards at launch. For everything else — completing a deck, grabbing a missing playset, picking up a chase card you've decided on — buy the single. Our **[sealed vs singles breakdown](/sealed)** shows the sealed side if you want to compare.

## How to find the cheapest Riftbound single

The same card is often priced very differently between stores once postage is counted — a card that's $2 at one shop with $4 tracked shipping isn't cheaper than a $4 card with free post. RiftCompare solves exactly this:

1. **[Search the card database](/browse)** (or the **[singles hub](/singles)**) — every single shows its lowest live price in your market instantly.
2. **Open the card** for the full store-by-store table, in stock and ranked by **total delivered cost** (price + postage, with free-shipping thresholds factored in automatically).
3. **Click straight through** to the exact listing at the cheapest store and buy.

Buying a whole deck? The **[deck pricer](/deck)** takes your full 40-card list and works out the cheapest way to buy all of it across every store at once — consolidating orders so you don't pay postage five times.

## Where you can buy Riftbound singles

RiftCompare compares live singles prices across a wide range of local stores plus eBay, in five markets. The full, current list is on the **[stores we track](/stores/tracked)** page. Region-by-region buying guides:

- **[Buy Riftbound singles in the US](/blog/buy-riftbound-cards-us)** — TCGplayer, eBay and 19 independents compared.
- **[Buy Riftbound singles in Australia](/blog/buy-riftbound-cards-australia)** — 19 AU stores, ranked by delivered cost.
- **[Buy Riftbound singles in New Zealand](/blog/buy-riftbound-cards-nz)** — 10 NZ stores plus eBay AU (which ships to NZ).
- **[Buy Riftbound singles in the UK](/blog/buy-riftbound-cards-uk)** — 14 UK stores plus eBay UK.
- **[Buy Riftbound singles in Singapore](/blog/riftbound-price-comparison-singapore)** — local SGD prices across Singapore stores.

## Buying singles safely

- **Check the total, not the sticker.** Always compare delivered cost — RiftCompare does this for you, but confirm postage at checkout.
- **Buy near-mint unless you're playing casually.** Store listings note condition; the comparison ranks by the condition shown.
- **On eBay, prefer high-rating sellers** and check whether a listing is for a card in hand rather than a pre-order.
- **Prices move.** Our **[price movers](/movers)** page shows which singles are climbing or cooling, so you can buy before a spike.

## Start here

Browse **[every Riftbound single](/singles)**, jump to a set — **[Origins](/sets/origins)**, **[Spirit Forged](/sets/spiritforged)**, **[Unleashed](/sets/unleashed)** or the new **[Vendetta](/sets/vendetta)** — or go straight to the **[cheapest cards right now](/browse?priced=1&sort=price_asc)**. Every price is compared across every store, updated daily, and completely free.

Want the store-by-store breakdown for your market? See **[Australia](/blog/buy-riftbound-cards-australia)**, **[New Zealand](/blog/buy-riftbound-cards-nz)**, **[the US](/blog/buy-riftbound-cards-us)**, **[the UK](/blog/buy-riftbound-cards-uk)**, or the **[general buying guide](/guides/where-to-buy-riftbound-cards)**.`,
  },
  {
    slug: "how-to-buy-on-riftcompare-marketplace",
    category: "guide",
    title: "How to Buy Riftbound Cards on the RiftCompare Marketplace",
    excerpt:
      "A step-by-step guide to buying Riftbound singles directly from other players on the RiftCompare Marketplace — finding a listing, checking out, and what happens to your money until the card actually arrives.",
    author: "RiftCompare",
    date: "2026-07-20",
    readMins: 6,
    tags: ["marketplace", "buying", "guide", "escrow", "p2p"],
    browseCta: {
      href: "/marketplace",
      label: "Browse the Marketplace →",
      blurb: "See live listings from verified sellers in your market, ready to buy right now.",
    },
    body: `RiftCompare has always compared prices across stores — now you can also buy **directly from other players** through the **[RiftCompare Marketplace](/marketplace)**, a built-in P2P marketplace with buyer protection baked in. Here's exactly how it works, start to finish.

## 1. Find a listing

Marketplace listings show up two places:

- **[The marketplace grid](/marketplace)** — browse every active listing in your market, filter by card, and see each seller's shop, condition and price.
- **Right inside the price comparison.** If a seller's price beats every store for a card, it appears as a normal row on that card's page, tagged **"RiftCompare Marketplace."** You don't have to go looking for it separately — it's just another price to compare.

Every listing shows the card's **condition** (Near Mint through Damaged), whether it's **foil**, the **seller's shop name and rating**, and a price in your local currency. Listings only show sellers shipping within your own market — no cross-border shipping surprises.

## 2. Check out

Add what you want to your cart and check out through **Stripe** — the same secure checkout used for card payments everywhere else. You'll see the item price, an estimated shipping cost, and the total before you confirm.

Your payment does **not** go straight to the seller. It's held by RiftCompare until the order is actually delivered — that's the whole point of buying through the marketplace instead of a direct message or a forum trade.

## 3. What happens after you pay

- The seller gets notified immediately and has **14 days to ship** your order and add tracking. If they don't, you're **automatically refunded in full** — no back-and-forth required.
- Once they mark it shipped, you'll get an email with the carrier and tracking number, plus an estimated delivery window.
- Your money stays held the whole time your order is in transit.

## 4. Confirm delivery (or let it auto-release)

When your card arrives, open **[My orders](/marketplace/orders)** and tap **"Got it"** to confirm delivery — this instantly releases the seller's payout and closes out the order.

Forget to confirm? No problem — funds **auto-release 14 days after the order ships** either way, so a seller never gets stuck waiting on you to click a button. You can also message the seller directly from the order if you want to check in before then.

## 5. Message the seller

Every order has a built-in chat thread with the seller — ask about shipping, condition, anything. No need to hunt down a Discord or trade forum to sort out a question about your order.

## 6. If something goes wrong

Tap **"Report a problem"** on the order. This pauses the scheduled release immediately and puts a real person on it — not an automated dispute bot. Common cases:

- **Never shipped in time** → automatic full refund, no report needed.
- **Item not as described / damaged / never arrived** → report it and we'll sort out a refund.
- **Just have a question first?** Message the seller before it becomes a problem — most things are a shipping delay, not a scam.

## Why this is different from a normal trade

Buying from a random seller in a Discord server or Facebook group means sending money and hoping. On the RiftCompare Marketplace, your payment is never released until you have the card in hand (or the deadline passes with no dispute) — the platform is the thing standing between "I paid" and "I got scammed," not your judgment of a stranger's profile picture.

The marketplace is new, so if anything looks off, there's a "Found a bug? Report it" link on every marketplace page that comes straight to us.

## Ready to buy?

**[Browse the marketplace](/marketplace)** to see what's listed right now, or check a specific card's page — marketplace listings show up right alongside every store price. Have cards to sell instead? **[Open a shop](/marketplace/sell)** — it's free to list.`,
  },
  {
    slug: "riftcompare-marketplace-buyer-protection-explained",
    category: "blog",
    title: "Is the RiftCompare Marketplace Safe? Buyer Protection, Escrow & Refunds Explained",
    excerpt:
      "How the RiftCompare Marketplace actually protects your money when buying Riftbound cards from another player — escrow, auto-refunds, ship deadlines and what happens if a trade goes wrong.",
    author: "RiftCompare",
    date: "2026-07-20",
    readMins: 5,
    tags: ["marketplace", "safety", "escrow", "buyer-protection", "trust"],
    browseCta: {
      href: "/marketplace/buyer-protection",
      label: "Read the full buyer protection policy →",
      blurb: "The exact rules — ship deadlines, release dates and how disputes are handled.",
    },
    body: `Buying a card from a stranger online is always a little nerve-wracking — you're trusting someone you've never met to actually ship what they said they'd ship. The RiftCompare Marketplace is built specifically to remove that risk. Here's exactly how, with no marketing fluff.

## Your money doesn't go to the seller — not yet

When you pay for a marketplace order, the money is held by RiftCompare, not sent to the seller. It only gets released once one of two things happens:

1. **You confirm delivery** — you tap "Got it" once the card arrives, and the seller is paid out right then.
2. **14 days pass after the order ships** with no dispute — funds auto-release automatically, so a seller isn't left waiting forever on a buyer who forgot to click a button.

Either way, a seller only ever gets paid *after* the card is genuinely on its way to you and the delivery window has had a chance to play out.

## What if the seller just doesn't ship?

Every seller has **14 days from payment** to mark an order shipped and add tracking. Miss that window, and the order **automatically cancels and refunds you in full** — you don't have to notice, complain, or file anything. It just happens.

## What if the card isn't what was listed, or never turns up?

Tap **"Report a problem"** on the order (found in **[My orders](/marketplace/orders)**). This immediately pauses the scheduled fund release — the seller doesn't get paid while your report is open — and puts it in front of our team to sort out, whether that's a refund or getting the seller to make it right.

This is different from most peer-to-peer trading (Discord, Facebook groups, trade forums), where once you've sent payment there's no mechanism to get it back if the other person ghosts.

## Who are these sellers, anyway?

Anyone selling on the marketplace needs a **verified email account** and has to explicitly agree to the marketplace seller terms before their shop goes live. Every seller has a public shop page with **ratings and reviews from past buyers** — check it before buying from someone new, the same way you'd check feedback on any other platform.

## Can I talk to the seller before worrying?

Yes — every order has built-in messaging with the seller. If tracking looks stalled or you have a question about condition, message them first. Most "is this a scam?" moments turn out to be a normal shipping delay once you actually ask.

## The short version

| Question | Answer |
| --- | --- |
| Where does my payment go when I pay? | Held by RiftCompare, not the seller |
| When does the seller get paid? | After you confirm delivery, or 14 days after shipping, whichever comes first |
| Seller doesn't ship in time? | Automatic full refund, no action needed from you |
| Item's wrong / damaged / never arrives? | Report it — release pauses instantly, a real person handles it |
| Can I message the seller? | Yes, directly on the order |

Full details, including the exact policy language, are on the **[buyer protection page](/marketplace/buyer-protection)**.

## Ready to buy?

**[Browse the marketplace](/marketplace)** and buy with your payment protected the whole way through. New here? Start with **[how to buy on the marketplace](/guides/how-to-buy-on-riftcompare-marketplace)**.`,
  },
  {
    slug: "marketplace-vs-stores-where-to-buy-riftbound",
    category: "blog",
    title: "Marketplace vs Stores: Where Should You Buy Riftbound Cards?",
    excerpt:
      "RiftCompare shows you store prices AND player-to-player marketplace listings side by side. Here's when to buy from a store and when the marketplace is the better (or cheaper) call.",
    author: "RiftCompare",
    date: "2026-07-20",
    readMins: 5,
    tags: ["marketplace", "buying", "stores", "comparison", "guide"],
    body: `RiftCompare has always compared prices across dozens of stores. Now it also has a **[player-to-player marketplace](/marketplace)** built in — so which one should you actually buy from? Short answer: you don't have to choose, because we show you both at once. Here's how to think about it.

## They're not competitors — they're the same comparison

Marketplace listings don't live in a separate corner of the site. When a seller's marketplace price beats every store for a card, it shows up as **just another row** in that card's normal price comparison, tagged "RiftCompare Marketplace." You're already comparing both every time you search a card — you just might not have noticed.

## When a store is the better call

- **You want it today, or close to it.** Most stores have same-day or next-day dispatch and established shipping times. Marketplace sellers get 14 days to ship, which is usually faster but isn't guaranteed like a store's stated dispatch time.
- **You're buying sealed product.** Booster boxes, Proving Grounds and packs are store territory — the marketplace is singles-only.
- **You want the absolute path of least resistance.** Stores are businesses; there's no seller to coordinate with, no delivery confirmation step. Pay, wait, done.

## When the marketplace is the better call

- **The price is genuinely better.** Individual sellers don't carry store overhead, so marketplace listings frequently undercut retail — that's *why* they show up as the top price on a card page in the first place.
- **You're after a specific condition or printing** a store doesn't have in stock. Marketplace sellers list exactly what's in their binder, including played copies at played-copy prices, alt-arts, and printings that sell out at retail in minutes.
- **You want to actually talk to the seller.** Built-in messaging means you can ask "is this really Near Mint?" before you buy, something you can't do with a store listing.

## The trust question, answered honestly

The one real hesitation buying from a store vs. a marketplace seller is trust — a store is a business with a track record; a marketplace seller is a person. That's exactly why the marketplace holds your payment in **escrow** until delivery is confirmed (or auto-releases 14 days after shipping), and auto-refunds you in full if a seller doesn't ship within 14 days. You get the pricing upside of buying peer-to-peer without giving up the safety net of buying from a store. Full breakdown: **[how buyer protection works](/blog/riftcompare-marketplace-buyer-protection-explained)**.

## The practical answer

Just search the card. Whatever's cheapest — store or marketplace listing — shows up first, in your currency, with shipping factored in. You don't need to decide in advance; **[the card database](/browse)** decides for you every time.

## Ready to buy?

**[Search any card](/browse)** to see stores and marketplace listings compared side by side, or go straight to the **[marketplace grid](/marketplace)** to browse player listings. First time buying from a seller? Start with **[how to buy on the marketplace](/guides/how-to-buy-on-riftcompare-marketplace)**.`,
  },
  {
    slug: "riftcompare-marketplace-fee-cut-2-percent",
    category: "blog",
    title: "RiftCompare Marketplace Fees Just Dropped to 2% (1% for Premium)",
    excerpt:
      "We've cut the RiftCompare Marketplace seller fee from 5% to 2% — and Premium members now sell for just 1%. Here's what changed, why, and how it stacks up against Cardmarket.",
    author: "RiftCompare",
    date: "2026-07-22",
    readMins: 4,
    tags: ["marketplace", "fees", "selling", "premium", "announcement"],
    browseCta: {
      href: "/marketplace/sell",
      label: "Open your seller dashboard →",
      blurb: "List a card and see exactly what you'll receive before you confirm.",
    },
    body: `Starting today, selling on the **[RiftCompare Marketplace](/marketplace)** costs less — a lot less. The platform fee is down from 5% to **2%**, and if you're a **[Premium](/premium)** member it's just **1%**. No tiers to unlock, no minimum sales volume to hit first — the rate applies automatically, from your very next sale.

## What actually changed

- **Standard sellers**: 5% → **2%** on every completed sale.
- **Premium sellers**: **1%** — half the standard rate, on top of everything else Premium already includes (Value Finder, Rising Cards, the full Deal Finder list, Best Basket, and an ad-free site).
- **Evaluated per sale, not per listing.** The rate that applies is whatever your account status is *at the moment a sale completes* — upgrade to Premium today, and your very next sale is charged at 1%, even on a listing you posted weeks ago.
- **Nothing else changes.** Same escrow protection, same 14-day ship deadline, same buyer-side experience. This is purely a fee cut.

## Why we did this

RiftCompare's marketplace exists to make it easier — and cheaper — for players to buy and sell directly with each other. A lower fee means more of every sale actually lands in the seller's pocket, which matters most while the marketplace is still building up its base of real listings from real players.

It's also just a better deal than the alternatives. Cardmarket, the biggest general TCG marketplace, charges sellers a tiered commission — 5% for a standard "Private" seller, dropping to 3% or 1.5% only once you qualify for its Professional/Powerseller tiers — plus a Trustee Service fee (0.5–1%) and a 3% currency-conversion charge on cross-border sales, landing around 6–8% all-in for most casual sellers. RiftCompare's 2% (or 1% with Premium) beats that from the first sale, with no tiers to climb and no currency-conversion surprise.

## What you actually take home

Say you sell a card for $20:

| | Fee | You receive |
|---|---|---|
| Standard | 2% ($0.40) | **$19.60** |
| Premium | 1% ($0.20) | **$19.80** |

Your seller dashboard and Seller Funds page always show the exact numbers before you list and after you sell — no need to do this math yourself.

## Selling for the first time?

Any signed-in, email-verified user can list a card in a couple of minutes from the **[seller dashboard](/marketplace/sell)**. Payouts go through Stripe Connect once you've completed a quick identity check, and buyer payments are held in escrow until delivery is confirmed — full details in **[how buyer protection works](/blog/riftcompare-marketplace-buyer-protection-explained)**.

Already selling? The new rate applies automatically — nothing to change, nothing to opt into. Check **[Seller Funds](/marketplace/funds)** to see it reflected on your next completed sale.`,
  },
  {
    slug: "riftbound-vendetta-spoiler-season-complete-166-cards",
    category: "blog",
    title: "Every Riftbound Vendetta Card — All 166, Out Now",
    excerpt:
      "Riftbound: Vendetta released on 31 July 2026. Every one of the set's 166 main-set cards is out, with live prices compared across every store we track. Here's the full recap: what's in the set, what we learned, and how to be ready.",
    author: "RiftCompare",
    date: "2026-07-23",
    updated: "2026-07-31",
    readMins: 5,
    tags: ["vendetta", "spoilers", "news", "set", "card list"],
    browseCta: {
      href: "/blog/every-riftbound-vendetta-card-revealed",
      label: "Browse the full gallery →",
      blurb: "See all 166 confirmed Vendetta cards, filterable by domain, rarity and type.",
    },
    body: `![Riftbound: Vendetta — out now](/vendetta-hero.png)

Riftbound: Vendetta is out — it released worldwide on 31 July 2026. Every one of the set's **166 main-set cards** is now officially confirmed via Riot's card gallery, a week and a half ahead of the set's **31 July 2026** worldwide release. If you've been tracking the reveals piecemeal, this is the wrap-up: what's in the set, what stood out, and what's left to actually happen before boosters crack.

## The headline numbers

- **166 main-set cards**, plus **50+ Showcase alternate-art printings**, **Overnumbered chase cards** (numbered beyond the set — 167 and up), **SP-numbered specials**, six domain **runes**, and a promo token.
- **Nine new Champion Legends**, several making their Riftbound debut: **Akali, Renekton, Nasus, Shen, Jayce, Mel, Kennen, Zed and Ambessa**.
- **Three new mechanics** — Flow, Burn and Empower — see the full breakdowns: **[Flow](/guides/riftbound-flow-explained)**, **[Burn](/guides/riftbound-burn-explained)**, **[Empower](/guides/riftbound-empower-explained)**.
- **Two new card concepts** — Unit-Gear and Decrees — covered in **[Vendetta's new card types](/blog/riftbound-vendetta-unit-gear-decrees)**.
- **New domain pairings**: Fury + Calm, Mind + Body, and Chaos + Order — rival colours forced together.

## What the rivalry theme actually delivered

Vendetta's whole identity is built around clashing champions, and the reveals leaned all the way in: **Nasus vs Renekton**, **Shen vs Zed**, and connecting-art **Rival Overnumbers** that are designed to be collected and displayed as pairs rather than single cards. The set's first **Showdown Deck** — Riftbound's first ready-to-play two-player product — pairs **Shen versus Zed**, putting the rivalry directly into the box rather than just the flavour text.

## What's confirmed vs what's still ahead

To be precise about what "fully revealed" does and doesn't mean: every **card** in the set is now known — name, rules text, rarity, art. What hasn't happened yet is the **release** itself. Vendetta singles aren't buyable until **31 July 2026** (in-store Pre-Rift events start **24 July**), so there's no real tournament data, no settled metagame, and no live singles prices yet — only sealed product (booster boxes and packs) is buyable today, already comparable on our **[sealed page](/sealed)**.

**Update, 24 July 2026:** Pre-Rift launch events have now started, and the first Vendetta singles are already trading early — see **[Riftbound Vendetta Is Here](/blog/riftbound-vendetta-is-here-early-release)** for what's live right now, days ahead of the 31 July street date.

That's an important distinction if you're chasing a specific card: the **[Vendetta set page](/sets/vendetta)** already lists every confirmed card, and live prices are now populating as early singles surface ahead of the full retail release.

## Where to go next

- **[Browse every confirmed card](/blog/every-riftbound-vendetta-card-revealed)** — the full, filterable gallery.
- **[Chase cards, tier by tier](/blog/riftbound-vendetta-chase-cards-so-far)** — which Overnumbers, alt-arts and Epics to actually hunt.
- **[Best Vendetta decks](/guides/best-riftbound-vendetta-decks)** and the **[deckbuilding guide](/guides/building-for-riftbound-vendetta)** — archetype blueprints built from the confirmed card pool.
- **[Radiance release date](/radiance-countdown)** — Set 5 lands 23 October 2026.
- **[Everything you need to know about Vendetta](/blog/riftbound-vendetta-everything-you-need-to-know)** — the full set rundown in one read.

## Common questions

**Are all Riftbound Vendetta cards revealed?** Yes — all 166 main-set cards are officially confirmed, alongside Showcase alt-arts, Overnumbered chase cards, runes and promos.

**How many cards are in the Vendetta set?** 166 main-set cards, plus alternate printings (Showcase, Overnumbered, SP-numbered) that sit outside that base count.

**When does Riftbound Vendetta release?** 31 July 2026 worldwide, with in-store Pre-Rift launch events from 24 July.

**Can I buy Vendetta singles yet?** Yes — Vendetta released worldwide on 31 July 2026 and singles are trading now. See **[Riftbound Vendetta Is Here](/blog/riftbound-vendetta-is-here-early-release)** for the details.`,
  },
  {
    slug: "riftbound-vendetta-is-here-early-release",
    category: "blog",
    title: "Riftbound: Vendetta Is Out — Where to Buy Every Card",
    excerpt:
      "Riftbound: Vendetta has arrived early. Vendetta released worldwide on 31 July 2026 after a week of Pre-Rift launch events — here's what's live, where to buy it, and what to watch for through the launch window.",
    author: "RiftCompare",
    date: "2026-07-24",
    updated: "2026-07-31",
    readMins: 4,
    tags: ["vendetta", "news", "release", "buying guide", "price comparison"],
    browseCta: {
      href: "/sets/vendetta",
      label: "Shop the Vendetta set page →",
      blurb: "Every card, live prices as they land, and sealed product ready to buy now.",
    },
    body: `![Riftbound: Vendetta — out now](/vendetta-hero.png)

Riftbound: Vendetta is here — a little early. In-store **Pre-Rift launch events** ran from **24 July 2026**, and the set reached its full worldwide release on **31 July 2026**. Vendetta is out everywhere now. We're seeing early listings land on eBay and a handful of local stores well before the date everyone had circled — so if you've been waiting to chase a specific card, the wait is already partly over.

## What's actually happening

Pre-Rift events are early, in-store play sessions Riot runs the week before a set's full release — stores get product and run games, and inevitably some of those cards end up listed for sale before the "real" launch day. That's exactly how it played out: Pre-Rift singles reached the secondary market first, and the coordinated worldwide release followed on **31 July**.

## Is this the full release?

Not quite, and it's worth being precise about it. This is an early trickle, not the release itself — most stores won't have Vendetta singles in stock until 31 July, and the wider market (organised availability across every retailer we track) will only fill in properly once the street date actually hits. What's different starting today is that it's no longer purely theoretical: real cards are being bought and sold, which means real prices to compare.

## Where to buy Vendetta right now

- **[Vendetta set page](/sets/vendetta)** — every one of the 166 confirmed cards, with live prices populating as stores and early listings appear.
- **[Sealed product](/sealed)** — booster boxes and packs have been buyable for a while and are unaffected by the early singles trickle.
- eBay is the fastest-moving channel for early copies — watch it closely through launch week, since Pre-Rift-sourced listings tend to be thin on stock and can move in price quickly.

## What to watch for through launch week

Early-window prices on a brand-new set are volatile — a handful of listings can swing the "cheapest" price around by a lot until real supply catches up. A few things worth keeping in mind:

- **Don't panic-buy the first listing you see.** With so few copies trading, the first price isn't necessarily a fair one.
- **Chase cards move first.** Overnumbers, Showcase alt-arts and Epics are the printings most likely to show up (and sell out) early — see our **[chase card tracker](/blog/riftbound-vendetta-chase-cards-so-far)**.
- **Compare before you commit.** We're tracking every listing as it lands, delivered cost included, so the card page always shows the actual cheapest way to buy — not just the first store to list.
- **The 31 July date still matters.** If a card you want isn't trading yet, it almost certainly will be once the full release lands — no need to overpay chasing an early copy.

## Where to go next

- **[Riftbound Vendetta launch-week buying checklist](/blog/riftbound-vendetta-launch-week-buying-checklist)** — how to buy smart through the rush.
- **[Radiance release date](/radiance-countdown)** — Set 5 lands 23 October 2026.
- **[Every Vendetta card](/blog/riftbound-vendetta-spoiler-season-complete-166-cards)** — all 166 in the set.
- **[Chase cards, tier by tier](/blog/riftbound-vendetta-chase-cards-so-far)** — what to actually hunt for.
- **[Everything you need to know about Vendetta](/blog/riftbound-vendetta-everything-you-need-to-know)** — the full set rundown.

## Common questions

**Has Riftbound Vendetta been released?** Early singles are trading now via Pre-Rift launch events (started 24 July), a week ahead of the official 31 July worldwide street date — so yes, in part, but the full release is still 31 July.

**Can I buy Vendetta singles right now?** Some — early Pre-Rift copies are already surfacing on eBay and a handful of stores. Supply is thin and prices are still settling; check the **[Vendetta set page](/sets/vendetta)** for what's currently live.

**Are RiftCompare's Vendetta prices live?** Yes — we're comparing every Vendetta listing we track as it appears, delivered cost included, the same as every other set.

**When's the official Vendetta release date?** 31 July 2026, worldwide. That date hasn't moved — what's new is that some singles are trading a few days early.`,
  },
  {
    slug: "how-to-start-buying-riftbound-vendetta-decks",
    category: "blog",
    title: "How to Start Buying Into Riftbound Vendetta's First Decks",
    excerpt:
      "Vendetta is out — it released on 31 July 2026. Here's how to actually start buying into Flow Value, Burn/Disruption or Empower Midrange today — without overpaying in the early rush.",
    author: "RiftCompare",
    date: "2026-07-24",
    updated: "2026-07-31",
    readMins: 5,
    tags: ["vendetta", "decks", "buying guide", "news", "price comparison"],
    shop: [
      { label: "Jayce singles — the Empower champion", query: "Riftbound Jayce" },
      { label: "Mel singles", query: "Riftbound Mel" },
      { label: "Vendetta singles on eBay", query: "Riftbound Vendetta" },
      { label: "Zed vs Shen Showdown Deck", query: "Riftbound Vendetta Showdown Deck" },
    ],
    browseCta: {
      href: "/sets/vendetta",
      label: "Shop Vendetta cards now →",
      blurb: "Every confirmed card, priced live as early singles and stores list them.",
    },
    embed: {
      title: "Epic-rarity picks",
      note: "Vendetta's in-set Epics — history says one or two of these become the sleeper chases of the set, so they're worth grabbing early if a shell needs one.",
      chaseSet: "VEN",
      chaseTier: "epic",
      take: 12,
    },
    body: `![Riftbound: Vendetta — out now](/vendetta-hero.png)

Riftbound: Vendetta is out — it **[released worldwide](/blog/riftbound-vendetta-is-here-early-release)** on **31 July 2026**, after a week of Pre-Rift launch events. If you already know which archetype you want to play, that means you don't have to wait for launch day to start buying — you just have to be smart about it while supply is thin and prices are still settling.

## The three shells, in one line each

Full breakdown (synergies, engine, how to pilot each) is in **[Best Riftbound Vendetta Decks](/guides/best-riftbound-vendetta-decks)** — the short version:

- **Flow Value (Fury + Calm)** — Burn fills your trash, Flow replays from it. Grindy, hard to run out of gas.
- **Burn / Disruption (Chaos + Order)** — attack their deck as a clock while self-Burn fuels your own payoffs. Highest ceiling, easiest to mis-sequence.
- **Empower Midrange (Mind + Body)** — curve out cheap bodies, then pay to Empower them into finishers. Built around **Jayce** and **Mel**, the set's two confirmed Empower Legends.

## How to actually buy in during the early trickle

- **Start with the Legend.** Your Legend locks in your domains for everything else, so it's the first card worth securing — chase it on the **[Vendetta set page](/sets/vendetta)** or via the shop links below.
- **Sealed is the steadier option right now.** Singles supply from Pre-Rift events is thin, so prices can swing hard on a handful of trades. If you want a guaranteed way in, the **[Zed vs Shen Showdown Deck](/sealed)** is a ready-to-play two-player box — a genuine way to try two shells (and the Fury/Calm and Mind/Body-adjacent rivalry) without chasing singles at all.
- **Compare before you commit.** We track every early listing as it lands, delivered cost included, so a card's page always shows the actual cheapest way to buy it — not just the first store or eBay listing to show up.
- **Don't overpay for a card that isn't scarce.** Early-window prices are volatile because so few copies are trading; a common enabler that spikes today is usually cheap again within days once real supply lands on 31 July.
- **Chase cards move first and hardest.** If a shell wants a specific Overnumbered, Showcase alt-art or Epic, that's the piece most likely to be expensive early and to actually hold value — see the Epics below, and the full **[chase card tracker](/blog/riftbound-vendetta-chase-cards-so-far)**.

## Price your shell before you buy

Once you've picked a direction, drop your planned list into the **[deck pricer](/deck)** — it totals every card at the cheapest live price across the stores we track, in your own currency, so you know exactly what a shell costs before you start buying pieces one at a time.

## Common questions

**Can I actually buy Vendetta singles right now?** Yes — the set released on 31 July 2026 and singles are listed across eBay and the stores we track. Supply is thin, so prices are still settling.

**Which Vendetta deck should I build first?** Empower Midrange (Jayce or Mel) is the most beginner-friendly of the three confirmed shells; Flow Value is the most resilient long-game grinder. See the **[full archetype guide](/guides/best-riftbound-vendetta-decks)** for the complete breakdown.

**Is sealed or singles cheaper for a new-set deck?** It depends on supply — early in a set's life, thin singles supply can make sealed (or a preconstructed product like the Zed vs Shen Showdown Deck) the steadier option; see **[singles vs sealed](/guides/riftbound-singles-vs-sealed)** for the general rule.

**Are RiftCompare's prices for these cards live?** Yes — every listing we track is compared as it lands, the same as every other Riftbound set.`,
  },
  {
    slug: "riftbound-vendetta-card-prices-where-to-buy-cheapest",
    category: "blog",
    title: "Riftbound Vendetta Card Prices: Where to Buy for the Lowest Price",
    excerpt:
      "RiftCompare tracks every Riftbound Vendetta card's price live across 70+ stores in Australia, New Zealand, the US, the UK, Singapore and Canada, plus eBay — so you always find the cheapest place to buy Vendetta singles and sealed.",
    author: "RiftCompare",
    date: "2026-07-24",
    updated: "2026-07-31",
    readMins: 4,
    tags: ["vendetta", "price comparison", "buying guide", "news"],
    shop: [
      { label: "Vendetta singles on eBay", query: "Riftbound Vendetta" },
      { label: "Vendetta booster boxes", query: "Riftbound Vendetta booster box" },
    ],
    browseCta: {
      href: "/sets/vendetta",
      label: "See every Vendetta card's price →",
      blurb: "All 166 cards, ranked by the cheapest live price across every store we track.",
    },
    embed: {
      title: "Every Vendetta card, priced live",
      note: "Browse all 166 confirmed cards, filterable by domain, rarity and type — tap any card for its full price comparison.",
      setAll: "VEN",
      filterable: true,
      take: 400,
    },
    body: `![Riftbound: Vendetta — out now](/vendetta-hero.png)

Riftbound: Vendetta singles are trading early, and RiftCompare is tracking every single card's price the moment it appears — live, automatically, across every store we cover. If you're wondering where to buy Vendetta cards for the least money, this is the short answer: search or browse any card on RiftCompare and we've already done the comparison for you.

## How RiftCompare prices Vendetta

- **70+ stores, five markets.** We compare live prices across local stores in Australia, New Zealand, the US, the UK, Singapore and Canada, plus eBay in each of those markets — the same coverage as every other Riftbound set.
- **Ranked by delivered cost, not just sticker price.** A card's "cheapest" price accounts for shipping where we track it, not just the item price — so the store at the top of the list is genuinely the least you'll pay to get the card in hand, not just the lowest-looking number.
- **All 166 cards, priced as they list.** Every Vendetta card has a page tracking its price, and they filled in as stores listed the set. Coverage keeps improving as more singles and stores are listing them.
- **Updated continuously, not once a day.** As new listings land during this early trading window, the comparison updates — you're never looking at a stale price from before a store restocked or a new listing undercut it.

## How to actually find the cheapest price

1. **Search the card by name** (or browse the gallery below) to jump straight to its page.
2. **Check the price table.** Every store and eBay listing we track for that card is ranked cheapest-first, delivered cost included.
3. **Click straight through to buy.** Every price links directly to the listing — no extra searching, no guessing which store actually has stock.
4. **Building a whole deck?** Price the entire list at once with the **[deck pricer](/deck)** rather than checking each card one by one.

## Why prices are moving fast right now

Vendetta is in its launch window — it released on 31 July 2026 — so supply is still settling and prices can swing quickly on just a handful of trades. That's exactly when comparing pays off most: the gap between the cheapest and most expensive listing for the same card is usually widest right after a set drops, before supply catches up. Track the **[price movers](/movers)** if you want to watch which cards are climbing or falling fastest.

## Common questions

**Where can I find the cheapest Riftbound Vendetta cards?** On RiftCompare — every confirmed Vendetta card is priced live across 70+ stores and eBay in five markets, ranked cheapest first. Search or browse the **[Vendetta set page](/sets/vendetta)** to see them all.

**Are Vendetta prices live yet?** Yes — as early singles and stores list cards, we track and compare them automatically. Coverage keeps filling in as more stores list the set.

**Does RiftCompare account for shipping?** Yes, where we track it — a card's ranked price reflects delivered cost, not just the item price, so the top listing is the genuinely cheapest way to get it in hand.

**Can I price a whole Vendetta deck at once?** Yes — drop your list into the **[deck pricer](/deck)** to total every card at its cheapest live price across stores, in your own currency.`,
  },
  {
    slug: "riftbound-pre-rift-rules-explained",
    category: "guide",
    title: "Riftbound Pre-Rift Rules Explained: The Sealed Format for Launch-Week Events",
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

If you're gearing up for Vendetta's own Pre-Rift week, our **[Vendetta early-access guide](/blog/riftbound-vendetta-is-here-early-release)** covers what's already tradeable, and our **[Vendetta card database](/sets/vendetta)** has live prices on every confirmed card the moment it's buyable.

## Common questions

**Is Pre-Rift the same as the official release?** No — Pre-Rift is an early, in-store-only Sealed event the week before a set's street date. The set isn't generally available at retail until the official release date.

**Can I use cards from my own collection at a Pre-Rift?** No — Sealed decks are built entirely from the packs you open at the event itself.

**Is there a maximum deck size?** The rules set a *minimum* (25 cards); you can play more if you have enough playables, though most Sealed pools land close to the minimum.

**Where do these rules come from?** Riot's own [Pre-Rift guide](https://riftbound.gg/vendetta-pre-rift/) and [Rules Hub](https://playriftbound.com/en-us/rules-hub/) — check there for the full, current wording before an event, since organized-play rules can be updated between sets.`,
  },
  {
    slug: "riftbound-2026-regional-qualifier-los-angeles",
    category: "blog",
    title: "Riftbound Regional Qualifier: Los Angeles (Sept 25–27, 2026) — Everything We Know",
    excerpt:
      "The final Riftbound Regional Qualifier of 2026 lands at the Los Angeles Convention Center, September 25–27 — here's the venue, ticket tiers, requirements and the exclusive promos on offer.",
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
    title: "Riftbound Vendetta's Crystal Rose Cards: All 6 Wild Rift Alt-Arts, Priced",
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
    title: "Why Riftbound Card Prices Change — And When They Usually Drop",
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

This is exactly why RiftCompare prices each market in its own currency from stores that actually ship there, rather than converting one market's price and calling it your price. Switch markets with the country selector and the whole site re-prices: **[Australia](/blog/buy-riftbound-cards-australia)**, **[New Zealand](/blog/buy-riftbound-cards-nz)**, the **[US](/blog/buy-riftbound-cards-us)**, the **[UK](/blog/buy-riftbound-cards-uk)**, **[Singapore](/blog/riftbound-price-comparison-singapore)** and **[Canada](/blog/buy-riftbound-cards-canada)** each have their own guide.

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
    title: "The Cheapest Way to Start Riftbound (Without Wasting Money)",
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
- **[New Zealand](/blog/buy-riftbound-cards-nz)**
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
    title: "Riftbound Rules Explained — Every Mechanic, In One Place",
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

All three together, with how they interact: **[Vendetta's new mechanics](/blog/riftbound-vendetta-new-mechanics-flow-burn-empower)**.

## New card concepts

- **[Unit-Gear and Decrees](/blog/riftbound-vendetta-unit-gear-decrees)** — two card concepts Vendetta introduced.
- **[Overnumbers explained](/guides/riftbound-vendetta-overnumbers-explained)** — what a collector number beyond the set total means, and how signed and Overnumbered prints differ.
- **[Understanding card rarity](/guides/understanding-riftbound-card-rarity)** — the rarity tiers, and where Showcase and alt-art printings sit.

## Deckbuilding rules

- **[How a Riftbound deck is built](/guides/how-a-riftbound-deck-is-built)** — deck construction, Legends, and how the pieces fit together.
- **[Building for Vendetta](/guides/building-for-riftbound-vendetta)** — deckbuilding with the new set's cards and domain pairings.
- **[Vendetta synergies with existing cards](/blog/riftbound-vendetta-synergies-with-existing-cards)** — how new cards interact with earlier sets.

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
    title: "Riftbound Vendetta Nexus Night Promo Cards: Every One Revealed So Far",
    excerpt:
      "Vendetta's weekly Nexus Night events hand out a 25-card promo cycle at local stores — and the chase card is Mel, Newly Awakened. Here's every promo confirmed so far: Mel plus the full 6-card promo rune cycle, with live prices and pop-up card views.",
    author: "RiftCompare",
    date: "2026-08-01",
    updated: "2026-08-01",
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
    title: "Riftbound's 2027 Set Roadmap: Radiance, Legacy, The Reckoning and Two Unnamed Sets",
    excerpt:
      "Riot has mapped Riftbound's releases through 2027 — Radiance in October, Legacy in January, The Reckoning in April, and two unnamed sets after. What each means if you're buying.",
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
        a: "Radiance, the fifth Riftbound set, is scheduled for 23 October 2026 with around 180 cards. Preview season and Pre-Rift launch events run in the weeks before it.",
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
| **Radiance** | 5 | 23 Oct 2026 | ~180 | Seraphine, Evelynn, Ekko, Ziggs and Jarvan IV; a step up in size from Vendetta |
| **Legacy** | 6 | 29 Jan 2027 | ~346 | Region-driven themes across six factions; built for draft; new pack composition |
| *(boxed decks)* | — | Feb 2027 | — | Four new decks built around Legacy champions |
| **The Reckoning** | 7 | 30 Apr 2027 | ~264 | Centred on League's biggest champions |
| **Set 8** | 8 | Q3 2027 | — | Placeholder — nothing announced |
| **Set 9** | 9 | Q4 2027 | — | Placeholder — nothing announced |

Two things stand out before any of the detail. First, the cadence is roughly quarterly and now stated in advance, which is a meaningful change from finding out a set's date a few weeks ahead. Second, set sizes are moving around a lot — 180, then 346, then 264 — and set size is the single most underrated variable in what a card ends up costing.

## Radiance (Set 5) — 23 October 2026

Radiance is the near-term one, and the only set on this list you will be buying this year. It brings Seraphine, Evelynn, Ekko, Ziggs and Jarvan IV, with a card pool around 180 — a step up from [Vendetta's](/sets/vendetta) 166.

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
    title: "Riftbound Legacy: The Pack Change and Card Templating Updates, Explained",
    excerpt:
      "Legacy trades a common for a dedicated Legend or Battlefield slot, is the first set built for draft, and changes how card text is written. Here's what each change does in plain language.",
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
    title: "Riftbound's August 2026 State of the Game: Five Takeaways",
    excerpt:
      "Riot's August State of the Game covered ban philosophy, 2v2, collector products and language rollout. Here are the takeaways that actually change what you should buy and track.",
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

**Why this matters:** language availability drives which regional markets get proper distribution, and regional distribution drives price. If you buy across borders, the practical read is that the current market map is stable for a while — the six markets we track are not about to be joined by a wave of new ones, and cross-border buying will keep being a question of [shipping and currency conversion](/blog/currency-conversion-fees) rather than of new regional supply.

## 5. What we'd actually do with any of this

Not much this week, which is the honest answer to most announcement posts.

The two things that are genuinely actionable:

**Stop treating competitive staples as ban-risk assets.** If you have been avoiding expensive meta cards because of policy risk, that risk is being explicitly managed downward. It is not zero.

**Note which cards are quietly good in 2v2.** Nothing to buy yet. But 2028 targets get built toward in 2027, and the cards that benefit are currently priced as if the format does not exist.

Everything else — the collector product philosophy, the language pause — is context for reading future announcements rather than a reason to move money now. Which is fine. Most State of the Game posts are.

---

*Source: Riot Games' [August 2026 State of the Game](https://playriftbound.com/en-us/news/announcements/august-2026-state-of-the-game/), published 4 August 2026, and the accompanying [Products and Sets into 2027](https://playriftbound.com/en-us/news/announcements/products-and-sets-into-2027/). The developer positions summarised above are Riot's; the interpretation and price commentary are ours. Where we have paraphrased a stated position, read the original for the full wording.*`,
  },
  // The 2026 SEO content pack — the five briefed articles plus the four
  // AI-visibility target pages and the variant glossary. Kept in their own file
  // so the batch stays reviewable; spread here so every existing surface (the
  // /blog and /guides indexes, the sitemap's `content` section, the feeds, the
  // related-posts module, the /llm markdown mirrors) picks them up unchanged.
  ...SEO_PACK_ARTICLES,
];

export function getArticles(category?: ArticleCategory): Article[] {
  const list = category ? ARTICLES.filter((a) => a.category === category) : ARTICLES;
  return [...list].sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function getArticle(slug: string): Article | undefined {
  return ARTICLES.find((a) => a.slug === slug);
}
