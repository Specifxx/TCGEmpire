import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";
import { pokemonEnabled } from "@/lib/pokemon/gate";
import { getPokemonCatalog } from "@/lib/pokemon/data";
import { setOgLines, type SetOgLines } from "@/lib/pokemon/og-lines";
import { POKEMON_OG_SIZE, PokemonBrandOgImage } from "@/lib/pokemon/product-og";
import { SetOgImage } from "@/lib/pokemon/set-og";

// A set page's share card: the cheapest booster box, ETB and booster bundle in
// the set with their price per pack, US figures labelled as such. What a set
// review channel or a Discord server sees when the set page is pasted. The page
// sets no `images` of its own (ogImage "colocated"), so this is its one
// og:image; the composition is lib/pokemon/set-og.tsx.
//
// Reads the US catalogue, the same cached read the section's pages share. An
// unknown set or a read error draws the brand-only card (200), never a 500;
// only the section being off is a 404. Cached six hours, not ImageResponse's
// default year (the lowercase key replaces it); the card drawn after a read
// error gets one minute, so a brief outage does not pin it in the CDN.
export const runtime = "nodejs";
export const revalidate = 21600;
export const alt = "Pokémon set sealed prices on RiftCompare";
export const size = POKEMON_OG_SIZE;
export const contentType = "image/png";

const CACHED = "public, max-age=0, s-maxage=21600, stale-while-revalidate=86400";
const AFTER_ERROR = "public, max-age=0, s-maxage=60";

export default async function Image({ params }: { params: { set: string } }) {
  if (!pokemonEnabled()) notFound();
  let lines: SetOgLines | null = null;
  let failed = false;
  try {
    lines = setOgLines(await getPokemonCatalog("US"), params.set);
  } catch (e) {
    failed = true;
    console.error("[pokemon] set share card read failed", e);
  }
  return new ImageResponse(lines ? <SetOgImage lines={lines} /> : <PokemonBrandOgImage />, {
    ...size,
    headers: { "cache-control": failed ? AFTER_ERROR : CACHED },
  });
}
