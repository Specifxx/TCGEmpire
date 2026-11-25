// The "Is this box worth it?" card's data (components/BoxEvCard.tsx, on Booster Box and Booster Case pages): ONE
// expected value per set, in USD cents, from the same TCGplayer US market prices and default pull rates as
// /tools/box-ev (lib/box-ev.ts boxEvSummaries). Server only.
//
// Egress (rules at the top of lib/db.ts): the two reads are the calculator's own whole-catalogue reads, but what is
// cached is a handful of numbers (one row per set), so the entry is tiny and always caches; it is computed at most
// once a day per deploy (86400, above the sealed page's CDN day, rule 5), and concurrent first renders on one
// instance share one in-flight compute instead of each running the reads. Never call this from inside another
// unstable_cache callback (rule 6): the sealed page calls it at its top level.
import { prisma } from "@/lib/db";
import { cachedOrDirect } from "@/lib/price-history";
import { CONTENT_TAG } from "@/lib/revalidate-content";
import { SETS } from "@/lib/constants";
import { boxEvSummaries, usdByCardFrom, type BoxEvSummary } from "@/lib/box-ev";
import { preferMarketRows, TCG_US_MARKET_READ_KEYS } from "@/lib/tcg-market-rows";

const g = globalThis as unknown as { __boxEvSummary?: Promise<Record<string, BoxEvSummary>> | null };

async function compute(): Promise<Record<string, BoxEvSummary>> {
  const tcgUs = preferMarketRows(
    await prisma.retailerPrice
      .findMany({
        where: { retailer: { in: [...TCG_US_MARKET_READ_KEYS] }, country: "US" },
        select: { cardId: true, priceCents: true, isFoil: true, retailer: true },
      })
      .catch(() => [] as { cardId: string; priceCents: number; isFoil: boolean; retailer: string }[]),
  );
  const cards = await prisma.card
    .findMany({
      where: { isPromo: false },
      select: { id: true, setCode: true, rarity: true, collectorNumber: true, variant: true, isOvernumbered: true },
    })
    .catch(() => [] as { id: string; setCode: string; rarity: string; collectorNumber: string; variant: string | null; isOvernumbered: boolean }[]);
  const released = new Set(SETS.filter((s) => !s.comingSoon).map((s) => s.code));
  const out: Record<string, BoxEvSummary> = {};
  for (const s of boxEvSummaries(cards, usdByCardFrom(tcgUs), released)) out[s.setCode] = s;
  return out;
}

/** Each released set's box expected value, keyed by set code; a set missing here gets no card. Never throws. */
export async function getBoxEvSummaries(): Promise<Record<string, BoxEvSummary>> {
  try {
    return await cachedOrDirect(
      () => {
        g.__boxEvSummary ??= compute().finally(() => {
          g.__boxEvSummary = null;
        });
        return g.__boxEvSummary;
      },
      ["box-ev-summary"],
      { revalidate: 86400, tags: [CONTENT_TAG] },
    );
  } catch {
    return {};
  }
}
