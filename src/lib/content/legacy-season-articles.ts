// Legacy season, first wave (2026-11-01, owner: "everything we did right for
// Radiance … we got to get into the legacy game as soon as possible"). Three
// posts, each for ONE query no page owned (docs/seo-keyword-map.md rows added
// the same day), each over the 1,500-word policy (tests/content-links):
//
//   riftbound-legacy-preorders-selling-out  "legacy preorder sold out" (news, the Reddit post's link)
//   where-to-buy-riftbound-legacy           "where to buy riftbound legacy"
//   riftbound-legacy-champion-decks         "legacy champion decks", "proving grounds 2nd edition"
//
// The pre-order PRICES stay owned by /legacy-preorders, which every post links
// in its first lines, and the set's facts by /sets/legacy (lib/sets/legacy.ts,
// the same sources: Riot's "Products and Sets into 2027" and the US distributor
// sheet). Every store price below is from the public sealed export of 31 Oct
// 2026 15:55 UTC (data/public/sealed-listings.json, LGC rows), counted by a
// script, never typed from memory, and dated in the copy: a pre-order price is
// what a store asked that day. "Sold out" is the store's own stock flag, checked
// by hand on Tier Zero's box page the same day. Card prices are TCGplayer's
// market price in the 31 Oct export (data/public/cards.json), never the
// cheapest listing, which had obvious outliers. No forecast anywhere.
//
// All tagged "legacy", so each carries the Legacy pre-order banner
// (components/LegacyPreorderCta.tsx) until release day.
import type { Article } from "../articles";

const DAY = "2026-11-01";
const HERO = {
  src: "/blog/riftbound-legacy-key-art.jpg",
  alt: "Riftbound: Legacy official key art, four champions in stained-glass regional panels around the Legacy logo",
};

export const LEGACY_SEASON_ARTICLES: Article[] = [
  {
    slug: "riftbound-legacy-preorders-selling-out",
    category: "blog",
    title: "Legacy Pre-Orders Are Already Selling Out",
    seoTitle: "Riftbound Legacy Pre-Orders: Most Boxes Already Sold Out",
    excerpt:
      "Three months before release, 12 of the 17 Legacy booster box pre-orders we track are sold out, and the cheapest ones went first. Market by market.",
    author: "RiftCompare",
    date: DAY,
    readMins: 8,
    tags: ["legacy", "news", "preorders", "sealed", "prices"],
    hero: HERO,
    summary: [
      "**12 of the 17 Legacy booster box pre-orders our tracked stores listed were sold out** on 31 October 2026, three months before the 29 January 2027 release.",
      "**The cheapest went first.** The lowest box price in the UK (£90), Canada (C$169.95) and the US (US$144) were all sold out; what is still open costs more.",
      "**The UK had no open box pre-order at all** among the stores we track. Canada had two of eight left, both at about C$230.",
      "**Vault Bundles are easier:** 5 of 14 still open, mostly near the US$34.99 MSRP or its local equivalent. TCGplayer's cheapest Vault listing was US$119.68.",
      "The live, sorted list for your market is on **[Legacy pre-order prices](/legacy-preorders)**, refreshed daily.",
    ],
    faq: [
      {
        q: "Are Riftbound Legacy pre-orders sold out?",
        a: "Many are. On 31 October 2026, 12 of the 17 Legacy booster box pre-orders listed by the stores RiftCompare tracks were marked sold out, including the cheapest in the UK, Canada and the US. Some stores were still taking orders, and stores often add allocation later, so check the live comparison for your market.",
      },
      {
        q: "Where can I still pre-order a Legacy booster box?",
        a: "On 31 October 2026 open box pre-orders were at SpellNexus in the eurozone (€119), Banana Games & Hobby and Card Dynasty in Canada (about C$230), TEFUDA in Singapore (S$200) and one US store at US$159.99. RiftCompare's Legacy pre-order page lists whichever stores are open in your market today, cheapest first.",
      },
      {
        q: "Should I pay a marketplace price for a Legacy box now?",
        a: "Usually not. TCGplayer's cheapest Legacy booster display listing was US$234.15 on 31 October against a US$120 MSRP: a seller's price for stock they have not received. Radiance's cheapest TCGplayer display fell from about US$227 to US$149.97 in the two weeks after its own pre-orders opened.",
      },
      {
        q: "Will sold-out Legacy pre-orders come back?",
        a: "Some may. A store that sold out early often learns its final allocation from its distributor closer to release and re-opens, or adds a second wave at a different price. There is no way to know in advance which will, which is why RiftCompare's release alert emails you if a sold-out Legacy pre-order on its comparison page comes back.",
      },
    ],
    shop: [
      { label: "Legacy booster boxes on eBay", query: "Riftbound Legacy booster box" },
      { label: "Legacy Vault Bundles on eBay", query: "Riftbound Legacy vault" },
    ],
    browseCta: {
      href: "/legacy-preorders",
      label: "Compare Legacy pre-order prices →",
      blurb: "Every tracked store in your market, in your currency, refreshed daily until release day.",
    },
    body: `Riftbound: Legacy releases on **29 January 2027**, and no card from it has even been shown yet: the first previews are at Convergence Fest in Las Vegas from 13 December. Stores opened their Legacy pre-orders weeks ago anyway, and many of them have already closed again.

On **31 October 2026**, the stores RiftCompare tracks had **17 Legacy booster box pre-orders** listed across the US, UK, eurozone, Canada and Singapore. **Twelve were sold out.** The five still open were, almost without exception, the dearer ones.

The live version of every number here is on **[the Legacy pre-order comparison](/legacy-preorders)**, which re-reads every store daily. Below is what it showed on 31 October, as item prices before shipping, with each store's own stock flag.

## Booster boxes: the cheap ones went first

| Market | Cheapest box listed | Status | Cheapest box still open |
| --- | --- | --- | --- |
| United Kingdom | £90.00 (Mox in the Hole) | Sold out | **None open** (Zatu £119.76 and Tier Zero £119.95 sold out too) |
| Canada | C$169.95 (401 Games) | Sold out | C$229.95 (Banana Games & Hobby) |
| United States | US$144.00 (Hobbiesville) | Sold out | US$159.99 (one store) |
| Eurozone | €119.00 (SpellNexus) | **Open** | €119.00 (SpellNexus) |
| Singapore | S$200.00 (TEFUDA) | Open | S$200.00 (TEFUDA) |

The US distributor's list price for the 24-pack Legacy Booster Display is **US$120**. Riot has published no price itself, and no list price outside the US has been announced, so every other market's number is the store's own.

### Canada: eight stores, six sold out

Canada is where we track the most Legacy listings, and it shows the pattern most clearly. Every box priced under C$200 was gone:

| Store | Price | Status |
| --- | --- | --- |
| 401 Games | C$169.95 | Sold out |
| The 6ix TCGs Markham | C$169.99 | Sold out |
| GT Games | C$169.99 | Sold out |
| New Realm Games | C$189.95 | Sold out |
| Hobbiesville | C$199.95 | Sold out |
| Sky Fox Games | C$199.99 | Sold out |
| Banana Games & Hobby | C$229.95 | Open |
| Card Dynasty | C$229.99 | Open |

That is a C$60 gap between the cheapest box anyone listed and the cheapest one anyone could still buy, for an identical unopened product. Radiance went the same way in Canada: two weeks after its pre-orders opened, 16 of the 20 Canadian Radiance display listings we tracked were closed, including every one under C$245.

### United Kingdom: three listings, none open

Three UK stores we track had listed a Legacy box, at £90 (Mox in the Hole), £119.76 (Zatu Games) and £119.95 (Tier Zero Games). All three were sold out; we checked Tier Zero's page by hand the same day, and it showed "Sold out" against a 29 January release. If you are in the UK and want a box from a store, you are waiting for either a re-open or a store we do not track yet.

### United States: one open store

In the US, Hobbiesville's US$144 box was sold out, and the one open store box pre-order we track was **US$159.99**, US$40 over MSRP. The marketplaces were far higher (below).

### Eurozone and Singapore: the exceptions

The eurozone was the one market where the cheapest box was still open: **SpellNexus at €119**, with Universe TCG (€125) and El Duelista (€129.95) sold out. In Singapore, **TEFUDA** had the box open at **S$200**.

**No Australian store we track had opened Legacy pre-orders yet.** When one does, it appears on the comparison the same day.

## Vault Bundles and Champion Decks are easier

The Vault Bundle (six packs, 36 runes, four full-art foil promo tokens and a storage box, US$34.99 MSRP) was in better shape: **5 of 14 listings open**, mostly close to MSRP.

| Market | Cheapest Vault open | Sold out below it |
| --- | --- | --- |
| United Kingdom | £34.95 (Tier Zero Games) | none |
| Eurozone | €40.00 (SpellNexus) | El Duelista €39.95 |
| Canada | C$64.99 (Screen Free Games) | Hobbiesville C$44.95, Banana C$59.95, Card Dynasty and GT Games C$59.99 |
| United States | US$49.99 (one store) | Hobbiesville US$33.00 |
| Singapore | S$60.00 (TEFUDA) | none |

The four Champion Decks (Tryndamere, Ashe, Lux and Garen) were mostly still open, at around £20 in the UK, €20 in the eurozone, C$24.95 in Canada and S$30 in Singapore. What is in them, and the four more decks in Proving Grounds 2nd Edition, is in **[the Legacy decks guide](/blog/riftbound-legacy-champion-decks)**.

## The marketplace gap

Marketplace listings for an unreleased set are sellers' prices for stock they have not received. On 31 October:

- **TCGplayer:** cheapest Legacy booster display US$234.15, against a US$120 MSRP; cheapest Vault Bundle US$119.68, against US$34.99; a six-box case US$1,378.67.
- **eBay (US):** cheapest Legacy booster box listing US$231.66.

That is roughly double the store price for a box and more than three times it for a Vault. Radiance went the same way: TCGplayer's cheapest Radiance display was about US$227 in late September and **US$149.97** two weeks later, still before release, and its Vault Bundle fell from about US$134 to US$53.83. **[Radiance pre-order prices two weeks later](/blog/riftbound-radiance-preorder-prices-two-weeks-later)** has the whole story.

So a marketplace pre-order three months out is the most expensive way to get a Legacy box, and the one most likely to look bad by January.

## Why the cheap ones go first

None of this means Legacy is scarce. It means stores price and sell their **allocation**, the number of boxes their distributor has promised them, and those allocations are small and uncertain three months out.

- **A store that priced close to MSRP sells its allocation fastest.** Shoppers comparing prices find it first, so the cheapest store in each market is the first to close. That is exactly what the Canadian table shows.
- **Some stores cap pre-orders below their allocation** until the distributor confirms numbers, then re-open. "Sold out" today can mean "sold out of the first wave".
- **Stores that list late often list higher,** because the price-sensitive buyers have already ordered elsewhere.

Legacy also has more reason than usual to sell through: it is the first Riftbound set built for draft, which means stores running draft nights want boxes to open, and its packs change shape (one Common slot becomes a Legend-or-Battlefield slot). **[How Legacy packs change](/blog/riftbound-legacy-pack-changes-and-card-templating)** explains the new slot.

## What to do with this

- **Want a box?** Pre-order from a store with allocation left now, rather than waiting for the cheapest store to restock. A sold-out store sometimes adds stock when its distributor confirms numbers, but there is no way to know which will.
- **Read the store's terms.** A pre-order is a promise, not a parcel: check what happens if the store's allocation is cut, and whether you can cancel without a fee.
- **Missed the cheap ones?** Set a **[release alert](/legacy-preorders)** on the pre-order page. It emails you once if a sold-out pre-order there comes back, and again when Legacy singles get prices.
- **Want specific cards?** Wait. Singles are cheapest a few weeks after release, not in Pre-Rift week (22–28 January).
- **In Australia?** Nothing to compare yet. The pre-order page fills in the day a tracked Australian store lists Legacy.

[[shop]]

## What happens next

| Date | What it does to these prices |
| --- | --- |
| 13 December 2026 | First Legacy previews at Convergence Fest. Stores that priced before anyone knew the chase cards sometimes re-price |
| January 2027 | More previews; the full card list fills in on **[the Legacy set page](/sets/legacy)** |
| 22–28 January 2027 | Pre-Rift events at stores: the first Legacy singles change hands |
| 29 January 2027 | Release. Pre-orders ship, and Legacy moves onto the sealed and singles comparisons |

## How we counted

Every figure in this post comes from one read of RiftCompare's sealed import, the job that reads every store we track and records each Riftbound sealed product's price and stock. On 31 October 2026 it found Legacy listings at 22 stores, not counting marketplaces.

- **A "listing" is one store's one product in one market.** A store that sells in two currencies (Hobbiesville lists in US and Canadian dollars) counts once per market.
- **"Sold out" is the store's own flag.** We do not guess it from a missing button; the store's product data says the item cannot be ordered. That can mean sold out for good, or a pre-order paused until the store's allocation is confirmed, and from the outside the two look the same.
- **Prices are item prices before shipping,** in the store's own currency, never converted.
- **Marketplaces are counted separately.** TCGplayer and eBay rows are in the marketplace section, never in the 17.

We did not count Proving Grounds 2nd Edition, cases or single packs as Legacy boxes; the 2nd Edition is a separate starter, covered in **[the Legacy decks guide](/blog/riftbound-legacy-champion-decks)**.

We will re-run this count as those dates pass. Until then, the **[Legacy spoilers post](/blog/riftbound-legacy-spoilers-set-6)** collects what Riot has shown, and **[where to buy Riftbound Legacy](/blog/where-to-buy-riftbound-legacy)** goes through each market's stores in more detail.

*Prices and stock are the stores' own, as read by RiftCompare's sealed import on 31 October 2026, item price before shipping. Stores change pre-order prices and stock often; the live table is what stays current.*`,
  },
  {
    slug: "where-to-buy-riftbound-legacy",
    category: "blog",
    title: "Where to Buy Riftbound Legacy: Store Guide",
    excerpt:
      "Where to pre-order Riftbound Legacy in the US, UK, Europe, Canada, Singapore and Australia: which stores are open, what each product is, marketplace gaps.",
    author: "RiftCompare",
    date: DAY,
    readMins: 9,
    tags: ["legacy", "where to buy", "preorders", "sealed", "prices", "release"],
    hero: HERO,
    summary: [
      "**Pre-order from a game store or online hobby store.** That is where Legacy is on sale today; our **[Legacy pre-order comparison](/legacy-preorders)** lists every tracked store's price in your currency, refreshed daily.",
      "**US distributor MSRP:** US$120 for the 24-pack Booster Display and US$34.99 for the Vault Bundle. No list price outside the US has been announced.",
      "**Move early.** On 31 October 2026, 12 of the 17 box pre-orders we track were already sold out, including the cheapest in the UK, Canada and the US.",
      "**Marketplaces cost about double before release:** TCGplayer's cheapest Legacy display was US$234.15 on 31 October.",
      "Legacy releases worldwide on **29 January 2027**, with Pre-Rift events from 22 January.",
    ],
    faq: [
      {
        q: "Where can I pre-order Riftbound Legacy?",
        a: "From local game stores and online hobby stores. On 31 October 2026 RiftCompare tracked Legacy pre-orders at 22 stores across the US, UK, eurozone, Canada and Singapore. The Legacy pre-order page compares every one of them in your market, cheapest first. Marketplaces such as TCGplayer and eBay list it too, at higher prices before release.",
      },
      {
        q: "Can I buy Riftbound Legacy from Riot directly?",
        a: "Riot has not announced a Merch Store sale or draw for Legacy. For Radiance it ran a draw for one Booster Display per selected entrant in North America and Europe; if it does the same for Legacy, the set page and pre-order page will say so.",
      },
      {
        q: "How much is a Riftbound Legacy booster box?",
        a: "The US distributor MSRP is US$120 for the 24-pack Booster Display. On 31 October 2026 store pre-orders ran from £90 to £119.95 in the UK, €119 to €129.95 in the eurozone, US$144 to US$159.99 in the US, C$169.95 to C$229.99 in Canada and S$200 in Singapore, many of them already sold out.",
      },
      {
        q: "Is Legacy sold in Australia yet?",
        a: "Not at the stores RiftCompare tracks, as of 31 October 2026. The Legacy pre-order page fills in for Australia on its own the day a tracked store lists it, and its release alert emails you when Legacy singles get prices.",
      },
      {
        q: "Is Proving Grounds 2nd Edition a Legacy product?",
        a: "No. It is a separate US$40 boxed starter due 19 February 2027, with Heimerdinger, Karma, Vladimir and Illaoi decks. Some stores file it under Legacy because it was announced with it, and RiftCompare compares it on the Legacy pre-order page for that reason, but it holds no Legacy booster packs.",
      },
    ],
    shop: [
      { label: "Legacy booster boxes on eBay", query: "Riftbound Legacy booster box" },
      { label: "Legacy Vault Bundles on eBay", query: "Riftbound Legacy vault" },
      { label: "Legacy Champion Decks on eBay", query: "Riftbound Legacy champion deck" },
    ],
    browseCta: {
      href: "/legacy-preorders",
      label: "Compare Legacy pre-order prices →",
      blurb: "Every tracked store in your market, in your currency, refreshed daily until release day.",
    },
    body: `Riftbound: Legacy, the sixth Riftbound set, releases worldwide on **29 January 2027**. It is already on pre-order at game stores in most markets we track, and selling fast. This guide covers where Legacy can be bought today, what each product is, which stores were open in each market, and where the marketplaces fit.

The live version of every price here is on **[the Legacy pre-order comparison](/legacy-preorders)**, which lists every tracked store's current price in your currency. The prices quoted below were read by our sealed import on **31 October 2026**, item price before shipping. They are examples of the range, not quotes: stores re-price pre-orders often, and they will again once the first cards are shown in December.

## What you are buying

Riot's product list, with contents and US list prices from the US distributor sheet. Riot has published no price itself.

| Product | What is in it | US MSRP |
| --- | --- | --- |
| **Booster pack** | 14 cards: 6 Commons, 3 Uncommons, 1 Legend or Battlefield, 1 foil, 2 Rares or better, 2 Runes or Tokens, 1 insert | Not separately listed |
| **Booster Display** (the "booster box") | 24 packs; a case is six displays | US$120 |
| **Vault Bundle**, often listed as "Legacy Vault" | 6 booster packs, 36 basic runes, 4 full-art foil promo tokens, a storage box | US$34.99 |
| **Champion Decks**: Tryndamere, Ashe, Lux, Garen | Sold separately; each with a paper playmat, one Legacy booster and a deck box | Not reliably published |
| **Pre-Rift kit** | A store's event kit for 22–28 January | Sold to stores, not players |

We leave the Champion Deck MSRP out on purpose: the US distributor sheet and a trade listing disagree, and a wrong list price is worse than none.

Three naming traps to watch for:

- **"Vault" and "Vault Bundle" are the same product.** We group them on the comparison page.
- **Proving Grounds 2nd Edition is not a Legacy product,** even where a store files it under Legacy. It is a separate US$40 boxed starter due 19 February 2027, with four different decks: see **[the Legacy decks guide](/blog/riftbound-legacy-champion-decks)**.
- **A "Pre-Rift" listing at a store is usually an event seat,** not a sealed kit. You play the kit in store between 22 and 28 January. Check the listing for a date before you add it to a basket expecting a parcel.

A Legacy pack is also not quite like earlier packs: one Common slot becomes a Legend-or-Battlefield slot at roughly even odds, so a pack holds six Commons instead of seven. **[How Legacy packs change](/blog/riftbound-legacy-pack-changes-and-card-templating)** explains it.

[[shop]]

## Market by market

### United States

The cheapest US store box we saw, **Hobbiesville at US$144**, was sold out by 31 October. One store was still open at **US$159.99**. The US Vault Bundle ran from **US$33** (Hobbiesville, sold out) to **US$49.99** at an open store. A four-deck Champion Deck listing at Many Realms was **US$79.99**, sold out.

Marketplaces were far higher: **TCGplayer's** cheapest display was **US$234.15**, its cheapest Vault **US$119.68** and a sealed case **US$1,378.67**. On **eBay** the cheapest Legacy box was **US$231.66**. Big-box retailers (Amazon, Target, Walmart) are not where Riftbound pre-orders open; a listing there before release is usually a marketplace seller, not the retailer.

### United Kingdom

UK box pre-orders were the cheapest anywhere, and gone: **Mox in the Hole at £90**, **Zatu Games at £119.76** and **Tier Zero Games at £119.95** were all sold out on 31 October. Tier Zero also listed a six-box case at **£629.95** (sold out).

What was still open in the UK:

- **Vault Bundle:** Tier Zero Games, **£34.95**. Zatu (£34.99) and Thistle Tavern (£35) were sold out.
- **Champion Decks:** Thistle Tavern at **£20** and Tier Zero at **£21.95**, all four champions. Total Cards had them at £18.95, sold out.
- **Booster packs:** Zatu listed single packs at £4.99, sold out.

### Eurozone

**SpellNexus** had the box open at **€119** and the Vault at **€40**; Universe TCG (€125) and El Duelista (€129.95) were sold out on boxes, and El Duelista's €39.95 Vault was too. Champion Decks were **€20** each at SpellNexus. Universe TCG also listed a six-box case at €720 and a store Pre-Rift event kit at €605, both sold out.

**Cardmarket** had Legacy listings too. In Europe its sellers are mostly stores, so its prices tend to sit closer to store prices than TCGplayer's do; it is worth a look in the eurozone in a way TCGplayer is not in the US before release.

### Canada

Canada has the most stores listing Legacy, and the clearest sell-out: six box pre-orders between **C$169.95 and C$199.99** (401 Games, The 6ix TCGs Markham, GT Games, New Realm Games, Hobbiesville, Sky Fox Games) were all sold out, leaving **Banana Games & Hobby at C$229.95** and **Card Dynasty at C$229.99**.

What else was open:

- **Vault Bundle:** Screen Free Games, **C$64.99**. Four cheaper Vault listings (C$44.95 to C$59.99) were sold out.
- **Champion Decks:** Banana Games & Hobby at **C$24.95** each (Ashe sold out), and Screen Free Games with **all four for C$89.94**.
- **Champion Deck display:** 401 Games, **C$89.95**.
- **Case:** Card Dynasty, C$1,299.99 for six boxes.

### Singapore

**TEFUDA** had Legacy open at **S$200** for a box, **S$60** for the Vault and **S$30** a Champion Deck. eBay's Singapore listing for a box was S$323.16.

### Australia

No Australian store we track had listed Legacy by 31 October. When one does, it appears on the pre-order comparison the same day, in Australian dollars. A **release alert** there emails you when Legacy singles get prices.

## Marketplaces: when they make sense

A marketplace price for an unreleased product is a **seller's asking price for stock they expect to receive**. That makes it a useful signal of demand and a poor place to buy a sealed box three months early. Radiance showed how quickly that premium can shrink: TCGplayer's cheapest Radiance display fell from about US$227 to **US$149.97** in the two weeks after its pre-orders opened, still before release.

Where a marketplace does make sense:

- **After release,** when sellers have stock in hand and prices settle.
- **For singles,** once Legacy cards exist: every card will get its own page on **[the Legacy set page](/sets/legacy)** with every store's and marketplace's price side by side.
- **In the eurozone,** where Cardmarket's store-sellers often price close to the stores themselves.

If you do buy before release on eBay, buy from a seller with a record of shipping sealed product, and read the dispatch date on the listing.

## How to pre-order well

1. **Compare first.** It is the same box at every store; the spread between the cheapest and dearest open box in Canada on 31 October was C$60.
2. **Check the terms.** What happens if the store's allocation is cut? Can you cancel, and is there a fee? Some stores charge one.
3. **Check the shipping.** Our prices are item prices. A box ships as a parcel, so add the store's postage before comparing a domestic store with a cheaper one further away.
4. **Do not wait for a sold-out store.** Restocks happen, but there is no telling which store will get one. If you want the box for certain, order where it is open and set a release alert for the one you missed.
5. **Keep singles separate.** If what you want is three copies of one card, a box is the expensive way to get them.

## What changes on release day

On **29 January 2027** pre-orders ship, and the comparison changes with them:

- **Our pre-order page becomes a price page.** **[/legacy-preorders](/legacy-preorders)** switches by itself to every store's in-stock Legacy sealed price, at the same address, so a bookmark keeps working.
- **Legacy joins the sealed comparison,** beside every earlier set's boxes, so you can weigh a Legacy box against a Radiance or Vendetta one.
- **Singles get prices.** Every Legacy card gets its own page with every tracked store's price, and **[the Legacy set page](/sets/legacy)** becomes the full card list.
- **Stores that sold out of pre-orders often have shelf stock.** A store's pre-order allocation and its release-day stock are not always the same number, so a store that closed pre-orders in October can still have boxes on the day.

Pre-Rift week, 22 to 28 January, comes first: stores run sealed events with Pre-Rift kits, and the first Legacy singles change hands then, at the most volatile prices the set will ever have.

## Pre-order or wait?

- **You want to open product:** pre-order now, from a store with allocation left. With most of the cheap boxes gone three months out, waiting for a better price is the risky choice, not the safe one.
- **You want specific cards:** wait for singles. They are most expensive in Pre-Rift week and usually settle a few weeks after release.
- **You are not sure:** the **[Legacy spoilers post](/blog/riftbound-legacy-spoilers-set-6)** tracks what Riot shows from 13 December, and **[Legacy pre-orders are already selling out](/blog/riftbound-legacy-preorders-selling-out)** has the full sell-out count behind this guide.

For buying Riftbound in general rather than Legacy, **[where to buy Riftbound cards](/guides/where-to-buy-riftbound-cards)** covers every store we track, market by market.`,
  },
  {
    slug: "riftbound-legacy-champion-decks",
    category: "blog",
    title: "Legacy Champion Decks and Proving Grounds 2",
    seoTitle: "Riftbound Legacy Champion Decks & Proving Grounds 2nd Ed",
    excerpt:
      "All eight 2027 precon decks: Legacy's Tryndamere, Ashe, Lux and Garen, and Proving Grounds 2nd Edition's four. Contents, store prices, champions' cards.",
    author: "RiftCompare",
    date: DAY,
    readMins: 8,
    tags: ["legacy", "champion decks", "proving grounds", "preorders", "sealed", "decks", "new players"],
    hero: HERO,
    summary: [
      "**Legacy has four Champion Decks: Tryndamere, Ashe, Lux and Garen**, sold separately from 29 January 2027. Each holds a deck, a paper playmat, one Legacy booster and a deck box.",
      "**Proving Grounds 2nd Edition (PG2), US$40 on 19 February 2027, adds four more:** Heimerdinger, Karma, Vladimir and Illaoi, with oversized Battlefields, playmats and score trackers. Riot says every card in it is also in boosters.",
      "**Store pre-orders on 31 October 2026:** Champion Decks about £19–22 in the UK, €20 in the eurozone, C$24.95 in Canada and S$30 in Singapore; PG2 from US$35 and C$47.95.",
      "**Seven of the eight champions already have Riftbound cards,** most of them a few dollars on TCGplayer. Vladimir is the only one new to the game.",
      "Riot has not published any of the eight decklists yet. They are expected in the preview season from 13 December.",
    ],
    faq: [
      {
        q: "What are the Riftbound Legacy Champion Decks?",
        a: "Four preconstructed decks released with Legacy on 29 January 2027, one each for Tryndamere, Ashe, Lux and Garen. Each box contains the deck, a paper playmat, one Legacy booster pack and a folded deck box, per the US distributor sheet.",
      },
      {
        q: "How much does a Legacy Champion Deck cost?",
        a: "Store pre-orders on 31 October 2026 were about £19–22 in the UK, €20 in the eurozone, C$24.95 in Canada and S$30 in Singapore. The US distributor sheet and other trade listings disagree on the US list price, so RiftCompare does not quote one.",
      },
      {
        q: "What is in Proving Grounds 2nd Edition?",
        a: "Four Champion Decks (Heimerdinger, Karma, Vladimir and Illaoi), four oversized Battlefields, four paper playmats, four chibi score trackers and a rulebook, at US$40, releasing 19 February 2027. Riot says every card in it can also be pulled from booster packs.",
      },
      {
        q: "Is Proving Grounds 2nd Edition the same as the original Proving Grounds?",
        a: "No. The original Proving Grounds came with Origins and has Annie, Master Yi, Lux and Garen decks. The 2nd Edition is a new box with Heimerdinger, Karma, Vladimir and Illaoi. Store titles for the two can be nearly identical, so check for '2nd Edition'.",
      },
    ],
    shop: [
      { label: "Legacy Champion Decks on eBay", query: "Riftbound Legacy champion deck" },
      { label: "Proving Grounds 2nd Edition on eBay", query: "Riftbound Proving Grounds 2nd edition" },
    ],
    browseCta: {
      href: "/legacy-preorders",
      label: "Compare deck pre-orders →",
      blurb: "Every tracked store's Legacy Champion Deck and Proving Grounds 2nd Edition price in your market, cheapest first.",
    },
    body: `Riftbound's first two months of 2027 bring **eight new preconstructed decks**. Four are Legacy's **Champion Decks** (Tryndamere, Ashe, Lux and Garen), out with the set on **29 January 2027**. The other four come three weeks later in **Proving Grounds, 2nd Edition** (Heimerdinger, Karma, Vladimir and Illaoi), a US$40 boxed starter due **19 February 2027**.

This guide covers what is in each box, what stores were asking on 31 October 2026, and what each champion's existing Riftbound cards cost today. Current prices for every deck in your market are on **[the Legacy pre-order comparison](/legacy-preorders)**.

One thing up front: **Riot has not published any of the eight decklists**, or how many cards each deck holds, and we will not guess. They usually surface during the preview season, which starts at **Convergence Fest on 13 December 2026**; the **[Legacy spoilers post](/blog/riftbound-legacy-spoilers-set-6)** will carry them.

## Legacy's four Champion Decks

Per the US distributor sheet, each Legacy Champion Deck box contains:

- the preconstructed deck itself;
- a paper playmat;
- **one Legacy booster pack**;
- a folded deck box.

They are sold one champion per box. All four champions are among the eight Legends Riot has named for **[Legacy](/sets/legacy)**.

### Pre-order prices on 31 October 2026

Item price before shipping, as read by our sealed import. Each store asked the same for all four decks.

| Market | Store | Price per deck | Status |
| --- | --- | --- | --- |
| United Kingdom | Total Cards | £18.95 | Sold out |
| United Kingdom | Thistle Tavern | £20.00 | Open |
| United Kingdom | Tier Zero Games | £21.95 | Open |
| Eurozone | SpellNexus | €20.00 | Open |
| Canada | Banana Games & Hobby | C$24.95 | Open (Ashe sold out) |
| Singapore | TEFUDA | S$30.00 | Open |

Two bundles of all four were listed too: **Screen Free Games** in Canada at **C$89.94** for the set (open), and a four-deck listing at Many Realms in the US at **US$79.99** (sold out). Bought separately at Banana Games, four decks would be C$99.80, so the Canadian set saves about C$10. 401 Games also listed a Champion Deck display at C$89.95.

eBay UK's cheapest single Champion Deck listing was **£35.24**, well above the stores: as with the boxes, a pre-release marketplace price is a seller's price for stock they do not have yet.

We do not quote a US list price for the Champion Decks: the US distributor sheet and a trade listing disagree, and a wrong MSRP is worse than none.

## Proving Grounds 2nd Edition

Riot announced a second **Proving Grounds** box alongside Legacy: **Proving Grounds, 2nd Edition**, code **PG2**, at **US$40**. Per Riot's announcement, the box holds:

- **4 Champion Decks:** Heimerdinger, Karma, Vladimir and Illaoi
- **4 oversized Battlefields**
- **4 paper playmats**
- **4 chibi score trackers**
- **1 rulebook**

Riot adds that the 2nd Edition "will not contain any cards which you cannot get out of booster packs": no exclusives, so it is a way into the game, not a chase product. It is printed in English, Chinese, French and Korean.

### Not the same box as the first Proving Grounds

The original Proving Grounds shipped with Origins and is still sold, with **Annie, Master Yi, Lux and Garen** decks. Store titles for the two can be almost identical ("Proving Grounds Box Set" against "Proving Grounds Box Set 2nd Edition"), and until 1 November our own comparison filed the 2nd Edition under the Origins box, where it showed up as the cheapest "in-stock" Proving Grounds in Canada. That is fixed: the 2nd Edition is now its own product, compared with Legacy's pre-orders.

If you want the first edition on purpose (Lux and Garen are in both lines, but as different decks), check that the title does **not** say 2nd Edition.

### Early pre-order prices

Only a few stores had listed it by 31 October 2026:

| Market | Store | Price | Status |
| --- | --- | --- | --- |
| United States | Hobbiesville | US$35.00 | Sold out |
| Canada | 401 Games | C$47.95 | Open |
| Canada | Hobbiesville | C$47.95 | Sold out |
| Canada | Banana Games & Hobby | C$69.95 | Sold out |

Expect more stores to list it as February gets closer.

[[shop]]

## The eight champions, before 2027

Seven of the eight already have Riftbound cards, so you can try most of them now with singles from sets that are out. Below is TCGplayer's market price on 31 October 2026 for each one's existing card, the most reliable single figure we have; every store's live price is on the champion's own page.

| Champion | Deck | Existing card | TCGplayer market price |
| --- | --- | --- | --- |
| **[Tryndamere](/champions/tryndamere)** | Legacy Champion Deck | Tryndamere, Barbarian (Origins, Rare) | US$3.41 |
| **[Ashe](/champions/ashe)** | Legacy Champion Deck | Ashe, Focused (Unleashed, Rare) | US$7.31 |
| **[Lux](/champions/lux)** | Legacy Champion Deck | Lux, Lady of Luminosity (Proving Grounds Legend) | US$13.46 |
| **[Garen](/champions/garen)** | Legacy Champion Deck | Garen, Might of Demacia (Proving Grounds Legend) | US$10.45 |
| **[Heimerdinger](/champions/heimerdinger)** | Proving Grounds 2nd Ed. | Heimerdinger, Inventor (Origins, Rare) | US$9.85 |
| **[Karma](/champions/karma)** | Proving Grounds 2nd Ed. | Karma, Channeler (Origins, Rare) | US$6.16 |
| **[Illaoi](/champions/illaoi)** | Proving Grounds 2nd Ed. | Illaoi, Prophet of the Great Kraken (Vendetta, Rare) | No market price yet |
| **Vladimir** | Proving Grounds 2nd Ed. | None: new to Riftbound | |

A few of them have pricier printings too. Garen's Proving Grounds Epic, **Garen, Commander**, had a TCGplayer market price of **US$38.98**, Lux's Epic **Lux, Crownguard** US$19.60, and Karma's Spiritforged Showcase **Karma, Channeler** about US$116. Those are the collector versions; the Rares above are what a player needs.

Whether those earlier cards fit the 2027 decks depends on the decklists, which Riot has not shown. What the table does say is that **trying a champion before January costs a few dollars**, not a deck.

## Which one to buy

Until Riot shows the lists, there is no honest way to rank the decks against each other. What can be said now:

- **For one new player:** a single Legacy Champion Deck is the cheapest complete way in, at around £20, €20 or C$25, with a booster pack and a playmat included.
- **For four new players at once:** Proving Grounds 2nd Edition, at US$40, is four decks, four playmats and four score trackers: a ready-made game night.
- **For a collector:** the one Legacy booster in each Champion Deck box is the only random part; the deck itself is fixed. Proving Grounds 2nd Edition has no random part and, per Riot, no card you cannot also pull from a pack.
- **For a drafter:** neither. Legacy is the first Riftbound set built for draft, and draft nights open booster boxes, not decks. **[Legacy pre-orders are already selling out](/blog/riftbound-legacy-preorders-selling-out)** has where the boxes stand.

## Buying the right box

Deck boxes are the products stores mislabel most, and Legacy adds two new ways to get it wrong. Before you pay:

- **Check the champion.** Legacy's Champion Decks are sold one champion per box, and some stores list all four under one product with a dropdown. Make sure the variant you picked is the champion you meant; our comparison prices each champion separately for exactly this reason.
- **Check for "2nd Edition".** A "Proving Grounds Box Set" with no edition named is almost always the Origins box (Annie, Master Yi, Lux, Garen). The 2027 box says 2nd Edition, and its release date is 19 February 2027.
- **"Showdown Decks" is not a Legacy product.** Riot's Radiance and Vendetta had two-player Showdown Decks; Legacy does not. One US store listed Legacy's four Champion Decks as "Showdown Decks (Set of 4)". We compare that listing as the four-deck set it is.
- **A "set of 4" should cost about four decks.** On 31 October the one open set was C$89.94 against C$99.80 for four bought separately at another Canadian store. A set priced well above four singles is not a bargain bundle.
- **Item price is not the whole price.** A deck ships as a small parcel, and postage can be most of the cost of a C$25 deck. Compare the total at checkout, not just the shelf price.

## When the lists land

We will add each decklist to this guide as Riot shows it, with every card linked to its price page. Until then:

- **[The Legacy set page](/sets/legacy)** has everything Riot has confirmed about the set, with live pre-order prices.
- **[Where to buy Riftbound Legacy](/blog/where-to-buy-riftbound-legacy)** goes through every market's stores.
- **[The Riftbound release calendar](/release-dates)** has the dates for Legacy, Proving Grounds 2nd Edition and The Reckoning.

*Store prices are the stores' own, as read by RiftCompare's sealed import on 31 October 2026, item price before shipping. Card prices are TCGplayer's market price from the same day's export.*`,
  },
];
