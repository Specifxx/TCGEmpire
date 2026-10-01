import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { pokemonEnabled } from "@/lib/pokemon/gate";
import { POKEMON_TAG } from "@/lib/pokemon/cache-keys";
import { clearPokemonMemo } from "@/lib/pokemon/data";

// The Pokémon import's purge (.github/workflows/pokemon-import.yml): the
// "pokemon" cache tag, every page under /pokemon and the section's own child
// sitemap (its lastmod is the import that just finished), and NOTHING else. It
// never calls revalidateContent() — a Pokémon import must not re-render the
// Riftbound site — and Riftbound's purge never touches this tag.
//
// Same auth as /api/revalidate: CRON_SECRET as a Bearer token, failing closed.
// 404 while the section is off, so the workflow can tell "off" from "broken".
export const dynamic = "force-dynamic";

async function handle(req: Request) {
  if (!pokemonEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  revalidateTag(POKEMON_TAG);
  revalidatePath("/pokemon", "layout");
  revalidatePath("/sitemaps/pokemon.xml");
  clearPokemonMemo();
  return NextResponse.json({ ok: true, tag: POKEMON_TAG, at: new Date().toISOString() });
}

export const POST = handle;
