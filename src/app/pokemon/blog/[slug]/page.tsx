import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { notFoundMetadata } from "@/lib/not-found-metadata";
import { pokemonEnabled } from "@/lib/pokemon/gate";
import { getPokemonCatalog } from "@/lib/pokemon/data";
import { pokemonMeta } from "@/lib/pokemon/seo";
import { asOfLabel } from "@/lib/pokemon/value";
import { draftVisible, getAllPokemonPosts, getPokemonPost, getPokemonPosts } from "@/lib/pokemon/blog/index";
import { fillPost, postBlockIds, postEbayLinks } from "@/lib/pokemon/blog/render";
import { PokemonPostView } from "@/components/pokemon/PokemonPostView";

// One Pokémon blog post. ISR at the catalogue's own TTL (lib/pokemon/data.ts
// POKEMON_TTL): the post's tables are computed from getPokemonCatalog("US")
// when the page renders, and that loader caches for exactly this long, so the
// segment's TTL is never undercut (egress rule 5). No cookie or header is read
// anywhere in this tree, so the tables are labelled US prices and the eBay
// panel ships every market's links for the client to pick from.
//
// Drafts render only where draftVisible() is true (development, Vercel
// preview), with a banner and noindex,nofollow; in production a draft is a
// 404. A catalogue read error throws, so ISR keeps serving the last good page
// rather than caching an error or a 404 for six hours.
export const revalidate = 21600;

// An EMPTY list: each post is rendered and cached on its first visit, none at
// build (CLAUDE.md: no prewarming of database-backed routes).
export function generateStaticParams(): { slug: string }[] {
  return [];
}

type Params = { slug: string };

function visiblePost(slug: string) {
  const post = getPokemonPost(slug);
  if (!post) return null;
  if (post.status !== "published" && !draftVisible()) return null;
  return post;
}

export function generateMetadata({ params }: { params: Params }): Metadata {
  if (!pokemonEnabled()) return notFoundMetadata();
  const post = visiblePost(params.slug);
  if (!post) return notFoundMetadata("Post");
  const draft = post.status !== "published";
  return pokemonMeta({
    title: post.title,
    description: post.excerpt,
    path: `/pokemon/blog/${post.slug}`,
    ogType: "article",
    ogImage: "section",
    publishedTime: post.date,
    modifiedTime: post.updated ?? post.date,
    ...(draft ? { robots: { index: false, follow: false } } : {}),
  });
}

export default async function PokemonBlogPostPage({ params }: { params: Params }) {
  if (!pokemonEnabled()) notFound();
  const post = visiblePost(params.slug);
  if (!post) notFound();

  // One catalogue read, and only when the post places a block.
  const catalog = postBlockIds(post).length ? await getPokemonCatalog("US") : null;
  const filled = fillPost(post, catalog ? { catalog, today: new Date().toISOString().slice(0, 10) } : null);

  const pool = draftVisible() ? getAllPokemonPosts() : getPokemonPosts();
  const related = pool
    .filter((p) => p.slug !== post.slug)
    .slice(0, 4)
    .map((p) => ({ slug: p.slug, title: p.title, excerpt: p.excerpt, date: p.date, draft: p.status !== "published" }));

  return (
    <PokemonPostView
      post={{
        slug: post.slug,
        title: post.title,
        excerpt: post.excerpt,
        author: post.author,
        date: post.date,
        updated: post.updated,
        reviewed: post.reviewed,
        status: post.status,
        tags: post.tags,
      }}
      body={filled.body}
      summary={filled.summary}
      faq={filled.faq}
      pricesAsOf={catalog ? asOfLabel(catalog.pricesAsOf) : null}
      ebayLinks={postEbayLinks(post)}
      related={related}
    />
  );
}
