import { prisma } from "./db";
import { cachedOrDirect } from "./price-history";
import { cardTileSelect } from "./cards";
import { cardHref } from "./card-url";
import { DEFAULT_COUNTRY } from "./country";
import { autoLinkCardNames, canonicalPrinting, cardHrefsIn, type CardNameEntry } from "./content/card-mentions";
import type { CardTileData } from "@/components/CardTile";

// Server half of the article card mentions (lib/content/card-mentions.ts has the
// rules). Everything resolves at ISR render time — articles revalidate daily —
// never per request.

/**
 * Every card name → its canonical printing's page. One narrow select over the
 * catalogue (~1,100 rows × five short columns, well under the cache ceiling),
 * cached a day — the same TTL as the article pages, never lower (egress rule 5).
 * Not CONTENT_TAG: names do not change on a price import.
 */
export async function getCardNameIndex(): Promise<CardNameEntry[]> {
  return cachedOrDirect(
    async () => {
      const rows = await prisma.card.findMany({
        where: { slug: { not: null } },
        select: { id: true, slug: true, name: true, variant: true, isPromo: true, collectorNumber: true },
      });
      const byName = new Map<string, typeof rows>();
      for (const r of rows) byName.set(r.name, [...(byName.get(r.name) ?? []), r]);
      const out: CardNameEntry[] = [];
      for (const [name, cards] of byName) {
        const c = canonicalPrinting(cards);
        if (c) out.push({ name, href: cardHref(c) });
      }
      return out;
    },
    ["card-name-index-v1"],
    { revalidate: 86400, tags: ["card-name-index"] },
  );
}

export interface ArticleCardMentions {
  /** The body with first mentions linked. */
  body: string;
  /** Tile data for every /card/… link in the body, keyed by href. */
  cards: Record<string, CardTileData>;
  /** The same cards in order of first appearance, for the end-of-post table. */
  ordered: CardTileData[];
}

export async function resolveArticleCardMentions(rawBody: string): Promise<ArticleCardMentions> {
  const index = await getCardNameIndex().catch(() => [] as CardNameEntry[]);
  const body = autoLinkCardNames(rawBody, index);
  const hrefs = cardHrefsIn(body).slice(0, 60);
  const slugs = hrefs.map((h) => h.slice("/card/".length));
  if (!slugs.length) return { body, cards: {}, ordered: [] };
  const rows = (await prisma.card
    .findMany({ where: { slug: { in: slugs } }, select: cardTileSelect(DEFAULT_COUNTRY), take: 60 })
    .catch(() => [])) as unknown as CardTileData[];
  const cards: Record<string, CardTileData> = {};
  for (const r of rows) cards[cardHref(r)] = r;
  const ordered = hrefs.map((h) => cards[h]).filter(Boolean);
  return { body, cards, ordered };
}
