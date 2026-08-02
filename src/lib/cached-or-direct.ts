import { unstable_cache } from "next/cache";

// unstable_cache requires Next.js's request-scoped incremental cache, which
// doesn't exist when a module is imported by a plain tsx script (e.g.
// scripts/weekly-promo.ts) run outside the Next.js runtime — it throws
// "Invariant: incrementalCache missing" rather than caching. There, caching
// buys nothing anyway (a one-shot process never reuses it), so fall back to
// calling the function directly instead of failing the whole script. Any OTHER
// unstable_cache error still throws as normal.
//
// Lives in its own module because more than one lib needs it (price-history,
// screener) and importing it from either would drag that module's Prisma
// clients into contexts that don't want them.
export async function cachedOrDirect<T>(
  fn: () => Promise<T>,
  keys: string[],
  opts: { revalidate: number; tags: string[] },
): Promise<T> {
  try {
    return await unstable_cache(fn, keys, opts)();
  } catch (e) {
    if (e instanceof Error && e.message.includes("incrementalCache missing")) return fn();
    throw e;
  }
}
