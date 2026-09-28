import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { SITE_URL } from "@/lib/site";
import { getCachedRisingCards, getRisingWeekAgo, type RisePick, type RiseScope } from "@/lib/rise-predictor";
import { generateRisingTitle, toSnapshotData, type SnapshotEbayDeal } from "@/lib/rising-snapshot";
import { getCheapestOnEbayFor } from "@/lib/arbitrage";
import { COUNTRIES, currencyOf, type Country } from "@/lib/country";

export const dynamic = "force-dynamic";

// Mints a public, frozen copy of the Rising Cards screener — see the doc comment
// on model RisingSnapshot in prisma/schema.prisma for why a snapshot rather than
// a public live page.
//
// DUAL GATE (logged-in admin OR ?key=ADMIN_TOKEN), matching every /admin PAGE
// and the store-partners route this is modelled on. The mismatch that shape
// exists to avoid: a form on a page reached by ADMIN_TOKEN 403ing against its
// own API.
const scopeSchema = z.union([z.literal("GLOBAL"), z.enum(Object.keys(COUNTRIES) as [string, ...string[]])]);

const schema = z.object({
  scope: scopeSchema.default("GLOBAL"),
  key: z.string().optional(),
});

function authed(user: { isAdmin: boolean } | null, suppliedKey: string | undefined) {
  const token = process.env.ADMIN_TOKEN;
  return (!!token && suppliedKey === token) || !!user?.isAdmin;
}

/**
 * Each pick's Cheapest on eBay verdict, frozen into the snapshot (2026-09-28).
 * Checked in the pick's own basis market — the scope, or for GLOBAL the market
 * whose price the row shows — so the eBay price sits beside a price in the same
 * currency. One lookup per market present, each over the day-cached inputs the
 * homepage's Cheapest on eBay row reads (getCheapestOnEbayFor is self-cached:
 * called directly, never wrapped). It never throws; a market it can't check
 * freezes as "not cheapest on eBay".
 */
async function cheapestOnEbayByPick(picks: readonly RisePick[]): Promise<Map<string, SnapshotEbayDeal>> {
  const byMarket = new Map<Country, string[]>();
  for (const p of picks) byMarket.set(p.basisMarket, [...(byMarket.get(p.basisMarket) ?? []), p.id]);
  const out = new Map<string, SnapshotEbayDeal>();
  await Promise.all(
    [...byMarket].map(async ([market, ids]) => {
      for (const [id, r] of await getCheapestOnEbayFor(market, ids)) {
        out.set(id, {
          url: r.url,
          retailer: r.ebayKey,
          market,
          cents: r.ebayCents,
          currency: currencyOf(market),
          postageKnown: r.postageKnown,
          gapCents: r.gapCents,
        });
      }
    }),
  );
  return out;
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!authed(user, new URL(req.url).searchParams.get("key") ?? undefined)) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  // Newest first, capped — this is a management list, not an archive browser.
  const rows = await prisma.risingSnapshot.findMany({
    orderBy: { createdAt: "desc" },
    take: 25,
    select: { id: true, token: true, scope: true, title: true, createdAt: true },
  });
  return NextResponse.json({
    snapshots: rows.map((r) => ({ ...r, url: `${SITE_URL}/rising/${r.token}` })),
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const user = await getCurrentUser();
  if (!authed(user, body?.key)) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) return NextResponse.json({ error: "invalid scope" }, { status: 400 });
  const scope = parsed.data.scope as RiseScope;

  // The SAME cached analysis /tools/rising and the admin page read — minting a
  // snapshot must never trigger a second copy of the 400-card × price-history
  // scan under its own cache key (see the egress rules at the top of lib/db.ts,
  // and the nested-cache rule: getCachedRisingCards caches itself, so it is
  // called directly and never wrapped).
  const analysis = await getCachedRisingCards(scope);

  // A FAILED LOAD IS NEVER MINTED (2026-09-25). getCachedRisingCards returns an
  // empty analysis flagged `failed` when a loader threw; frozen, that would be a
  // permanent public page saying nothing ranked "before enough had built up" —
  // a database blip published as a fact about the market. Refuse, and say why;
  // the failure is not cached, so a retry in a few minutes can succeed.
  if (analysis.failed) {
    return NextResponse.json(
      { error: "Rising Cards failed to load, so nothing was minted. Try again in a few minutes." },
      { status: 409 },
    );
  }

  const now = new Date();
  // The same ranking a week ago, for the Billboard-style movement frozen into
  // this one (lib/rising-movement.ts). NEVER a reason not to mint:
  // getRisingWeekAgo returns null when it can't be rebuilt, and the snapshot is
  // minted without movement. It depends on no earlier snapshot.
  const [weekAgo, ebay] = await Promise.all([getRisingWeekAgo(scope), cheapestOnEbayByPick(analysis.picks)]);
  const data = toSnapshotData(analysis, scope, now, weekAgo, ebay);

  // An empty run is still mintable, deliberately. A market with no searched,
  // priced cards legitimately has nothing to rank, and a link that says so
  // honestly is more useful than a 400 that leaves the admin guessing whether
  // the feature broke. generateRisingTitle has a branch for exactly this.
  const snapshot = await prisma.risingSnapshot.create({
    data: {
      token: randomBytes(24).toString("base64url"),
      scope,
      title: generateRisingTitle(data, now),
      data: data as unknown as object,
    },
  });

  return NextResponse.json({
    ok: true,
    title: snapshot.title,
    url: `${SITE_URL}/rising/${snapshot.token}`,
    picks: data.picks.length,
    comparedWith: weekAgo ? { asOf: weekAgo.asOf } : null,
    cheapestOnEbay: ebay.size,
  });
}

// DELETE (owner, 2026-09-28: "have an option to delete snapshots too"). Same
// dual gate. The link stops working at once for everyone holding it —
// /rising/[token] is force-dynamic and 404s a missing token, and its share
// image falls back to the brand-only one — and the admin panel confirms before
// calling this, because there is no undo. Nothing else reads a snapshot:
// movement compares with the ranking a week ago, not with minted charts.
const deleteSchema = z.object({ id: z.string().min(1), key: z.string().optional() });

export async function DELETE(req: Request) {
  const body = await req.json().catch(() => null);
  const user = await getCurrentUser();
  if (!authed(user, body?.key)) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const parsed = deleteSchema.safeParse(body ?? {});
  if (!parsed.success) return NextResponse.json({ error: "missing snapshot id" }, { status: 400 });

  const { count } = await prisma.risingSnapshot.deleteMany({ where: { id: parsed.data.id } });
  if (count === 0) return NextResponse.json({ error: "No such snapshot" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
