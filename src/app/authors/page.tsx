import type { Metadata } from "next";
import Link from "next/link";
import { AUTHORS } from "@/lib/content/authors";
import { getArticles } from "@/lib/articles";
import { SITE_URL } from "@/lib/site";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Who writes RiftCompare",
  description:
    "The bylines behind RiftCompare's Riftbound guides, posts and market coverage — who writes what, and how it's researched.",
  alternates: { canonical: "/authors" },
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
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400">
        Two bylines, kept separate on purpose: writing composed by the people who run the site, and
        writing generated directly from our price database. Which one a piece carries tells you how
        it was produced. Our{" "}
        <Link href="/editorial-policy" className="text-brand-400 hover:underline">editorial policy</Link>{" "}
        covers how prices are collected and verified, how often they refresh, and how to report an error.
      </p>

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
