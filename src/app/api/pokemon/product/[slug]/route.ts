import { NextResponse } from "next/server";
import { pokemonEnabled } from "@/lib/pokemon/gate";
import { getPokemonProduct } from "@/lib/pokemon/data";
import { allBoards } from "@/lib/pokemon/board";
import { COUNTRY_LIST } from "@/lib/country";
import { getDexMarkets } from "@/lib/pokemon/dexcompare-data";
import { dexLinkFor } from "@/lib/pokemon/dexcompare";

// The Pokémon quick view's data: one product's boards for every market, with
// the affiliate links built here on the server (EPN's campaign id is a server
// variable). One response per product, not per market, so the CDN keeps one
// copy; the client picks its market.
//
// Reads only getPokemonProduct (self-cached, POKEMON_TAG, purged by the daily
// import) and getDexMarkets (DexCompare's store figures per market, self-cached,
// no database; a market it cannot read is null). The CDN keeps a response six hours (an hour until 2026-10-14;
// DECISIONS.md, "Cached pages refresh every 6 to 24 hours"), so a fresh import
// shows in the quick view within six hours without a database read per open.
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  if (!pokemonEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const slug = decodeURIComponent(params.slug).slice(0, 120);
  const detail = await getPokemonProduct(slug).catch(() => null);
  if (!detail) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const boards = allBoards(detail.name, detail.offers, { page: `/pokemon/sealed/${detail.slug}`, surface: "quickview" });
  const tables = await getDexMarkets(COUNTRY_LIST.map((c) => c.code));
  const dex = Object.fromEntries(COUNTRY_LIST.map((c) => [c.code, dexLinkFor(tables[c.code] ?? null, detail)]));
  return NextResponse.json(
    { slug: detail.slug, name: detail.name, boards, dex },
    { headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" } },
  );
}
