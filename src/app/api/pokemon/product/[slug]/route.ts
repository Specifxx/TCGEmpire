import { NextResponse } from "next/server";
import { pokemonEnabled } from "@/lib/pokemon/gate";
import { getPokemonProduct } from "@/lib/pokemon/data";
import { allBoards } from "@/lib/pokemon/board";

// The Pokémon quick view's data: one product's boards for every market, with
// the affiliate links built here on the server (EPN's campaign id is a server
// variable). One response per product, not per market, so the CDN keeps one
// copy; the client picks its market.
//
// Reads only getPokemonProduct (self-cached, POKEMON_TAG, purged by the daily
// import). The CDN keeps a response six hours (an hour until 2026-10-14;
// DECISIONS.md, "Cached pages refresh every 6 to 24 hours"), so a fresh import
// shows in the quick view within six hours without a database read per open.
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  if (!pokemonEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const slug = decodeURIComponent(params.slug).slice(0, 120);
  const detail = await getPokemonProduct(slug).catch(() => null);
  if (!detail) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const boards = allBoards(detail.name, detail.offers, { page: `/pokemon/sealed/${detail.slug}`, surface: "quickview" });
  return NextResponse.json(
    { slug: detail.slug, name: detail.name, boards },
    { headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" } },
  );
}
