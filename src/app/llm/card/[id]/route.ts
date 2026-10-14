import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { cardHref } from "@/lib/card-url";
import { SITE_URL } from "@/lib/site";
import { cardWhereParam } from "@/lib/card-slug-renames";

// Clean markdown version of a card page for AI agents (linked from the card page's
// `alternate` type=text/markdown). Per-region lowest prices + identity, no HTML.
//
// Six hours (15 minutes until 2026-10-14, DECISIONS.md, "Cached pages refresh
// every 6 to 24 hours", 2026-10-14). A plain function on Vercel (no
// generateStaticParams), so until then every request read the card from Neon;
// the CDN header on the answer is the cache.
export const revalidate = 21600;

// Renamed slugs resolve too (lib/card-slug-renames.ts).
const whereParam = cardWhereParam;
const line = (label: string, cents: number | null, currency: string) =>
  `- ${label}: ${cents == null ? "no tracked in-stock listing" : formatMoney(cents, currency)}`;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const card = await prisma.card
    .findFirst({
      where: whereParam(params.id),
      select: {
        id: true, slug: true, name: true, setName: true, setCode: true, collectorNumber: true,
        lowestPriceCents: true, lowestPriceCentsUs: true, lowestPriceCentsUk: true, lowestPriceCentsSg: true, lowestPriceCentsCa: true, lowestPriceCentsEu: true,
      },
    })
    .catch(() => null);

  if (!card) return new Response("Not found\n", { status: 404, headers: { "Content-Type": "text/markdown; charset=utf-8" } });

  const url = `${SITE_URL}${cardHref(card)}`;
  const lines = [
    `# ${card.name} (${card.setCode} ${card.collectorNumber})`,
    "",
    `> Riftbound ${card.setName} card. Lowest live in-stock price per market on RiftCompare.`,
    "",
    "## Lowest price by market",
    line("Australia (AUD)", card.lowestPriceCents, "AUD"),
    line("United States (USD)", card.lowestPriceCentsUs, "USD"),
    line("United Kingdom (GBP)", card.lowestPriceCentsUk, "GBP"),
    line("Singapore (SGD)", card.lowestPriceCentsSg, "SGD"),
    line("Canada (CAD)", card.lowestPriceCentsCa, "CAD"),
    line("Europe / EU (EUR)", card.lowestPriceCentsEu, "EUR"),
    "",
    `Compare all listings: ${url}`,
    `JSON: ${SITE_URL}/api/v1/card/${card.slug ?? card.id}/prices.json`,
  ];
  return new Response(lines.join("\n") + "\n", {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400",
    },
  });
}
