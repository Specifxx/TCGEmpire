import type { Metadata } from "next";
import { notFoundMetadata } from "@/lib/not-found-metadata";
import { notFound } from "next/navigation";
import { getArticle, getArticles } from "@/lib/articles";
import { ArticleView } from "@/components/ArticleView";
import { SITE_URL } from "@/lib/site";
import { clampText } from "@/lib/format";
import { pageAlternates, pageOpenGraph } from "@/lib/seo";

// Same ~155-char soft cap as /blog/[slug]/page.tsx, and the same reason: an SEO
// audit found published excerpts rendering straight into <meta
// name="description"> past Google's SERP truncation point with nothing to
// catch it. Guides share the identical `excerpt` field and the identical risk
// — this was the one metadata generator that hadn't picked up the fix yet.
const DESCRIPTION_MAX = 155;

// ISR rather than a pure build-time static render. A guide can now carry a LIVE
// data block (Article.topValue / Article.marketData), and the build sandbox has
// no database — without a revalidate window those blocks would render their
// empty fallback at build time and stay frozen that way until the next deploy.
// Matches /blog/[slug]'s existing 600s.
// ISR: 24 hours, with the price importer's /api/revalidate POST purging this
// path outright at the end of every run (see lib/revalidate-content.ts).
//
// It was 600. Nothing here changes on a ten-minute clock: the prose is compiled
// into the bundle, so an edit ships with a deploy, and the only live data is the
// embedded card galleries, which move when the importer runs. The short TTL was
// compensating for these routes being absent from the on-demand purge list —
// they are on it now, so freshness went UP (immediate on import, not up to ten
// minutes late) while regenerations went from 144 a day to 1.
//
// Across 56 posts + 38 guides that is ~13,500 renders a day, each re-running its
// article's embed queries against Neon, replaced by ~2. See the egress rules at
// the top of lib/db.ts for why that matters here specifically.
export const revalidate = 86400;

export function generateStaticParams() {
  return getArticles("guide").map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const a = getArticle(params.slug);
  if (!a || a.category !== "guide") return notFoundMetadata("Guide");
  const description = clampText(a.excerpt, DESCRIPTION_MAX);
  return {
    // " — RiftCompare", matching every other indexed page's suffix (the root
    // layout's title template, and TITLE_SUFFIX in lib/deck-groups.ts) — see
    // the identical note in blog/[slug]/page.tsx for why the longer, category-
    // naming suffix was dropped.
    title: { absolute: `${a.title} — RiftCompare` },
    description,
    // Reachable by direct URL for review, but never indexed while unfinished.
    ...(a.draft ? { robots: { index: false, follow: true } } : {}),
    alternates: pageAlternates(`/guides/${a.slug}`, {
      // Machine-readable mirror for agents — the counterpart of the one
      // /blog/[slug] and /card/[id] already advertise.
      types: { "text/markdown": `${SITE_URL}/llm/guides/${a.slug}` },
    }),
    openGraph: pageOpenGraph({
      type: "article",
      title: a.title,
      description: a.excerpt,
      url: `/guides/${a.slug}`,
      publishedTime: a.date,
      modifiedTime: a.updated ?? a.date,
      authors: [a.author],
      ...(a.hero ? { images: [a.hero.src.startsWith("http") ? a.hero.src : `${SITE_URL}${a.hero.src}`] } : {}),
    }),
  };
}

export default function GuideArticlePage({ params }: { params: { slug: string } }) {
  const a = getArticle(params.slug);
  if (!a || a.category !== "guide") notFound();
  return <ArticleView article={a} />;
}
