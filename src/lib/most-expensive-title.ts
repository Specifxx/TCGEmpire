// <title> for /blog/most-expensive-riftbound-cards: the month, the #1 card and
// its price, all from the live ranking. DECISIONS.md, "Search snippets:
// answers in the title, from data", 2026-09-24.
//
// "most expensive riftbound cards" is 3,349 impressions at 1.6%: the searcher
// wants to know WHICH card and HOW MUCH, and the title answered neither. The
// ranking is the article's own live table (ArticleTopValue, US market, the
// same cached query), so the title and the table cannot disagree. Brand-free
// like the set-page titles: the rungs that name a card do not fit 60
// characters with " — RiftCompare" on the end. Pure — tests pin the ladder.
import { monthYear } from "./content/month-year";
import { shortCardName } from "./card-name";

export const MOST_EXPENSIVE_SLUG = "most-expensive-riftbound-cards";
const MAX = 60;

/** "US$1,250" — whole dollars; cents are noise at this price. */
function wholeUsd(cents: number): string {
  return `US$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

export function mostExpensiveTitle(
  top: { name: string; priceCents: number } | null,
  now: Date = new Date(),
): string {
  const month = monthYear(now.toISOString().slice(0, 10));
  const fallback = `Most Expensive Riftbound Cards (${month}) — RiftCompare`;
  if (!top || top.priceCents <= 0) return fallback;
  const price = wholeUsd(top.priceCents);
  const short = shortCardName(top.name);
  const candidates = [
    `Most Expensive Riftbound Cards (${month}): #1 ${top.name} ${price}`,
    `Most Expensive Riftbound Cards (${month}): #1 ${short} ${price}`,
    `Most Expensive Riftbound Cards ${month}: ${short}, ${price}`,
    `Priciest Riftbound Cards (${month}): #1 ${short} ${price}`,
    // For a comma-less name there is no short form to fall back to.
    `Priciest Riftbound Cards ${month}: ${short} ${price}`,
  ];
  return candidates.find((t) => t.length <= MAX) ?? fallback;
}
