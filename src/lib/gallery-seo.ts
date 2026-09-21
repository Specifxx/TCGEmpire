// Title and description builders for /gallery, kept out of the route file
// because a page.tsx may export only Next's route fields.

// The title carries the card count (2026-09-21). Search Console, 28 days:
// "riftbound card gallery" 712 impressions at position 9.1 with 0.1% CTR, and
// /gallery 1,271 impressions for 4 clicks. The old title — "Riftbound Card
// Gallery — Every Set, Every Card" — matched the query and said nothing a
// searcher could weigh against the other nine results. "All 1,431 Cards" is
// the one claim a gallery can make that a competitor's page may not, and it
// is true by construction because it is the database's own count. Stays
// inside 60 with the suffix for any four-digit count.
export function galleryTitle(totalCards: number): string {
  return totalCards > 0
    ? `Riftbound Card Gallery: All ${totalCards.toLocaleString("en-US")} Cards by Set`
    : "Riftbound Card Gallery: Every Card, Every Set";
}
// `setNames` in release order, so the "Origins to Vendetta" span rolls forward
// to Radiance on its own once it releases, rather than going stale in the SERP.
export function galleryDescription(totalCards: number, setNames: string[]): string {
  const span = setNames.length > 1 ? `${setNames[0]} to ${setNames[setNames.length - 1]}` : setNames[0] ?? "every set";
  return totalCards > 0
    ? `Every Riftbound card as full-size art: ${totalCards.toLocaleString("en-US")} cards across ${setNames.length} sets, ${span}, each with live prices. Pick a set to open its full gallery.`
    : "Every Riftbound card as full-size art, set by set, each with live prices from every store we track. Pick a set to open its full gallery.";
}
