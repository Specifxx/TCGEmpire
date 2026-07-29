import { SECTIONS, sectionUrl } from "@/lib/sitemap-sections";

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

export async function GET() {
  const body = SECTIONS.map((id) => `  <sitemap><loc>${sectionUrl(id)}</loc></sitemap>`).join("\n");
  // NOTE: no <lastmod> on the index entries. It would have to be the max lastmod
  // inside each child, which means building every section just to render the
  // index — the exact per-request cost the split exists to avoid. Google reads
  // lastmod from the child entries themselves, so nothing is lost.
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
