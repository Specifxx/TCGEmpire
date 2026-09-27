// Database side of the card-page indexing decision (lib/indexing-policy.ts holds
// the rules). Two small per-card queries, run only in generateMetadata, which
// ISR caches with the page.
import { prisma } from "./db";
import { getCanonicalTwin } from "./card-duplicates";
import { basePrintingOf, cardPolicy, INDEXING_REVIEW_MODE, type IndexDecision, type PrintingFields } from "./indexing-policy";

export interface CardIndexing extends IndexDecision {
  /** Path this page canonicalises to (its own path when it is the primary). */
  canonicalPath: string;
}

export async function getCardIndexing(card: PrintingFields, ownPath: string): Promise<CardIndexing> {
  const twin = await getCanonicalTwin(card);
  let base: PrintingFields | null = null;
  let hasAnyPrice = true;
  if (!twin && INDEXING_REVIEW_MODE) {
    const [siblings, anyListing] = await Promise.all([
      prisma.card
        .findMany({
          where: { name: card.name },
          select: { id: true, slug: true, name: true, setCode: true, collectorNumber: true, rarity: true, variant: true, isPromo: true },
          take: 40,
        })
        .catch(() => [] as PrintingFields[]),
      prisma.retailerPrice
        .findFirst({ where: { cardId: card.id }, select: { id: true } })
        .catch(() => ({ id: "unknown" })),
    ]);
    base = basePrintingOf(card, siblings);
    hasAnyPrice = anyListing != null;
  }
  const decision = cardPolicy({ isDuplicateRow: twin != null, basePrinting: base, hasAnyPrice });
  const target = twin ?? base;
  return { ...decision, canonicalPath: target ? `/card/${target.slug ?? target.id}` : ownPath };
}
