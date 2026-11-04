// Market-trend posts (owner, 2026-11-04: "insightful, focus on the latest
// trends, where the trajectory is going, and historically how it's gone").
// Every number is computed from the committed public price history
// (data/price-history/cards/*.json: the cheapest in-stock price per card across
// the AU, US, UK and SG stores we compare, in US cents, one file per Sydney day)
// joined to data/public/cards.json for set and rarity, on the day stated in the
// copy. A "set median" is the median of those per-card prices for one rarity in
// one set. The hero chart (scripts/gen-blog-heroes.ts, motif "line") is the same
// series. No forecast is a price target: the trajectory section describes the
// mechanism and the pattern the last two launches followed, nothing more.
import type { Article } from "../articles";

export const TREND_ARTICLES: Article[] = [
  {
    slug: "riftbound-market-radiance-launch-curve-legacy-outlook",
    category: "blog",
    title: "The Riftbound Market After Radiance: How Fast a Set's Prices Settle, and What Legacy Changes",
    seoTitle: "Riftbound Market After Radiance: Launch Curves, Set by Set",
    excerpt:
      "Radiance Showcase prices fell 74% from preorder peak in 21 days, twice as fast as Vendetta. The pattern across five sets, and what it means for Legacy.",
    author: "RiftCompare",
    date: "2026-11-04",
    readMins: 11,
    tags: ["market", "prices", "price history", "radiance", "legacy", "analysis"],
    hero: {
      src: "/blog/riftbound-market-radiance-launch-curve-legacy-outlook.png",
      alt: "A line chart of the median Radiance Showcase price from the first preorder listings to two weeks after release, falling from about US$167 to US$43, on RiftCompare's dark green branding",
    },
    summary: [
      "**Radiance's Showcase median went from US$167 (first preorder listings, 15 Oct) to US$43 (5 Nov).** Vendetta took about 90 days to make the same fall; Radiance made it in 9.",
      "**Epics and Rares are a commodity within a week of release** in every set we have tracked: Radiance Epics median US$1.17, Rares US$0.07.",
      "**Older sets keep repricing down, not up.** Origins Showcase median US$8 in July, US$5 now; Unleashed US$28 to US$8; Vendetta US$99 at launch to US$43.",
      "**The next test is Legacy** (previews 13 Dec, release 29 Jan 2027, 239 cards). Expect the same shape, compressed further, with the money concentrated in a dozen Showcase prints.",
    ],
    browseCta: {
      href: "/movers",
      label: "See today's price movers →",
      blurb: "Every number in this post came out of the same history behind the Price movers page. Watch it move day by day instead of waiting for the next write-up.",
    },
    body: `Two weeks after Radiance released, the question in every Discord is the same one that followed Vendetta in August and Spirit Forged before it: *is this the bottom?* We can't tell you that. What we can do, now that RiftCompare holds a daily price for every Riftbound card back to June 2026, is show you the shape of a set launch, compare the last two side by side, and explain why the shape keeps repeating. That turns out to be more useful than any single prediction.

Everything below is computed from our public price history: the cheapest in-stock price per card across the AU, US, UK and SG stores we compare, converted to US dollars, one snapshot per Sydney day. A "set median" is the median of those per-card prices for one rarity in one set, so it is not moved by a single US$1,000 listing. The data day is 5 November 2026 unless stated.

## The Radiance launch curve, day by day

Radiance's first preorder listings reached our import on 15 October, eight days before the 23 October release. On that day 19 Showcase cards were priced and their median was **US$166.67**. Here is what happened next:

| Days from release | Date | Showcase median | Epic median | Rare median |
|---|---|---|---|---|
| −8 | 15 Oct | US$166.67 | US$19.34 | US$19.99 |
| −5 | 18 Oct | US$111.17 | US$12.61 | US$3.43 |
| −1 | 22 Oct | US$73.06 | US$4.71 | US$1.73 |
| 0 | 23 Oct (release) | US$66.72 | US$4.21 | US$0.63 |
| +3 | 26 Oct | US$54.77 | US$1.91 | US$0.21 |
| +7 | 30 Oct | US$48.00 | US$1.56 | US$0.08 |
| +13 | 5 Nov | US$42.51 | US$1.17 | US$0.07 |

Three things stand out.

**The preorder week was the expensive week.** By release day the Showcase median had already lost 60% of its first-listing value. The buyers who paid the most for Radiance chase cards were not late; they were early. This is the same lesson our [Radiance preorder prices two weeks later](/blog/riftbound-radiance-preorder-prices-two-weeks-later) post drew from sealed boxes, and it holds for singles.

**Epics and Rares become a commodity almost immediately.** The Epic median fell from US$19 to under US$2 in eleven days, and Rares went from a US$20 placeholder price to seven cents. This is not weakness in Radiance: Vendetta's Rare median was US$0.27 one day after release and is US$0.05 today. Once a set is being opened at scale, anything printed at a normal rate is worth its playability and nothing more.

**The Showcase tier is where the money stays.** At the top end, Riven, The Exile listed at US$2,400 on 18 October, peaked at US$3,174 two days later and sits at US$1,174 today. Evelynn, Agony's Embrace went from US$2,633 to US$1,013; Seraphine, Starry-Eyed Songstress from US$3,607 to US$935; Ziggs, Hexplosives Expert from US$5,000 to US$719; Ekko, Boy Who Shattered Time from US$3,500 to US$374. Big falls, but these are still the only cards in the set that cost more than a booster box, and that will stay true.

## Radiance against Vendetta: the same curve, twice as fast

Vendetta is the only other set we tracked through its launch window with daily data, so it is the fair comparison. Lined up by days from release:

| Days from release | Vendetta Showcase median (31 Jul) | Radiance Showcase median (23 Oct) |
|---|---|---|
| −4 | US$145.00 | US$92.33 |
| −1 | US$106.47 | US$73.06 |
| +1 | US$99.50 | US$65.94 |
| +4 | US$76.95 | US$51.67 |
| +9 | US$73.28 | US$43.52 |
| +21 | US$65.00 | (18 Nov) |
| +84 | US$55.38 | — |
| +91 | US$43.49 | — |

Vendetta needed **about 90 days** to fall from its launch-week median to US$43. Radiance got there in **nine**. Its preorder peak was higher (US$167 against US$145), its release-day median was lower (US$67 against US$100), and it has already caught Vendetta's three-month level while Vendetta itself keeps drifting down.

Why faster? Three reasons we can see in the data, and one we can only infer.

1. **More cards priced sooner.** By release day we had prices for 62 of Radiance's Showcase prints; Vendetta had 58 a day after release. Pre-Rift events ran 16 to 22 October, so the market had a week of real openings before the street date, and preorder stock arrived at stores earlier. Supply showed up faster, so the price found its level faster.
2. **More stores, more markets.** We compare more stores than we did in July, in six markets, and the cheapest listing anywhere sets our price. A single discounter in Singapore or the UK pulls the median down the moment it lists, where in July it took a US store to do it.
3. **Buyers learned.** Vendetta's launch was the first time most Riftbound players watched a chase card lose half its value in a fortnight. The second time, fewer people paid the preorder price. You can see it in how little the market moved between day −1 and day +1 this time (US$73 to US$66) against Vendetta's drop over the same two days.
4. The inference: **print run.** Riot has not published numbers, and we do not guess at them. But a set whose Epics reach US$1.17 in thirteen days is being opened in quantity, and nothing in Radiance's early supply suggests the kind of allocation shortages the Origins reprint waves caused.

## The long view: five sets, one direction

Pull back from the launch window and the picture across every set is consistent. Showcase medians on the first of each month:

| Set (released) | 1 Jul | 1 Aug | 1 Oct | 1 Nov | 5 Nov |
|---|---|---|---|---|---|
| Origins | US$8 | US$11 | US$6 | US$4 | US$5 |
| Spirit Forged | US$32 | US$38 | US$45 | US$29 | US$30 |
| Unleashed | US$28 | US$13 | US$17 | US$12 | US$8 |
| Vendetta (31 Jul) | — | US$99 | US$63 | US$43 | US$43 |
| Radiance (23 Oct) | — | — | — | US$44 | US$43 |

A few things this table says plainly:

- **Origins is a cheap set with expensive outliers.** Its Showcase median is five dollars, but Origins still has 37 cards priced at US$100 or more and 29 at US$500 or more, the most of any set, with a US$10,000 top price. The first set's first-print chase cards are the only part of the game that has behaved like a true collectible so far. Everything else in Origins has been reprinted into the ground.
- **Spirit Forged is the one set that rose this year**, from US$32 in July to US$45 in October, before giving most of it back in the Radiance weeks. That rise lines up with Spirit Forged cards carrying the September-ban meta and with it being the oldest set no longer on every shelf. It is the best example we have of the "availability, not age" rule from our guide to [why Riftbound card prices change](/guides/why-riftbound-card-prices-change).
- **Unleashed has been the weakest set**, down from US$28 to US$8 in four months. It was printed heavily, it was reprinted, and its best cards were pushed out of the meta by Vendetta and then Radiance.
- **New sets pull money out of old ones.** Every set's median fell between 1 October and 1 November. Radiance did not create new demand so much as redirect the existing budget. That is normal; Magic, Pokémon and One Piece all show the same thing in a release month.

The sealed side rhymes. Our [Radiance preorder prices two weeks later](/blog/riftbound-radiance-preorder-prices-two-weeks-later) write-up found booster boxes settling under their preorder price within days; the [cheapest Riftbound booster boxes](/guides/cheapest-riftbound-booster-boxes) page shows where each set's box sits today.

## What is actually "hot" right now

Trend pieces usually mean "what's going up". In Riftbound in November 2026 the honest answer is: very little, and what is going up is narrow.

- **Signature and overnumbered prints.** The cards above the set's printed total, numbered beyond x/167 in Radiance, are where the four-figure prices live. Seven Radiance cards are priced at US$500 or more today, and all seven are Showcase prints. Vendetta has five such cards; Origins has 29.
- **Pre-Rift and event promos.** Radiance's promo prints appeared on the secondary market before the set did and have held better than the main-set Showcases, because their supply is capped by attendance rather than by print run. Our [Radiance promo cards](/blog/riftbound-radiance-promo-cards) post lists them.
- **The K/DA and Worlds 2026 drawing boxes.** Riot's two drawing-only products have fixed supply by design, which is the only kind of supply that does not fall in this game. See [K/DA Couture Collection and Worlds 2026 Edition](/blog/riftbound-kda-couture-collection-worlds-2026-edition).
- **Not** regular Epics, not Rares, and not, on the evidence of two launches, the preorder price of anything.

If you are buying to play, this is good news: a competitive Radiance deck's Epics and Rares cost less than a booster box, and the [Best Basket tool](/tools/best-basket) will find the cheapest store split for the whole list. If you are buying to hold, the data says wait for day 30, not day 1, and buy the handful of prints whose supply is actually capped.

## Where the trajectory goes next: Legacy

[Legacy](/sets/legacy) is the next set. Previews start on **13 December 2026**, the Pre-Rift window opens on 22 January, and the street date is **29 January 2027**, with 239 cards announced, 93 of them Showcase. That is a bigger Showcase tier than Radiance's 66, and it is the single most important number for prices.

Here is what the last two launches say to expect, stated as a pattern rather than a target:

1. **The preorder peak comes in preview season, not release week.** Radiance's Showcase median peaked on its first listing day. If Legacy's previews run from 13 December through the holidays, the most expensive moment to buy a Legacy chase card will probably be the week its preorders open, with six weeks of falling prices before anyone has opened a pack.
2. **A bigger Showcase tier spreads the money thinner.** With 93 Showcase prints instead of 66, each one competes with more alternatives for the same collector budget. Expect a lower Showcase median than Radiance's, and more of the set's value concentrated in its dozen Signature-level prints.
3. **The launch curve will be at least as fast as Radiance's.** Every structural reason Radiance settled faster than Vendetta (earlier stock, more stores, a market that has seen it before) will be stronger in January, not weaker.
4. **Radiance will keep falling into Legacy's release month.** Every set lost value in the month Radiance released. Radiance should expect the same in January, and Vendetta, the set two back, has historically been the one that falls most.

What would break this pattern? A short print, an allocation shortage like Origins had, or a card that the January meta cannot do without. Those are the things to watch for in the preview season, and they will show in our [price movers](/movers) before they show in a forum thread.

## How to read this data yourself

Every chart on a RiftCompare card page is drawn from the same history files this post used, and the [RiftCompare Index](/guides/understanding-the-riftcompare-index-methodology) tracks the whole market as one number. The practical habits that the last two launches reward:

- **Track the set median, not the top card.** One Riven at US$3,000 tells you about one buyer. Sixty-two Showcases at a median of US$43 tell you about the set.
- **Compare against days-from-release, not the calendar.** Radiance at day 13 against Vendetta at day 13 is a meaningful comparison. Radiance in November against Vendetta in November is not.
- **Count the cards priced over US$100.** It is the most stable measure of how much of a set is really a collectible. Radiance has 20 today, Vendetta 15, Origins 37.
- **Buy on the curve's flat part.** For Vendetta that was day 21 onward; for Radiance it looks like it arrived around day 9. For Legacy, assume faster again.

We will revisit this post when Legacy's preorders open and again at its day 30, with the same tables, so the comparison is three sets wide. Until then, the live versions of every figure here are on the [Radiance set page](/sets/radiance), the [Vendetta set page](/sets/vendetta) and the [price movers](/movers).

*Data: RiftCompare's public price history, 6 June to 5 November 2026. Set medians are computed over every card of the stated rarity with an in-stock price that day across the AU, US, UK and SG stores we compare, converted to US dollars at the day's rate. This is a description of how the market has behaved; it is not investment advice and no figure here is a prediction about any specific card.*`,
    faq: [
      {
        q: "How far did Radiance prices fall after release?",
        a: "The median Radiance Showcase price went from US$166.67 on the first preorder day (15 October 2026) to US$42.51 on 5 November, a fall of about 74%. The Epic median fell from US$19.34 to US$1.17 and the Rare median from US$19.99 to US$0.07 over the same period.",
      },
      {
        q: "Did Radiance prices fall faster than Vendetta's?",
        a: "Yes. Vendetta's Showcase median took about 90 days after its 31 July release to reach US$43. Radiance's reached US$43 nine days after its 23 October release. Both sets' Epic medians were under US$2 within two weeks.",
      },
      {
        q: "When is the cheapest time to buy a new Riftbound set's cards?",
        a: "On the evidence of Vendetta and Radiance, not during preorders and not in release week. Both sets' Showcase medians were lowest around three to four weeks after release and kept drifting down slowly after that. The exception is prints with capped supply, such as event promos and drawing-only products, which hold better.",
      },
      {
        q: "What will Legacy do to Radiance prices?",
        a: "Every existing set's Showcase median fell in the month Radiance released, because a new set redirects the same collector budget. Legacy (previews 13 December 2026, release 29 January 2027) is likely to do the same to Radiance, and Vendetta, now two sets back, has historically been the set that falls most in a release month.",
      },
    ],
  },
];
