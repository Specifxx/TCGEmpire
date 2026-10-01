// Metadata and structured-data builders for every Pokémon page. Server-side
// (reads POKEMON_INDEX_PRODUCTS through ./flag), never imported by a client
// component.
//
// WHY its own builders rather than lib/seo.ts's pageAlternates/pageOpenGraph
// alone:
//   - Titles are ABSOLUTE. The root template appends " — RiftCompare", which
//     pushed the hub's title to 66 characters; every Pokémon title is ≤60 and
//     carries no brand (TITLE_MAX, tests/pokemon-seo.test.ts).
//   - Alternates drop the Riftbound feed links pageAlternates() re-attaches:
//     /feed.xml is Riftbound news, not this section's.
//   - Share images: a child page's `openGraph` REPLACES its parent folder's
//     file-based opengraph-image (next 14.2, resolve-metadata.js), so a page
//     that sets openGraph without images unfurled with no image at all
//     (/pokemon/sets and /pokemon/sealed did, measured 2026-10-01).
//       "section":   point at /pokemon/opengraph-image explicitly.
//       "colocated": NO `images` key at all (not even undefined), so the
//                    route's own opengraph-image.tsx is the one og:image.
//     Use "colocated" only where the route folder has its own
//     opengraph-image.tsx (the hub, set and product pages).

import type { Metadata } from "next";
import { SITE_URL } from "../site";
import { pageOpenGraph } from "../seo";
import { pokemonIndexProducts } from "./flag";
import { productPassesIndexGate } from "./index-gate";

export { INDEX_STAGE1_KINDS, productPassesIndexGate } from "./index-gate";

export const TITLE_MAX = 60;
export const DESCRIPTION_MAX = 155;

const SECTION_OG_ALT = "Pokémon sealed prices on RiftCompare";

const absolute = (path: string): string => (/^https?:\/\//.test(path) ? path : `${SITE_URL}${path === "/" ? "" : path}`);

/** `alternates` for a Pokémon page: its canonical and x-default, no Riftbound feed types. */
export function pokemonAlternates(path: string): Metadata["alternates"] {
  return { canonical: path, languages: { "x-default": absolute(path) } };
}

export interface PokemonMetaOpts {
  /** ≤ TITLE_MAX, no brand. Rendered as `{ absolute }`. */
  title: string;
  /** ≤ DESCRIPTION_MAX. */
  description: string;
  /** Site-relative canonical path, e.g. "/pokemon/booster-boxes". */
  path: string;
  robots?: Metadata["robots"];
  ogType?: "website" | "article";
  /** "section" = the /pokemon share card; "colocated" = this route's own opengraph-image.tsx. */
  ogImage: "section" | "colocated";
  /** Article dates for ogType "article" (ISO). */
  publishedTime?: string;
  modifiedTime?: string;
}

export function pokemonMeta(o: PokemonMetaOpts): Metadata {
  const og = pageOpenGraph({
    title: o.title,
    description: o.description,
    url: o.path,
    type: o.ogType ?? "website",
    ...(o.publishedTime ? { publishedTime: o.publishedTime } : {}),
    ...(o.modifiedTime ? { modifiedTime: o.modifiedTime } : {}),
  }) as Record<string, unknown>;
  const sectionImage = { url: `${SITE_URL}/pokemon/opengraph-image`, width: 1200, height: 630, alt: SECTION_OG_ALT };
  const openGraph = (o.ogImage === "section" ? { ...og, images: [sectionImage] } : og) as Metadata["openGraph"];
  const twitter: Metadata["twitter"] =
    o.ogImage === "section"
      ? { card: "summary_large_image", title: o.title, description: o.description, images: [sectionImage.url] }
      : { card: "summary_large_image", title: o.title, description: o.description };
  return {
    title: { absolute: o.title },
    description: o.description,
    alternates: pokemonAlternates(o.path),
    openGraph,
    twitter,
    ...(o.robots !== undefined ? { robots: o.robots } : {}),
  };
}

/** ItemList JSON-LD of plain links (no Product nodes: those need offers). */
export function pokemonItemList(name: string, items: readonly { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    numberOfItems: items.length,
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      url: absolute(it.path),
    })),
  };
}

/** Whether a product page is indexable right now: the owner's switch AND the stage-1 gate. */
export function productIsIndexed(p: { kind: string; packCount: number | null }): boolean {
  return pokemonIndexProducts() && productPassesIndexGate(p);
}
