// The Pokémon section's sitemap entries, served as /sitemaps/pokemon.xml by
// lib/sitemap-sections.ts while the section's switch is on.
import { SITE_URL } from "../site";
import type { SitemapEntry } from "../sitemap-sections";
import { pokemonDiscordAppId, pokemonIndexProducts } from "./flag";
import { pokemonEnabled } from "./gate";
import { INDEX_STAGE1_KINDS, productPassesIndexGate } from "./index-gate";

// The head-term landing pages: the three kind hubs and price per pack.
const LANDING = ["/pokemon/booster-boxes", "/pokemon/elite-trainer-boxes", "/pokemon/booster-bundles", "/pokemon/price-per-pack"];

// The Pokémon section's indexable pages (docs/pokemon/README.md): the hub, the
// kind hubs, price per pack, the grid, the set index and each set; product
// pages only once the owner turns on POKEMON_INDEX_PRODUCTS, and then only
// those passing the stage-1 gate (lib/pokemon/index-gate.ts), so the sitemap
// never lists a page that answers noindex. A direct narrow read of the Pokémon
// database, NOT lib/pokemon/data.ts's cached catalogue: that loader's six-hour
// TTL would become this 24-hour route's (egress rule 5). lastmod is the last
// import that finished, the day the prices on these pages last changed.
//
// The gate is imported from ./index-gate, never ./seo: this module is on the
// Riftbound importers' load path (lib/sitemap-sections.ts), and ./seo pulls in
// the page-metadata helpers that path has no business loading.
export async function pokemonSitemapEntries(): Promise<SitemapEntry[]> {
  if (!pokemonEnabled()) return [];
  // Loaded only when the section is on: lib/sitemap-sections.ts is imported by
  // every Riftbound importer, whose workflows never generate this client.
  const { pokemonDb } = await import("./db");
  // The blog registry, dynamically too: this module must load nothing beyond
  // ./index-gate statically (tests/pokemon-isolation.test.ts). Only published
  // posts are listed, and the index only once one exists (it 404s before).
  const { getPokemonPosts, pokemonPostSitemapEntries } = await import("./blog/index");
  const db = pokemonDb();
  const [lastRun, sets, products] = await Promise.all([
    db.pokemonImportRun.findFirst({ where: { ok: true }, orderBy: { finishedAt: "desc" }, select: { finishedAt: true } }),
    db.pokemonSet.findMany({ where: { products: { some: { active: true } } }, select: { slug: true } }),
    pokemonIndexProducts()
      ? db.pokemonProduct.findMany({
          where: { active: true, kind: { in: [...INDEX_STAGE1_KINDS] } },
          select: { slug: true, imageUrl: true, kind: true, packCount: true },
          take: 5000,
        })
      : Promise.resolve([] as { slug: string; imageUrl: string | null; kind: string; packCount: number | null }[]),
  ]);
  const lastModified = lastRun?.finishedAt ?? undefined;
  return [
    { url: `${SITE_URL}/pokemon`, changeFrequency: "daily" as const, priority: 0.7, lastModified },
    ...LANDING.map((path) => ({ url: `${SITE_URL}${path}`, changeFrequency: "daily" as const, priority: 0.6, lastModified })),
    { url: `${SITE_URL}/pokemon/sealed`, changeFrequency: "daily" as const, priority: 0.6, lastModified },
    { url: `${SITE_URL}/pokemon/sets`, changeFrequency: "weekly" as const, priority: 0.5, lastModified },
    // Static, and built only when the app exists (the page 404s without its ID),
    // so no lastmod: an import does not change it.
    ...(pokemonDiscordAppId() ? [{ url: `${SITE_URL}/pokemon/discord`, changeFrequency: "monthly" as const, priority: 0.4 }] : []),
    ...(getPokemonPosts().length ? [{ url: `${SITE_URL}/pokemon/blog`, changeFrequency: "weekly" as const, priority: 0.5 }] : []),
    ...pokemonPostSitemapEntries(SITE_URL),
    ...sets.map((s) => ({ url: `${SITE_URL}/pokemon/sets/${s.slug}`, changeFrequency: "daily" as const, priority: 0.5, lastModified })),
    ...products.filter(productPassesIndexGate).map((p) => ({
      url: `${SITE_URL}/pokemon/sealed/${p.slug}`,
      changeFrequency: "daily" as const,
      priority: 0.4,
      lastModified,
      ...(p.imageUrl ? { images: [p.imageUrl] } : {}),
    })),
  ];
}
