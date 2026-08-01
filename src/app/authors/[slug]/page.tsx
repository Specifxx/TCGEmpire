import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AUTHORS, authorBySlug } from "@/lib/content/authors";
import { getArticles } from "@/lib/articles";
import { SITE_URL, CONTACT_EMAIL } from "@/lib/site";

export const revalidate = 86400;

export function generateStaticParams() {
  return AUTHORS.map((a) => ({ slug: a.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const author = authorBySlug(params.slug);
  if (!author) return {};
  return {
    title: `${author.name} — ${author.role}`,
    description: author.bio[0].slice(0, 160),
    alternates: { canonical: `/authors/${author.slug}` },
  };
}

export default function AuthorPage({ params }: { params: { slug: string } }) {
  const author = authorBySlug(params.slug);
  if (!author) notFound();

  const articles = getArticles().filter((a) => a.author === author.name);
  const guides = articles.filter((a) => a.category === "guide");
  const posts = articles.filter((a) => a.category === "blog");

  // Typed as what this byline actually is — an Organization, not a fabricated
  // Person. See the header of lib/content/authors.ts.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": author.type,
    "@id": `${SITE_URL}/authors/${author.slug}#author`,
    name: author.name,
    url: `${SITE_URL}/authors/${author.slug}`,
    jobTitle: author.role,
    description: author.bio.join(" "),
    knowsAbout: author.covers,
    ...(author.type === "Organization" ? { parentOrganization: { "@id": `${SITE_URL}/#org` } } : { worksFor: { "@id": `${SITE_URL}/#org` } }),
  };
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Authors", item: `${SITE_URL}/authors` },
      { "@type": "ListItem", position: 3, name: author.name, item: `${SITE_URL}/authors/${author.slug}` },
    ],
  };

  return (
    <article className="mx-auto max-w-3xl">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([jsonLd, breadcrumbLd]) }} />

      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-slate-400">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li><Link href="/" className="hover:text-white">Home</Link></li>
          <li className="text-ink-700">/</li>
          <li><Link href="/authors" className="hover:text-white">Authors</Link></li>
          <li className="text-ink-700">/</li>
          <li className="text-slate-300" aria-current="page">{author.name}</li>
        </ol>
      </nav>

      <h1 className="text-3xl font-extrabold leading-tight text-white">{author.name}</h1>
      <p className="mt-1 text-sm text-slate-400">{author.role}</p>

      <div className="mt-6 space-y-4 border-t border-ink-800 pt-6 text-sm leading-relaxed text-slate-300">
        {author.bio.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-bold text-white">What this byline covers</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-300">
          {author.covers.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-slate-400">
          How we collect prices, how often they refresh, and how to report an error are all set out
          in our <Link href="/editorial-policy" className="text-brand-400 hover:underline">editorial policy</Link>.
          Spotted something wrong? Email{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-gold hover:underline">{CONTACT_EMAIL}</a>.
        </p>
      </section>

      {guides.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-bold text-white">Guides ({guides.length})</h2>
          <ul className="mt-3 space-y-3">
            {guides.map((a) => (
              <li key={a.slug}>
                <Link href={`/guides/${a.slug}`} className="group block">
                  <span className="block text-sm font-semibold text-brand-400 group-hover:underline">{a.title}</span>
                  <span className="block text-xs text-slate-500">
                    {a.date}
                    {a.updated && a.updated !== a.date ? ` · updated ${a.updated}` : ""} · {a.readMins} min read
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {posts.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-bold text-white">Posts ({posts.length})</h2>
          <ul className="mt-3 space-y-3">
            {posts.map((a) => (
              <li key={a.slug}>
                <Link href={`/blog/${a.slug}`} className="group block">
                  <span className="block text-sm font-semibold text-brand-400 group-hover:underline">{a.title}</span>
                  <span className="block text-xs text-slate-500">
                    {a.date}
                    {a.updated && a.updated !== a.date ? ` · updated ${a.updated}` : ""} · {a.readMins} min read
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
