import { SECTIONS, sectionUrl, type SectionId } from "@/lib/sitemap-sections";
import { cardHistoryLatestDay } from "@/lib/price-history-store";
import { getArticles } from "@/lib/articles";
import { SITE_URL } from "@/lib/site";

// SITEMAP INDEX. /sitemap.xml is now a <sitemapindex> pointing at one child per
// section (/sitemaps/<id>.xml) rather than a single ~1,500-URL <urlset>.
//
// This replaces the app/sitemap.ts metadata convention deliberately, rather than
// using Next's generateSitemaps(): that helper's output path and whether it emits
// an index at all have varied across Next versions, and this is the one file the
// entire crawl depends on. A hand-written index is boring, explicit, and cannot
// change shape under a framework upgrade.
//
// The URL is unchanged, so robots.txt and any existing Search Console submission
// keep working — Google follows the index to the children automatically. Submit
// the children individually as well to get PER-SECTION coverage reporting, which
// is the whole point of the split.
export const revalidate = 86400;

// <lastmod> per child (SEO report, 2026-11-03: Google and Bing use an accurate
// index lastmod to schedule which child to re-read). Building every section to
// take its max would cost the per-request work the split exists to avoid, so
// each child's date comes from the one cheap source its entries already use:
// the newest price-history day (committed files, no database) for every
// price-driven section, the newest article for "content". Pokémon has its own
// data and no cheap date, so it carries none rather than a guessed one.
function sectionLastmod(id: SectionId, priceDay: Date | undefined, articleDay: Date | undefined): Date | undefined {
  if (id === "pokemon") return undefined;
  if (id === "content") return articleDay;
  return priceDay;
}

function safe<T>(f: () => T): T | undefined {
  try {
    return f();
  } catch {
    return undefined;
  }
}

export async function GET() {
  const priceDay = safe(() => cardHistoryLatestDay());
  const articleDay = safe(() => {
    const times = getArticles().map((a) => new Date(`${a.updated ?? a.date}T09:00:00+10:00`).getTime());
    return times.length ? new Date(Math.max(...times)) : undefined;
  });
  const entry = (loc: string, at: Date | undefined) =>
    `  <sitemap><loc>${loc}</loc>${at && !Number.isNaN(at.getTime()) ? `<lastmod>${at.toISOString()}</lastmod>` : ""}</sitemap>`;
  const body = [
    ...SECTIONS.map((id) => entry(sectionUrl(id), sectionLastmod(id, priceDay, articleDay))),
    // The news sitemap (robots.txt already lists it) belongs in the index too,
    // so a crawler that reads only the index still finds it.
    entry(`${SITE_URL}/news-sitemap.xml`, articleDay),
  ].join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</sitemapindex>`;
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=86400, stale-while-revalidate=86400",
    },
  });
}
