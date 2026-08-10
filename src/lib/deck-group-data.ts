import { unstable_cache } from "next/cache";
import { resolveAllDecks, type ResolvedDeck } from "./meta-decks";
import { buildDeckCart, type DeckCartLine } from "./deck-basket";
import type { BasketPlan } from "./basket";
import { CONTENT_TAG } from "./revalidate-content";
import { cheapestPublishableDeck, seedsInGroup, type DeckGroup } from "./deck-groups";
import type { Country } from "./country";

// Server-side data loading for the deck-group landing pages, shared by both axes
// so /decks/archetype/* and /decks/domain/* can never diverge on what they show
// or on how hard they hit the database.
//
// EGRESS: the all-decks resolve is cached under the SAME key /decks already uses
// (["decks-all", <country>]), so a group page is served from a cache entry the
// index page has usually already warmed rather than issuing its own query — see
// the data-egress rules at the top of lib/db.ts. The cart optimiser then runs for
// exactly ONE deck per page (the cheapest publishable one, which is the only deck
// whose cart the page actually quotes), not for every deck in the group.

export interface DeckGroupData {
  decks: ResolvedDeck[];
  /** The deck the "cheapest place to buy" block is about, if any. */
  cartDeck: ResolvedDeck | null;
  cartPlan: BasketPlan | null;
}

/** Buy-list lines for a resolved deck: main deck + legend, deduped by card id.
 *  Mirrors /decks/[slug]'s own cart construction — same exclusions (side deck),
 *  same dedupe — so the two pages can't quote different carts for one deck. */
function cartLinesFor(deck: ResolvedDeck): DeckCartLine[] {
  const byId = new Map<string, DeckCartLine>();
  const add = (card: { id: string; name: string; slug: string | null } | null, qty: number) => {
    if (!card || qty <= 0) return;
    const ex = byId.get(card.id);
    if (ex) ex.qty += qty;
    else byId.set(card.id, { cardId: card.id, name: card.name, slug: card.slug, qty });
  };
  for (const item of deck.items) {
    if (item.section === "sideboard") continue;
    add(item.card, item.qty);
  }
  add(deck.legendCard, 1);
  return [...byId.values()];
}

export async function loadDeckGroup(group: DeckGroup, country: Country): Promise<DeckGroupData> {
  const slugs = new Set(seedsInGroup(group).map((s) => s.slug));

  // FAILS OPEN, LOUDLY-LOGGED: a database blip must not turn a real group page
  // into a 404 (notFound() is decided from the static seed list, never from
  // this), and must not let an un-priced deck render as a $0 build. The page
  // degrades to "not enough listings" via deckCostVerdict, which is the same
  // path an unpriced-but-reachable deck already takes.
  let all: ResolvedDeck[] = [];
  try {
    all = await unstable_cache(() => resolveAllDecks(country), ["decks-all", country], {
      revalidate: 86400,
      tags: [CONTENT_TAG],
    })();
  } catch (e) {
    console.error(`decks/${group.axis}/${group.slug}: deck resolve failed, rendering without prices:`, e);
  }

  const decks = all
    .filter((d) => slugs.has(d.slug))
    .sort((a, b) => Number(a.tier) - Number(b.tier) || (b.metaSharePct ?? 0) - (a.metaSharePct ?? 0));

  const cartDeck = cheapestPublishableDeck(decks);
  let cartPlan: BasketPlan | null = null;
  if (cartDeck) {
    const lines = cartLinesFor(cartDeck);
    try {
      cartPlan = await unstable_cache(() => buildDeckCart(lines, country), ["deck-cart", cartDeck.slug, country], {
        revalidate: 86400,
        tags: [CONTENT_TAG],
      })();
    } catch (e) {
      console.error(`decks/${group.axis}/${group.slug}: cart optimiser failed, omitting the buy block:`, e);
    }
  }

  return { decks, cartDeck, cartPlan };
}
