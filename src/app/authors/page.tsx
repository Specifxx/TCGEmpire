import type { Metadata } from "next";
import Link from "next/link";
import { ARTICLE_PROCESS, AUTHORS } from "@/lib/content/authors";
import { getArticles } from "@/lib/articles";
import { SITE_URL } from "@/lib/site";
import { pageAlternates } from "@/lib/seo";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Who writes RiftCompare",
  description:
    "Who writes RiftCompare's Riftbound guides and posts: Bill, the founder who runs the site, and the site byline he edits — and how every article is checked.",
  alternates: pageAlternates("/authors"),
};

export default function AuthorsPage() {
  const articles = getArticles();
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Authors", item: `${SITE_URL}/authors` },
    ],
  };

  return (
    <div className="mx-auto max-w-3xl">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />

      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-slate-400">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li><Link href="/" className="hover:text-white">Home</Link></li>
          <li className="text-ink-700">/</li>
          <li className="text-slate-300" aria-current="page">Authors</li>
        </ol>
      </nav>

      <h1 className="text-3xl font-extrabold leading-tight text-white">Who writes RiftCompare</h1>
      <div className="mt-3 max-w-2xl space-y-3 text-sm leading-relaxed text-slate-400">
        <p>
          RiftCompare is built and run by one person: Bill, its founder. Every article carries one of
          two bylines — Bill&rsquo;s own name, on the articles that are his, and RiftCompare, the
          site&rsquo;s byline for everything else: buying guides, set overviews, news and market posts.
        </p>
        <p>
          Both are produced the same way. {ARTICLE_PROCESS} So a price quoted in an article is one
          our importer recorded, not a number a draft suggested.
        </p>
        <p>
          What neither byline is: an invented person. There is no stock photo and no fabricated
          biography here. Bill&rsquo;s page says only what is true of him, and the RiftCompare byline
          is typed as what it is, the site itself, rather than dressed up as a writer.
        </p>
        <p>
          Our{" "}
          <Link href="/editorial-policy" className="text-brand-400 hover:underline">editorial &amp; pricing policy</Link>{" "}
          sets out how prices are collected and verified, how often each surface refreshes, how
          corrections are handled and how the site makes money. Spotted a mistake? The{" "}
          <Link href="/contact" className="text-brand-400 hover:underline">contact form</Link> reaches
          Bill directly, and every card page has a &ldquo;Spotted a wrong price? Report it&rdquo; link
          under its list of stores.
        </p>
      </div>

      <div className="mt-8 space-y-4">
        {AUTHORS.map((a) => {
          const count = articles.filter((x) => x.author === a.name).length;
          return (
            <Link
              key={a.slug}
              href={`/authors/${a.slug}`}
              className="card-surface block p-5 transition-colors hover:border-brand-500"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-lg font-bold text-white">{a.name}</span>
                <span className="text-xs text-slate-500">
                  {count} {count === 1 ? "article" : "articles"}
                </span>
              </div>
              <p className="mt-0.5 text-xs uppercase tracking-wide text-slate-500">{a.role}</p>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{a.bio[0]}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
