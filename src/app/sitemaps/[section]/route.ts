import { SECTIONS, buildSection, type SectionId } from "@/lib/sitemap-sections";

// One child sitemap per section, served at /sitemaps/<id>.xml.
//
// The ".xml" lives in the dynamic param rather than the folder name (Next can't
// express a bracketed segment with a literal extension), so the param arrives as
// "cards.xml" and the suffix is stripped here. An unknown section 404s rather
// than serving an empty <urlset>, so a typo'd Search Console submission fails
// loudly instead of quietly reporting "0 URLs discovered".
export const revalidate = 86400;

export function generateStaticParams() {
  return SECTIONS.map((id) => ({ section: `${id}.xml` }));
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

export async function GET(_req: Request, { params }: { params: { section: string } }) {
  const id = params.section.replace(/\.xml$/, "") as SectionId;
  if (!SECTIONS.includes(id)) {
    return new Response("Not found", { status: 404 });
  }

  const entries = await buildSection(id);
  const hasImages = entries.some((e) => e.images?.length);

  const body = entries
    .map((e) => {
      const parts = [`    <loc>${esc(e.url)}</loc>`];
      // FULL timestamp, not `.slice(0, 10)` (date-only) — the sitemap protocol
      // accepts either (sitemaps.org: "You can employ a full date and time or a
      // date"), and date-only was silently discarding real distinctness the
      // per-entry queries above already compute. cards()/sets()/champions()/
      // decks()/stores() each aggregate a genuine per-item MAX(RetailerPrice.lastSeen)
      // — different stores' price-import batches land seconds-to-minutes apart
      // within a run — but truncating to YYYY-MM-DD collapsed an entire day's
      // worth of distinct batch timestamps into one identical string, which is
      // how a 2026-08-30 SEO audit found cards.xml's ~1,400 URLs sharing only 2
      // distinct <lastmod> values despite every card page showing a different
      // "updated Xh ago". The fix is here, not in those per-entry queries: they
      // were already computing the right Date, this was throwing its precision away.
      if (e.lastModified) parts.push(`    <lastmod>${e.lastModified.toISOString()}</lastmod>`);
      if (e.changeFrequency) parts.push(`    <changefreq>${e.changeFrequency}</changefreq>`);
      if (e.priority != null) parts.push(`    <priority>${e.priority.toFixed(1)}</priority>`);
      for (const img of e.images ?? []) parts.push(`    <image:image><image:loc>${esc(img)}</image:loc></image:image>`);
      return `  <url>\n${parts.join("\n")}\n  </url>`;
    })
    .join("\n");

  // The image namespace is declared only when the section actually carries
  // images (cards). Declaring an unused namespace is harmless but noisy, and its
  // absence makes it obvious at a glance which section is the image sitemap.
  const ns = [
    'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
    ...(hasImages ? ['xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"'] : []),
  ].join(" ");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset ${ns}>
${body}
</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=86400, stale-while-revalidate=86400",
    },
  });
}
