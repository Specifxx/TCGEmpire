// Which Pokémon product pages may be indexed when POKEMON_INDEX_PRODUCTS is "1"
// (lib/pokemon/flag.ts). Stage 1: the four kinds that each have a kind hub
// linking every product of that kind, and only products whose pack count is
// known. Both facts are durable: the gate never reads stock, offers, presale or
// history, so a page never flips between index and noindex with the market.
//
// NO IMPORTS. lib/pokemon/sitemap.ts reads this file, and the sitemap module is
// on the Riftbound importers' load path (lib/sitemap-sections.ts), so it must
// stay free of the Prisma client, Next and every other module
// (tests/pokemon-isolation.test.ts).

export const INDEX_STAGE1_KINDS = ["booster-box", "etb", "pc-etb", "booster-bundle"] as const;

export function productPassesIndexGate(p: { kind: string; packCount: number | null }): boolean {
  return (INDEX_STAGE1_KINDS as readonly string[]).includes(p.kind) && p.packCount != null && p.packCount > 0;
}
