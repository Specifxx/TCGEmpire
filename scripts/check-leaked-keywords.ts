/**
 * Counts imported Radiance cards carrying each leaked mechanic — Deploy, Showoff
 * and Disarm — so a spoiler-season import run says when the self-filling
 * galleries on the leak roundup and its three guides have started to fill.
 *
 * WHY TWO COUNTS PER KEYWORD: the article galleries match the BRACKETED prefix
 * ("[Deploy", like "[Shield" / "[Level" in keywords.ts), so an unrelated plain
 * use of the word (the circulating Kai'Sa text uses "Disarm" for something else)
 * never lands in a gallery. If Riot prints one of these mechanics WITHOUT the
 * bracket, the galleries stay empty while the plain count climbs — that is the
 * signal to change the marker in src/lib/articles.ts, not a thing to guess at.
 *
 * Read-only: six COUNT queries, no rows transferred (lib/db.ts egress rules).
 * Writes a table to $GITHUB_STEP_SUMMARY when set, and always to stdout. Never
 * exits non-zero on a count — it runs as a non-failing tail of set-pipeline.
 *
 * Usage: npx tsx scripts/check-leaked-keywords.ts [--set RAD]
 */
import { appendFileSync } from "node:fs";
import { prisma } from "../src/lib/db";

const KEYWORDS = ["Deploy", "Showoff", "Disarm"] as const;

function argSet(): string {
  const i = process.argv.indexOf("--set");
  return (i >= 0 && process.argv[i + 1]) || "RAD";
}

async function main() {
  const setCode = argSet();
  const rows: { keyword: string; bracketed: number; plainOnly: number }[] = [];
  for (const kw of KEYWORDS) {
    const bracketed = await prisma.card.count({
      where: { setCode, description: { contains: `[${kw}` } },
    });
    // Plain word WITHOUT the bracketed marker anywhere on the card: a different
    // print format, or an unrelated use of the same word.
    const plainOnly = await prisma.card.count({
      where: {
        setCode,
        AND: [{ description: { contains: kw } }, { NOT: { description: { contains: `[${kw}` } } }],
      },
    });
    rows.push({ keyword: kw, bracketed, plainOnly });
  }
  const total = await prisma.card.count({ where: { setCode } });

  const lines = [
    `### Leaked-keyword cards in ${setCode} (${total} cards imported)`,
    "",
    "| Keyword | `[Keyword` (fills the galleries) | Plain word only |",
    "| --- | --- | --- |",
    ...rows.map((r) => `| ${r.keyword} | ${r.bracketed} | ${r.plainOnly} |`),
    "",
    rows.some((r) => r.plainOnly > 0 && r.bracketed === 0)
      ? "A keyword appears only WITHOUT brackets — check its printed format before changing the article galleries' `rulesContain` marker."
      : "Galleries on the leak roundup and the Deploy/Showoff/Disarm guides render once the bracketed count is above zero.",
  ];
  const out = lines.join("\n") + "\n";
  console.log(out);
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) appendFileSync(summary, out);
}

main()
  .catch((e) => {
    // Informational only: report and exit 0 so an import run is never reddened.
    console.error("check-leaked-keywords failed:", e instanceof Error ? e.message : e);
  })
  .finally(() => prisma.$disconnect());
