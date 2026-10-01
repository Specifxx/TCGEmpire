import { PrismaClient } from ".prisma/pokemon-client";
import { POKEMON_VARS, resolveUrl } from "../db-chains";

// The Pokémon section's database client — a SEPARATE Neon project
// (POKEMON_DATABASE_URL, lib/db-chains.ts POKEMON_VARS) with its own schema
// (prisma/pokemon/schema.prisma) and its own generated client. Nothing in here
// can reach the Riftbound databases, and nothing in the Riftbound code imports
// this file (tests/pokemon-isolation.test.ts).
//
// The egress rules at the top of lib/db.ts apply here exactly as written: this
// project has its own 5 GB/month transfer allowance, and the only per-request
// reads are lib/pokemon/data.ts's two self-cached loaders.

const POKEMON_URL = resolveUrl(POKEMON_VARS);

// The on/off questions live in ./gate (no client import); re-exported here for
// callers that already hold the client.
export { pokemonDbConfigured, pokemonEnabled } from "./gate";

// Same cold-start allowance lib/db.ts gives the operational project: Neon's
// suspended compute can take a moment to resume.
function withConnectTimeout(url: string | undefined, seconds: number): string | undefined {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (!u.searchParams.has("connect_timeout")) u.searchParams.set("connect_timeout", String(seconds));
    return u.toString();
  } catch {
    return url;
  }
}

const globalForPokemon = globalThis as unknown as { pokemonPrisma?: PrismaClient };

/**
 * Lazily constructed, so importing this module never opens a connection or
 * throws when the database is not configured (CI builds, the section off).
 */
export function pokemonDb(): PrismaClient {
  if (!POKEMON_URL) throw new Error("POKEMON_DATABASE_URL is not set — the Pokémon section is off.");
  if (!globalForPokemon.pokemonPrisma) {
    globalForPokemon.pokemonPrisma = new PrismaClient({
      datasourceUrl: withConnectTimeout(POKEMON_URL, 15),
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });
  }
  return globalForPokemon.pokemonPrisma;
}
