// Client-safe card URL helpers (no Prisma import, so they can be used in client
// components without dragging the DB client into the browser bundle).

// Human-readable, unique URL slug for a card, e.g. "vayne-hunter-sfd-223s-221".
// name+set+number is unique per card; promos share a base card's number so they
// get a "-promo" suffix. "*" (signature) -> "s" so it survives slugification.
export function cardSlug(card: {
  name: string;
  setCode: string;
  collectorNumber: string;
  isPromo?: boolean;
}): string {
  const base = `${card.name} ${card.setCode} ${card.collectorNumber.replace(/\*/g, "s")}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return card.isPromo ? `${base}-promo` : base;
}

// URL for a card — prefer the slug, fall back to id for any card not yet backfilled.
// `slug` is REQUIRED (not optional) on purpose: a Prisma select that forgets to pull
// slug then silently ships raw-cuid URLs. Making it required turns that into a compile
// error at the call site. Pass `slug: null` explicitly only for genuinely slugless cards.
export function cardHref(card: { id: string; slug: string | null }): string {
  return `/card/${card.slug ?? card.id}`;
}
