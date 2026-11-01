import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { pokemonEnabled } from "@/lib/pokemon/gate";
import { POKEMON_TAG } from "@/lib/pokemon/cache-keys";
import { clearPokemonMemo } from "@/lib/pokemon/data";

// A manual purge of the Pokémon section: the "pokemon" cache tag, every page
// under /pokemon and the section's own child sitemap, and NOTHING else. It
// never calls revalidateContent() — the Riftbound site is not re-rendered —
// and Riftbound's purge never touches this tag. Since 2026-11-01 the import no
// longer calls it: the section's data is files that change only with a deploy,
// and a deploy starts with a fresh page cache.
//
// Same auth as /api/revalidate: CRON_SECRET as a Bearer token, failing closed.
// 404 while the section is off.
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
