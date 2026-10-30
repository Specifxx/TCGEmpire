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
//
// PAUSED (2026-10-30): the Pokémon Neon project has refused every connection
// since 2026-10-23 (each pokemon-import run fails with P1001), so every /pokemon
// page answered HTTP 500 while the nav and homepage promo still linked to it.
// Paused, the section is off whatever the variable says, and next.config.js
// sends /pokemon visitors to DexCompare. To bring it back once the database
// answers: set this to false AND delete the "/pokemon" redirect in
// next.config.js (DECISIONS.md, "The Pokémon section is paused", 2026-10-30).
export const POKEMON_PAUSED = true;

export function pokemonSectionOn(): boolean {
  return !POKEMON_PAUSED && process.env.NEXT_PUBLIC_POKEMON_SECTION === "1";
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
