import Link from "next/link";
import type { Article } from "@/lib/articles";
import { Markdown } from "./Markdown";
import { fmtDate } from "./ArticleList";
import { AdSlot } from "./AdSlot";
import { ArticleShopStrip } from "./ArticleShopStrip";
import { SITE_URL } from "@/lib/site";

export function ArticleView({ article }: { article: Article }) {
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

      {/* Per-article eBay affiliate searches — the reader is at peak intent right
          after finishing the guide; this is where a well-ranking page converts. */}
      {article.shop && article.shop.length > 0 && <ArticleShopStrip items={article.shop} />}

      <AdSlot className="mt-8" height={120} />
    </article>
  );
}
