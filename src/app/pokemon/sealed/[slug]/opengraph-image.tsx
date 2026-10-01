import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";
import { pokemonEnabled } from "@/lib/pokemon/gate";
import { getPokemonProduct } from "@/lib/pokemon/data";
import { productOgLines, type ProductOgLines } from "@/lib/pokemon/og-lines";
import { POKEMON_OG_SIZE, PokemonBrandOgImage, ProductOgImage, ogImageDataUri } from "@/lib/pokemon/product-og";

// A product page's share card: its name, the cheapest US listing, the price per
// pack and TCGplayer's market price, so a link pasted into Discord or Reddit
// answers "what does it cost" in the unfurl itself. The page sets no `images`
// of its own (lib/pokemon/seo.ts, ogImage "colocated"), so this is its one
// og:image. The composition lives in lib/pokemon/product-og.tsx; this file is
// the data hop.
//
// Never a 500: an unfurl must produce an image. A missing product or a read
// error draws the brand-only card (200). Only the section being off is a 404.
//
// Cached for the loader's six hours, not a year. ImageResponse sends
// "public, immutable, max-age=31536000" unless told otherwise, and the key must
// be lowercase to replace it; with it, a CDN would keep a price card for a year.
export const runtime = "nodejs";
export const revalidate = 21600;
export const alt = "Pokémon sealed product price on RiftCompare";
export const size = POKEMON_OG_SIZE;
export const contentType = "image/png";

// Every product slug is lowercase words joined by hyphens. Anything else is not
// a product, and is not worth a database read or a cache entry to find out.
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export default async function Image({ params }: { params: { slug: string } }) {
  if (!pokemonEnabled()) notFound();
  const slug = params.slug;
  let lines: ProductOgLines | null = null;
  let art: string | null = null;
  if (slug.length <= 120 && SLUG.test(slug)) {
    try {
      const p = await getPokemonProduct(slug);
      if (p) {
        lines = productOgLines(p);
        art = await ogImageDataUri(p.imageUrl);
      }
    } catch (e) {
      console.error("[pokemon] product share card read failed", e);
    }
  }
  return new ImageResponse(lines ? <ProductOgImage lines={lines} art={art} /> : <PokemonBrandOgImage />, {
    ...size,
    headers: { "cache-control": "public, max-age=0, s-maxage=21600, stale-while-revalidate=86400" },
  });
}
