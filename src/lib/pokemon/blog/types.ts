// The Pokémon blog's post shape. Types only.
//
// IMPORTER-SAFE (with ./index and ./posts/*): lib/pokemon/sitemap.ts reaches
// the registry through a dynamic import, and the sitemap module is on the
// Riftbound importers' load path (lib/sitemap-sections.ts). So this folder's
// registry files import each other and nothing else: no ./blocks, no ./render,
// no database client, no Next (tests/pokemon-blog.test.ts).

export type PokemonPostAuthor = "RiftCompare" | "Bill";

export interface PokemonPostFaq {
  q: string;
  /** May carry {{fact}} tokens; an answer whose fact is missing is left out. */
  a: string;
}

/** One eBay search the post offers, built for all six markets on the server. */
export interface PokemonPostEbaySearch {
  /** "Pokémon booster boxes": the link reads "{label} on eBay UK". */
  label: string;
  /** Product words; lib/pokemon/ebay-query.ts adds "Pokemon" exactly once. */
  query: string;
}

export interface PokemonPost {
  slug: string;
  /** ≤60 characters, rendered absolute (no " — RiftCompare"). */
  title: string;
  /** 50–155 characters. It is the meta description. */
  excerpt: string;
  /** Resolved with lib/content/authors.ts authorByName. No new authors. */
  author: PokemonPostAuthor;
  /** ISO day the post is published. Drafts carry a placeholder until then. */
  date: string;
  updated?: string;
  /** ISO day Bill reviewed it. A published post needs one on or after `date`. */
  reviewed?: string;
  /**
   * Drafts render only in development and on Vercel preview (index.ts
   * draftVisible) and 404 in production. Publishing is one edit, on Bill's
   * word: status, reviewed and date.
   */
  status: "draft" | "published";
  /** "data": built around computed tables. "method": how the figures are made. */
  kind: "data" | "method";
  tags: string[];
  /** AnswerBox bullets; may carry {{fact}} tokens. */
  summary?: string[];
  /**
   * Markdown. A line that is exactly [[pk:<blockId>]] becomes that computed
   * block (blocks.ts); {{fact}} tokens anywhere else are filled from the
   * blocks' facts, and a line whose fact is missing is left out. Hand-written
   * text carries no digits and names no set: every number and set name comes
   * from the catalogue through a block or a token.
   */
  body: string;
  faq?: PokemonPostFaq[];
  /** Sets the post is about, when it is about particular ones. */
  setSlugs?: string[];
  /** eBay searches for the panel under the post; omitted, one sealed search. */
  ebay?: PokemonPostEbaySearch[];
}
