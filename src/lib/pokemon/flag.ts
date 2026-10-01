// The Pokémon section's one switch. Client-safe (no server imports), because the
// nav config and the homepage promo read it from client components too.
//
// OFF unless NEXT_PUBLIC_POKEMON_SECTION is exactly "1", like
// introOfferEnabled() in lib/site.ts. Next inlines NEXT_PUBLIC_* at build time,
// so flipping it takes a redeploy, which is also what any Vercel variable change
// takes. The server additionally requires POKEMON_DATABASE_URL
// (lib/pokemon/gate.ts pokemonEnabled), so a flag set without a database shows
// nothing rather than an empty section.
//
// Turned off, every Pokémon route 404s (app/pokemon/layout.tsx), the nav entry,
// homepage promo and sitemap section disappear, and the import workflow exits
// early. docs/pokemon/README.md has the full kill-switch and removal runbook.
export function pokemonSectionOn(): boolean {
  return process.env.NEXT_PUBLIC_POKEMON_SECTION === "1";
}

/**
 * Product pages are noindex (follow) unless POKEMON_INDEX_PRODUCTS is "1", and
 * then only those passing the stage-1 gate (lib/pokemon/index-gate.ts: booster
 * boxes, ETBs, Pokémon Center ETBs and booster bundles with a known pack
 * count; lib/pokemon/seo.ts productIsIndexed). Server-only (a plain variable,
 * read where the metadata is built). Templated product pages are the shape
 * AdSense called low-value before (CURRENT-STATE, "publish fewer pages than
 * feels natural"), so the switch stays off until a measured audit shows no
 * `pokemon-product` near-duplicate cluster and a median of at least 150
 * unique words (docs/pokemon/README.md). The sitemap follows it.
 */
export function pokemonIndexProducts(): boolean {
  return process.env.POKEMON_INDEX_PRODUCTS === "1";
}
