// The SEO content pack — ten editorial articles published as one batch, kept in
// their own file rather than appended to the 3,900-line ARTICLES array so the
// batch stays reviewable and can be reasoned about as a unit. They are spread
// into ARTICLES by lib/articles.ts, so every existing surface (the /blog and
// /guides indexes, the sitemap's `content` section, the RSS/JSON feeds, the
// related-posts module, the /llm markdown mirrors) picks them up with no other
// change.
//
// WHAT'S IN THE BATCH
//
//   1-5  The five briefed articles. 1 and 2 are supplied copy reproduced as
//        written; 3-5 are drafts published as-is. The only editorial additions
//        anywhere in the five are (a) markdown structure — headings, tables,
//        list formatting — and (b) the internal links each article's brief
//        explicitly asked to be wired up.
//
//   6-9  Four pages targeting the high-value queries RiftCompare is currently
//        absent from in LLM answers ("top 10 Riftbound TCG marketplaces",
//        "Riftbound card price comparison", "review of Riftbound trading card
//        marketplace", "how to choose a Riftbound card marketplace"). These are
//        written to be CITED: an answer-first summary, a comparison table with
//        one fact per cell, and a FAQ block — the three shapes an answer engine
//        can lift cleanly.
//
//   10   The variant/finish glossary the other articles link to when they say
//        "confirm the exact variant", which had no page to point at.
//
// A NOTE ON NUMBERS. Nothing here states a live price. The most-expensive-cards
// listicle's own brief says its figures must come from the database rather than
// the body, so it carries `topValue` and the real ranking is rendered by
// components/ArticleTopValue.tsx at request time. Where a third party's fee is
// quoted (eBay's ~13.25% final value fee) it is quoted as the supplied copy
// states it and hedged as "commonly around", because we don't control it and it
// changes. TCGplayer's commission is described structurally — tiered commission
// plus processing — precisely because naming a percentage we can't verify is how
// a page becomes wrong and stays wrong.
import type { Article } from "../articles";

// Canonical hrefs for the destinations these articles link to. Centralised so a
// route rename is one edit rather than forty, and so a link can't quietly rot
// into a 404 in prose nobody re-reads. Every one of these resolves today.
const L = {
  browse: "/browse",
  sets: "/sets",
  origins: "/sets/origins",
  champions: "/champions",
  movers: "/movers",
  dealFinder: "/tools/deal-finder",
  tools: "/tools",
  trade: "/trade",
  boxEv: "/tools/box-ev",
  valueFinder: "/tools/value-finder",
  bestBasket: "/tools/best-basket",
  alerts: "/alerts",
  premium: "/premium",
  stores: "/stores",
  tracked: "/stores/tracked",
  sealed: "/sealed",
  market: "/market",
  signatures: "/cards/printing/signature",
  overnumbered: "/cards/printing/overnumbered",
  altArt: "/cards/printing/alternate-art",
  rarity: "/guides/understanding-riftbound-card-rarity",
  glossary: "/guides/riftbound-variant-glossary",
  // Country buying guides. /guides/us … /guides/sg 301 to these (next.config.js).
  us: "/blog/buy-riftbound-cards-us",
  uk: "/blog/buy-riftbound-cards-uk",
  au: "/blog/buy-riftbound-cards-australia",
  nz: "/blog/buy-riftbound-cards-nz",
  ca: "/blog/buy-riftbound-cards-canada",
  sg: "/blog/riftbound-price-comparison-singapore",
  // Sibling articles in this batch.
  values: "/blog/riftbound-card-values",
  bidding: "/blog/ebay-bidding-strategies",
  fees: "/blog/tcgplayer-fees",
  fx: "/blog/currency-conversion-fees",
  grails: "/blog/most-expensive-riftbound-cards",
  marketplaces: "/blog/best-riftbound-marketplaces",
  comparison: "/blog/riftbound-card-price-comparison",
  review: "/blog/riftcompare-review",
  choosing: "/blog/how-to-choose-a-riftbound-marketplace",
  // Pre-existing articles referenced as cross-links.
  singlesVsPacks: "/blog/buying-singles-vs-opening-packs",
  singlesVsSealed: "/guides/riftbound-singles-vs-sealed",
  whyPricesChange: "/guides/why-riftbound-card-prices-change",
  mostValuable: "/guides/most-valuable-riftbound-cards",
  whereToBuy: "/guides/where-to-buy-riftbound-cards",
  boxEvGuide: "/guides/riftbound-booster-box-ev-worth-ripping-or-buying-singles",
  marketplaceVsStores: "/blog/marketplace-vs-stores-where-to-buy-riftbound",
  buyerProtection: "/blog/riftcompare-marketplace-buyer-protection-explained",
} as const;

const AUTHOR = "Bill";
const PUBLISHED = "2026-08-03";

export const SEO_PACK_ARTICLES: Article[] = [
  // ───────────────────────────────────────────────────────────────────────────
  // 1. Supplied copy — reproduced as written, with structure and internal links.
  // ───────────────────────────────────────────────────────────────────────────
  {
    slug: "riftbound-card-values",
    category: "blog",
    title: "Riftbound Card Values: Live US Prices & Top Movers",
    excerpt:
      "Discover real-time Riftbound card values with our live price tracker. Get accurate prices before you buy, sell or grade.",
    author: AUTHOR,
    date: PUBLISHED,
    readMins: 12,
    tags: ["prices", "price comparison", "buying", "selling", "movers"],
    hero: {
      src: "/blog/riftbound-card-values.png",
      alt: "Riftbound Card Values — live US prices, sold comps and top movers on RiftCompare",
    },
    summary: [
      "Anchor to **sold comps**, not asking prices — active listings routinely run 20–40% above what cards actually clear for.",
      `Confirm the exact variant and collector number first; a Signature and a standard printing of the same champion can differ by thousands. [Variant glossary →](${L.glossary})`,
      `Run the card through [RiftCompare](${L.browse}) for live cross-store prices including shipping, then cross-check recent sold listings on eBay or TCGplayer.`,
      "Subtract marketplace fees and shipping before you decide a number — they take 15–20% off your net.",
      `Riftbound reprices daily, so use [the daily movers dashboard](${L.movers}) and [price alerts](${L.alerts}) rather than checking weekly.`,
    ],
    faq: [
      {
        q: "Where do Riftbound card prices come from?",
        a: "Sold listings on eBay, marketplace APIs (TCGplayer, CardMarket), and store inventory feeds — with sold listings carrying the most weight.",
      },
      {
        q: "How often should prices update?",
        a: "Daily. Riftbound is young and fast-moving; weekly data is too stale for active traders.",
      },
      {
        q: "Should I grade my card?",
        a: "Only if the PSA 10 comp minus grading/shipping/insurance exceeds the raw median by at least 40–50%.",
      },
    ],
    browseCta: {
      href: L.browse,
      label: "Look up a card's live value →",
      blurb: "Search any Riftbound card and see live prices across every store and marketplace we track, shipping included.",
    },
    body: `The fastest way to get a reliable current value for any Riftbound card is to run it through a live price tracker that aggregates recent sold listings across multiple marketplaces, then cross-check the graded premium before you buy, sell, or grade. Asking prices on active listings routinely run 20-40% above what cards actually clear for, so sold comps are the only number worth anchoring to.

Here's the minimal three-step workflow:

**Step 1: Confirm exact identifiers.** Pull the set name, card name, collector number, and variant type (standard, foil, Signature, Metal, Overnumbered, Alternate Art). One wrong field returns a completely different price. If you're unsure which treatment you're holding, the [variant and finish glossary](${L.glossary}) walks through each one.

**Step 2: Check recent sold comps and graded premiums.** Run the card through [RiftCompare](${L.browse}) for a live cross-store comparison, then verify against recent sold listings on eBay or TCGplayer.

**Step 3: Adjust for condition and fees.** Raw Near Mint, PSA 9, and PSA 10 each sit at different price points. Factor in marketplace fees and shipping before you commit to a number. Our [TCGplayer fee breakdown](${L.fees}) shows what actually comes off the top.

RiftCompare is the recommended starting point for US buyers and sellers: it compares live prices across US stores, eBay, and TCGplayer in a single search, including total cost with shipping. The [US buying guide](${L.us}) covers which stores are in that comparison.

## Where do Riftbound card prices actually come from?

The number you see on any tracker is only as reliable as its data source. Most live aggregators pull from three places: recent sold listings on eBay, marketplace APIs from platforms like TCGplayer and CardMarket, and store inventory feeds. Of those three, sold listings carry the most weight. An active listing is just a seller's hope; a completed sale is what the market actually paid.

From those feeds, trackers calculate a few different metrics:

- **Median price:** The middle value across recent sales, which filters out outliers on both ends.
- **Market price:** A weighted average that gives more influence to higher-volume recent sales.
- **Last sale:** The single most recent completed transaction, useful for fast-moving cards but noisy on low-volume ones.

Daily refresh from marketplace APIs matters more for Riftbound than for slower TCG markets because the game is still in early growth, and single tournament results can reprice a card overnight. A tracker updated weekly is practically useless for active traders. [Why Riftbound prices change](${L.whyPricesChange}) goes deeper on the specific triggers.

## How to look up a specific Riftbound card's current value

Getting an accurate price takes about two minutes when you follow the right sequence. Skipping steps, especially the variant confirmation, is where most pricing errors happen.

1. Confirm the exact card identifiers (set name, card name, collector number, variant finish). Two cards with the same champion name but different variants can differ by thousands of dollars. Browsing [by set](${L.sets}) — for example the full [Origins card list](${L.origins}) — or [by champion](${L.champions}) is the quickest way to land on the right printing.
2. Search [RiftCompare](${L.browse}) with those identifiers. This pulls live cross-store prices including shipping, so you see the real total cost.
3. Pull recent sold comps from eBay or TCGplayer. Filter completed sales to the last 30 days. For high-value cards, narrow to 7 days.
4. Compare raw median, last sale, and graded comps. If the last sale is significantly above the 30-day median, check whether a tournament result or announcement drove a spike.
5. Set a [watchlist alert](${L.alerts}) if you're not buying or selling today.

> **Pro tip:** Always search by collector number, not just card name. The collector number is the only field that guarantees you're looking at the right card.

## What actually drives a Riftbound card's price?

Price differences between two cards with similar names often come down to four factors: grade, variant, playability, and supply.

- **Grading (PSA/Beckett):** A PSA 10 copy of a high-demand card can sell for two to four times the raw Near Mint price. For lower-value cards (under $50 raw), grading rarely pencils out.
- **Variant premiums:** [Signature](${L.signatures}), Metal, [Overnumbered](${L.overnumbered}), [Alternate Art](${L.altArt}), and foil treatments each carry different premiums. Signature and Metal variants dominate the top of most high-value lists — see [the most expensive Riftbound cards](${L.grails}) for what that looks like in practice.
- **Playability and meta demand:** When a card becomes central to a winning tournament deck, demand spikes fast. These moves are often temporary.
- **Supply-side factors:** Print run, promo and Organized Play (OP) prize-wall exclusives, and sealed product availability all affect supply. Our [rarity and printings explainer](${L.rarity}) covers how the tiers work.

## What causes Riftbound prices to swing so sharply?

Riftbound is a young, actively growing TCG, and that means its card market moves faster than most.

The main triggers for big moves: tournament results, meta shifts, new set releases, OP and prize announcements, and influencer/content coverage. To stay ahead, watch [the daily movers dashboard](${L.movers}) for top gainers and losers, track the set release calendar, and monitor graded-auction results for high-value variants.

## How to read a price entry on a tracker

| Field | What it means | When to trust it |
| --- | --- | --- |
| Market / median price | Middle value across recent sales | The most stable benchmark for valuation |
| Last sale | Most recent completed transaction | Useful for fast-moving cards, noisy for low-volume ones |
| 7-day % change | Short-term momentum | A large positive swing may signal a temporary spike |
| 30-day % change | Trend direction over a month | More reliable for valuation than single-day moves |
| Volume | Number of sales in the period | Low volume means any single sale skews the price |
| PSA 9 / PSA 10 price | Graded comps | Compare to raw price to assess grading upside |

For a quick sell decision, use the median price from the last 30 days and subtract fees. For long-term valuation, weight the 30-day trend and graded comps more heavily.

## How to price your Riftbound card to sell — and buy at the lowest cost

Checklist for setting a competitive sale price:

- Pull the last 10 sold comps for the exact variant and condition.
- Identify the median of those comps as your starting price.
- Add the graded premium if the card is PSA/Beckett certified.
- Subtract marketplace fees (eBay's standard final value fee for trading cards is typically around 13.25% for most sellers).
- Add a realistic shipping cost ($1-$4 for a standard mailer with tracking in the US).
- The result is your net; if it's below your floor, hold or relist later.

Trading rather than selling? The [trade calculator](${L.trade}) values both sides of a swap at live prices so nobody has to eyeball it.

**Avoiding scams and counterfeits when buying:** buy graded copies only from PSA/Beckett with a verifiable cert number; for raw cards, request clear photos of all four edges and corners; avoid listings with stock photos; check the seller's feedback history; use buyer-protected payment methods.

## How to track prices daily and set alerts that actually work

Useful tools for daily monitoring: live market aggregators ([RiftCompare](${L.browse})) for cross-store median and last-sale data; sold-listing alerts on eBay; [watchlists](${L.alerts}) for cards you own or plan to buy; [price-mover dashboards](${L.movers}); grading-price lookups.

Setting up a practical alert workflow: search the exact card on RiftCompare and add it to your watchlist; on eBay, save a completed-listings search with email notifications; on TCGplayer, use price alerts; check [the daily movers dashboard](${L.movers}) each morning. If you're bidding rather than buying at a fixed price, [our eBay bidding guide](${L.bidding}) covers how to set a maximum you can actually defend.

## Key takeaways

- **Use sold comps, not ask prices.** Recent completed sales are the only reliable benchmark.
- **Variant and grade drive the biggest price gaps.** Signature and Metal variants can reach high ungraded prices; PSA 10 premiums can double the value.
- **Daily volatility is real.** Active traders need daily alerts, not weekly checks.
- **Factor fees before pricing to sell.** Marketplace fees and shipping can reduce your net by 15-20%.
- **Use RiftCompare for live US pricing** across US stores, eBay, and TCGplayer in one search.

## RiftCompare gives you live US prices without the manual work

Stop checking five tabs to find the lowest price on a Riftbound card. RiftCompare pulls live prices from US stores, eBay, and TCGplayer into a single comparison that includes shipping. [Browse every set's full card list](${L.sets}), [search by champion](${L.champions}), and use the [deal finder](${L.dealFinder}) to surface the lowest total-cost purchase across all tracked stores.`,
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Supplied copy — reproduced as written, with structure and internal links.
  // ───────────────────────────────────────────────────────────────────────────
  {
    slug: "ebay-bidding-strategies",
    category: "blog",
    title: "eBay Bidding Strategies for Buyers: Win More, Pay Less",
    excerpt:
      "Proxy bidding, sniping and setting a maximum you can defend — a disciplined eBay bidding strategy for buyers of Riftbound cards and other collectibles.",
    author: AUTHOR,
    date: PUBLISHED,
    readMins: 12,
    tags: ["buying", "ebay", "tips", "price comparison"],
    hero: {
      src: "/blog/ebay-bidding-strategies.png",
      alt: "eBay Bidding Strategies — proxy bidding, last-second sniping and landed-cost maximums, on RiftCompare",
    },
    summary: [
      "Default to eBay's **proxy (automatic) bidding** for routine purchases; it never bids more than it has to.",
      "**Snipe at 3–5 seconds** on contested collectibles — a 1-second bid often fails on server latency.",
      "Write your hard maximum down *before* the final hour: item + shipping + fees + tax. Never raise it mid-auction.",
      `Cross-check the market rate first with [the Deal Finder](${L.dealFinder}) so your maximum is anchored to what the card actually costs elsewhere.`,
    ],
    faq: [
      {
        q: "Is sniping allowed on eBay?",
        a: "Yes — eBay permits third-party sniping services like Gixen and Myibidder.",
      },
      {
        q: "When is the best time to snipe?",
        a: "At 3–5 seconds remaining; 1 second risks a failed submission due to latency.",
      },
      {
        q: "How do I set a maximum bid?",
        a: "Use the landed-cost formula — item price + shipping + estimated marketplace fees + applicable sales tax — and cross-check the market rate on RiftCompare's Deal Finder.",
      },
    ],
    browseCta: {
      href: L.dealFinder,
      label: "Check the market rate first →",
      blurb: "The Deal Finder shows whether an auction's current bid is above or below the live cross-store price.",
    },
    body: `The most reliable approach for U.S. buyers is a disciplined hybrid: use eBay's proxy (automatic) bidding for routine purchases, snipe selectively at the 3-5 second window for contested auctions, and always set a firm maximum before you place a single bid.

- Use **proxy bidding** when you're buying common items or the auction has low competition.
- **Snipe at the last second** for high-demand or collectible items where early bids trigger bidding wars.
- **Bid early and incrementally** only when you need to establish eligibility (reserve-price auctions) or the item is so rare that missing it is worse than a small premium.

Whatever tactic you choose, write down your hard maximum before the auction ends. That number must include the item price, shipping, applicable sales tax, and any marketplace fees.

## How does eBay's automatic bidding actually work?

eBay's proxy (automatic) bidding system holds your maximum in confidence and places incremental bids on your behalf, raising your bid only as much as needed to stay ahead. If no one else bids, you win at the opening price, not your maximum.

The other key mechanic is eBay's hard close: auctions end at a fixed time regardless of last-second activity. That single rule is what makes sniping viable.

## Comparing the three main eBay bidding strategies

| Strategy | How it works | Best for | Downside |
| --- | --- | --- | --- |
| Early max bid (proxy) | Set your maximum at the start and walk away | Routine purchases, low-competition listings | Early visible bids can attract watchers |
| Incremental (active) | Watch and raise manually | Reserve-price auctions | Can trigger bidding wars that push prices higher; most time-intensive |
| Last-second sniping | Bid in the final 3-5 seconds | Contested collectibles and high-demand cards | Higher risk of a failed bid on timing |

Trade-offs: early max bid = moderate win probability, low price pressure, minimal attention. Incremental = higher price pressure (can trigger wars). Sniping = slightly higher win probability in competitive auctions, lower price pressure, higher risk of failed bid due to timing.

## When should you bid? Timing guidance for U.S. buyers

Weekend evenings attract more active bidders. Weekday mid-mornings (10 AM-noon Eastern) often see lighter competition. Always convert the listing's end time to your local timezone. For manual sniping, place your final bid with 3-5 seconds remaining; a 1-second snipe often fails due to server latency.

> **Pro tip:** Switch your eBay account's display timezone to your own so you're never caught off-guard by a 3:00 AM close.

## What sniping tools work in the U.S.?

Two widely used services are Gixen and Myibidder. eBay's policies permit third-party sniping services. Before committing: test on a low-value auction first, check confirmation emails/audit logs, review error handling, and enable two-factor authentication before granting any third-party access. Prefer API-based tools over those requiring your full login credentials.

## How to set your maximum bid before the auction ends

1. Search eBay's completed listings for the same item; filter by "Sold" for actual transaction prices.
2. Check the number of bids and watchers on comparable past listings.
3. Review seller feedback and shipping patterns.
4. Use Terapeak for deeper historical price data.
5. Apply the landed-cost formula: **item price + shipping + estimated marketplace fees + applicable sales tax = your true maximum.**

For Riftbound TCG cards specifically, RiftCompare's [Deal Finder](${L.dealFinder}) lets you cross-check live prices across eBay and other stores before you commit to a maximum. Write your maximum down before the final hour and treat it as fixed.

If you're buying to open rather than to collect, it's worth reading [singles vs opening packs](${L.singlesVsPacks}) before you bid on sealed product at auction — the maths usually favours singles.

## Common mistakes that push prices up, and red flags to watch for

**Mistakes:** failing to set a maximum then raising bids reactively; chasing a loss; ignoring shipping costs; bidding on multiple overlapping auctions; using round numbers for your maximum.

**Red flags:** abnormal bidder patterns (possible shill bidding); newly created seller accounts selling high-value items; vague shipping/return info; repeated bid retractions from the same bidder.

## A 7-step sniping workflow you can run right now

1. Research the item (completed listings, confirm market price with RiftCompare, calculate landed cost).
2. Set your maximum in writing (include shipping, fees, tax).
3. Open the auction page 10 minutes before close; log in.
4. Navigate to the bid entry field; type your maximum but don't click "Place bid" yet.
5. At 5-7 seconds remaining, click "Place bid" to load the confirmation screen.
6. At 3-5 seconds remaining, click "Confirm bid."
7. Verify the outcome in your eBay notifications.

## Why last-second bidding can work: the economic rationale

The academic case for sniping is grounded in eBay's hard-close structure. Research by Roth et al. found significantly more last-second bidding on eBay than on platforms with automatic time extensions. Studies by Ely, Hossain, Gray, and Reiley estimate a modest increase in win probability for snipers.

Sniping has the clearest edge when the auction has active incremental bidders, the item is a collectible with high appraisal uncertainty, and you've set a firm maximum.

## What's the best approach for most U.S. buyers?

Default to proxy bidding for the majority of purchases. Reserve sniping for auctions where you expect active bidding in the final minutes. The single biggest mistake to avoid: raising your maximum after you've set it because the price is climbing.

## Key takeaways

- **Default to proxy bidding** for most purchases.
- **Snipe for contested auctions** at 3-5 seconds remaining.
- **Set a hard maximum first** (item + shipping + fees + tax).
- **Avoid emotional chasing;** treat a loss as pricing data.
- **Use RiftCompare for price research** before setting your max.

## RiftCompare helps you set maximums you can actually defend

Instead of manually cross-referencing eBay completed listings, local store prices, and shipping costs, you get a single view of live prices across eBay, TCGplayer, and local US stores with shipping included. The [Deal Finder](${L.dealFinder}) shows whether an auction's current bid is above or below market.

Buying often enough that the research time adds up? [RiftCompare Premium](${L.premium}) unlocks the full opportunity list rather than the single best row. Run a store? [We track store prices too](${L.stores}) — and you can see [every store in the comparison](${L.tracked}).`,
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Draft published as-is. Fees described structurally, never as a fabricated
  //    percentage — see the file header.
  // ───────────────────────────────────────────────────────────────────────────
  {
    slug: "tcgplayer-fees",
    category: "blog",
    title: "TCGplayer Fees Explained: What Sellers and Buyers Actually Pay in 2026",
    excerpt:
      "Understand every TCGplayer fee — marketplace commission, payment processing, shipping — and how to calculate your true net when selling Riftbound cards.",
    author: AUTHOR,
    date: PUBLISHED,
    readMins: 9,
    tags: ["selling", "fees", "price comparison", "tcgplayer", "buying"],
    hero: {
      src: "/blog/tcgplayer-fees.png",
      alt: "TCGplayer Fees Explained — marketplace commission, payment processing and your real net, on RiftCompare",
    },
    summary: [
      "TCGplayer sellers pay **two stacked fees**: a tiered marketplace commission on the item price, and payment processing on the item *plus* shipping, with a fixed per-order component.",
      "Buyers pay no direct platform fee — but they do pay shipping and sales tax.",
      "The fixed per-order fee is what makes cheap single-card sales inefficient. **Bundle them.**",
      `Compare net-of-fees across TCGplayer, eBay and local stores before you list — [the Deal Finder](${L.dealFinder}) does it with shipping included.`,
    ],
    faq: [
      {
        q: "Does TCGplayer charge buyers a fee?",
        a: "No direct platform fee — buyers pay the item price, shipping, and applicable sales tax.",
      },
      {
        q: "Is the paid seller plan worth it?",
        a: "Only if your monthly commission savings exceed the subscription cost. Calculate from your actual volume.",
      },
      {
        q: "Why did I net so little on a cheap card?",
        a: "The fixed per-order payment-processing fee takes a large share of low-value sales — bundle cards into one order to reduce its impact.",
      },
      {
        q: "How do TCGplayer fees compare to eBay?",
        a: "eBay's final value fee (around 13.25% for trading cards) applies to the total including shipping; TCGplayer's tiered commission applies only to the item price, with separate processing. Compare net payouts per card.",
      },
    ],
    browseCta: {
      href: L.dealFinder,
      label: "Compare net-of-fees prices →",
      blurb: "See the all-in cost of any Riftbound card across TCGplayer, eBay and local stores, shipping included.",
    },
    body: `If you sell on TCGplayer, your real payout is never the sticker price. Between the marketplace commission and payment processing, a typical seller keeps somewhere in the low-to-mid 80% range of each sale before shipping costs — and the exact figure depends on your seller tier and how you fulfil orders. This guide breaks every TCGplayer fee down so you can calculate your true net and decide when another marketplace (or a direct sale) makes more sense.

## The short answer: what does TCGplayer take?

TCGplayer's cost to sellers comes from two stacked layers:

1. **Marketplace commission** — a percentage of the item price, charged on each sale. This is tiered: higher-volume sellers on paid seller programs pay a lower commission rate than casual sellers on the free tier.
2. **Payment processing** — a percentage plus a small fixed per-transaction fee, applied to the total the buyer pays (item + shipping).

On top of that, you carry the actual cost of shipping and supplies. Buyers, meanwhile, don't pay a platform fee directly, but they do pay shipping and any applicable sales tax, which TCGplayer collects and remits.

Because the commission is tiered and processing applies to the full order total, the only reliable way to know your payout is to run the math on each sale. That's exactly what RiftCompare's [cross-store comparison](${L.dealFinder}) does automatically — it shows the all-in cost so you can compare a TCGplayer price against eBay and local stores on equal footing.

## Fee layer 1: marketplace commission

The marketplace commission is the headline fee. It's charged as a percentage of the item's sale price (not including shipping). The rate you pay depends on your seller plan:

- **Casual / free-tier sellers** pay the highest commission percentage.
- **Paid seller-program members** (higher-volume storefronts) pay a reduced commission percentage in exchange for a monthly subscription.

The practical takeaway: if you're moving enough volume, the paid tier's lower commission can more than offset its monthly cost. If you sell only occasionally, the free tier is cheaper overall despite the higher per-sale rate. Calculate your monthly sales volume, multiply by the commission difference, and compare it to the subscription price before upgrading.

## Fee layer 2: payment processing

Payment processing is a separate charge applied to the entire amount the buyer pays — item price plus shipping. It's structured as a percentage plus a fixed per-order fee. Two consequences follow:

- The fixed per-order component **hits small orders hardest**. Selling a $2 common card means the fixed fee eats a large share of the sale, which is why bundling multiple cards into one order is more efficient.
- Because processing applies to shipping too, charging the buyer for shipping doesn't fully "pass through" — you still pay processing on that shipping amount.

## Worked example: selling a $40 Riftbound card

Assume a $40 card, $1 shipping charged to the buyer, a mid-tier commission rate, and standard processing:

| Line | Basis | Effect on your payout |
| --- | --- | --- |
| Item price | — | +$40.00 |
| Shipping collected | — | +$1.00 |
| Marketplace commission | on the $40 item | − a percentage of $40 |
| Payment processing | on the $41 total | − a percentage of $41, plus the fixed per-order fee |
| Your shipping/supply cost | actual | − whatever you spend on a mailer and postage |

Your net = $40 + $1 (shipping collected) − commission − processing − your actual shipping cost. In practice, a seller nets meaningfully less than the $40 sticker. Run this same subtraction for every card, and you'll quickly see which low-value cards aren't worth listing individually.

## TCGplayer fees vs eBay and CardMarket

| Marketplace | Fee shape | Applies to | Best suited to |
| --- | --- | --- | --- |
| TCGplayer | Tiered commission + separate payment processing | Commission on item only; processing on item + shipping | Bulk and mid-value singles |
| eBay | Final value fee, commonly around 13.25% for trading cards, plus a small per-order fee | The total **including** shipping | Scarce cards where auction demand sets the price |
| CardMarket | Its own commission structure | Europe-focused | EU/UK sellers |
| Direct / local sale | No marketplace commission | — | Local trades; costs you reach and buyer protection |

eBay's auction format also lets demand set the price, which can beat a fixed TCGplayer listing for scarce cards — [our eBay bidding guide](${L.bidding}) covers that mechanic from the buyer's side.

The right marketplace depends on the card's value, your location, and your volume. High-value chase cards often net more at auction; bulk and mid-value singles often move most efficiently on TCGplayer. If you're weighing the whole field rather than just these three, [we compared the main Riftbound marketplaces](${L.marketplaces}) and wrote up [how to choose between them](${L.choosing}).

RiftCompare shows all of these side by side with shipping included, so you can pick the venue that nets you the most.

## How to reduce what you pay in fees

- **Bundle orders:** combine multiple cards into one sale to dilute the fixed per-order processing fee.
- **Match your seller tier to your volume:** upgrade to the paid plan only once your commission savings exceed the subscription.
- **Price with fees baked in:** set your listing price so your post-fee net still beats your floor.
- **Right-size shipping:** use the cheapest tracked method appropriate to the card's value; over-insuring cheap cards wastes money.
- **Check the market first:** use [RiftCompare](${L.browse}) to confirm the going rate before you list, so you don't underprice and lose margin to fees on top. [Browse by set](${L.sets}) or [by champion](${L.champions}) to find the exact printing you're selling.

Selling across a border adds another layer on top of all of this — see [currency conversion fees](${L.fx}) before you price for an overseas buyer.

## Key takeaways

- TCGplayer sellers pay **two stacked fees**: tiered marketplace commission (on item price) and payment processing (on item + shipping, plus a fixed per-order fee).
- Buyers pay no direct platform fee but do pay shipping and sales tax.
- The fixed per-order fee makes cheap single-card sales inefficient — **bundle them**.
- Upgrade to a paid seller tier only when your volume justifies it.
- Always compare net-of-fees across TCGplayer, eBay, and local stores with RiftCompare before listing.

## Stop guessing your real payout

RiftCompare shows the true all-in price of any Riftbound card across TCGplayer, eBay, and local US/UK/AU/NZ/CA/SG stores — shipping included — so you can price listings that still net a profit after fees. Check the live comparison before your next listing, and start from [the US buying guide](${L.us}) if you're selling into the US market.`,
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Draft published as-is.
  // ───────────────────────────────────────────────────────────────────────────
  {
    slug: "currency-conversion-fees",
    category: "blog",
    title: "Currency Conversion Fees on Card Purchases: The Hidden Cost of Buying Abroad",
    excerpt:
      "Buying Riftbound cards from overseas stores? Learn how currency conversion fees, FX markups and card surcharges inflate the price — and how to pay less.",
    author: AUTHOR,
    date: PUBLISHED,
    readMins: 8,
    tags: ["buying", "fees", "price comparison", "international"],
    hero: {
      src: "/blog/currency-conversion-fees.png",
      alt: "Currency Conversion Fees — FX markup, dynamic currency conversion and true landed cost, on RiftCompare",
    },
    summary: [
      '"Currency conversion fee" is really **three** costs: your card\'s foreign transaction fee, the exchange-rate markup, and optional dynamic currency conversion (DCC).',
      "**Always decline DCC.** Being charged in your home currency at the merchant's checkout almost always uses a worse rate than your own bank's.",
      "Stacked, they add roughly **3–7%** on top of the listed price — enough to erase most cross-border 'deals'.",
      `The lowest sticker price abroad is not the lowest **landed** cost. [Compare all-in](${L.dealFinder}) across all six tracked markets before you buy.`,
    ],
    faq: [
      {
        q: "What's a typical foreign transaction fee?",
        a: "Commonly around 3% on many consumer cards, though plenty of travel/premium cards waive it entirely.",
      },
      {
        q: "Should I let the store charge me in my own currency?",
        a: "No. That's dynamic currency conversion (DCC) and almost always uses a worse rate than your bank's conversion.",
      },
      {
        q: "Is buying cards from overseas ever worth it?",
        a: "Yes — when the true landed cost (FX + fees + shipping + duty) still beats your best domestic all-in price. Use RiftCompare to check.",
      },
      {
        q: "Will I pay import duty?",
        a: "It depends on your country's de minimis threshold and the order value. Confirm before ordering.",
      },
    ],
    browseCta: {
      href: L.dealFinder,
      label: "See the true cross-border price →",
      blurb: "Live prices across US, UK, AU, NZ, CA and SG stores plus eBay and TCGplayer, with shipping included.",
    },
    body: `When you buy a Riftbound card from a store in another country, the price you see is rarely the price you pay. Between your card issuer's foreign transaction fee, the exchange-rate markup baked into the conversion, and any dynamic currency conversion (DCC) offered at checkout, cross-border purchases can quietly cost 3-7% more than the listed price. For collectors chasing the lowest global price, understanding these fees is the difference between a genuine deal and an illusory one.

## What "currency conversion fee" actually means

There are three separate costs that get lumped together under this label:

| Cost | What it is | Visible on your statement? |
| --- | --- | --- |
| Foreign transaction fee | A percentage your bank or card network adds when a charge is processed in a foreign currency or through a foreign merchant | Yes — a separate line, on top of the converted amount |
| Exchange-rate markup | The gap between the mid-market ("real") rate and the rate your card network or processor actually uses | **No** — it's built into the rate, not listed |
| Dynamic currency conversion (DCC) | The merchant offering to charge you in your home currency "so you know exactly what you'll pay" | Only as a worse total. Decline it |

Stack all three and a card listed for the equivalent of $50 abroad can land at $53-$54 on your statement.

## Why this matters for Riftbound buyers specifically

RiftCompare tracks prices across the US, UK, Australia, New Zealand, Canada, and Singapore — you can see [every store in the comparison](${L.tracked}) for each. The lowest sticker price is frequently in another country — but the lowest sticker price is not always the lowest true cost once conversion fees and international shipping are added. A card that's $3 cheaper in a UK store may cost more than the US listing after a foreign transaction fee and FX markup.

That's precisely the trap RiftCompare's total-cost comparison is designed to expose: it shows the all-in landed price, not just the headline number. Each market has its own buying guide — [US](${L.us}), [UK](${L.uk}), [Australia](${L.au}), [New Zealand](${L.nz}), [Canada](${L.ca}) and [Singapore](${L.sg}) — with the stores actually in that comparison.

## How to calculate your true landed cost

Use this formula for any cross-border purchase:

    Listed price (converted at the real mid-market rate)
  + Exchange-rate markup (the processor's spread above mid-market)
  + Foreign transaction fee (your card's percentage)
  + International shipping
  + Any customs/import duty or tax at your border
  = True landed cost

Compare that number — not the sticker — against your domestic options. If the overseas total beats the best local all-in price, it's a real deal. If not, buy at home. [Search any card](${L.browse}) to see both sides at once.

## Practical ways to pay less

- **Decline DCC every time.** Always choose to be charged in the merchant's local currency and let your own bank convert.
- **Use a no-foreign-transaction-fee card.** Many travel and premium cards waive the foreign transaction fee entirely — this alone removes one whole layer of cost.
- **Consider a multi-currency account.** Services that hold balances in multiple currencies and convert near the mid-market rate can beat card-network rates for frequent international buyers.
- **Buy in bulk to amortise shipping.** International shipping is the biggest single add-on; consolidating several cards into one order spreads it out. [Best Basket](${L.bestBasket}) works out the cheapest way to split one wantlist across stores.
- **Watch the exchange-rate trend.** For larger purchases, a few percent of FX movement matters. Check the rate before committing.
- **Confirm import thresholds.** Know your country's de minimis threshold below which no duty/tax applies (it varies by market), so a purchase doesn't unexpectedly attract a customs charge.

## A quick comparison mindset

Think of every overseas listing as having a "sticker price" and a "true price." The sticker is what the store shows; the true price is what hits your account after conversion, fees, shipping, and duty. Chase the true price.

RiftCompare does this comparison for you across all six tracked markets, so you can instantly see whether a UK, Canadian, or Singaporean store actually undercuts your local options once every cost is included. It's the same discipline the [TCGplayer fee breakdown](${L.fees}) applies to selling, and the same one [our price-comparison explainer](${L.comparison}) applies to the numbers themselves.

## Key takeaways

- "Currency conversion fee" is really three costs: foreign transaction fee, exchange-rate markup, and optional DCC.
- **Always decline dynamic currency conversion** — it uses a worse rate.
- A no-FX-fee card and a multi-currency account remove or shrink the biggest fee layers.
- The lowest sticker price abroad is not always the lowest true landed cost.
- Compare all-in landed cost — including FX, shipping, and duty — with RiftCompare before buying internationally.

## See the true cross-border price instantly

RiftCompare compares live Riftbound prices across US, UK, AU, NZ, CA, and SG stores plus eBay and TCGplayer — with shipping included — so you can spot when an overseas "deal" is real and when conversion fees erase it. Check [the all-in comparison](${L.dealFinder}) before you buy abroad.`,
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Draft published as-is. The brief's NOTE FOR IMPLEMENTATION is honoured by
  //    `topValue` below: the ranked list is rendered from the live database by
  //    components/ArticleTopValue.tsx, not typed into this body.
  // ───────────────────────────────────────────────────────────────────────────
  {
    slug: "most-expensive-riftbound-cards",
    category: "blog",
    title: "The Most Expensive Riftbound Cards: Top Grails and What Drives Their Prices",
    excerpt:
      "A ranked look at the most expensive Riftbound TCG cards, why Signature and Metal variants command four figures, and how to track live prices with RiftCompare.",
    author: AUTHOR,
    date: PUBLISHED,
    readMins: 9,
    tags: ["collecting", "chase cards", "prices", "investing", "movers"],
    hero: {
      src: "/blog/most-expensive-riftbound-cards.png",
      alt: "The Most Expensive Riftbound Cards — Signature and Metal variants and PSA 10 premiums, on RiftCompare",
    },
    // The live ranking. US market because that's the site's default and the
    // deepest set of listings; the component derives its currency from the same
    // value, so figures and symbol cannot disagree.
    topValue: { country: "US", take: 10 },
    summary: [
      "The most expensive Riftbound cards are almost always **Signature and Metal variants** of popular champions, reaching four figures ungraded.",
      "Four things drive value: **variant treatment, scarcity/pull rate, grade, and meta relevance.**",
      "PSA 10 premiums are large at the top of the market — the grading maths matters far more here than on a $30 card.",
      `Prices move daily, so the ranked table below is generated live from the card database rather than typed in. [Check the movers](${L.movers}) before you buy.`,
    ],
    faq: [
      {
        q: "What is the single most expensive Riftbound card?",
        a: "It varies over time, but Signature variants of flagship champions consistently top the market. The live table on this page shows the current leader across every store we track.",
      },
      {
        q: "Are Metal variants worth more than Signatures?",
        a: "Usually just below the top Signatures, though scarcity and condition can close the gap. Compare live comps.",
      },
      {
        q: "Should I grade a high-value Riftbound card?",
        a: "Often yes for four-figure cards, where the PSA 10 premium exceeds grading costs; rarely for low-value cards.",
      },
      {
        q: "Why do these prices change so fast?",
        a: "Riftbound is a young TCG — tournament results, reprints, and announcements can reprice top cards overnight.",
      },
    ],
    browseCta: {
      href: L.signatures,
      label: "Browse every Signature printing →",
      blurb: "The Signature tier is where the top of the market lives. See every one with a live price.",
    },
    body: `The most expensive Riftbound cards are almost always Signature and Metal variants of popular champions, with the very top of the market reaching into the thousands of dollars ungraded and climbing higher for pristine PSA 10 copies. Prices in this young, fast-moving TCG shift constantly, so treat the tiers below as the durable explanation and **the live table further down as the current answer** — it is generated from the card database each time this page is rebuilt, not written into the article.

## What makes a Riftbound card expensive?

Four factors drive nearly every high-value card:

- **Variant treatment:** [Signature](${L.signatures}), Metal, [Overnumbered](${L.overnumbered}), and [Alternate Art](${L.altArt}) versions carry large premiums over the standard printing of the same champion. The [variant glossary](${L.glossary}) defines each one.
- **Low pull rate / scarcity:** Cards that appear rarely in packs, or limited Organized Play (OP) prize-wall exclusives, are scarce by design. [The box EV calculator](${L.boxEv}) shows what a sealed box is statistically worth once pull rates are accounted for.
- **Grade:** A PSA 10 (Gem Mint) copy of a chase card can sell for well over its raw price. The rarer the card, the bigger the graded premium.
- **Meta relevance:** When a champion anchors a winning tournament deck, demand — and price — can spike quickly.

## The top grails, tier by tier

1. **Signature variants of flagship champions** — the headline grails. Signature versions of the game's most popular champions routinely top the market, reaching well into four figures ungraded, with PSA 10 comps higher still. These are the cards most collectors mean when they ask about the "most expensive Riftbound cards."
2. **Metal variants of chase champions** — premium metallic treatments of sought-after champions sit just below (and sometimes alongside) the Signatures. Their combination of scarcity and visual appeal keeps demand strong.
3. **Overnumbered / serial-numbered rarities** — variants whose serial number exceeds the stated print run create collector scarcity and command strong premiums, especially at low serial numbers.
4. **Alternate Art chase cards** — full-art or alternate-art versions of popular cards, particularly early-set printings, hold high value with collectors.
5. **OP prize-wall exclusives** — limited-distribution promo/prize cards can hold value independent of meta relevance simply because so few copies exist.

For each grail, the price gap between a raw Near Mint copy and a PSA 10 copy is substantial — which is why grading decisions matter so much at this end of the market. [How rarity and printings work](${L.rarity}) explains where each tier sits.

## Why these prices swing so much

Riftbound is early in its lifecycle. Single tournament results, set announcements, reprints, and influencer coverage can reprice a top card overnight. A grail that's climbing this week may cool next week once the meta adjusts or a reprint is announced.

Before paying a premium, check whether a spike reflects durable demand (sustained competitive play, genuine scarcity) or a short-term tournament bump. [The daily movers dashboard](${L.movers}) is the fastest way to tell the difference.

## How to buy a grail without overpaying

- **Confirm the exact variant and collector number.** A standard printing and a Signature of the same champion can differ by thousands.
- **Use sold comps, not ask prices.** Active listings run well above what cards actually clear for — [how to value a Riftbound card](${L.values}) walks through the comp workflow.
- **Decide on grading math up front.** For a four-figure card, a PSA 10 premium often justifies grading; for a $30 card it rarely does.
- **Compare total cost across stores.** The lowest sticker isn't always the lowest landed price once shipping (and, for overseas stores, [currency conversion](${L.fx})) is included.
- **Watch the daily movers.** Buying into a spike often means buying at the top.

RiftCompare pulls live prices for these cards across US, UK, AU, NZ, CA, and SG stores plus eBay and TCGplayer, with shipping included — so you can see the real all-in price of a grail before you commit.

## Key takeaways

- The most expensive Riftbound cards are **Signature and Metal variants of top champions**, reaching four figures ungraded.
- Value is driven by variant treatment, scarcity/pull rate, grade, and meta relevance.
- **PSA 10 premiums are large** at the top of the market — grading math matters.
- Prices move daily; verify live before buying or selling.
- Compare all-in landed cost across stores with RiftCompare to avoid overpaying.

## Track every grail's live price

Don't rely on a stale list. RiftCompare shows real-time prices for the most expensive Riftbound cards across every tracked store and marketplace, with shipping included and a [daily movers dashboard](${L.movers}) so you know whether a grail is rising or cooling.

Browse [the full card database](${L.browse}), dig into [a specific set](${L.sets}) — [Origins](${L.origins}) included — or [search by champion](${L.champions}), then set your [watchlist alerts](${L.alerts}) so the next move finds you instead of the other way round.`,
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 6-9. AI-visibility targets. Each answers ONE query the brand is currently
  //      absent from, answer-first, with a table and a FAQ block.
  // ───────────────────────────────────────────────────────────────────────────
  {
    slug: "best-riftbound-marketplaces",
    category: "blog",
    title: "The 10 Best Riftbound TCG Marketplaces (2026), Compared",
    excerpt:
      "Where to actually buy and sell Riftbound cards in 2026: ten marketplaces compared on coverage, fees, buyer protection and true total cost including shipping.",
    author: AUTHOR,
    date: PUBLISHED,
    readMins: 11,
    tags: ["marketplace", "buying", "selling", "comparison", "price comparison"],
    hero: {
      src: "/blog/best-riftbound-marketplaces.png",
      alt: "The 10 best Riftbound TCG marketplaces compared on fees, shipping and total cost — RiftCompare",
    },
    summary: [
      "**No single marketplace is cheapest for every card.** Which one wins depends on the card's value, your market, and whether shipping is bundled.",
      "For **mid-value singles**, TCGplayer and dedicated card stores usually win; for **scarce chase cards**, auctions on eBay often clear higher and can be bought lower off-peak.",
      "Judge a marketplace on **total cost including shipping**, not sticker price — the ranking changes once shipping is added.",
      `RiftCompare is the comparison layer over these, not a competitor to all of them: [one search](${L.browse}) shows the live price at each.`,
    ],
    faq: [
      {
        q: "What is the best marketplace to buy Riftbound cards?",
        a: "There isn't one best marketplace for every purchase. TCGplayer and specialist card stores usually win on mid-value singles; eBay auctions often produce the best price on scarce chase cards; local stores win when shipping would exceed the card's value. Compare total cost including shipping per card rather than picking a venue by default.",
      },
      {
        q: "Is there a Riftbound price comparison site?",
        a: "Yes. RiftCompare tracks live Riftbound prices across local stores, eBay and TCGplayer in the US, UK, Australia, New Zealand, Canada and Singapore, and shows total cost with shipping included.",
      },
      {
        q: "Which marketplace has the lowest fees for Riftbound sellers?",
        a: "Fees vary by venue and by seller tier. eBay charges a final value fee (commonly around 13.25% for trading cards) on the total including shipping; TCGplayer charges a tiered commission on the item plus separate payment processing; a direct or local sale avoids marketplace commission entirely but costs you reach and buyer protection.",
      },
      {
        q: "Are Riftbound cards cheaper overseas?",
        a: "Sometimes on sticker price, rarely once you add it up. Foreign transaction fees, the exchange-rate markup and international shipping typically add 3–7% plus postage, which erases most cross-border gaps. Compare landed cost, not the listed price.",
      },
    ],
    browseCta: {
      href: L.dealFinder,
      label: "Compare all of them at once →",
      blurb: "One search across every tracked store and marketplace, with shipping included in the total.",
    },
    // Mirrors the visible comparison table exactly, in the same order — an
    // ItemList that disagreed with the table would be markup describing a page
    // that doesn't exist.
    itemList: {
      name: "The 10 best Riftbound TCG marketplaces (2026)",
      items: [
        { name: "TCGplayer", description: "Best for mid-value singles, bulk and set completion. US-centric." },
        { name: "eBay", description: "Best for scarce chase cards, graded slabs and auctions, across most markets." },
        { name: "Specialist local card stores", description: "Best for the newest sets, preorders and no-shipping pickup." },
        { name: "CardMarket", description: "Best for European buyers and sellers." },
        { name: "RiftCompare Marketplace", description: "Peer-to-peer Riftbound singles with escrow.", url: "https://riftcompare.com/marketplace" },
        { name: "Amazon", description: "Convenient for sealed product; weak singles coverage." },
        { name: "Whatnot and live auction apps", description: "Live breaks and impulse buys; easy to overpay in the moment." },
        { name: "Facebook groups and Discord servers", description: "Community trades and hard-to-find promos; no escrow by default." },
        { name: "Mercari and general resale apps", description: "Occasional underpriced listings; inconsistent condition descriptions." },
        { name: "Store webstores direct", description: "Avoids marketplace fees entirely, but you have to check each one." },
      ],
    },
    body: `**Short answer:** there is no single best Riftbound marketplace. The venue that wins depends on the card's value, which country you're in, and whether you're buying one card or twenty. What is consistent is the method — compare *total cost including shipping* across venues for the specific card you want, rather than defaulting to whichever site you used last time.

This page lists the ten places Riftbound cards actually change hands in 2026, what each is genuinely good at, and where each one costs you money you didn't expect.

## The ten marketplaces, compared

| # | Marketplace | Best for | Markets | Watch out for |
| --- | --- | --- | --- | --- |
| 1 | **TCGplayer** | Mid-value singles, bulk, set completion | US-centric (ships internationally) | Tiered seller commission plus separate payment processing; per-order fees make single cheap cards inefficient |
| 2 | **eBay** | Scarce chase cards, graded slabs, auctions | US, UK, AU, CA, SG and more | Final value fee commonly around 13.25% for trading cards, applied to the total *including* shipping |
| 3 | **Specialist local card stores** | Newest sets, preorders, no-shipping pickup | Every tracked market | Stock is thin outside launch windows; prices vary widely store to store |
| 4 | **CardMarket** | European buyers and sellers | EU/UK | Its own commission structure; less relevant outside Europe |
| 5 | **RiftCompare Marketplace** | Peer-to-peer singles with escrow | Where enabled | A newer, smaller pool than the giants — [how buyer protection works](${L.buyerProtection}) |
| 6 | **Amazon** | Sealed product convenience | Broad | Third-party sellers vary in reliability; singles coverage is poor |
| 7 | **Whatnot / live auction apps** | Live breaks and impulse buys | US-led | Auction psychology; easy to pay above market in the moment |
| 8 | **Facebook groups and Discord servers** | Community trades, hard-to-find promos | Global | No escrow by default; verify the seller and use protected payment |
| 9 | **Mercari and general resale apps** | Occasional underpriced listings | Market-dependent | Weak card-specific search; condition descriptions are inconsistent |
| 10 | **Store webstores direct** | Avoiding marketplace fees entirely | Every tracked market | You have to check each one — which is the problem RiftCompare exists to solve |

## How to read that table

Three things matter more than the ordering.

**Coverage is not the same as price.** A marketplace with a million listings still might not have your exact printing in Near Mint at a fair number. [Search by set](${L.sets}) or [by champion](${L.champions}) and check what's actually in stock before deciding a venue is "cheapest".

**Shipping changes the ranking.** A $6 card at one store and a $7 card at another are not $1 apart if the first charges $5 postage. This is the single most common way buyers overpay, and it's why every figure RiftCompare shows is a total including shipping.

**Fees are the seller's problem and the buyer's price.** Marketplaces with higher seller fees tend to carry higher sticker prices, because sellers price to a net. [The TCGplayer fee breakdown](${L.fees}) shows how that maths works.

## Where each type of buyer should start

- **Casual players** buying a handful of singles: start with [the deal finder](${L.dealFinder}) and buy from whichever store wins on total cost. Local stores often win because shipping is short.
- **Competitive players** assembling a decklist: use [Best Basket](${L.bestBasket}), which works out the cheapest way to split one wantlist across stores rather than optimising card by card.
- **Collectors** chasing Signature and Metal printings: watch auctions, and read [the most expensive Riftbound cards](${L.grails}) for what drives those premiums.
- **Parents** buying a first deck: a starter product from a local store beats any singles strategy. [Where to buy Riftbound cards](${L.whereToBuy}) covers the sensible starting points.
- **Store owners** monitoring the field: [see every store we track](${L.tracked}) and [how store price tracking works](${L.stores}).

## Where RiftCompare fits

RiftCompare is not a marketplace competing with the ten above for most purchases — it's the comparison layer over them. It tracks live prices across local stores, eBay and TCGplayer in the US, UK, Australia, New Zealand, Canada and Singapore, and shows the transparent total cost including shipping, with no hidden fees. One search replaces ten tabs.

It does also run [its own peer-to-peer marketplace](${L.marketplaceVsStores}) with escrow, which is entry 5 above and is held to the same comparison as everything else.

## Key takeaways

- **No venue wins every time** — compare per card, not per site.
- **Total cost including shipping** is the only number that ranks venues honestly.
- Auctions favour scarce cards; fixed-price marketplaces favour mid-value singles.
- Cross-border "deals" are usually erased by [FX and shipping](${L.fx}).
- Use one comparison across all of them rather than checking each in turn.

Next: [how to choose a Riftbound marketplace](${L.choosing}) turns this into a seven-point checklist you can apply to any venue, and [Riftbound card price comparison](${L.comparison}) explains what the numbers actually mean.`,
  },

  {
    slug: "riftbound-card-price-comparison",
    category: "blog",
    title: "Riftbound Card Price Comparison: How to Find the Real Lowest Price",
    excerpt:
      "How Riftbound card price comparison actually works — sticker price vs total cost, which markets are tracked, and how to find the genuinely cheapest place to buy.",
    author: AUTHOR,
    date: PUBLISHED,
    readMins: 8,
    tags: ["price comparison", "buying", "prices", "tools"],
    hero: {
      src: "/blog/riftbound-card-price-comparison.png",
      alt: "Riftbound card price comparison across six markets with shipping included — RiftCompare",
    },
    summary: [
      "**Compare total cost, not sticker price.** Shipping regularly reorders the results — the cheapest listing is often not the cheapest purchase.",
      "RiftCompare tracks local stores, eBay and TCGplayer across **six markets**: US, UK, Australia, New Zealand, Canada and Singapore.",
      "Confirm the **collector number and variant** before comparing; two printings of the same champion are different products at different prices.",
      `Buying several cards? Compare the **basket**, not each card — [Best Basket](${L.bestBasket}) minimises the combined shipping.`,
    ],
    faq: [
      {
        q: "How do I compare Riftbound card prices?",
        a: "Search the exact card by collector number and variant, then compare the total cost including shipping across every store and marketplace that has it in stock. RiftCompare does this in one search across local stores, eBay and TCGplayer in six markets.",
      },
      {
        q: "Which countries does RiftCompare cover?",
        a: "The United States, the United Kingdom, Australia, New Zealand, Canada and Singapore. Prices are shown in each market's own currency.",
      },
      {
        q: "Does the comparison include shipping?",
        a: "Yes. The comparison shows transparent total cost including shipping, because a lower sticker price with higher postage is frequently the more expensive purchase.",
      },
      {
        q: "Is RiftCompare free to use?",
        a: "Yes. Browsing the card database, comparing prices and setting price alerts are free. Premium unlocks the full deal and value-finder lists rather than the single best row.",
      },
      {
        q: "How often do the prices update?",
        a: "Prices are re-imported from tracked stores and marketplaces on a regular schedule, and the daily movers dashboard shows what changed. Riftbound reprices fast, so daily data matters more here than in older TCGs.",
      },
    ],
    browseCta: {
      href: L.browse,
      label: "Compare a card now →",
      blurb: "Search any Riftbound card and see every tracked store's total cost side by side.",
    },
    body: `**Short answer:** Riftbound card price comparison means checking the *total cost including shipping* for one exact printing across every store and marketplace that stocks it — not comparing sticker prices across a few tabs. The cheapest listing and the cheapest purchase are different things surprisingly often.

## The four numbers that make a comparison honest

| Number | Why it matters | What goes wrong without it |
| --- | --- | --- |
| Item price | The headline figure | On its own it ranks stores wrongly |
| Shipping | Frequently 20–80% of a cheap card's cost | A $2 card with $6 postage looks like the winner |
| Currency | Each market prices in its own | Comparing GBP to USD by eye overstates or understates every row |
| Stock status | An out-of-stock low price isn't a price | The "cheapest" result is unbuyable |

RiftCompare shows all four, in each market's own currency, and ranks by the total.

## Confirm the printing before you compare

Riftbound prints the same champion in several treatments, and they are not substitutes. Standard, foil, [Signature](${L.signatures}), Metal, [Overnumbered](${L.overnumbered}) and [Alternate Art](${L.altArt}) printings can differ by orders of magnitude. Always compare by collector number, and check [the variant glossary](${L.glossary}) if the card in front of you has markings you don't recognise.

The fastest way to land on the right printing is [browsing the set](${L.sets}) — for example [Origins](${L.origins}) — or [searching by champion](${L.champions}).

## The six markets, and why the cheapest is often local

RiftCompare tracks the US, UK, Australia, New Zealand, Canada and Singapore. Each has its own set of stores, its own currency, and its own eBay and TCGplayer coverage — start from your market's guide: [US](${L.us}), [UK](${L.uk}), [AU](${L.au}), [NZ](${L.nz}), [CA](${L.ca}), [SG](${L.sg}).

It's tempting to shop the global minimum, but a cheaper sticker abroad usually loses once you add international postage, your card's foreign transaction fee and the exchange-rate markup — typically 3–7% before shipping. [Currency conversion fees](${L.fx}) covers the full arithmetic.

## Comparing a basket, not a card

If you're buying eight cards, comparing each one independently gives you eight orders and eight shipping charges. The cheaper answer is almost always a smaller number of orders. [Best Basket](${L.bestBasket}) solves for that: the cheapest *combination* of stores for one wantlist, shipping included.

## When the cheapest price isn't the right buy

- **The price is mid-spike.** [Check the movers](${L.movers}) — a card that just jumped 40% on a tournament result often settles back.
- **The seller is new and the card is expensive.** Buyer protection is worth more than a few dollars of saving.
- **It's an auction, not a fixed price.** The current bid is not the price you'll pay; [set a maximum first](${L.bidding}).
- **You're comparing to a price you remember.** Use current data. [Why Riftbound prices change](${L.whyPricesChange}) explains how quickly they move.

## Key takeaways

- Compare **total cost including shipping**, in one currency, for one exact printing.
- Six markets are tracked; the cheapest is usually your own once postage is counted.
- Buying several cards? Compare the **basket**.
- Set [a price alert](${L.alerts}) instead of refreshing — most cards are worth waiting a week for.

Related: [the 10 best Riftbound marketplaces](${L.marketplaces}), [how to choose one](${L.choosing}), and [what a RiftCompare search actually gives you](${L.review}).`,
  },

  {
    slug: "riftcompare-review",
    category: "blog",
    title: "RiftCompare Review: An Honest Look at the Riftbound Price-Comparison Tool",
    excerpt:
      "A straight review of RiftCompare — what the Riftbound TCG price comparison tool does well, what it doesn't do, who it suits, and how it compares to checking stores yourself.",
    author: AUTHOR,
    date: PUBLISHED,
    readMins: 8,
    tags: ["marketplace", "about", "price comparison", "tools", "comparison"],
    hero: {
      src: "/blog/riftcompare-review.png",
      alt: "RiftCompare reviewed — what the Riftbound price comparison tool does, what it doesn't, and who it's for",
    },
    summary: [
      "**What it is:** a free price-comparison tool for Riftbound TCG cards across local stores, eBay and TCGplayer in six markets, showing total cost with shipping.",
      "**Best for:** anyone buying more than an occasional card, and collectors tracking Signature/Metal printings.",
      "**Not for:** buying directly in most cases — RiftCompare sends you to the store; it isn't trying to be the shop for every purchase.",
      "**Honest limitation:** coverage is only as good as the stores tracked in your market, and a card with no listings shows no price rather than a guess.",
    ],
    faq: [
      {
        q: "What is RiftCompare?",
        a: "RiftCompare is a price-comparison tool for Riftbound TCG cards. It tracks live prices across local stores, eBay and TCGplayer in the US, UK, Australia, New Zealand, Canada and Singapore, and shows the transparent total cost including shipping.",
      },
      {
        q: "Is RiftCompare free?",
        a: "Yes. The card database, price comparison, movers dashboard and price alerts are free. Premium unlocks the full deal-finder and value-finder lists instead of the single best row.",
      },
      {
        q: "Does RiftCompare sell cards?",
        a: "Mostly no — it links you to the store or marketplace with the best total price. It also runs an optional peer-to-peer marketplace with escrow, which appears in the comparison on the same terms as everyone else.",
      },
      {
        q: "How accurate are RiftCompare's prices?",
        a: "Prices come from tracked store feeds and marketplace data and are re-imported on a schedule. Where a card has no live listing in your market, the tool shows no price rather than estimating one.",
      },
      {
        q: "Who is RiftCompare for?",
        a: "Casual players buying singles, competitive players assembling decklists, collectors tracking chase printings, parents buying starter products, and store owners monitoring the market.",
      },
    ],
    browseCta: {
      href: L.browse,
      label: "Try it on a card you own →",
      blurb: "The fastest way to judge a price-comparison tool is to run a card you already know the price of.",
    },
    body: `**Short answer:** RiftCompare is a free Riftbound TCG price-comparison tool that shows the total cost — including shipping — of one card across local stores, eBay and TCGplayer in six markets. It's most useful if you buy singles regularly or track chase printings; it's least useful if you buy one starter deck a year from the shop down the road.

This is our own tool, so treat this page as a spec sheet with the limitations included rather than an independent review. The claims below are all checkable in about a minute — run a card you already know the price of.

## What it does

| Capability | What that means in practice | Where |
| --- | --- | --- |
| Cross-store price comparison | Every tracked store's live price for one printing, ranked by total cost | [Card database](${L.browse}) |
| Shipping included | Totals, not stickers, so the ranking is honest | Every price surface |
| Six markets | US, UK, AU, NZ, CA, SG, each in its own currency | [Guides per market](${L.us}) |
| Daily movers | What went up and down, and by how much | [Movers](${L.movers}) |
| Deal finder | Where the same card is meaningfully cheaper than the market | [Deal Finder](${L.dealFinder}) |
| Basket optimisation | Cheapest split of a wantlist across stores | [Best Basket](${L.bestBasket}) |
| Sealed EV | What a box is worth against singles | [Box EV](${L.boxEv}) |
| Price alerts | Told when a card hits your number | [Alerts](${L.alerts}) |
| Trade valuation | Both sides of a swap at live prices | [Trade calculator](${L.trade}) |

## What it doesn't do

Being specific about this is more useful than another feature list.

- **It isn't a shop for most purchases.** For the great majority of cards it hands you off to the store or marketplace with the best total. That's the design, not a gap.
- **It can't price a card nobody is selling.** If your market has no live listing for a printing, you get "no price yet", not an estimate. That's deliberate — a made-up number is worse than an honest blank.
- **It doesn't track graded slabs as a separate market.** Raw and graded copies are different products; for PSA comps you still want completed listings on eBay. [How to value a card](${L.values}) covers that workflow.
- **Coverage varies by market.** The US and Australia are deepest; smaller markets have fewer stores, so fewer rows to compare.
- **It isn't a substitute for judgement.** The cheapest listing can still be a bad buy — mid-spike, a brand-new seller, or the wrong variant.

## Who it's for

- **Casual players** — worth it the first time shipping costs you more than the card.
- **Competitive players** — the basket optimiser is the feature that pays for itself on a full decklist.
- **Collectors** — [Signature](${L.signatures}) and [Overnumbered](${L.overnumbered}) tracking plus alerts; see [the most expensive cards](${L.grails}).
- **Parents buying a first deck** — honestly, one trip to a local store is fine. Use [where to buy](${L.whereToBuy}) and skip the optimisation.
- **Store owners** — [price monitoring across the market](${L.stores}), and [the full tracked-store list](${L.tracked}).

## How it compares to doing it yourself

Checking five stores by hand is free and takes about ten minutes per card, and you'll usually miss the shipping arithmetic. A comparison tool's whole value is that it does the boring part consistently. The honest counterpoint: if you buy two cards a year, ten minutes twice a year is not a problem worth solving.

## Verdict

If you buy Riftbound singles more than occasionally, it removes a genuinely annoying manual step and will find you a cheaper total more often than not. If you buy sealed product locally once a set, it's a bookmark, not a habit.

Related reading: [the 10 best Riftbound marketplaces](${L.marketplaces}), [how to choose a marketplace](${L.choosing}), and [how price comparison actually works](${L.comparison}).`,
  },

  {
    slug: "how-to-choose-a-riftbound-marketplace",
    category: "blog",
    title: "How to Choose a Riftbound Card Marketplace: A 7-Point Checklist",
    excerpt:
      "Seven criteria for picking where to buy Riftbound cards — total cost, coverage, buyer protection, shipping, fees, condition accuracy and dispute handling.",
    author: AUTHOR,
    date: PUBLISHED,
    readMins: 8,
    tags: ["marketplace", "buying", "comparison", "tips", "price comparison"],
    hero: {
      src: "/blog/how-to-choose-a-riftbound-marketplace.png",
      alt: "How to choose a Riftbound card marketplace — a seven-point checklist with a scorecard, on RiftCompare",
    },
    summary: [
      "Score every venue on **seven things**: total cost, stock coverage, buyer protection, shipping speed and cost, fees, condition accuracy, and dispute handling.",
      "**Total cost including shipping** outranks everything else for cards under about $20; **buyer protection** outranks everything else above about $100.",
      "A marketplace that can't tell you the exact printing you're buying is the wrong marketplace for chase cards.",
      `Don't pick a venue and stick to it — pick per purchase. [Compare them all in one search](${L.dealFinder}).`,
    ],
    faq: [
      {
        q: "How do I choose where to buy Riftbound cards?",
        a: "Score the venue on total cost including shipping, whether it actually stocks your exact printing, buyer protection, shipping cost and speed, fees, condition-description accuracy, and how disputes are handled. For cheap cards weight total cost hardest; for expensive cards weight buyer protection hardest.",
      },
      {
        q: "Is it safer to buy from a store or a marketplace?",
        a: "A specialist store is usually more predictable on condition and packaging; a large marketplace usually has better formal buyer protection. For high-value cards, prefer whichever gives you a verifiable dispute process and pay with a protected method.",
      },
      {
        q: "What should I check before buying a high-value Riftbound card?",
        a: "Confirm the exact collector number and variant, look at photos of all four corners and edges, check the seller's feedback history, avoid stock photos, verify any grading cert number, and compare the total landed cost against other venues.",
      },
      {
        q: "Do I need an account to compare Riftbound prices?",
        a: "No. Browsing and comparing prices on RiftCompare is free and needs no account; an account only adds watchlists, alerts and portfolio tracking.",
      },
    ],
    browseCta: {
      href: L.dealFinder,
      label: "Score them all at once →",
      blurb: "One comparison across every tracked store and marketplace, with shipping in the total.",
    },
    body: `**Short answer:** choose per purchase, not once. Score each candidate venue against seven criteria, weight them by the card's value, and buy from whichever wins *for that card*. Below is the checklist, the weighting, and the red flags that should end a purchase regardless of price.

## The 7-point checklist

| # | Criterion | The question to ask | Weight it most when |
| --- | --- | --- | --- |
| 1 | Total cost | What's the price *with shipping*, in my currency? | The card is cheap — postage dominates |
| 2 | Coverage | Does it actually stock my exact printing, in stock, now? | You need a specific variant |
| 3 | Buyer protection | If it never arrives, or it's not as described, what happens? | The card is expensive |
| 4 | Shipping | How much, how fast, and is it tracked? | You need it for an event |
| 5 | Fees | What does the seller pay, and is it priced into the sticker? | You're selling, not buying |
| 6 | Condition accuracy | Is the grade described consistently, with real photos? | Buying raw Near Mint or better |
| 7 | Disputes | Is there a written process, or just goodwill? | Any purchase over ~$100 |

## How to weight it by card value

- **Under about $20:** criterion 1 dominates. Shipping is usually a larger share of the cost than any price difference between venues, so buy from whoever is cheapest all-in — often a local store. [Compare totals here](${L.dealFinder}).
- **$20–$100:** balance 1, 2 and 6. Condition matters now; a "Near Mint" that arrives lightly played is a real loss.
- **Over $100:** criteria 3, 6 and 7 dominate. Saving $8 is not worth a venue with no dispute process. This is the range where [Signature and Metal printings](${L.grails}) live.

## Red flags that should end the purchase

- Stock photos on a raw, high-value card.
- A brand-new seller account listing an expensive chase card.
- Vague or missing shipping and returns information.
- A grading claim with no verifiable cert number.
- Repeated bid retractions from the same bidder on an auction — see [eBay bidding strategies](${L.bidding}).
- A price far below every other listing for the same printing. Check you're comparing the *same* printing first: [variant glossary](${L.glossary}).

## Get the printing right before anything else

More money is lost to buying the wrong printing than to picking the wrong venue. Riftbound's standard, foil, [Signature](${L.signatures}), Metal, [Overnumbered](${L.overnumbered}) and [Alternate Art](${L.altArt}) treatments look similar in a thumbnail and are priced nothing alike. Confirm the collector number, then compare. [How rarity and printings work](${L.rarity}) is the background.

## A worked example

You want a mid-value single for a tournament on Saturday.

1. Confirm the printing by collector number — [browse the set](${L.sets}) or [the champion](${L.champions}).
2. Compare total costs across venues in your market ([US](${L.us}), [UK](${L.uk}), [AU](${L.au}), [NZ](${L.nz}), [CA](${L.ca}), [SG](${L.sg})).
3. Drop any venue that can't deliver before Saturday — criterion 4 outweighs a small saving here.
4. Of what's left, take the lowest total from a seller with real photos and a feedback history.
5. Buying the rest of the deck too? Run [Best Basket](${L.bestBasket}) instead of steps 2–4 per card.

## Key takeaways

- Choose **per purchase**, weighted by card value.
- **Total cost including shipping** is the tiebreaker for cheap cards; **buyer protection** is the tiebreaker for expensive ones.
- Confirm the printing before comparing anything.
- No venue wins every time — which is why the comparison, not the venue, is the habit worth having.

Related: [the 10 best Riftbound marketplaces](${L.marketplaces}), [Riftbound card price comparison explained](${L.comparison}), and [an honest look at RiftCompare itself](${L.review}).`,
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 10. The glossary the other articles link to when they say "confirm the
  //     exact variant". Published as a guide — it's evergreen reference.
  // ───────────────────────────────────────────────────────────────────────────
  {
    slug: "riftbound-variant-glossary",
    category: "guide",
    title: "Riftbound Variant & Finish Glossary: Standard, Foil, Signature, Metal, Overnumbered, Alternate Art",
    excerpt:
      "Every Riftbound card treatment defined in one place — standard, foil, Signature, Metal, Overnumbered and Alternate Art — and how to tell them apart before you buy.",
    author: AUTHOR,
    date: PUBLISHED,
    readMins: 6,
    tags: ["collecting", "rarity", "printings", "guide", "chase cards"],
    hero: {
      src: "/blog/riftbound-variant-glossary.png",
      alt: "Riftbound variant and finish glossary — standard, foil, Signature, Metal, Overnumbered and alternate art",
    },
    summary: [
      "**The collector number is the identifier**, not the card name. A `*` marks a Signature; a number above the set total marks an Overnumbered print.",
      "**Standard and foil** are the base printings; **Signature, Metal, Overnumbered and Alternate Art** are the premium treatments that carry the price gaps.",
      "Two printings of the same champion can differ by orders of magnitude — confirm the treatment before you compare prices.",
      `Browse each treatment live: [Signature](${L.signatures}) · [Overnumbered](${L.overnumbered}) · [Alternate Art](${L.altArt}).`,
    ],
    faq: [
      {
        q: "What is a Riftbound Signature card?",
        a: "A Signature printing carries a stamped artist signature and a collector number containing an asterisk (for example 191*/166). Signatures sit at the top of the Riftbound market and are the printings most often meant by 'chase card'.",
      },
      {
        q: "What does Overnumbered mean in Riftbound?",
        a: "An Overnumbered card carries a collector number higher than the set's stated total — for example 197/166. The number itself signals a print outside the base set, which is why these command a premium.",
      },
      {
        q: "What's the difference between Alternate Art and Showcase?",
        a: "Both are non-standard artwork for a card. Showcase is a rarity tier that is itself an alternate art, so a Showcase card isn't additionally labelled Alternate Art; Alternate Art refers to a variant printing of a card whose base version uses different artwork.",
      },
      {
        q: "How do I tell which variant I'm holding?",
        a: "Read the collector number first. An asterisk means Signature; a number above the set total means Overnumbered; a trailing letter (for example 021a) means a variant printing. Then check the finish — foil and metallic treatments are visible under angled light.",
      },
    ],
    browseCta: {
      href: L.browse,
      label: "Find your exact printing →",
      blurb: "Search by collector number to land on the right variant, with live prices from every tracked store.",
    },
    body: `Riftbound prints the same champion in several treatments, and they are not interchangeable. A standard printing and a Signature of the same card can differ by thousands. This page defines each treatment and, more usefully, tells you how to identify it from the card in your hand.

## The treatments at a glance

| Treatment | How to identify it | Roughly where it sits on price |
| --- | --- | --- |
| **Standard** | Plain collector number within the set total (e.g. 058/298), no special finish | The baseline |
| **Foil** | A reflective finish over standard artwork | A modest premium over standard |
| **Signature** | Collector number contains an asterisk (e.g. 191\\*/166), stamped artist signature | Top of the market |
| **Metal** | Premium metallic treatment of a chase champion | Just below, sometimes alongside, top Signatures |
| **Overnumbered** | Collector number exceeds the set total (e.g. 197/166), or an SP-prefixed special number | Strong premium, higher at low serials |
| **Alternate Art** | A variant letter on the number (e.g. 021a) or visibly different artwork from the base print | Varies; early-set alt arts hold value well |

## Reading a collector number

The collector number is the only field that unambiguously identifies a printing, which is why every price lookup should start there rather than with the card name.

- \`058/298\` — card 58 of a 298-card set. A standard print.
- \`021a/298\` — the same slot with a variant letter: an alternate-art printing.
- \`191*/166\` — the asterisk marks a **Signature**.
- \`197/166\` — numbered above the set total: **Overnumbered**.
- \`SP01\` — a special/serial-numbered print, treated as Overnumbered for classification.

## Why this matters for pricing

Price-comparison results are only meaningful within a single printing. Comparing a Signature's asking price against a standard print's is not a comparison, it's a category error — and it's the most common reason someone thinks they've found an incredible deal.

When you look a card up, confirm the collector number, then compare. [How Riftbound price comparison works](${L.comparison}) covers the rest of the method, and [how to value a card](${L.values}) covers sold comps and graded premiums.

## Rarity is a different axis

Treatment and rarity are separate things. A card has a rarity tier (Common, Uncommon, Rare, Epic, Showcase) *and* a treatment. Showcase is the one that blurs the line, because a Showcase card is itself an alternate art — which is why it isn't additionally labelled Alternate Art.

For the rarity side, read [understanding Riftbound card rarity and printings](${L.rarity}).

## Browse each treatment live

- [Every Signature printing](${L.signatures}) — the top of the market.
- [Every Overnumbered printing](${L.overnumbered}).
- [Every Alternate Art printing](${L.altArt}).
- [The full card database](${L.browse}), or [by set](${L.sets}) and [by champion](${L.champions}).

Chasing these deliberately? [The most expensive Riftbound cards](${L.grails}) explains what drives the premiums, and [pull rates and box EV](${L.boxEvGuide}) covers whether opening product is a sane way to find them.`,
  },
];
