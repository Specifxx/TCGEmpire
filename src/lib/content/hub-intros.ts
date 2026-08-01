// ─────────────────────────────────────────────────────────────────────────────
// Editorial intros for the hub and tool pages.
// ─────────────────────────────────────────────────────────────────────────────
// The audit's last thin cohort: index hubs and interactive tools whose value is
// the thing they DO, not the words on them. /deck scored 79 unique editorial
// words, /trade 91, /bulk-pricer 110 — each a genuinely useful tool sitting
// under a heading and nothing else.
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

export type HubIntro = { paragraphs: string[] };

export const HUB_INTROS: Record<string, HubIntro> = {
  "/cards": {
    paragraphs: [
      "Every Riftbound card we track, sliced the ways people actually search for them: by card type, by rarity, and by printing. Each facet below is its own page with the full list, live prices from stores in Australia, New Zealand, the United States, the United Kingdom, Singapore and Canada, and a breakdown of where the money in that slice actually sits.",
      "Type is the most useful cut if you are building a deck — you know you need runes, or a legend, and want to see what is available and what it costs. Rarity is the most useful cut if you are opening product and want to know what a pull is worth. Printing is for collectors: alternate arts, promos, Signature prints and overnumbered cards trade completely separately from the base card, often at several times the price, and each has its own page here.",
      "Facets with only a handful of cards are left out of search deliberately — a page listing three cards is a list, not a resource — but every one is still linked and browsable from here.",
    ],
  },
  "/sets": {
    paragraphs: [
      "Riftbound sets in release order, each with its own page carrying the full card list, live prices and where that set's value is concentrated. Set pages are the right starting point for two questions in particular: what is in a set before you buy sealed, and which cards from it are worth the most right now.",
      "Prices on every set page are the cheapest live listing we have recorded for each card, compared across all six markets we cover and refreshed daily. Sealed product for each set — boxes, packs, decks — is priced separately on the sealed products page, because the interesting question is usually whether a box is worth more opened than sealed, and that only makes sense with both numbers side by side.",
    ],
  },
  "/champions": {
    paragraphs: [
      "Riftbound cards are built around champions, and a champion's cards are spread across every set they have appeared in. These hubs pull them back together: every printing of every card featuring a champion, in one place, priced live.",
      "That matters because deckbuilding around a champion means buying across sets, and the cheapest market for one card is frequently not the cheapest for the next. Each hub shows what the whole pool costs, which printings carry a premium, and which of our tracked meta decks actually run them.",
      "Champions with only a few tracked printings are kept out of search — there is not enough on the page to be worth a search result yet — but every one is listed and linked here, and they enter the index automatically as more of their cards are imported and priced.",
    ],
  },
  "/deck": {
    paragraphs: [
      "Build a Riftbound deck and price it as you go. Add cards from the full database and the total updates live, using the cheapest listing we have recorded for each card in your selected market — so the number at the bottom is what the deck would actually cost to buy today, not a reference price from one shop.",
      "The build cost is the point. A decklist from a tournament report or a content creator tells you what to play; it does not tell you that one card in it is 60% of the budget, or that the same list is materially cheaper bought from UK stores than local ones. This does.",
      "Decks are shareable by URL, so a list you build here can be sent to someone else and re-priced in their market. If you want a starting point rather than a blank page, the meta decks section has tracked lists with their build costs already computed.",
    ],
  },
  "/trade": {
    paragraphs: [
      "Work out whether a trade is fair before you shake on it. Put the cards on each side in, and it values both piles at the cheapest live price we have recorded for each card, in your market and currency, then shows the gap.",
      "It exists because trading at a local game store is where people lose the most money on cards, and almost always by accident: the values move weekly, nobody has current prices memorised, and a stack of six commons genuinely can be worth more than the one rare across the table — or a tenth of it.",
      "The valuation is a market snapshot, not an appraisal. Condition, sentiment and how much either of you wants the card are real factors it cannot see, and prices move. Treat the number as the starting point for the conversation rather than the end of it.",
    ],
  },
  "/bulk-pricer": {
    paragraphs: [
      "Paste a list of cards — one per line, in whatever form you already have it — and get every one priced at once, with a total. Card names, set codes with collector numbers, and the usual deck-list formats all work; anything we cannot match is listed separately rather than silently dropped, so the total is never quietly wrong.",
      "This is the tool for the jobs that are painful one card at a time: valuing a collection you are about to sell, costing a decklist someone sent you, checking a trade binder, or working out what a box of bulk is actually worth before you spend an evening sorting it.",
      "Every price is the cheapest live listing we have recorded in your selected market, refreshed daily. Cards with no live listing are shown as unpriced rather than assigned an estimate — an invented number in a total you are about to act on is worse than a gap.",
    ],
  },
  "/tools/best-basket": {
    paragraphs: [
      "The cheapest card is rarely the cheapest order. Postage is charged per store, so a shopping list split across five shops to save a few cents on each card routinely costs more delivered than buying the whole list from two. This works out which combination of stores actually costs least.",
      "Give it the cards you want and it prices every viable split across the stores that stock them, including each store's postage, and ranks the results by what you would actually pay at the door. Usually the answer is not the split with the cheapest individual cards.",
      "Postage figures are our own per-store estimates for a single-card order, documented on each store's page, not rates quoted by the shop. Confirm at checkout — a store running free shipping over a threshold can change the answer.",
    ],
  },
  "/tools/deal-finder": {
    paragraphs: [
      "The same card, at a materially different price, in two places we track at the same time. Deal Finder surfaces those gaps: cards where one store's live listing is well below the going rate elsewhere, ranked by how much you would save.",
      "Every opportunity is computed from live listings rather than a reference price, so a gap here is one you could act on right now — while the listing lasts. That is also the caveat: the cheap side of a gap is usually one seller with one copy, and it goes when someone buys it.",
      "Delivered cost is what the ranking uses, not sticker price, because a saving smaller than the postage to collect it is not a saving. Nothing here is investment advice; card prices fall as readily as they rise.",
    ],
  },
};

export const hubIntro = (path: string): string[] => HUB_INTROS[path]?.paragraphs ?? [];
