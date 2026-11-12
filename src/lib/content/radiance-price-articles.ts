// Radiance price posts (owner, 2026-11-12: "create a couple more blog posts ... that target exactly
// what people are searching for right now"). Written from Search Console's 28 days to 12 November:
// price-intent searches ("riftbound radiance card prices", "radiance price guide", "riftbound card
// prices", "kda riftbound price", "radiance signature price") were being answered by the home page,
// /browse or a 17 October table, and "radiance price guide" had risen from 0 to 14 impressions a day.
//
// Every number is computed, never typed from memory: card prices are the cheapest in-stock price per
// printing across the AU, US, UK and SG stores we compare, in US cents, one file per Sydney day
// (data/price-history/cards/<day>.json) joined to data/public/cards.json; sealed prices are the
// 12 November public sealed export (data/public/sealed-listings.json), the cheapest in-stock store
// row and the cheapest marketplace row per market in the store's own currency. No forecast anywhere.
// Keyword map: docs/seo-keyword-map.md rows added the same day.
import type { Article } from "../articles";

const DAY = "2026-11-12";

export const RADIANCE_PRICE_ARTICLES: Article[] = [
  {
    slug: "riftbound-radiance-signature-prices-now",
    category: "blog",
    title: "Radiance Signature Card Prices Now: Every One Is Down",
    seoTitle: "Radiance Signature Prices: All 16 Down a Median 67% (12 Nov)",
    excerpt:
      "Every Radiance Signature and overnumbered card on 20 Oct, 31 Oct and 12 Nov. Thirteen of 16 Signatures were US$1,000+ at first listing; none are now.",
    author: "RiftCompare",
    date: DAY,
    readMins: 11,
    tags: ["radiance", "signature", "prices", "price history", "chase cards", "price guide"],
    shop: [
      { label: "Radiance Signatures on eBay", query: "Riftbound Radiance signature" },
      { label: "Radiance overnumbered on eBay", query: "Riftbound Radiance overnumbered" },
    ],
    summary: [
      "**All 16 Radiance Signature cards are below their first listings, by a median of 67%.** Thirteen had a cheapest listing of US$1,000 or more on 20 October; none do on 12 November.",
      "**The dearest are Evelynn 175\\* and Riven 173\\* at US$900.** The cheapest is K'Sante, Courageous 178\\* at US$221. Seraphine 174\\*, the headline card, is US$747.",
      "**The fall is slowing.** The median Signature fell 58% between 20 and 31 October and a further 16% since. Evelynn 175\\* and the Chinese Seraphine 174a\\* are up slightly.",
      "**A Signature now costs about seven times its unsigned twin** (5.9 to 11.1 times), against 18 times for Ziggs on 17 October. The 17 unsigned overnumbered cards fell a median of 61%.",
      "**These are cheapest in-stock listings, not sold prices,** across the AU, US, UK and Singapore stores and marketplaces we track, in US dollars.",
    ],
    faq: [
      {
        q: "How much is a Radiance Signature card worth?",
        a: "From US$221 (K'Sante, Courageous 178*) to US$900 (Evelynn, Agony's Embrace 175* and Riven, The Exile 173*) on 12 November 2026, by the cheapest in-stock listing RiftCompare tracks. On 20 October the same cards had cheapest listings from US$644 to US$3,174.",
      },
      {
        q: "Are Riftbound Radiance Signature prices going down?",
        a: "Yes. All 16 are below their 20 October listings, by a median of 67%. The rate has slowed: the median change since 31 October is a 16% fall, and two cards, Evelynn 175* and the Chinese-exclusive Seraphine 174a*, rose slightly.",
      },
      {
        q: "Which Radiance Signature is the most expensive?",
        a: "Evelynn, Agony's Embrace 175* and Riven, The Exile 173*, both US$900 on 12 November. Riven's first listing on 20 October was US$3,174 and Evelynn's US$1,945. Seraphine, Starry-Eyed Songstress 174*, the set's headline card, was US$747.",
      },
      {
        q: "Is this the price cards sold for?",
        a: "No. It is the cheapest in-stock listing for the exact printing across the stores and marketplaces we track. Sold prices are not published for these cards, and with only a handful of sellers each, one listing can move the cheapest price a long way in a day.",
      },
      {
        q: "How much more is a Signature than the unsigned card?",
        a: "About seven times on 12 November, from 5.9 times (Evelynn) to 11.1 times, by cheapest listing. On 17 October Ziggs 169* was listed at US$5,000 against US$275 for the unsigned 169, eighteen times as much.",
      },
    ],
    browseCta: {
      href: "/sets/radiance",
      label: "Every Radiance card, with live prices →",
      blurb: "The full Radiance card list compared across every store we track, Signatures included.",
    },
    body: `**Every one of Radiance's 16 Signature cards is down since the first listings, and the median fall is 67%.** On 20 October, three days before Radiance came out, **13 of the 16 had a cheapest listing of US$1,000 or more.** On 12 November, **none do.** The dearest, Evelynn 175\\* and Riven 173\\*, are both at US$900. The cheapest, K'Sante, Courageous 178\\*, is US$221.

This page is the current price of every Radiance Signature and overnumbered card, side by side with where each started. It is the price companion to **[the full list of Radiance Signature cards](/blog/riftbound-radiance-signature-cards)**, which explains what each card is and who signed it; the opening prices quoted on that page are from 17 October and are well out of date.

## How to read these numbers

Every figure here is the **cheapest in-stock listing for that exact printing across the Australian, US, UK and Singapore stores and marketplaces RiftCompare tracks, converted to US dollars**, one reading per Sydney day, from the daily price history this site keeps. It is not a sold price, and it is not TCGplayer's market price: TCGplayer publishes no market price for most Radiance chase cards yet. Each Signature has only a handful of sellers, so one seller listing or pulling a card can move the cheapest price a long way in a day. Treat a single reading as a floor you could have bought at, not a valuation, and look at the direction of three readings rather than one.

## Radiance Signature prices: 20 October to 12 November

| Card | Number | 20 Oct | 31 Oct | 12 Nov | Since 20 Oct | Unsigned now | Signed ÷ unsigned |
|---|---|---|---|---|---|---|---|
| [Evelynn, Agony's Embrace](/card/evelynn-agony-s-embrace-rad-175s-167) | 175\\*/167 | US$1,945 | US$824 | **US$900** | −54% | US$120 | 7.5× |
| [Riven, The Exile](/card/riven-the-exile-rad-173s-167) | 173\\*/167 | US$3,174 | US$1,400 | **US$900** | −72% | US$131 | 6.9× |
| [Seraphine, Starry-Eyed Songstress](/card/seraphine-starry-eyed-songstress-rad-174s-167) | 174\\*/167 | US$1,582 | US$998 | **US$747** | −53% | US$87.67 | 8.5× |
| [Seraphine, Starry-Eyed Songstress](/card/seraphine-starry-eyed-songstress-rad-174as-167) | 174a\\*/167 | US$930 | US$664 | **US$718** | −23% | – | – |
| [Ziggs, Hexplosives Expert](/card/ziggs-hexplosives-expert-rad-169s-167) | 169\\*/167 | US$1,800 | US$750 | **US$675** | −62% | US$75.95 | 8.9× |
| [Mordekaiser, Iron Revenant](/card/mordekaiser-iron-revenant-rad-170s-167) | 170\\*/167 | US$1,500 | US$634 | **US$522** | −65% | US$88.61 | 5.9× |
| [Orianna, Lady of Clockwork](/card/orianna-lady-of-clockwork-rad-171s-167) | 171\\*/167 | US$1,200 | US$500 | **US$437** | −64% | US$63.99 | 6.8× |
| [Kayn, Unleashed](/card/kayn-unleashed-rad-182s-167) | 182\\*/167 | US$1,266 | US$458 | **US$400** | −68% | US$35.99 | 11.1× |
| [Sett, Kingpin](/card/sett-kingpin-rad-183s-167) | 183\\*/167 | US$1,013 | US$500 | **US$394** | −61% | US$60.00 | 6.6× |
| [Ezreal, Dashing](/card/ezreal-dashing-rad-180s-167) | 180\\*/167 | US$1,300 | US$553 | **US$380** | −71% | US$38.00 | 10.0× |
| [Ekko, Boy Who Shattered Time](/card/ekko-boy-who-shattered-time-rad-168s-167) | 168\\*/167 | US$1,300 | US$389 | **US$332** | −74% | US$47.99 | 6.9× |
| [Jarvan IV, Exemplar of Demacia](/card/jarvan-iv-exemplar-of-demacia-rad-176s-167) | 176\\*/167 | US$1,000 | US$440 | **US$304** | −70% | US$37.97 | 8.0× |
| [Yone, Blademaster](/card/yone-blademaster-rad-181s-167) | 181\\*/167 | US$644 | US$350 | **US$299** | −54% | US$33.90 | 8.8× |
| [K'Sante, Pride of Nazumah](/card/k-sante-pride-of-nazumah-rad-172s-167) | 172\\*/167 | US$1,228 | US$300 | **US$259** | −79% | US$40.46 | 6.4× |
| [Aphelios, Exalted](/card/aphelios-exalted-rad-179s-167) | 179\\*/167 | US$1,150 | US$600 | **US$250** | −78% | US$39.99 | 6.3× |
| [K'Sante, Courageous](/card/k-sante-courageous-rad-178s-167) | 178\\*/167 | US$850 | US$300 | **US$221** | −74% | US$37.35 | 5.9× |

Sorted by today's price. "Unsigned now" is the matching overnumbered card without the signature, on 12 November; the last column is how many times dearer the Signature is than its unsigned twin.

### What the table says

**The fall was front-loaded.** Between 20 October and 31 October the median Signature fell by 58%. Between 31 October and 12 November it fell a further 16%. The decline is slowing, which is what a set that has found its first floor looks like, though it says nothing about where the second floor is.

**The cards that opened highest fell furthest in dollars, but not always in percent.** Ziggs 169\\* went from US$1,800 to US$675 (−62%) and Riven 173\\* from US$3,174 to US$900 (−72%). The biggest percentage falls were the cheap-to-start HEARTSTEEL and K'Sante cards: K'Sante, Pride of Nazumah 172\\* lost 79% and Aphelios 179\\* 78%.

**Two cards are holding.** Evelynn 175\\* is US$900 today after US$824 on 31 October, and the Chinese-exclusive Seraphine 174a\\* sits at US$718 against US$664, with only a 23% fall from its first listing, the smallest of the 16. Both are cards with a story behind them: Evelynn's black signature is easy to spot and Seraphine is Radiance's headline champion, while 174a\\* is sold in China only and reaches English-language buyers through importers.

**The signature premium is roughly seven times.** Today a Signature costs between 5.9 and 11.1 times its unsigned twin, with a median of about 7. On 17 October the gaps were wilder: Ziggs 169\\* was listed at US$5,000 against an unsigned US$275, eighteen times as much. That a stable multiple has emerged is itself a sign that the market has begun to price the two against each other.

## The unsigned overnumbered cards

The 17 overnumbered printings, 168/167 to 184/167, fell almost as hard as their signed twins: **a median of 61% from 20 October.**

| Card | Number | 20 Oct | 31 Oct | 12 Nov | Since 20 Oct |
|---|---|---|---|---|---|
| [Packed Amphitheater](/card/packed-amphitheater-rad-184-167) | 184/167 | US$1,350 | US$500 | **US$380** | −72% |
| [Riven, The Exile](/card/riven-the-exile-rad-173-167) | 173/167 | US$325 | US$203 | **US$131** | −60% |
| [Evelynn, Agony's Embrace](/card/evelynn-agony-s-embrace-rad-175-167) | 175/167 | US$283 | US$133 | **US$120** | −58% |
| [Mordekaiser, Iron Revenant](/card/mordekaiser-iron-revenant-rad-170-167) | 170/167 | US$225 | US$108 | **US$88.61** | −61% |
| [Seraphine, Starry-Eyed Songstress](/card/seraphine-starry-eyed-songstress-rad-174-167) | 174/167 | US$247 | US$107 | **US$87.67** | −65% |
| [Ziggs, Hexplosives Expert](/card/ziggs-hexplosives-expert-rad-169-167) | 169/167 | US$175 | US$96.00 | **US$75.95** | −57% |
| [Orianna, Lady of Clockwork](/card/orianna-lady-of-clockwork-rad-171-167) | 171/167 | US$125 | US$75.28 | **US$63.99** | −49% |
| [Sett, Kingpin](/card/sett-kingpin-rad-183-167) | 183/167 | US$139 | US$50.00 | **US$60.00** | −57% |
| [Ekko, Revolutionary](/card/ekko-revolutionary-rad-177-167) | 177/167 | US$210 | US$60.41 | **US$49.00** | −77% |
| [Ekko, Boy Who Shattered Time](/card/ekko-boy-who-shattered-time-rad-168-167) | 168/167 | US$120 | US$56.86 | **US$47.99** | −60% |
| [K'Sante, Pride of Nazumah](/card/k-sante-pride-of-nazumah-rad-172-167) | 172/167 | US$92.33 | US$48.77 | **US$40.46** | −56% |
| [Aphelios, Exalted](/card/aphelios-exalted-rad-179-167) | 179/167 | US$129 | US$45.97 | **US$39.99** | −69% |
| [Ezreal, Dashing](/card/ezreal-dashing-rad-180-167) | 180/167 | US$140 | US$46.48 | **US$38.00** | −73% |
| [Jarvan IV, Exemplar of Demacia](/card/jarvan-iv-exemplar-of-demacia-rad-176-167) | 176/167 | US$92.50 | US$60.00 | **US$37.97** | −59% |
| [K'Sante, Courageous](/card/k-sante-courageous-rad-178-167) | 178/167 | US$120 | US$45.87 | **US$37.35** | −69% |
| [Kayn, Unleashed](/card/kayn-unleashed-rad-182-167) | 182/167 | US$119 | US$47.50 | **US$35.99** | −70% |
| [Yone, Blademaster](/card/yone-blademaster-rad-181-167) | 181/167 | US$110 | US$43.00 | **US$33.90** | −69% |

Packed Amphitheater 184/167, the K/DA Battlefield from the Couture Collection, is the highest-priced unsigned card here at US$380 and has no Signature at all. It fell from US$1,350 on 20 October. Ekko, Revolutionary 177/167, the one overnumbered unit outside HEARTSTEEL, is at US$49.

## What would be worth buying, and what to avoid

We do not tell anybody a price will go up or down, and nothing here is a forecast. There are, however, things the price history does show:

- **Buying at the first listings was the expensive way to buy every card on this page.** The opening asking prices for Radiance's chase cards were set before most buyers had seen the cards and before a single box had been opened at volume. The cheapest listing then was not a price anybody had paid; it was the price a seller hoped for.
- **Signatures that are also playable are priced by two audiences.** The nine Legend Signatures can be played as well as collected, which is the argument for Evelynn and Seraphine holding up. The HEARTSTEEL cards are units in the main deck and have fallen further.
- **The cheapest copy is rarely the same card.** Condition, language and whether a card is the English or the Chinese printing explain most of the gap between a very low listing and the rest. The Chinese Seraphine 174a\\* is a different painting and a separate card. Check the listing's number before you compare it with another.
- **A graded copy is a different product.** A slab is priced by its grade and its grader, not by the raw card's cheapest listing; [graded prices](/graded) tracks them separately.

If you want to be told when a specific Signature drops below a price you would pay, you can [set a price alert](/alerts) on the card's page. It costs nothing and emails you once.

## Why Radiance prices fell this far, this fast

We can measure the fall; we cannot measure its cause, because nobody publishes how many boxes were opened. What the history does show is that the earliest prices were asking prices set before most buyers had seen a pulled card, and that the cheapest listing for each card fell every week after. The sealed price moved the same way. Radiance booster boxes that were about US$227 on TCGplayer in the first days of pre-orders can now be found from US$100.99 at stores and US$102.95 on TCGplayer, below Riot's US$120 US list price. We looked at the same pattern for the whole set, and for earlier sets, in **[how fast a set's prices settle](/blog/riftbound-market-radiance-launch-curve-legacy-outlook)**, where the Showcase median fell by about three quarters in three weeks. The Signatures followed the same curve with bigger numbers on it. The box prices by market are in **[the Radiance price guide](/blog/riftbound-radiance-price-guide)**.

## What this means for Legacy

Legacy, the next set, releases on 29 January 2027, with previews from 13 December. Its pre-orders are already open and many are sold out. Nothing in the Radiance curve says Legacy will behave the same way: in our history the twenty dearest Vendetta cards held roughly their one-week-after-release price for about eight weeks before falling. What the Radiance numbers do say is that a price on a pre-order page is a seller's ask, and that three weeks after release the same card could cost a third of it. If you are deciding between a pre-order box and singles, [the Legacy pre-order comparison](/legacy-preorders) shows every tracked store's price and stock for your market today.

## Frequently asked questions

**How much is a Radiance Signature card worth?** From US$221 (K'Sante, Courageous 178\\*) to US$900 (Evelynn 175\\* and Riven 173\\*) on 12 November, by the cheapest listing we track. On 20 October the same cards had cheapest listings from US$644 to US$3,174.

**Are Riftbound Radiance Signature prices going down?** Yes. All 16 are below their first listings, by a median of 67%. The rate has slowed: the median fall since 31 October is 16%, and two cards, Evelynn 175\\* and the Chinese Seraphine 174a\\*, rose slightly.

**Which Radiance Signature is the most expensive?** Evelynn, Agony's Embrace 175\\* and Riven, The Exile 173\\*, both US$900 on 12 November. Riven's first listing was US$3,174 and Evelynn's was US$1,945. [Seraphine, Starry-Eyed Songstress 174\\*](/card/seraphine-starry-eyed-songstress-rad-174s-167), the set's headline card, is US$747.

**Is the Signature price the sold price?** No. It is the cheapest in-stock listing. Sold prices are not published for these cards, and the cheapest listing is often one seller.

**Where can I compare Radiance prices today?** Every card has its own page with prices from the stores we track, and [the Radiance set page](/sets/radiance) lists all of them.
`,
  },
  {
    slug: "riftbound-radiance-price-guide",
    category: "blog",
    title: "Riftbound Radiance Price Guide: What Every Card Costs Now",
    seoTitle: "Riftbound Radiance Price Guide: Every Rarity, 12 Nov",
    excerpt:
      "What a Radiance Common, Epic, alternate art, K/DA special and booster box cost three weeks after release, by the cheapest listings on 12 November.",
    author: "RiftCompare",
    date: DAY,
    readMins: 10,
    tags: ["radiance", "prices", "price guide", "kda", "sealed", "price history"],
    shop: [
      { label: "Radiance booster boxes on eBay", query: "Riftbound Radiance booster display" },
      { label: "Radiance Vault Bundles on eBay", query: "Riftbound Radiance vault bundle" },
      { label: "Blade of the Exile on eBay", query: "Riftbound Blade of the Exile" },
    ],
    summary: [
      "**Most of Radiance costs pennies.** On 12 November the median Common was US$0.02, the median Rare US$0.05 and the median Epic US$0.77, by cheapest in-stock listing.",
      "**The dearest playable card is Blade of the Exile 150/167 at US$14,** against US$6.01 for the next. Only 21 cards outside the overnumbered, Signature and K/DA tiers cost more than US$2.",
      "**The five K/DA specials are US$9.90 to US$27.22.** Four fell 24% to 58% since release weekend; Seraphine, Not Alone SP5 rose from US$6.96 to US$9.90.",
      "**A Radiance booster box is now below the US$120 US list price:** US$100.99 at a store, US$102.95 on TCGplayer. UK £99.95, Canada C$149.95, Australia A$190, eurozone €104.94, Singapore S$150.",
      "**The chase cards are a separate market:** every Signature is down a median of 67% from its first listing, in [the Signature price table](/blog/riftbound-radiance-signature-prices-now).",
    ],
    faq: [
      {
        q: "How much are Riftbound Radiance cards worth?",
        a: "Almost all of them very little. On 12 November 2026 the median Common was US$0.02, the median Rare US$0.05 and the median Epic US$0.77 by cheapest listing. The dearest playable card is Blade of the Exile at US$14; the chase cards run from about US$34 to US$900.",
      },
      {
        q: "What is the most expensive card in Riftbound Radiance?",
        a: "Of the 16 Signatures, Evelynn, Agony's Embrace 175* and Riven, The Exile 173*, at US$900 each on 12 November by cheapest listing. Of cards without a chase printing, Blade of the Exile 150/167 at US$14.",
      },
      {
        q: "How much is a Radiance booster box?",
        a: "From US$100.99 at a US store and US$102.95 on TCGplayer on 12 November, against a US$120 US list price; £99.95 in the UK, C$149.95 in Canada, A$190 in Australia, €104.94 in the eurozone and S$150 in Singapore.",
      },
      {
        q: "What are the K/DA cards worth?",
        a: "The five K/DA special printings (SP1 to SP5) were US$9.90 to US$27.22 on 12 November. Ahri, Confident SP1 was the dearest at US$27.22; Seraphine, Not Alone SP5 the cheapest at US$9.90.",
      },
      {
        q: "Where can I see every Radiance card's price?",
        a: "On the Radiance set page, which lists every card with live prices from the stores RiftCompare tracks, and in the set gallery.",
      },
    ],
    browseCta: {
      href: "/sets/radiance",
      label: "Every Radiance card, with live prices →",
      blurb: "The full Radiance card list compared across every store we track, in your currency.",
    },
    body: `**Most of Riftbound: Radiance costs pennies, a few Epics and alternate arts cost real money, and the chase cards are a separate market.** This is the price guide for the whole set as of 12 November 2026, three weeks after release: what each rarity costs, the dearest cards you can play, the K/DA specials, and what a booster box, Vault Bundle and pack cost in each market we track. Every figure is the cheapest in-stock listing we found for that printing on 12 November, in US dollars for cards and the store's own currency for sealed product.

If you want a single sentence: **a Radiance Common is about two cents, the median Epic is under a dollar, only 21 cards outside the chase tiers are over US$2, and a booster box is now below Riot's US$120 US list price.**

## What a Radiance card costs, by rarity

Radiance's main run is 167 cards, plus alternate arts, overnumbered cards, Signatures and five K/DA specials. For everything that is not an overnumbered card, Signature or special, the cheapest listing on 12 November was:

| Group | Cards priced | Median | Dearest |
|---|---|---|---|
| Common | 54 | US$0.02 | US$0.07 |
| Uncommon | 46 | US$0.05 | US$0.44 |
| Rare | 45 | US$0.05 | US$0.69 |
| Epic | 28 | US$0.77 | US$14.00 |
| Showcase alternate art | 18 | US$2.67 | US$5.50 |

Those are cheapest listings across the AU, US, UK and Singapore stores we track, so a floor of US$0.02 for a Common means a seller somewhere is offering it for that, not that any shop will ship one card for two cents. The practical point is the shape: **Commons, Uncommons and Rares are bulk, the median Epic is 77 cents, and the cards in the main set that cost more than a few dollars are a short list of Epics and the alternate arts.** If you are buying to play, almost the whole set costs less than a booster pack.

## The most expensive Radiance cards you can actually play

These are the dearest non-promo, non-alternate-art, non-overnumbered cards in the set, which is to say the ones that go in a deck:

| Card | Number | Rarity | Cheapest now |
|---|---|---|---|
| [Blade of the Exile](/card/blade-of-the-exile-rad-150-167) | 150/167 | Epic | US$14.00 |
| [Realm of Death](/card/realm-of-death-rad-144-167) | 144/167 | Epic | US$6.01 |
| [The Ball](/card/the-ball-rad-146-167) | 146/167 | Epic | US$5.17 |
| [Neeko, Blending In](/card/neeko-blending-in-rad-167-167) | 167/167 | Epic | US$3.59 |
| [Seraphic Wyvern](/card/seraphic-wyvern-rad-092-167) | 092/167 | Epic | US$2.16 |
| [Hexplosive Minefield](/card/hexplosive-minefield-rad-142-167) | 142/167 | Epic | US$1.99 |
| [Demacian Standard](/card/demacian-standard-rad-156-167) | 156/167 | Epic | US$1.95 |
| [Ntofo Strikes](/card/ntofo-strikes-rad-148-167) | 148/167 | Epic | US$1.85 |
| [Encore](/card/encore-rad-152-167) | 152/167 | Epic | US$1.69 |
| [Dockside Lock-Up](/card/dockside-lock-up-rad-136-167) | 136/167 | Epic | US$1.54 |

**[Blade of the Exile 150/167](/card/blade-of-the-exile-rad-150-167)** is the one that stands apart, at US$14 against US$6 for the next card. It is a three-energy Calm Gear with Equip, it is one of the most-searched cards on this site, and it is the dearest playable Epic by more than double. Every Radiance card, it included, is on [the Radiance set page](/sets/radiance).

Below it the list is flat: nine cards between US$1.54 and US$6.01, which is no more than the price of a pack. [Neeko, Blending In 167/167](/card/neeko-blending-in-rad-167-167) is the one Neutral card on the list; it goes in a deck of any Domain.

## The K/DA specials

The five K/DA special printings, SP1 to SP5, are Radiance's pop-star tier. They are the only cards here that moved in different directions:

| Card | Number | 24 Oct (release weekend) | 12 Nov | Change |
|---|---|---|---|---|
| [Ahri, Confident](/card/ahri-confident-rad-sp1-005) | SP1/005 | US$39.37 | US$27.22 | −31% |
| [Akali, Brash](/card/akali-brash-rad-sp2-005) | SP2/005 | US$23.81 | US$14.61 | −39% |
| [Evelynn, In Control](/card/evelynn-in-control-rad-sp3-005) | SP3/005 | US$36.63 | US$15.56 | −58% |
| [Kai'Sa, Rebel](/card/kai-sa-rebel-rad-sp4-005) | SP4/005 | US$21.82 | US$16.50 | −24% |
| [Seraphine, Not Alone](/card/seraphine-not-alone-rad-sp5-005) | SP5/005 | US$6.96 | US$9.90 | +42% |

Four of the five fell between 24% and 58% from release weekend. **Seraphine, Not Alone SP5 went the other way, from US$6.96 to US$9.90.** It started as the cheapest of the five and is now the only one that has gained, which is a small illustration of how thin these markets are rather than a trend. The story of the five cards, and how they are numbered and pulled, is in **[the K/DA cards post](/blog/riftbound-kda-cards)**. The K/DA Couture Collection, sold through Riot's own store, includes the Packed Amphitheater Battlefield, now US$380 as an unsigned overnumbered card.

## The chase cards: overnumbered and Signature prices

The overnumbered cards (168/167 to 184/167) and the 16 Signatures are the part of Radiance that is not priced like the rest. On 12 November **no Signature has a cheapest listing above US$900, and every one is down from its first listing: a median of 67%.** The unsigned overnumbered cards fell by a median of 61%. Every card, with its price on 20 October, 31 October and 12 November, is in **[the Radiance Signature price table](/blog/riftbound-radiance-signature-prices-now)**.

## Radiance sealed prices by market

The 12 November sealed export shows these as the cheapest in-stock listing from a store, and the cheapest listing on a marketplace where one exists. US list prices are US$120 for a booster display (24 packs, US$4.99 each) and US$34.99 for a Vault Bundle. No other market has a published list price.

| Market | Booster box, cheapest store | Booster box, cheapest marketplace | Vault Bundle, cheapest store |
|---|---|---|---|
| United States | US$100.99 (Wulf Gaming) | US$102.95 (TCGplayer) | US$29.99 (Gator's Card Den) |
| United Kingdom | £99.95 (Roll N Play) | £89.99 (eBay) | £29.95 (Roll N Play) |
| Canada | C$149.95 (Cartes Léo) | C$161.95 (eBay) | C$44.99 (Desert City Games) |
| Australia | A$190.00 (Team Card Titan) | A$200.00 (eBay) | A$55.00 (Team Card Titan) |
| Eurozone | €104.94 (El Duelista) | €93.00 (Cardmarket) | €30.50 (SpellNexus) |
| Singapore | S$150.00 (1Collectibles) | none | S$70.00 (4elements, listed as a pre-sale) |

**The US box is below list.** A store box at US$100.99 and a TCGplayer listing at US$102.95 are both under the US$120 list price, in a market where the cheapest TCGplayer display was about US$227 in the first days of pre-orders. Radiance's pre-order curve, week by week and market by market, is in **[the two-week pre-order price report](/blog/riftbound-radiance-preorder-prices-two-weeks-later)**. For where to buy, and which stores to trust, see **[where to buy Radiance](/blog/where-to-buy-riftbound-radiance)**; the live, sorted store list for your market is on **[the Radiance pre-order comparison](/radiance-preorders)**.

**The spread is large between markets.** The same box is US$100.99 in the US and A$190.00 in Australia. Prices are never converted between currencies on RiftCompare for the stores' own rows, so compare within your own market, and use the [markets pages](/au) for the others.

## How to buy Radiance cheaply

- **Buy the set's bulk as a lot, not card by card.** At two to five cents a card, postage is the whole cost. Order Commons, Uncommons and Rares from one store.
- **Spend on the handful of cards your deck plays.** Only 21 cards outside the chase tiers cost over US$2. Blade of the Exile at US$14 is the one real line item.
- **Do not pay opening-week prices for chase cards.** Every chase card on this page is down since the first listings; see the Signature table for how far.
- **Check the number before you compare.** An alternate art (065a/167), an overnumbered card (174/167), a Signature (174\\*/167) and a promo are different cards with different prices, and the K/DA specials are numbered out of 005. A listing that does not name the number is the thing to avoid.
- **A price alert is free** and emails once when a card drops below the price you set. [Set one on a card's page](/alerts).

## Frequently asked questions

**How much are Riftbound Radiance cards worth?** Almost all of them very little: on 12 November the median Common was US$0.02, the median Rare US$0.05 and the median Epic US$0.77. The dearest playable card is Blade of the Exile at US$14. The chase cards, the overnumbered printings and Signatures, run from about US$34 to US$900.

**What is the most expensive card in Riftbound Radiance?** Of the 16 Signatures, Evelynn, Agony's Embrace 175\\* and Riven, The Exile 173\\* at US$900 each on 12 November, by cheapest listing. Of cards you can play without chasing the rare printings, Blade of the Exile 150/167 at US$14.

**How much is a Radiance booster box?** From US$100.99 at a US store and US$102.95 on TCGplayer on 12 November, against a US$120 list price. In the UK from £99.95, in Canada from C$149.95, in Australia from A$190, in the eurozone from €104.94 and in Singapore from S$150.

**What are the K/DA cards worth?** The five K/DA specials were US$9.90 to US$27.22 on 12 November. Ahri, Confident SP1 is the dearest at US$27.22.

**How do I see every Radiance card's price?** [The Radiance set page](/sets/radiance) lists every card with live store prices, and [the gallery](/sets/radiance/gallery) shows them as images.
`,
  },
];
