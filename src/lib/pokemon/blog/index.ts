// The Pokémon blog's registry: its own posts, apart from the Riftbound blog,
// so the section stays removable in one commit (docs/pokemon/README.md).
//
// IMPORTER-SAFE: imports only ./types and ./posts/*. lib/pokemon/sitemap.ts
// loads this file with a dynamic import inside its enabled branch, and that
// module is on every Riftbound importer's load path (lib/sitemap-sections.ts),
// so nothing here may pull in Next, a database client, ./blocks or ./render.
//
// Drafts: a post lands as "draft" and is reviewed by Bill before it is
// published (the site's article process). getPokemonPosts() is the ONLY place
// that filters to published posts; everything public (the sitemap, the
// subnav's Blog tab, the hub's guides band) goes through it. Drafts render only
// where draftVisible() is true, so Bill can read them on a Vercel preview.

import type { PokemonPost } from "./types";
import { boosterBoxVsEtbVsBoosterBundle } from "./posts/booster-box-vs-etb-vs-booster-bundle";
import { pokemonCenterEtbVsEliteTrainerBox } from "./posts/pokemon-center-etb-vs-elite-trainer-box";
import { howWePricePokemonSealed } from "./posts/how-we-price-pokemon-sealed";

export type { PokemonPost } from "./types";

/** Every post, drafts included, in no particular order. */
export const POKEMON_POSTS: readonly PokemonPost[] = [
  boosterBoxVsEtbVsBoosterBundle,
  pokemonCenterEtbVsEliteTrainerBox,
  howWePricePokemonSealed,
];

const newestFirst = (a: PokemonPost, b: PokemonPost) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug);

/**
 * Whether drafts may render: in development, and on Vercel preview builds
 * (VERCEL_ENV is "preview" there while NODE_ENV is "production"). Never in
 * production, where a draft's URL is a 404.
 */
export function draftVisible(env: { NODE_ENV?: string; VERCEL_ENV?: string } = process.env): boolean {
  return env.NODE_ENV === "development" || env.VERCEL_ENV === "preview";
}

/** Published posts, newest first. The only filter to "published" anywhere. */
export function getPokemonPosts(): PokemonPost[] {
  return POKEMON_POSTS.filter((p) => p.status === "published").sort(newestFirst);
}

/** Every post including drafts, newest first: for listings where draftVisible() is true. */
export function getAllPokemonPosts(): PokemonPost[] {
  return [...POKEMON_POSTS].sort(newestFirst);
}

/** One post by slug, drafts included. The caller decides whether a draft may render. */
export function getPokemonPost(slug: string): PokemonPost | undefined {
  return POKEMON_POSTS.find((p) => p.slug === slug);
}

/**
 * Sitemap entries for the published posts. Pure: the caller passes SITE_URL
 * (this file imports nothing outside the blog folder). lastmod is the day the
 * post last changed, `updated ?? date`.
 */
export function pokemonPostSitemapEntries(siteUrl: string): {
  url: string;
  lastModified: Date;
  changeFrequency: "monthly";
  priority: number;
}[] {
  return getPokemonPosts().map((p) => ({
    url: `${siteUrl}/pokemon/blog/${p.slug}`,
    lastModified: new Date(`${p.updated ?? p.date}T00:00:00Z`),
    changeFrequency: "monthly" as const,
    priority: 0.5,
  }));
}
