import Link from "next/link";
import type { Article } from "@/lib/articles";
import { prisma } from "@/lib/db";
import { cardTileSelect } from "@/lib/cards";
import { DEFAULT_COUNTRY } from "@/lib/country";
import { CardTile, type CardTileData } from "./CardTile";
import { Markdown } from "./Markdown";
import { fmtDate } from "./ArticleList";
import { AdSlot } from "./AdSlot";
import { ArticleShopStrip } from "./ArticleShopStrip";
import { SITE_URL } from "@/lib/site";

// Resolve an article's embedded card gallery to real card rows. Resilient: any DB
// error (or the build sandbox's missing DATABASE_URL) → [] and the article still
// renders. `slugs` preserves the author's order; `chaseSet` self-populates with the
// set's chase-tier printings (Showcase/Epic, signature "*" numbers, alt-arts) so a
// spoiler-season gallery fills as reveals are imported — no fabricated cards, ever.
async function resolveEmbed(article: Article): Promise<CardTileData[]> {
  const e = article.embed;
  if (!e) return [];
  const select = cardTileSelect(DEFAULT_COUNTRY);
  try {
    if (e.slugs?.length) {
      const rows = await prisma.card.findMany({ where: { slug: { in: e.slugs } }, select });
      const bySlug = new Map(rows.map((r) => [r.slug, r]));
      return e.slugs.map((sl) => bySlug.get(sl)).filter(Boolean) as unknown as CardTileData[];
    }
    if (e.chaseSet) {
      const rows = await prisma.card.findMany({
        where: {
          setCode: e.chaseSet,
          OR: [
            { rarity: { in: ["Showcase", "Epic"] } },
            { collectorNumber: { contains: "*" } },
            { variant: { not: null } },
          ],
        },
        orderBy: [{ rarity: "asc" }, { collectorNumber: "asc" }],
        take: e.take ?? 12,
        select,
      });
      return rows as unknown as CardTileData[];
    }
  } catch {
    /* no DB (build sandbox) or query failure — render the article without the gallery */
  }
  return [];
}

export async function ArticleView({ article }: { article: Article }) {
  const embedCards = await resolveEmbed(article);
  const isGuide = article.category === "guide";
  const backHref = isGuide ? "/guides" : "/blog";
  const backLabel = isGuide ? "All guides" : "All posts";

  const articleUrl = `${SITE_URL}/${isGuide ? "guides" : "blog"}/${article.slug}`;
  const articleLd = {
    "@context": "https://schema.org",
    "@type": isGuide ? "TechArticle" : "BlogPosting",
    headline: article.title,
    description: article.excerpt,
    datePublished: article.date,
    // dateModified defaults to the publish date until an article carries an
    // explicit `updated` — never older than datePublished.
    dateModified: article.updated ?? article.date,
    author: { "@type": "Organization", name: article.author },
    publisher: { "@type": "Organization", name: "RiftCompare" },
    mainEntityOfPage: articleUrl,
  };
  // Breadcrumb mirrors the visible "← back" link: Home → Blog|Guides → {title}.
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: isGuide ? "Guides" : "Blog", item: `${SITE_URL}${backHref}` },
      { "@type": "ListItem", position: 3, name: article.title, item: articleUrl },
    ],
  };

  return (
    <article className="mx-auto max-w-3xl">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([articleLd, breadcrumbLd]) }} />

      <Link href={backHref} className="mb-4 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white">
        ← {backLabel}
      </Link>

      <div className="mb-2 flex flex-wrap gap-1.5">
        {article.tags.map((t) => (
          <span key={t} className="chip bg-ink-800 text-slate-400">{t}</span>
        ))}
      </div>

      <h1 className="text-3xl font-extrabold leading-tight text-white">{article.title}</h1>
      <div className="mt-2 text-sm text-slate-500">
        {article.author} · {fmtDate(article.date)} · {article.readMins} min read
      </div>

      <AdSlot className="mt-6" height={120} />

      <div className="mt-6 border-t border-ink-800 pt-4">
        <Markdown content={article.body} />
      </div>

      {/* Embedded card gallery — real CardTiles (tap → QuickView popup → card page
          with live prices). Self-populating for chaseSet mode. */}
      {article.embed && (embedCards.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-xl font-extrabold text-white">{article.embed.title}</h2>
          {article.embed.note && <p className="mt-1 text-sm text-slate-400">{article.embed.note}</p>}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {embedCards.map((c) => (
              <CardTile key={c.id} card={c} />
            ))}
          </div>
        </section>
      ) : article.embed.chaseSet ? (
        <p className="mt-8 rounded-xl border border-ink-700 bg-ink-850 p-4 text-sm text-slate-400">
          🃏 The card gallery appears here as revealed {article.embed.chaseSet} cards are added to the database —
          check back through spoiler season.
        </p>
      ) : null)}

      {/* Per-article eBay affiliate searches — the reader is at peak intent right
          after finishing the guide; this is where a well-ranking page converts. */}
      {article.shop && article.shop.length > 0 && <ArticleShopStrip items={article.shop} />}

      <AdSlot className="mt-8" height={120} />
    </article>
  );
}
