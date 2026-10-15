import { NextResponse } from "next/server";
import { pokemonEnabled } from "@/lib/pokemon/gate";
import { getPokemonCatalog } from "@/lib/pokemon/data";

// /pokemon/tcgplayer/<TCGplayer productId> → that product's page here. The way
// in from DexCompare (lib/pokemon/dexcompare.ts): DexCompare knows a product's
// TCGplayer id (from its TCGplayer image), not this section's slug, and links
// its product pages here for the market-price history and the six markets.
//
// Reads only getPokemonCatalog("US") (self-cached, every active product): no
// database read of its own. A redirect, cached a day at the CDN per URL. An
// id this section does not carry goes to a search for `q` (DexCompare sends
// the product's name) or, without one, to the section home; cached too (the
// catalogue changes daily, so a new product's id waits a day at most). A
// catalogue read error is not cached at all.
export const dynamic = "force-dynamic";

const CACHED = { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400" };

export async function GET(req: Request, { params }: { params: { id: string } }) {
  if (!pokemonEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const id = /^\d{1,9}$/.test(params.id) ? Number(params.id) : null;
  if (id == null) return NextResponse.json({ error: "Not found" }, { status: 404, headers: CACHED });
  // The visit's own query (DexCompare's utm_* tags) rides along; `q` is for the fallback only.
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  url.searchParams.delete("q");
  const search = url.search;
  let slug: string | null = null;
  try {
    slug = (await getPokemonCatalog("US")).tiles.find((t) => t.id === id)?.slug ?? null;
  } catch (e) {
    console.error("[pokemon] tcgplayer redirect: catalogue read failed", e);
    return NextResponse.redirect(new URL(`/pokemon${search}`, req.url), { status: 307, headers: { "Cache-Control": "no-store" } });
  }
  if (slug) return NextResponse.redirect(new URL(`/pokemon/sealed/${slug}${search}`, req.url), { status: 307, headers: CACHED });
  const fallback = new URL(q ? "/pokemon/sealed" : "/pokemon", req.url);
  url.searchParams.forEach((v, k) => fallback.searchParams.set(k, v));
  if (q) fallback.searchParams.set("q", q);
  return NextResponse.redirect(fallback, { status: 307, headers: CACHED });
}
