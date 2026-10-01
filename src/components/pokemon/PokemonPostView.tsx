import Link from "next/link";
import type { Country } from "@/lib/country";
import { SITE_URL } from "@/lib/site";
import { faqPage, ldJson } from "@/lib/jsonld";
import { extractToc } from "@/lib/toc";
import { authorByName, authorJsonLd } from "@/lib/content/authors";
import { formatDay } from "@/lib/pokemon/format";
import { plainText, type EbayLink } from "@/lib/pokemon/blog/render";
import type { PokemonPost, PokemonPostFaq } from "@/lib/pokemon/blog/types";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Markdown } from "@/components/Markdown";
import { AnswerBox } from "@/components/AnswerBox";
import { ArticleToc } from "@/components/ArticleToc";
import { ArticleFaq } from "@/components/ArticleFaq";
import { ArticleShare } from "@/components/ArticleShare";
import { AffiliateDisclosure } from "@/components/AffiliateDisclosure";
import { PokemonMarketEbayPanel } from "./PokemonMarketEbayPanel";
import { PokemonPostList, type PokemonPostListItem } from "./PokemonPostList";

// One Pokémon blog post, built from the site's shared article parts (Markdown,
// AnswerBox, the TOC, the FAQ, the share row) but none of the Riftbound
// article template: no card galleries, no Riftbound CTAs, no Riftbound
// database. Server-rendered for an ISR page, so nothing here reads the cookie;
// the eBay panel picks the visitor's market on the client.
//
// The FAQ JSON-LD and the visible FAQ are one array (the filled FAQ), and the
// TOC is extracted from the filled body, so neither can describe something the
// page does not show.

const SECTION_IMAGE = `${SITE_URL}/pokemon/opengraph-image`;

export interface PokemonPostViewProps {
  post: Pick<PokemonPost, "slug" | "title" | "excerpt" | "author" | "date" | "updated" | "reviewed" | "status" | "tags">;
  body: string;
  summary: string[];
  faq: PokemonPostFaq[];
  /** "as of 1 Oct 2026" for the US prices in the post's blocks; null when it has none. */
  pricesAsOf: string | null;
  ebayLinks: Record<Country, EbayLink[]>;
  related: PokemonPostListItem[];
}

/** schema.org author without its description: that bio is the Riftbound site's, not this section's. */
function authorNode(name: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(authorJsonLd(name)).filter(([k]) => k !== "description"));
}

export function PokemonPostView({ post, body, summary, faq, pricesAsOf, ebayLinks, related }: PokemonPostViewProps) {
  const url = `${SITE_URL}/pokemon/blog/${post.slug}`;
  const draft = post.status !== "published";
  const author = authorByName(post.author);
  const toc = extractToc(body);
  const prose = body
    .split("\n")
    .filter((l) => !l.trim().startsWith("|"))
    .join(" ");

  const postLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt,
    datePublished: post.date,
    dateModified: post.updated ?? post.date,
    author: authorNode(post.author),
    publisher: { "@type": "Organization", "@id": `${SITE_URL}/#org`, name: "RiftCompare" },
    mainEntityOfPage: url,
    isPartOf: { "@id": `${SITE_URL}/#website` },
    image: [SECTION_IMAGE],
    articleSection: "Pokémon sealed",
    wordCount: plainText(prose).split(/\s+/).filter(Boolean).length,
  };
  const faqLd = faqPage(faq.map((f) => ({ q: f.q, a: plainText(f.a) })));

  return (
    <article className="mx-auto max-w-3xl min-[1700px]:relative">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(postLd, faqLd) }} />
      <Breadcrumbs
        trail={[
          { name: "Pokémon", href: "/pokemon" },
          { name: "Blog", href: "/pokemon/blog" },
          { name: post.title, href: `/pokemon/blog/${post.slug}` },
        ]}
      />

      {draft && (
        <div role="note" className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <strong className="font-bold text-amber-100">Draft.</strong> Not yet reviewed or published. Only development and preview
          builds show it, and it is marked noindex; on the live site this address is not found.
        </div>
      )}

      {post.tags.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {post.tags.map((t) => (
            <span key={t} className="chip bg-ink-800 text-slate-400">
              {t}
            </span>
          ))}
        </div>
      )}

      <h1 className="text-2xl font-extrabold leading-tight text-white sm:text-3xl">{post.title}</h1>
      <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-slate-500">
        {author ? (
          <Link href={`/authors/${author.slug}`} className="tap-link text-slate-400 underline hover:text-brand-400">
            {post.author}
          </Link>
        ) : (
          <span>{post.author}</span>
        )}
        <span aria-hidden>·</span>
        <time dateTime={post.date}>{formatDay(post.date)}</time>
        {post.updated && post.updated !== post.date && (
          <>
            <span aria-hidden>·</span>
            <time dateTime={post.updated} className="text-slate-400">
              Updated {formatDay(post.updated)}
            </time>
          </>
        )}
        {post.reviewed && (
          <>
            <span aria-hidden>·</span>
            <span>Reviewed by Bill {formatDay(post.reviewed)}</span>
          </>
        )}
        {pricesAsOf && (
          <>
            <span aria-hidden>·</span>
            <span className="text-slate-400">US prices {pricesAsOf}</span>
          </>
        )}
      </p>

      <div className="mt-3">
        <ArticleShare url={url} title={post.title} />
      </div>

      {summary.length > 0 && <AnswerBox heading="The short version" points={summary} className="mt-5" />}

      <ArticleToc entries={toc} />

      <div className="mt-6 border-t border-ink-800 pt-2">
        <Markdown content={body} />
      </div>

      <ArticleFaq faq={faq} />

      <PokemonMarketEbayPanel
        linksByMarket={ebayLinks}
        heading="Search eBay for these products"
        sub="Searches of your own eBay site. They show every listing there, not a price we have checked."
        pageType="pokemon_blog"
        className="mt-10"
      />

      {related.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-lg font-extrabold text-white">More from the Pokémon blog</h2>
          <PokemonPostList posts={related} compact headingLevel={3} />
        </section>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-ink-800 pt-4">
        <ArticleShare url={url} title={post.title} />
        <Link href="/pokemon/blog" className="tap-link text-sm text-slate-400 hover:text-white">
          ← All Pokémon posts
        </Link>
      </div>

      <AffiliateDisclosure partner="ebay" className="mt-6 text-center" />
    </article>
  );
}
