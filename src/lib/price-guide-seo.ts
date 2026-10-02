// Title, description, indexing and FAQ for /price-guide, kept out of the route
// file because a page.tsx may export only Next's route fields (the
// lib/gallery-seo.ts pattern). DECISIONS.md, "Site-wide price guide at
// /price-guide", 2026-10-02; docs/seo-keyword-map.md, Price-check intent.
//
// WHAT THIS PAGE OWNS: the UNSCOPED "riftbound price guide" / "riftbound price
// list" / "all riftbound card prices". It never LEADS a title, H1 or
// description with "Riftbound Card Prices" — the homepage's head term, settled
// by three audits (tests/keyword-ownership.test.ts) — never says "Card List"
// (/browse), "Card Values" (/blog/riftbound-card-values) or "Most Expensive"
// (the ranking guides), and never names a store count or a set. N is always the
// live count of rows the clean view lists, never a typed number.
import type { RawSearchParams } from "./price-guide-query";

export const PRICE_GUIDE_PATH = "/price-guide";
const TITLE_MAX = 60;

const cards = (n: number | null) => (n != null && n > 0 ? `all ${n.toLocaleString("en-US")} cards` : "every card");

/** Absolute title (no brand suffix), ≤60 characters. */
export function priceGuideTitle(n: number | null, page = 1, totalPages: number | null = null): string {
  if (page >= 2) return `Riftbound Price Guide — Page ${page}${totalPages ? ` of ${totalPages}` : ""}`;
  if (n != null && n > 0) {
    const t = `Riftbound Price Guide: All ${n.toLocaleString("en-US")} Cards in One Price List`;
    if (t.length <= TITLE_MAX) return t;
  }
  return "Riftbound Price Guide: Every Card in One Price List";
}

/** ≤155 characters, market-neutral (Googlebot crawls as a US visitor). */
export function priceGuideDescription(n: number | null, page = 1, totalPages: number | null = null): string {
  if (page >= 2) {
    return `The full Riftbound price guide: ${cards(n)} in one sortable price list, filterable by set, rarity, domain or printing. Page ${page}${totalPages ? ` of ${totalPages}` : ""}.`;
  }
  return `The full Riftbound price guide: ${cards(n)} in one sortable price list. Filter by set, rarity, domain, type or printing. Prices updated twice a day.`;
}

export interface PriceGuideIndexing {
  /** Site-relative canonical; the JSON-LD url must equal it. */
  canonical: string;
  index: boolean;
  /** The page number the title and description describe (1 unless an indexable ?page=N). */
  page: number;
}

const present = (v: string | string[] | undefined) => (Array.isArray(v) ? v.some((x) => x !== "") : v != null && v !== "");

/**
 * The /browse pagination policy, with /sets' stricter rule for everything else:
 *  - the clean URL: indexable, self-canonical;
 *  - `?page=N` and nothing else, 2 ≤ N ≤ totalPages: indexable, self-canonical
 *    (paginated pages are not duplicates of page 1 — each carries its own 100
 *    card links); `?page=1` canonicalises to the clean URL;
 *  - an out-of-range or malformed page, or ANY other non-empty parameter
 *    (filters, sort, size, market, search): noindex,follow with the clean
 *    canonical, so a `?set=` view never competes with /sets/<slug>.
 * `totalPages` null (the catalogue failed to load) indexes no ?page=N at all.
 */
export function priceGuideIndexing(sp: RawSearchParams, totalPages: number | null): PriceGuideIndexing {
  const keys = Object.keys(sp).filter((k) => present(sp[k]));
  if (!keys.length) return { canonical: PRICE_GUIDE_PATH, index: true, page: 1 };
  const raw = sp.page;
  if (keys.length === 1 && keys[0] === "page" && typeof raw === "string" && /^\d+$/.test(raw)) {
    const p = parseInt(raw, 10);
    if (p === 1) return { canonical: PRICE_GUIDE_PATH, index: true, page: 1 };
    if (totalPages != null && p >= 2 && p <= totalPages) {
      return { canonical: `${PRICE_GUIDE_PATH}?page=${p}`, index: true, page: p };
    }
  }
  return { canonical: PRICE_GUIDE_PATH, index: false, page: 1 };
}

/**
 * One list feeds both the visible <HubFaq> and the FAQPage JSON-LD, so the
 * markup can never describe answers the page does not show. Market-neutral:
 * every visitor and every crawler reads the same words.
 */
export const PRICE_GUIDE_FAQ: { q: string; a: string }[] = [
  {
    q: "What does the Riftbound price guide show?",
    a: "Every released Riftbound card on one list, each with the cheapest in-stock price we track in your market — Australia, the United States, the United Kingdom, Singapore, Canada or the EU — in that market's currency. Every printing has its own row, from base commons to alternate arts, Signature and overnumbered cards.",
  },
  {
    q: "How often are the prices updated?",
    a: "Twice a day. Prices come from two imports, at 07:00 and 19:00 UTC, so a figure can be up to about half a day old. Open a card to compare every store's current offer for it.",
  },
  {
    q: "Are these sale prices or asking prices?",
    a: "Asking prices. Each figure is the lowest price on a current in-stock listing, from a store or eBay, and it is the item price only: postage is added at checkout. A card can change hands for less than it is listed at, so read a price here as what it costs to buy one today.",
  },
  {
    q: "Why is the 7-day change the same in every market?",
    a: "It is measured on one weekly price per card: the cheapest across Australia, the US, the UK and Singapore, converted to US dollars. That keeps the percentage comparable from card to card, but it can differ from the move in your own market's price. It stays blank until a card has two weekly prices on the current pricing basis.",
  },
  {
    q: "Why do some cards show a dash instead of a price?",
    a: "No store or eBay seller we track has that printing in stock in your market right now. Switch market to see whether it is stocked elsewhere, or open the card to compare every market's listings.",
  },
  {
    q: "How is this different from the card database?",
    a: "The card database shows cards as image tiles and opens on the most-searched cards. The price guide puts every card on one dense table that opens on the most expensive, with the weekly change and the number of stores in stock beside each price, so it is quicker for scanning a whole set, rarity or price range.",
  },
];
