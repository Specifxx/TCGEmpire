// The Pokémon section's sitemap entries, served as /sitemaps/pokemon.xml by
// lib/sitemap-sections.ts while the section's switch is on.
import { SITE_URL } from "../site";
import type { SitemapEntry } from "../sitemap-sections";
import { pokemonIndexProducts } from "./flag";
import { pokemonEnabled } from "./gate";

// The Pokémon section's indexable pages (docs/pokemon/README.md): the hub, the
// grid, the set index and each set; product pages only once the owner turns on
// POKEMON_INDEX_PRODUCTS. A direct narrow read of the Pokémon database, NOT
// lib/pokemon/data.ts's cached catalogue: that loader's six-hour TTL would
// become this 24-hour route's (egress rule 5). lastmod is the last import that
// finished, the day the prices on these pages last changed.
export async function pokemonSitemapEntries(): Promise<SitemapEntry[]> {
  if (!pokemonEnabled()) return [];
  // Loaded only when the section is on: lib/sitemap-sections.ts is imported by
  // every Riftbound importer, whose workflows never generate this client.
  const { pokemonDb } = await import("./db");
  const db = pokemonDb();
  const [lastRun, sets, products] = await Promise.all([
    db.pokemonImportRun.findFirst({ where: { ok: true }, orderBy: { finishedAt: "desc" }, select: { finishedAt: true } }),
    db.pokemonSet.findMany({ where: { products: { some: { active: true } } }, select: { slug: true } }),
    pokemonIndexProducts()
      ? db.pokemonProduct.findMany({ where: { active: true }, select: { slug: true, imageUrl: true }, take: 5000 })
      : Promise.resolve([] as { slug: string; imageUrl: string | null }[]),
  ]);
  const lastModified = lastRun?.finishedAt ?? undefined;
  return [
    { url: `${SITE_URL}/pokemon`, changeFrequency: "daily" as const, priority: 0.7, lastModified },
    { url: `${SITE_URL}/pokemon/sealed`, changeFrequency: "daily" as const, priority: 0.6, lastModified },
    { url: `${SITE_URL}/pokemon/sets`, changeFrequency: "weekly" as const, priority: 0.5, lastModified },
    ...sets.map((s) => ({ url: `${SITE_URL}/pokemon/sets/${s.slug}`, changeFrequency: "daily" as const, priority: 0.5, lastModified })),
    ...products.map((p) => ({
      url: `${SITE_URL}/pokemon/sealed/${p.slug}`,
      changeFrequency: "daily" as const,
      priority: 0.4,
      lastModified,
      ...(p.imageUrl ? { images: [p.imageUrl] } : {}),
    })),
  ];
}
