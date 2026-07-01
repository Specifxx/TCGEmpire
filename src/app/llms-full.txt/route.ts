import { getMarketIndex } from "@/lib/market-index";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { cardHref } from "@/lib/card-url";
import { SITE_NAME, SITE_URL } from "@/lib/site";

// llms-full.txt — a single-file markdown snapshot an agent can ingest in one fetch:
// the live RiftCompare Index plus the most-searched cards with their lowest AU price.
// Best-effort: any DB hiccup just omits that block (never throws). Refreshed hourly.
export const revalidate = 3600;

const pct = (p: number | null | undefined) => (p == null ? "—" : `${p > 0 ? "+" : ""}${p}%`);

export async function GET() {
  const lines: string[] = [];
  lines.push(`# ${SITE_NAME} — full text index`);
  lines.push("");
  lines.push(
    "> A machine-readable snapshot of the Riftbound market on RiftCompare. Prices are the lowest " +
      "live in-stock Australian price unless noted; the full per-region data is on each card page " +
      `(append \`.md\` for markdown) and the index JSON is at ${SITE_URL}/api/v1/index.json.`
  );
  lines.push("");

  try {
    const index = await getMarketIndex("GLOBAL");
    if (index) {
      lines.push("## The RiftCompare Index (global composite, base 100)");
      lines.push(`- Level: ${index.latest.toFixed(1)} (base 100 on ${index.startDay})`);
      lines.push(`- Change: 1d ${pct(index.d1)} · 7d ${pct(index.d7)} · 30d ${pct(index.d30)} · all-time ${pct(index.sinceStart)}`);
      if (index.stats) {
        lines.push(
          `- Index value (cost of one of each card): ${formatMoney(index.stats.basketValueCents, index.currency)} · ` +
            `advancing ${index.stats.advancing} / declining ${index.stats.declining} · ` +
            `range ${index.stats.low.toFixed(1)}–${index.stats.high.toFixed(1)}`
        );
      }
      lines.push(`- Full page: ${SITE_URL}/market · JSON: ${SITE_URL}/api/v1/index.json`);
      lines.push("");
    }
  } catch {
    /* omit the index block on error */
  }

  try {
    const cards = await prisma.card.findMany({
      where: { searchCount: { gt: 0 }, lowestPriceCents: { not: null } },
      orderBy: [{ searchCount: "desc" }, { viewCount: "desc" }],
      take: 100,
      select: { name: true, setCode: true, collectorNumber: true, slug: true, id: true, lowestPriceCents: true },
    });
    if (cards.length) {
      lines.push("## Most-searched Riftbound cards (lowest live AU price)");
      lines.push("");
      lines.push("| # | Card | Set | No. | Lowest (AUD) | URL |");
      lines.push("|---|---|---|---|---|---|");
      cards.forEach((c, i) => {
        const price = c.lowestPriceCents != null ? formatMoney(c.lowestPriceCents) : "—";
        lines.push(`| ${i + 1} | ${c.name} | ${c.setCode} | ${c.collectorNumber} | ${price} | ${SITE_URL}${cardHref(c)} |`);
      });
      lines.push("");
    }
  } catch {
    /* omit the cards block on error */
  }

  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
