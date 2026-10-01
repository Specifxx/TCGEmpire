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
 * Product pages are noindex (follow) unless POKEMON_INDEX_PRODUCTS is "1".
 * Server-only (a plain variable, read where the metadata is built). ~1,000
 * templated product pages are the shape AdSense called low-value before
 * (CURRENT-STATE, "publish fewer pages than feels natural"), so the POC
 * indexes the hub, the grid and the set pages, whose text is written from each
 * set's own data, and leaves this switch to the owner. The sitemap follows it.
 */
export function pokemonIndexProducts(): boolean {
  return process.env.POKEMON_INDEX_PRODUCTS === "1";
}
