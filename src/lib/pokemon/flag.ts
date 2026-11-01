// The Pokémon section's one switch. Client-safe (no server imports), because the
// nav config and the homepage promo read it from client components too.
//
// ON when the build carries the section's data files (data/pokemon/, written
// by pokemon-import.yml; lib/pokemon/store.ts). next.config.js answers that at
// build time and inlines it as POKEMON_DATA_BUILT, so the client and the server
// agree. NEXT_PUBLIC_POKEMON_SECTION="0" (Vercel) turns it off whatever the
// files say; it takes a redeploy, like any Vercel variable change.
//
// Turned off, every Pokémon route 404s (app/pokemon/layout.tsx), the nav entry,
// homepage promo and sitemap section disappear. docs/pokemon/README.md has the
// full kill-switch and removal runbook.
//
// History: paused 2026-10-30 (its Neon project died and every page was a 500)
// and 301'd to DexCompare; back 2026-11-01 on the owner's word, served from
// committed files instead of a database (DECISIONS.md, "The Pokémon section
// returns, served from files in the repository").
export function pokemonSectionOn(): boolean {
  return process.env.NEXT_PUBLIC_POKEMON_SECTION !== "0" && process.env.POKEMON_DATA_BUILT === "1";
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
