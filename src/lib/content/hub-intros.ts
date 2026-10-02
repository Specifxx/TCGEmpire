// ─────────────────────────────────────────────────────────────────────────────
// Editorial intros for the hub and tool pages.
// ─────────────────────────────────────────────────────────────────────────────
// The audit's last thin cohort: index hubs and interactive tools whose value is
// the thing they DO, not the words on them. /deck scored 79 unique editorial
// words, /trade 91, the since-retired Bulk Pricer 110 — each a genuinely
// useful tool sitting under a heading and nothing else.
//
// That is a real problem for an ad review, which judges the page rather than the
// product, and it is a real problem for a visitor who lands from search and
// cannot tell what the tool is for. So each of these says what the tool does,
// what data it runs on, when to reach for it, and what it will not do. Written
// once, checked against the tool's actual behaviour — nothing here describes a
// feature that doesn't exist.
//
// Deliberately NOT auto-generated: there is no data to derive "what is this tool
// for" from, and a templated answer to that question would be exactly the kind
// of filler the rest of this remediation removes.
//
// THE DATA PAGES (2026-09-26, "Blog and tools, joined up" in DECISIONS.md).
// Every tool and price page now carries one: how to read its figures, how they
// are computed, and the guide that explains them, linked inline as
// [label](/guides/…) or [label](/blog/…) (HubIntro renders single-slash paths
// only). Rules for an entry, all pinned by tests/tool-pages.test.ts:
//  - PAGE-SPECIFIC. scripts/adsense-audit.ts discounts a sentence found on more
//    than 35% of a template's pages, so a shared "how our prices work" block
//    would count for nothing. No sentence appears in two entries.
//  - Short enough that the data still starts about one phone screen down: the
//    2026-09-26 mobile-first entry covers the homepage, card pages and /browse,
//    not these, so the intro stays visible above the data rather than hidden.
//  - Facts from code, stated the way the code does them: six markets; prices
//    read twice a day; comparisons ranked by ITEM price (only Best Basket prices
//    whole orders with measured postage); weekly history is the cheapest price
//    across AU/US/UK/SG, converted; nothing forecasts a price.
//  - No figure a constant owns and could change (store counts, thresholds the
//    page prints from code), and no set named — the page prints those itself.

export type HubIntro = { paragraphs: string[] };

export const HUB_INTROS: Record<string, HubIntro> = {
  "/cards": {
    paragraphs: [
      "Every Riftbound card we track, sliced the ways people actually search for them: by card type, by rarity, and by printing. Each facet below is its own page with the full list, live prices from the stores we track in Australia, the United States, the United Kingdom, Singapore, Canada and the EU, and a breakdown of where the money in that slice actually sits.",
      "Type is the most useful cut if you are building a deck — you know you need runes, or a legend, and want to see what is available and what it costs. Rarity is the most useful cut if you are opening product and want to know what a pull is worth. Printing is for collectors: alternate arts, promos, Signature prints and overnumbered cards trade completely separately from the base card, often at several times the price, and each has its own page here. [The variant glossary](/guides/riftbound-variant-glossary) shows how to tell them apart.",
      "Facets with only a handful of cards are left out of search deliberately — a page listing three cards is a list, not a resource — but every one is still linked and browsable from here.",
    ],
  },
  "/cards/rarity": {
    paragraphs: [
      "Riftbound cards have five rarity tiers, from most to least common: Common, Uncommon, Rare, Epic and Showcase. Rarity is printed on the card itself, which makes it the most reliable single signal for \"how hard was this to pull\" and, usually, \"roughly what should this cost.\"",
      "It is not the only signal, though: a Common chase card that sees heavy tournament play can trade for more than an Epic nobody plays, and Showcase — Riftbound's premium alternate-art treatment — carries its own collector premium on top of whatever the base card is worth. Rarity tells you the print odds, not the market price; the tier pages below show both, and [the rarity and printings guide](/guides/understanding-riftbound-card-rarity) explains each tier.",
      "Each tier below links to its own page with the full card list at that rarity and live prices across every store we track.",
    ],
  },
  "/gallery": {
    paragraphs: [
      "Every Riftbound card, laid out to look at rather than filter through — full-size art, one set at a time, with instant client-side search and no pagination. This exists for a different question than the card database answers: not \"what does this cost\" but \"what does this set actually look like.\"",
      "Each set has its own gallery page with every printing on one screen — base cards, alternate arts, Signature prints and Overnumbered chase cards together. Pick a set below to open it, or use the full filterable database if you already know what you are pricing rather than browsing. [The variant glossary](/guides/riftbound-variant-glossary) explains what sets the special printings apart.",
    ],
  },
  "/sets": {
    paragraphs: [
      "Riftbound sets in release order, each with its own page carrying the full card list, live prices and where that set's value is concentrated. Set pages are the right starting point for two questions in particular: what is in a set before you buy sealed, and which cards from it are worth the most right now. [Every Riftbound set, in order](/guides/riftbound-sets-in-order) has the release dates and real card counts.",
      "Prices on every set page are the cheapest in-stock listing we track for each card in your market — one of the six we cover: Australia, the US, the UK, Singapore, Canada and the EU — read twice a day. Sealed product for each set — boxes, packs, decks — is priced separately on the sealed products page, because the interesting question is usually whether a box is worth more opened than sealed, and that only makes sense with both numbers side by side.",
    ],
  },
  "/champions": {
    paragraphs: [
      "Riftbound cards are built around champions, and a champion's cards are spread across every set they have appeared in. These hubs pull them back together: every printing of every card featuring a champion, in one place, priced live. [League of Legends champions in Riftbound](/guides/league-of-legends-champions-in-riftbound) covers which champions have cards and how Legends work.",
      "That matters because deckbuilding around a champion means buying across sets, and the cheapest market for one card is frequently not the cheapest for the next. Each hub shows what the whole pool costs and which printings carry a premium.",
      "Champions with only a few tracked printings are kept out of search — there is not enough on the page to be worth a search result yet — but every one is listed and linked here, and they enter the index automatically as more of their cards are imported and priced.",
    ],
  },
  // Rendered BELOW the builder: /deck opens on the tool (DECISIONS.md "Public
  // decks", 2026-09-26; tests/public-decks.test.ts).
  "/deck": {
    paragraphs: [
      "Build a Riftbound deck and price it as you go. Add cards from the full database and the total updates as you edit: each card's cheapest in-stock price in your selected market, times its quantity. That is a sum of item prices that may span several stores, before postage — a quick answer to what a list costs, not a checkout total.",
      "The build cost is the point. A decklist from a tournament report or a content creator tells you what to play; it does not tell you that one card in it is most of the budget, or what the same list costs in another market — switch market and it re-prices there. [How a Riftbound deck is built](/guides/how-a-riftbound-deck-is-built) covers what a legal list needs, and [the archetypes guide](/guides/riftbound-deck-archetypes-guide) what each style of deck is trying to do.",
      "Decks are shareable by URL, so a list you build here can be sent to someone else and re-priced in their market, or published to the deck library with your name on it. When you are ready to buy, \"Buy this deck for less\" hands the list to Best Basket, which prices whole orders with each store's measured postage; [the Best Basket guide](/guides/best-basket-cheapest-riftbound-deck) walks through a deck bought that way.",
    ],
  },
  "/trade": {
    paragraphs: [
      "Work out whether a trade is fair before you shake on it. Put the cards on each side in, and it values both piles at the cheapest live price we have recorded for each card, in your market and currency, then shows the gap. Tap a price to type your own, or to pick one store's price if the cheapest copy is not the one on the table.",
      "Values move week to week and nobody has them memorised, so a trade at a local game store is easy to get wrong by accident: a stack of six commons genuinely can be worth more than the one rare across the table — or a tenth of it.",
      "The valuation is a market snapshot, not an appraisal: condition, sentiment and how much either of you wants the card are things it cannot see. [What a collection is really worth](/guides/how-much-is-your-riftbound-collection-worth) explains why a listed price is not what a card fetches in a trade, and [the condition guide](/guides/riftbound-card-condition-guide) how grade changes it.",
    ],
  },
  "/tools/best-basket": {
    paragraphs: [
      "The cheapest card is rarely the cheapest order. Postage is charged per store, so a shopping list split across five shops to save a few cents on each card routinely costs more delivered than buying the whole list from two. This works out which combination of stores actually costs least; [the Best Basket guide](/guides/best-basket-cheapest-riftbound-deck) prices one whole deck both ways.",
      "Give it the cards you want and it searches store combinations for the lowest total including postage. Any signed-in account sees its own delivered total; with Premium it also shows the best one-store and two-store orders beside it, so you can see what splitting the order actually saves. Usually the answer is not the split with the cheapest individual cards.",
      "Postage is each store's own checkout rate, measured for orders of different sizes and values to addresses across your market, never guessed. A store we have not measured yet is marked as an estimate, and the store's checkout is always final; the questions below cover regions, tracked and untracked letters, and free-postage thresholds in full.",
    ],
  },
  "/tools/deal-finder": {
    paragraphs: [
      "Deal Finder has three tabs. Underpriced vs TCGplayer lists the Riftbound cards a store or an eBay seller in your market is selling for less than TCGplayer's US market price, converted into your currency and ranked by how far below it sits; in the United States a card must also beat TCGplayer's own cheapest listing. Cheapest on eBay, free for everyone, lists the cards whose cheapest eBay listing costs less than every store we track. Underpriced vs eBay is the reverse: cards a store sells for less than the cheapest eBay listing.",
      "TCGplayer's market price is a reference built from recent US sales, and an eBay price is one seller's asking price, so a big gap is a reason to look, not a guarantee: the cheap copy is often one seller's only one, and it may be a lower grade — [the condition guide](/guides/riftbound-card-condition-guide) covers what that is worth. [Why Riftbound card prices change](/guides/why-riftbound-card-prices-change) explains where gaps like these come from.",
    ],
  },
  "/tools/box-ev": {
    paragraphs: [
      "Is a Riftbound booster box worth more opened than it costs? The calculator values every card a pack can hold at its TCGplayer US market price, converted into your currency, averages each pull pool — Common to Showcase, plus the alt-art, Overnumbered, Signature and Ultimate chase prints — multiplies each average by how many of that pool a box yields, and sets the total against the box's price.",
      "The market price is used rather than the cheapest listing, which is often a foreign-language copy. The box price starts at the cheapest in-stock booster box we track in your market, and the pack count and pull rates can all be changed to match the box you are buying. [Box EV: rip or buy singles?](/guides/riftbound-booster-box-ev-worth-ripping-or-buying-singles) covers what the number can and cannot tell you.",
    ],
  },
  "/tools/rising": {
    paragraphs: [
      "Rising Cards is a screen, not a prediction. It ranks the most-searched cards that have a price in your market on six signals: how often each is picked from search, how fast that is rising, where today's price sits in the card's own recent range, how many stores have it in stock, its change on last week, and how much its price usually moves — a card already up sharply is marked down, not rewarded. Every row gives its reason in one line.",
      "Demand and stock are read every day. The price signals use the weekly price we record for every card — the cheapest across Australia, the US, the UK and Singapore, converted — with today's price added as the newest point, so the history grows once a week and its latest point moves with each import. [Why Riftbound card prices change](/guides/why-riftbound-card-prices-change) covers what demand can and cannot tell you about a price.",
    ],
  },
  "/tools/demand": {
    paragraphs: [
      "Demand Finder counts attention, not prices: how often each Riftbound card is picked from RiftCompare's search box, and how often it is opened, either its card page or its quick view. Each browser counts a card once a day, bots are not counted, and the server limits how often one address can count a card, so one visitor refreshing cannot move it up. Counts are worldwide; the price beside a card is the cheapest in-stock price we track in your market.",
      "The 7- and 30-day windows are measured against a daily snapshot of the running totals taken that many days ago, and the page says so when the snapshots do not reach back that far yet. A card at the top is one players are looking at, not a price forecast; [the most-wanted cards guide](/guides/best-riftbound-cards) prices the most-searched cards in your market.",
    ],
  },
  "/tools/selling-fees": {
    paragraphs: [
      "Work out what you keep from selling a Riftbound card on TCGplayer, eBay or another marketplace. Enter the sale price, the postage you charge the buyer, what posting it actually costs you and your marketplace's rates, and the calculator stacks the fees on the amounts each marketplace charges them on. The payout appears once a commission is entered, because without it the biggest fee would be missing.",
      "Commission is the one rate never filled in for you: both marketplaces tier and revise their fees, so a printed percentage goes stale, and your seller dashboard has your real one. [How TCGplayer's fees stack](/blog/tcgplayer-fees) works one sale through in full, and [how to sell Riftbound cards](/blog/how-to-sell-riftbound-cards) covers pricing and choosing a platform.",
    ],
  },
  "/tools": {
    paragraphs: [
      "The price tools here run on the same data as the rest of RiftCompare: the prices our twice-daily import reads from stores, eBay and marketplaces in six markets — Australia, the US, the UK, Singapore, Canada and the EU. Each answers one question: what a card or a whole list costs, whether a box is worth opening, whether a trade is fair, or what you keep after selling.",
      "A price is an item price unless a tool says otherwise; Best Basket is the one that prices whole orders with each store's measured postage. None of them forecasts where a price will go. [Best Basket, worked through](/guides/best-basket-cheapest-riftbound-deck) and [box EV: rip or buy singles?](/guides/riftbound-booster-box-ev-worth-ripping-or-buying-singles) show two of them in use.",
    ],
  },
  "/price-guide": {
    paragraphs: [
      "Every released Riftbound card in one sortable table, one row per printing, each with the cheapest in-stock price we track in your market and how many stores have it. A price is the item price from a store or eBay seller, with postage added at checkout, and it is an asking price on a live listing rather than a record of a sale. We read every price twice a day, at 07:00 and 19:00 UTC.",
      "The 7-day column compares one weekly price per card, the cheapest across Australia, the US, the UK and Singapore converted to US dollars, so its percentage reads the same in every market. It stays blank until a card has two weekly prices on the current basis. [Why Riftbound card prices change](/guides/why-riftbound-card-prices-change) explains what usually sits behind a move, and [the variant glossary](/guides/riftbound-variant-glossary) explains why printings of one card are priced apart.",
    ],
  },
  "/sealed": {
    paragraphs: [
      "Booster boxes, packs, Proving Grounds and bundles, priced across the stores we track in your market. A tile's price is the cheapest offer you can order now — the item price, with postage at the store's checkout — and its store count is how many have it in stock. Tap a tile for every offer, cheapest open offer first.",
      "Sold out means every store listing the product said so on its latest read; a store we have not read in 72 hours counts as unknown, never as the headline price. ✓ At MSRP means no more than 2% over the approximate launch RRP, which we hold for Australia, the US and the UK only, and never for pre-orders.",
      "After particular cards? Singles are usually cheaper than opening product for them: [the box EV calculator](/tools/box-ev) weighs a box against its pulls, and [cheapest Riftbound booster boxes](/guides/cheapest-riftbound-booster-boxes) compares where boxes cost least, market by market.",
    ],
  },
  "/movers": {
    paragraphs: [
      "The Riftbound singles whose price moved most this week, in three lists: the biggest risers, the biggest drops, and the best value against a card's own recent high. Once a week we record one price per card — the cheapest we track across Australia, the US, the UK and Singapore, converted into one currency — and a move compares it with the price about seven days before.",
      "A single week is a short window: one tournament result can spike a card that settles once the meta adjusts. [Why Riftbound card prices change](/guides/why-riftbound-card-prices-change) covers what usually sits behind a big move, and [the RiftCompare Index](/market) shows whether the whole market moved or one card did.",
    ],
  },
  "/market": {
    paragraphs: [
      "One number for the Riftbound singles market, like a stock index for the game. Its basket is the most-searched cards on RiftCompare that have a price in the market you pick, each weighted by search volume and capped at 20%, so a chase card moves it more than a bulk common but no single card can carry it.",
      "The level moves once a week with the price we record for every card — the cheapest across Australia, the US, the UK and Singapore, converted into this market's currency — and is chain-linked from 100: each step counts only cards priced at both ends, so a new set joining the basket does not jump it. [What the RiftCompare Index is](/guides/understanding-the-riftcompare-index-methodology) walks through the formula.",
    ],
  },
  "/market/records": {
    paragraphs: [
      "Two kinds of board. The cross-market board sets a card's cheapest in-stock price in the market you pick against the market we track where it is listed for least, converted at our reference exchange rate, and ranks the gaps by their size in money; postage, customs and whether a store ships abroad are not included. [Are Riftbound cards cheaper abroad?](/blog/are-riftbound-cards-cheaper-in-another-country) works through when a gap survives them.",
      "The record boards read the price history we keep for every card, now one point a week — its cheapest across Australia, the US, the UK and Singapore, converted into this market's currency — so a record high is the highest price in that series, with the date it was first reached. Where the way we source a price changed, the boards that compare today's price with a record measure only from that change, and their headings say from when.",
    ],
  },
  "/auctions": {
    paragraphs: [
      "We sweep eBay's own auction listings for each market every four hours and keep the high-value Riftbound lots about to close, so you can watch the serious ones finish without re-running the same search all day. Every lot links straight to its listing: bidding, payment and postage all happen on eBay, and RiftCompare is never the seller.",
      "Before you bid on one, [eBay bidding strategies](/blog/ebay-bidding-strategies) covers proxy bids, sniping and setting a maximum you will stick to.",
    ],
  },
  "/decks": {
    paragraphs: [
      "Decklists published by players on RiftCompare, each priced in your market: a deck's total is every card's quantity times its cheapest in-stock price there, before postage. A deck with any card unpriced in your market says so instead of showing a partial total, so a missing figure means a gap in the data, not a cheap deck.",
      "Open a deck for the cheapest store per card, how its cost has moved since it was published, and a Budget build that swaps each card for its cheapest printing; \"Buy this deck for less\" hands the list to Best Basket, which prices whole orders with each store's measured postage. [How a Riftbound deck is built](/guides/how-a-riftbound-deck-is-built) explains what a legal list is made of.",
    ],
  },
};

export const hubIntro = (path: string): string[] => HUB_INTROS[path]?.paragraphs ?? [];
