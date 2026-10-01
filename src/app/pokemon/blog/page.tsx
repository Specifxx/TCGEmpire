import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ldJson, webPage } from "@/lib/jsonld";
import { notFoundMetadata } from "@/lib/not-found-metadata";
import { pokemonEnabled } from "@/lib/pokemon/gate";
import { pokemonItemList, pokemonMeta } from "@/lib/pokemon/seo";
import { draftVisible, getAllPokemonPosts, getPokemonPosts } from "@/lib/pokemon/blog/index";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { PokemonPostList } from "@/components/pokemon/PokemonPostList";

// The Pokémon blog's index. It reads the post registry only, never the
// catalogue, so it caches for a day; a new post ships with a deploy anyway.
//
// In production it exists only once a post is published: with none, it is a
// 404 rather than an empty page (and the integrator adds it to the sitemap and
// the subnav only then). In development and on Vercel preview it lists the
// drafts too, labelled, noindexed while nothing is published, so Bill can
// review them where they will live.
export const revalidate = 86400;

const TITLE = "Pokémon Sealed Blog: Prices, Packs and Products";
const DESCRIPTION =
  "Data-led posts on Pokémon sealed products: price per pack, pack counts and how our prices are made, with every figure computed from our own catalogue.";
const PATH = "/pokemon/blog";

function listed() {
  const published = getPokemonPosts();
  const posts = draftVisible() ? getAllPokemonPosts() : published;
  return { published, posts };
}

export function generateMetadata(): Metadata {
  if (!pokemonEnabled()) return notFoundMetadata();
  const { published, posts } = listed();
  if (!posts.length) return notFoundMetadata();
  return pokemonMeta({
    title: TITLE,
    description: DESCRIPTION,
    path: PATH,
    ogImage: "section",
    ...(published.length ? {} : { robots: { index: false, follow: true } }),
  });
}

export default function PokemonBlogIndex() {
  const { published, posts } = listed();
  if (!posts.length) notFound();
  const drafts = posts.length - published.length;

  return (
    <div className="mx-auto max-w-3xl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: ldJson(
            webPage({ name: TITLE, href: PATH, description: DESCRIPTION, type: "CollectionPage" }),
            published.length
              ? pokemonItemList(
                  "Pokémon sealed blog posts",
                  published.map((p) => ({ name: p.title, path: `/pokemon/blog/${p.slug}` })),
                )
              : null,
          ),
        }}
      />
      <Breadcrumbs
        trail={[
          { name: "Pokémon", href: "/pokemon" },
          { name: "Blog", href: PATH },
        ]}
      />

      <h1 className="text-2xl font-extrabold text-white sm:text-3xl">Pokémon Sealed Blog</h1>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-slate-300 sm:text-base">
        <p>
          This is where the Pokémon section explains its own numbers. Each post takes one question a sealed buyer asks, such as
          which product costs least per booster pack, or what a Pokémon Center Elite Trainer Box adds over the regular one, and
          answers it with tables computed from the same catalogue that runs our{" "}
          <Link href="/pokemon/sealed" className="text-brand-400 underline hover:text-brand-300">
            Pokémon sealed prices
          </Link>
          .
        </p>
        <p>
          None of the figures in a post are typed by hand. Every table, count and price is worked out from the catalogue each
          time the page is rebuilt, so a post never drifts away from the price pages it links to. The tables use US prices,
          because every product we price is a TCGplayer catalogue entry and TCGplayer&apos;s listings are US listings; the price
          pages themselves show your own market.
        </p>
        <p>
          Each post is drafted with AI assistance, then edited and fact-checked by Bill, who builds and runs the site, before it
          is published. Posts say what the data shows and nothing more: listings, not what items sold for, and no predictions
          about where a price goes next. If something looks wrong, the{" "}
          <Link href="/contact" className="text-brand-400 underline hover:text-brand-300">
            contact page
          </Link>{" "}
          reaches him directly.
        </p>
        <p>
          For the prices themselves, start from the{" "}
          <Link href="/pokemon" className="text-brand-400 underline hover:text-brand-300">
            Pokémon sealed hub
          </Link>
          , browse{" "}
          <Link href="/pokemon/sets" className="text-brand-400 underline hover:text-brand-300">
            every set we price
          </Link>
          , or compare the{" "}
          <Link href="/pokemon/price-per-pack" className="text-brand-400 underline hover:text-brand-300">
            price per pack
          </Link>{" "}
          of every product with a known pack count.
        </p>
      </div>

      {drafts > 0 && (
        <p role="note" className="mt-6 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Drafts are listed because this is a development or preview build. On the live site only published posts appear.
        </p>
      )}

      <section className="mt-6" aria-label="Posts">
        <PokemonPostList
          posts={posts.map((p) => ({ slug: p.slug, title: p.title, excerpt: p.excerpt, date: p.date, draft: p.status !== "published" }))}
        />
      </section>
    </div>
  );
}
