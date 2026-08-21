import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { cookies } from "next/headers";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizeSearch } from "@/lib/format";
import { cardTileSelect } from "@/lib/cards";
import { getSealedGroups } from "@/lib/sealed-import";
import { getCountry } from "@/lib/get-country";
import { priceField } from "@/lib/country";
import { getCurrentUser } from "@/lib/auth";
import { isPremium } from "@/lib/premium";
import { ANON_SEARCH_LIMIT, FREE_SEARCH_LIMIT, SEARCH_QUOTA_COOKIE } from "@/lib/search-limits";
import { tickQuota } from "@/lib/search-quota";

// Typeahead search for the navbar dropdown. Returns full tile data so a result can
// open the same instant quick-view modal as the browse grid, plus any matching
// sealed products (booster boxes/packs/etc.).
//
// Metered per UTC day: anonymous visitors get ANON_SEARCH_LIMIT searches, free
// accounts FREE_SEARCH_LIMIT, Premium unlimited — the first concrete,
// experiential difference between the tiers, and the thing the signup surfaces
// advertise. Enforcement is an httpOnly counter cookie; the definition of one
// "search" and the deliberate non-metering of /browse?q= are documented in
// lib/search-limits.ts.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ results: [], sealed: [] });

  const user = await getCurrentUser();
  let quota: ReturnType<typeof tickQuota> | null = null;
  if (!isPremium(user)) {
    const limit = user ? FREE_SEARCH_LIMIT : ANON_SEARCH_LIMIT;
    quota = tickQuota(cookies().get(SEARCH_QUOTA_COOKIE)?.value, limit, Date.now());
    if (quota.blocked) {
      // No DB work for a blocked request — the gate response carries what the
      // dropdown needs to render the upsell instead of results.
      const res = NextResponse.json({
        results: [],
        sealed: [],
        limited: true,
        signedIn: !!user,
        limit,
        remaining: 0,
      });
      res.cookies.set(SEARCH_QUOTA_COOKIE, quota.cookieValue, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 86400 });
      return res;
    }
  }

  const country = getCountry();
  const nq = normalizeSearch(q);
  const [cards, sealedAll] = await Promise.all([
    prisma.card.findMany({
      where: {
        OR: [
          { nameNormalized: { contains: nq } },
          { collectorNumber: { contains: q } },
        ],
      },
      // Overfetch, then re-rank below: NAME-PREFIX matches first, then priced.
      // Priced-first alone buried unpriced new reveals (every pre-release Jayce
      // lost its dropdown slot to priced older Jayces) — "not in the database".
      orderBy: [
        { [priceField(country)]: { sort: "desc", nulls: "last" } } as Prisma.CardOrderByWithRelationInput,
        { name: "asc" },
      ],
      take: 24,
      // nameNormalized feeds the prefix re-rank below (not part of the tile select).
      select: { ...cardTileSelect(country), nameNormalized: true },
    }),
    // Sealed groups load + group the whole sealed table — far too heavy to redo on
    // every keystroke. Cache per market; sealed prices only change on the import.
    unstable_cache(() => getSealedGroups(country), ["sealed-groups", country], { revalidate: 600 })(),
  ]);

  // Prefix matches beat substring matches regardless of price; within each group
  // the DB's priced-first order is preserved. Cap to the dropdown size after.
  const ranked = [...cards].sort((a, b) => {
    const ap = (a as { nameNormalized?: string }).nameNormalized?.startsWith(nq) ? 0 : 1;
    const bp = (b as { nameNormalized?: string }).nameNormalized?.startsWith(nq) ? 0 : 1;
    return ap - bp;
  }).slice(0, 10);

  const ql = q.toLowerCase();
  const sealed = sealedAll
    .filter(
      (g) =>
        g.name.toLowerCase().includes(ql) ||
        g.productType.toLowerCase().includes(ql) ||
        (g.setCode ?? "").toLowerCase().includes(ql)
    )
    .slice(0, 4)
    .map((g) => ({
      groupKey: g.groupKey,
      name: g.name,
      productType: g.productType,
      setCode: g.setCode,
      imageUrl: g.imageUrl,
      lowestPriceCents: g.lowestPriceCents,
    }));

  // `remaining`/`signedIn` let the dropdown show a "3 searches left today"
  // nudge as the meter runs down (null quota = Premium, nothing to show).
  const res = NextResponse.json({
    results: ranked,
    sealed,
    ...(quota ? { remaining: quota.remaining, signedIn: !!user } : {}),
  });
  if (quota) {
    res.cookies.set(SEARCH_QUOTA_COOKIE, quota.cookieValue, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 86400 });
  }
  return res;
}
