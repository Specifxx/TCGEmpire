import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { cardHref } from "@/lib/card-url";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { getArticles } from "@/lib/articles";
import { SETS } from "@/lib/constants";

// llms-full.txt — a single-file markdown snapshot an agent can ingest in one fetch:
// the most-searched cards with their lowest AU price, plus the guides and answers.
// Best-effort: any DB hiccup just omits that block (never throws). Refreshed hourly.
export const revalidate = 3600;

export async function GET() {
  const lines: string[] = [];
  lines.push(`# ${SITE_NAME} — full text index`);
  lines.push("");
  lines.push(
    "> A machine-readable snapshot of the Riftbound market on RiftCompare. Prices are the lowest " +
      "live in-stock Australian price unless noted; the full per-region data is on each card page " +
      `(append \`.md\` for markdown). ` +
      `The full public data API is described at ${SITE_URL}/openapi.json (OpenAPI 3.1) — no API key required.`
  );
  lines.push("");

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

  // EDITORIAL CONTENT. Until now this file carried prices and nothing else, so an
  // agent pointed at "the single-file snapshot" learned the market and nothing
  // about who explains it — which is the half that decides whether a source gets
  // CITED rather than merely scraped. Both blocks below are in-process constants,
  // so neither costs a database round trip.
  const articles = getArticles();
  if (articles.length) {
    lines.push("## Guides and analysis");
    lines.push("");
    for (const a of articles) {
      const href = `${SITE_URL}/${a.category === "guide" ? "guides" : "blog"}/${a.slug}`;
      lines.push(`- [${a.title}](${href}) — ${a.date}${a.updated && a.updated !== a.date ? ` (updated ${a.updated})` : ""}: ${a.excerpt}`);
    }
    lines.push("");
  }

  // The answer-first summaries, lifted verbatim from the articles that carry
  // them. This is the block an answer engine can quote directly.
  const withSummary = articles.filter((a) => a.summary?.length);
  if (withSummary.length) {
    lines.push("## Key answers");
    lines.push("");
    for (const a of withSummary) {
      const href = `${SITE_URL}/${a.category === "guide" ? "guides" : "blog"}/${a.slug}`;
      lines.push(`### ${a.title}`);
      lines.push("");
      // Strip markdown link syntax so the plain-text answer reads cleanly.
      for (const s of a.summary!) lines.push(`- ${s.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\*\*/g, "")}`);
      lines.push("");
      lines.push(`Source: ${href}`);
      lines.push("");
    }
  }

  lines.push("## Sets");
  lines.push("");
  for (const set of SETS) {
    lines.push(
      `- ${set.name} (${set.code})${set.totalCards ? ` — ${set.totalCards} cards` : ""}${set.comingSoon ? " — upcoming" : ""}: ${SITE_URL}/sets/${set.slug}`
    );
  }
  lines.push("");

  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
