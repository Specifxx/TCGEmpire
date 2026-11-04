// Riot's late-2026 drawing products (owner, 2026-11-04: "the K/DA couture
// collection as well as the new worlds 2026 bundle … we need those asap and you
// should add a blog post too"). One post for both, because they are one story:
// the same Riot Merch Store drawing mechanism, overlapping dates, and one buyer
// deciding which to register for. Every fact is from Riot's own announcement,
// "Riftbound's 2026 Drawings" (playriftbound.com), the same source as
// lib/riot-drawings.ts, which the homepage row reads; the card prices are
// TCGplayer's market price in the 4 November 2026 public export
// (data/public/cards.json), dated in the copy. No forecast anywhere. Over the
// 1,500-word policy (tests/content-links).
import type { Article } from "../articles";
import { RIOT_DRAWINGS, RIOT_DRAWINGS_URL } from "../riot-drawings";

const KDA = RIOT_DRAWINGS[0];
const W26 = RIOT_DRAWINGS[1];

export const RIOT_DRAWINGS_ARTICLES: Article[] = [
  {
    slug: "riftbound-kda-couture-collection-worlds-2026-edition",
    category: "blog",
    title: "K/DA Couture Collection and Worlds 2026 Edition: What's in Each Box, Prices and Drawing Dates",
    seoTitle: "Riftbound K/DA Couture Collection & Worlds 2026 Edition",
    excerpt:
      "Riot's two drawing-only boxes: the US$150 K/DA Couture Collection and the US$80 Worlds 2026 Edition. Every card and extra, and the registration dates.",
    author: "RiftCompare",
    date: "2026-11-04",
    readMins: 9,
    tags: ["news", "collectibles", "sealed", "esports"],
    hero: { src: KDA.imageUrl, alt: KDA.imageAlt },
    summary: [
      "**Riftbound x K/DA: Couture Collection, US$150 plus shipping:** four K/DA Legends (Evelynn, Ahri, Akali, Kai'Sa) and the Packed Amphitheater battlefield with new Fortiche art, plus a playmat, deck box, 75 sleeves, four metal D12 dice and a FIRESTARTER KiT keychain. Registration ran 27–30 October 2026; selection emails from 3 November.",
      "**Riftbound x Worlds 2026 Edition, US$80 plus shipping:** a Worlds-exclusive Yasuo, Unforgiven Legend promo, three host-city Battlefield promos (Los Angeles, Allen, New York City), a Worlds 2026 deck box and foil sleeves. Registration **13–16 November 2026**; emails from 17 November.",
      "**Neither is sold by a store.** Both come only from the Riot Games Merch Store drawing or the event stands, so there is no store price to compare. RiftCompare watches eBay for resale and shows it on each product's sealed page as listings appear.",
      "The T1 2025 Worlds Champion Player Bundle (US$70) has its own drawing on the same November dates.",
    ],
    faq: [
      {
        q: "How much is the Riftbound K/DA Couture Collection?",
        a: "US$150 plus shipping and handling at the Riot Games Merch Store, in English or Chinese. That is Riot's published price; it is not sold through stores, so there is no retail price to compare and any other price is resale.",
      },
      {
        q: "When is the K/DA Couture Collection drawing?",
        a: "Registration opened on 27 October 2026 at 9:00 AM PT and closed on 30 October at 9:00 AM PT. The first selection emails went out on 3 November 2026, and each selected entrant has 24 hours to complete the purchase. Riot also sells it in person at Convergence Fest, 11–13 December 2026.",
      },
      {
        q: "What is in the Riftbound Worlds 2026 Edition?",
        a: "One Legend promo, Unforgiven (Yasuo), with art exclusive to Worlds; three Battlefield promos with art of the host cities Los Angeles, Allen and New York City; a Worlds 2026 deck box; and a pack of Worlds 2026 foil card sleeves. Online orders also include the Worlds Unvaulted Capsule 2026, an in-game League of Legends item, which venue copies do not.",
      },
      {
        q: "How do I enter the Worlds 2026 Edition drawing?",
        a: "Register free at the Riot Games Merch Store between 13 November 2026, 9:00 AM PT, and 16 November, 9:00 AM PT. Selection emails start on 17 November and give 24 hours to buy. The bundle is also sold while supplies last at the Worlds Quarterfinals and Semifinals in Allen, Texas, and at Worlds Fan Fest in New York City.",
      },
      {
        q: "Are the K/DA Couture Collection cards new cards?",
        a: "They are new printings with new K/DA artwork by Fortiche of five cards that already exist: the Legends Evelynn, Agony's Embrace; Ahri, Nine-Tailed Fox; Akali, Rogue Assassin; Kai'Sa, Daughter of the Void; and the Packed Amphitheater battlefield. The regular printings are priced on RiftCompare today.",
      },
      {
        q: "Where can I see resale prices for these boxes?",
        a: "On RiftCompare's sealed comparison, once copies are listed. Each product has its own page, with eBay listings in each market we track, and the row shows how far a resale price sits from Riot's US$150 and US$80. The homepage links both products while the drawings run.",
      },
    ],
    shop: [
      { label: "K/DA Couture Collection on eBay", query: "Riftbound K/DA Couture Collection" },
      { label: "Worlds 2026 Edition on eBay", query: "Riftbound Worlds 2026 Edition" },
      { label: "T1 Player Bundle on eBay", query: "Riftbound T1 Worlds Champion Player Bundle" },
    ],
    embeds: [
      {
        title: "The five K/DA Couture Collection cards, in their regular printings",
        note: "The Couture Collection reprints these with new K/DA art. These are the ordinary printings, with live store prices; the collection's own printings get pages once copies are listed.",
        slugs: [
          "evelynn-agony-s-embrace-rad-153-167",
          "ahri-nine-tailed-fox-ogn-255-298",
          "akali-rogue-assassin-ven-139",
          "kai-sa-daughter-of-the-void-ogn-247-298",
          "packed-amphitheater-rad-164-167",
        ],
      },
      {
        title: "Yasuo, Unforgiven: the Legend the Worlds 2026 promo reprints",
        note: "The Origins Legend and its Showcase printings. The Worlds 2026 Edition's copy has art exclusive to Worlds.",
        slugs: ["yasuo-unforgiven-ogn-259-298", "yasuo-unforgiven-ogn-305-298", "yasuo-unforgiven-ogn-305s-298"],
      },
      {
        title: "The K/DA cards Riftbound already has",
        note: "Radiance's five K/DA specials (SP1–SP5), the collaboration's first Riftbound cards. Not part of the Couture Collection; shown for the collector working out what the K/DA shelf now holds.",
        slugs: [
          "ahri-confident-rad-sp1-005",
          "akali-brash-rad-sp2-005",
          "evelynn-in-control-rad-sp3-005",
          "kai-sa-rebel-rad-sp4-005",
          "seraphine-not-alone-rad-sp5-005",
        ],
      },
    ],
    browseCta: {
      href: "/sealed",
      label: "Compare Riftbound sealed prices →",
      blurb: "Every booster box, bundle and collection, cheapest in-stock store first, with eBay resale where a store has none.",
    },
    body: `Riot has put two more Riftbound products behind its Merch Store drawing: the **Riftbound x K/DA: Couture Collection** at US$150 and the **Riftbound x Worlds 2026 Edition** at US$80. Neither will reach a game store. Like the [T1 2025 Worlds Champion Collection](/blog/riftbound-t1-worlds-champion-collection) before them, they are sold only to people picked in a free drawing and, in limited numbers, at Riot's own events. This post is everything Riot has published about each: what is in the box, what it costs, when to register and how the drawing works, plus where RiftCompare will show resale prices once copies change hands.

Every fact below is from Riot's announcement, [Riftbound's 2026 Drawings](${RIOT_DRAWINGS_URL}), and nothing here is a forecast. Where we quote a card price, it is TCGplayer's market price for the regular printing on 4 November 2026.

## The short version

| | K/DA: Couture Collection | Worlds 2026 Edition |
|---|---|---|
| **Price** | US$150 + shipping and handling | US$80 + shipping and handling |
| **Languages** | English and Chinese | English only |
| **Cards** | 4 Legends + 1 Battlefield, new K/DA art | 1 Legend promo + 3 Battlefield promos, Worlds art |
| **Extras** | Playmat, deck box, 75 sleeves, 4 metal D12 dice, FIRESTARTER KiT keychain | Deck box, foil sleeves; online orders add an in-game capsule |
| **Registration** | 27 Oct, 9:00 AM PT – 30 Oct, 9:00 AM PT 2026 (closed) | 13 Nov, 9:00 AM PT – 16 Nov, 9:00 AM PT 2026 |
| **Selection emails** | From 3 November 2026 | From 17 November 2026 |
| **In person** | Convergence Fest, 11–13 December | Worlds Quarterfinals and Semifinals (Allen, Texas), Worlds Fan Fest (New York City) |
| **Ships** | 1–3 business days after the order | From mid-December |

## Riftbound x K/DA: Couture Collection

K/DA is Riot's virtual pop group: Ahri, Akali, Evelynn and Kai'Sa, with Seraphine joining for the second record. Riftbound already has a K/DA shelf, the five Radiance specials numbered SP1 to SP5, so this is the second time the group has reached the card game, and the first time it has had a product of its own.

The Couture Collection is a premium bundle, and the cards are the reason to want it. Riot lists:

${KDA.contents.map((c) => `- ${c}`).join("\n")}

**The four Legends are the champions' existing Legend cards with new K/DA artwork by Fortiche**, the animation studio behind Arcane. That matters for two reasons. First, there is nothing new to learn: Evelynn, Agony's Embrace is still a Radiance Legend; Ahri, Nine-Tailed Fox and Kai'Sa, Daughter of the Void are still the Origins Legends; Akali, Rogue Assassin is still Vendetta's. A deck built around any of them can swap the Couture printing straight in. Second, each has a regular printing with a live price, so a buyer can see what the card is worth before the collection's own printing has a resale market of its own. On 4 November TCGplayer's market price for the regular [Ahri, Nine-Tailed Fox](/card/ahri-nine-tailed-fox-ogn-255-298) was US$10.88, for [Kai'Sa, Daughter of the Void](/card/kai-sa-daughter-of-the-void-ogn-247-298) US$21.51, and for the Showcase Ahri (303/298) US$61.60. The Couture printings will not trade at those numbers; they are drawing-only, and the T1 collection's cards showed what a few thousand copies with a Riot stamp do to a price. But they tell you which of the four is the most played.

[[embed:0]]

**Packed Amphitheater** is the fifth card: a Radiance battlefield, here with K/DA art of the stage it is named for. It is the one card in the box that is not a Legend, and the one most likely to end up in a binder rather than a deck.

The rest of the box is accessories, all K/DA limited editions: a playmat, a deck box, a pack of 75 sleeves and four D12 metal dice, one per member. The odd one out is the **FIRESTARTER KiT keychain**, which Riot says connects to a phone and plays K/DA's newest single and its official music video. It comes with a user manual. We have not handled one, so we cannot say more about how it works than Riot has.

**Price and languages.** US$150 plus shipping and handling, in English or Chinese. The Chinese edition is a different product for resale purposes, exactly as the T1 Signature Edition's Chinese and Korean boxes were, and RiftCompare will keep its price apart from the English one rather than blending the two.

**The drawing.** Registration opened on 27 October 2026 at 9:00 AM PT and closed on 30 October at 9:00 AM PT, so by the time you read this the window has shut. Selection emails began on 3 November; a selected entrant has 24 hours to complete the purchase, and Riot reallocates unclaimed stock to further rounds, so the emails continue until the stock is gone. Fulfilment starts within one to three business days of an order. If you missed the window, the one remaining first-hand route is in person: Riot says the collection will be sold on site at **Convergence Fest, 11–13 December 2026**.

## Riftbound x Worlds 2026 Edition

The Worlds 2026 Edition is the League of Legends World Championship's Riftbound bundle, and the cheaper and simpler of the two boxes. Riot lists:

${W26.contents.map((c) => `- ${c}`).join("\n")}

**The Legend is Unforgiven, that is Yasuo, Unforgiven, the Origins Legend**, in art Riot describes as exclusive to Worlds. The regular printing's TCGplayer market price was US$15.31 on 4 November, its Showcase (305/298) US$92.23 and its Signature (305\\*/298) US$230.52, so Yasuo already has an expensive shelf and this adds a printing that will exist in whatever number Riot made bundles.

[[embed:1]]

**The three Battlefields carry the host cities**: Los Angeles, Allen and New York City, the three stops of Worlds 2026. Riot has not published which battlefields they are reprints of, or whether they are new, so we are not guessing; we will add the cards to the catalogue when Riot shows them.

**The extras** are a Worlds 2026 deck box and a pack of Worlds 2026 foil card sleeves. An online order also includes the **Worlds Unvaulted Capsule 2026**, an in-game League of Legends item. Riot is explicit that the capsule comes with e-commerce orders, not with copies bought at the venues, so a fan who buys at Fan Fest gets the cards and the accessories and nothing for the game client.

**Price and language.** US$80 plus shipping and handling, English only.

**The drawing.** Registration opens on **13 November 2026 at 9:00 AM PT** and closes on **16 November at 9:00 AM PT**. In other time zones that is noon Eastern, 5:00 PM in the UK, 6:00 PM in Central Europe and, in Sydney, 4:00 AM on the 14th. Selection emails begin on 17 November, with the same 24-hour purchase window and the same reallocation of unclaimed stock. Fulfilment begins in mid-December, which for a December-dated order means it may or may not be under the tree.

**In person**, the bundle is sold while supplies last at the Worlds Quarterfinals and Semifinals in Allen, Texas, and at Worlds Fan Fest in New York City, throughout November. Riot has not published quantities for any venue.

## The third drawing on the same dates: the T1 Player Bundle

The 13–16 November window is shared with the **T1 2025 Worlds Champion Player Bundle**, the US$70 play-focused half of the T1 collection: the five T1 champions (Ambessa, Xin Zhao, Galio, Miss Fortune and Seraphine, Not Alone) in alternate art, with a deck box, a binder, sleeves and a D12 die that has a chance of being a rare gold variant. It is also sold at Fan Fest in New York, and ships from mid-December. Everything about it is in [our T1 collection explainer](/blog/riftbound-t1-worlds-champion-collection); it is mentioned here because a fan registering for the Worlds 2026 Edition will be registering in the same drawing window, and can enter both.

## How the Riot drawing works

The mechanism is the one Riot has used for every limited Riftbound product since the T1 Signature Edition, and it is worth being exact about, because it is not a pre-order and not a queue.

1. **Register for free** at the Riot Games Merch Store during the window, with a Riot account. Registering does not reserve anything and does not cost anything.
2. **Wait for the email.** Selection emails come from riotgames.com addresses on the published date, and Riot has said in the past that there is no catch-up pool: an entrant who missed an earlier drawing has the same odds as everyone else.
3. **Buy within 24 hours.** A selected entrant has a day to complete the purchase at the published price plus shipping. Miss it and the allocation goes back into the pool.
4. **Further rounds** follow until the stock is gone, which is why an unsuccessful first round is not the end.

Two things it is not. It is not a store listing, so nothing in it appears on [our sealed comparison](/sealed) at a shop price, and no local game store can order it for you. And it is not a pre-order, so the "sold out at 12 of 17 stores" pattern we track for [Legacy](/legacy-preorders) does not apply; there is no allocation to watch, only the email.

## What to expect on the resale market

We can say what the T1 collection did, and we can say what we will show, and we will not say what either box will be worth.

The T1 Signature Edition, the only comparable Riftbound product with a resale history, was priced at US$360 and ran its drawing in August 2026. Copies have been listed on eBay since, and the [sealed comparison](/sealed) has carried its English, Chinese and Korean boxes as separate rows since, each with the cheapest live listing and its distance from Riot's price. The Couture Collection and the Worlds 2026 Edition are wired the same way: each has its own product page, and the daily eBay pass searches for each box by name in every market we track, with a floor that keeps a loose Yasuo promo or a single K/DA Legend out of the box's row. Until a listing clears those checks, the page shows nothing rather than a guess.

Two reasons to expect the two boxes to behave differently from each other. The Couture Collection is a US$150 collectible with four Legends, a Chinese edition and an accessory set that is itself collectable; the Worlds 2026 Edition is US$80, English only, with one Legend and is also sold over the counter at three events, which means more copies in more hands with no drawing at all. Which way those cut, we will see in the listings, and when they appear the numbers go on the product pages, not in this post.

## What to do now

- **Worlds 2026 Edition:** register between 13 and 16 November. It is free, and the published price is the only first-hand price there will be.
- **K/DA Couture Collection:** the drawing is closed. If you are going to Convergence Fest in December, Riot will sell it there. If not, the resale page is the place to watch, and a [sealed watch](/sealed) emails you when a listing appears under the price you set.
- **Either box's cards:** the regular printings of all six cards are on RiftCompare today, priced across every store we track, so you can decide how much the new art is worth to you before a resale price asks.

We will update this post when Riot shows the three Worlds battlefields, and when the first resale listings land.`,
  },
];
