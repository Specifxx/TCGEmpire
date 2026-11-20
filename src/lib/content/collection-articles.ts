// The three collector-collection hubs (owner, 2026-11-20: "a page with … the dynamic,
// clickable, quick view, embedded cards of all the Worlds cards … and for the KDA
// couture cards … and the T1 edition cards", modelled on the Crystal Rose guide, which
// drew a lot of visitors). Each one gathers EVERY printing of its collection that the
// catalogue holds into live galleries (CardTiles → QuickView), so the gallery is the
// page and the prose explains it.
//
// Facts are Riot's own announcements on playriftbound.com (contents, prices, dates);
// card prices are TCGplayer's market price (or its lowest listing where no sale has
// set a market price yet) read on 20 November 2026 by scripts/collab-cards.ts, dated
// in the copy. The galleries show the live price. No forecast anywhere. Every body is
// over the 1,500-word policy (tests/content-links).
import type { Article } from "../articles";

const READ = "20 November 2026";

export const COLLECTION_ARTICLES: Article[] = [
  // ─────────────────────────────────────────────────────────────────────────
  {
    slug: "riftbound-worlds-cards",
    category: "guide",
    title: "Riftbound Worlds Cards: Every Worlds Bundle Promo & Price",
    seoTitle: "Riftbound Worlds Cards: Panda Teemo & Battlefield Prices",
    excerpt:
      "Every Riftbound Worlds card in one live gallery: the Worlds Bundle 2025 Panda Teemo, its three city Battlefields in both sizes, and the Worlds 2026 Yasuo.",
    author: "RiftCompare",
    date: "2026-11-20",
    readMins: 9,
    tags: ["worlds", "promo", "collecting", "esports", "battlefields"],
    summary: [
      "**Worlds Bundle 2025 (US$99.99 at the Riot Merch Store):** a Panda Teemo promo (Teemo, Swift Scout, OGN 263a/298), three oversized Battlefields for the 2025 host cities (Aspirant's Climb for Beijing, The Grand Plaza for Shanghai, Bandle Tree for Chengdu), a foiled playmat, a deck box and sleeves.",
      `**Prices on ${READ} (TCGplayer market):** Panda Teemo US$650.19; the standard-size Battlefields Aspirant's Climb US$37.83, Bandle Tree US$94.04 and The Grand Plaza US$34.37; the oversized ones US$30, US$40 and US$20. A sealed bundle was US$962.44.`,
      "**Worlds 2026 Edition (US$80, drawing only):** a Yasuo, Unforgiven Legend promo and three Battlefield promos for Los Angeles, Allen and New York City. It ships from mid-December, so its cards are not listed anywhere yet; the regular Yasuo printings are in the gallery below.",
      "Every card here opens a quick view with its live price across every store and market RiftCompare tracks.",
    ],
    faq: [
      {
        q: "What is in the Riftbound Worlds Bundle 2025?",
        a: "One Panda Teemo promo card (Teemo, Swift Scout), three oversized Battlefields celebrating the 2025 host cities (Aspirant's Climb for Beijing, The Grand Plaza for Shanghai and Bandle Tree for Chengdu), a foiled playmat, a deck box and card sleeves. Riot sold the English edition for US$99.99 (€104.99) on its Merch Store from 28 October 2025, at most two per order.",
      },
      {
        q: "How much is the Riftbound Panda Teemo worth?",
        a: `TCGplayer's market price for Teemo, Swift Scout 263a/298 was US$650.19 on ${READ}, which makes it the most valuable card in the Worlds Bundle by a long way. The gallery on this page shows its live price in every market we track.`,
      },
      {
        q: "Are the Worlds Bundle Battlefields oversized?",
        a: "Riot describes the bundle's three Battlefields as oversized, and TCGplayer lists oversized copies of Aspirant's Climb, Bandle Tree and The Grand Plaza under the Worlds Bundle 2025 group. Standard-size printings with the same 276a, 278a and 293a numbers also trade, and they are worth more: US$37.83, US$94.04 and US$34.37 against US$30, US$40 and US$20 for the oversized ones.",
      },
      {
        q: "Are oversized Riftbound cards tournament legal?",
        a: "No. An oversized card does not fit a sleeve or a deck, so it is a display piece. If you want to play a Worlds Battlefield, the standard-size printing is the one to buy.",
      },
      {
        q: "What is in the Riftbound Worlds 2026 Edition?",
        a: "A Yasuo, Unforgiven Legend promo with art exclusive to Worlds, three Battlefield promos with art of Los Angeles, Allen and New York City, a Worlds 2026 deck box and foil sleeves. It cost US$80 through Riot's drawing (registration 13 to 16 November 2026) and at the Worlds venues, and ships from mid-December 2026.",
      },
      {
        q: "When will the Worlds 2026 cards have prices?",
        a: "When copies reach the secondary market, after Riot starts shipping in mid-December 2026. We add each card as soon as TCGplayer lists it, and a price watch on the regular Yasuo, Unforgiven sends one email when its price moves.",
      },
    ],
    shop: [
      { label: "Riftbound Worlds Bundle on eBay", query: "Riftbound Worlds Bundle" },
      { label: "Riftbound Panda Teemo on eBay", query: "Riftbound Panda Teemo" },
    ],
    browseCta: {
      href: "/sets/origins",
      label: "See every Origins card's price →",
      blurb: "The Worlds Bundle's cards carry Origins numbers; every Origins card and alt-art, ranked by cheapest live price.",
    },
    embeds: [
      {
        title: "Worlds Bundle 2025: Panda Teemo and the three city Battlefields",
        note: "The standard-size printings, priced live across every store we track.",
        slugs: [
          "teemo-swift-scout-ogn-263a-298",
          "aspirant-s-climb-ogn-276a-298",
          "the-grand-plaza-ogn-293a-298",
          "bandle-tree-ogn-278a-298",
        ],
        ebaySearch: true,
      },
      {
        title: "The oversized Worlds Bundle Battlefields",
        note: "The display-size cards Riot packed in the bundle. Not tournament legal.",
        slugs: [
          "aspirant-s-climb-ogn-276a-298-oversized-promo",
          "the-grand-plaza-ogn-293a-298-oversized-promo",
          "bandle-tree-ogn-278a-298-oversized-promo",
        ],
      },
      {
        title: "Yasuo, Unforgiven: the Worlds 2026 Edition's Legend",
        note: "The Worlds-art promo ships in mid-December. Until then, these are the printings that exist, from the base card to the signed overnumber.",
        slugs: ["yasuo-unforgiven-ogn-259-298", "yasuo-unforgiven-ogn-305-298", "yasuo-unforgiven-ogn-305s-298"],
      },
    ],
    body: `Riot has now made two Riftbound products for the League of Legends World Championship. The **Worlds Bundle 2025** went on sale in October 2025 for the Beijing, Shanghai and Chengdu Worlds, and the **Worlds 2026 Edition** follows for this year's tournament in the United States. Neither is sold in hobby stores, neither will be reprinted, and between them they hold some of the most expensive promos in the game. This page puts every Worlds card we track into one live gallery, with what each one is, where it came from and what it sells for.

Click any card for its quick view: the cheapest price in your market, every store and eBay listing we found, and its price history.

## The Worlds Bundle 2025 cards

Riot's Worlds Bundle 2025 held one promo card, three oversized Battlefields and three accessories. The cards:

- **Teemo, Swift Scout, 263a/298 (the "Panda Teemo").** Teemo in his panda costume, a nod to the tournament's home country. It carries an Origins number with an "a", the way Riftbound marks an alternate art of an existing card.
- **Aspirant's Climb, 276a/298**, the Battlefield for **Beijing**.
- **The Grand Plaza, 293a/298**, the Battlefield for **Shanghai**.
- **Bandle Tree, 278a/298**, the Battlefield for **Chengdu**.

[[embed:0]]

The accessories were a foiled playmat, a deck box and a pack of sleeves. The English edition sold on the Riot Games Merch Store from **28 October 2025 at 9 AM PT**, for US$99.99 or €104.99, at most two per order, and shipped in mid-December 2025. A Chinese edition was sold at the venues in China.

### What they cost now

These are TCGplayer's market prices on ${READ}, the average of recent sales:

| Card | Number | Market price |
|---|---|---|
| Teemo, Swift Scout (Panda Teemo) | 263a/298 | US$650.19 |
| Bandle Tree | 278a/298 | US$94.04 |
| Aspirant's Climb | 276a/298 | US$37.83 |
| The Grand Plaza | 293a/298 | US$34.37 |
| Bandle Tree, oversized | 278a/298 | US$40.00 |
| Aspirant's Climb, oversized | 276a/298 | US$30.00 |
| The Grand Plaza, oversized | 293a/298 | US$20.00 |
| Worlds Bundle 2025, sealed | | US$962.44 |

Two things stand out. First, the Panda Teemo alone is worth more than six times what Riot charged for the whole bundle. Second, a sealed bundle at US$962.44 costs more than its cards do separately: the Teemo and the three oversized Battlefields add up to about US$740. The difference is the price of a box nobody has opened, and the playmat, deck box and sleeves inside it.

## Standard size or oversized?

Riot describes the bundle's Battlefields as **oversized**, and TCGplayer files oversized copies of all three under the Worlds Bundle 2025 group. They are display cards: too large for a sleeve or a deck, and not legal in a tournament.

Standard-size printings with the same 276a, 278a and 293a numbers trade too, and they are worth **more** than the oversized ones: Bandle Tree's standard printing sells for more than twice its oversized copy. That is the opposite of what a bigger card might suggest, and it is the reason both sizes have their own page here. A listing that says "Bandle Tree 278a" without saying which size can be either, so check the photo and the title before you buy.

[[embed:1]]

If you want to **play** a Worlds Battlefield, buy the standard size. If you want the whole bundle's set of cards on a shelf, the oversized three are the cheaper way to own all of them.

## Why the Panda Teemo costs so much

The Worlds Bundle was never sold in a store. It came from one online sale with a two-per-order cap, plus venue sales in China, and Riot has not said how many it made. Teemo, Swift Scout is a playable card in its regular printing, but the panda art exists only in this bundle, and it is the only card in the box that is not a Battlefield. Every collector who wants one complete Worlds Bundle needs exactly one Teemo, and the Battlefields can be bought separately in two sizes. That concentration is why the price sits where it does.

As with every promo, the useful comparison is with the ordinary printing. Teemo, Swift Scout's regular Origins card costs a fraction of a dollar. Everything above that is the art and the scarcity, not the card's strength in a game.

## The Worlds 2026 Edition

For this year's Worlds, Riot made a second box, the **Riftbound x Worlds 2026 Edition**, at US$80 plus shipping, in English only. It holds:

- a **Yasuo, Unforgiven** Legend promo with art made for Worlds;
- three **Battlefield promos** with art of the 2026 host cities, **Los Angeles, Allen and New York City** (Riot has not named the cards yet);
- a Worlds 2026 deck box and foil card sleeves.

It is sold through a drawing on the Riot Merch Store, not a normal sale. Registration ran from **13 to 16 November 2026**, selection emails began on 17 November, and orders ship from **mid-December 2026**. Riot also sold it at the Worlds quarterfinals and semifinals in Allen, Texas, and at Worlds Fan Fest in New York City. The drawing shared its dates with the T1 Player Bundle (see [our T1 card guide](/guides/riftbound-t1-cards)), and we covered the box itself when it was announced in [K/DA Couture Collection and Worlds 2026 Edition](/blog/riftbound-kda-couture-collection-worlds-2026-edition).

**None of the Worlds 2026 cards is listed anywhere yet.** No copy has shipped, so TCGplayer has no product for them and no store sells them. We will add each card with its real number and its own page the day it is listed, and this gallery will pick it up automatically. Until then, these are the Yasuo printings that already exist, from the regular Rare to the signed overnumber:

[[embed:2]]

| Card | Number | Market price |
|---|---|---|
| Yasuo, Unforgiven | 259/298 | US$15.31 |
| Yasuo, Unforgiven (overnumber) | 305/298 | US$92.23 |
| Yasuo, Unforgiven (signed overnumber) | 305*/298 | US$230.52 |

*Prices from our public data export on ${READ}; the gallery shows today's.*

## The two Worlds boxes side by side

| | Worlds Bundle 2025 | Worlds 2026 Edition |
|---|---|---|
| Riot's price | US$99.99 (€104.99) | US$80 |
| How it was sold | Riot Merch Store sale, two per order, plus venues in China | Riot Merch Store drawing, plus Allen and New York City |
| Languages | English and Chinese | English |
| Legend or unit promo | Teemo, Swift Scout (Panda Teemo) | Yasuo, Unforgiven |
| Battlefields | Three, oversized: Beijing, Shanghai, Chengdu | Three promos: Los Angeles, Allen, New York City |
| Accessories | Foiled playmat, deck box, sleeves | Deck box, foil sleeves |
| Shipped | Mid-December 2025 | From mid-December 2026 |

The 2026 box is cheaper and has no playmat, and it went to a drawing rather than an open sale, so fewer people could simply buy one. Its Legend, Yasuo, is already one of the most collected champions in Riftbound: his signed overnumber sells for more than any card in the Worlds Bundle except the Teemo. Whether the Worlds 2026 promos follow the 2025 cards' path is something only sales will show, and we will report them here as they happen rather than guess.

## How to buy Worlds cards safely

Both Worlds boxes are out of retail, so every copy for sale is resale. A few habits help:

1. **Check the number and the size.** A Worlds Battlefield listed as "Bandle Tree" may be the 278a alternate art in standard size, the oversized bundle card, or the ordinary Origins Battlefield, which costs cents. The "a" in the number and the photo tell them apart.
2. **Compare against the market price, not the asking price.** The lowest listing for a rare promo is often far from what copies sell for. The quick view on each card shows both where we have them.
3. **For the Teemo, ask for photos of the card itself.** At over US$600, the panda art is worth a close look at the corners, the surface and the back.
4. **Sealed bundles carry a premium.** If you want the cards, buying them singly is cheaper than a sealed box today.

A [price watch](/alerts) on any card here sends you one email when its price drops below the number you set, in your market and currency.

## Other collector cards worth knowing

The Worlds cards are part of a wider run of drawing-only and event-only Riftbound products. The [K/DA cards](/guides/riftbound-kda-collection) cover both K/DA releases, the Radiance SP cards and the Couture Collection, in one gallery. The [T1 cards](/guides/riftbound-t1-cards) cover every printing of the T1 2025 Worlds Champion Collection, including the serial-numbered Signatures. The [Secret Garden Bundle](/blog/riftbound-secret-garden-bundle) is the convention-only box with Lillia, Ivern and the Ultrasoft Poro. And the six [Crystal Rose cards](/guides/riftbound-vendetta-crystal-rose-cards) are Vendetta's own crossover alternate arts, pulled from ordinary packs.

---

*Sources: Riot Games' Worlds Bundle 2025 and Worlds 2026 Edition announcements on playriftbound.com (contents, prices, dates). Card prices are TCGplayer's market prices read on ${READ}; the galleries show live prices from every store we track.*`,
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    slug: "riftbound-kda-collection",
    category: "guide",
    title: "Riftbound K/DA Cards: Every K/DA Printing & Price",
    seoTitle: "Riftbound K/DA Cards: Couture Collection, SP Cards & Prices",
    excerpt:
      "Every Riftbound K/DA card in one live gallery: Radiance's five SP cards, the five K/DA Couture Collection cards and the signed Legends, with prices.",
    author: "RiftCompare",
    date: "2026-11-20",
    readMins: 9,
    tags: ["k/da", "k/da couture", "radiance", "collecting", "alt art"],
    summary: [
      "**Two sets of K/DA cards exist.** Radiance's five SP cards (SP1/005 to SP5/005: Ahri, Akali, Evelynn, Kai'Sa and Seraphine) come from ordinary Radiance packs. The **K/DA Couture Collection** (US$150, Riot drawing only) has five more, with new Fortiche art: Ahri, Evelynn, Kai'Sa, Akali and the Packed Amphitheater Battlefield.",
      `**Couture prices on ${READ} (TCGplayer market):** Kai'Sa US$81.52, Evelynn US$73.74, Ahri US$63.65, Akali US$60.35, Packed Amphitheater US$37.89. A sealed Couture Collection was US$276.58.`,
      "The Couture cards reprint four existing Legends and a Battlefield, so the gallery also shows the signed overnumbered Legends of the same champions, the K/DA printings collectors usually compare them with.",
      "Every card opens a quick view with its live price in your market.",
    ],
    faq: [
      {
        q: "How many K/DA cards are there in Riftbound?",
        a: "Ten with K/DA art, in two groups. Radiance has five SP cards numbered SP1/005 to SP5/005 (Ahri, Confident; Akali, Brash; Evelynn, In Control; Kai'Sa, Rebel; Seraphine, Not Alone). The K/DA Couture Collection has five more, numbered 001 to 005 of 005: Ahri, Nine-Tailed Fox; Evelynn, Agony's Embrace; Kai'Sa, Daughter of the Void; Akali, Rogue Assassin; and the Packed Amphitheater Battlefield.",
      },
      {
        q: "How much are the K/DA Couture Collection cards worth?",
        a: `On ${READ} TCGplayer's market prices were US$81.52 for Kai'Sa, US$73.74 for Evelynn, US$63.65 for Ahri, US$60.35 for Akali and US$37.89 for Packed Amphitheater, about US$317 for all five. A sealed collection sold for US$276.58. The gallery on this page shows live prices.`,
      },
      {
        q: "How do I get the K/DA Couture Collection?",
        a: "Only through Riot. It cost US$150 plus shipping at the Riot Games Merch Store, through a drawing whose registration ran from 27 to 30 October 2026, with selection emails from 3 November. Riot also sells it at Convergence Fest, 11 to 13 December 2026. No store sells it, so every other copy is resale.",
      },
      {
        q: "Are the K/DA Couture cards signed?",
        a: "Riot's announcement does not say they are. TCGplayer lists them with a star in the number (001*/005 and so on), the mark Riftbound uses for signed cards elsewhere, so check the photo of any copy you buy. We file them by Riot's description: new art, numbered 001 to 005 of 005.",
      },
      {
        q: "Are the Radiance K/DA SP cards rare?",
        a: "They come from ordinary Radiance booster packs, at the rate of other Showcase cards, the same way Vendetta's Crystal Rose cards are numbered SP1 to SP6. No special product is needed to pull one.",
      },
      {
        q: "What else is in the K/DA Couture Collection box?",
        a: "A playmat, a deck box, card sleeves, four metal D12 dice and a FIRESTARTER KiT keychain, alongside the five cards. It comes in English and Chinese.",
      },
    ],
    shop: [
      { label: "K/DA Couture Collection on eBay", query: "Riftbound K/DA Couture" },
      { label: "Riftbound K/DA cards on eBay", query: "Riftbound K/DA" },
    ],
    browseCta: {
      href: "/sets/radiance",
      label: "See every Radiance card's price →",
      blurb: "The K/DA SP cards, every Signature and every overnumber, ranked by cheapest live price.",
    },
    embeds: [
      {
        title: "K/DA Couture Collection: the five Fortiche cards",
        note: "Drawing-only printings with new art, numbered 001 to 005 of 005.",
        slugs: [
          "ahri-nine-tailed-fox-kdc-001-005-promo",
          "evelynn-agony-s-embrace-kdc-002-005-promo",
          "kai-sa-daughter-of-the-void-kdc-003-005-promo",
          "akali-rogue-assassin-kdc-004-005-promo",
          "packed-amphitheater-kdc-005-005-promo",
        ],
        ebaySearch: true,
      },
      {
        title: "Radiance's five K/DA SP cards",
        note: "SP1/005 to SP5/005, pulled from ordinary Radiance packs.",
        slugs: [
          "ahri-confident-rad-sp1-005",
          "akali-brash-rad-sp2-005",
          "evelynn-in-control-rad-sp3-005",
          "kai-sa-rebel-rad-sp4-005",
          "seraphine-not-alone-rad-sp5-005",
        ],
        ebaySearch: true,
      },
      {
        title: "The same champions as signed overnumbers",
        note: "The pack-pulled premium printings of the cards the Couture Collection reprints.",
        slugs: [
          "ahri-nine-tailed-fox-ogn-303s-298",
          "evelynn-agony-s-embrace-rad-175s-167",
          "kai-sa-daughter-of-the-void-ogn-299s-298",
          "akali-rogue-assassin-ven-189s-166",
          "packed-amphitheater-rad-184-167",
        ],
      },
    ],
    body: `K/DA, League of Legends' virtual pop group, has now had two Riftbound releases. **Radiance**, the fifth set, put five K/DA cards in its booster packs, and Riot followed with the **K/DA Couture Collection**, a drawing-only box with five more cards in new art by Fortiche, the studio behind Arcane. This page gathers every K/DA printing we track into live galleries: what each card is, how to get it and what it sells for.

Click any card for its quick view: the cheapest price in your market, every store and eBay listing we found, and its price history.

## The K/DA Couture Collection

Riot announced the **Riftbound x K/DA: Couture Collection** in October 2026 at **US$150 plus shipping**, in English and Chinese. It holds five cards, all new printings of cards that already exist:

- **Ahri, Nine-Tailed Fox** (001/005), a Legend
- **Evelynn, Agony's Embrace** (002/005), a Legend
- **Kai'Sa, Daughter of the Void** (003/005), a Legend
- **Akali, Rogue Assassin** (004/005), a Legend
- **Packed Amphitheater** (005/005), a Battlefield

[[embed:0]]

The box also has a playmat, a deck box, sleeves, four metal D12 dice and a FIRESTARTER KiT keychain. It was sold through a drawing on the Riot Games Merch Store: registration ran from **27 to 30 October 2026**, the first selection emails went out on **3 November**, and each person selected had 24 hours to buy. Riot also sells it in person at **Convergence Fest, 11 to 13 December 2026**. We covered the announcement in [K/DA Couture Collection and Worlds 2026 Edition](/blog/riftbound-kda-couture-collection-worlds-2026-edition), and the box itself in [the Couture Collection post](/blog/riftbound-kda-couture-collection).

### What the Couture cards cost now

TCGplayer's market prices on ${READ}:

| Card | Number | Market price |
|---|---|---|
| Kai'Sa, Daughter of the Void | 003/005 | US$81.52 |
| Evelynn, Agony's Embrace | 002/005 | US$73.74 |
| Ahri, Nine-Tailed Fox | 001/005 | US$63.65 |
| Akali, Rogue Assassin | 004/005 | US$60.35 |
| Packed Amphitheater | 005/005 | US$37.89 |
| K/DA Couture Collection, sealed | | US$276.58 |

The five cards add up to about **US$317**, a little over twice what Riot charged for the whole box. A sealed collection sells for slightly less than its cards do loose, so if you want all five cards, a sealed box is the cheaper way to get them today.

### Are they signed?

Riot's announcement does not describe these cards as signed or serial-numbered. TCGplayer lists them with a star in the number (001*/005), the mark Riftbound uses for signed printings, so look at the photo of any copy you buy. We file them as Riot describes them, numbered 001 to 005 of 005, under their own set, "Riftbound x K/DA: Couture Collection".

## Radiance's five K/DA SP cards

The first K/DA cards came in **Radiance** packs, numbered **SP1/005 to SP5/005**:

- **Ahri, Confident** (SP1)
- **Akali, Brash** (SP2)
- **Evelynn, In Control** (SP3)
- **Kai'Sa, Rebel** (SP4)
- **Seraphine, Not Alone** (SP5)

[[embed:1]]

The SP range is the same numbering Vendetta used for its six [Crystal Rose cards](/guides/riftbound-vendetta-crystal-rose-cards): a short run of alternate arts outside the set's main checklist, at the rate of other Showcase cards. You do not need a special product to pull one; any Radiance booster can hold one. Our [Radiance K/DA cards post](/blog/riftbound-kda-cards) explains the numbering in more detail, and [every Radiance Signature](/blog/riftbound-radiance-signature-cards) covers the set's signed cards.

Seraphine is the one member of K/DA who is not in the Couture Collection; the Packed Amphitheater Battlefield takes her place as the fifth card. Seraphine has her own collector printing elsewhere, in the T1 collection (see below).

## The same champions in other premium printings

The four Couture Legends are cards that already have premium printings from ordinary packs: signed overnumbered Legends with the artist's signature and a star in the number. Collectors compare the two, because they are the same card in two very different treatments.

[[embed:2]]

Prices on these move a lot from market to market, and several have few recorded sales, so the gallery's live price is the number to use. Packed Amphitheater's premium printing is its Radiance Showcase, 184/167.

## Every K/DA card at a glance

| Card | Number | Where it comes from |
|---|---|---|
| Ahri, Confident | RAD SP1/005 | Radiance booster packs |
| Akali, Brash | RAD SP2/005 | Radiance booster packs |
| Evelynn, In Control | RAD SP3/005 | Radiance booster packs |
| Kai'Sa, Rebel | RAD SP4/005 | Radiance booster packs |
| Seraphine, Not Alone | RAD SP5/005 | Radiance booster packs |
| Ahri, Nine-Tailed Fox | KDC 001/005 | K/DA Couture Collection |
| Evelynn, Agony's Embrace | KDC 002/005 | K/DA Couture Collection |
| Kai'Sa, Daughter of the Void | KDC 003/005 | K/DA Couture Collection |
| Akali, Rogue Assassin | KDC 004/005 | K/DA Couture Collection |
| Packed Amphitheater | KDC 005/005 | K/DA Couture Collection |

Two things are easy to mix up. The SP cards and the Couture cards are **different cards**, not two printings of the same ones: the SP cards are Ahri, Confident and Akali, Brash, while the Couture cards are Ahri, Nine-Tailed Fox and Akali, Rogue Assassin. A deck that wants one cannot use the other. And the Couture cards share their names with cards that already have ordinary printings in Origins, Vendetta and Radiance, so a listing that just says "Ahri, Nine-Tailed Fox" is far more likely to be the ordinary card than the Couture one. The number settles it every time.

## A short K/DA timeline

- **October 2026: Radiance.** The fifth set releases with the five SP cards in its packs, the first time all five K/DA members appear in Riftbound together.
- **27 to 30 October 2026: the Couture drawing.** Registration runs on the Riot Merch Store; the first selection emails go out on 3 November.
- **November 2026: first sales.** Couture cards start trading as boxes arrive, and TCGplayer lists all five with their own product pages, which is when we could add them with prices.
- **11 to 13 December 2026: Convergence Fest.** Riot sells the Couture Collection in person, while supplies last.

The in-person sale is the one date that could move prices: any new supply of a box with no reprint tends to show up in the cheapest listings first. A price watch on the card you want catches it.

## Where these prices come from

Every price in the tables above is TCGplayer's, read on ${READ}: its **market price**, the average of recent completed sales, where one exists, and its **lowest listing** where none does yet. They are dated because collector prices move quickly, and a number without a date is not worth much. The galleries on this page are live instead: each card shows the cheapest copy we found today in your market and currency, across every store we track, TCGplayer and eBay included, and its page keeps the price history from the day we started recording it. If a card has no price at all, nobody we track is selling it right now; a price watch sends one email when a copy is listed.

## Which K/DA card to buy

It depends on what you want the card for.

- **To play K/DA art in a deck,** the SP cards are the obvious choice. They are tournament legal, they come from packs and singles are widely listed.
- **To own the Fortiche art,** the Couture cards are the only option, and buying one card loose is far cheaper than a sealed box if you only want one champion.
- **For a complete set of all ten,** price the Couture cards first: they cost the most, and a sealed Couture box can work out cheaper than five loose cards.

A [price watch](/alerts) on any card here sends one email when its price drops below the number you set.

## How to buy K/DA cards safely

1. **Check the number.** "Ahri, Nine-Tailed Fox" is printed several ways. The Couture card is 001/005; the Origins overnumber is 303/298; the regular Origins card costs a few dollars. The number in the listing, and the photo, tell you which one you are buying.
2. **Compare against the market price.** A rare card's cheapest listing is often well away from what copies sell for. The quick view shows both where we have them.
3. **Ask whether a sealed box has been opened.** Some sellers list a Couture Collection with its cards removed and only the accessories inside.
4. **Expect Chinese copies.** The Couture Collection was printed in English and Chinese. Our prices are for English copies; a Chinese card is a different printing.

## Other collector cards worth knowing

K/DA is one of several collector runs in Riftbound. The [Worlds cards](/guides/riftbound-worlds-cards) gather the Worlds Bundle 2025's Panda Teemo and Battlefields and the Worlds 2026 Edition. The [T1 cards](/guides/riftbound-t1-cards) cover every printing of the T1 2025 Worlds Champion Collection, including the Player Bundle's own art. The [Secret Garden Bundle](/blog/riftbound-secret-garden-bundle) is the convention-only box with Lillia, Ivern and the Ultrasoft Poro.

---

*Sources: Riot Games' K/DA Couture Collection announcement on playriftbound.com (contents, price, dates). Card prices are TCGplayer's market prices read on ${READ}; the galleries show live prices from every store we track.*`,
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    slug: "riftbound-t1-cards",
    category: "guide",
    title: "Riftbound T1 Cards: Every T1S & T1A Printing and Price",
    seoTitle: "Riftbound T1 Cards: Signature, Serial & Player Bundle",
    excerpt:
      "Every Riftbound T1 card in one gallery: the Signature Edition's T1S cards, the serial-numbered Signatures and the Player Bundle's T1A art, with prices.",
    author: "RiftCompare",
    date: "2026-11-20",
    readMins: 10,
    tags: ["t1", "esports", "collecting", "serial numbered", "promo"],
    summary: [
      "**Three kinds of T1 card exist.** The Signature Edition (US$360) has five cards numbered **T1S 001/005 to 005/005**, and one card per box is **serial numbered** with a gold-stamped signature. The Player Bundle (US$70) has the same five champions in different art, numbered **T1A 001/005 to 005/005**.",
      `**Signature Edition prices on ${READ} (TCGplayer market):** Galio US$1,498, Miss Fortune US$1,300, Seraphine US$1,233.33, Xin Zhao US$447.40, Ambessa US$387. The lowest serial-numbered asks were Galio US$14,000, Miss Fortune US$5,999 and Ambessa US$5,000.`,
      "**Player Bundle cards** are far cheaper: Seraphine's market price was US$100, and the lowest asks for the other four were US$59.99 to US$99.99.",
      "Each T1 player picked one card: Doran Ambessa, Oner Xin Zhao, Faker Galio, Gumayusi Miss Fortune and Keria Seraphine.",
    ],
    faq: [
      {
        q: "What is the difference between T1S and T1A Riftbound cards?",
        a: "T1S is the number on the five cards of the T1 2025 Worlds Champion Signature Edition (US$360), which use a foiling made for that release. T1A is the number on the Player Bundle's five cards (US$70): the same champions in different art, with no signature and no serial number.",
      },
      {
        q: "How much are the T1 Signature Edition cards worth?",
        a: `On ${READ} TCGplayer's market prices were US$1,498 for Galio, US$1,300 for Miss Fortune, US$1,233.33 for Seraphine, US$447.40 for Xin Zhao and US$387 for Ambessa. A sealed Signature Edition sold for US$5,704.01. Live prices are in the gallery on this page.`,
      },
      {
        q: "How many serial-numbered T1 cards are there?",
        a: "Each Signature Edition box has one serial-numbered card, numbered from 1 to 2025, and Riot made 10,125 boxes per language (English, Chinese and Korean). Five champions share the run, so about 2,025 serial-numbered English copies exist of each champion.",
      },
      {
        q: "How much is a serial-numbered T1 Galio?",
        a: `No serial-numbered T1 card had a TCGplayer market price on ${READ}, because too few have sold. The lowest asking prices were US$14,000 for Faker's Galio, US$5,999 for Miss Fortune and US$5,000 for Ambessa. An asking price is not a sale price.`,
      },
      {
        q: "Which T1 player picked which card?",
        a: "Doran picked Ambessa, The Wolf; Oner picked Xin Zhao, Vigilant; Faker picked Galio, Indefatigable; Gumayusi picked Miss Fortune, Buccaneer; and Keria picked Seraphine, Not Alone.",
      },
      {
        q: "Can I still buy the T1 Player Bundle from Riot?",
        a: "Its drawing ran from 13 to 16 November 2026, with selection emails from 17 November. After that, copies come only from resale. The bundle cost US$70 (CN¥399, KR₩100,000) and includes sleeves, a deck box, a binder and a metal die, one in ten of them black and gold.",
      },
    ],
    shop: [
      { label: "T1 Signature Edition on eBay", query: "Riftbound T1 Signature Edition" },
      { label: "T1 Player Bundle on eBay", query: "Riftbound T1 Player Bundle" },
    ],
    browseCta: {
      href: "/browse",
      label: "Browse every Riftbound card's price →",
      blurb: "Every set, promo and collector printing, ranked by cheapest live price.",
    },
    embeds: [
      {
        title: "Signature Edition: the five T1S cards",
        note: "T1S 001/005 to 005/005, in the foiling made for this release.",
        slugs: [
          "ambessa-the-wolf-t1s-001-005-promo",
          "xin-zhao-vigilant-t1s-002-005-promo",
          "galio-indefatigable-t1s-003-005-promo",
          "miss-fortune-buccaneer-t1s-004-005-promo",
          "seraphine-not-alone-t1s-005-005-promo",
        ],
        ebaySearch: true,
      },
      {
        title: "Serial numbered, with a gold-stamped signature",
        note: "One per Signature Edition box, numbered 1 to 2025. These are the ones TCGplayer lists so far.",
        slugs: [
          "galio-indefatigable-t1s-003s-005-promo",
          "ambessa-the-wolf-t1s-001s-005-promo",
          "miss-fortune-buccaneer-t1s-004s-005-promo",
        ],
      },
      {
        title: "Player Bundle: the five T1A cards",
        note: "The same champions in the Player Bundle's own art, with no signature or serial number.",
        slugs: [
          "ambessa-the-wolf-t1a-001-005-promo",
          "xin-zhao-vigilant-t1a-002-005-promo",
          "galio-indefatigable-t1a-003-005-promo",
          "miss-fortune-buccaneer-t1a-004-005-promo",
          "seraphine-not-alone-t1a-005-005-promo",
        ],
        ebaySearch: true,
      },
      {
        title: "The ordinary printings of the same champions",
        note: "The cards T1 picked, as they come in booster packs.",
        slugs: [
          "ambessa-the-wolf-ven-084",
          "xin-zhao-vigilant-sfd-176-221",
          "galio-indefatigable-unl-171-219",
          "miss-fortune-buccaneer-ogn-193-298",
        ],
      },
    ],
    body: `T1 won its sixth League of Legends World Championship in 2025, its third in a row, and Riot marked it with Riftbound's first collection made with a single esports team. It came in two boxes, the **Signature Edition** and the **Player Bundle**, and between them they printed the same five champions three ways. This page puts every T1 card we track into live galleries, explains how to tell the printings apart, and gives what each one sells for.

Click any card for its quick view: the cheapest price in your market, every store and eBay listing we found, and its price history.

## The five cards, picked by the players

Each member of T1's championship roster chose one card:

| Player | Card | Number |
|---|---|---|
| Choi "Doran" Hyeon-jun | Ambessa, The Wolf | 001/005 |
| Moon "Oner" Hyeon-joon | Xin Zhao, Vigilant | 002/005 |
| Lee "Faker" Sang-hyeok | Galio, Indefatigable | 003/005 |
| Lee "Gumayusi" Min-hyeong | Miss Fortune, Buccaneer | 004/005 |
| Ryu "Keria" Min-seok | Seraphine, Not Alone | 005/005 |

The numbers are the same in both boxes. What tells the printings apart is the prefix printed in the bottom-left corner: **T1S** for the Signature Edition and **T1A** for the Player Bundle.

## The Signature Edition (T1S)

The **T1 2025 Worlds Champion Signature Edition** cost **US$360** (CN¥2,025, KR₩500,000), sold through a Riot Merch Store drawing in August 2026, with **10,125 boxes per language** in English, Chinese and Korean. Its five cards use a foiling effect made for this release, in a frame of their own.

[[embed:0]]

TCGplayer's market prices on ${READ}:

| Card | Number | Market price |
|---|---|---|
| Galio, Indefatigable (Faker) | T1S 003/005 | US$1,498.00 |
| Miss Fortune, Buccaneer (Gumayusi) | T1S 004/005 | US$1,300.00 |
| Seraphine, Not Alone (Keria) | T1S 005/005 | US$1,233.33 |
| Xin Zhao, Vigilant (Oner) | T1S 002/005 | US$447.40 |
| Ambessa, The Wolf (Doran) | T1S 001/005 | US$387.00 |
| Signature Edition, sealed | | US$5,704.01 |

The order follows the players more than the cards. Faker's Galio leads, as it has since the collection was announced. Keria's Seraphine and Gumayusi's Miss Fortune sit close together, and the two cards picked by the top-side players, Doran and Oner, cost about a quarter as much. A sealed box at US$5,704.01 is worth roughly 16 times its US$360 price, because it may hold a serial-numbered card.

## The serial-numbered Signatures

Every Signature Edition box has **one serial-numbered card**, numbered from **1 to 2025**, with a **gold-stamped signature** from the player who picked it. Five champions share that run of 2,025, so across 10,125 English boxes there are about **2,025 serial-numbered English copies of each champion**, and roughly 6,075 worldwide across the three languages. Each number exists once per language: there is one #0001 Galio in English and there will never be another.

We number these cards with a star, as Riftbound does for every signed card: T1S 003*/005 is Faker's serial-numbered Galio.

[[embed:1]]

TCGplayer lists serial-numbered products for **Galio, Miss Fortune and Ambessa** so far. On ${READ} none had a market price, because too few have sold, and the lowest asking prices were:

| Card | Lowest ask |
|---|---|
| Galio, Indefatigable, serial numbered | US$14,000 |
| Miss Fortune, Buccaneer, serial numbered | US$5,999 |
| Ambessa, The Wolf, serial numbered | US$5,000 |

An asking price is what one seller hopes to get, not what a buyer has paid. Sellers also price particular numbers (a low one, or #2025) differently, so a single listing tells you little about any other copy. TCGplayer has no product for the serial-numbered Xin Zhao or Seraphine yet; we will add each the day it is listed.

## The Player Bundle (T1A)

The **T1 2025 Worlds Champion Player Bundle** cost **US$70** (CN¥399, KR₩100,000). It has the same five champions in **different art**, with no signature and no serial number, plus sleeves, a deck box, a binder and a metal die (one die in ten is black and gold). Its drawing ran from **13 to 16 November 2026**, alongside the Worlds 2026 Edition (see [the Worlds cards](/guides/riftbound-worlds-cards)).

[[embed:2]]

Prices for the Player Bundle cards on ${READ}: Seraphine had a market price of US$100; the others had no sales yet, and their lowest asks were Ambessa US$59.99, Xin Zhao US$65, Galio US$99.99 and Miss Fortune US$99.99. A sealed Player Bundle was US$254.71. These are the cheapest way to own T1's art.

## Signature Edition or Player Bundle: which to buy

For most people who like these cards, the Player Bundle's, and it is not close on price.

Do it as arithmetic. Riot charged US$360 for the Signature Edition and US$70 for the Player Bundle, so the difference was **US$290**, and that bought three things: the T1S foiling, the chance that the box's serial-numbered card is a good one, and a box built for display. Five champions with exclusive art came in both. On the resale market the gap is far wider: the five T1S cards together cost over US$4,800 at their market prices, while the five T1A cards cost about US$425 at their lowest asks.

So the question is what you want:

- **Faker's Galio on your shelf, in art made for T1:** the T1A Galio does that for about a fifteenth of the T1S price.
- **The Signature Edition's own foil printing:** only a T1S card will do, and the two top-side picks, Ambessa and Xin Zhao, are the affordable way in.
- **A numbered card that only about 2,025 people can own:** only a serial-numbered Signature, and nothing else in Riftbound comes close to its price.
- **To play the cards:** the ordinary printings, below, cost a few dollars at most.

Remember that the T1A prices are mostly asking prices, because few have sold yet. Once more copies change hands, the market price on each card's page is the better guide.

## How to tell the printings apart

Five champions, four printings each. The quickest checks:

1. **The prefix in the bottom-left corner.** T1S is the Signature Edition; T1A is the Player Bundle. An ordinary booster card has its set's code instead (VEN, SFD, UNL or OGN).
2. **The serial number.** Only a Signature Edition's serial-numbered card carries a number out of 2025 and a gold signature. A T1S card without one is the Signature Edition's ordinary card, still worth hundreds of dollars.
3. **The art.** The Player Bundle's art is different from the Signature Edition's, so a photo settles it.

If a listing doesn't show the corner of the card, ask for a photo of it. At these prices, a T1A card sold as a T1S one is a costly mistake.

## The ordinary printings

The cards T1 picked are also ordinary playable cards, from booster packs, that cost a few dollars or less. If you want to play Faker's Galio in a deck, this is the whole cost:

[[embed:3]]

Seraphine, Not Alone is from Radiance; her ordinary printing is in the Radiance set, and her K/DA SP card is in [our K/DA card guide](/guides/riftbound-kda-collection).

## Where these prices come from

Every price in the tables above is TCGplayer's, read on ${READ}: its **market price**, the average of recent completed sales, where one exists, and its **lowest listing** where none does yet. They are dated because collector prices move quickly, and a number without a date is not worth much. The galleries on this page are live instead: each card shows the cheapest copy we found today in your market and currency, across every store we track, TCGplayer and eBay included, and its page keeps the price history from the day we started recording it. If a card has no price at all, nobody we track is selling it right now; a price watch sends one email when a copy is listed.

## Why the T1 cards cost so much

Four things set the price, and only one is the card itself:

- **A fixed print run with no reprint.** Riot capped the Signature Edition at 10,125 boxes per language, and the serial range is the year of the title.
- **No retail channel.** No store ever sold these boxes, so the only price was the US$360 drawing price, and that closed in August.
- **The players.** Faker's card has led every list since day one.
- **Serial numbers are one of a kind.** Riot's returns policy refunds the whole box when a serial card is damaged, because it cannot make another.

What does **not** set the price is the card's strength in a game: every one of these champions is cheap as an ordinary card. Our [T1 collection post](/blog/riftbound-t1-worlds-champion-collection) has the full story of the release.

A [price watch](/alerts) on any card here sends one email when its price drops below the number you set.

## Other collector cards worth knowing

The [Worlds cards](/guides/riftbound-worlds-cards) gather the Worlds Bundle 2025's Panda Teemo and city Battlefields and the Worlds 2026 Edition. The [K/DA cards](/guides/riftbound-kda-collection) cover both K/DA releases. The [Secret Garden Bundle](/blog/riftbound-secret-garden-bundle) is the convention-only box with Lillia, Ivern and the Ultrasoft Poro, and the [Crystal Rose cards](/guides/riftbound-vendetta-crystal-rose-cards) are Vendetta's crossover alternate arts.

---

*Sources: Riot Games' T1 2025 Worlds Champion Collection announcement and Merch Store updates on playriftbound.com (contents, print run, prices, dates). Card prices are TCGplayer's market prices and lowest listings read on ${READ}; the galleries show live prices from every store we track.*`,
  },
];
