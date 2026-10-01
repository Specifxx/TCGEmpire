// eBay keywords for a Pokémon sealed product. Client-safe and pure.
//
// The Pokémon twin of lib/affiliate.ts's riftboundEbayQuery: the game's name
// exactly once, because eBay ANDs keywords and a bare "Astral Radiance Booster
// Box" or "151 Booster Bundle" collides with other games and with singles.
// riftboundEbayQuery itself must never be used here (it prefixes "Riftbound");
// tests/pokemon-isolation.test.ts fails if a Pokémon file imports it.

/** "Pokemon <product>", with the variant notes TCGplayer adds stripped out. */
export function pokemonEbayQuery(name: string): string {
  const clean = name
    .replace(/\((?:exclusive|international version|[^)]*code card[^)]*)\)/gi, " ")
    .replace(/\(([^)]*)\)/g, " $1 ")
    .replace(/\[([^\]]*)\]/g, " $1 ")
    .replace(/[,:]/g, " ")
    .replace(/Pokémon/g, "Pokemon")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return "Pokemon sealed";
  return /\bpokemon\b/i.test(clean) ? clean : `Pokemon ${clean}`;
}

/** A set's whole sealed range: "Pokemon Phantasmal Flames sealed". */
export function pokemonSetEbayQuery(setName: string): string {
  return pokemonEbayQuery(`${setName} sealed`);
}
